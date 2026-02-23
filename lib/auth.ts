import { auth } from '@/lib/auth/config';
import type { Session } from 'next-auth';

export async function getSession(): Promise<Session | null> {
  try {
    // Use auth() which handles JWT sessions
    const session = await auth();

    // If we got a Response object, handle it
    if (session instanceof Response) {
      return null;
    }

    if (session?.user?.id) {
      return session;
    }

    return null;
  } catch (error) {
    console.error('[getSession] Error:', error);
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user;
}

export { signOut } from '@/lib/auth/config';
