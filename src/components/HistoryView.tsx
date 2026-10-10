import React, { useState, useEffect } from 'react';
import { History, Copy, Check, ExternalLink, Filter, Users, Cpu, ShieldCheck, Info, Radio, AlertTriangle } from 'lucide-react';
import { CompletedTransactionRecord, Recipient } from '../types';
import { SUPPORTED_NETWORKS, formatTokenSymbol } from '../constants';

interface HistoryViewProps {
  history: CompletedTransactionRecord[];
  recipients: Recipient[];
  selectedRecipientIdFilter?: string | null;
  onClearFilter?: () => void;
  onRecheckReceipt?: (record: CompletedTransactionRecord) => Promise<void>;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  recipients,
  selectedRecipientIdFilter,
  onClearFilter,
  onRecheckReceipt,
}) => {
  const [recipientFilter, setRecipientFilter] = useState<string>(selectedRecipientIdFilter || 'all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [checkingHash, setCheckingHash] = useState<string | null>(null);

  // Synchronize internal filter whenever selectedRecipientIdFilter changes from external navigation
  useEffect(() => {
    setRecipientFilter(selectedRecipientIdFilter || 'all');
  }, [selectedRecipientIdFilter]);

  // Build unique recipient filter options including historical recipients that may have been deleted
  const filterOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    recipients.forEach((r) => map.set(r.id, r.name));
    history.forEach((h) => {
      if (!map.has(h.recipientId)) {
        map.set(h.recipientId, `${h.recipientName} (Archived)`);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({
      id,
      name,
      count: history.filter((h) => h.recipientId === id).length,
    }));
  }, [recipients, history]);

  const filteredHistory = history
    .filter((tx) => {
      if (recipientFilter === 'all') return true;
      return tx.recipientId === recipientFilter;
    })
    .sort((a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime());

  const handleCheckReceipt = async (tx: CompletedTransactionRecord) => {
    if (!onRecheckReceipt || checkingHash) return;
    setCheckingHash(tx.txHash);
    try {
      await onRecheckReceipt(tx);
    } catch (err) {
      console.error('Failed to recheck transaction receipt:', err);
    } finally {
      setCheckingHash(null);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-jexi-primary flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Transaction History
          </h2>
          <p className="text-xs text-jexi-muted mt-0.5">
            Archived payment records, receipts, and execution logs
          </p>
        </div>

        {/* Recipient Filter Dropdown */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-jexi-muted shrink-0" />
          <select
            value={recipientFilter}
            onChange={(e) => {
              setRecipientFilter(e.target.value);
              if (e.target.value === 'all' && onClearFilter) {
                onClearFilter();
              }
            }}
            className="px-3 py-1.5 bg-jexi-surface border border-jexi-subtle rounded-lg text-xs text-jexi-primary focus:outline-none focus:border-emerald-500 transition-colors"
          >
            <option value="all">All Recipients ({history.length})</option>
            {filterOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name} ({opt.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* History List */}
      {filteredHistory.length === 0 ? (
        <div className="p-8 text-center bg-jexi-surface border border-dashed border-jexi-subtle rounded-2xl">
          <History className="w-8 h-8 text-jexi-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-jexi-primary">No transaction records found</p>
          <p className="text-xs text-jexi-muted mt-1">
            Completed transactions and payment records will be archived here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((tx) => {
            const network = SUPPORTED_NETWORKS[tx.networkId];
            const isRealOnChain = Boolean(tx.isOnChain && !tx.isSimulation && tx.txHash.startsWith('0x'));
            const dateStr = new Date(tx.confirmedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            const displayHash = tx.simulatedRefId || tx.txHash;

            return (
              <div
                key={tx.id}
                className="p-4 bg-jexi-surface border border-jexi-subtle rounded-2xl space-y-2.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-jexi-primary text-sm font-mono tabular-nums">
                        {tx.amount.toLocaleString()} {formatTokenSymbol(tx.tokenSymbol)}
                      </span>
                      <span className="text-xs text-jexi-muted">to</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">{tx.recipientName}</span>
                    </div>
                    <span className="text-[11px] text-jexi-muted">{dateStr}</span>
                  </div>

                  {/* Distinction Badge */}
                  {isRealOnChain ? (
                    tx.status === 'BROADCAST_SUBMITTED' ? (
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-50 dark:bg-sky-500/15 border border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-300 flex items-center gap-1 shrink-0">
                          <Radio className="w-3 h-3 animate-pulse" />
                          BROADCAST (PENDING)
                        </span>
                        {onRecheckReceipt && (
                          <button
                            type="button"
                            onClick={() => handleCheckReceipt(tx)}
                            disabled={checkingHash === tx.txHash}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                            title="Query on-chain receipt from Base Mainnet RPC"
                          >
                            {checkingHash === tx.txHash ? (
                              <>
                                <span className="w-2.5 h-2.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                Checking...
                              </>
                            ) : (
                              <>
                                <Radio className="w-2.5 h-2.5" />
                                Re-check Receipt
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    ) : tx.status === 'FAILED_ON_CHAIN' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 flex items-center gap-1 shrink-0">
                        <AlertTriangle className="w-3 h-3" />
                        FAILED ON-CHAIN
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-1 shrink-0">
                        <ShieldCheck className="w-3 h-3" />
                        CONFIRMED ON-CHAIN
                      </span>
                    )
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-center gap-1 shrink-0">
                      <Cpu className="w-3 h-3" />
                      SIMULATED (TESTNET)
                    </span>
                  )}
                </div>

                {/* Occurrence ID if present */}
                {tx.occurrenceId && (
                  <div className="flex items-center justify-between text-xs text-jexi-muted bg-jexi-elevated px-2.5 py-1.5 rounded-lg border border-jexi-subtle">
                    <span className="text-[11px] text-jexi-muted shrink-0">Occurrence ID:</span>
                    <span className="font-mono text-[11px] text-jexi-secondary truncate mx-2">
                      {tx.occurrenceId}
                    </span>
                  </div>
                )}

                {/* Transfer Action */}
                <div className="flex items-center justify-between text-xs text-jexi-muted bg-jexi-elevated px-2.5 py-1.5 rounded-lg border border-jexi-subtle">
                  <span className="text-[11px] text-jexi-muted shrink-0">Action:</span>
                  <span className="text-[11px] text-jexi-primary font-medium">Token Transfer (ERC-20)</span>
                </div>

                {/* Recipient Address */}
                <div className="flex items-center justify-between text-xs text-jexi-muted bg-jexi-elevated px-2.5 py-1.5 rounded-lg border border-jexi-subtle">
                  <span className="text-[11px] text-jexi-muted shrink-0">To:</span>
                  <span className="font-mono text-[11px] text-jexi-secondary truncate mx-2">
                    {tx.recipientAddress}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(tx.recipientAddress, `addr_${tx.id}`)}
                      className="p-1 hover:bg-jexi-hover rounded text-jexi-muted hover:text-jexi-primary transition-colors cursor-pointer"
                      title="Copy recipient address"
                    >
                      {copiedId === `addr_${tx.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={`${network?.explorerUrl || 'https://basescan.org'}/address/${tx.recipientAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 hover:bg-jexi-hover rounded text-jexi-muted hover:text-jexi-primary transition-colors cursor-pointer"
                      title="View recipient on BaseScan"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Transaction Hash / Simulation Reference */}
                <div className="flex items-center justify-between text-xs text-jexi-muted bg-jexi-elevated px-2.5 py-1.5 rounded-lg border border-jexi-subtle">
                  <span className="text-[11px] text-jexi-muted shrink-0">
                    {isRealOnChain ? 'Tx Hash:' : 'Simulation Receipt:'}
                  </span>
                  <span className="font-mono text-[11px] text-jexi-secondary truncate mx-2">
                    {displayHash}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(displayHash, `hash_${tx.id}`)}
                      className="p-1 hover:bg-jexi-hover rounded text-jexi-muted hover:text-jexi-primary transition-colors cursor-pointer"
                      title={isRealOnChain ? 'Copy Tx Hash' : 'Copy Simulation Receipt ID'}
                    >
                      {copiedId === `hash_${tx.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Explorer Button Audit: only active for real on-chain transactions */}
                    {isRealOnChain ? (
                      <a
                        href={`${network?.explorerUrl || 'https://basescan.org'}/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 hover:bg-jexi-hover rounded text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                        title="View verified transaction on BaseScan"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="p-1 rounded text-jexi-muted opacity-40 cursor-not-allowed"
                        title="Explorer link unavailable: Local self-custody simulation record"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Bottom Network & Status Tag */}
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-jexi-divider flex-wrap gap-1">
                  <span className="text-jexi-muted">Network: {SUPPORTED_NETWORKS[tx.networkId]?.name || 'Base'}</span>
                  {isRealOnChain ? (
                    tx.status === 'BROADCAST_SUBMITTED' ? (
                      <span className="text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1">
                        <Radio className="w-3 h-3 animate-pulse" />
                        Status: Broadcast Submitted (Pending Confirmation)
                      </span>
                    ) : tx.status === 'FAILED_ON_CHAIN' ? (
                      <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Status: Execution Failed On-Chain
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Status: Confirmed On-Chain
                      </span>
                    )
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1" title="Local execution record in self-custody preparation mode">
                      <Cpu className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      Status: Prepared (Simulation)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
