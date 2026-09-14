import React, { useState } from 'react';
import { History, Copy, Check, ExternalLink, Filter, Users, Cpu, ShieldCheck, Info } from 'lucide-react';
import { CompletedTransactionRecord, Recipient } from '../types';
import { SUPPORTED_NETWORKS } from '../constants';

interface HistoryViewProps {
  history: CompletedTransactionRecord[];
  recipients: Recipient[];
  selectedRecipientIdFilter?: string | null;
  onClearFilter?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  recipients,
  selectedRecipientIdFilter,
  onClearFilter,
}) => {
  const [recipientFilter, setRecipientFilter] = useState<string>(selectedRecipientIdFilter || 'all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
          <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            Transaction History
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Transparent logs distinguishing real on-chain broadcasts from testnet simulations
          </p>
        </div>

        {/* Recipient Filter Dropdown */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-500 shrink-0" />
          <select
            value={recipientFilter}
            onChange={(e) => setRecipientFilter(e.target.value)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-emerald-500/70"
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
        <div className="p-8 text-center bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl">
          <History className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-400">No transaction records found</p>
          <p className="text-xs text-zinc-500 mt-1">
            Completed transactions and simulation records will be archived here.
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
                className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl space-y-2.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-zinc-100 text-sm">
                        {tx.amount.toLocaleString()} {tx.tokenSymbol}
                      </span>
                      <span className="text-xs text-zinc-400">to</span>
                      <span className="font-semibold text-emerald-400 text-sm">{tx.recipientName}</span>
                    </div>
                    <span className="text-[11px] text-zinc-500">{dateStr}</span>
                  </div>

                  {/* Distinction Badge */}
                  {isRealOnChain ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1 shrink-0">
                      <ShieldCheck className="w-3 h-3" />
                      CONFIRMED ON-CHAIN
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center gap-1 shrink-0">
                      <Cpu className="w-3 h-3" />
                      SIMULATION RECORD
                    </span>
                  )}
                </div>

                {/* Recipient Address */}
                <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800/80">
                  <span className="text-[11px] text-zinc-500">To:</span>
                  <span className="font-mono text-[11px] text-zinc-300 truncate mx-2">
                    {tx.recipientAddress}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(tx.recipientAddress, `addr_${tx.id}`)}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                      title="Copy recipient address"
                    >
                      {copiedId === `addr_${tx.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <a
                      href={`${network?.explorerUrl || 'https://sepolia.basescan.org'}/address/${tx.recipientAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                      title="View recipient on BaseScan"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Transaction Hash / Simulation Reference */}
                <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800/80">
                  <span className="text-[11px] text-zinc-500 shrink-0">
                    {isRealOnChain ? 'Tx Hash:' : 'Sim Ref:'}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400 truncate mx-2">
                    {displayHash}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(displayHash, `hash_${tx.id}`)}
                      className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
                      title={isRealOnChain ? 'Copy Tx Hash' : 'Copy Simulation Reference ID'}
                    >
                      {copiedId === `hash_${tx.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Explorer Button Audit: only active for real on-chain transactions */}
                    {isRealOnChain ? (
                      <a
                        href={`${network?.explorerUrl || 'https://sepolia.basescan.org'}/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 hover:bg-zinc-800 rounded text-emerald-400 hover:text-emerald-300 transition-colors"
                        title="View verified transaction on BaseScan"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="p-1 rounded text-zinc-600 cursor-not-allowed"
                        title="Explorer link unavailable: Simulation record was not broadcast on-chain to BaseScan"
                      >
                        <ExternalLink className="w-3.5 h-3.5 opacity-40" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Bottom Network & Status Tag */}
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-zinc-800/60 flex-wrap gap-1">
                  <span className="text-zinc-500">Network: Base Sepolia Testnet</span>
                  {isRealOnChain ? (
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Status: Confirmed On-Chain
                    </span>
                  ) : (
                    <span className="text-amber-400/90 font-medium flex items-center gap-1" title="Local testnet execution record without broadcast">
                      <Cpu className="w-3 h-3 text-amber-400" />
                      Status: Simulation Record (Dev Testnet - Off-Chain)
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
