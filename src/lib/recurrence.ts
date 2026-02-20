import {
  addDays,
  addWeeks,
  addMonths,
  getDay,
  getDaysInMonth,
  setDate,
  lastDayOfMonth,
  subDays,
} from 'date-fns';
import { RecurrenceRule } from '@/types/database';

/**
 * Given the current scheduled date and a recurrence rule,
 * compute the next run date.
 */
export function advanceNextRunDate(currentDate: Date, rule: RecurrenceRule): Date {
  switch (rule.type) {
    case 'daily':
      return addDays(currentDate, rule.interval);

    case 'weekly':
      return advanceWeekly(currentDate, rule);

    case 'monthly':
      return advanceMonthly(currentDate, rule);

    default:
      return addDays(currentDate, 1);
  }
}

function advanceWeekly(currentDate: Date, rule: RecurrenceRule): Date {
  const days = rule.days;
  if (!days || days.length === 0) {
    return addWeeks(currentDate, rule.interval);
  }

  // Sort the target days
  const sorted = [...days].sort((a, b) => a - b);
  const currentDay = getDay(currentDate); // 0=Sun

  // Find next target day in this week (after current day)
  const nextInWeek = sorted.find((d) => d > currentDay);
  if (nextInWeek !== undefined) {
    return addDays(currentDate, nextInWeek - currentDay);
  }

  // Jump to first target day of the next interval-week
  const daysUntilSunday = 7 - currentDay;
  const nextWeekStart = addDays(currentDate, daysUntilSunday + (rule.interval - 1) * 7);
  return addDays(nextWeekStart, sorted[0]);
}

function advanceMonthly(currentDate: Date, rule: RecurrenceRule): Date {
  const nextMonth = addMonths(currentDate, rule.interval);
  const day = rule.day;

  if (typeof day === 'number') {
    // Clamp to last day of month for short months
    const maxDay = getDaysInMonth(nextMonth);
    const targetDay = Math.min(day, maxDay);
    return setDate(nextMonth, targetDay);
  }

  if (typeof day === 'string' && day.startsWith('last_')) {
    // e.g., "last_friday" or "last_monday"
    const dayName = day.replace('last_', '').toLowerCase();
    const dayMap: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    const targetDow = dayMap[dayName];
    if (targetDow === undefined) return nextMonth;

    const last = lastDayOfMonth(nextMonth);
    const lastDow = getDay(last);
    const diff = (lastDow - targetDow + 7) % 7;
    return subDays(last, diff);
  }

  // Fallback: just advance by interval months
  return nextMonth;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Return a human-readable description of a recurrence rule.
 */
export function describeRecurrence(rule: RecurrenceRule): string {
  switch (rule.type) {
    case 'daily':
      return rule.interval === 1 ? 'Every day' : `Every ${rule.interval} days`;

    case 'weekly': {
      const prefix = rule.interval === 1 ? 'Every week' : `Every ${rule.interval} weeks`;
      if (rule.days && rule.days.length > 0) {
        const dayLabels = rule.days.map((d) => DAY_NAMES[d]).join(', ');
        return `${prefix} on ${dayLabels}`;
      }
      return prefix;
    }

    case 'monthly': {
      const prefix = rule.interval === 1 ? 'Every month' : `Every ${rule.interval} months`;
      if (typeof rule.day === 'number') {
        return `${prefix} on the ${ordinal(rule.day)}`;
      }
      if (typeof rule.day === 'string' && rule.day.startsWith('last_')) {
        const dayName = rule.day.replace('last_', '');
        return `${prefix} on the last ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}`;
      }
      return prefix;
    }

    default:
      return 'Custom recurrence';
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
