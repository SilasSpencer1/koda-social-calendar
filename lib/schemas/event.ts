import { z } from 'zod';

// ── Zod schemas for client-side form validation ──────────────

export const EventFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(5000).optional().default(''),
  locationName: z.string().max(500).optional().default(''),
  startAt: z.date({ required_error: 'Start time is required' }),
  endAt: z.date({ required_error: 'End time is required' }),
  timezone: z.string().min(1),
  visibility: z.enum(['PRIVATE', 'FRIENDS', 'PUBLIC']).default('FRIENDS'),
  coverMode: z.enum(['NONE', 'BUSY_ONLY']).default('NONE'),
  syncToGoogle: z.boolean().default(false),
  guestIds: z.array(z.string()).default([]),
});

export type EventFormData = z.infer<typeof EventFormSchema>;

// ── API payload (serializable) ───────────────────────────────

export interface CreateEventPayload {
  title: string;
  description?: string;
  locationName?: string;
  startAt: string; // ISO datetime
  endAt: string;
  timezone: string;
  visibility: 'PRIVATE' | 'FRIENDS' | 'PUBLIC';
  coverMode: 'NONE' | 'BUSY_ONLY';
}

export type UpdateEventPayload = Partial<CreateEventPayload>;

// ── Event response type (from GET /api/events) ──────────────

export interface EventAttendee {
  id: string;
  userId: string | null;
  name?: string;
  email?: string;
  status: 'INVITED' | 'GOING' | 'DECLINED';
  anonymity?: 'NAMED' | 'ANONYMOUS';
  role: 'HOST' | 'ATTENDEE';
}

export interface CalendarEvent {
  id: string;
  ownerId: string;
  title: string;
  description?: string | null;
  locationName?: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  visibility: 'PRIVATE' | 'FRIENDS' | 'PUBLIC';
  coverMode: 'NONE' | 'BUSY_ONLY';
  syncToGoogle?: boolean;
  source?: string;
  attendees?: EventAttendee[];
}

// ── Friend type (for guest picker) ──────────────────────────

export interface FriendEntry {
  id: string;
  user: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
  };
}

// ── Helpers ──────────────────────────────────────────────────

/** Common timezone list for the picker */
export const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
  'UTC',
] as const;

/** Readable label for a timezone */
export function tzLabel(tz: string): string {
  try {
    const now = new Date();
    const short = now.toLocaleString('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    });
    const abbr = short.split(' ').pop() || '';
    const city = tz.split('/').pop()?.replace(/_/g, ' ') || tz;
    return `${city} (${abbr})`;
  } catch {
    return tz;
  }
}

/** Build default form values for a new event */
export function defaultEventForm(
  startDate?: Date,
  endDate?: Date
): EventFormData {
  const now = new Date();
  const start = startDate ?? roundToNext15(now);
  const end = endDate ?? new Date(start.getTime() + 60 * 60 * 1000); // +1h

  return {
    title: '',
    description: '',
    locationName: '',
    startAt: start,
    endAt: end,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visibility: 'FRIENDS',
    coverMode: 'NONE',
    syncToGoogle: false,
    guestIds: [],
  };
}

/** Round a date up to the next 15-minute mark */
export function roundToNext15(date: Date): Date {
  const d = new Date(date);
  const mins = d.getMinutes();
  const remainder = mins % 15;
  if (remainder !== 0) {
    d.setMinutes(mins + (15 - remainder), 0, 0);
  } else {
    d.setSeconds(0, 0);
  }
  return d;
}

/** Format a date as YYYY-MM-DDTHH:mm for datetime-local input */
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a datetime-local string back to Date */
export function fromDatetimeLocal(s: string): Date {
  return new Date(s);
}
