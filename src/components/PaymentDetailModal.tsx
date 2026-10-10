import React, { useState } from 'react';
import { Shield, Clock, Copy, Check, ExternalLink, ArrowRight, CheckCircle2, AlertTriangle, Calendar, XCircle } from 'lucide-react';
import { PaymentIntention, Recipient } from '../types';
import { SUPPORTED_NETWORKS, getTodayDateString, formatTokenSymbol } from '../constants';
import { getIntentionStatus, getDaysOverdue, formatScheduleCadence } from '../utils/scheduler';

interface PaymentDetailModalProps {
  intention: PaymentIntention;
  recipient: Recipient;
  onClose: () => void;
  onPrepareTransaction: (intention: PaymentIntention) => void;
}

export const PaymentDetailModal: React.FC<PaymentDetailModalProps> = ({
  intention,
  recipient,
  onClose,
  onPrepareTransaction,
}) => {
  const [copied, setCopied] = useState(false);
  const todayStr = getTodayDateString();
  const status = getIntentionStatus(intention);
  const isCompleted = status === 'COMPLETED';
  const isRejected = status === 'REJECTED';
  const isPaused = status === 'PAUSED';
  const isOverdue = status === 'OVERDUE';
  const isDueToday = status === 'DUE_TODAY';
  const daysOverdue = isOverdue ? getDaysOverdue(intention) : 0;
  const network = SUPPORTED_NETWORKS[intention.networkId];

  const handleCopy = () => {
    navigator.clipboard.writeText(recipient.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-jexi-overlay backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-jexi-primary">
        <div className="flex items-center justify-between pb-3 border-b border-jexi-subtle">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-base font-bold text-jexi-primary">Payment Intention Details</h3>
          </div>
          <button
            onClick={onClose}
            className="text-jexi-muted hover:text-jexi-primary p-1 text-sm font-semibold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Status Indicator */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between ${
            isCompleted
              ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
              : isRejected
              ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-300'
              : isOverdue
              ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-300'
              : isDueToday
              ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/40 text-amber-900 dark:text-amber-300'
              : isPaused
              ? 'bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
              : 'bg-jexi-elevated border-jexi-subtle text-jexi-secondary'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            {isCompleted ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : isRejected ? (
              <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            ) : isOverdue ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            ) : isDueToday ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            )}
            <span>
              Status:{' '}
              {isCompleted
                ? 'COMPLETED (TERMINAL)'
                : isRejected
                ? 'REJECTED (TERMINAL)'
                : isOverdue
                ? `OVERDUE (by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'})`
                : isDueToday
                ? 'DUE TODAY'
                : isPaused
                ? 'PAUSED'
                : 'SCHEDULED (UPCOMING)'}
            </span>
          </div>
          <span className="text-xs font-mono font-bold">
            {isCompleted && intention.completedAt
              ? intention.completedAt.split('T')[0]
              : isRejected && intention.rejectedAt
              ? intention.rejectedAt.split('T')[0]
              : intention.nextDueDate}
          </span>
        </div>

        {/* Breakdown Items */}
        <div className="bg-jexi-elevated border border-jexi-subtle rounded-xl p-4 space-y-3 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-jexi-divider">
            <span className="text-jexi-muted">Recipient Name</span>
            <span className="font-semibold text-jexi-primary">{recipient.name}</span>
          </div>

          <div className="space-y-1 pb-2 border-b border-jexi-divider">
            <div className="flex justify-between items-center">
              <span className="text-jexi-muted">Wallet Address</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  className="p-1 hover:bg-jexi-hover rounded text-jexi-muted hover:text-jexi-primary transition-colors cursor-pointer"
                  title="Copy address"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={`${network?.explorerUrl || 'https://basescan.org'}/address/${recipient.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 hover:bg-jexi-hover rounded text-jexi-muted hover:text-jexi-primary transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
            <p className="font-mono text-[11px] text-jexi-secondary break-all bg-jexi-surface px-2 py-1 rounded border border-jexi-subtle">
              {recipient.address}
            </p>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-jexi-divider">
            <span className="text-jexi-muted">Target Network</span>
            <span className="font-medium text-jexi-primary">{network?.name || 'Base'} (Chain ID {network?.chainId || 8453})</span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-jexi-divider">
            <span className="text-jexi-muted">Asset & Amount</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm font-mono tabular-nums">
              {intention.amount.toLocaleString()} {formatTokenSymbol(intention.tokenSymbol)}
            </span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-jexi-divider">
            <span className="text-jexi-muted">Recurring Frequency</span>
            <span className="capitalize font-medium text-jexi-primary">{intention.frequency}</span>
          </div>

          {intention.notes && (
            <div className="pt-1">
              <span className="text-jexi-muted block mb-1">Note / Memo:</span>
              <p className="text-jexi-secondary italic bg-jexi-surface p-2 rounded border border-jexi-subtle">
                "{intention.notes}"
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-jexi-divider">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary border border-jexi-subtle text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>

          {!isCompleted && !isPaused && !isRejected && (
            <button
              onClick={() => {
                onClose();
                onPrepareTransaction(intention);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
                isOverdue
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : isDueToday
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Prepare Payment</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
