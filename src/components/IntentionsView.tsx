import React, { useState, useEffect } from 'react';
import {
  Repeat,
  Plus,
  AlertCircle,
  Clock,
  Calendar,
  ArrowRight,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  SkipForward,
  Info,
  Shield,
  XCircle,
} from 'lucide-react';
import { isAddress, getAddress } from 'viem';
import { PaymentIntention, Recipient, ScheduleFrequency, NetworkId } from '../types';
import { SUPPORTED_TOKENS, SUPPORTED_NETWORKS, getTodayDateString, formatTokenSymbol } from '../constants';
import {
  WEEKDAYS,
  formatScheduleCadence,
  computeNextDueDate,
  advanceNextDueDate,
  getIntentionStatus,
  getDaysOverdue,
} from '../utils/scheduler';
import { SkipConfirmationModal } from './SkipConfirmationModal';

interface IntentionsViewProps {
  intentions: PaymentIntention[];
  recipients: Recipient[];
  onAddIntention: (intention: PaymentIntention) => void;
  onDeleteIntention: (id: string) => void;
  onToggleIntentionActive: (id: string) => void;
  onPrepareTransaction: (intention: PaymentIntention) => void;
  onViewDetail: (intention: PaymentIntention) => void;
  onAddRecipient?: (recipient: Recipient) => void;
  onSkipOccurrence?: (intentionId: string) => void;
  preselectedRecipientId?: string | null;
  onClearPreselectedRecipient?: () => void;
}

export const IntentionsView: React.FC<IntentionsViewProps> = ({
  intentions,
  recipients,
  onAddIntention,
  onDeleteIntention,
  onToggleIntentionActive,
  onPrepareTransaction,
  onViewDetail,
  onAddRecipient,
  onSkipOccurrence,
  preselectedRecipientId,
  onClearPreselectedRecipient,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(Boolean(preselectedRecipientId));
  const [filterMode, setFilterMode] = useState<'all' | 'overdue' | 'due_today' | 'upcoming'>('all');
  const [intentionToDelete, setIntentionToDelete] = useState<PaymentIntention | null>(null);
  const [intentionToSkip, setIntentionToSkip] = useState<PaymentIntention | null>(null);

  // Quick Add Recipient Modal inside Intentions form
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickAddress, setQuickAddress] = useState('');
  const [quickNetwork, setQuickNetwork] = useState<NetworkId>('base-mainnet');
  const [quickToken, setQuickToken] = useState('USDC');
  const [quickDefaultAmount, setQuickDefaultAmount] = useState('');
  const [quickNotes, setQuickNotes] = useState('');
  const [quickError, setQuickError] = useState('');

  // Form State for Intention
  const [formRecipientId, setFormRecipientId] = useState(preselectedRecipientId || (recipients[0]?.id || ''));
  const [formAmount, setFormAmount] = useState('');
  const [formFrequency, setFormFrequency] = useState<ScheduleFrequency>('monthly');

  // Dynamic scheduling parameters
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(() => {
    const today = new Date();
    return today.getDate();
  });
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(2); // Default Tuesday
  const [formStartDate, setFormStartDate] = useState<string>(getTodayDateString());
  const [formIntervalDays, setFormIntervalDays] = useState<number>(30);
  const [formScheduleTime, setFormScheduleTime] = useState<string>('10:00');
  const [formDueDate, setFormDueDate] = useState<string>(getTodayDateString());
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');

  const todayStr = getTodayDateString();

  // Auto-calculate next due date whenever frequency parameters change
  useEffect(() => {
    const computed = computeNextDueDate(formFrequency, {
      dueDayOfMonth: formDayOfMonth,
      dueDayOfWeek: formDayOfWeek,
      startDate: formStartDate,
      customIntervalDays: formIntervalDays,
    });
    setFormDueDate(computed);
  }, [formFrequency, formDayOfMonth, formDayOfWeek, formStartDate, formIntervalDays]);

  // Compute live human-readable preview of chosen schedule
  const schedulePreview = React.useMemo(() => {
    const dummy: PaymentIntention = {
      id: 'preview',
      recipientId: formRecipientId,
      amount: parseFloat(formAmount) || 0,
      tokenSymbol: 'TOKEN',
      networkId: 'base-mainnet',
      frequency: formFrequency,
      dueDayOfMonth: formDayOfMonth,
      dueDayOfWeek: formDayOfWeek,
      startDate: formStartDate,
      customIntervalDays: formIntervalDays,
      scheduleTime: formScheduleTime,
      nextDueDate: formDueDate,
      active: true,
      createdAt: '',
    };
    return formatScheduleCadence(dummy);
  }, [formFrequency, formDayOfMonth, formDayOfWeek, formStartDate, formIntervalDays, formScheduleTime, formDueDate, formRecipientId, formAmount]);

  const overdueCount = intentions.filter((i) => getIntentionStatus(i) === 'OVERDUE').length;
  const dueTodayCount = intentions.filter((i) => getIntentionStatus(i) === 'DUE_TODAY').length;
  const upcomingCount = intentions.filter((i) => getIntentionStatus(i) === 'UPCOMING').length;

  const filteredIntentions = intentions.filter((intent) => {
    const status = getIntentionStatus(intent);
    if (!intent.active && filterMode !== 'all') return false;
    if (filterMode === 'overdue') return status === 'OVERDUE';
    if (filterMode === 'due_today') return status === 'DUE_TODAY';
    if (filterMode === 'upcoming') return status === 'UPCOMING';
    return true;
  });

  const handleOpenAdd = () => {
    const selectedRec = recipients.find((r) => r.id === formRecipientId) || recipients[0];
    if (selectedRec) {
      setFormRecipientId(selectedRec.id);
      if (selectedRec.defaultAmount) {
        setFormAmount(selectedRec.defaultAmount.toString());
      }
    }
    setFormNotes('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleRecipientChange = (recId: string) => {
    setFormRecipientId(recId);
    const rec = recipients.find((r) => r.id === recId);
    if (rec && rec.defaultAmount && !formAmount) {
      setFormAmount(rec.defaultAmount.toString());
    }
  };

  const handleSaveIntention = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formRecipientId) {
      setFormError('Please select a saved recipient.');
      return;
    }

    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Please enter a valid positive amount.');
      return;
    }

    if (!formDueDate) {
      setFormError('Please choose the next payment date.');
      return;
    }

    const selectedRec = recipients.find((r) => r.id === formRecipientId);
    if (!selectedRec) {
      setFormError('Selected recipient does not exist in Recipient Book.');
      return;
    }

    const newIntention: PaymentIntention = {
      id: `intent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipientId: selectedRec.id,
      amount: amt,
      tokenSymbol: selectedRec.tokenSymbol,
      networkId: selectedRec.networkId,
      frequency: formFrequency,
      dueDayOfMonth: formFrequency === 'monthly' ? formDayOfMonth : undefined,
      dueDayOfWeek: formFrequency === 'weekly' || formFrequency === 'biweekly' ? formDayOfWeek : undefined,
      startDate: formFrequency === 'biweekly' || formFrequency === 'custom_days' || formFrequency === 'once' ? formStartDate : undefined,
      customIntervalDays: formFrequency === 'custom_days' ? formIntervalDays : undefined,
      scheduleTime: formScheduleTime || undefined,
      nextDueDate: formDueDate,
      notes: formNotes.trim() || undefined,
      active: true,
      createdAt: new Date().toISOString(),
    };

    onAddIntention(newIntention);
    setIsAddModalOpen(false);
    if (onClearPreselectedRecipient) onClearPreselectedRecipient();
  };

  const handleQuickAddRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError('');

    if (!quickName.trim()) {
      setQuickError('Please enter a recipient name or label.');
      return;
    }

    const trimmed = quickAddress.trim();
    if (!isAddress(trimmed)) {
      setQuickError('Invalid Ethereum/Base address format (0x followed by 40 hex characters).');
      return;
    }

    let checksummed = trimmed;
    try {
      checksummed = getAddress(trimmed);
    } catch {
      checksummed = trimmed;
    }

    const defaultAmtNum = quickDefaultAmount ? parseFloat(quickDefaultAmount) : undefined;
    if (defaultAmtNum !== undefined && (isNaN(defaultAmtNum) || defaultAmtNum <= 0)) {
      setQuickError('Default amount must be a positive number if provided.');
      return;
    }

    const newRec: Recipient = {
      id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: quickName.trim(),
      address: checksummed,
      networkId: quickNetwork,
      tokenSymbol: quickToken,
      defaultAmount: defaultAmtNum,
      notes: quickNotes.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    if (onAddRecipient) {
      onAddRecipient(newRec);
    }

    // Auto select this newly added recipient without losing any existing intention form state
    setFormRecipientId(newRec.id);
    if (newRec.defaultAmount && !formAmount) {
      setFormAmount(newRec.defaultAmount.toString());
    }

    // Reset quick form and close
    setQuickName('');
    setQuickAddress('');
    setQuickDefaultAmount('');
    setQuickNotes('');
    setIsQuickAddOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-jexi-primary flex items-center gap-2">
            <Repeat className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Payment Intentions
          </h1>
          <p className="text-xs text-jexi-muted mt-1">
            Deterministic schedules monitored for preflight checks and self-custodial review
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          disabled={recipients.length === 0}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 font-semibold text-xs transition-colors shrink-0 cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>New Intention</span>
        </button>
      </div>

      {/* Segmented Filter Control (Functional tabs) */}
      <div className="flex items-center gap-1 p-1 bg-jexi-elevated border border-jexi-subtle rounded-xl max-w-xl">
        <button
          onClick={() => setFilterMode('all')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors text-center cursor-pointer ${
            filterMode === 'all' ? 'bg-jexi-surface text-jexi-primary shadow-xs font-semibold' : 'text-jexi-muted hover:text-jexi-primary'
          }`}
        >
          All ({intentions.length})
        </button>

        <button
          onClick={() => setFilterMode('overdue')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
            filterMode === 'overdue'
              ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
              : overdueCount > 0
              ? 'text-rose-600 dark:text-rose-400 hover:text-rose-700'
              : 'text-jexi-muted hover:text-jexi-primary'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          <span>Overdue ({overdueCount})</span>
        </button>

        <button
          onClick={() => setFilterMode('due_today')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
            filterMode === 'due_today'
              ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
              : dueTodayCount > 0
              ? 'text-amber-600 dark:text-amber-400 hover:text-amber-700'
              : 'text-jexi-muted hover:text-jexi-primary'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>Due Today ({dueTodayCount})</span>
        </button>

        <button
          onClick={() => setFilterMode('upcoming')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors text-center cursor-pointer ${
            filterMode === 'upcoming' ? 'bg-jexi-surface text-jexi-primary shadow-xs font-semibold' : 'text-jexi-muted hover:text-jexi-primary'
          }`}
        >
          Upcoming ({upcomingCount})
        </button>
      </div>

      {/* List */}
      {filteredIntentions.length === 0 ? (
        <div className="p-10 text-center bg-jexi-surface border border-jexi-subtle rounded-2xl">
          <Clock className="w-8 h-8 text-jexi-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-jexi-primary">No payment intentions found</p>
          <p className="text-xs text-jexi-muted mt-1 max-w-sm mx-auto">
            {recipients.length === 0
              ? 'Add a recipient to your directory first, then create a payment intention.'
              : 'No payment intentions match the active filter.'}
          </p>
          {recipients.length > 0 && filterMode === 'all' && (
            <button
              onClick={handleOpenAdd}
              className="mt-4 px-3.5 py-2 text-xs font-medium bg-jexi-elevated hover:bg-jexi-hover text-jexi-primary border border-jexi-subtle rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule Payment</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIntentions.map((intent) => {
            const recipient = recipients.find((r) => r.id === intent.recipientId);
            const status = getIntentionStatus(intent);
            const isCompleted = status === 'COMPLETED';
            const isRejected = status === 'REJECTED';
            const isOverdue = status === 'OVERDUE';
            const isDueToday = status === 'DUE_TODAY';
            const daysOverdue = isOverdue ? getDaysOverdue(intent) : 0;

            return (
              <div
                key={intent.id}
                className={`p-5 bg-jexi-surface border rounded-2xl transition-colors shadow-xs ${
                  isOverdue
                    ? 'border-rose-200 dark:border-rose-500/40 bg-jexi-surface'
                    : isDueToday
                    ? 'border-amber-200 dark:border-amber-500/30 bg-jexi-surface'
                    : 'border-jexi-subtle hover:border-jexi-hover'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-bold text-jexi-primary font-mono tabular-nums text-base">
                        {intent.amount.toLocaleString()} {formatTokenSymbol(intent.tokenSymbol)}
                      </span>
                      <span className="text-jexi-muted">to</span>
                      <span className="font-semibold text-jexi-primary truncate">
                        {recipient?.name || 'Unknown Recipient'}
                      </span>

                      {/* Unboxed clean metadata status */}
                      {isOverdue && (
                        <span className="text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                          · {daysOverdue} day{daysOverdue === 1 ? '' : 's'} overdue
                        </span>
                      )}

                      {isDueToday && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                          · Due today
                        </span>
                      )}

                      {isCompleted ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>· Completed</span>
                        </span>
                      ) : isRejected ? (
                        <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>· Rejected</span>
                        </span>
                      ) : !isOverdue && !isDueToday && intent.active ? (
                        <span className="text-xs text-jexi-muted font-medium">
                          · Scheduled
                        </span>
                      ) : !intent.active ? (
                        <span className="text-xs text-jexi-muted font-medium">
                          · Paused
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-jexi-muted">
                      <span className="flex items-center gap-1.5 font-mono text-jexi-secondary">
                        <Calendar className="w-3.5 h-3.5 text-jexi-muted" />
                        <span>Due:</span>
                        <strong className={isOverdue ? 'text-rose-600 dark:text-rose-300 font-medium' : isDueToday ? 'text-amber-600 dark:text-amber-300 font-medium' : 'text-jexi-primary font-medium'}>
                          {intent.nextDueDate}
                        </strong>
                        {intent.scheduleTime && <span className="text-jexi-muted font-sans">@{intent.scheduleTime}</span>}
                      </span>
                      <span>
                        Cadence: <span className="text-jexi-secondary">{formatScheduleCadence(intent)}</span>
                      </span>
                      <span>
                        Network: <span className="text-jexi-secondary">{SUPPORTED_NETWORKS[intent.networkId]?.name || 'Base'}</span>
                      </span>
                    </div>

                    {intent.notes && <p className="text-xs text-jexi-muted italic pt-0.5">"{intent.notes}"</p>}
                  </div>

                  {/* Toggle and Delete Controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!isCompleted && !isRejected && (
                      <button
                        onClick={() => onToggleIntentionActive(intent.id)}
                        title={intent.active ? 'Pause intention' : 'Resume intention'}
                        className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          intent.active ? 'text-emerald-600 dark:text-emerald-400 hover:bg-jexi-hover' : 'text-jexi-muted hover:bg-jexi-hover'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setIntentionToDelete(intent)}
                      className="p-1.5 text-jexi-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-jexi-hover rounded-lg transition-colors cursor-pointer"
                      title="Delete intention"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Bottom Action Row */}
                <div className="mt-4 pt-3.5 border-t border-jexi-divider flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onViewDetail(intent)}
                      className="text-xs text-jexi-secondary hover:text-jexi-primary transition-colors cursor-pointer font-medium"
                    >
                      View Details & Preflight
                    </button>

                    {isOverdue && onSkipOccurrence && !isCompleted && !isRejected && (
                      <button
                        onClick={() => setIntentionToSkip(intent)}
                        className="text-xs text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 transition-colors flex items-center gap-1 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-500/30 cursor-pointer font-medium"
                      >
                        <SkipForward className="w-3 h-3 text-amber-500" />
                        <span>Skip Occurrence</span>
                      </button>
                    )}
                  </div>

                  {isCompleted ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Completed</span>
                    </div>
                  ) : isRejected ? (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/30">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Rejected</span>
                    </div>
                  ) : (
                    <button
                      disabled={!intent.active}
                      onClick={() => onPrepareTransaction(intent)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed ${
                        isOverdue
                          ? 'bg-rose-600 hover:bg-rose-500 text-white'
                          : isDueToday
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950'
                          : 'bg-jexi-elevated hover:bg-jexi-hover text-jexi-primary border border-jexi-subtle'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Prepare Payment</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* Add Intention Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-jexi-overlay backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-jexi-primary">
            <div className="flex items-center justify-between pb-3 border-b border-jexi-subtle">
              <h3 className="text-base font-bold text-jexi-primary flex items-center gap-2">
                <Repeat className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Schedule Payment Intention
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  if (onClearPreselectedRecipient) onClearPreselectedRecipient();
                }}
                className="text-jexi-muted hover:text-jexi-primary p-1 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveIntention} className="space-y-3.5">
              {/* Recipient Dropdown with inline + Add New Recipient Trigger */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-jexi-secondary">
                    Recipient <span className="text-rose-500">*</span>
                  </label>
                  {onAddRecipient && (
                    <button
                      type="button"
                      onClick={() => setIsQuickAddOpen(true)}
                      className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Add New Recipient</span>
                    </button>
                  )}
                </div>
                <select
                  value={formRecipientId}
                  onChange={(e) => handleRecipientChange(e.target.value)}
                  className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  {recipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.tokenSymbol} • {r.address.substring(0, 6)}...{r.address.substring(r.address.length - 4)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                    Amount <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="e.g. 50"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-jexi-secondary mb-1">Token & Network</label>
                  <div className="px-3 py-2 bg-jexi-elevated border border-jexi-subtle rounded-lg text-xs text-jexi-muted flex items-center justify-between">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      {formatTokenSymbol(recipients.find((r) => r.id === formRecipientId)?.tokenSymbol || 'USDC')}
                    </span>
                    <span className="text-[10px] text-jexi-muted">
                      {SUPPORTED_NETWORKS[recipients.find((r) => r.id === formRecipientId)?.networkId || 'base-mainnet']?.name || 'Base'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Frequency Selector */}
              <div>
                <label className="block text-xs font-semibold text-jexi-secondary mb-1">Schedule Frequency</label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value as ScheduleFrequency)}
                  className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  <option value="monthly">Monthly (specific day of month)</option>
                  <option value="weekly">Weekly (specific weekday)</option>
                  <option value="biweekly">Bi-weekly (every 2 weeks on weekday)</option>
                  <option value="custom_days">Custom interval (every X days)</option>
                  <option value="once">One-Time Due (single payment)</option>
                </select>
              </div>

              {/* Dynamic Scheduling Inputs according to selected frequency */}
              {formFrequency === 'monthly' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-jexi-elevated border border-jexi-subtle rounded-xl">
                  <div>
                    <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                      Day of Month (1–31) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      required
                      value={formDayOfMonth}
                      onChange={(e) => setFormDayOfMonth(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-jexi-secondary mb-1">Schedule Time</label>
                    <input
                      type="time"
                      value={formScheduleTime}
                      onChange={(e) => setFormScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              {formFrequency === 'weekly' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-jexi-elevated border border-jexi-subtle rounded-xl">
                  <div>
                    <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                      Weekday <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formDayOfWeek}
                      onChange={(e) => setFormDayOfWeek(parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                    >
                      {WEEKDAYS.map((day) => (
                        <option key={day.index} value={day.index}>
                          Every {day.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-jexi-secondary mb-1">Schedule Time</label>
                    <input
                      type="time"
                      value={formScheduleTime}
                      onChange={(e) => setFormScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              {formFrequency === 'biweekly' && (
                <div className="space-y-2.5 p-3 bg-jexi-elevated border border-jexi-subtle rounded-xl">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                        Weekday <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={formDayOfWeek}
                        onChange={(e) => setFormDayOfWeek(parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                      >
                        {WEEKDAYS.map((day) => (
                          <option key={day.index} value={day.index}>
                            Every 2nd {day.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-jexi-secondary mb-1">Schedule Time</label>
                      <input
                        type="time"
                        value={formScheduleTime}
                        onChange={(e) => setFormScheduleTime(e.target.value)}
                        className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                      Starting Anchor Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              {formFrequency === 'custom_days' && (
                <div className="space-y-2.5 p-3 bg-jexi-elevated border border-jexi-subtle rounded-xl">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                        Interval (Every X Days) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        required
                        placeholder="e.g. 30"
                        value={formIntervalDays}
                        onChange={(e) => setFormIntervalDays(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-jexi-secondary mb-1">Schedule Time</label>
                      <input
                        type="time"
                        value={formScheduleTime}
                        onChange={(e) => setFormScheduleTime(e.target.value)}
                        className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                      Starting Anchor Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              {formFrequency === 'once' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-jexi-elevated border border-jexi-subtle rounded-xl">
                  <div>
                    <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                      Exact Due Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formDueDate}
                      onChange={(e) => {
                        setFormDueDate(e.target.value);
                        setFormStartDate(e.target.value);
                      }}
                      className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-jexi-secondary mb-1">Exact Time</label>
                    <input
                      type="time"
                      value={formScheduleTime}
                      onChange={(e) => setFormScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Human-Readable Summary Badge */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 rounded-xl space-y-1 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Calculated Schedule Summary:</span>
                </div>
                <p className="text-jexi-primary font-medium">{schedulePreview}</p>
                <p className="text-[11px] text-jexi-muted flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3 h-3 text-jexi-muted" />
                  Next scheduled due date: <strong className="text-emerald-600 dark:text-emerald-400">{formDueDate}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-jexi-secondary mb-1">Notes / Intent Purpose (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly rent, team stipend"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-jexi-divider">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    if (onClearPreselectedRecipient) onClearPreselectedRecipient();
                  }}
                  className="px-4 py-2 rounded-lg bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary border border-jexi-subtle text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Save Intention
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Recipient Modal (Triggered directly from inside Intention form) */}
      {isQuickAddOpen && (
        <div className="fixed inset-0 z-60 bg-jexi-overlay backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 text-jexi-primary">
            <div className="flex items-center justify-between pb-3 border-b border-jexi-subtle">
              <h3 className="text-base font-bold text-jexi-primary flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Quick Add Recipient
              </h3>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                className="text-jexi-muted hover:text-jexi-primary p-1 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {quickError && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                {quickError}
              </div>
            )}

            <form onSubmit={handleQuickAddRecipient} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                  Recipient Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Freelancer"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                  Wallet Address (0x...) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="0x..."
                  value={quickAddress}
                  onChange={(e) => setQuickAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs font-mono text-jexi-primary placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-jexi-secondary mb-1">Network</label>
                  <select
                    value={quickNetwork}
                    onChange={(e) => setQuickNetwork(e.target.value as NetworkId)}
                    className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="base-mainnet">Base</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-jexi-secondary mb-1">Token</label>
                  <select
                    value={quickToken}
                    onChange={(e) => setQuickToken(e.target.value)}
                    className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    {SUPPORTED_TOKENS.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {formatTokenSymbol(t.symbol)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-jexi-secondary mb-1">Default Amount (Optional)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 100"
                  value={quickDefaultAmount}
                  onChange={(e) => setQuickDefaultAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-jexi-divider">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary border border-jexi-subtle text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Add & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* Delete Intention Confirmation Modal */}
      {intentionToDelete && (
        <div className="fixed inset-0 z-50 bg-jexi-overlay backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 text-jexi-primary">
            <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400 pb-3 border-b border-jexi-subtle">
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20">
                <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-jexi-primary">Cancel Payment Intention</h3>
                <p className="text-xs text-jexi-muted">Remove this scheduled payment plan</p>
              </div>
            </div>

            <div className="bg-signa-elevated border border-signa-subtle rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-signa-muted">Recipient:</span>
                <span className="font-bold text-signa-primary">
                  {recipients.find((r) => r.id === intentionToDelete.recipientId)?.name || 'Unknown Recipient'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-signa-muted">Amount:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  {intentionToDelete.amount.toLocaleString()} {intentionToDelete.tokenSymbol}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-signa-muted">Schedule:</span>
                <span className="text-signa-secondary font-medium">{formatScheduleCadence(intentionToDelete)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-signa-muted">Next Due:</span>
                <span className="text-signa-secondary font-mono">{intentionToDelete.nextDueDate}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-signa-divider">
              <button
                type="button"
                onClick={() => setIntentionToDelete(null)}
                className="px-4 py-2 rounded-lg bg-signa-elevated hover:bg-signa-hover text-signa-secondary border border-signa-subtle text-xs font-medium transition-colors cursor-pointer"
              >
                Keep Intention
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteIntention(intentionToDelete.id);
                  setIntentionToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Intention</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
