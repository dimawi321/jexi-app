import React, { useEffect } from 'react';
import { SkipForward } from 'lucide-react';
import { PaymentIntention, Recipient } from '../types';
import { advanceNextDueDate, formatScheduleCadence, getIntentionStatus } from '../utils/scheduler';

interface SkipConfirmationModalProps {
  intention: PaymentIntention | null;
  recipients: Recipient[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const SkipConfirmationModal: React.FC<SkipConfirmationModalProps> = ({
  intention,
  recipients,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!intention) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [intention, onCancel]);

  if (!intention) return null;

  const recipient = recipients.find((r) => r.id === intention.recipientId);
  const status = getIntentionStatus(intention);
  const isOverdue = status === 'OVERDUE';

  return (
    <div
      className="fixed inset-0 z-50 bg-jexi-overlay backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 text-jexi-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 pb-3 border-b border-jexi-subtle">
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
            <SkipForward className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-jexi-primary">Skip This Occurrence?</h3>
            <p className="text-xs text-jexi-muted">Advance schedule without creating a transaction</p>
          </div>
        </div>

        <div className="bg-jexi-elevated border border-jexi-subtle rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-jexi-muted">Recipient:</span>
            <span className="font-bold text-jexi-primary">
              {recipient?.name || 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-jexi-muted">{isOverdue ? 'Current Overdue Date:' : 'Current Due Date:'}</span>
            <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{intention.nextDueDate}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-jexi-muted">New Next Due Date:</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{advanceNextDueDate(intention)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-jexi-muted">Recurrence Cadence:</span>
            <span className="text-jexi-secondary">{formatScheduleCadence(intention)}</span>
          </div>
        </div>

        <div className="p-3 bg-jexi-surface border border-jexi-subtle rounded-xl text-xs text-jexi-muted space-y-1">
          <p className="text-jexi-primary font-medium">Deterministic Non-Execution Guarantee</p>
          <p className="text-[11px] text-jexi-muted">
            No wallet signing will take place, no transaction will be recorded in History, and no funds will be moved.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-jexi-divider">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary border border-jexi-subtle text-xs font-medium transition-colors cursor-pointer"
          >
            {isOverdue ? 'Keep Overdue' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white dark:bg-amber-400 dark:hover:bg-amber-300 dark:text-zinc-950 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <SkipForward className="w-3.5 h-3.5" />
            <span>Confirm Skip</span>
          </button>
        </div>
      </div>
    </div>
  );
};
