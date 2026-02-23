import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { validateFriendRequestCreation } from '@/lib/policies/friendship';
import { checkRateLimit, setRateLimitHeaders } from '@/lib/rate-limit';
import { z } from 'zod';

// Friend request rate limit: 10 requests per minute per user
const FRIEND_REQUEST_RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60 * 1000,
  keyPrefix: 'friend-request',
};

const friendRequestSchema = z.object({
  targetUserId: z.string().min(1, 'Target user ID is required'),
});

export async function POST(req: NextRequest) {
  let rateLimitResult: {
    success: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
  } | null = null;

  try {
    // Authenticate
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit per user (not IP) to prevent bypass via VPN/proxy changes
    rateLimitResult = await checkRateLimit(
      session.user.id,
      FRIEND_REQUEST_RATE_LIMIT
    );

    if (!rateLimitResult.success) {
      const response = NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
      return setRateLimitHeaders(response, rateLimitResult);
    }

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      const response = NextResponse.json(
        { error: 'Invalid JSON' },
        { status: 400 }
      );
      return setRateLimitHeaders(response, rateLimitResult);
    }

    const result = friendRequestSchema.safeParse(body);
    if (!result.success) {
      const response = NextResponse.json(
        { error: 'Invalid request body', details: result.error.flatten() },
        { status: 400 }
      );
      return setRateLimitHeaders(response, rateLimitResult);
    }

    const { targetUserId } = result.data;

    // Validate friend request (includes blocked, already friends, self-request checks)
    const validationError = await validateFriendRequestCreation(
      session.user.id,
      targetUserId
    );
    if (validationError) {
      const response = NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
      return setRateLimitHeaders(response, rateLimitResult);
    }

    // Create friend request
    try {
      const friendship = await prisma.friendship.create({
        data: {
          requesterId: session.user.id,
          addresseeId: targetUserId,
          status: 'PENDING',
        },
        include: {
          requester: {
            select: { id: true, name: true, username: true, avatarUrl: true },
          },
          addressee: {
            select: { id: true, name: true, username: true, avatarUrl: true },
          },
        },
      });

      const response = NextResponse.json(
        {
          id: friendship.id,
          requester: friendship.requester,
          addressee: friendship.addressee,
          status: friendship.status,
          createdAt: friendship.createdAt,
        },
        { status: 201 }
      );

      return setRateLimitHeaders(response, rateLimitResult);
    } catch (createError) {
      // Handle Prisma unique constraint violation (concurrent requests)
      if ((createError as { code?: string })?.code === 'P2002') {
        const response = NextResponse.json(
          { error: 'Friend request already exists' },
          { status: 409 }
        );
        return setRateLimitHeaders(response, rateLimitResult);
      }
      throw createError;
    }
  } catch (error) {
    console.error('Error creating friend request:', error);
    const response = NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
    // Include rate limit headers on error responses for consistency
    return rateLimitResult
      ? setRateLimitHeaders(response, rateLimitResult)
      : response;
  }
}
