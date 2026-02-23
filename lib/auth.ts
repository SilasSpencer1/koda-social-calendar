import { auth } from '@/lib/auth/config';
import type { Session } from 'next-auth';

export async function getSession(): Promise<Session | null> {
  return await auth();
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user;
}

export { signOut } from '@/lib/auth/config';
