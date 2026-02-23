import { handlers } from '@/lib/auth/config';

// Force Node.js runtime for NextAuth (uses crypto)
export const runtime = 'nodejs';

export const { GET, POST } = handlers;
