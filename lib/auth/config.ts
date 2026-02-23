import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { prisma } from '@/lib/db/prisma';
import { verifyPassword } from './password';

const adapter = PrismaAdapter(prisma);

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
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.passwordHash) {
          throw new Error('Invalid email or password');
        }

        const isPasswordValid = await verifyPassword(
          credentials.password as string,
          user.passwordHash
        );

        if (!isPasswordValid) {
          throw new Error('Invalid email or password');
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
