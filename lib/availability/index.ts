/**
 * Availability / Find-Time helpers
 *
 * Pure functions for computing free/busy intervals and picking meeting slots.
 */

export interface Interval {
  start: number; // epoch ms
  end: number; // epoch ms
}

/**
 * Merge overlapping or adjacent intervals into non-overlapping intervals.
 * Input does NOT need to be sorted.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];

  // Deep-clone to avoid mutating caller's objects
  const sorted = intervals
    .map((iv) => ({ start: iv.start, end: iv.end }))
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];

    if (curr.start <= last.end) {
      // overlapping or adjacent – extend
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ start: curr.start, end: curr.end });
    }
  }

  return merged;
}

/**
 * Given a sorted, merged list of busy intervals within a range,
 * return the free (inverse) intervals.
 */
export function invertToFree(busy: Interval[], range: Interval): Interval[] {
  const free: Interval[] = [];
  let cursor = range.start;

  for (const b of busy) {
    if (b.start > cursor) {
      free.push({ start: cursor, end: Math.min(b.start, range.end) });
    }
    cursor = Math.max(cursor, b.end);
    if (cursor >= range.end) break;
  }

  if (cursor < range.end) {
    free.push({ start: cursor, end: range.end });
  }

  return free;
}

/**
 * Intersect multiple lists of free intervals (one per participant).
 * Returns only time spans that appear in ALL lists.
 */
export function intersectFree(participantsFree: Interval[][]): Interval[] {
  if (participantsFree.length === 0) return [];
  if (participantsFree.length === 1) return participantsFree[0];

  let result = participantsFree[0];

  for (let i = 1; i < participantsFree.length; i++) {
    result = intersectTwo(result, participantsFree[i]);
    if (result.length === 0) break;
  }

  return result;
}

/** Intersect two sorted interval lists. */
function intersectTwo(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);

    if (start < end) {
      out.push({ start, end });
    }

    // advance the pointer whose interval ends first
    if (a[i].end < b[j].end) {
      i++;
    } else {
      j++;
    }
  }

  return out;
}

const STEP_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Pick candidate meeting slots of the given duration from free intervals.
 * Slots are aligned to 15-minute increments from the range start.
 * Returns up to `limit` slots, preferring earlier slots.
 */
export function pickSlots(
  freeIntervals: Interval[],
  durationMs: number,
  limit = 5
): Interval[] {
  const slots: Interval[] = [];

  for (const free of freeIntervals) {
    // Align start to next 15-minute boundary
    let slotStart = alignUp(free.start);

    while (slotStart + durationMs <= free.end) {
      slots.push({ start: slotStart, end: slotStart + durationMs });
      if (slots.length >= limit) return slots;
      slotStart += STEP_MS;
    }
  }

  return slots;
}

/** Round up to the next 15-minute boundary (epoch ms). */
function alignUp(ms: number): number {
  const remainder = ms % STEP_MS;
  return remainder === 0 ? ms : ms + (STEP_MS - remainder);
}
