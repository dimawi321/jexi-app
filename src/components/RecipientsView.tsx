import React, { useState } from 'react';
import {
  Users,
  Plus,
  Search,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Edit3,
  Shield,
  ArrowUpRight,
  AlertTriangle,
  ChevronRight,
  Clock,
  History,
  Info,
} from 'lucide-react';
import { isAddress, getAddress } from 'viem';
import { Recipient, PaymentIntention, NetworkId } from '../types';
import { SUPPORTED_TOKENS, SUPPORTED_NETWORKS, formatTokenSymbol } from '../constants';

interface RecipientsViewProps {
  recipients: Recipient[];
  intentions: PaymentIntention[];
  onAddRecipient: (recipient: Recipient) => void;
  onUpdateRecipient: (recipient: Recipient) => void;
  onDeleteRecipient: (id: string) => void;
  onSelectRecipientForIntention: (recipientId: string) => void;
  onSelectRecipientForHistory: (recipientId: string) => void;
}

export const RecipientsView: React.FC<RecipientsViewProps> = ({
  recipients,
  intentions,
  onAddRecipient,
  onUpdateRecipient,
  onDeleteRecipient,
  onSelectRecipientForIntention,
  onSelectRecipientForHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);
  const [profileRecipient, setProfileRecipient] = useState<Recipient | null>(null);
  const [recipientToDelete, setRecipientToDelete] = useState<Recipient | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNetwork, setFormNetwork] = useState<NetworkId>('base-mainnet');
  const [formToken, setFormToken] = useState('USDC');
  const [formDefaultAmount, setFormDefaultAmount] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [allowDuplicateAddress, setAllowDuplicateAddress] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const filteredRecipients = recipients.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.notes && r.notes.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleCopy = (address: string, id: string) => {
    navigator.clipboard.writeText(address);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openAddModal = () => {
    setEditingRecipient(null);
    setFormName('');
    setFormAddress('');
    setFormNetwork('base-mainnet');
    setFormToken('USDC');
    setFormDefaultAmount('');
    setFormNotes('');
    setFormError('');
    setAllowDuplicateAddress(false);
    setDuplicateWarning(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (rec: Recipient) => {
    setProfileRecipient(null);
    setEditingRecipient(rec);
    setFormName(rec.name);
    setFormAddress(rec.address);
    setFormNetwork(rec.networkId);
    setFormToken(rec.tokenSymbol);
    setFormDefaultAmount(rec.defaultAmount ? rec.defaultAmount.toString() : '');
    setFormNotes(rec.notes || '');
    setFormError('');
    setAllowDuplicateAddress(false);
    setDuplicateWarning(null);
    setIsAddModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setDuplicateWarning(null);

    if (!formName.trim()) {
      setFormError('Please enter a recipient label or name.');
      return;
    }

    const trimmedAddress = formAddress.trim();
    if (!isAddress(trimmedAddress)) {
      setFormError('Invalid Ethereum/Base address format (must be 0x followed by 40 hex characters).');
      return;
    }

    let checksummedAddress = trimmedAddress;
    try {
      checksummedAddress = getAddress(trimmedAddress);
    } catch {
      checksummedAddress = trimmedAddress;
    }

    // Check for duplicate address among existing recipients
    const duplicate = recipients.find(
      (r) =>
        r.address.toLowerCase() === checksummedAddress.toLowerCase() &&
        r.id !== editingRecipient?.id
    );

    if (duplicate && !allowDuplicateAddress) {
      setDuplicateWarning(
        `This address is already registered to "${duplicate.name}". If this is intentional (e.g. multi-account), enable the confirmation checkbox below to proceed.`
      );
      return;
    }

    const defaultAmtNum = formDefaultAmount ? parseFloat(formDefaultAmount) : undefined;
    if (defaultAmtNum !== undefined && (isNaN(defaultAmtNum) || defaultAmtNum <= 0)) {
      setFormError('Default amount must be a positive number if provided.');
      return;
    }

    if (editingRecipient) {
      const updated: Recipient = {
        ...editingRecipient,
        name: formName.trim(),
        address: checksummedAddress,
        networkId: formNetwork,
        tokenSymbol: formToken,
        defaultAmount: defaultAmtNum,
        notes: formNotes.trim() || undefined,
      };
      onUpdateRecipient(updated);
      if (profileRecipient?.id === updated.id) {
        setProfileRecipient(updated);
      }
    } else {
      const newRec: Recipient = {
        id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: formName.trim(),
        address: checksummedAddress,
        networkId: formNetwork,
        tokenSymbol: formToken,
        defaultAmount: defaultAmtNum,
        notes: formNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      onAddRecipient(newRec);
    }

    setIsAddModalOpen(false);
  };

  const activeIntentionsForRecipientToDelete = recipientToDelete
    ? intentions.filter((i) => i.recipientId === recipientToDelete.id && i.active)
    : [];

  return (
    <div className="space-y-4">
      {/* Header & Action */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-jexi-primary flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Recipient Book
          </h2>
          <p className="text-xs text-jexi-muted mt-0.5">
            Saved payment profiles and verified recipient addresses
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 font-semibold text-xs shadow-xs transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Recipient</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-jexi-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Recipient Book by name, address, or note..."
          className="w-full pl-9 pr-4 py-2.5 bg-jexi-surface border border-jexi-subtle rounded-xl text-xs text-jexi-primary placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors shadow-xs"
        />
      </div>

      {/* Recipients List: Clean and uncluttered, primarily displaying recipient names */}
      {filteredRecipients.length === 0 ? (
        <div className="p-8 text-center bg-jexi-surface border border-dashed border-jexi-subtle rounded-2xl">
          <Users className="w-8 h-8 text-jexi-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-jexi-primary">No recipients found</p>
          <p className="text-xs text-jexi-muted mt-1">Add your first recipient to start scheduling payments.</p>
          <button
            onClick={openAddModal}
            className="mt-3 px-3.5 py-1.5 text-xs bg-jexi-elevated hover:bg-jexi-hover text-jexi-primary border border-jexi-subtle rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Recipient
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredRecipients.map((rec) => {
            const network = SUPPORTED_NETWORKS[rec.networkId];
            const activeCount = intentions.filter((i) => i.recipientId === rec.id && i.active).length;

            return (
              <div
                key={rec.id}
                onClick={() => setProfileRecipient(rec)}
                className="p-4 bg-jexi-surface hover:bg-jexi-elevated/60 border border-jexi-subtle hover:border-jexi-hover rounded-2xl transition-all shadow-xs cursor-pointer group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar Initials Badge */}
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-sm shrink-0 shadow-xs group-hover:border-emerald-400/60 transition-colors">
                      {rec.name.substring(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-jexi-primary text-sm tracking-tight truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {rec.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded-md bg-jexi-elevated text-jexi-secondary text-[10px] font-semibold border border-jexi-subtle">
                          {rec.tokenSymbol}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-xs text-jexi-muted flex-wrap">
                        <span className="text-[11px] text-jexi-muted font-medium">
                          {network?.name || 'Base'}
                        </span>
                        {rec.defaultAmount !== undefined && (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            • Default: {rec.defaultAmount.toLocaleString()} {rec.tokenSymbol}
                          </span>
                        )}
                        {activeCount > 0 && (
                          <span className="text-[10px] text-sky-700 dark:text-sky-300 font-medium bg-sky-50 dark:bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-500/30">
                            {activeCount} active intention{activeCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {rec.notes && (
                        <p className="text-[11px] text-jexi-muted mt-0.5 truncate italic max-w-sm">
                          "{rec.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Open Profile Button */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-jexi-muted group-hover:text-jexi-primary hidden sm:inline transition-colors font-medium">
                      View Profile
                    </span>
                    <div className="p-1.5 rounded-lg bg-jexi-elevated group-hover:bg-jexi-hover text-jexi-muted group-hover:text-jexi-primary transition-colors border border-jexi-subtle">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recipient Detailed Profile Modal */}
      {profileRecipient && (
        <div className="fixed inset-0 z-50 bg-jexi-overlay backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-jexi-primary">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-jexi-subtle">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                  {profileRecipient.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-jexi-primary">{profileRecipient.name}</h3>
                  <span className="text-[10px] text-jexi-muted font-medium">Recipient Profile</span>
                </div>
              </div>
              <button
                onClick={() => setProfileRecipient(null)}
                className="text-jexi-muted hover:text-jexi-primary p-1 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Profile Details Card */}
            <div className="bg-jexi-elevated border border-jexi-subtle rounded-xl p-4 space-y-3 text-xs">
              <div>
                <span className="text-jexi-muted block mb-1">Recipient Label</span>
                <p className="text-sm font-bold text-jexi-primary">{profileRecipient.name}</p>
              </div>

              {/* Wallet Address with Copy & Basescan Explorer */}
              <div className="space-y-1 pt-1 border-t border-jexi-divider">
                <div className="flex justify-between items-center">
                  <span className="text-jexi-muted">Wallet Address</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCopy(profileRecipient.address, `profile_addr_${profileRecipient.id}`)}
                      className="p-1 hover:bg-jexi-hover rounded text-jexi-muted hover:text-jexi-primary transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                      title="Copy full address"
                    >
                      {copiedId === `profile_addr_${profileRecipient.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span className="text-[10px]">Copy</span>
                    </button>
                    <a
                      href={`${
                        SUPPORTED_NETWORKS[profileRecipient.networkId]?.explorerUrl || 'https://basescan.org'
                      }/address/${profileRecipient.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 hover:bg-jexi-hover rounded text-jexi-muted hover:text-jexi-primary transition-colors flex items-center gap-1 text-[11px]"
                      title="View on BaseScan"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="text-[10px]">BaseScan</span>
                    </a>
                  </div>
                </div>
                <p className="font-mono text-[11px] text-jexi-secondary break-all bg-jexi-surface p-2.5 rounded-lg border border-jexi-subtle">
                  {profileRecipient.address}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-jexi-divider">
                <div>
                  <span className="text-jexi-muted block">Network</span>
                  <span className="text-jexi-primary font-medium text-[11px]">
                    {SUPPORTED_NETWORKS[profileRecipient.networkId]?.name || 'Base'}
                  </span>
                </div>
                <div>
                  <span className="text-jexi-muted block">Default Token</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">{formatTokenSymbol(profileRecipient.tokenSymbol)}</span>
                </div>
              </div>

              {profileRecipient.defaultAmount !== undefined && (
                <div className="pt-1 border-t border-jexi-divider">
                  <span className="text-jexi-muted block">Default Transfer Amount</span>
                  <span className="text-jexi-primary font-bold text-xs">
                    {profileRecipient.defaultAmount.toLocaleString()} {formatTokenSymbol(profileRecipient.tokenSymbol)}
                  </span>
                </div>
              )}

              {profileRecipient.notes && (
                <div className="pt-1 border-t border-jexi-divider">
                  <span className="text-jexi-muted block mb-0.5">Notes / Memo</span>
                  <p className="text-jexi-secondary italic bg-jexi-surface p-2 rounded-lg border border-jexi-subtle text-[11px]">
                    "{profileRecipient.notes}"
                  </p>
                </div>
              )}
            </div>

            {/* Profile Action Buttons */}
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const recId = profileRecipient.id;
                    setProfileRecipient(null);
                    onSelectRecipientForIntention(recId);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Schedule Payment</span>
                </button>

                <button
                  onClick={() => {
                    const recId = profileRecipient.id;
                    setProfileRecipient(null);
                    onSelectRecipientForHistory(recId);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-jexi-elevated hover:bg-jexi-hover text-jexi-primary border border-jexi-subtle text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>View History</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-jexi-divider">
                <button
                  onClick={() => openEditModal(profileRecipient)}
                  className="px-3 py-2 text-xs font-medium text-jexi-secondary hover:text-jexi-primary hover:bg-jexi-hover rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Profile</span>
                </button>

                <button
                  onClick={() => {
                    const toDel = profileRecipient;
                    setProfileRecipient(null);
                    setRecipientToDelete(toDel);
                  }}
                  className="px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Recipient</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-jexi-overlay backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-jexi-primary">
            <div className="flex items-center justify-between pb-3 border-b border-jexi-subtle">
              <h3 className="text-base font-bold text-jexi-primary flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {editingRecipient ? 'Edit Recipient Profile' : 'Add New Recipient'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
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

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                  Recipient Name / Label <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mum, Alex Contractor, Gospel"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
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
                  value={formAddress}
                  onChange={(e) => {
                    setFormAddress(e.target.value);
                    setDuplicateWarning(null);
                  }}
                  className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs font-mono text-jexi-primary placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <p className="text-[10px] text-jexi-muted mt-1">
                  Deterministic preflight checks will enforce exact matching against this address.
                </p>

                {duplicateWarning && (
                  <div className="mt-2 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/40 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <span>{duplicateWarning}</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer pt-1 text-[11px] text-jexi-primary">
                      <input
                        type="checkbox"
                        checked={allowDuplicateAddress}
                        onChange={(e) => setAllowDuplicateAddress(e.target.checked)}
                        className="rounded border-jexi-subtle bg-jexi-surface text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>I explicitly intend to register this shared or duplicate address</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-jexi-secondary mb-1">Network</label>
                  <select
                    value={formNetwork}
                    onChange={(e) => setFormNetwork(e.target.value as NetworkId)}
                    className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="base-mainnet">Base</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-jexi-secondary mb-1">Token</label>
                  <select
                    value={formToken}
                    onChange={(e) => setFormToken(e.target.value)}
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
                <label className="block text-xs font-semibold text-jexi-secondary mb-1">
                  Default Amount (Optional baseline)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 50"
                  value={formDefaultAmount}
                  onChange={(e) => setFormDefaultAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <p className="text-[10px] text-jexi-muted mt-1">
                  Used by preflight to detect anomalies if an intention exceeds 300% of this baseline.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-jexi-secondary mb-1">Notes / Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly creative retainer"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-jexi-divider">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary border border-jexi-subtle text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  {editingRecipient ? 'Update Recipient' : 'Save Recipient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Recipient Confirmation Modal */}
      {recipientToDelete && (
        <div className="fixed inset-0 z-50 bg-jexi-overlay backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 text-jexi-primary">
            <div className="flex items-center gap-3 pb-3 border-b border-jexi-subtle">
              <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-jexi-primary">Delete Recipient Profile</h3>
                <p className="text-xs text-jexi-muted">Remove recipient from your Recipient Book</p>
              </div>
            </div>

            <div className="bg-jexi-elevated border border-jexi-subtle rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-jexi-muted">Recipient Name:</span>
                <span className="font-bold text-jexi-primary text-sm">{recipientToDelete.name}</span>
              </div>
              <div>
                <span className="text-jexi-muted block mb-0.5">Wallet Address:</span>
                <p className="font-mono text-[11px] text-jexi-secondary break-all bg-jexi-surface px-2 py-1 rounded border border-jexi-subtle">
                  {recipientToDelete.address}
                </p>
              </div>
            </div>

            {/* Active Intentions Warning */}
            {activeIntentionsForRecipientToDelete.length > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/50 rounded-xl space-y-1.5 text-xs text-amber-800 dark:text-amber-200">
                <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Active Payment Intentions Detected</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Warning: This recipient has{' '}
                  <strong className="text-amber-800 dark:text-amber-300 font-bold">
                    {activeIntentionsForRecipientToDelete.length} active payment intention
                    {activeIntentionsForRecipientToDelete.length > 1 ? 's' : ''}
                  </strong>{' '}
                  that will be removed.
                </p>
              </div>
            )}

            {/* Crucial Data Preservation Notice */}
            <div className="p-3 bg-jexi-surface border border-jexi-subtle rounded-xl space-y-1 text-xs text-jexi-secondary leading-relaxed">
              <p className="font-semibold text-jexi-primary">Transaction History Preservation</p>
              <p className="text-[11px] text-jexi-muted">
                Deleting this recipient will remove their saved profile from the Recipient Book and future scheduling selectors.
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-0.5">
                ✓ All existing historical records in History will remain completely intact and undeleted.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-jexi-divider">
              <button
                type="button"
                onClick={() => setRecipientToDelete(null)}
                className="px-4 py-2 rounded-lg bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary border border-jexi-subtle text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteRecipient(recipientToDelete.id);
                  setRecipientToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Recipient</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
