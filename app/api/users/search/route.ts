import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import {
  canSearchSeeUser,
  sanitizeUserForSearch,
  getRelationshipStatus,
} from '@/lib/policies/friendship';
import { checkRateLimit, setRateLimitHeaders } from '@/lib/rate-limit';

// Search rate limit: 30 requests per minute per client
const SEARCH_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60 * 1000,
  keyPrefix: 'search',
};

export async function GET(req: NextRequest) {
  try {
    // Authenticate
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUserId = session.user.id;

    // Rate limit per user (not IP) to prevent bypass via VPN/proxy changes
    const rateLimitResult = await checkRateLimit(
      currentUserId,
      SEARCH_RATE_LIMIT
    );

    if (!rateLimitResult.success) {
      const response = NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
      return setRateLimitHeaders(response, rateLimitResult);
    }

    // Get search query
    const url = new URL(req.url);
    const query = url.searchParams.get('q')?.trim();

    if (!query || query.length < 1) {
      const response = NextResponse.json(
        { error: 'Search query required (min 1 character)' },
        { status: 400 }
      );
      return setRateLimitHeaders(response, rateLimitResult);
    }

    if (query.length > 100) {
      const response = NextResponse.json(
        { error: 'Search query too long (max 100 characters)' },
        { status: 400 }
      );
      return setRateLimitHeaders(response, rateLimitResult);
    }

    // Search users by username or email
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        settings: {
          select: { accountVisibility: true },
        },
      },
      take: 20, // Limit results
    });

    // Filter based on privacy rules and get relationship status
    const results = await Promise.all(
      users.map(async (user) => {
        // Skip self
        if (user.id === currentUserId) {
          return null;
        }

        // Check visibility
        const canSee = await canSearchSeeUser(
          currentUserId,
          user.id,
          user.settings?.accountVisibility || 'FRIENDS_ONLY'
        );

        if (!canSee) {
          return null;
        }

        // Get relationship status
        const relationshipStatus = await getRelationshipStatus(
          currentUserId,
          user.id
        );

        return {
          ...sanitizeUserForSearch(user),
          relationshipStatus,
        };
      })
    );

    // Filter out null results
    const filtered = results.filter((r) => r !== null);

    const response = NextResponse.json({
      results: filtered,
      total: filtered.length,
      query,
    });

    return setRateLimitHeaders(response, rateLimitResult);
  } catch (error) {
    console.error('Error in user search:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
