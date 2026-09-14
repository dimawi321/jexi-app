import React, { useState } from 'react';
import { Shield, Clock, Copy, Check, ExternalLink, ArrowRight, CheckCircle2, AlertTriangle, Calendar } from 'lucide-react';
import { PaymentIntention, Recipient } from '../types';
import { SUPPORTED_NETWORKS, getTodayDateString } from '../constants';
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-zinc-100">Payment Intention Details</h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 text-sm font-semibold"
          >
            ✕
          </button>
        </div>

        {/* Status Indicator */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between ${
            isOverdue
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              : isDueToday
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-zinc-950 border-zinc-800 text-zinc-300'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            {isOverdue ? (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            ) : isDueToday ? (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            ) : (
              <Clock className="w-4 h-4 text-sky-400" />
            )}
            <span>
              Status:{' '}
              {isOverdue
                ? `OVERDUE (by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'})`
                : isDueToday
                ? 'DUE TODAY'
                : 'SCHEDULED (UPCOMING)'}
            </span>
          </div>
          <span className="text-xs font-mono font-bold">{intention.nextDueDate}</span>
        </div>

        {/* Breakdown Items */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex justify-between items-center pb-2 border-b border-zinc-800/60">
            <span className="text-zinc-400">Recipient Name</span>
            <span className="font-semibold text-zinc-100">{recipient.name}</span>
          </div>

          <div className="space-y-1 pb-2 border-b border-zinc-800/60">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Wallet Address</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Copy address"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={`${network?.explorerUrl || 'https://sepolia.basescan.org'}/address/${recipient.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
            <p className="font-mono text-[11px] text-zinc-300 break-all bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
              {recipient.address}
            </p>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-zinc-800/60">
            <span className="text-zinc-400">Target Network</span>
            <span className="font-medium text-zinc-200">Base Sepolia (Chain ID 84532)</span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-zinc-800/60">
            <span className="text-zinc-400">Asset & Amount</span>
            <span className="font-bold text-emerald-400 text-sm">
              {intention.amount.toLocaleString()} {intention.tokenSymbol}
            </span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-zinc-800/60">
            <span className="text-zinc-400">Recurring Frequency</span>
            <span className="capitalize font-medium text-zinc-200">{intention.frequency}</span>
          </div>

          {intention.notes && (
            <div className="pt-1">
              <span className="text-zinc-400 block mb-1">Note / Memo:</span>
              <p className="text-zinc-300 italic bg-zinc-900 p-2 rounded border border-zinc-800/60">
                "{intention.notes}"
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
          >
            Close
          </button>

          <button
            onClick={() => {
              onClose();
              onPrepareTransaction(intention);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md ${
              isOverdue
                ? 'bg-rose-500 hover:bg-rose-400 text-white'
                : isDueToday
                ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950'
                : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Prepare Transaction</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
