import { z } from 'zod';

export const profileUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username is too long')
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username can only contain letters, numbers, and underscores'
    )
    .optional()
    .nullable(),
  city: z.string().max(100, 'City name is too long').optional().nullable(),
});

export const avatarSaveSchema = z.object({
  avatarUrl: z.string().url('Invalid avatar URL').nullable(),
});

export const privacyUpdateSchema = z.object({
  accountVisibility: z.enum(['PUBLIC', 'FRIENDS_ONLY', 'PRIVATE']),
  defaultDetailLevel: z.enum(['DETAILS', 'BUSY_ONLY']),
  allowSuggestions: z.boolean(),
});

export const notificationsUpdateSchema = z.object({
  emailInvitesEnabled: z.boolean().optional(),
  emailDigestEnabled: z.boolean().optional(),
});

export const googleIntegrationUpdateSchema = z.object({
  pushToGoogleEnabled: z.boolean(),
});
