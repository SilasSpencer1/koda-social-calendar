/**
 * Friendship authorization and privacy policy helpers
 */

import { prisma } from '@/lib/db/prisma';
import type { FriendshipStatus, AccountVisibility, User } from '@prisma/client';

/**
 * Check if there is any block relationship between two users (bidirectional)
 */
export async function isBlocked(
  userId: string,
  targetUserId: string
): Promise<boolean> {
  const blocked = await prisma.friendship.findFirst({
    where: {
      OR: [
        {
          requesterId: userId,
          addresseeId: targetUserId,
          status: 'BLOCKED',
        },
        {
          requesterId: targetUserId,
          addresseeId: userId,
          status: 'BLOCKED',
        },
      ],
    },
  });

  return !!blocked;
}

/**
 * Get the friendship status from userId to targetUserId (directional)
 * Returns null if no relationship exists
 */
export async function getFriendshipStatus(
  userId: string,
  targetUserId: string
): Promise<FriendshipStatus | null> {
  const friendship = await prisma.friendship.findUnique({
    where: {
      requesterId_addresseeId: {
        requesterId: userId,
        addresseeId: targetUserId,
      },
    },
  });

  return friendship?.status ?? null;
}

/**
 * Check if two users are accepted friends (bidirectional check)
 */
export async function areFriends(
  userId: string,
  targetUserId: string
): Promise<boolean> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        {
          requesterId: userId,
          addresseeId: targetUserId,
          status: 'ACCEPTED',
        },
        {
          requesterId: targetUserId,
          addresseeId: userId,
          status: 'ACCEPTED',
        },
      ],
    },
  });

  return !!friendship;
}

/**
 * Determine if a user should be visible in search results based on privacy rules
 *
 * Visibility rules:
 * - PRIVATE: Only show if requester is already an accepted friend
 * - FRIENDS_ONLY: Show minimal info if accepted friend, otherwise hide
 * - PUBLIC: Always show
 *
 * Additionally:
 * - If blocked, never show
 * - If blocker blocked blockee, never show
 */
export async function canSearchSeeUser(
  searcherId: string,
  targetUserId: string,
  targetVisibility: AccountVisibility
): Promise<boolean> {
  // Never show if blocked
  const blocked = await isBlocked(searcherId, targetUserId);
  if (blocked) {
    return false;
  }

  // PUBLIC users always visible (unless blocked)
  if (targetVisibility === 'PUBLIC') {
    return true;
  }

  // For PRIVATE and FRIENDS_ONLY, only show to accepted friends
  const isFriend = await areFriends(searcherId, targetUserId);
  return isFriend;
}

/**
 * Get sanitized user data for search results based on privacy rules
 * Omits email, password hash, and applies visibility constraints
 */
export function sanitizeUserForSearch(user: User): {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
} {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * Validate friend request creation
 * Returns error string if invalid, null if valid
 */
export async function validateFriendRequestCreation(
  requesterId: string,
  addresseeId: string
): Promise<string | null> {
  // Cannot send request to self
  if (requesterId === addresseeId) {
    return 'Cannot send friend request to yourself';
  }

  // Check if users exist
  const [requester, addressee] = await Promise.all([
    prisma.user.findUnique({
      where: { id: requesterId },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: addresseeId },
      select: { id: true },
    }),
  ]);

  if (!requester || !addressee) {
    return 'User not found';
  }

  // Check if already friends
  const isFriend = await areFriends(requesterId, addresseeId);
  if (isFriend) {
    return 'Already friends with this user';
  }

  // Check if blocked
  const blocked = await isBlocked(requesterId, addresseeId);
  if (blocked) {
    return 'Cannot send request to blocked user';
  }

  // Check if request already pending (in either direction)
  const existingRequest = await prisma.friendship.findFirst({
    where: {
      OR: [
        {
          requesterId,
          addresseeId,
          status: 'PENDING',
        },
        {
          requesterId: addresseeId,
          addresseeId: requesterId,
          status: 'PENDING',
        },
      ],
    },
  });

  if (existingRequest) {
    return 'Friend request already pending';
  }

  return null;
}

/**
 * Get relationship status string for search/display
 * From the perspective of the requester
 */
export async function getRelationshipStatus(
  userId: string,
  targetUserId: string
): Promise<'none' | 'pending_incoming' | 'pending_outgoing' | 'friends'> {
  // Check if blocked
  const blocked = await isBlocked(userId, targetUserId);
  if (blocked) {
    return 'none'; // Hide relationship status if blocked
  }

  // Check both directions for accepted friendship first (takes priority)
  const outgoing = await prisma.friendship.findUnique({
    where: {
      requesterId_addresseeId: {
        requesterId: userId,
        addresseeId: targetUserId,
      },
    },
    select: { status: true },
  });

  if (outgoing?.status === 'ACCEPTED') {
    return 'friends';
  }

  // Check incoming accepted (bidirectional acceptance)
  const incoming = await prisma.friendship.findUnique({
    where: {
      requesterId_addresseeId: {
        requesterId: targetUserId,
        addresseeId: userId,
      },
    },
    select: { status: true },
  });

  if (incoming?.status === 'ACCEPTED') {
    return 'friends';
  }

  // Now check pending states only if not accepted
  if (outgoing?.status === 'PENDING') {
    return 'pending_outgoing';
  }

  if (incoming?.status === 'PENDING') {
    return 'pending_incoming';
  }

  return 'none';
}
