import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  createSupabaseServerClient,
  AVATAR_BUCKET,
  getPublicUrl,
} from '@/lib/supabase/server';

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types for avatars
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

/**
 * Validates the uploaded file.
 */
function validateFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
}

/**
 * Gets the authenticated user ID from the session.
 */
async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/**
 * POST /api/uploads/avatar
 *
 * Upload an avatar image to Supabase Storage.
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - Body: file (the image file)
 * - Headers: x-dev-user-email (development auth placeholder)
 *
 * Response:
 * - 200: { url: string } - The public URL of the uploaded avatar
 * - 400: { error: string } - Missing or invalid file
 * - 401: { error: string } - Unauthorized
 * - 500: { error: string } - Upload failed
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please provide authentication.' },
        { status: 401 }
      );
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request. Expected multipart/form-data.' },
        { status: 400 }
      );
    }

    // Get the file from the form data
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        {
          error: 'Missing file. Please provide a file with field name "file".',
        },
        { status: 400 }
      );
    }

    // Validate the file
    const validation = validateFile(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Create a unique file path: avatars/{userId}/{timestamp}-{originalFilename}
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${userId}/${timestamp}-${sanitizedFilename}`;

    // Initialize Supabase client
    const supabase = createSupabaseServerClient();

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true, // Overwrite if exists
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get the public URL
    // Note: This requires the bucket to be configured as public in Supabase
    const publicUrl = getPublicUrl(AVATAR_BUCKET, filePath);

    return NextResponse.json({ url: publicUrl }, { status: 200 });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
