import React, { useState } from 'react';
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
import { getTodayDateString, formatTokenSymbol, SUPPORTED_NETWORKS } from '../constants';
import { getIntentionStatus, getDaysOverdue } from '../utils/scheduler';
import { NavTab } from './BottomNav';
import { SkipConfirmationModal } from './SkipConfirmationModal';

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
  const [intentionToSkip, setIntentionToSkip] = useState<PaymentIntention | null>(null);
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
    <div className="space-y-6">
      {/* Executive Header & Summary */}
      <div className="bg-jexi-surface border border-jexi-subtle rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs dark:shadow-none transition-colors">
        <div className="flex items-center justify-between gap-3 text-xs text-jexi-muted flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-jexi-muted" />
            <span>{formattedToday}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Supported: Base Mainnet (8453) • Est. Confirmation &lt; 12s</span>
          </div>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-jexi-primary tracking-tight text-balance">
            {overdueIntentions.length > 0 ? (
              <span className="text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-400 shrink-0" />
                {overdueIntentions.length} payment{overdueIntentions.length > 1 ? 's' : ''} overdue for review
              </span>
            ) : dueTodayIntentions.length > 0 ? (
              <span className="text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0" />
                {dueTodayIntentions.length} payment{dueTodayIntentions.length > 1 ? 's' : ''} due today
              </span>
            ) : (
              'All scheduled payments are current'
            )}
          </h1>
          <p className="text-xs text-jexi-secondary mt-1.5 leading-relaxed max-w-2xl">
            JEXI deterministic preflight engine verifies recipient addresses, tokens, and balances before preparing transactions for self-custodial approval.
          </p>
        </div>

        {/* Metrics Row - High-density tabular figures */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-jexi-divider">
          <div className="p-3 bg-jexi-elevated rounded-xl border border-jexi-subtle">
            <span className="text-[11px] font-medium text-jexi-muted block">Overdue</span>
            <span className={`text-lg font-bold font-mono tabular-nums block mt-0.5 ${overdueIntentions.length > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-jexi-muted'}`}>
              {overdueIntentions.length}
            </span>
          </div>
          <div className="p-3 bg-jexi-elevated rounded-xl border border-jexi-subtle">
            <span className="text-[11px] font-medium text-jexi-muted block">Due Today</span>
            <span className={`text-lg font-bold font-mono tabular-nums block mt-0.5 ${dueTodayIntentions.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-jexi-muted'}`}>
              {dueTodayIntentions.length}
            </span>
          </div>
          <div className="p-3 bg-jexi-elevated rounded-xl border border-jexi-subtle">
            <span className="text-[11px] font-medium text-jexi-muted block">Upcoming</span>
            <span className="text-lg font-bold font-mono tabular-nums text-jexi-primary block mt-0.5">
              {upcomingIntentions.length}
            </span>
          </div>
          <div className="p-3 bg-jexi-elevated rounded-xl border border-jexi-subtle">
            <span className="text-[11px] font-medium text-jexi-muted block">Saved Recipients</span>
            <span className="text-lg font-bold font-mono tabular-nums text-jexi-primary block mt-0.5">
              {recipients.length}
            </span>
          </div>
        </div>
      </div>

      {/* OVERDUE PAYMENTS SECTION */}
      {overdueIntentions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Action Required · Overdue Payments
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-zinc-400 font-mono">Date elapsed</span>
          </div>

          <div className="space-y-2.5">
            {overdueIntentions.map((intent) => {
              const rec = recipients.find((r) => r.id === intent.recipientId);
              const days = getDaysOverdue(intent.nextDueDate, todayStr);
              return (
                <div
                  key={intent.id}
                  className="p-4 bg-jexi-surface border border-rose-200 dark:border-rose-500/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors shadow-xs dark:shadow-none"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-bold text-jexi-primary font-mono tabular-nums">
                        {intent.amount.toLocaleString()} {formatTokenSymbol(intent.tokenSymbol)}
                      </span>
                      <span className="text-jexi-muted">to</span>
                      <span className="font-semibold text-jexi-primary">{rec?.name || 'Recipient'}</span>
                      <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                        · {days} day{days === 1 ? '' : 's'} overdue
                      </span>
                    </div>
                    <div className="text-xs text-jexi-muted flex items-center gap-2">
                      <span>Scheduled for {intent.nextDueDate}</span>
                      {intent.notes && (
                        <>
                          <span className="text-jexi-muted">·</span>
                          <span className="italic text-jexi-muted">"{intent.notes}"</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onSkipOccurrence && (
                      <button
                        onClick={() => setIntentionToSkip(intent)}
                        className="px-3 py-2 rounded-lg bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary text-xs font-medium transition-colors flex items-center gap-1.5 border border-jexi-subtle cursor-pointer"
                        title="Skip this occurrence without executing"
                      >
                        <SkipForward className="w-3.5 h-3.5 text-jexi-muted" />
                        <span>Skip</span>
                      </button>
                    )}
                    <button
                      onClick={() => onPrepareTransaction(intent)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors cursor-pointer shrink-0 shadow-xs"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Prepare Payment</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* DUE TODAY SECTION */}
      {dueTodayIntentions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Action Required · Payments Due Today
              </h2>
            </div>
            <span className="text-xs text-jexi-muted">Scheduled for today</span>
          </div>

          <div className="space-y-2.5">
            {dueTodayIntentions.map((intent) => {
              const rec = recipients.find((r) => r.id === intent.recipientId);
              return (
                <div
                  key={intent.id}
                  className="p-4 bg-jexi-surface border border-amber-200 dark:border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors shadow-xs dark:shadow-none"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-bold text-jexi-primary font-mono tabular-nums">
                        {intent.amount.toLocaleString()} {formatTokenSymbol(intent.tokenSymbol)}
                      </span>
                      <span className="text-jexi-muted">to</span>
                      <span className="font-semibold text-jexi-primary">{rec?.name || 'Recipient'}</span>
                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">· Due today</span>
                    </div>
                    <div className="text-xs text-jexi-muted flex items-center gap-2">
                      <span>{SUPPORTED_NETWORKS[intent.networkId]?.name || 'Base'}</span>
                      {intent.notes && (
                        <>
                          <span className="text-jexi-muted">·</span>
                          <span className="italic text-jexi-muted">"{intent.notes}"</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onSkipOccurrence && (
                      <button
                        onClick={() => setIntentionToSkip(intent)}
                        className="px-3 py-2 rounded-lg bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary text-xs font-medium transition-colors flex items-center gap-1.5 border border-jexi-subtle cursor-pointer"
                        title="Skip this occurrence without executing"
                      >
                        <SkipForward className="w-3.5 h-3.5 text-jexi-muted" />
                        <span>Skip</span>
                      </button>
                    )}
                    <button
                      onClick={() => onPrepareTransaction(intent)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 font-semibold text-xs transition-colors cursor-pointer shrink-0 shadow-xs"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Prepare Payment</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming Payments List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-jexi-muted">
            Upcoming Payments Queue
          </h2>
          <button
            onClick={() => onNavigateTab('calendar')}
            className="text-xs text-jexi-muted hover:text-jexi-primary transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>Open Calendar</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {upcomingIntentions.length === 0 ? (
          <div className="p-6 text-center bg-jexi-surface border border-jexi-subtle rounded-xl text-xs text-jexi-muted">
            No upcoming payments scheduled in the active queue.
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingIntentions.slice(0, 4).map((intent) => {
              const rec = recipients.find((r) => r.id === intent.recipientId);
              return (
                <div
                  key={intent.id}
                  className="p-3.5 bg-jexi-surface border border-jexi-subtle hover:border-jexi-hover rounded-xl flex items-center justify-between gap-3 transition-colors shadow-xs dark:shadow-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-jexi-elevated border border-jexi-subtle flex flex-col items-center justify-center text-jexi-primary shrink-0">
                      <span className="text-[9px] uppercase font-semibold text-jexi-muted">
                        {new Date(intent.nextDueDate).toLocaleString('default', { month: 'short' })}
                      </span>
                      <span className="text-xs font-bold font-mono tabular-nums">
                        {new Date(intent.nextDueDate).getDate()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs text-jexi-primary">{rec?.name || 'Recipient'}</span>
                        <span className="text-xs text-jexi-muted font-mono tabular-nums">
                          {intent.amount.toLocaleString()} {formatTokenSymbol(intent.tokenSymbol)}
                        </span>
                      </div>
                      <div className="text-[11px] text-jexi-muted mt-0.5 capitalize flex items-center gap-1.5">
                        <span>{intent.frequency}</span>
                        <span>·</span>
                        <span>{SUPPORTED_NETWORKS[intent.networkId]?.name || 'Base'}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onPrepareTransaction(intent)}
                    className="text-xs text-jexi-secondary hover:text-jexi-primary bg-jexi-elevated hover:bg-jexi-hover px-3 py-1.5 rounded-lg border border-jexi-subtle transition-colors shrink-0 cursor-pointer"
                  >
                    Review
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <button
          onClick={onOpenNewIntention}
          className="p-4 bg-jexi-surface hover:bg-jexi-hover border border-jexi-subtle rounded-xl text-left transition-colors flex items-center justify-between group cursor-pointer shadow-xs dark:shadow-none"
        >
          <div>
            <span className="block text-xs font-semibold text-jexi-primary">Schedule Payment</span>
            <span className="block text-[11px] text-jexi-muted mt-0.5">Configure new recurring payment intention</span>
          </div>
          <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          onClick={onOpenNewRecipient}
          className="p-4 bg-jexi-surface hover:bg-jexi-hover border border-jexi-subtle rounded-xl text-left transition-colors flex items-center justify-between group cursor-pointer shadow-xs dark:shadow-none"
        >
          <div>
            <span className="block text-xs font-semibold text-jexi-primary">Recipient Directory</span>
            <span className="block text-[11px] text-jexi-muted mt-0.5">Manage verified wallet recipient profiles</span>
          </div>
          <Users className="w-4 h-4 text-jexi-muted group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Self-Custody Guarantee Footnote */}
      <div className="p-4 rounded-xl bg-jexi-elevated/60 border border-jexi-divider flex items-start gap-3 text-left">
        <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-jexi-secondary leading-relaxed">
          JEXI operates strictly as a payment memory and deterministic preflight preparation tool. Private keys, mnemonic seed phrases, and hardware PINs are never stored or requested. Transactions require physical or cryptographic confirmation on your self-custody wallet.
        </p>
      </div>

      {/* Skip Occurrence Confirmation Modal */}
      <SkipConfirmationModal
        intention={intentionToSkip}
        recipients={recipients}
        onConfirm={() => {
          if (intentionToSkip && onSkipOccurrence) {
            onSkipOccurrence(intentionToSkip.id);
          }
          setIntentionToSkip(null);
        }}
        onCancel={() => setIntentionToSkip(null)}
      />
    </div>
  );

};
