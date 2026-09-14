import React, { useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  CheckCircle,
  PauseCircle,
  AlertTriangle,
} from 'lucide-react';
import { PaymentIntention, Recipient, CompletedTransactionRecord } from '../types';
import { getTodayDateString } from '../constants';
import {
  getIntentionStatus,
  getDaysOverdue,
  getOccurrencesForMonth,
  formatScheduleCadence,
} from '../utils/scheduler';

interface CalendarViewProps {
  intentions: PaymentIntention[];
  recipients: Recipient[];
  history?: CompletedTransactionRecord[];
  onPrepareTransaction: (intention: PaymentIntention) => void;
}

export interface CalendarItem {
  id: string;
  type: 'intention' | 'history';
  status: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'PAUSED' | 'COMPLETED';
  amount: number;
  tokenSymbol: string;
  recipientName: string;
  recipientAddress: string;
  intention?: PaymentIntention;
  historyRecord?: CompletedTransactionRecord;
  isProjected?: boolean;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  intentions,
  recipients,
  history = [],
  onPrepareTransaction,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(getTodayDateString());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const todayStr = getTodayDateString();

  // Days calculation
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  // Map of date string YYYY-MM-DD -> CalendarItem[] computed with authoritative status engine
  const dateItemMap: Record<string, CalendarItem[]> = {};

  const addItemToDate = (dateStr: string, item: CalendarItem) => {
    if (!dateItemMap[dateStr]) {
      dateItemMap[dateStr] = [];
    }
    dateItemMap[dateStr].push(item);
  };

  // 1. Process active and paused intentions
  intentions.forEach((intent) => {
    const recipient = recipients.find((r) => r.id === intent.recipientId);
    const recipientName = recipient?.name || 'Unknown Recipient';
    const recipientAddress = recipient?.address || '';
    const status = getIntentionStatus(intent);

    // Current scheduled occurrence on nextDueDate
    if (intent.nextDueDate) {
      const [dYear, dMonth] = intent.nextDueDate.split('-').map((n) => parseInt(n, 10));
      if (dYear === year && dMonth === month + 1) {
        addItemToDate(intent.nextDueDate, {
          id: `curr-${intent.id}`,
          type: 'intention',
          status: status, // OVERDUE, DUE_TODAY, UPCOMING, or PAUSED
          amount: intent.amount,
          tokenSymbol: intent.tokenSymbol,
          recipientName,
          recipientAddress,
          intention: intent,
          isProjected: false,
        });
      }
    }

    // Projected future recurring occurrences (only strictly in future > todayStr and > intent.nextDueDate)
    if (intent.active && intent.frequency !== 'once') {
      const occurrences = getOccurrencesForMonth(intent, year, month);
      occurrences.forEach((dateStr) => {
        if (dateStr > todayStr && dateStr > intent.nextDueDate) {
          const alreadyExists = dateItemMap[dateStr]?.some(
            (existing) => existing.intention?.id === intent.id
          );
          if (!alreadyExists) {
            addItemToDate(dateStr, {
              id: `proj-${intent.id}-${dateStr}`,
              type: 'intention',
              status: 'UPCOMING',
              amount: intent.amount,
              tokenSymbol: intent.tokenSymbol,
              recipientName,
              recipientAddress,
              intention: intent,
              isProjected: true,
            });
          }
        }
      });
    }
  });

  // 2. Process completed historical transactions
  if (history && history.length > 0) {
    history.forEach((record) => {
      const datePart = record.confirmedAt ? record.confirmedAt.split('T')[0] : '';
      if (!datePart) return;
      const [hYear, hMonth] = datePart.split('-').map((n) => parseInt(n, 10));
      if (hYear === year && hMonth === month + 1) {
        addItemToDate(datePart, {
          id: `hist-${record.id}`,
          type: 'history',
          status: 'COMPLETED',
          amount: record.amount,
          tokenSymbol: record.tokenSymbol,
          recipientName: record.recipientName,
          recipientAddress: record.recipientAddress,
          historyRecord: record,
          isProjected: false,
        });
      }
    });
  }

  const selectedItems = dateItemMap[selectedDateStr] || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-emerald-400" />
            Payment Calendar
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Your scheduled payments at a glance.
          </p>
        </div>
      </div>

      {/* Month Navigator */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-zinc-100 text-sm">
            {monthName} {year}
          </h3>
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setCurrentDate(new Date());
                setSelectedDateStr(getTodayDateString());
              }}
              title="Return to today"
              className="px-2.5 py-1 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors font-medium border border-zinc-800"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              aria-label="Next month"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-zinc-500 mb-1.5">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty prefix slots */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} className="h-10 sm:h-12 rounded-lg bg-zinc-950/20" />
          ))}

          {/* Days of current month */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const isToday = dayStr === todayStr;
            const isSelected = dayStr === selectedDateStr;
            const dayItems = dateItemMap[dayStr] || [];

            // Authoritative status evaluation for the date
            const hasOverdue = dayItems.some((item) => item.status === 'OVERDUE');
            const hasDueToday = !hasOverdue && dayItems.some((item) => item.status === 'DUE_TODAY');
            const hasUpcoming = !hasOverdue && !hasDueToday && dayItems.some((item) => item.status === 'UPCOMING');
            const hasCompleted = !hasOverdue && !hasDueToday && !hasUpcoming && dayItems.some((item) => item.status === 'COMPLETED');
            const hasPaused = !hasOverdue && !hasDueToday && !hasUpcoming && !hasCompleted && dayItems.some((item) => item.status === 'PAUSED');

            let cellClass = 'h-10 sm:h-12 rounded-lg p-1 text-left relative flex flex-col justify-between transition-all ';
            if (isSelected && isToday) {
              cellClass += 'bg-emerald-500/20 border-2 border-emerald-400 ring-2 ring-emerald-500/30 text-emerald-200';
            } else if (isSelected) {
              cellClass += 'bg-zinc-800/90 border-2 border-emerald-500/80 text-zinc-100 ring-1 ring-emerald-500/30';
            } else if (isToday) {
              cellClass += 'bg-zinc-850 border border-amber-500/60 text-zinc-100 shadow-xs';
            } else {
              cellClass += 'bg-zinc-950/60 hover:bg-zinc-900 border border-zinc-900 text-zinc-400';
            }

            const dotClass = hasOverdue
              ? 'bg-rose-500 shadow-xs'
              : hasDueToday
              ? 'bg-amber-400 animate-pulse'
              : hasUpcoming
              ? 'bg-emerald-400'
              : hasCompleted
              ? 'bg-zinc-500'
              : hasPaused
              ? 'bg-zinc-600'
              : '';

            const labelClass = hasOverdue
              ? 'text-rose-400'
              : hasDueToday
              ? 'text-amber-400'
              : hasUpcoming
              ? 'text-emerald-400'
              : hasCompleted
              ? 'text-zinc-400'
              : 'text-zinc-500';

            return (
              <button
                key={dayStr}
                onClick={() => setSelectedDateStr(dayStr)}
                className={cellClass}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={`text-[11px] font-semibold flex items-center gap-1 ${isToday ? 'text-amber-400 font-bold' : ''}`}>
                    {dayNum}
                    {isToday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Today" />
                    )}
                  </span>
                  {dayItems.length > 0 && (
                    <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
                  )}
                </div>

                {dayItems.length > 0 && (
                  <div className={`text-[9px] font-bold truncate ${labelClass}`}>
                    {hasOverdue ? (
                      <span className="flex items-center gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-rose-500 shrink-0" />
                        {dayItems.length === 1
                          ? `${dayItems[0].amount} ${dayItems[0].tokenSymbol.split(' ')[1] || dayItems[0].tokenSymbol}`
                          : `${dayItems.length} txs`}
                      </span>
                    ) : hasDueToday ? (
                      <span className="flex items-center gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                        {dayItems.length === 1
                          ? `${dayItems[0].amount} ${dayItems[0].tokenSymbol.split(' ')[1] || dayItems[0].tokenSymbol}`
                          : `${dayItems.length} txs`}
                      </span>
                    ) : hasUpcoming ? (
                      dayItems.length === 1
                        ? `${dayItems[0].amount} ${dayItems[0].tokenSymbol.split(' ')[1] || dayItems[0].tokenSymbol}`
                        : `${dayItems.length} txs`
                    ) : hasCompleted ? (
                      dayItems.length === 1 ? `✓ ${dayItems[0].amount}` : `✓ ${dayItems.length} done`
                    ) : (
                      'Paused'
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Details Panel */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-2">
              <span>
                {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              {selectedDateStr === todayStr ? (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/40 uppercase">
                  Today
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-medium border border-zinc-700">
                  Selected Date
                </span>
              )}
            </h4>
          </div>
          <span className="text-xs text-zinc-400">
            {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-3 space-y-2.5">
          {selectedItems.length === 0 ? (
            <p className="text-xs text-zinc-500 py-3 text-center">
              No payments scheduled or executed for this date.
            </p>
          ) : (
            selectedItems.map((item) => {
              if (item.type === 'history' && item.historyRecord) {
                const hist = item.historyRecord;
                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/60 text-zinc-300 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-zinc-100">
                          {item.amount} {item.tokenSymbol}
                        </span>
                        <span className="text-xs text-zinc-400">→</span>
                        <span className="text-xs font-semibold text-zinc-200">{item.recipientName}</span>
                        <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 text-[9px] font-bold rounded border border-emerald-500/30 uppercase flex items-center gap-1">
                          <CheckCircle className="w-2.5 h-2.5" />
                          COMPLETED
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        Executed on {hist.confirmedAt.split('T')[0]} •{' '}
                        <span className="font-mono text-zinc-500">
                          {hist.txHash ? `${hist.txHash.substring(0, 10)}...` : 'Simulated'}
                        </span>
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-zinc-500">In History</span>
                  </div>
                );
              }

              const intent = item.intention;
              if (!intent) return null;

              const isOverdue = item.status === 'OVERDUE';
              const isDueToday = item.status === 'DUE_TODAY';
              const isPaused = item.status === 'PAUSED';

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    isOverdue
                      ? 'bg-rose-950/20 border-rose-500/50 text-rose-200'
                      : isDueToday
                      ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                      : isPaused
                      ? 'bg-zinc-950/40 border-zinc-800 text-zinc-400'
                      : 'bg-zinc-950 border-zinc-800/80 text-zinc-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-zinc-100">
                        {intent.amount} {intent.tokenSymbol}
                      </span>
                      <span className="text-xs text-zinc-400">→</span>
                      <span className="text-xs font-semibold text-emerald-400">{item.recipientName}</span>
                      {isOverdue && (
                        <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 text-[9px] font-extrabold rounded border border-rose-500/40 uppercase">
                          OVERDUE ({getDaysOverdue(intent)}d)
                        </span>
                      )}
                      {isDueToday && (
                        <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[9px] font-bold rounded border border-amber-500/40 uppercase">
                          DUE TODAY
                        </span>
                      )}
                      {isPaused && (
                        <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[9px] font-medium rounded border border-zinc-700 uppercase flex items-center gap-1">
                          <PauseCircle className="w-2.5 h-2.5" />
                          PAUSED
                        </span>
                      )}
                      {!isOverdue && !isDueToday && !isPaused && (
                        <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-[9px] font-medium rounded border border-zinc-700 uppercase">
                          {item.isProjected ? 'UPCOMING (Projected)' : 'UPCOMING'}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      {formatScheduleCadence(intent)} • <span className="font-mono text-zinc-500">{item.recipientAddress.substring(0, 8)}...</span>
                    </p>
                  </div>

                  {!isPaused ? (
                    <button
                      onClick={() => onPrepareTransaction(intent)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        isOverdue
                          ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-md'
                          : isDueToday
                          ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow-md'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{isOverdue ? 'Review (Overdue)' : isDueToday ? 'Review (Due)' : 'Review & Prepare'}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  ) : (
                    <span className="text-[11px] text-zinc-500 italic">Paused</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

