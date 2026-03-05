/**
 * Time-select helpers for the QuickAddPopover.
 *
 * Generates 30-minute interval options within the calendar grid's
 * visible window and converts between Date objects and "HH:mm" strings.
 */

import { GRID_START_HOUR, GRID_END_HOUR } from './grid';

// ── Types ────────────────────────────────────────────────────

export interface TimeOption {
  /** Display label, e.g. "2:00 PM" */
  label: string;
  /** Value in "HH:mm" format, e.g. "14:00" */
  value: string;
  /** Total minutes from midnight, e.g. 840 for 14:00 */
  totalMinutes: number;
}

// ── Generators ───────────────────────────────────────────────

/**
 * Generate time options at 15-minute intervals.
 * Default range: GRID_START_HOUR (0) through GRID_END_HOUR (24).
 */
export function generateTimeOptions(
  startHour: number = GRID_START_HOUR,
  endHour: number = GRID_END_HOUR
): TimeOption[] {
  const options: TimeOption[] = [];

  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === endHour && m > 0) break;

      const totalMinutes = h * 60 + m;
      const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const label = `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;

      options.push({ label, value, totalMinutes });
    }
  }

  return options;
}

// ── Converters ───────────────────────────────────────────────

/**
 * Extract an "HH:mm" time-value string from a Date,
 * snapped down to the nearest 15-minute boundary.
 */
export function dateToTimeValue(date: Date): string {
  const h = date.getHours();
  const m = Math.floor(date.getMinutes() / 15) * 15;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Return a new Date with the hours/minutes from `timeValue` ("HH:mm")
 * applied onto `baseDate`'s year/month/day.
 */
export function applyTimeToDate(baseDate: Date, timeValue: string): Date {
  const [hours, minutes] = timeValue.split(':').map(Number);
  const result = new Date(baseDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Human-readable duration between two dates.
 * Examples: "30 min", "1 hr", "1.5 hrs", "2 hrs"
 */
export function formatDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return '0 min';

  const totalMinutes = Math.round(diffMs / 60_000);

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = totalMinutes / 60;
  if (hours === Math.floor(hours)) {
    return `${hours} hr${hours !== 1 ? 's' : ''}`;
  }

  return `${hours.toFixed(1)} hrs`;
}
