import React, { useState, useRef, useEffect } from 'react';
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
  Wallet,
  Loader2,
  RefreshCw,
  X,
  Clock,
  Shield,
  Key,
} from 'lucide-react';
import { PreparedTransaction, PaymentIntention, Recipient, CompletedTransactionRecord, TransactionOccurrenceState } from '../types';
import { PreflightReportView } from './PreflightBadge';
import { generateSimulatedTxHash, verifyTransactionIntegrity, runPreflightChecks } from '../utils/preflight';
import { advanceNextDueDate, getOccurrenceId } from '../utils/scheduler';
import { SUPPORTED_NETWORKS, SUPPORTED_TOKENS, formatTokenSymbol, BASE_MAINNET_CHAIN_ID } from '../constants';
import { WalletState, sendEIP1193Transaction, checkTransactionReceipt, TransactionLifecycleStatus, switchToBaseMainnet } from '../lib/wallet';
import { ConnectedWalletBalance } from '../lib/balance';
import { getOccurrenceRecord, setOccurrenceState, deleteOccurrenceRecord, loadCompletedTransactions } from '../storage/storage';
import { SimulatedLedgerModal } from './SimulatedLedgerModal';
import { SigningRequest, SignatureResult } from '../lib/signer/adapter';

interface TransactionPreparationModalProps {
  preparedTx: PreparedTransaction;
  intention: PaymentIntention;
  recipient: Recipient;
  isEarlyExecution?: boolean;
  connectedWallet?: WalletState;
  liveBalance?: ConnectedWalletBalance;
  onClose: () => void;
  onTransactionConfirmed: (
    completedTx: CompletedTransactionRecord,
    updatedIntentionNextDueDate: string
  ) => void;
  onViewHistory: () => void;
  onRejectOccurrence?: (occurrenceId: string, intentionId?: string) => void;
  onDeferOccurrence?: (occurrenceId: string, intentionId?: string) => void;
}

type SimulationStage =
  | 'ready_for_review'
  | 'ready_for_authorization'
  | 'ledger_signing'
  | 'simulated_authorized'
  | 'simulating_broadcast'
  | 'simulated_broadcast'
  | 'simulated_confirmed';

export const TransactionPreparationModal: React.FC<TransactionPreparationModalProps> = ({
  preparedTx,
  intention,
  recipient,
  isEarlyExecution,
  connectedWallet,
  liveBalance,
  onClose,
  onTransactionConfirmed,
  onViewHistory,
  onRejectOccurrence,
  onDeferOccurrence,
}) => {
  const [simulationStage, setSimulationStage] = useState<SimulationStage>('ready_for_review');
  const [simulatedTxHash, setSimulatedTxHash] = useState<string>('');
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedCalldata, setCopiedCalldata] = useState(false);
  const [showRawPayload, setShowRawPayload] = useState(false);
  const [integrityError, setIntegrityError] = useState<string | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<TransactionLifecycleStatus>('BROADCAST_SUBMITTED');
  const [isCheckingReceipt, setIsCheckingReceipt] = useState<boolean>(false);
  const [signatureResult, setSignatureResult] = useState<SignatureResult | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear polling timers on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  const occurrenceId = preparedTx.occurrenceId || getOccurrenceId(intention.id, intention.nextDueDate);

  // Check occurrence lock state on mount
  useEffect(() => {
    const existingRec = getOccurrenceRecord(occurrenceId);
    const allHistory = loadCompletedTransactions();
    const existingHistory = allHistory.find(
      (h) =>
        (h.occurrenceId && h.occurrenceId === occurrenceId) ||
        (h.intentionId === intention.id &&
          h.status === 'BROADCAST_SUBMITTED' &&
          h.confirmedAt.startsWith(intention.nextDueDate))
    );

    if (
      existingRec &&
      (existingRec.state === 'CONFIRMED' ||
        existingRec.state === 'SUBMITTED' ||
        existingRec.state === 'AUTHORIZED' ||
        existingRec.state === 'SIGNING')
    ) {
      setIntegrityError(
        `Duplicate Execution Protected — Occurrence ${occurrenceId} is currently in state [${existingRec.state}] and cannot be executed again.`
      );
    } else if (
      existingHistory &&
      (existingHistory.status === 'BROADCAST_SUBMITTED' ||
        existingHistory.status === 'CONFIRMED_ON_CHAIN')
    ) {
      setIntegrityError(
        `Duplicate Execution Protected — Occurrence ${occurrenceId} already has an active ${existingHistory.status === 'CONFIRMED_ON_CHAIN' ? 'confirmed' : 'pending broadcast'} transaction record (Tx: ${existingHistory.txHash.slice(0, 10)}...).`
      );
    } else if (existingRec && existingRec.state === 'REJECTED') {
      // If erroneously marked REJECTED due to a wallet authorization error/cancellation rather than human intention rejection:
      if (
        existingRec.error &&
        (existingRec.error.includes('wallet') ||
          existingRec.error.includes('Wallet') ||
          existingRec.error.includes('cancelled') ||
          existingRec.error.includes('rejected in your wallet') ||
          existingRec.error.includes('failed in wallet'))
      ) {
        deleteOccurrenceRecord(occurrenceId);
      } else {
        setIntegrityError(
          `Rejected Occurrence Protected — Occurrence ${occurrenceId} was REJECTED and cannot be executed or signed again.`
        );
      }
    }
  }, [occurrenceId, intention.id, intention.nextDueDate]);

  const network = SUPPORTED_NETWORKS[preparedTx.networkId];
  
  // Reactively evaluate deterministic safety checks with live connected wallet and on-chain balance
  const preflightReport = React.useMemo(() => {
    const token =
      SUPPORTED_TOKENS.find((t) => t.symbol === intention.tokenSymbol) ||
      SUPPORTED_TOKENS[0];
    return runPreflightChecks(
      recipient,
      intention,
      token,
      preparedTx.recipientAddress,
      preparedTx.amount,
      {
        walletState: connectedWallet,
        liveBalance,
      }
    );
  }, [recipient, intention, preparedTx.recipientAddress, preparedTx.amount, connectedWallet, liveBalance]);

  const signingRequest: SigningRequest = React.useMemo(() => {
    return {
      preparedTxId: preparedTx.id,
      occurrenceId,
      intentId: intention.id,
      recipientName: recipient.name,
      recipientAddress: preparedTx.recipientAddress as `0x${string}`,
      networkId: preparedTx.networkId,
      networkName: network?.name || 'Base Mainnet',
      tokenSymbol: preparedTx.tokenSymbol,
      amount: preparedTx.amount,
      signerAddress: (connectedWallet?.address || preparedTx.signerAddress || '0x0000000000000000000000000000000000000000') as `0x${string}`,
      rawCalldata: preparedTx.rawCalldata as `0x${string}`,
      value: preparedTx.value,
      estimatedGas: preparedTx.estimatedGas,
    };
  }, [preparedTx, occurrenceId, intention.id, recipient.name, network?.name, connectedWallet?.address]);

  // Transition from preflight review to explicit authorization stage
  const handleProceedToAuthorization = () => {
    const check = verifyTransactionIntegrity(
      preparedTx,
      intention,
      recipient,
      connectedWallet?.address,
      preflightReport
    );
    if (!check.valid) {
      setIntegrityError(check.reason || 'Transaction integrity check failed.');
      return;
    }
    setIntegrityError(null);
    setSimulationStage('ready_for_authorization');
  };

  // Callback when simulated Ledger modal approves signature
  const handleLedgerApproved = (result: SignatureResult) => {
    setSignatureResult(result);
    setSimulationStage('simulated_authorized');
    setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'AUTHORIZED', {
      signingMethod: 'Ledger Signer (Simulated Demo)',
    });
  };

  // Save authorized transaction record into history
  const handleSaveAuthorizedRecord = () => {
    const nextDateStr = advanceNextDueDate(intention);
    const record: CompletedTransactionRecord = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      preparedTxId: preparedTx.id,
      intentionId: intention.id,
      occurrenceId,
      occurrenceState: 'AUTHORIZED',
      recipientId: recipient.id,
      recipientName: recipient.name,
      recipientAddress: recipient.address,
      amount: preparedTx.amount,
      tokenSymbol: preparedTx.tokenSymbol,
      networkId: preparedTx.networkId,
      txHash: signatureResult?.signature || generateSimulatedTxHash(),
      confirmedAt: new Date().toISOString(),
      executionMode: 'DEVELOPMENT_TESTNET_SIMULATION',
      isSimulation: true,
      isOnChain: false,
      status: 'CONFIRMED_ON_CHAIN',
    };
    onTransactionConfirmed(record, nextDateStr);
    onClose();
    onViewHistory();
  };

  // Human Approval Layer Actions: APPROVE, REJECT, DEFER
  const handleApproveAndBroadcast = async () => {
    // 1. Synchronous in-flight guard to prevent rapid double-clicks
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    try {
      const existingRec = getOccurrenceRecord(occurrenceId);
      const allHistory = loadCompletedTransactions();
      const existingHistory = allHistory.find(
        (h) =>
          (h.occurrenceId && h.occurrenceId === occurrenceId) ||
          (h.intentionId === intention.id &&
            h.status === 'BROADCAST_SUBMITTED' &&
            h.confirmedAt.startsWith(intention.nextDueDate))
      );

      if (
        existingRec &&
        (existingRec.state === 'CONFIRMED' ||
          existingRec.state === 'SUBMITTED' ||
          existingRec.state === 'AUTHORIZED' ||
          existingRec.state === 'SIGNING')
      ) {
        setIntegrityError(
          `Duplicate Execution Protected — Occurrence ${occurrenceId} is currently in state [${existingRec.state}] and cannot be submitted again.`
        );
        isSubmittingRef.current = false;
        return;
      }

      if (
        existingHistory &&
        (existingHistory.status === 'BROADCAST_SUBMITTED' ||
          existingHistory.status === 'CONFIRMED_ON_CHAIN')
      ) {
        setIntegrityError(
          `Duplicate Execution Protected — Occurrence ${occurrenceId} already has an active ${existingHistory.status === 'CONFIRMED_ON_CHAIN' ? 'confirmed' : 'pending broadcast'} transaction record.`
        );
        isSubmittingRef.current = false;
        return;
      }

      if (existingRec && existingRec.state === 'REJECTED') {
        setIntegrityError(`Rejected Occurrence Protected — Occurrence ${occurrenceId} was REJECTED and cannot be authorized or executed.`);
        isSubmittingRef.current = false;
        return;
      }

      // Lock occurrence in APPROVED and SIGNING states
      setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'APPROVED');
      setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'SIGNING');

      await handleBroadcastTransaction();
    } catch (err: any) {
      isSubmittingRef.current = false;
      deleteOccurrenceRecord(occurrenceId);
      setSimulationStage('ready_for_authorization');
      setIntegrityError(err?.message || 'Transaction authorization error occurred.');
    }
  };

  const handleRejectOccurrence = () => {
    isSubmittingRef.current = false;
    setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'REJECTED');
    if (onRejectOccurrence) {
      onRejectOccurrence(occurrenceId, intention.id);
    }
    onClose();
  };

  const handleDeferOccurrence = () => {
    isSubmittingRef.current = false;
    setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'DEFERRED');
    if (onDeferOccurrence) {
      onDeferOccurrence(occurrenceId, intention.id);
    }
    onClose();
  };

  // Live Wallet Execution / Broadcast (EIP-1193 eth_sendTransaction)
  const handleBroadcastTransaction = async () => {
    const existingRec = getOccurrenceRecord(occurrenceId);
    if (existingRec && existingRec.state === 'REJECTED') {
      setIntegrityError(`Rejected Occurrence Protected — Occurrence ${occurrenceId} was REJECTED and cannot be executed.`);
      isSubmittingRef.current = false;
      return;
    }

    // 1. Re-verify transaction integrity against authoritative intention and verified recipient
    const check = verifyTransactionIntegrity(
      preparedTx,
      intention,
      recipient,
      connectedWallet?.address,
      preflightReport
    );
    if (!check.valid) {
      setIntegrityError(check.reason || 'Transaction integrity check failed.');
      setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'FAILED', { error: check.reason });
      isSubmittingRef.current = false;
      return;
    }

    // 2. Ensure preflight has not blocked the transaction
    if (!preflightReport.canProceed) {
      setIntegrityError('Transaction preflight safety checks are currently in BLOCKED state.');
      setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'FAILED', { error: 'Preflight blocked' });
      isSubmittingRef.current = false;
      return;
    }

    // 3. Confirm wallet is connected
    if (!connectedWallet?.isConnected || !connectedWallet.address) {
      setIntegrityError('Wallet connection is required to authorize and broadcast on Base Mainnet. Please connect your MetaMask wallet.');
      isSubmittingRef.current = false;
      return;
    }

    // 4. Confirm wallet is on Base Mainnet (8453)
    if (connectedWallet.chainId && connectedWallet.chainId !== BASE_MAINNET_CHAIN_ID) {
      try {
        const switchRes = await switchToBaseMainnet();
        if (!switchRes.success) {
          setIntegrityError(`Connected wallet is on Chain ID ${connectedWallet.chainId}. Please switch network to Base Mainnet (${BASE_MAINNET_CHAIN_ID}) before authorizing.`);
          deleteOccurrenceRecord(occurrenceId);
          isSubmittingRef.current = false;
          return;
        }
      } catch {
        setIntegrityError(`Connected wallet is on Chain ID ${connectedWallet.chainId}. Please switch network to Base Mainnet (${BASE_MAINNET_CHAIN_ID}) before authorizing.`);
        deleteOccurrenceRecord(occurrenceId);
        isSubmittingRef.current = false;
        return;
      }
    }

    // 5. Confirm connected signer matches the prepared signer
    if (
      preparedTx.signerAddress &&
      connectedWallet.address.toLowerCase() !== preparedTx.signerAddress.toLowerCase()
    ) {
      setIntegrityError(`Connected wallet account (${connectedWallet.address.slice(0, 6)}...${connectedWallet.address.slice(-4)}) does not match the prepared signer (${preparedTx.signerAddress.slice(0, 6)}...${preparedTx.signerAddress.slice(-4)}). Please re-prepare transaction with current account.`);
      deleteOccurrenceRecord(occurrenceId);
      isSubmittingRef.current = false;
      return;
    }

    setIntegrityError(null);
    setSimulationStage('simulating_broadcast');

    // Target contract destination: For ERC20 USDC, the target contract is Base USDC. For ETH, recipient address.
    const token = SUPPORTED_TOKENS.find((t) => t.symbol === intention.tokenSymbol) || SUPPORTED_TOKENS[0];
    const targetContractAddress = (token.symbol === 'ETH'
      ? preparedTx.recipientAddress
      : token.contractAddress) as `0x${string}`;

    // Request real-wallet execution through active EIP-1193 provider
    const result = await sendEIP1193Transaction({
      from: connectedWallet.address as `0x${string}`,
      to: targetContractAddress,
      data: preparedTx.rawCalldata,
      value: preparedTx.value,
      onLateSuccess: (realTxHash) => {
        // Late wallet response reconciliation (Requirement 5)
        setSimulatedTxHash(realTxHash);
        setSimulationStage('simulated_broadcast');
        setReceiptStatus('BROADCAST_SUBMITTED');
        setIntegrityError(null);

        setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'SUBMITTED', {
          txHash: realTxHash,
          signingMethod: connectedWallet.providerName || 'MetaMask',
        });
        isSubmittingRef.current = false;

        const broadcastRecord: CompletedTransactionRecord = {
          id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          preparedTxId: preparedTx.id,
          intentionId: intention.id,
          occurrenceId,
          occurrenceState: 'SUBMITTED',
          recipientId: recipient.id,
          recipientName: recipient.name,
          recipientAddress: recipient.address,
          amount: preparedTx.amount,
          tokenSymbol: preparedTx.tokenSymbol,
          networkId: preparedTx.networkId,
          txHash: realTxHash,
          confirmedAt: new Date().toISOString(),
          executionMode: 'BASE_MAINNET_LIVE_EXECUTION',
          isSimulation: false,
          isOnChain: true,
          status: 'BROADCAST_SUBMITTED',
        };

        onTransactionConfirmed(broadcastRecord, '');
      },
    });

    if (!result.success || !result.txHash) {
      // Wallet cancellation or broadcast failure returns user safely to authorization stage
      setSimulationStage('ready_for_authorization');
      setIntegrityError(result.error || 'Transaction authorization was cancelled or failed in wallet.');
      
      const isExplicitRejection = result.isUserRejected || /rejected|cancelled|denied/i.test(result.error || '');
      if (isExplicitRejection) {
        // Explicit user rejection: record REJECTED and unlock/delete occurrence
        setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'REJECTED', {
          error: result.error,
        });
        deleteOccurrenceRecord(occurrenceId);
        isSubmittingRef.current = false;
      } else {
        // Ambiguous result / timeout / network drop / unknown state: NEVER delete occurrence record.
        // Preserve durable UNKNOWN/SIGNING lock and block automatic resubmission.
        setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'SIGNING', {
          error: result.error,
        });
        isSubmittingRef.current = true;
      }
      return;
    }

    // Broadcast Submitted: Real on-chain transaction hash received from EIP-1193 provider
    const realTxHash = result.txHash;
    setSimulatedTxHash(realTxHash);
    setSimulationStage('simulated_broadcast');
    setReceiptStatus('BROADCAST_SUBMITTED');

    // Lock occurrence in SUBMITTED state permanently for this occurrence
    setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'SUBMITTED', {
      txHash: realTxHash,
      signingMethod: connectedWallet.providerName || 'MetaMask',
    });
    // Submission successful: in-flight guard remains locked
    isSubmittingRef.current = true;

    const broadcastRecord: CompletedTransactionRecord = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      preparedTxId: preparedTx.id,
      intentionId: intention.id,
      occurrenceId,
      occurrenceState: 'SUBMITTED',
      recipientId: recipient.id,
      recipientName: recipient.name,
      recipientAddress: recipient.address,
      amount: preparedTx.amount,
      tokenSymbol: preparedTx.tokenSymbol,
      networkId: preparedTx.networkId,
      txHash: realTxHash,
      confirmedAt: new Date().toISOString(),
      executionMode: 'BASE_MAINNET_LIVE_EXECUTION',
      isSimulation: false,
      isOnChain: true,
      status: 'BROADCAST_SUBMITTED',
    };

    // Store broadcast record in history immediately (does NOT advance recurrence because status is BROADCAST_SUBMITTED)
    onTransactionConfirmed(broadcastRecord, '');

    // Clear any previous receipt polling intervals
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);

    // Continuous receipt polling: 3-second interval up to 90 seconds (Base block time ~2 seconds)
    setIsCheckingReceipt(true);
    let isFinished = false;

    const queryReceipt = async () => {
      if (isFinished) return;
      try {
        const receiptCheck = await checkTransactionReceipt(realTxHash);
        if (isFinished) return;
        setReceiptStatus(receiptCheck.status);

        if (receiptCheck.status === 'CONFIRMED_ON_CHAIN') {
          isFinished = true;
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
          setIsCheckingReceipt(false);
          setSimulationStage('simulated_confirmed');

          setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'CONFIRMED', {
            txHash: realTxHash,
            blockNumber: receiptCheck.blockNumber,
          });

          const nextDateStr = advanceNextDueDate(intention);
          const confirmedRecord: CompletedTransactionRecord = {
            ...broadcastRecord,
            occurrenceState: 'CONFIRMED',
            status: 'CONFIRMED_ON_CHAIN',
            blockNumber: receiptCheck.blockNumber,
          };
          onTransactionConfirmed(confirmedRecord, nextDateStr);
        } else if (receiptCheck.status === 'FAILED_ON_CHAIN') {
          isFinished = true;
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
          setIsCheckingReceipt(false);

          setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'FAILED', {
            txHash: realTxHash,
            blockNumber: receiptCheck.blockNumber,
          });

          const failedRecord: CompletedTransactionRecord = {
            ...broadcastRecord,
            occurrenceState: 'FAILED',
            status: 'FAILED_ON_CHAIN',
            blockNumber: receiptCheck.blockNumber,
          };
          onTransactionConfirmed(failedRecord, '');
        }
      } catch {
        // Non-blocking: will retry next interval or background check
      }
    };

    // Initial immediate receipt query
    queryReceipt();

    // Polling interval
    pollIntervalRef.current = setInterval(queryReceipt, 3000);

    // Stop active polling after 90 seconds (remains pending in history, user can manually recheck or refresh)
    pollTimeoutRef.current = setTimeout(() => {
      if (!isFinished) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setIsCheckingReceipt(false);
      }
    }, 90000);
  };

  const handleManualCheckReceipt = async () => {
    if (!simulatedTxHash || !simulatedTxHash.startsWith('0x')) return;
    setIsCheckingReceipt(true);
    try {
      const check = await checkTransactionReceipt(simulatedTxHash);
      setReceiptStatus(check.status);

      const recordBase: CompletedTransactionRecord = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        preparedTxId: preparedTx.id,
        intentionId: intention.id,
        occurrenceId,
        occurrenceState: check.status === 'CONFIRMED_ON_CHAIN' ? 'CONFIRMED' : check.status === 'FAILED_ON_CHAIN' ? 'FAILED' : 'SUBMITTED',
        recipientId: recipient.id,
        recipientName: recipient.name,
        recipientAddress: recipient.address,
        amount: preparedTx.amount,
        tokenSymbol: preparedTx.tokenSymbol,
        networkId: preparedTx.networkId,
        txHash: simulatedTxHash,
        confirmedAt: new Date().toISOString(),
        executionMode: 'BASE_MAINNET_LIVE_EXECUTION',
        isSimulation: false,
        isOnChain: true,
        status: check.status,
        blockNumber: check.blockNumber,
      };

      if (check.status === 'CONFIRMED_ON_CHAIN') {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        setSimulationStage('simulated_confirmed');
        setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'CONFIRMED', {
          txHash: simulatedTxHash,
          blockNumber: check.blockNumber,
        });
        const nextDateStr = advanceNextDueDate(intention);
        onTransactionConfirmed(recordBase, nextDateStr);
      } else if (check.status === 'FAILED_ON_CHAIN') {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        setOccurrenceState(occurrenceId, intention.id, intention.nextDueDate, 'FAILED', {
          txHash: simulatedTxHash,
          blockNumber: check.blockNumber,
        });
        onTransactionConfirmed(recordBase, '');
      }
    } finally {
      setIsCheckingReceipt(false);
    }
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
    <div className="fixed inset-0 z-50 bg-jexi-overlay backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-lg shadow-2xl space-y-4 max-h-[92vh] flex flex-col overflow-hidden text-jexi-primary">
        {/* Header */}
        <div className="p-4 border-b border-jexi-subtle flex items-center justify-between shrink-0 bg-jexi-elevated/40">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-jexi-primary">Transaction Preparation</h3>
              <p className="text-[10px] text-jexi-muted font-mono">Preparation ID: #{preparedTx.id.replace('tx_prep_', '')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-jexi-muted hover:text-jexi-primary p-1 text-sm font-semibold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Unsigned Transaction Status Ribbon */}
          <div className="p-3 bg-signa-elevated border border-signa-subtle rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <div>
                <div className="text-xs font-bold text-signa-primary uppercase tracking-wider">
                  {simulationStage === 'ready_for_review' && 'Status: Unsigned Transaction'}
                  {simulationStage === 'ready_for_authorization' && 'Status: Ready for Authorization'}
                  {simulationStage === 'ledger_signing' && 'Status: Ledger Signing (Simulated Demo)'}
                  {simulationStage === 'simulated_authorized' && 'Status: Transaction Authorized'}
                  {simulationStage === 'simulating_broadcast' && 'Status: Processing Broadcast...'}
                  {simulationStage === 'simulated_broadcast' && 'Status: Broadcast Submitted'}
                  {simulationStage === 'simulated_confirmed' && 'Status: Transaction Confirmed On-Chain'}
                </div>
                <div className="text-[10px] text-signa-muted">
                  {simulationStage === 'ready_for_review'
                    ? 'Prepared safely • Awaiting review and preflight validation'
                    : simulationStage === 'ready_for_authorization'
                    ? 'Transaction prepared successfully • Awaiting your authorization'
                    : 'Deterministic safety verified • Ready for self-custodial signing'}
                </div>
              </div>
            </div>

            <span
              className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                simulationStage === 'simulated_confirmed' || simulationStage === 'simulated_authorized'
                  ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40'
                  : simulationStage === 'ready_for_authorization'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-signa-surface text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40'
              }`}
            >
              {simulationStage === 'ready_for_review'
                ? 'UNSIGNED'
                : simulationStage === 'ready_for_authorization'
                ? 'PREPARED'
                : simulationStage === 'simulated_authorized'
                ? 'AUTHORIZED'
                : 'PREVIEW'}
            </span>
          </div>

          {/* Integrity Error Banner */}
          {integrityError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/50 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-900 dark:text-rose-300 block">Pre-Execution Integrity Blocked</span>
                <span className="text-[11px] text-rose-800 dark:text-rose-200 block mt-0.5 leading-relaxed">{integrityError}</span>
              </div>
            </div>
          )}

          {/* Completed Intention Alert Banner */}
          {(intention.isCompleted || (intention.frequency === 'once' && (intention.isCompleted || !!intention.completedAt))) && !integrityError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/50 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-900 dark:text-rose-300 block">One-Time Intention Already Completed</span>
                <span className="text-[11px] text-rose-800 dark:text-rose-200 block mt-0.5 leading-relaxed">
                  This one-time payment intention has already completed its lifecycle and is terminal. Further authorization and execution are strictly blocked.
                </span>
              </div>
            </div>
          )}

          {/* Rejected Intention Alert Banner */}
          {(intention.isRejected || (intention.frequency === 'once' && (intention.isRejected || !!intention.rejectedAt))) && !integrityError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/50 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-900 dark:text-rose-300 block">One-Time Intention Rejected</span>
                <span className="text-[11px] text-rose-800 dark:text-rose-200 block mt-0.5 leading-relaxed">
                  This one-time payment intention was rejected and is terminal. Further authorization and execution are strictly blocked.
                </span>
              </div>
            </div>
          )}

          {/* Inactive Intention Alert Banner */}
          {!intention.active && !intention.isCompleted && !(intention.frequency === 'once' && !!intention.completedAt) && !integrityError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/50 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-900 dark:text-rose-300 block">Intention Inactive or Paused</span>
                <span className="text-[11px] text-rose-800 dark:text-rose-200 block mt-0.5 leading-relaxed">
                  This scheduled intention is currently paused or inactive. Transaction signing and execution are blocked.
                </span>
              </div>
            </div>
          )}

          {/* Early Execution Notice Banner if executed before scheduled date */}
          {isEarlyExecution && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/50 rounded-xl flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-800 dark:text-amber-300 block">Early Payment Execution</span>
                <span className="text-[11px] text-jexi-secondary block mt-0.5 leading-relaxed">
                  This payment was scheduled for <strong className="text-amber-800 dark:text-amber-200">{intention.nextDueDate}{intention.scheduleTime ? ` at ${intention.scheduleTime}` : ''}</strong>. You are intentionally choosing to execute it early. The recurring schedule rule will remain unchanged and will advance to the next recurring occurrence.
                </span>
              </div>
            </div>
          )}

          {/* Signing Authority Status Banner */}
          <div className="p-3 bg-jexi-surface border border-jexi-subtle rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <Wallet className={`w-4 h-4 shrink-0 ${connectedWallet?.isConnected ? 'text-emerald-500' : 'text-jexi-muted'}`} />
              <div className="min-w-0">
                <span className="text-jexi-muted text-[10px] block uppercase font-mono">Signing Authority</span>
                {connectedWallet?.isConnected && connectedWallet.address ? (
                  <span className="font-semibold text-jexi-primary truncate block font-mono text-[11px]">
                    {connectedWallet.providerName || 'EVM Wallet'} · {connectedWallet.address.slice(0, 6)}...{connectedWallet.address.slice(-4)}
                  </span>
                ) : (
                  <span className="text-jexi-secondary font-medium block">
                    Self-Custody Mode (Disconnected Wallet)
                  </span>
                )}
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 uppercase ${
                connectedWallet?.isConnected
                  ? connectedWallet.isWrongNetwork
                    ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : 'bg-jexi-elevated text-jexi-muted border border-jexi-subtle'
              }`}
            >
              {connectedWallet?.isConnected
                ? connectedWallet.isWrongNetwork
                  ? 'Wrong Chain'
                  : 'Base'
                : 'Offline Preview'}
            </span>
          </div>

          {/* Core Transaction Card */}
          <div className="bg-jexi-surface border border-jexi-subtle rounded-xl p-4 space-y-3">
            <div className="text-center py-2 border-b border-jexi-divider">
              <span className="text-[11px] font-semibold text-jexi-muted uppercase tracking-wider">Transfer Amount</span>
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono tracking-tight mt-0.5">
                {preparedTx.amount.toLocaleString()} {formatTokenSymbol(preparedTx.tokenSymbol)}
              </div>
              <span className="text-[11px] text-jexi-muted font-medium">on {network?.name || 'Base'}</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-jexi-muted">Target Recipient</span>
                <span className="font-semibold text-jexi-primary">{recipient.name}</span>
              </div>

              <div>
                <span className="text-jexi-muted block mb-1">Destination Address</span>
                <div className="p-2 bg-jexi-elevated rounded-lg border border-jexi-subtle font-mono text-[11px] text-jexi-secondary break-all flex items-center justify-between gap-2">
                  <span>{preparedTx.recipientAddress}</span>
                  <a
                    href={`${network?.explorerUrl || 'https://basescan.org'}/address/${preparedTx.recipientAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-jexi-muted hover:text-jexi-primary transition-colors cursor-pointer"
                    title="View on Basescan"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
              </div>

              <div className="flex justify-between items-center pt-1">
                <span className="text-jexi-muted">Estimated Gas Fee</span>
                <span className="font-mono text-jexi-secondary text-[11px]">{preparedTx.estimatedGas}</span>
              </div>
            </div>

            {/* Toggle Raw Calldata */}
            <div className="pt-2 border-t border-jexi-divider">
              <button
                type="button"
                onClick={() => setShowRawPayload(!showRawPayload)}
                className="text-[11px] text-jexi-muted hover:text-jexi-primary flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{showRawPayload ? 'Hide' : 'Inspect'} Transaction Payload & Technical Data</span>
              </button>

              {showRawPayload && (
                <div className="mt-2 p-2.5 bg-jexi-elevated rounded-lg border border-jexi-subtle text-[10px] font-mono text-jexi-secondary break-all">
                  <div className="flex items-center justify-between text-jexi-muted mb-1">
                    <span>ERC20 transfer(address,uint256)</span>
                    <button
                      onClick={handleCopyCalldata}
                      className="text-jexi-muted hover:text-jexi-primary flex items-center gap-1 text-[9px] cursor-pointer"
                    >
                      {copiedCalldata ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
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

          {/* PREPARATION CONTROLLER (SELF-CUSTODY MODE) */}
          <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/50 rounded-xl p-4 space-y-3.5">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-500/20 border border-amber-200 dark:border-amber-500/40 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0 mt-0.5">
                <Cpu className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                  Self-Custody Preparation Environment
                </h4>
                <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed mt-0.5">
                  Deterministic safety preview. <strong>JEXI does not hold custody of your funds.</strong> Final transaction signing remains strictly under your hardware wallet or connected signer authority.
                </p>
              </div>
            </div>

            {/* Stepping pipeline indicators */}
            <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-semibold py-1">
              <div
                className={`p-2 rounded-lg border transition-all ${
                  simulationStage === 'ready_for_review'
                    ? 'bg-amber-100 dark:bg-amber-500/20 border-amber-300 dark:border-amber-500/50 text-amber-800 dark:text-amber-300'
                    : 'bg-signa-surface border-signa-subtle text-signa-muted'
                }`}
              >
                1. Preflight Review
              </div>
              <div
                className={`p-2 rounded-lg border transition-all ${
                  simulationStage === 'ready_for_authorization' || simulationStage === 'ledger_signing'
                    ? 'bg-sky-100 dark:bg-sky-500/20 border-sky-300 dark:border-sky-500/50 text-sky-800 dark:text-sky-300'
                    : 'bg-signa-surface border-signa-subtle text-signa-muted'
                }`}
              >
                2. Authorization
              </div>
              <div
                className={`p-2 rounded-lg border transition-all ${
                  simulationStage === 'simulated_authorized' || simulationStage === 'simulated_broadcast' || simulationStage === 'simulated_confirmed'
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300'
                    : 'bg-signa-surface border-signa-subtle text-signa-muted'
                }`}
              >
                3. Signed Result
              </div>
            </div>

            {/* Step 1: Preflight Review Controller */}
            {simulationStage === 'ready_for_review' && (
              <button
                disabled={
                  !preflightReport.canProceed ||
                  !intention.active ||
                  intention.isCompleted ||
                  intention.isRejected ||
                  (intention.frequency === 'once' && (!!intention.completedAt || !!intention.rejectedAt)) ||
                  !!integrityError
                }
                onClick={handleProceedToAuthorization}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Cpu className="w-4 h-4" />
                <span>Continue to Authorization Stage</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Step 2: READY FOR AUTHORIZATION Panel */}
            {simulationStage === 'ready_for_authorization' && (
              <div className="space-y-3 text-left border-t border-signa-divider pt-3">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      READY FOR AUTHORIZATION
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/20 px-2 py-0.5 rounded">
                      Preflight Passed
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium">
                    Transaction prepared successfully.
                  </p>
                </div>

                {/* Structured Summary Card */}
                <div className="p-3.5 bg-signa-surface border border-signa-subtle rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-signa-muted font-medium">Signing Authority:</span>
                    <span className="font-mono font-bold text-signa-primary text-[11px]">
                      {connectedWallet?.address ? `${connectedWallet.address.slice(0, 6)}...${connectedWallet.address.slice(-4)}` : preparedTx.signerAddress ? `${preparedTx.signerAddress.slice(0, 6)}...${preparedTx.signerAddress.slice(-4)}` : '0x71C...4e8B'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-signa-muted font-medium">Target Network:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                      {network?.name || 'Base Mainnet'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-signa-muted font-medium">Amount:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      {preparedTx.amount.toLocaleString()} {formatTokenSymbol(preparedTx.tokenSymbol)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-signa-muted font-medium">Recipient:</span>
                    <span className="font-semibold text-signa-primary">
                      {recipient.name} ({preparedTx.recipientAddress.slice(0, 6)}...{preparedTx.recipientAddress.slice(-4)})
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-signa-divider">
                    <span className="text-signa-muted font-medium">Status:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400 uppercase text-[11px] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Awaiting Authorization
                    </span>
                  </div>
                </div>

                {/* Signer Selection Buttons */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      const existingRec = getOccurrenceRecord(occurrenceId);
                      if (existingRec && existingRec.state === 'REJECTED') {
                        setIntegrityError(`Rejected Occurrence Protected — Occurrence ${occurrenceId} was REJECTED and cannot be signed.`);
                        return;
                      }
                      setSimulationStage('ledger_signing');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
                  >
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>Authorize via Ledger (Simulated Demo)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  {connectedWallet?.isConnected && (
                    <button
                      type="button"
                      onClick={handleApproveAndBroadcast}
                      disabled={isSubmittingRef.current || simulationStage === 'simulating_broadcast' || !!integrityError}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Wallet className="w-4 h-4" />
                      <span>Authorize & Broadcast via Wallet</span>
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleRejectOccurrence}
                      className="py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30 font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>REJECT</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeferOccurrence}
                      className="py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30 font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>DEFER</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: AUTHORIZED Panel */}
            {simulationStage === 'simulated_authorized' && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/40 rounded-xl space-y-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 uppercase">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    AUTHORIZED
                  </span>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/30">
                    SIMULATED SIGNATURE
                  </span>
                </div>

                <p className="text-xs text-emerald-800 dark:text-emerald-200 font-medium leading-relaxed">
                  The transaction has been authorized by the simulated signer.
                </p>

                {signatureResult?.signature && (
                  <div>
                    <span className="text-[10px] text-signa-muted block mb-1 font-mono">
                      Deterministic Demo Signature Result:
                    </span>
                    <div className="p-2 bg-signa-surface rounded font-mono text-[10px] text-signa-secondary break-all flex items-center justify-between gap-2 border border-signa-subtle">
                      <span className="truncate">{signatureResult.signature}</span>
                      <button
                        onClick={() => {
                          if (signatureResult.signature) {
                            navigator.clipboard.writeText(signatureResult.signature);
                          }
                        }}
                        className="p-1 text-signa-muted hover:text-signa-primary cursor-pointer shrink-0"
                        title="Copy Signature Payload"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleSaveAuthorizedRecord}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 text-xs font-bold transition-all text-center cursor-pointer shadow-xs"
                  >
                    Complete & Save Authorized Record
                  </button>

                  {connectedWallet?.isConnected && (
                    <button
                      onClick={handleApproveAndBroadcast}
                      disabled={isSubmittingRef.current || simulationStage === 'simulating_broadcast' || !!integrityError}
                      className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all text-center cursor-pointer shadow-xs"
                    >
                      Broadcast via Wallet
                    </button>
                  )}
                </div>
              </div>
            )}

            {simulationStage === 'simulating_broadcast' && (
              <div className="py-2.5 text-center text-xs text-sky-700 dark:text-sky-300 font-semibold flex items-center justify-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
                Requesting transaction authorization in your wallet...
              </div>
            )}

            {simulationStage === 'simulated_broadcast' && (
              <div className="p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-500/40 rounded-xl space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-sky-500" />
                    Transaction Broadcast Submitted
                  </span>
                  <span className="text-[10px] uppercase font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-500/20 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-500/30">
                    PENDING RECEIPT
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-jexi-muted block mb-0.5">
                    Transaction Hash (Base Mainnet):
                  </span>
                  <div className="p-2 bg-jexi-surface rounded font-mono text-[10px] text-jexi-secondary break-all flex items-center justify-between gap-2 border border-jexi-subtle">
                    <span className="truncate">{simulatedTxHash}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={`${network?.explorerUrl || 'https://basescan.org'}/tx/${simulatedTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-jexi-muted hover:text-jexi-primary transition-colors cursor-pointer"
                        title="View on BaseScan Explorer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={handleCopyHash}
                        className="p-1 text-jexi-muted hover:text-jexi-primary cursor-pointer"
                        title="Copy Transaction Hash"
                      >
                        {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-jexi-muted leading-relaxed">
                  Transaction submitted to Base Mainnet via connected wallet. Awaiting block receipt confirmation.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    disabled={isCheckingReceipt}
                    onClick={handleManualCheckReceipt}
                    className="flex-1 py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-all text-center cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isCheckingReceipt ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Checking Receipt...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Check On-Chain Receipt</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onViewHistory();
                    }}
                    className="py-2 px-3 rounded-lg bg-jexi-elevated hover:bg-jexi-hover text-jexi-primary border border-jexi-subtle text-xs font-medium transition-colors cursor-pointer"
                  >
                    View History
                  </button>
                </div>
              </div>
            )}

            {simulationStage === 'simulated_confirmed' && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/40 rounded-xl space-y-2 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    {simulatedTxHash.startsWith('0x')
                      ? `Confirmed On-Chain (${network?.name || 'Base'})`
                      : `Transaction Prepared (${network?.name || 'Base'})`}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/30">
                    {simulatedTxHash.startsWith('0x') ? 'CONFIRMED' : 'PREPARED'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-jexi-muted block mb-0.5">
                    {simulatedTxHash.startsWith('0x') ? 'Transaction Hash (Base Mainnet):' : 'Prepared Transaction Reference:'}
                  </span>
                  <div className="p-2 bg-jexi-surface rounded font-mono text-[10px] text-jexi-secondary break-all flex items-center justify-between gap-2 border border-jexi-subtle">
                    <span className="truncate">{simulatedTxHash}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {simulatedTxHash.startsWith('0x') && (
                        <a
                          href={`${network?.explorerUrl || 'https://basescan.org'}/tx/${simulatedTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 text-jexi-muted hover:text-jexi-primary transition-colors cursor-pointer"
                          title="View on Basescan Explorer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={handleCopyHash}
                        className="p-1 text-jexi-muted hover:text-jexi-primary cursor-pointer"
                        title="Copy Transaction Reference"
                      >
                        {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-jexi-muted">
                  {simulatedTxHash.startsWith('0x')
                    ? 'Transaction receipt verified on Base Mainnet (status: 0x1). Recurrence schedule updated.'
                    : 'Recorded in local transaction history. JEXI prepares transactions safely; funds remain under your self-custody.'}
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      onClose();
                      onViewHistory();
                    }}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 text-xs font-bold transition-all text-center cursor-pointer shadow-xs"
                  >
                    View In Transaction History
                  </button>
                  <button
                    onClick={onClose}
                    className="py-2 px-3 rounded-lg bg-jexi-elevated hover:bg-jexi-hover text-jexi-primary border border-jexi-subtle text-xs font-medium transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-signa-subtle bg-signa-elevated/40 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-signa-muted">
            JEXI Self-Custody Engine • Non-custodial Architecture
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-signa-elevated hover:bg-signa-hover text-signa-primary border border-signa-subtle text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Simulated Ledger Hardware Signer Modal */}
      {simulationStage === 'ledger_signing' && (
        <SimulatedLedgerModal
          request={signingRequest}
          onClose={() => setSimulationStage('ready_for_authorization')}
          onApproved={handleLedgerApproved}
          onRejected={handleRejectOccurrence}
        />
      )}
    </div>
  );
};
