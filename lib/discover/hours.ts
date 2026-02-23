/**
 * Opening hours parser (best-effort) and isOpenAtTime evaluator.
 *
 * Supports common OSM opening_hours patterns:
 *   "Mo-Fr 08:00-18:00"
 *   "Mo-Fr 08:00-18:00; Sa 09:00-14:00"
 *   "Mo-Su 10:00-22:00"
 *   "24/7"
 *
 * Unsupported / complex rules fall through as UNKNOWN.
 */

export type OpenStatusValue = 'OPEN' | 'CLOSED' | 'UNKNOWN';

/** Day abbreviation to JS getDay() index. */
const DAY_MAP: Record<string, number> = {
  Mo: 1,
  Tu: 2,
  We: 3,
  Th: 4,
  Fr: 5,
  Sa: 6,
  Su: 0,
};

const DAY_ABBREVS = Object.keys(DAY_MAP);

interface TimeRange {
  openMin: number; // minutes from midnight
  closeMin: number;
}

interface DayRule {
  days: number[]; // JS getDay() values
  ranges: TimeRange[];
}

/**
 * Parse an OSM opening_hours string into structured rules.
 * Returns null if the format is not understood.
 */
export function parseOpeningHours(raw: string): DayRule[] | null {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();

  // 24/7
  if (trimmed === '24/7') {
    return [
      {
        days: [0, 1, 2, 3, 4, 5, 6],
        ranges: [{ openMin: 0, closeMin: 24 * 60 }],
      },
    ];
  }

  try {
    // Split by ";" for multiple rules
    const parts = trimmed.split(';').map((s) => s.trim());
    const rules: DayRule[] = [];

    for (const part of parts) {
      if (!part) continue;
      const rule = parseSingleRule(part);
      if (!rule) return null; // bail on any unparseable segment
      rules.push(rule);
    }

    return rules.length > 0 ? rules : null;
  } catch {
    return null;
  }
}

/**
 * Parse a single rule like "Mo-Fr 08:00-18:00" or "Sa 09:00-14:00".
 */
function parseSingleRule(text: string): DayRule | null {
  // Match pattern: DaySpec TimeSpec (e.g. "Mo-Fr 08:00-18:00")
  const match = text.match(/^([A-Za-z,\-]+)\s+([\d:,\-\s]+)$/);
  if (!match) return null;

  const daysPart = match[1];
  const timesPart = match[2];

  const days = parseDays(daysPart);
  if (!days) return null;

  const ranges = parseTimeRanges(timesPart);
  if (!ranges) return null;

  return { days, ranges };
}

/**
 * Parse day specifications: "Mo-Fr", "Mo,We,Fr", "Mo-Su", etc.
 */
function parseDays(text: string): number[] | null {
  const days = new Set<number>();

  // Split by comma for multiple day groups
  const groups = text.split(',');

  for (const group of groups) {
    const trimmedGroup = group.trim();
    if (trimmedGroup.includes('-')) {
      // Range: Mo-Fr
      const [startStr, endStr] = trimmedGroup.split('-');
      const startIdx = DAY_ABBREVS.indexOf(startStr.trim());
      const endIdx = DAY_ABBREVS.indexOf(endStr.trim());
      if (startIdx === -1 || endIdx === -1) return null;

      const startDay = DAY_MAP[DAY_ABBREVS[startIdx]];
      const endDay = DAY_MAP[DAY_ABBREVS[endIdx]];

      // Walk from start to end (wrapping Sunday)
      let d = startDay;
      for (let i = 0; i < 7; i++) {
        days.add(d);
        if (d === endDay) break;
        d = (d + 1) % 7;
      }
    } else {
      // Single day: Mo
      const idx = DAY_ABBREVS.indexOf(trimmedGroup);
      if (idx === -1) return null;
      days.add(DAY_MAP[trimmedGroup]);
    }
  }

  return days.size > 0 ? Array.from(days) : null;
}

/**
 * Parse time ranges: "08:00-18:00" or "08:00-12:00,13:00-17:00".
 */
function parseTimeRanges(text: string): TimeRange[] | null {
  const ranges: TimeRange[] = [];
  const parts = text.split(',');

  for (const part of parts) {
    const match = part
      .trim()
      .match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const openHour = parseInt(match[1]);
    const openMinute = parseInt(match[2]);
    const closeHour = parseInt(match[3]);
    const closeMinute = parseInt(match[4]);

    // Validate time bounds (0-23:59 for open, 0-24:00 for close)
    if (openHour > 23 || openMinute > 59) return null;
    if (
      closeHour > 24 ||
      (closeHour === 24 && closeMinute > 0) ||
      closeMinute > 59
    )
      return null;

    const openMin = openHour * 60 + openMinute;
    const closeMin = closeHour * 60 + closeMinute;
    if (openMin >= closeMin) return null; // skip overnight for now

    ranges.push({ openMin, closeMin });
  }

  return ranges.length > 0 ? ranges : null;
}

/**
 * Determine if a place is open during a given time slot.
 *
 * @param openingHoursRaw - OSM opening_hours string (may be null/undefined)
 * @param slotStart - slot start as Date
 * @param slotEnd - slot end as Date
 * @returns OPEN if hours are known and the place is open during the entire slot,
 *          CLOSED if hours are known and the place is closed during the slot,
 *          UNKNOWN if hours are missing or cannot be parsed.
 */
export function isOpenAtTime(
  openingHoursRaw: string | null | undefined,
  slotStart: Date,
  slotEnd: Date
): OpenStatusValue {
  if (!openingHoursRaw) return 'UNKNOWN';

  const rules = parseOpeningHours(openingHoursRaw);
  if (!rules) return 'UNKNOWN';

  // Check that both slot start and slot end fall within open hours
  // (conservative: entire slot must be open)
  const startOpen = isTimeInRules(rules, slotStart);
  const endOpen = isTimeInRules(rules, slotEnd);

  if (startOpen && endOpen) return 'OPEN';
  return 'CLOSED';
}

/**
 * Check if a specific point in time falls within any rule's open hours.
 */
function isTimeInRules(rules: DayRule[], dt: Date): boolean {
  const dayOfWeek = dt.getDay(); // 0=Sun
  const minuteOfDay = dt.getHours() * 60 + dt.getMinutes();

  for (const rule of rules) {
    if (!rule.days.includes(dayOfWeek)) continue;

    for (const range of rule.ranges) {
      if (minuteOfDay >= range.openMin && minuteOfDay <= range.closeMin) {
        return true;
      }
    }
  }

  return false;
}
