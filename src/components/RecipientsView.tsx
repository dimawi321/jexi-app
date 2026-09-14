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
import { SUPPORTED_TOKENS, SUPPORTED_NETWORKS } from '../constants';

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
  const [formNetwork, setFormNetwork] = useState<NetworkId>('base-sepolia');
  const [formToken, setFormToken] = useState('Test USDC');
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
    setFormNetwork('base-sepolia');
    setFormToken('Test USDC');
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
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            Recipient Book
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Saved payment profiles and verified recipient addresses
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs shadow-md transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Recipient</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Recipient Book by name, address, or note..."
          className="w-full pl-9 pr-4 py-2.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/60 transition-colors"
        />
      </div>

      {/* Recipients List: Clean and uncluttered, primarily displaying recipient names */}
      {filteredRecipients.length === 0 ? (
        <div className="p-8 text-center bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl">
          <Users className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-400">No recipients found</p>
          <p className="text-xs text-zinc-500 mt-1">Add your first recipient to start scheduling payments.</p>
          <button
            onClick={openAddModal}
            className="mt-3 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors inline-flex items-center gap-1"
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
                className="p-3.5 bg-zinc-900/85 hover:bg-zinc-900 border border-zinc-800/90 hover:border-zinc-700 rounded-xl transition-all shadow-xs cursor-pointer group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar Initials Badge */}
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-950 border border-zinc-700/60 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0 shadow-xs group-hover:border-emerald-500/40 transition-colors">
                      {rec.name.substring(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-zinc-100 text-sm tracking-tight truncate group-hover:text-emerald-300 transition-colors">
                          {rec.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded bg-zinc-800/90 text-zinc-300 text-[10px] font-semibold border border-zinc-700/60">
                          {rec.tokenSymbol}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400 flex-wrap">
                        <span className="text-[11px] text-zinc-400 font-medium">
                          {network?.name || 'Base Sepolia'}
                        </span>
                        {rec.defaultAmount !== undefined && (
                          <span className="text-[11px] text-emerald-400/90">
                            • Default: {rec.defaultAmount.toLocaleString()} {rec.tokenSymbol}
                          </span>
                        )}
                        {activeCount > 0 && (
                          <span className="text-[10px] text-sky-400 font-medium bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20">
                            {activeCount} active intention{activeCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {rec.notes && (
                        <p className="text-[11px] text-zinc-500 mt-0.5 truncate italic max-w-sm">
                          "{rec.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Open Profile Button */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-zinc-400 group-hover:text-zinc-200 hidden sm:inline transition-colors">
                      View Profile
                    </span>
                    <div className="p-1.5 rounded-lg bg-zinc-800/80 group-hover:bg-zinc-700 text-zinc-400 group-hover:text-zinc-100 transition-colors">
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
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
                  {profileRecipient.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-100">{profileRecipient.name}</h3>
                  <span className="text-[10px] text-zinc-400 font-medium">Recipient Profile</span>
                </div>
              </div>
              <button
                onClick={() => setProfileRecipient(null)}
                className="text-zinc-400 hover:text-zinc-200 p-1 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {/* Profile Details Card */}
            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3 text-xs">
              <div>
                <span className="text-zinc-500 block mb-1">Recipient Label</span>
                <p className="text-sm font-bold text-zinc-100">{profileRecipient.name}</p>
              </div>

              {/* Wallet Address with Copy & Basescan Explorer */}
              <div className="space-y-1 pt-1 border-t border-zinc-800/60">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Wallet Address</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleCopy(profileRecipient.address, `profile_addr_${profileRecipient.id}`)}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 text-[11px]"
                      title="Copy full address"
                    >
                      {copiedId === `profile_addr_${profileRecipient.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span className="text-[10px]">Copy</span>
                    </button>
                    <a
                      href={`${
                        SUPPORTED_NETWORKS[profileRecipient.networkId]?.explorerUrl || 'https://sepolia.basescan.org'
                      }/address/${profileRecipient.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1 text-[11px]"
                      title="View on BaseScan"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="text-[10px]">BaseScan</span>
                    </a>
                  </div>
                </div>
                <p className="font-mono text-[11px] text-zinc-300 break-all bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                  {profileRecipient.address}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-zinc-800/60">
                <div>
                  <span className="text-zinc-500 block">Network</span>
                  <span className="text-zinc-200 font-medium text-[11px]">
                    {SUPPORTED_NETWORKS[profileRecipient.networkId]?.name || 'Base Sepolia (Testnet)'}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Default Token</span>
                  <span className="text-emerald-400 font-semibold text-[11px]">{profileRecipient.tokenSymbol}</span>
                </div>
              </div>

              {profileRecipient.defaultAmount !== undefined && (
                <div className="pt-1 border-t border-zinc-800/60">
                  <span className="text-zinc-500 block">Default Transfer Amount</span>
                  <span className="text-zinc-200 font-bold text-xs">
                    {profileRecipient.defaultAmount.toLocaleString()} {profileRecipient.tokenSymbol}
                  </span>
                </div>
              )}

              {profileRecipient.notes && (
                <div className="pt-1 border-t border-zinc-800/60">
                  <span className="text-zinc-500 block mb-0.5">Notes / Memo</span>
                  <p className="text-zinc-300 italic bg-zinc-900 p-2 rounded border border-zinc-800 text-[11px]">
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
                  className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5"
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
                  className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>View History</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800">
                <button
                  onClick={() => openEditModal(profileRecipient)}
                  className="px-3 py-2 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-1.5"
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
                  className="px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg transition-colors flex items-center gap-1.5"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                {editingRecipient ? 'Edit Recipient Profile' : 'Add New Recipient'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
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

            <form onSubmit={handleSave} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Recipient Name / Label <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mum, Alex Contractor, Gospel"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
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
                  value={formAddress}
                  onChange={(e) => {
                    setFormAddress(e.target.value);
                    setDuplicateWarning(null);
                  }}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/70"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Deterministic preflight checks will enforce exact matching against this address.
                </p>

                {duplicateWarning && (
                  <div className="mt-2 p-2.5 bg-amber-950/40 border border-amber-500/40 rounded-lg text-xs text-amber-300 space-y-1.5">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>{duplicateWarning}</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer pt-1 text-[11px] text-zinc-200">
                      <input
                        type="checkbox"
                        checked={allowDuplicateAddress}
                        onChange={(e) => setAllowDuplicateAddress(e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span>I explicitly intend to register this shared or duplicate address</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Network</label>
                  <select
                    value={formNetwork}
                    onChange={(e) => setFormNetwork(e.target.value as NetworkId)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70"
                  >
                    <option value="base-sepolia">Base Sepolia (Testnet)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Token</label>
                  <select
                    value={formToken}
                    onChange={(e) => setFormToken(e.target.value)}
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
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Default Amount (Optional baseline)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 50"
                  value={formDefaultAmount}
                  onChange={(e) => setFormDefaultAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/70"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Used by preflight to detect anomalies if an intention exceeds 300% of this baseline.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Notes / Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly creative retainer"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/70"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all shadow-md"
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
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-100">Delete Recipient Profile</h3>
                <p className="text-xs text-zinc-400">Remove recipient from your Recipient Book</p>
              </div>
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Recipient Name:</span>
                <span className="font-bold text-zinc-100 text-sm">{recipientToDelete.name}</span>
              </div>
              <div>
                <span className="text-zinc-500 block mb-0.5">Wallet Address:</span>
                <p className="font-mono text-[11px] text-zinc-300 break-all bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
                  {recipientToDelete.address}
                </p>
              </div>
            </div>

            {/* Active Intentions Warning */}
            {activeIntentionsForRecipientToDelete.length > 0 && (
              <div className="p-3 bg-amber-950/40 border border-amber-500/50 rounded-xl space-y-1.5 text-xs text-amber-200">
                <div className="flex items-center gap-1.5 font-bold text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Active Payment Intentions Detected</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Warning: This recipient has{' '}
                  <strong className="text-amber-300 font-bold">
                    {activeIntentionsForRecipientToDelete.length} active payment intention
                    {activeIntentionsForRecipientToDelete.length > 1 ? 's' : ''}
                  </strong>{' '}
                  that will be removed.
                </p>
              </div>
            )}

            {/* Crucial Data Preservation Notice */}
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1 text-xs text-zinc-300 leading-relaxed">
              <p className="font-semibold text-zinc-200">Transaction History Preservation</p>
              <p className="text-[11px] text-zinc-400">
                Deleting this recipient will remove their saved profile from the Recipient Book and future scheduling selectors.
              </p>
              <p className="text-[11px] text-emerald-400 font-medium pt-0.5">
                ✓ All existing historical records in History will remain completely intact and undeleted.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRecipientToDelete(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteRecipient(recipientToDelete.id);
                  setRecipientToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
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
