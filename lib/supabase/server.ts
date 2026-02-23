import { createClient } from '@supabase/supabase-js';

// Supabase Storage bucket name for avatars
export const AVATAR_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'avatars';

/**
 * Creates a Supabase client with the service role key for server-side operations.
 * IMPORTANT: This should only be used in server-side code (API routes, server components).
 * Never expose the service role key to the client.
 */
export function createSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Gets the public URL for a file in Supabase Storage.
 * Note: This requires the bucket to be set as public.
 */
export function getPublicUrl(bucket: string, path: string): string {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL environment variable');
  }
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
