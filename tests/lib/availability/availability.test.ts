import { describe, it, expect } from 'vitest';
import {
  mergeIntervals,
  invertToFree,
  intersectFree,
  pickSlots,
  type Interval,
} from '@/lib/availability';

/**
 * Availability Algorithm Tests
 *
 * Pure function tests — no mocks or DB required.
 */

// Helper: create epoch ms from hours (relative to a base date)
const BASE = new Date('2026-02-10T00:00:00Z').getTime();
const h = (hours: number): number => BASE + hours * 60 * 60 * 1000;
const m = (minutes: number): number => minutes * 60 * 1000;

describe('mergeIntervals', () => {
  it('should return empty for empty input', () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  it('should return single interval as-is', () => {
    const input: Interval[] = [{ start: h(9), end: h(10) }];
    expect(mergeIntervals(input)).toEqual(input);
  });

  it('should not mutate the original input intervals', () => {
    const input: Interval[] = [
      { start: h(9), end: h(11) },
      { start: h(10), end: h(12) },
    ];
    const originalEnd = input[0].end;
    mergeIntervals(input);
    // The caller's object should remain unchanged
    expect(input[0].end).toBe(originalEnd);
  });

  it('should merge overlapping intervals', () => {
    const input: Interval[] = [
      { start: h(9), end: h(11) },
      { start: h(10), end: h(12) },
    ];
    expect(mergeIntervals(input)).toEqual([{ start: h(9), end: h(12) }]);
  });

  it('should merge adjacent intervals', () => {
    const input: Interval[] = [
      { start: h(9), end: h(10) },
      { start: h(10), end: h(11) },
    ];
    expect(mergeIntervals(input)).toEqual([{ start: h(9), end: h(11) }]);
  });

  it('should not merge non-overlapping intervals', () => {
    const input: Interval[] = [
      { start: h(9), end: h(10) },
      { start: h(11), end: h(12) },
    ];
    expect(mergeIntervals(input)).toEqual([
      { start: h(9), end: h(10) },
      { start: h(11), end: h(12) },
    ]);
  });

  it('should handle unsorted input', () => {
    const input: Interval[] = [
      { start: h(11), end: h(12) },
      { start: h(9), end: h(10) },
      { start: h(10), end: h(11) },
    ];
    expect(mergeIntervals(input)).toEqual([{ start: h(9), end: h(12) }]);
  });
});

describe('invertToFree', () => {
  it('should return full range when no busy intervals', () => {
    const range: Interval = { start: h(8), end: h(18) };
    expect(invertToFree([], range)).toEqual([{ start: h(8), end: h(18) }]);
  });

  it('should compute free time around a busy block', () => {
    const range: Interval = { start: h(8), end: h(18) };
    const busy: Interval[] = [{ start: h(10), end: h(12) }];
    expect(invertToFree(busy, range)).toEqual([
      { start: h(8), end: h(10) },
      { start: h(12), end: h(18) },
    ]);
  });

  it('should handle busy at range start', () => {
    const range: Interval = { start: h(8), end: h(18) };
    const busy: Interval[] = [{ start: h(8), end: h(10) }];
    expect(invertToFree(busy, range)).toEqual([{ start: h(10), end: h(18) }]);
  });

  it('should handle busy at range end', () => {
    const range: Interval = { start: h(8), end: h(18) };
    const busy: Interval[] = [{ start: h(16), end: h(18) }];
    expect(invertToFree(busy, range)).toEqual([{ start: h(8), end: h(16) }]);
  });

  it('should return empty when entire range is busy', () => {
    const range: Interval = { start: h(8), end: h(18) };
    const busy: Interval[] = [{ start: h(7), end: h(19) }];
    expect(invertToFree(busy, range)).toEqual([]);
  });
});

describe('intersectFree', () => {
  it('should return empty for empty input', () => {
    expect(intersectFree([])).toEqual([]);
  });

  it('should return the single list unchanged', () => {
    const free = [{ start: h(9), end: h(12) }];
    expect(intersectFree([free])).toEqual(free);
  });

  it('should intersect two free interval lists correctly', () => {
    const user1Free: Interval[] = [
      { start: h(9), end: h(12) },
      { start: h(14), end: h(18) },
    ];
    const user2Free: Interval[] = [{ start: h(10), end: h(15) }];

    const result = intersectFree([user1Free, user2Free]);
    expect(result).toEqual([
      { start: h(10), end: h(12) },
      { start: h(14), end: h(15) },
    ]);
  });

  it('should return empty when no overlap', () => {
    const user1Free: Interval[] = [{ start: h(9), end: h(10) }];
    const user2Free: Interval[] = [{ start: h(11), end: h(12) }];
    expect(intersectFree([user1Free, user2Free])).toEqual([]);
  });
});

describe('pickSlots', () => {
  it('should pick slots aligned to 15-minute increments', () => {
    // Free from 9:00 to 12:00 — looking for 60 min slots
    const free: Interval[] = [{ start: h(9), end: h(12) }];
    const slots = pickSlots(free, m(60), 3);

    expect(slots.length).toBe(3);
    // First slot: 9:00 - 10:00
    expect(slots[0]).toEqual({ start: h(9), end: h(10) });
    // Second: 9:15 - 10:15
    expect(slots[1]).toEqual({ start: h(9) + m(15), end: h(10) + m(15) });
    // Third: 9:30 - 10:30
    expect(slots[2]).toEqual({ start: h(9) + m(30), end: h(10) + m(30) });
  });

  it('should return up to limit', () => {
    const free: Interval[] = [{ start: h(9), end: h(18) }];
    const slots = pickSlots(free, m(30), 5);
    expect(slots.length).toBe(5);
  });

  it('should return empty when duration exceeds free time', () => {
    const free: Interval[] = [{ start: h(9), end: h(9) + m(30) }];
    const slots = pickSlots(free, m(60), 5);
    expect(slots.length).toBe(0);
  });

  it('should correctly compute slots across multiple free intervals', () => {
    const free: Interval[] = [
      { start: h(9), end: h(9) + m(45) }, // only 45 min free
      { start: h(14), end: h(16) }, // 2 hours free
    ];
    const slots = pickSlots(free, m(60), 3);
    // First interval too short for 60 min
    // Slots from 14:00-15:00, 14:15-15:15, 14:30-15:30
    expect(slots.length).toBe(3);
    expect(slots[0]).toEqual({ start: h(14), end: h(15) });
  });

  it('should return >=3 slots when enough free time for 2 users', () => {
    // Simulate real scenario: 2 users, busy intervals, find 60 min slots
    const user1Busy: Interval[] = [
      { start: h(9), end: h(10) },
      { start: h(13), end: h(14) },
    ];
    const user2Busy: Interval[] = [
      { start: h(11), end: h(12) },
      { start: h(15), end: h(16) },
    ];

    const range: Interval = { start: h(8), end: h(18) };

    const user1Merged = mergeIntervals(user1Busy);
    const user2Merged = mergeIntervals(user2Busy);

    const user1Free = invertToFree(user1Merged, range);
    const user2Free = invertToFree(user2Merged, range);

    const commonFree = intersectFree([user1Free, user2Free]);
    const slots = pickSlots(commonFree, m(60), 5);

    // Both free: 8-9, 10-11, 12-13, 14-15, 16-18
    // Should have at least 3 slots
    expect(slots.length).toBeGreaterThanOrEqual(3);

    // Verify each slot is exactly 60 minutes
    for (const slot of slots) {
      expect(slot.end - slot.start).toBe(m(60));
    }
  });
});
