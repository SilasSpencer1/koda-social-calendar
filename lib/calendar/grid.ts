/**
 * Shared calendar grid constants and positioning helpers.
 *
 * Both `CalendarGrid` (full-size) and `MiniWeekCalendar` (feed compact)
 * rely on the same time-window logic. Keeping it here prevents the two
 * components from drifting in behavior over time.
 */

// ── Grid window ──────────────────────────────────────────────

/** First visible hour (inclusive). */
export const GRID_START_HOUR = 8; // 8 am

/** Last visible hour (exclusive — grid ends at the start of this hour). */
export const GRID_END_HOUR = 22; // 10 pm

/**
 * Array of hour labels.  Length = GRID_END_HOUR − GRID_START_HOUR (14).
 * Each entry is the starting hour of a row: 8, 9, … 21.
 */
export const HOURS: number[] = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => i + GRID_START_HOUR
);

/** Total minutes the grid spans (derived from HOURS to stay in sync). */
export const TOTAL_MINUTES = HOURS.length * 60; // 840

// ── Day names ────────────────────────────────────────────────

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// ── All-day detection ────────────────────────────────────────

/**
 * Determine whether an event should be rendered as an "all-day" banner
 * (Google Calendar style) rather than a positioned block in the time grid.
 *
 * An event is all-day if:
 *  - It spans 23+ hours (accounts for DST / slight offsets), or
 *  - It starts at midnight and ends at midnight (next day or later).
 */
export function isAllDayEvent(event: {
  startAt: string;
  endAt: string;
}): boolean {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (end <= start) return false;

  const durationMs = end.getTime() - start.getTime();

  // 23 hours or more → all-day
  if (durationMs >= 23 * 60 * 60 * 1000) return true;

  // Midnight-to-midnight (single or multi-day)
  const startMidnight =
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    start.getSeconds() === 0;
  const endMidnight =
    end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0;
  if (startMidnight && endMidnight) return true;

  return false;
}

/**
 * Check whether an all-day event overlaps a given calendar date.
 * Uses the full day [00:00, 24:00) rather than the grid window.
 */
export function allDayEventOverlapsDay(
  event: { startAt: string; endAt: string },
  dayDate: Date
): boolean {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (end <= start) return false;

  const dayStart = new Date(dayDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayDate);
  dayEnd.setDate(dayEnd.getDate() + 1);
  dayEnd.setHours(0, 0, 0, 0);

  return start < dayEnd && end > dayStart;
}

// ── Positioning helpers ──────────────────────────────────────

export interface EventPosition {
  /** Percentage offset from the top of the grid column. */
  topPercent: number;
  /** Percentage height within the grid column. */
  heightPercent: number;
}

/**
 * Compute the visible position of an event within a day column.
 *
 * `dayDate` is midnight (00:00) of the column's calendar date.
 * The event's effective range is clamped to [GRID_START_HOUR, GRID_END_HOUR].
 *
 * @returns Position percentages, or `null` when the event has no visible
 *          portion in the window (entirely outside, or invalid range).
 */
export function getEventPosition(
  startAt: Date,
  endAt: Date,
  dayDate: Date
): EventPosition | null {
  if (endAt <= startAt) return null;

  const windowStart = new Date(dayDate);
  windowStart.setHours(GRID_START_HOUR, 0, 0, 0);
  const windowEnd = new Date(dayDate);
  windowEnd.setHours(GRID_END_HOUR, 0, 0, 0);

  const clampedStart = startAt < windowStart ? windowStart : startAt;
  const clampedEnd = endAt > windowEnd ? windowEnd : endAt;

  if (clampedStart >= clampedEnd) return null;

  const offsetMinutes =
    (clampedStart.getTime() - windowStart.getTime()) / 60000;
  const durationMinutes =
    (clampedEnd.getTime() - clampedStart.getTime()) / 60000;

  const topPercent = (offsetMinutes / TOTAL_MINUTES) * 100;
  const heightPercent = (durationMinutes / TOTAL_MINUTES) * 100;

  return { topPercent, heightPercent };
}

/**
 * Check whether an event overlaps a given day's visible grid window.
 *
 * Accepts any object with `startAt` / `endAt` ISO-string fields, so it
 * works for both `EventBlock` and `MiniEvent` without coupling to either type.
 */
export function eventOverlapsDay(
  event: { startAt: string; endAt: string },
  dayDate: Date
): boolean {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  if (end <= start) return false;

  const dayStart = new Date(dayDate);
  dayStart.setHours(GRID_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(dayDate);
  dayEnd.setHours(GRID_END_HOUR, 0, 0, 0);

  return start < dayEnd && end > dayStart;
}
