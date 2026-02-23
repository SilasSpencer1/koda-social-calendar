import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter, AdapterUser } from 'next-auth/adapters';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { prisma } from '@/lib/db/prisma';
import { verifyPassword } from './password';

// NextAuth expects a field named `image` on the User model, but this schema
// uses `avatarUrl`. Wrap the adapter to translate between the two.
function toAdapterUser(user: Record<string, unknown>): AdapterUser {
  return {
    ...user,
    image: (user.avatarUrl as string) ?? null,
  } as unknown as AdapterUser;
}

const rawAdapter = PrismaAdapter(prisma);

const adapter: Adapter = {
  ...rawAdapter,
  async createUser(data) {
    // NextAuth sends `image` and `emailVerified` which don't exist in this schema.
    // Map `image` → `avatarUrl` and drop `emailVerified`.
    const { image, emailVerified, id, ...rest } = data as unknown as Record<
      string,
      unknown
    >;
    const user = await prisma.user.create({
      data: {
        ...(rest as { name: string; email: string }),
        avatarUrl: (image as string) ?? null,
      },
    });
    return toAdapterUser(user as Record<string, unknown>);
  },
  async updateUser(data) {
    const { image, emailVerified, id, ...rest } = data as unknown as Record<
      string,
      unknown
    >;
    const user = await prisma.user.update({
      where: { id: id as string },
      data: {
        ...(rest as Record<string, unknown>),
        ...(image !== undefined ? { avatarUrl: image as string } : {}),
      },
    });
    return toAdapterUser(user as Record<string, unknown>);
  },
  async getUser(id) {
    const user = await rawAdapter.getUser!(id);
    return user
      ? toAdapterUser(user as unknown as Record<string, unknown>)
      : null;
  },
  async getUserByEmail(email) {
    const user = await rawAdapter.getUserByEmail!(email);
    return user
      ? toAdapterUser(user as unknown as Record<string, unknown>)
      : null;
  },
  async getUserByAccount(providerAccountId) {
    const user = await rawAdapter.getUserByAccount!(providerAccountId);
    return user
      ? toAdapterUser(user as unknown as Record<string, unknown>)
      : null;
  },
};

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter,
  trustHost: true,
  // Use JWT sessions - required for Credentials provider
  // Note: Credentials provider does NOT support database sessions
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope:
            'openid email profile https://www.googleapis.com/auth/calendar',
          access_type: 'offline',
          prompt: 'consent select_account',
        },
      },
    }),
    Credentials({
      credentials: {
        identifier: { label: 'Email or Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // Accept "identifier" (new) field
        const identifier = (credentials?.identifier as string) || '';
        const password = credentials?.password as string;

        if (!identifier || !password) {
          throw new Error('Email/username and password are required');
        }

        // Look up by email or username
        const isEmail = identifier.includes('@');
        const user = isEmail
          ? await prisma.user.findUnique({
              where: { email: identifier },
            })
          : await prisma.user.findUnique({
              where: { username: identifier },
            });

        if (!user || !user.passwordHash) {
          throw new Error('Invalid credentials');
        }

        const isPasswordValid = await verifyPassword(
          credentials.password as string,
          user.passwordHash
        );

        if (!isPasswordValid) {
          throw new Error('Invalid credentials');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Handle callback redirects for integrations
      if (url.includes('/integrations')) {
        return url;
      }
      // Default to /app after auth
      if (url === baseUrl) {
        return `${baseUrl}/app`;
      }
      return url.startsWith(baseUrl) ? url : baseUrl;
    },
    // JWT callback - add user id to the token
    async jwt({ token, user }) {
      // On initial sign in, user object is available
      if (user) {
        token.id = user.id;
        token.sub = user.id; // Also set sub for consistency
      }
      return token;
    },
    // Session callback - add user id from token to session
    async session({ session, token }) {
      if (session.user) {
        // Use token.id or token.sub as fallback
        session.user.id = (token?.id as string) || (token?.sub as string);
      }
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user?.email) {
        // Google Account row is already created by the adapter
      }
    },
  },
});
