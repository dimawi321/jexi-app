import React from 'react';
import {
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle,
  Plus,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Users,
  AlertTriangle,
  SkipForward,
} from 'lucide-react';
import { PaymentIntention, Recipient } from '../types';
import { getTodayDateString } from '../constants';
import { getIntentionStatus, getDaysOverdue } from '../utils/scheduler';
import { NavTab } from './BottomNav';

interface DashboardViewProps {
  intentions: PaymentIntention[];
  recipients: Recipient[];
  completedCount: number;
  onNavigateTab: (tab: NavTab) => void;
  onPrepareTransaction: (intention: PaymentIntention) => void;
  onOpenNewIntention: () => void;
  onOpenNewRecipient: () => void;
  onSkipOccurrence?: (intentionId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  intentions,
  recipients,
  completedCount,
  onNavigateTab,
  onPrepareTransaction,
  onOpenNewIntention,
  onOpenNewRecipient,
  onSkipOccurrence,
}) => {
  const todayStr = getTodayDateString();
  const todayDate = new Date();
  const formattedToday = todayDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const overdueIntentions = intentions.filter((i) => getIntentionStatus(i) === 'OVERDUE');
  const dueTodayIntentions = intentions.filter((i) => getIntentionStatus(i) === 'DUE_TODAY');
  const totalActionRequired = overdueIntentions.length + dueTodayIntentions.length;

  const upcomingIntentions = intentions
    .filter((i) => getIntentionStatus(i) === 'UPCOMING')
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  return (
    <div className="space-y-5">
      {/* Date & Welcome Card */}
      <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800/90 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>{formattedToday}</span>
          </div>
          <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            Self-Custody Monitor
          </span>
        </div>

        <div className="mt-3">
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
            {overdueIntentions.length > 0 ? (
              <span className="text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse" />
                {overdueIntentions.length} payment{overdueIntentions.length > 1 ? 's' : ''} overdue for review
              </span>
            ) : dueTodayIntentions.length > 0 ? (
              <span className="text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                {dueTodayIntentions.length} payment{dueTodayIntentions.length > 1 ? 's' : ''} due today
              </span>
            ) : (
              'All scheduled payments up to date'
            )}
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            JEXI monitors your payment schedules, verifies details, and prepares transactions for your approval.
          </p>
        </div>

        {/* Quick Stat Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-4 border-t border-zinc-800/80 text-center">
          <div className="bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/60">
            <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Overdue</div>
            <div className={`text-base font-bold mt-0.5 ${overdueIntentions.length > 0 ? 'text-rose-400' : 'text-zinc-400'}`}>
              {overdueIntentions.length}
            </div>
          </div>
          <div className="bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/60">
            <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Due Today</div>
            <div className={`text-base font-bold mt-0.5 ${dueTodayIntentions.length > 0 ? 'text-amber-400' : 'text-zinc-400'}`}>
              {dueTodayIntentions.length}
            </div>
          </div>
          <div className="bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/60">
            <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Upcoming</div>
            <div className="text-base font-bold text-sky-400 mt-0.5">{upcomingIntentions.length}</div>
          </div>
          <div className="bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/60">
            <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Recipients</div>
            <div className="text-base font-bold text-zinc-300 mt-0.5">{recipients.length}</div>
          </div>
        </div>
      </div>

      {/* OVERDUE PAYMENTS SECTION */}
      {overdueIntentions.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Action Required: Overdue Payments
            </h3>
            <span className="text-[10px] font-mono text-rose-400/80">Scheduled date has elapsed</span>
          </div>

          <div className="space-y-2">
            {overdueIntentions.map((intent) => {
              const rec = recipients.find((r) => r.id === intent.recipientId);
              const days = getDaysOverdue(intent.nextDueDate, todayStr);
              return (
                <div
                  key={intent.id}
                  className="p-4 bg-rose-950/20 border border-rose-500/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-zinc-100">
                        {intent.amount.toLocaleString()} {intent.tokenSymbol}
                      </span>
                      <span className="text-xs text-zinc-400">→</span>
                      <span className="text-sm font-semibold text-emerald-400">{rec?.name || 'Recipient'}</span>
                      <span className="px-2 py-0.5 bg-rose-500/25 text-rose-300 text-[10px] font-extrabold rounded border border-rose-500/50 uppercase tracking-wider">
                        OVERDUE ({days} day{days === 1 ? '' : 's'})
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Scheduled for <strong className="text-rose-300">{intent.nextDueDate}</strong> on{' '}
                      <span className="text-zinc-300 font-medium">Base Sepolia</span>
                      {intent.notes ? ` • "${intent.notes}"` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onSkipOccurrence && (
                      <button
                        onClick={() => onSkipOccurrence(intent.id)}
                        className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors flex items-center gap-1 border border-zinc-700/60"
                        title="Skip this occurrence without executing"
                      >
                        <SkipForward className="w-3.5 h-3.5 text-amber-400" />
                        <span>Skip</span>
                      </button>
                    )}
                    <button
                      onClick={() => onPrepareTransaction(intent)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs transition-all shadow-md shrink-0"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Review (Overdue)</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DUE TODAY SECTION */}
      {dueTodayIntentions.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              Payments Due Today
            </h3>
            <span className="text-[10px] font-mono text-zinc-500">Ready for review</span>
          </div>

          <div className="space-y-2">
            {dueTodayIntentions.map((intent) => {
              const rec = recipients.find((r) => r.id === intent.recipientId);
              return (
                <div
                  key={intent.id}
                  className="p-4 bg-amber-950/20 border border-amber-500/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-zinc-100">
                        {intent.amount.toLocaleString()} {intent.tokenSymbol}
                      </span>
                      <span className="text-xs text-zinc-400">→</span>
                      <span className="text-sm font-semibold text-emerald-400">{rec?.name || 'Recipient'}</span>
                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded border border-amber-500/40">
                        DUE TODAY
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      Due today on <span className="text-zinc-300 font-medium">Base Sepolia</span>
                      {intent.notes ? ` • "${intent.notes}"` : ''}
                    </p>
                  </div>

                  <button
                    onClick={() => onPrepareTransaction(intent)}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs transition-all shadow-md shrink-0"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Review (Due)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming Payments List */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-sky-400" />
            Upcoming Payments
          </h3>
          <button
            onClick={() => onNavigateTab('calendar')}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
          >
            Open Calendar
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {upcomingIntentions.length === 0 ? (
          <div className="p-5 text-center bg-zinc-900/40 border border-zinc-800 rounded-xl text-xs text-zinc-500">
            No upcoming payments scheduled in queue.
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingIntentions.slice(0, 4).map((intent) => {
              const rec = recipients.find((r) => r.id === intent.recipientId);
              return (
                <div
                  key={intent.id}
                  className="p-3.5 bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 rounded-xl flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-center text-zinc-300 shrink-0">
                      <span className="text-[9px] uppercase font-bold text-zinc-500">
                        {new Date(intent.nextDueDate).toLocaleString('default', { month: 'short' })}
                      </span>
                      <span className="text-xs font-extrabold">{new Date(intent.nextDueDate).getDate()}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-zinc-200">{rec?.name || 'Recipient'}</span>
                        <span className="text-xs text-emerald-400 font-mono">
                          {intent.amount.toLocaleString()} {intent.tokenSymbol}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-0.5 capitalize">
                        {intent.frequency} cadence • Base Sepolia
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => onPrepareTransaction(intent)}
                    className="text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-800/80 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    Inspect
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Trust & Architecture Banner */}
      <div className="p-4 bg-zinc-900/40 border border-zinc-800/80 rounded-xl space-y-2 text-left">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Self-Custody & Hardware Security</span>
        </div>
        <p className="text-[11px] text-zinc-400 leading-relaxed">
          JEXI is not a wallet and never stores private keys, seed phrases, or Ledger PINs. It prepares transactions for you to review, while your hardware wallet remains the sole authority over your assets.
        </p>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          onClick={onOpenNewIntention}
          className="p-3 bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 rounded-xl text-left transition-colors flex items-center justify-between group"
        >
          <div>
            <span className="block text-xs font-bold text-zinc-200">Schedule Payment</span>
            <span className="block text-[10px] text-zinc-500 mt-0.5">Set recurring payment</span>
          </div>
          <Plus className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
        </button>

        <button
          onClick={onOpenNewRecipient}
          className="p-3 bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 rounded-xl text-left transition-colors flex items-center justify-between group"
        >
          <div>
            <span className="block text-xs font-bold text-zinc-200">Recipient Book</span>
            <span className="block text-[10px] text-zinc-500 mt-0.5">Saved profiles</span>
          </div>
          <Users className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  );
};
