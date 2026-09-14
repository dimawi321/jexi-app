import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Lock,
  ArrowRight,
  Radio,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Code2,
  Sparkles,
} from 'lucide-react';
import { PreparedTransaction, PaymentIntention, Recipient, CompletedTransactionRecord } from '../types';
import { PreflightReportView } from './PreflightBadge';
import { generateSimulatedTxHash } from '../utils/preflight';
import { advanceNextDueDate } from '../utils/scheduler';
import { SUPPORTED_NETWORKS } from '../constants';

interface TransactionPreparationModalProps {
  preparedTx: PreparedTransaction;
  intention: PaymentIntention;
  recipient: Recipient;
  isEarlyExecution?: boolean;
  onClose: () => void;
  onTransactionConfirmed: (
    completedTx: CompletedTransactionRecord,
    updatedIntentionNextDueDate: string
  ) => void;
  onViewHistory: () => void;
}

type SimulationStage =
  | 'ready_for_review'
  | 'simulating_signing'
  | 'simulated_signed'
  | 'simulating_broadcast'
  | 'simulated_broadcast'
  | 'simulated_confirmed';

export const TransactionPreparationModal: React.FC<TransactionPreparationModalProps> = ({
  preparedTx,
  intention,
  recipient,
  isEarlyExecution,
  onClose,
  onTransactionConfirmed,
  onViewHistory,
}) => {
  const [simulationStage, setSimulationStage] = useState<SimulationStage>('ready_for_review');
  const [simulatedTxHash, setSimulatedTxHash] = useState<string>('');
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedCalldata, setCopiedCalldata] = useState(false);
  const [showRawPayload, setShowRawPayload] = useState(false);

  const network = SUPPORTED_NETWORKS[preparedTx.networkId];
  const preflightReport = preparedTx.preflightReport;

  // Step 1: Simulate Testnet Signing
  const handleSimulateSigning = () => {
    setSimulationStage('simulating_signing');
    setTimeout(() => {
      setSimulationStage('simulated_signed');
    }, 1200);
  };

  // Step 2: Simulate Broadcast & Confirmation
  const handleSimulateBroadcast = () => {
    setSimulationStage('simulating_broadcast');
    const newHash = generateSimulatedTxHash();
    setSimulatedTxHash(newHash);

    setTimeout(() => {
      setSimulationStage('simulated_broadcast');

      // After a short network confirmation delay on Base Sepolia:
      setTimeout(() => {
        setSimulationStage('simulated_confirmed');

        // Compute next recurring due date using exact scheduler rules
        const nextDateStr = advanceNextDueDate(intention);

        const completedRecord: CompletedTransactionRecord = {
          id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          preparedTxId: preparedTx.id,
          intentionId: intention.id,
          recipientId: recipient.id,
          recipientName: recipient.name,
          recipientAddress: recipient.address,
          amount: preparedTx.amount,
          tokenSymbol: preparedTx.tokenSymbol,
          networkId: preparedTx.networkId,
          txHash: newHash,
          simulatedRefId: newHash,
          confirmedAt: new Date().toISOString(),
          executionMode: 'DEVELOPMENT_TESTNET_SIMULATION',
          isSimulation: true,
          isOnChain: false,
        };

        onTransactionConfirmed(completedRecord, nextDateStr);
      }, 1800);
    }, 1200);
  };

  const handleCopyHash = () => {
    if (simulatedTxHash) {
      navigator.clipboard.writeText(simulatedTxHash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const handleCopyCalldata = () => {
    navigator.clipboard.writeText(preparedTx.rawCalldata);
    setCopiedCalldata(true);
    setTimeout(() => setCopiedCalldata(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl space-y-4 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100">Transaction Preparation</h3>
              <p className="text-[10px] text-zinc-400 font-mono">ID: {preparedTx.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 text-sm font-semibold"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Unsigned Transaction Status Ribbon */}
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <div>
                <div className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                  {simulationStage === 'ready_for_review' && 'Status: Unsigned Transaction'}
                  {simulationStage === 'simulating_signing' && 'Status: Simulating Testnet Signer...'}
                  {simulationStage === 'simulated_signed' && 'Status: Simulated Signed'}
                  {simulationStage === 'simulating_broadcast' && 'Status: Broadcasting to Testnet...'}
                  {simulationStage === 'simulated_broadcast' && 'Status: Simulated Broadcast'}
                  {simulationStage === 'simulated_confirmed' && 'Status: Confirmed (Simulated Testnet)'}
                </div>
                <div className="text-[10px] text-zinc-400">
                  {simulationStage === 'ready_for_review'
                    ? 'Prepared safely • Awaiting your authorization'
                    : 'Development testnet execution pipeline (Off-chain Simulation)'}
                </div>
              </div>
            </div>

            <span
              className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                simulationStage === 'simulated_confirmed'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : simulationStage === 'ready_for_review'
                  ? 'bg-zinc-800 text-amber-300 border border-amber-500/40'
                  : 'bg-sky-500/20 text-sky-300 border border-sky-500/40 animate-pulse'
              }`}
            >
              {simulationStage === 'ready_for_review' ? 'UNSIGNED' : simulationStage.replace('simulated_', 'SIMULATED ')}
            </span>
          </div>

          {/* Early Execution Notice Banner if executed before scheduled date */}
          {isEarlyExecution && (
            <div className="p-3 bg-amber-950/40 border border-amber-500/50 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300 block">Early Payment Execution</span>
                <span className="text-[11px] text-zinc-300 block mt-0.5 leading-relaxed">
                  This payment was scheduled for <strong className="text-amber-200">{intention.nextDueDate}</strong>. You are intentionally choosing to execute it early. The recurring schedule rule will remain unchanged and will advance to the next recurring occurrence.
                </span>
              </div>
            </div>
          )}

          {/* Core Transaction Card */}
          <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="text-center py-2 border-b border-zinc-800/80">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Transfer Amount</span>
              <div className="text-2xl font-extrabold text-emerald-400 font-mono tracking-tight mt-0.5">
                {preparedTx.amount.toLocaleString()} {preparedTx.tokenSymbol}
              </div>
              <span className="text-[11px] text-zinc-500 font-medium">on Base Sepolia Testnet</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Target Recipient</span>
                <span className="font-semibold text-zinc-100">{recipient.name}</span>
              </div>

              <div>
                <span className="text-zinc-400 block mb-1">Destination Address</span>
                <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800 font-mono text-[11px] text-zinc-300 break-all flex items-center justify-between gap-2">
                  <span>{preparedTx.recipientAddress}</span>
                  <a
                    href={`${network?.explorerUrl || 'https://sepolia.basescan.org'}/address/${preparedTx.recipientAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-400 hover:text-zinc-200"
                    title="View on Basescan"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
              </div>

              <div className="flex justify-between items-center pt-1">
                <span className="text-zinc-400">Estimated Gas Fee</span>
                <span className="font-mono text-zinc-300 text-[11px]">{preparedTx.estimatedGas}</span>
              </div>
            </div>

            {/* Toggle Raw Calldata */}
            <div className="pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => setShowRawPayload(!showRawPayload)}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 transition-colors"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{showRawPayload ? 'Hide' : 'Inspect'} Raw EVM Calldata</span>
              </button>

              {showRawPayload && (
                <div className="mt-2 p-2.5 bg-zinc-900 rounded-lg border border-zinc-800 text-[10px] font-mono text-zinc-400 break-all">
                  <div className="flex items-center justify-between text-zinc-500 mb-1">
                    <span>ERC20 transfer(address,uint256)</span>
                    <button
                      onClick={handleCopyCalldata}
                      className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-[9px]"
                    >
                      {copiedCalldata ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      Copy Calldata
                    </button>
                  </div>
                  {preparedTx.rawCalldata}
                </div>
              )}
            </div>
          </div>

          {/* Preflight Safety Audit Section */}
          <PreflightReportView report={preflightReport} />

          {/* SIMULATION CONTROLLER (DEVELOPMENT TESTNET MODE) */}
          <div className="bg-amber-950/20 border-2 border-amber-500/50 rounded-xl p-4 space-y-3.5">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-md bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                <Cpu className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                  Development Testnet Simulation Mode
                </h4>
                <p className="text-[11px] text-amber-200/80 leading-relaxed mt-0.5">
                  This execution flow operates entirely in testnet simulation. <strong>No Ledger hardware signing is invoked in this phase.</strong> Real Ledger hardware signing requires the physical USB/WebHID bridge to be connected.
                </p>
              </div>
            </div>

            {/* Stepping pipeline indicators */}
            <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-semibold py-1">
              <div
                className={`p-2 rounded-lg border transition-all ${
                  simulationStage === 'ready_for_review' || simulationStage === 'simulating_signing'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                1. Review Unsigned
              </div>
              <div
                className={`p-2 rounded-lg border transition-all ${
                  simulationStage === 'simulated_signed' || simulationStage === 'simulating_broadcast'
                    ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                2. Simulated Sign
              </div>
              <div
                className={`p-2 rounded-lg border transition-all ${
                  simulationStage === 'simulated_broadcast' || simulationStage === 'simulated_confirmed'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                }`}
              >
                3. Broadcast & Confirm
              </div>
            </div>

            {/* Step Controls */}
            {simulationStage === 'ready_for_review' && (
              <button
                disabled={!preflightReport.canProceed}
                onClick={handleSimulateSigning}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Cpu className="w-4 h-4" />
                <span>Simulate Testnet Signer (Dev Mode)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {simulationStage === 'simulating_signing' && (
              <div className="py-2.5 text-center text-xs text-amber-300 font-semibold flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                Generating simulated cryptographic signature for Base Sepolia...
              </div>
            )}

            {simulationStage === 'simulated_signed' && (
              <div className="space-y-2">
                <div className="p-2.5 bg-zinc-900/90 rounded-lg border border-zinc-800 text-[11px] text-zinc-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sky-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Signature Generated (Simulated Testnet Key)
                  </span>
                  <span className="text-[10px] text-zinc-400">Signature ready</span>
                </div>
                <button
                  onClick={handleSimulateBroadcast}
                  className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Radio className="w-4 h-4" />
                  <span>Broadcast to Base Sepolia (Simulated)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {simulationStage === 'simulating_broadcast' && (
              <div className="py-2.5 text-center text-xs text-sky-300 font-semibold flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
                Transmitting transaction to Base Sepolia RPC nodes...
              </div>
            )}

            {simulationStage === 'simulated_broadcast' && (
              <div className="py-2.5 text-center text-xs text-sky-300 font-semibold flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                Mining block on Base Sepolia (Simulated)...
              </div>
            )}

            {simulationStage === 'simulated_confirmed' && (
              <div className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Simulated Confirmation Complete (Testnet Mode)
                  </span>
                  <span className="text-[10px] uppercase font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                    Simulation
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">Simulated Reference ID (Dev Mode):</span>
                  <div className="p-2 bg-zinc-950 rounded font-mono text-[10px] text-zinc-300 break-all flex items-center justify-between gap-2 border border-zinc-800">
                    <span>{simulatedTxHash}</span>
                    <button
                      onClick={handleCopyHash}
                      className="text-zinc-400 hover:text-zinc-200"
                      title="Copy Simulation Ref ID"
                    >
                      {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-zinc-400">
                  Recorded in local simulation history. No real on-chain transaction was broadcast to BaseScan.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      onClose();
                      onViewHistory();
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold transition-all text-center"
                  >
                    View In Transaction History
                  </button>
                  <button
                    onClick={onClose}
                    className="py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-zinc-500">
            Jexi Self-Custody Engine • Non-custodial Architecture
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
