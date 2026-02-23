import { describe, it, expect } from 'vitest';
import { isOpenAtTime, parseOpeningHours } from '@/lib/discover/hours';

/**
 * Opening hours parser + isOpenAtTime tests.
 *
 * Covers:
 * 1. Known hours CLOSED during slot => returns CLOSED
 * 2. Known hours OPEN during slot => returns OPEN
 * 3. Missing / unparseable hours => returns UNKNOWN
 * 4. 24/7 always open
 * 5. Multi-rule parsing
 */

describe('parseOpeningHours', () => {
  it('should parse 24/7', () => {
    const rules = parseOpeningHours('24/7');
    expect(rules).not.toBeNull();
    expect(rules!.length).toBe(1);
    expect(rules![0].days).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('should parse Mo-Fr 08:00-18:00', () => {
    const rules = parseOpeningHours('Mo-Fr 08:00-18:00');
    expect(rules).not.toBeNull();
    expect(rules!.length).toBe(1);
    // Mon=1, Tue=2, Wed=3, Thu=4, Fri=5
    expect(rules![0].days.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(rules![0].ranges[0]).toEqual({ openMin: 480, closeMin: 1080 });
  });

  it('should parse multi-rule: Mo-Fr 08:00-18:00; Sa 09:00-14:00', () => {
    const rules = parseOpeningHours('Mo-Fr 08:00-18:00; Sa 09:00-14:00');
    expect(rules).not.toBeNull();
    expect(rules!.length).toBe(2);
    expect(rules![1].days).toContain(6); // Saturday
    expect(rules![1].ranges[0]).toEqual({ openMin: 540, closeMin: 840 });
  });

  it('should return null for empty string', () => {
    expect(parseOpeningHours('')).toBeNull();
  });

  it('should return null for unparseable format', () => {
    expect(parseOpeningHours('some random text')).toBeNull();
    expect(parseOpeningHours('PH off')).toBeNull();
  });

  it('should return null for invalid time values (25:00)', () => {
    expect(parseOpeningHours('Mo-Fr 25:00-26:00')).toBeNull();
  });

  it('should return null for invalid close time (24:01)', () => {
    expect(parseOpeningHours('Mo-Fr 08:00-24:01')).toBeNull();
  });

  it('should return null for invalid minutes (08:60)', () => {
    expect(parseOpeningHours('Mo-Fr 08:60-18:00')).toBeNull();
  });

  it('should return null for semicolons only', () => {
    expect(parseOpeningHours('; ;')).toBeNull();
  });
});

describe('isOpenAtTime', () => {
  // Helper: create a date on a specific day of week (Mon=1) at a given hour
  function makeDate(dayOfWeek: number, hour: number, minute = 0): Date {
    // 2026-02-09 is a Monday
    const base = new Date('2026-02-09T00:00:00');
    const offset = dayOfWeek - 1; // Monday=0 offset
    base.setDate(base.getDate() + offset);
    base.setHours(hour, minute, 0, 0);
    return base;
  }

  it('should return OPEN when hours are known and venue is open during slot', () => {
    const hours = 'Mo-Fr 08:00-18:00';
    const slotStart = makeDate(1, 10); // Monday 10am
    const slotEnd = makeDate(1, 12); // Monday 12pm
    expect(isOpenAtTime(hours, slotStart, slotEnd)).toBe('OPEN');
  });

  it('should return CLOSED when hours are known and venue is closed during slot', () => {
    const hours = 'Mo-Fr 08:00-18:00';
    const slotStart = makeDate(1, 19); // Monday 7pm
    const slotEnd = makeDate(1, 21); // Monday 9pm
    expect(isOpenAtTime(hours, slotStart, slotEnd)).toBe('CLOSED');
  });

  it('should return CLOSED when slot is on a day the venue is not open', () => {
    const hours = 'Mo-Fr 08:00-18:00';
    const slotStart = makeDate(6, 10); // Saturday 10am
    const slotEnd = makeDate(6, 12); // Saturday 12pm
    expect(isOpenAtTime(hours, slotStart, slotEnd)).toBe('CLOSED');
  });

  it('should return CLOSED when only slot end falls outside hours', () => {
    const hours = 'Mo-Fr 08:00-18:00';
    const slotStart = makeDate(1, 16); // Monday 4pm
    const slotEnd = makeDate(1, 19); // Monday 7pm — after closing
    expect(isOpenAtTime(hours, slotStart, slotEnd)).toBe('CLOSED');
  });

  it('should return UNKNOWN when hours are null', () => {
    expect(isOpenAtTime(null, new Date(), new Date())).toBe('UNKNOWN');
  });

  it('should return UNKNOWN when hours are undefined', () => {
    expect(isOpenAtTime(undefined, new Date(), new Date())).toBe('UNKNOWN');
  });

  it('should return UNKNOWN when hours are unparseable', () => {
    expect(isOpenAtTime('weird format', new Date(), new Date())).toBe(
      'UNKNOWN'
    );
  });

  it('should return OPEN for 24/7 venue at any time', () => {
    const hours = '24/7';
    const slotStart = makeDate(6, 2); // Saturday 2am
    const slotEnd = makeDate(6, 5); // Saturday 5am
    expect(isOpenAtTime(hours, slotStart, slotEnd)).toBe('OPEN');
  });

  it('should handle multi-rule correctly (open on Saturday)', () => {
    const hours = 'Mo-Fr 08:00-18:00; Sa 09:00-14:00';
    const slotStart = makeDate(6, 10); // Saturday 10am
    const slotEnd = makeDate(6, 13); // Saturday 1pm
    expect(isOpenAtTime(hours, slotStart, slotEnd)).toBe('OPEN');
  });

  it('should return CLOSED for Saturday evening with multi-rule', () => {
    const hours = 'Mo-Fr 08:00-18:00; Sa 09:00-14:00';
    const slotStart = makeDate(6, 15); // Saturday 3pm
    const slotEnd = makeDate(6, 18); // Saturday 6pm
    expect(isOpenAtTime(hours, slotStart, slotEnd)).toBe('CLOSED');
  });

  it('should treat slot ending exactly at closing time as OPEN', () => {
    const hours = 'Mo-Fr 08:00-18:00';
    const slotStart = makeDate(1, 16); // Monday 4pm
    const slotEnd = makeDate(1, 18, 0); // Monday 6pm = closing time
    expect(isOpenAtTime(hours, slotStart, slotEnd)).toBe('OPEN');
  });
});
