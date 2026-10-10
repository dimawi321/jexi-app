/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PaymentIntention, ScheduleFrequency, CompletedTransactionRecord } from '../types';
import { getTodayDateString } from '../constants';

/**
 * Deterministic payment occurrence ID generator.
 * Identity formula: occ_<intentionId>_<dueDate>
 */
export function getOccurrenceId(intentionId: string, dueDate: string): string {
  const cleanDue = dueDate ? dueDate.trim() : getTodayDateString();
  return `occ_${intentionId}_${cleanDue}`;
}

export const WEEKDAYS = [
  { index: 0, name: 'Sunday', short: 'Sun' },
  { index: 1, name: 'Monday', short: 'Mon' },
  { index: 2, name: 'Tuesday', short: 'Tue' },
  { index: 3, name: 'Wednesday', short: 'Wed' },
  { index: 4, name: 'Thursday', short: 'Thu' },
  { index: 5, name: 'Friday', short: 'Fri' },
  { index: 6, name: 'Saturday', short: 'Sat' },
];

export function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * Format a human-readable summary of the recurring schedule
 */
export function formatScheduleCadence(intent: PaymentIntention): string {
  const timePart = intent.scheduleTime ? ` at ${intent.scheduleTime}` : '';

  switch (intent.frequency) {
    case 'monthly': {
      const day = intent.dueDayOfMonth || parseInt(intent.nextDueDate.split('-')[2], 10) || 1;
      return `Monthly on the ${getOrdinalSuffix(day)}${timePart}`;
    }
    case 'weekly': {
      const dayIndex = intent.dueDayOfWeek !== undefined
        ? intent.dueDayOfWeek
        : new Date(intent.nextDueDate + 'T12:00:00Z').getUTCDay();
      const weekdayName = WEEKDAYS[dayIndex]?.name || 'Weekday';
      return `Weekly every ${weekdayName}${timePart}`;
    }
    case 'biweekly': {
      const dayIndex = intent.dueDayOfWeek !== undefined
        ? intent.dueDayOfWeek
        : new Date(intent.nextDueDate + 'T12:00:00Z').getUTCDay();
      const weekdayName = WEEKDAYS[dayIndex]?.name || 'Weekday';
      const start = intent.startDate ? ` (from ${intent.startDate})` : '';
      return `Bi-weekly on ${weekdayName}s${start}${timePart}`;
    }
    case 'custom_days': {
      const interval = intent.customIntervalDays || 30;
      const start = intent.startDate ? ` (from ${intent.startDate})` : '';
      return `Every ${interval} days${start}${timePart}`;
    }
    case 'once': {
      return `One-time on ${intent.nextDueDate}${timePart}`;
    }
    default:
      return `${intent.frequency}${timePart}`;
  }
}

/**
 * Compute next due date string (YYYY-MM-DD) based on schedule parameters
 */
export function computeNextDueDate(
  frequency: ScheduleFrequency,
  params: {
    dueDayOfMonth?: number;
    dueDayOfWeek?: number;
    startDate?: string;
    customIntervalDays?: number;
    fromDate?: string; // Reference date, defaults to today
  }
): string {
  const todayStr = getTodayDateString();
  const refDateStr = params.fromDate || todayStr;
  const [refYear, refMonth, refDay] = refDateStr.split('-').map((n) => parseInt(n, 10));
  const refDate = new Date(Date.UTC(refYear, refMonth - 1, refDay));

  switch (frequency) {
    case 'monthly': {
      const targetDay = params.dueDayOfMonth || 1;
      // Check if target day in ref month is today or in the future
      const maxDaysInRefMonth = new Date(Date.UTC(refYear, refMonth, 0)).getUTCDate();
      const clampedRefDay = Math.min(targetDay, maxDaysInRefMonth);

      if (clampedRefDay >= refDay) {
        // Still in the current month
        return `${refYear}-${String(refMonth).padStart(2, '0')}-${String(clampedRefDay).padStart(2, '0')}`;
      } else {
        // Next month
        const nextMonth = refMonth === 12 ? 1 : refMonth + 1;
        const nextYear = refMonth === 12 ? refYear + 1 : refYear;
        const maxDaysNextMonth = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
        const clampedNextDay = Math.min(targetDay, maxDaysNextMonth);
        return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clampedNextDay).padStart(2, '0')}`;
      }
    }

    case 'weekly': {
      const targetWeekday = params.dueDayOfWeek !== undefined ? params.dueDayOfWeek : 1; // Default to Monday
      const currentWeekday = refDate.getUTCDay();
      let diffDays = (targetWeekday - currentWeekday + 7) % 7;
      // If diffDays is 0, it is today!
      const targetDate = new Date(refDate.getTime() + diffDays * 24 * 60 * 60 * 1000);
      return targetDate.toISOString().split('T')[0];
    }

    case 'biweekly': {
      const startStr = params.startDate || refDateStr;
      const [sYear, sMonth, sDay] = startStr.split('-').map((n) => parseInt(n, 10));
      let current = new Date(Date.UTC(sYear, sMonth - 1, sDay));

      // If user also specified a target weekday, align initial start date to that weekday
      if (params.dueDayOfWeek !== undefined) {
        const diff = (params.dueDayOfWeek - current.getUTCDay() + 7) % 7;
        current = new Date(current.getTime() + diff * 24 * 60 * 60 * 1000);
      }

      // Fast forward by 14-day increments until >= refDate
      while (current.getTime() < refDate.getTime()) {
        current = new Date(current.getTime() + 14 * 24 * 60 * 60 * 1000);
      }
      return current.toISOString().split('T')[0];
    }

    case 'custom_days': {
      const interval = Math.max(1, params.customIntervalDays || 30);
      const startStr = params.startDate || refDateStr;
      const [sYear, sMonth, sDay] = startStr.split('-').map((n) => parseInt(n, 10));
      let current = new Date(Date.UTC(sYear, sMonth - 1, sDay));

      // Fast forward by custom interval until >= refDate
      while (current.getTime() < refDate.getTime()) {
        current = new Date(current.getTime() + interval * 24 * 60 * 60 * 1000);
      }
      return current.toISOString().split('T')[0];
    }

    case 'once': {
      return params.startDate || refDateStr;
    }

    default:
      return refDateStr;
  }
}

export type PaymentStatus = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'PAUSED' | 'COMPLETED' | 'REJECTED';

/**
 * Authoritative single-engine status calculation based on current date & time.
 * For every active payment intention:
 * - Rejected one-time intention = REJECTED (terminal)
 * - Completed one-time intention = COMPLETED (terminal)
 * - Future scheduled date/time = UPCOMING
 * - Scheduled date/time is today and due time has arrived = DUE TODAY
 * - Scheduled date/time has passed without execution or skipping = OVERDUE
 * - Paused intention = PAUSED
 */
export function getIntentionStatus(
  intention: PaymentIntention,
  referenceDate?: Date
): PaymentStatus {
  // Terminal rejected check: rejected one-time intentions are permanently terminal
  if (
    intention.isRejected ||
    (intention.frequency === 'once' && (intention.isRejected || !!intention.rejectedAt))
  ) {
    return 'REJECTED';
  }

  // Terminal completed check: completed one-time intentions are permanently terminal
  if (
    intention.isCompleted ||
    (intention.frequency === 'once' && (intention.isCompleted || !!intention.completedAt))
  ) {
    return 'COMPLETED';
  }

  if (!intention.active) {
    return 'PAUSED';
  }

  const now = referenceDate || new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMinutes = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHours}:${currentMinutes}`;

  const targetDateStr = intention.nextDueDate;

  // Past scheduled date without execution or skipping -> OVERDUE
  if (targetDateStr < todayStr) {
    return 'OVERDUE';
  }

  // Future scheduled date -> UPCOMING
  if (targetDateStr > todayStr) {
    return 'UPCOMING';
  }

  // targetDateStr === todayStr (Scheduled for today) -> DUE_TODAY
  return 'DUE_TODAY';
}

/**
 * Determines whether the current (or reference) time is strictly before an intention's scheduled datetime.
 *
 * Used exclusively for Early Execution confirmation decisions:
 * - Case 1: Future date (nextDueDate > today) -> TRUE
 * - Case 2: Today before scheduled time (nextDueDate === today && currentTime < scheduleTime) -> TRUE
 * - Case 3: Today at or after scheduled time (nextDueDate === today && currentTime >= scheduleTime) -> FALSE
 * - Case 4: Past date (nextDueDate < today) -> FALSE
 */
export function isBeforeScheduledDatetime(
  intention: PaymentIntention,
  referenceDate?: Date
): boolean {
  if (!intention || !intention.nextDueDate) return false;

  const now = referenceDate || new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMinutes = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHours}:${currentMinutes}`;

  const targetDateStr = intention.nextDueDate;

  if (targetDateStr > todayStr) {
    return true;
  }

  if (targetDateStr < todayStr) {
    return false;
  }

  // targetDateStr === todayStr
  if (intention.scheduleTime) {
    return currentTimeStr < intention.scheduleTime;
  }

  return false;
}

/**
 * Checks whether an intention or date is overdue.
 * Supports passing either a PaymentIntention or a date string.
 */
export function isIntentionOverdue(
  target: PaymentIntention | string,
  reference?: Date | string
): boolean {
  if (typeof target === 'object' && target !== null) {
    return getIntentionStatus(target, typeof reference === 'object' ? reference : undefined) === 'OVERDUE';
  }
  const todayStr = typeof reference === 'string' ? reference : getTodayDateString();
  return typeof target === 'string' && target < todayStr;
}

/**
 * Checks whether an intention or date is due today.
 * Supports passing either a PaymentIntention or a date string.
 */
export function isIntentionDueToday(
  target: PaymentIntention | string,
  reference?: Date | string
): boolean {
  if (typeof target === 'object' && target !== null) {
    return getIntentionStatus(target, typeof reference === 'object' ? reference : undefined) === 'DUE_TODAY';
  }
  const todayStr = typeof reference === 'string' ? reference : getTodayDateString();
  return typeof target === 'string' && target === todayStr;
}

/**
 * Checks whether an intention or date is upcoming.
 */
export function isIntentionUpcoming(
  target: PaymentIntention | string,
  reference?: Date | string
): boolean {
  if (typeof target === 'object' && target !== null) {
    return getIntentionStatus(target, typeof reference === 'object' ? reference : undefined) === 'UPCOMING';
  }
  const todayStr = typeof reference === 'string' ? reference : getTodayDateString();
  return typeof target === 'string' && target > todayStr;
}

/**
 * Backward compatibility alias for isIntentionUpcoming.
 */
export function isIntentionFuture(
  target: PaymentIntention | string,
  reference?: Date | string
): boolean {
  return isIntentionUpcoming(target, reference);
}

/**
 * Computes how many whole days a payment is overdue.
 */
export function getDaysOverdue(
  target: PaymentIntention | string,
  reference?: Date | string
): number {
  const targetDateStr: string = typeof target === 'string' ? target : target.nextDueDate;
  const todayStr = typeof reference === 'string' ? reference : getTodayDateString();

  if (!targetDateStr || targetDateStr >= todayStr) return 0;

  const [tY, tM, tD] = todayStr.split('-').map((n) => parseInt(n, 10));
  const [dY, dM, dD] = targetDateStr.split('-').map((n) => parseInt(n, 10));
  const tDate = new Date(Date.UTC(tY, tM - 1, tD));
  const dDate = new Date(Date.UTC(dY, dM - 1, dD));
  const diffMs = tDate.getTime() - dDate.getTime();
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Advance the schedule after a payment execution or when skipping an occurrence.
 * The recurrence rule is authoritative: occurrences advance according to the schedule rule,
 * never altering future cadence based on the execution date.
 */
export function advanceNextDueDate(intention: PaymentIntention): string {
  const currentDueStr = intention.nextDueDate;
  const [cYear, cMonth, cDay] = currentDueStr.split('-').map((n) => parseInt(n, 10));
  const currentDueDate = new Date(Date.UTC(cYear, cMonth - 1, cDay));

  switch (intention.frequency) {
    case 'monthly': {
      const targetDay = intention.dueDayOfMonth || cDay;
      const nextMonth = cMonth === 12 ? 1 : cMonth + 1;
      const nextYear = cMonth === 12 ? cYear + 1 : cYear;
      const maxDays = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
      const clampedDay = Math.min(targetDay, maxDays);
      return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
    }

    case 'weekly': {
      const nextDate = new Date(currentDueDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      return nextDate.toISOString().split('T')[0];
    }

    case 'biweekly': {
      const nextDate = new Date(currentDueDate.getTime() + 14 * 24 * 60 * 60 * 1000);
      return nextDate.toISOString().split('T')[0];
    }

    case 'custom_days': {
      const interval = Math.max(1, intention.customIntervalDays || 30);
      const nextDate = new Date(currentDueDate.getTime() + interval * 24 * 60 * 60 * 1000);
      return nextDate.toISOString().split('T')[0];
    }

    case 'once': {
      // Completed one-time payment remains on its execution date or stays as is
      return currentDueStr;
    }

    default:
      return currentDueStr;
  }
}

/**
 * Generate all occurrences of an intention for a specific month (year, 0-indexed month)
 */
export function getOccurrencesForMonth(
  intention: PaymentIntention,
  year: number,
  month: number // 0-11
): string[] {
  if (!intention.active) return [];

  const monthStart = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthEnd = new Date(Date.UTC(year, month, daysInMonth));

  const occurrences = new Set<string>();

  // If nextDueDate is explicitly in this month, ensure it's always included
  if (intention.nextDueDate) {
    const [dYear, dMonth] = intention.nextDueDate.split('-').map((n) => parseInt(n, 10));
    if (dYear === year && dMonth === month + 1) {
      occurrences.add(intention.nextDueDate);
    }
  }

  // Generate occurrences according to frequency rules
  switch (intention.frequency) {
    case 'monthly': {
      const targetDay = intention.dueDayOfMonth || parseInt(intention.nextDueDate.split('-')[2], 10) || 1;
      const clampedDay = Math.min(targetDay, daysInMonth);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
      occurrences.add(dateStr);
      break;
    }

    case 'weekly': {
      const targetWeekday = intention.dueDayOfWeek !== undefined
        ? intention.dueDayOfWeek
        : new Date(intention.nextDueDate + 'T12:00:00Z').getUTCDay();

      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(Date.UTC(year, month, day));
        if (d.getUTCDay() === targetWeekday) {
          occurrences.add(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
        }
      }
      break;
    }

    case 'biweekly': {
      const startStr = intention.startDate || intention.nextDueDate;
      const [sYear, sMonth, sDay] = startStr.split('-').map((n) => parseInt(n, 10));
      let current = new Date(Date.UTC(sYear, sMonth - 1, sDay));

      if (intention.dueDayOfWeek !== undefined) {
        const diff = (intention.dueDayOfWeek - current.getUTCDay() + 7) % 7;
        current = new Date(current.getTime() + diff * 24 * 60 * 60 * 1000);
      }

      // Step backwards if current > monthEnd
      while (current.getTime() > monthEnd.getTime()) {
        current = new Date(current.getTime() - 14 * 24 * 60 * 60 * 1000);
      }
      // Step backwards until before monthStart
      while (current.getTime() >= monthStart.getTime()) {
        current = new Date(current.getTime() - 14 * 24 * 60 * 60 * 1000);
      }
      // Step forwards through month
      current = new Date(current.getTime() + 14 * 24 * 60 * 60 * 1000);
      while (current.getTime() <= monthEnd.getTime()) {
        if (current.getTime() >= monthStart.getTime()) {
          const occYear = current.getUTCFullYear();
          const occMonth = current.getUTCMonth() + 1;
          const occDay = current.getUTCDate();
          occurrences.add(
            `${occYear}-${String(occMonth).padStart(2, '0')}-${String(occDay).padStart(2, '0')}`
          );
        }
        current = new Date(current.getTime() + 14 * 24 * 60 * 60 * 1000);
      }
      break;
    }

    case 'custom_days': {
      const interval = Math.max(1, intention.customIntervalDays || 30);
      const startStr = intention.startDate || intention.nextDueDate;
      const [sYear, sMonth, sDay] = startStr.split('-').map((n) => parseInt(n, 10));
      let current = new Date(Date.UTC(sYear, sMonth - 1, sDay));

      while (current.getTime() > monthEnd.getTime()) {
        current = new Date(current.getTime() - interval * 24 * 60 * 60 * 1000);
      }
      while (current.getTime() >= monthStart.getTime()) {
        current = new Date(current.getTime() - interval * 24 * 60 * 60 * 1000);
      }
      current = new Date(current.getTime() + interval * 24 * 60 * 60 * 1000);
      while (current.getTime() <= monthEnd.getTime()) {
        if (current.getTime() >= monthStart.getTime()) {
          const occYear = current.getUTCFullYear();
          const occMonth = current.getUTCMonth() + 1;
          const occDay = current.getUTCDate();
          occurrences.add(
            `${occYear}-${String(occMonth).padStart(2, '0')}-${String(occDay).padStart(2, '0')}`
          );
        }
        current = new Date(current.getTime() + interval * 24 * 60 * 60 * 1000);
      }
      break;
    }

    case 'once': {
      if (intention.nextDueDate) {
        const [dYear, dMonth] = intention.nextDueDate.split('-').map((n) => parseInt(n, 10));
        if (dYear === year && dMonth === month + 1) {
          occurrences.add(intention.nextDueDate);
        }
      }
      break;
    }
  }

  return Array.from(occurrences).sort();
}

/**
 * Reconciles payment intentions with historical completed transactions.
 * Guarantees that any one-time intention with a matching confirmed transaction
 * or isCompleted flag is permanently marked as terminal COMPLETED (isCompleted: true, active: false).
 */
export function reconcileCompletedIntentions(
  intentions: PaymentIntention[],
  history?: CompletedTransactionRecord[]
): PaymentIntention[] {
  if (!intentions || intentions.length === 0) return [];
  const completedIntentionIds = new Set(
    (history || [])
      .filter((h) => h.status === 'CONFIRMED_ON_CHAIN' || (h.isSimulation && h.status !== 'FAILED_ON_CHAIN'))
      .map((h) => h.intentionId)
      .filter(Boolean)
  );

  return intentions.map((intent) => {
    if (
      intent.frequency === 'once' &&
      (intent.isCompleted || !!intent.completedAt || completedIntentionIds.has(intent.id))
    ) {
      const match = (history || []).find(
        (h) => h.intentionId === intent.id && (h.status === 'CONFIRMED_ON_CHAIN' || h.isSimulation)
      );
      return {
        ...intent,
        active: false,
        isCompleted: true,
        completedAt:
          intent.completedAt ||
          match?.confirmedAt ||
          intent.lastCheckedAt ||
          new Date().toISOString(),
      };
    }
    return intent;
  });
}
