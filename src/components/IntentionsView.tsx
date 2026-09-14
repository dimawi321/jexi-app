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
} from 'lucide-react';
import { isAddress, getAddress } from 'viem';
import { PaymentIntention, Recipient, ScheduleFrequency, NetworkId } from '../types';
import { SUPPORTED_TOKENS, SUPPORTED_NETWORKS, getTodayDateString } from '../constants';
import {
  WEEKDAYS,
  formatScheduleCadence,
  computeNextDueDate,
  advanceNextDueDate,
  getIntentionStatus,
  getDaysOverdue,
} from '../utils/scheduler';

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
  const [quickNetwork, setQuickNetwork] = useState<NetworkId>('base-sepolia');
  const [quickToken, setQuickToken] = useState('Test USDC');
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
      networkId: 'base-sepolia',
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
    <div className="space-y-4">
      {/* Header & Action */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-emerald-400" />
            Payment Intentions
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Your scheduled payments ready for review and approval
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          disabled={recipients.length === 0}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-bold text-xs shadow-md transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Intention</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-zinc-900/90 border border-zinc-800 rounded-xl flex-wrap sm:flex-nowrap">
        <button
          onClick={() => setFilterMode('all')}
          className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all text-center ${
            filterMode === 'all' ? 'bg-zinc-800 text-zinc-100 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          All ({intentions.length})
        </button>

        <button
          onClick={() => setFilterMode('overdue')}
          className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
            filterMode === 'overdue'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              : overdueCount > 0
              ? 'text-rose-400 hover:bg-rose-950/20'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Overdue ({overdueCount})</span>
        </button>

        <button
          onClick={() => setFilterMode('due_today')}
          className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
            filterMode === 'due_today'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Due Today ({dueTodayCount})</span>
        </button>

        <button
          onClick={() => setFilterMode('upcoming')}
          className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all text-center ${
            filterMode === 'upcoming' ? 'bg-zinc-800 text-zinc-100 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Upcoming ({upcomingCount})
        </button>
      </div>

      {/* List */}
      {filteredIntentions.length === 0 ? (
        <div className="p-8 text-center bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl">
          <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-400">No payment intentions found</p>
          <p className="text-xs text-zinc-500 mt-1">
            {recipients.length === 0
              ? 'First add a recipient in Recipient Book, then schedule your payment.'
              : 'No intentions currently match the selected filter.'}
          </p>
          {recipients.length > 0 && filterMode === 'all' && (
            <button
              onClick={handleOpenAdd}
              className="mt-3 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Schedule Payment
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIntentions.map((intent) => {
            const recipient = recipients.find((r) => r.id === intent.recipientId);
            const status = getIntentionStatus(intent);
            const isOverdue = status === 'OVERDUE';
            const isDueToday = status === 'DUE_TODAY';
            const daysOverdue = isOverdue ? getDaysOverdue(intent) : 0;

            return (
              <div
                key={intent.id}
                className={`p-4 bg-zinc-900/80 border rounded-xl transition-all ${
                  isOverdue
                    ? 'border-rose-500/50 bg-rose-950/15 shadow-sm'
                    : isDueToday
                    ? 'border-amber-500/50 bg-amber-950/10 shadow-sm'
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-zinc-100 text-base">
                        {intent.amount.toLocaleString()} {intent.tokenSymbol}
                      </span>
                      <span className="text-xs text-zinc-400">to</span>
                      <span className="font-semibold text-emerald-400 text-sm truncate">
                        {recipient?.name || 'Unknown Recipient'}
                      </span>

                      {/* Status Badges */}
                      {isOverdue && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          OVERDUE by {daysOverdue} day{daysOverdue === 1 ? '' : 's'}
                        </span>
                      )}

                      {isDueToday && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          DUE TODAY
                        </span>
                      )}

                      {!isOverdue && !isDueToday && intent.active && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                          SCHEDULED
                        </span>
                      )}

                      {!intent.active && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-500 border border-zinc-700/40">
                          PAUSED
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-zinc-400">
                      <span className="flex items-center gap-1 font-mono text-[11px] text-zinc-300">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        Next Due:{' '}
                        <strong className={isOverdue ? 'text-rose-300 font-bold' : isDueToday ? 'text-amber-300 font-bold' : 'text-zinc-200'}>
                          {intent.nextDueDate}
                        </strong>
                        {intent.scheduleTime && <span className="text-zinc-400">@{intent.scheduleTime}</span>}
                      </span>
                      <span className="text-zinc-300">
                        Frequency: <strong className="font-medium text-emerald-400">{formatScheduleCadence(intent)}</strong>
                      </span>
                      <span>
                        Network: <strong className="font-medium text-zinc-200">Base Sepolia</strong>
                      </span>
                    </div>

                    {intent.notes && <p className="text-[11px] text-zinc-500 mt-1 italic">"{intent.notes}"</p>}
                  </div>

                  {/* Delete & Toggle */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onToggleIntentionActive(intent.id)}
                      title={intent.active ? 'Pause intention' : 'Resume intention'}
                      className={`p-1.5 rounded-lg text-xs transition-colors ${
                        intent.active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-zinc-500 hover:bg-zinc-800'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIntentionToDelete(intent)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                      title="Delete intention"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Bottom Action Row */}
                <div className="mt-3.5 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onViewDetail(intent)}
                      className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      View Details & Rules
                    </button>

                    {/* Skip Occurrence Button for Overdue or Recurring items */}
                    {isOverdue && onSkipOccurrence && (
                      <button
                        onClick={() => setIntentionToSkip(intent)}
                        className="text-xs text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20"
                      >
                        <SkipForward className="w-3 h-3" />
                        <span>Skip This Occurrence</span>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => onPrepareTransaction(intent)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                      isOverdue
                        ? 'bg-rose-500 hover:bg-rose-400 text-white animate-pulse'
                        : isDueToday
                        ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {isOverdue
                        ? 'Review & Prepare (Overdue)'
                        : isDueToday
                        ? 'Review & Prepare (Due)'
                        : 'Review & Prepare'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Intention Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Repeat className="w-4 h-4 text-emerald-400" />
                Schedule Payment Intention
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  if (onClearPreselectedRecipient) onClearPreselectedRecipient();
                }}
                className="text-zinc-400 hover:text-zinc-200 p-1 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveIntention} className="space-y-3.5">
              {/* Recipient Dropdown with inline + Add New Recipient Trigger */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-zinc-300">
                    Recipient <span className="text-rose-400">*</span>
                  </label>
                  {onAddRecipient && (
                    <button
                      type="button"
                      onClick={() => setIsQuickAddOpen(true)}
                      className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Add New Recipient</span>
                    </button>
                  )}
                </div>
                <select
                  value={formRecipientId}
                  onChange={(e) => handleRecipientChange(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
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
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Amount <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="e.g. 50"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/70"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Token & Network</label>
                  <div className="px-3 py-2 bg-zinc-950/60 border border-zinc-800 rounded-lg text-xs text-zinc-400 flex items-center justify-between">
                    <span className="text-emerald-400 font-semibold">
                      {recipients.find((r) => r.id === formRecipientId)?.tokenSymbol || 'Test USDC'}
                    </span>
                    <span className="text-[10px] text-zinc-500">Base Sepolia</span>
                  </div>
                </div>
              </div>

              {/* Frequency Selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Schedule Frequency</label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value as ScheduleFrequency)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
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
                <div className="grid grid-cols-2 gap-3 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Day of Month (1–31) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      required
                      value={formDayOfMonth}
                      onChange={(e) => setFormDayOfMonth(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Schedule Time</label>
                    <input
                      type="time"
                      value={formScheduleTime}
                      onChange={(e) => setFormScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                    />
                  </div>
                </div>
              )}

              {formFrequency === 'weekly' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Weekday <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={formDayOfWeek}
                      onChange={(e) => setFormDayOfWeek(parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                    >
                      {WEEKDAYS.map((day) => (
                        <option key={day.index} value={day.index}>
                          Every {day.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Schedule Time</label>
                    <input
                      type="time"
                      value={formScheduleTime}
                      onChange={(e) => setFormScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                    />
                  </div>
                </div>
              )}

              {formFrequency === 'biweekly' && (
                <div className="space-y-2.5 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">
                        Weekday <span className="text-rose-400">*</span>
                      </label>
                      <select
                        value={formDayOfWeek}
                        onChange={(e) => setFormDayOfWeek(parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                      >
                        {WEEKDAYS.map((day) => (
                          <option key={day.index} value={day.index}>
                            Every 2nd {day.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">Schedule Time</label>
                      <input
                        type="time"
                        value={formScheduleTime}
                        onChange={(e) => setFormScheduleTime(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Starting Anchor Date <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                    />
                  </div>
                </div>
              )}

              {formFrequency === 'custom_days' && (
                <div className="space-y-2.5 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">
                        Interval (Every X Days) <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        required
                        placeholder="e.g. 30"
                        value={formIntervalDays}
                        onChange={(e) => setFormIntervalDays(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">Schedule Time</label>
                      <input
                        type="time"
                        value={formScheduleTime}
                        onChange={(e) => setFormScheduleTime(e.target.value)}
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Starting Anchor Date <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                    />
                  </div>
                </div>
              )}

              {formFrequency === 'once' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">
                      Exact Due Date <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formDueDate}
                      onChange={(e) => {
                        setFormDueDate(e.target.value);
                        setFormStartDate(e.target.value);
                      }}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Exact Time</label>
                    <input
                      type="time"
                      value={formScheduleTime}
                      onChange={(e) => setFormScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                    />
                  </div>
                </div>
              )}

              {/* Human-Readable Summary Badge */}
              <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-1 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Calculated Schedule Summary:</span>
                </div>
                <p className="text-zinc-200 font-medium">{schedulePreview}</p>
                <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                  <Calendar className="w-3 h-3 text-zinc-500" />
                  Next scheduled due date: <strong className="text-emerald-400">{formDueDate}</strong>
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Notes / Intent Purpose (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly rent, team stipend"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/70"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    if (onClearPreselectedRecipient) onClearPreselectedRecipient();
                  }}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all shadow-md"
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
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                Quick Add Recipient
              </h3>
              <button
                type="button"
                onClick={() => setIsQuickAddOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {quickError && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300">
                {quickError}
              </div>
            )}

            <form onSubmit={handleQuickAddRecipient} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Recipient Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Freelancer"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/70"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Wallet Address (0x...) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="0x..."
                  value={quickAddress}
                  onChange={(e) => setQuickAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/70"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Network</label>
                  <select
                    value={quickNetwork}
                    onChange={(e) => setQuickNetwork(e.target.value as NetworkId)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                  >
                    <option value="base-sepolia">Base Sepolia</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Token</label>
                  <select
                    value={quickToken}
                    onChange={(e) => setQuickToken(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                  >
                    {SUPPORTED_TOKENS.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Default Amount (Optional)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 100"
                  value={quickDefaultAmount}
                  onChange={(e) => setQuickDefaultAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/70"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuickAddOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all shadow-md"
                >
                  Add & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Skip Occurrence Confirmation Modal */}
      {intentionToSkip && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <SkipForward className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-100">Skip This Occurrence?</h3>
                <p className="text-xs text-zinc-400">Advance schedule without creating a transaction</p>
              </div>
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Recipient:</span>
                <span className="font-bold text-zinc-100">
                  {recipients.find((r) => r.id === intentionToSkip.recipientId)?.name || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Current Overdue Date:</span>
                <span className="font-mono text-rose-400 font-bold">{intentionToSkip.nextDueDate}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">New Next Due Date:</span>
                <span className="font-mono text-emerald-400 font-bold">{advanceNextDueDate(intentionToSkip)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Recurrence Cadence:</span>
                <span className="text-zinc-300">{formatScheduleCadence(intentionToSkip)}</span>
              </div>
            </div>

            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-400 space-y-1">
              <p className="text-zinc-300 font-medium">Deterministic Non-Execution Guarantee</p>
              <p className="text-[11px]">
                No wallet signing will take place, no transaction will be recorded in History, and no funds will be moved.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIntentionToSkip(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
              >
                Keep Overdue
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onSkipOccurrence) {
                    onSkipOccurrence(intentionToSkip.id);
                  }
                  setIntentionToSkip(null);
                }}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>Confirm Skip</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Intention Confirmation Modal */}
      {intentionToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-100">Cancel Payment Intention</h3>
                <p className="text-xs text-zinc-400">Remove this scheduled payment plan</p>
              </div>
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Recipient:</span>
                <span className="font-bold text-zinc-100">
                  {recipients.find((r) => r.id === intentionToDelete.recipientId)?.name || 'Unknown Recipient'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Amount:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {intentionToDelete.amount.toLocaleString()} {intentionToDelete.tokenSymbol}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Schedule:</span>
                <span className="text-zinc-300 font-medium">{formatScheduleCadence(intentionToDelete)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Next Due:</span>
                <span className="text-zinc-300 font-mono">{intentionToDelete.nextDueDate}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIntentionToDelete(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
              >
                Keep Intention
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteIntention(intentionToDelete.id);
                  setIntentionToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
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
