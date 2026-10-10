import React, { useState } from 'react';
import {
  Cpu,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Info,
} from 'lucide-react';
import { SigningRequest, SignatureResult, SimulatedLedgerSignerAdapter } from '../lib/signer/adapter';

interface SimulatedLedgerModalProps {
  request: SigningRequest;
  onClose: () => void;
  onApproved: (result: SignatureResult) => void;
  onRejected: () => void;
}

export const SimulatedLedgerModal: React.FC<SimulatedLedgerModalProps> = ({
  request,
  onClose,
  onApproved,
  onRejected,
}) => {
  const [isSigning, setIsSigning] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [signingResult, setSigningResult] = useState<SignatureResult | null>(null);
  const [copiedSig, setCopiedSig] = useState(false);

  const handleApproveAndSign = async () => {
    setIsSigning(true);
    const adapter = new SimulatedLedgerSignerAdapter();

    const res = await adapter.signTransaction(request, (step, percent) => {
      setCurrentStep(step);
      setProgressPercent(percent);
    });

    setSigningResult(res);
    setIsSigning(false);

    if (res.success) {
      onApproved(res);
    }
  };

  const handleReject = () => {
    onRejected();
    onClose();
  };

  const handleCopySig = () => {
    if (signingResult?.signature) {
      navigator.clipboard.writeText(signingResult.signature);
      setCopiedSig(true);
      setTimeout(() => setCopiedSig(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-signa-overlay backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-signa-modal border border-signa-subtle rounded-2xl w-full max-w-lg shadow-2xl space-y-4 max-h-[92vh] flex flex-col overflow-hidden text-signa-primary">
        {/* Header */}
        <div className="p-4 border-b border-signa-subtle flex items-center justify-between shrink-0 bg-slate-900/90 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Cpu className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight text-white">Ledger Signing</h3>
                <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 tracking-wider">
                  SIMULATED DEMO
                </span>
              </div>
              <p className="text-[11px] text-slate-300">Development Hardware Signing Interface</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 text-sm font-semibold cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Explicit Notice Banner */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1 text-amber-800 dark:text-amber-200 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-300">
              <Info className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Simulated Signing Layer Demonstration</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-700 dark:text-zinc-300 pt-0.5">
              <strong>No physical Ledger device is connected in this demo.</strong> JEXI has prepared this transaction proposal. Ledger would be the final cryptographic signing authority in production.
            </p>
          </div>

          {!signingResult ? (
            <>
              {/* Transaction Review Card */}
              <div className="bg-signa-surface border border-signa-subtle rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-signa-divider text-xs">
                  <span className="text-signa-muted">Target Network</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {request.networkName || 'Base Mainnet'}
                  </span>
                </div>

                <div className="text-center py-2">
                  <span className="text-[11px] font-semibold text-signa-muted uppercase tracking-wider block">Proposed Amount</span>
                  <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight mt-0.5">
                    {request.amount.toLocaleString()} {request.tokenSymbol}
                  </div>
                  <span className="text-[11px] text-signa-muted font-medium">Recipient: {request.recipientName}</span>
                </div>

                <div className="space-y-2 text-xs pt-2 border-t border-signa-divider">
                  <div>
                    <span className="text-signa-muted block mb-1">Destination Address</span>
                    <div className="p-2 bg-signa-elevated rounded-lg border border-signa-subtle font-mono text-[11px] text-signa-secondary break-all flex items-center justify-between gap-2">
                      <span>{request.recipientAddress}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-signa-muted">Signing Authority</span>
                    <span className="font-mono text-signa-primary font-medium text-[11px]">
                      {request.signerAddress.slice(0, 6)}...{request.signerAddress.slice(-4)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-signa-muted">Estimated Gas</span>
                    <span className="font-mono text-signa-secondary text-[11px]">{request.estimatedGas}</span>
                  </div>
                </div>
              </div>

              {/* Progress Stepper while signing */}
              {isSigning ? (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                    <span className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                    <span>{currentStep || 'Authorizing with simulated signer...'}</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-signa-muted">
                    Simulating hardware cryptographic challenge review...
                  </p>
                </div>
              ) : (
                /* Action buttons */
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleReject}
                    className="py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    <span>Reject Proposal</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleApproveAndSign}
                    className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 font-bold text-xs transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Approve & Sign</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Authorization Success View */
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/40 rounded-xl space-y-3.5 text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span>AUTHORIZED</span>
                </div>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
                  SIMULATED SIGNATURE
                </span>
              </div>

              <p className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed font-medium">
                The transaction has been authorized by the simulated signer.
              </p>

              <div>
                <span className="text-[10px] text-signa-muted block mb-1">
                  Deterministic Demo Signature Payload:
                </span>
                <div className="p-2.5 bg-signa-surface rounded-lg font-mono text-[10px] text-signa-secondary break-all flex items-center justify-between gap-2 border border-signa-subtle">
                  <span className="truncate">{signingResult.signature}</span>
                  <button
                    onClick={handleCopySig}
                    className="p-1 text-signa-muted hover:text-signa-primary cursor-pointer shrink-0"
                    title="Copy Signature"
                  >
                    {copiedSig ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-signa-elevated rounded-lg border border-signa-subtle text-xs space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-signa-muted">Status:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase">Authorization Complete</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-signa-muted">Signer Adapter:</span>
                  <span className="font-mono text-signa-primary">{signingResult.signerType}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-signa-muted">Time:</span>
                  <span className="font-mono text-signa-muted">{new Date(signingResult.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 font-bold text-xs transition-all text-center cursor-pointer shadow-xs flex items-center justify-center gap-2"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-signa-subtle bg-slate-900/90 flex items-center justify-between shrink-0 text-slate-400">
          <span className="text-[10px]">
            JEXI Signer Architecture • Agnostic Adapter Interface
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
