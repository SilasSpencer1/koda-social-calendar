import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit } from '@/lib/rate-limit';

const ACTION_RATE_LIMIT = {
  maxRequests: 100,
  windowMs: 60 * 60 * 1000, // 1 hour
  keyPrefix: 'suggestion-action',
};

/**
 * POST /api/suggestions/:id/save
 * Mark a suggestion as SAVED.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimit(session.user.id, ACTION_RATE_LIMIT);
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const suggestion = await prisma.suggestion.findUnique({ where: { id } });
    if (!suggestion || suggestion.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    const updated = await prisma.suggestion.update({
      where: { id },
      data: { status: 'SAVED' },
    });

    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (error) {
    console.error('[POST /api/suggestions/:id/save]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
