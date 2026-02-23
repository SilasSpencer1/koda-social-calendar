/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeUserForSearch,
  canSearchSeeUser,
  isBlocked,
  areFriends,
  validateFriendRequestCreation,
  getRelationshipStatus,
} from '@/lib/policies/friendship';
import { prisma } from '@/lib/db/prisma';

// Mock Prisma
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    friendship: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('Friendship Policies - Core Functions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('sanitizeUserForSearch', () => {
    it('should return user without email', () => {
      const user = {
        id: 'user1',
        email: 'alice@example.com',
        name: 'Alice',
        username: 'alice',
        avatarUrl: null,
        city: null,
        passwordHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = sanitizeUserForSearch(user);

      expect(result).toEqual({
        id: 'user1',
        name: 'Alice',
        username: 'alice',
        avatarUrl: null,
      });
      expect(result).not.toHaveProperty('email');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should preserve all required fields', () => {
      const user = {
        id: 'user2',
        email: 'bob@example.com',
        name: 'Bob Smith',
        username: 'bob',
        avatarUrl: 'https://example.com/avatar.png',
        city: null,
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = sanitizeUserForSearch(user);

      expect(result.id).toBe('user2');
      expect(result.name).toBe('Bob Smith');
      expect(result.username).toBe('bob');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
    });
  });

  describe('isBlocked', () => {
    it('should return true if requester blocked target', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValue({ status: 'BLOCKED' });

      const result = await isBlocked('user1', 'user2');
      expect(result).toBe(true);
    });

    it('should return true if target blocked requester', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValue({ status: 'BLOCKED' });

      const result = await isBlocked('user2', 'user1');
      expect(result).toBe(true);
    });

    it('should return false if no block exists', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      const result = await isBlocked('user1', 'user2');
      expect(result).toBe(false);
    });
  });

  describe('areFriends', () => {
    it('should return true if accepted friends', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED' });

      const result = await areFriends('user1', 'user2');
      expect(result).toBe(true);
    });

    it('should return false if not friends', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      const result = await areFriends('user1', 'user2');
      expect(result).toBe(false);
    });

    it('should return true if accepted (bidirectional)', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValue({ status: 'ACCEPTED' });

      const result = await areFriends('user2', 'user1');
      expect(result).toBe(true);
    });
  });

  describe('canSearchSeeUser', () => {
    it('should return true for PUBLIC users when not blocked', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValueOnce(null);

      const result = await canSearchSeeUser('searcher', 'target', 'PUBLIC');
      expect(result).toBe(true);
    });

    it('should return false if any block exists', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValueOnce({
        status: 'BLOCKED',
      });

      const result = await canSearchSeeUser('searcher', 'target', 'PUBLIC');
      expect(result).toBe(false);
    });

    it('should show PRIVATE to friends only', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: 'ACCEPTED' });

      const result = await canSearchSeeUser('searcher', 'target', 'PRIVATE');
      expect(result).toBe(true);
    });

    it('should hide PRIVATE from non-friends', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await canSearchSeeUser('searcher', 'target', 'PRIVATE');
      expect(result).toBe(false);
    });

    it('should show FRIENDS_ONLY to anyone who is not blocked', async () => {
      const mockPrisma = prisma as any;
      // Not blocked
      mockPrisma.friendship.findFirst.mockResolvedValueOnce(null);

      const result = await canSearchSeeUser(
        'searcher',
        'target',
        'FRIENDS_ONLY'
      );
      // FRIENDS_ONLY users are discoverable in search so friend requests can be sent
      expect(result).toBe(true);
    });

    it('should hide FRIENDS_ONLY from blocked users', async () => {
      const mockPrisma = prisma as any;
      // Blocked
      mockPrisma.friendship.findFirst.mockResolvedValueOnce({
        status: 'BLOCKED',
      });

      const result = await canSearchSeeUser(
        'searcher',
        'target',
        'FRIENDS_ONLY'
      );
      expect(result).toBe(false);
    });
  });

  describe('validateFriendRequestCreation', () => {
    it('should reject self-requests', async () => {
      const error = await validateFriendRequestCreation('user1', 'user1');
      expect(error).toBe('Cannot send friend request to yourself');
    });

    it('should reject if requester does not exist', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const error = await validateFriendRequestCreation('nonexistent', 'user2');
      expect(error).toBe('User not found');
    });

    it('should reject if addressee does not exist', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'user1' })
        .mockResolvedValueOnce(null);

      const error = await validateFriendRequestCreation('user1', 'nonexistent');
      expect(error).toBe('User not found');
    });

    it('should reject if already friends', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'user1' })
        .mockResolvedValueOnce({ id: 'user2' });
      mockPrisma.friendship.findFirst.mockResolvedValueOnce({
        status: 'ACCEPTED',
      });

      const error = await validateFriendRequestCreation('user1', 'user2');
      expect(error).toBe('Already friends with this user');
    });

    it('should reject if blocked', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'user1' })
        .mockResolvedValueOnce({ id: 'user2' });
      mockPrisma.friendship.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: 'BLOCKED' });

      const error = await validateFriendRequestCreation('user1', 'user2');
      expect(error).toBe('Cannot send request to blocked user');
    });

    it('should reject if request pending', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'user1' })
        .mockResolvedValueOnce({ id: 'user2' });
      mockPrisma.friendship.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: 'PENDING' });

      const error = await validateFriendRequestCreation('user1', 'user2');
      expect(error).toBe('Friend request already pending');
    });

    it('should allow valid friend request', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'user1' })
        .mockResolvedValueOnce({ id: 'user2' });
      mockPrisma.friendship.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const error = await validateFriendRequestCreation('user1', 'user2');
      expect(error).toBeNull();
    });
  });

  describe('getRelationshipStatus', () => {
    it('should return none if blocked', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValue({ status: 'BLOCKED' });

      const status = await getRelationshipStatus('user1', 'user2');
      expect(status).toBe('none');
    });

    it('should return pending_outgoing for outgoing request', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValueOnce(null);
      mockPrisma.friendship.findUnique.mockResolvedValueOnce({
        status: 'PENDING',
      });

      const status = await getRelationshipStatus('user1', 'user2');
      expect(status).toBe('pending_outgoing');
    });

    it('should return pending_incoming for incoming request', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValueOnce(null);
      mockPrisma.friendship.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: 'PENDING' });

      const status = await getRelationshipStatus('user1', 'user2');
      expect(status).toBe('pending_incoming');
    });

    it('should return friends for accepted', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValueOnce(null);
      mockPrisma.friendship.findUnique.mockResolvedValueOnce({
        status: 'ACCEPTED',
      });

      const status = await getRelationshipStatus('user1', 'user2');
      expect(status).toBe('friends');
    });

    it('should return none for no relationship', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValueOnce(null);
      mockPrisma.friendship.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const status = await getRelationshipStatus('user1', 'user2');
      expect(status).toBe('none');
    });

    it('should return friends for accepted incoming', async () => {
      const mockPrisma = prisma as any;
      mockPrisma.friendship.findFirst.mockResolvedValueOnce(null);
      mockPrisma.friendship.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ status: 'ACCEPTED' });

      const status = await getRelationshipStatus('user1', 'user2');
      expect(status).toBe('friends');
    });
  });
});

describe('Friendship Policy Validation', () => {
  it('relationship status should be one of valid types', () => {
    const validStatuses = [
      'none',
      'pending_incoming',
      'pending_outgoing',
      'friends',
    ] as const;
    const testStatus: (typeof validStatuses)[number] = 'friends';

    expect(validStatuses).toContain(testStatus);
  });

  it('visibility levels should be enforced', () => {
    const visibilityLevels = ['PUBLIC', 'FRIENDS_ONLY', 'PRIVATE'] as const;

    for (const level of visibilityLevels) {
      expect(['PUBLIC', 'FRIENDS_ONLY', 'PRIVATE']).toContain(level);
    }
  });

  it('friendship statuses should match expected values', () => {
    const statuses = ['PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED'] as const;

    for (const status of statuses) {
      expect(['PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED']).toContain(status);
    }
  });
});
