/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShieldCheck, User, Radio } from 'lucide-react';
import { Header } from './components/Header';
import { BottomNav, NavTab } from './components/BottomNav';
import { DashboardView } from './components/DashboardView';
import { IntentionsView } from './components/IntentionsView';
import { RecipientsView } from './components/RecipientsView';
import { CalendarView } from './components/CalendarView';
import { HistoryView } from './components/HistoryView';
import { PaymentDetailModal } from './components/PaymentDetailModal';
import { TransactionPreparationModal } from './components/TransactionPreparationModal';
import { AccountModal } from './components/AccountModal';
import {
  Recipient,
  PaymentIntention,
  CompletedTransactionRecord,
  PreparedTransaction,
  UserAccount,
  AppInitState,
} from './types';
import {
  loadRecipients,
  saveRecipients,
  loadIntentions,
  saveIntentions,
  loadCompletedTransactions,
  saveCompletedTransactions,
  resetAllToDemo,
  getCurrentUser,
  saveCurrentUser,
  attachFirebaseAuthUser,
  setOccurrenceState,
  getOccurrenceRecord,
  deleteOccurrenceRecord,
} from './storage/storage';
import {
  ConnectedWalletBalance,
  INITIAL_WALLET_BALANCE,
  fetchLiveWalletBalance,
} from './lib/balance';
import { subscribeToAuthState } from './lib/firebase';
import {
  syncAccountToCloud,
  loadAndApplyCloudData,
  subscribeSyncStatus,
  SyncStatus,
} from './lib/firestoreSync';
import { prepareUnsignedTransaction } from './utils/preflight';
import { getTodayDateString, BASE_MAINNET_CHAIN_ID } from './constants';
import {
  advanceNextDueDate,
  formatScheduleCadence,
  getIntentionStatus,
  isBeforeScheduledDatetime,
  reconcileCompletedIntentions,
  getOccurrenceId,
} from './utils/scheduler';
import {
  WalletState,
  WalletProviderId,
  INITIAL_WALLET_STATE,
  connectBrowserWallet,
  disconnectBrowserWallet,
  switchToBaseMainnet,
  subscribeToWalletEvents,
  checkConnectedWallet,
  isLedgerLiveEnvironment,
  getEthereumProvider,
  parseChainId,
  checkTransactionReceipt,
} from './lib/wallet';
import { ConnectWalletModal } from './components/ConnectWalletModal';
import { SecurityPinModal, PinModalMode } from './components/SecurityPinModal';
import { hasUserSecurityPin } from './lib/securityPin';

export default function App() {
  const [initState, setInitState] = useState<AppInitState>('initializing');
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [intentions, setIntentions] = useState<PaymentIntention[]>([]);
  const [history, setHistory] = useState<CompletedTransactionRecord[]>([]);
  const [walletBalance, setWalletBalance] = useState<ConnectedWalletBalance>(INITIAL_WALLET_BALANCE);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  // SIGNA Security PIN State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<PinModalMode>('verify');
  const [pendingIntentionToAuthorize, setPendingIntentionToAuthorize] = useState<PaymentIntention | null>(null);
  const [pinActionTitle, setPinActionTitle] = useState('Authorize Scheduled Payment');
  const [pinActionDescription, setPinActionDescription] = useState('Enter your Security PIN to proceed.');

  // Wallet Connection State
  const [walletState, setWalletState] = useState<WalletState>(INITIAL_WALLET_STATE);

  // Cloud Synchronization state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | undefined>(undefined);

  // Subscribe to sync status
  useEffect(() => {
    const unsub = subscribeSyncStatus((status, lastSynced, err) => {
      setSyncStatus(status);
      setLastSyncedAt(lastSynced);
      setSyncError(err);
    });
    return () => unsub();
  }, []);

  // Synchronize with Firebase Auth state and load cloud account data
  useEffect(() => {
    let isMounted = true;

    // Safety fallback timeout: ensures the barrier transitions to ready if auth resolution is delayed
    const fallbackTimer = setTimeout(() => {
      if (isMounted) {
        setInitState('ready');
      }
    }, 4000);

    const unsubscribe = subscribeToAuthState(async (fbUser) => {
      clearTimeout(fallbackTimer);
      try {
        if (fbUser) {
          const isUnverifiedEmail = fbUser.provider === 'email' && !fbUser.emailVerified;

          if (isUnverifiedEmail) {
            // Unverified email account:
            // 1. Do NOT grant full SIGNA access
            // 2. Do NOT perform cloud data loading/synchronization
            if (isMounted) {
              setCurrentUser(fbUser);
              setRecipients([]);
              setIntentions([]);
              setHistory([]);
              setIsAccountModalOpen(true);
            }
            return;
          }

          attachFirebaseAuthUser(fbUser);
          if (isMounted) {
            setCurrentUser(fbUser);
            setIsAccountModalOpen(false);
          }

          // Safely load and merge cloud data for this verified user
          await loadAndApplyCloudData(fbUser);
          if (isMounted) {
            setRecipients(loadRecipients());
            const loadedHistory = loadCompletedTransactions();
            const reconciledIntentions = reconcileCompletedIntentions(loadIntentions(), loadedHistory);
            saveIntentions(reconciledIntentions);
            setIntentions(reconciledIntentions);
            setHistory(loadedHistory);

            for (const h of loadedHistory) {
              if (h.status === 'BROADCAST_SUBMITTED' && h.txHash && h.txHash.startsWith('0x')) {
                checkTransactionReceipt(h.txHash).then((receiptCheck) => {
                  if (receiptCheck.status === 'CONFIRMED_ON_CHAIN' || receiptCheck.status === 'FAILED_ON_CHAIN') {
                    handleRecheckReceipt(h);
                  }
                }).catch(() => {});
              }
            }
          }
        } else {
          // No active Firebase user
          const stored = getCurrentUser();
          if (!stored || stored.provider !== 'local') {
            saveCurrentUser(null);
            if (isMounted) {
              setCurrentUser(null);
              setRecipients([]);
              setIntentions([]);
              setHistory([]);
            }
          }
        }
      } catch (err) {
        console.error('Initialization error during auth/hydration:', err);
        // Do not destructively wipe currentUser if already set
      } finally {
        if (isMounted) {
          setInitState('ready');
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  // Check for pre-existing wallet connection and listen for account/chain events
  useEffect(() => {
    let isSubscribed = true;

    const isSupportedBaseNetwork = (cid: number | null): boolean => {
      return cid === BASE_MAINNET_CHAIN_ID;
    };

    // Check if wallet is already connected, or auto-connect if inside Ledger Wallet environment
    checkConnectedWallet().then(async ({ address, chainId, providerId, providerName }) => {
      if (!isSubscribed) return;
      if (address) {
        setWalletState({
          address,
          chainId,
          providerId,
          providerName,
          isConnecting: false,
          isConnected: true,
          isWrongNetwork: chainId !== null && !isSupportedBaseNetwork(chainId),
          isAvailable: true,
          error: null,
        });
      } else if (isLedgerLiveEnvironment()) {
        // Step 5: Safe Ledger auto-connect inside Ledger Wallet dApp WebView
        try {
          const ledgerResult = await connectBrowserWallet('ledger');
          if (!isSubscribed) return;
          if (ledgerResult.address) {
            setWalletState({
              address: ledgerResult.address,
              chainId: ledgerResult.chainId || BASE_MAINNET_CHAIN_ID,
              providerId: 'ledger',
              providerName: 'Ledger',
              isConnecting: false,
              isConnected: true,
              isWrongNetwork: ledgerResult.chainId !== null && !isSupportedBaseNetwork(ledgerResult.chainId),
              isAvailable: true,
              error: null,
            });
          }
        } catch {
          // Non-blocking: user can still click connect manually
        }
      }
    });

    // Subscribe to EIP-1193 events
    const unsubEvents = subscribeToWalletEvents({
      onAccountsChanged: (accounts) => {
        if (!isSubscribed) return;
        if (accounts.length === 0) {
          setWalletState(disconnectBrowserWallet());
        } else {
          try {
            const checksummed = accounts[0] as `0x${string}`;
            setWalletState((prev) => ({
              ...prev,
              address: checksummed,
              isConnected: true,
              isConnecting: false,
              error: null,
            }));
          } catch {
            // ignore invalid address
          }
        }
      },
      onChainChanged: (chainIdHex) => {
        if (!isSubscribed) return;
        const newChainId = parseChainId(chainIdHex);
        setWalletState((prev) => ({
          ...prev,
          chainId: newChainId,
          isWrongNetwork: newChainId !== null && !isSupportedBaseNetwork(newChainId),
        }));
      },
      onDisconnect: () => {
        if (!isSubscribed) return;
        setWalletState(disconnectBrowserWallet());
      },
    });

    return () => {
      isSubscribed = false;
      unsubEvents();
    };
  }, []);

  // Live Connected Wallet Balance Sync
  useEffect(() => {
    let isCancelled = false;

    if (!walletState.isConnected || !walletState.address) {
      setWalletBalance(INITIAL_WALLET_BALANCE);
      return;
    }

    setWalletBalance({ status: 'loading', usdc: null, formatted: null });

    fetchLiveWalletBalance(walletState.address, walletState.chainId)
      .then((res) => {
        if (!isCancelled) {
          setWalletBalance(res);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setWalletBalance({ status: 'unavailable', usdc: null, formatted: null });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [walletState.isConnected, walletState.address, walletState.chainId]);

  // Wallet user action handlers
  const handleConnectWallet = async (targetProviderId?: WalletProviderId) => {
    setWalletState((prev) => ({ ...prev, isConnecting: true, error: null }));
    const result = await connectBrowserWallet(targetProviderId);

    if (result.address) {
      const connectedChainId = result.chainId || BASE_MAINNET_CHAIN_ID;
      const isSupported = result.chainId === null || result.chainId === BASE_MAINNET_CHAIN_ID;
      setWalletState({
        address: result.address,
        chainId: connectedChainId,
        providerId: result.providerId,
        providerName: result.providerName,
        isConnecting: false,
        isConnected: true,
        isWrongNetwork: result.chainId !== null && !isSupported,
        isAvailable: true,
        error: null,
      });
      setIsWalletModalOpen(false);

      // Trigger immediate live on-chain balance query for the connected address
      fetchLiveWalletBalance(result.address, connectedChainId)
        .then(setWalletBalance)
        .catch(() => {
          setWalletBalance({ status: 'unavailable', usdc: null, formatted: null, error: 'Query failed' });
        });
    } else {
      setWalletState((prev) => ({
        ...prev,
        isConnecting: false,
        error: result.error || 'Failed to connect wallet',
      }));
    }
  };

  const handleDisconnectWallet = () => {
    setWalletState(disconnectBrowserWallet());
    setWalletBalance(INITIAL_WALLET_BALANCE);
  };

  const handleSwitchNetwork = async () => {
    const res = await switchToBaseMainnet();
    if (res.success) {
      const provider = getEthereumProvider();
      if (provider) {
        try {
          const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
          const newChainId = parseChainId(chainHex) ?? BASE_MAINNET_CHAIN_ID;
          setWalletState((prev) => ({
            ...prev,
            chainId: newChainId,
            isWrongNetwork: newChainId !== BASE_MAINNET_CHAIN_ID,
            error: null,
          }));
        } catch {
          setWalletState((prev) => ({
            ...prev,
            chainId: BASE_MAINNET_CHAIN_ID,
            isWrongNetwork: false,
            error: null,
          }));
        }
      } else {
        setWalletState((prev) => ({
          ...prev,
          chainId: BASE_MAINNET_CHAIN_ID,
          isWrongNetwork: false,
          error: null,
        }));
      }
    } else if (res.error) {
      setWalletState((prev) => ({ ...prev, error: res.error || null }));
    }
  };

  // Modals state
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [activePreparedTx, setActivePreparedTx] = useState<PreparedTransaction | null>(null);
  const [isPreparedTxEarly, setIsPreparedTxEarly] = useState(false);
  const [earlyExecutionCandidate, setEarlyExecutionCandidate] = useState<PaymentIntention | null>(null);
  const [activeDetailIntention, setActiveDetailIntention] = useState<PaymentIntention | null>(null);

  // Routing / Filter state passed between tabs
  const [preselectedRecipientId, setPreselectedRecipientId] = useState<string | null>(null);
  const [historyRecipientFilter, setHistoryRecipientFilter] = useState<string | null>(null);
  const [integrityNotice, setIntegrityNotice] = useState<{ message: string; type: 'info' | 'warning' } | null>(null);

  // Auto-dismiss integrity notice after 7 seconds
  useEffect(() => {
    if (integrityNotice) {
      const timer = setTimeout(() => {
        setIntegrityNotice(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [integrityNotice]);

  const todayStr = getTodayDateString();
  const dueCount = intentions.filter((i) => {
    const status = getIntentionStatus(i);
    return status === 'OVERDUE' || status === 'DUE_TODAY';
  }).length;

  // Handlers for Recipients
  const handleAddRecipient = (newRec: Recipient) => {
    if (!currentUser || (currentUser.provider === 'email' && !currentUser.emailVerified)) {
      setIsAccountModalOpen(true);
      return;
    }
    const updated = [newRec, ...recipients];
    setRecipients(updated);
    saveRecipients(updated);
    syncAccountToCloud(currentUser);
  };

  const handleUpdateRecipient = (updatedRec: Recipient) => {
    if (!currentUser || (currentUser.provider === 'email' && !currentUser.emailVerified)) {
      setIsAccountModalOpen(true);
      return;
    }
    const updated = recipients.map((r) => (r.id === updatedRec.id ? updatedRec : r));
    setRecipients(updated);
    saveRecipients(updated);
    syncAccountToCloud(currentUser);
  };

  const handleDeleteRecipient = (id: string) => {
    if (!currentUser || (currentUser.provider === 'email' && !currentUser.emailVerified)) {
      setIsAccountModalOpen(true);
      return;
    }
    const updated = recipients.filter((r) => r.id !== id);
    setRecipients(updated);
    saveRecipients(updated);
    // Also remove associated intentions
    const updatedIntentions = intentions.filter((i) => i.recipientId !== id);
    setIntentions(updatedIntentions);
    saveIntentions(updatedIntentions);
    syncAccountToCloud(currentUser);
  };

  const commitAddIntention = (newIntention: PaymentIntention) => {
    if (!currentUser || (currentUser.provider === 'email' && !currentUser.emailVerified)) {
      setIsAccountModalOpen(true);
      return;
    }
    const updated = [newIntention, ...intentions];
    setIntentions(updated);
    saveIntentions(updated);
    syncAccountToCloud(currentUser);
  };

  // Handlers for Intentions
  const handleAddIntention = (newIntention: PaymentIntention) => {
    // Unauthenticated user guard: strictly block creation and direct to auth
    if (!currentUser || (currentUser.provider === 'email' && !currentUser.emailVerified)) {
      setIsAccountModalOpen(true);
      return;
    }

    // Authenticated user: require Security PIN authorization
    const hasPin = hasUserSecurityPin(currentUser.id);
    setPendingIntentionToAuthorize(newIntention);
    if (!hasPin) {
      setPinModalMode('create');
      setPinActionTitle('Create Your JEXI Security PIN');
      setPinActionDescription('Before scheduling payments, create a 4–8 digit Security PIN to authorize sensitive actions.');
    } else {
      setPinModalMode('verify');
      setPinActionTitle('Authorize Scheduled Payment');
      setPinActionDescription(`Enter your Security PIN to schedule payment of ${newIntention.amount} ${newIntention.tokenSymbol}.`);
    }
    setIsPinModalOpen(true);
  };

  const handlePinSuccess = () => {
    setIsPinModalOpen(false);
    if (pendingIntentionToAuthorize) {
      commitAddIntention(pendingIntentionToAuthorize);
      setPendingIntentionToAuthorize(null);
    }
  };

  const handlePinCancel = () => {
    setIsPinModalOpen(false);
    setPendingIntentionToAuthorize(null);
  };

  const handleDeleteIntention = (id: string) => {
    if (!currentUser || (currentUser.provider === 'email' && !currentUser.emailVerified)) return;
    const updated = intentions.filter((i) => i.id !== id);
    setIntentions(updated);
    saveIntentions(updated);
    syncAccountToCloud(currentUser);
  };

  const handleToggleIntentionActive = (id: string) => {
    if (!currentUser || (currentUser.provider === 'email' && !currentUser.emailVerified)) return;
    const target = intentions.find((i) => i.id === id);
    if (!target) return;

    // Terminal invariant: a completed or rejected one-time intention can NEVER be resumed or transitioned to active
    if (
      target.isCompleted ||
      target.isRejected ||
      (target.frequency === 'once' && (target.isCompleted || !!target.completedAt || target.isRejected || !!target.rejectedAt))
    ) {
      console.warn(`[SIGNA Security] Blocked attempt to toggle or resume completed or rejected one-time intention: ${id}`);
      return;
    }

    const updated = intentions.map((i) => (i.id === id ? { ...i, active: !i.active } : i));
    setIntentions(updated);
    saveIntentions(updated);
    syncAccountToCloud(currentUser);
  };

  // Skip occurrence without executing transaction
  const handleSkipOccurrence = (intentionId: string) => {
    if (!currentUser || (currentUser.provider === 'email' && !currentUser.emailVerified)) return;
    const target = intentions.find((i) => i.id === intentionId);
    if (!target) return;

    // Terminal invariant: cannot skip completed or rejected one-time intention
    if (
      target.isCompleted ||
      target.isRejected ||
      (target.frequency === 'once' && (target.isCompleted || !!target.completedAt || target.isRejected || !!target.rejectedAt))
    ) {
      return;
    }

    const updatedIntentions = intentions.map((intent) => {
      if (intent.id === intentionId) {
        const nextDate = advanceNextDueDate(intent);
        return {
          ...intent,
          nextDueDate: nextDate,
          lastCheckedAt: new Date().toISOString(),
        };
      }
      return intent;
    });
    setIntentions(updatedIntentions);
    saveIntentions(updatedIntentions);
    syncAccountToCloud(currentUser);
  };

  // Prepare Transaction Action (with Early Execution detection)
  const handlePrepareTransaction = async (intention: PaymentIntention, bypassEarlyConfirm?: boolean) => {
    if (!currentUser || (currentUser.provider === 'email' && !currentUser.emailVerified)) {
      setIsAccountModalOpen(true);
      return;
    }

    // Terminal invariant: Reject transaction preparation for completed or rejected one-time intentions
    if (
      intention.isCompleted ||
      intention.isRejected ||
      (intention.frequency === 'once' && (intention.isCompleted || !!intention.completedAt || intention.isRejected || !!intention.rejectedAt))
    ) {
      console.warn(`[SIGNA Security] Blocked transaction preparation for completed or rejected one-time intention: ${intention.id}`);
      return;
    }

    // Guard against preparing a previously rejected occurrence
    const occId = getOccurrenceId(intention.id, intention.nextDueDate);
    const existingOccRecord = getOccurrenceRecord(occId);

    // Guard: Block preparation of locked, submitted, or confirmed occurrences
    const matchingHistory = history.find(
      (h) =>
        (h.occurrenceId && h.occurrenceId === occId) ||
        (h.intentionId === intention.id &&
          h.status === 'BROADCAST_SUBMITTED' &&
          h.confirmedAt.startsWith(intention.nextDueDate))
    );

    if (
      existingOccRecord?.state === 'SUBMITTED' ||
      existingOccRecord?.state === 'CONFIRMED' ||
      matchingHistory?.status === 'BROADCAST_SUBMITTED' ||
      matchingHistory?.status === 'CONFIRMED_ON_CHAIN'
    ) {
      const isPending =
        existingOccRecord?.state === 'SUBMITTED' || matchingHistory?.status === 'BROADCAST_SUBMITTED';

      console.warn(
        `[SIGNA Security] Blocked transaction preparation: occurrence ${occId} is already in state [${existingOccRecord?.state || matchingHistory?.status}]`
      );

      // Direct the user to its existing pending History record or receipt-check action
      setActiveTab('history');
      setHistoryRecipientFilter(intention.recipientId);
      setIntegrityNotice({
        message: isPending
          ? `Occurrence ${occId} has already been submitted to Base Mainnet and is awaiting on-chain confirmation. Re-check its receipt in History.`
          : `Occurrence ${occId} has already been confirmed on Base Mainnet.`,
        type: 'info',
      });
      return;
    }

    if (existingOccRecord && existingOccRecord.state === 'REJECTED') {
      // If erroneously marked REJECTED due to a wallet authorization error/cancellation rather than human intention rejection:
      if (
        existingOccRecord.error &&
        (existingOccRecord.error.includes('wallet') ||
          existingOccRecord.error.includes('Wallet') ||
          existingOccRecord.error.includes('cancelled') ||
          existingOccRecord.error.includes('rejected in your wallet') ||
          existingOccRecord.error.includes('failed in wallet'))
      ) {
        deleteOccurrenceRecord(occId);
      } else {
        console.warn(`[SIGNA Security] Blocked transaction preparation for previously rejected occurrence: ${occId}`);
        if (intention.frequency === 'once') {
          return;
        }
      }
    }

    const recipient = recipients.find((r) => r.id === intention.recipientId);
    if (!recipient) return;

    const isEarly = isBeforeScheduledDatetime(intention);

    // Check if the scheduled payment datetime has not yet arrived (future date or earlier today before scheduled time)
    if (!bypassEarlyConfirm && isEarly) {
      setEarlyExecutionCandidate(intention);
      return;
    }

    setIsPreparedTxEarly(isEarly);

    let activeLiveBalance = walletBalance;
    const targetChainId = BASE_MAINNET_CHAIN_ID;

    // If wallet is connected, ALWAYS verify fresh on-chain balance for the target chain before preparing
    if (walletState.isConnected && walletState.address) {
      try {
        activeLiveBalance = await fetchLiveWalletBalance(
          walletState.address as `0x${string}`,
          targetChainId
        );
        setWalletBalance(activeLiveBalance);
      } catch {
        activeLiveBalance = {
          status: 'unavailable',
          usdc: null,
          formatted: null,
          raw: null,
          error: 'RPC balance query failed',
        };
        setWalletBalance(activeLiveBalance);
      }
    }

    const prepared = prepareUnsignedTransaction(
      recipient,
      intention,
      walletState.address,
      walletState.providerName,
      {
        walletState,
        liveBalance: activeLiveBalance,
      }
    );
    setActivePreparedTx(prepared);
  };

  // Confirmation on Testnet Simulation or Live Execution
  const handleTransactionConfirmed = (
    completedRecord: CompletedTransactionRecord,
    updatedNextDueDate: string
  ) => {
    if (!currentUser || (currentUser.provider === 'email' && !currentUser.emailVerified)) return;
    // 1. Save or Update in History
    const existingIndex = history.findIndex(
      (h) => (completedRecord.txHash && h.txHash === completedRecord.txHash) || h.id === completedRecord.id
    );
    let updatedHistory: CompletedTransactionRecord[];
    if (existingIndex >= 0) {
      updatedHistory = [...history];
      updatedHistory[existingIndex] = completedRecord;
    } else {
      updatedHistory = [completedRecord, ...history];
    }
    setHistory(updatedHistory);
    saveCompletedTransactions(updatedHistory);

    // 2. Refresh live balance if wallet connected
    if (walletState.isConnected && walletState.address) {
      fetchLiveWalletBalance(walletState.address, walletState.chainId).then(setWalletBalance);
    }

    // 3. Recurrence Rule: Only advance next due date or mark completed if CONFIRMED on-chain or simulated.
    // A broadcast transaction (pending) or reverted transaction MUST NOT advance recurrence!
    const isConfirmed = completedRecord.status === 'CONFIRMED_ON_CHAIN' || completedRecord.isSimulation;
    if (!isConfirmed) {
      syncAccountToCloud(currentUser, true);
      return;
    }

    const completionTimestamp = new Date().toISOString();
    const updatedIntentions = intentions.map((intent) => {
      if (intent.id === completedRecord.intentionId) {
        if (intent.frequency === 'once') {
          return {
            ...intent,
            active: false,
            isCompleted: true,
            completedAt: completionTimestamp,
            lastCheckedAt: completionTimestamp,
          };
        }
        return {
          ...intent,
          nextDueDate: updatedNextDueDate,
          lastCheckedAt: completionTimestamp,
        };
      }
      return intent;
    });
    setIntentions(updatedIntentions);
    saveIntentions(updatedIntentions);

    // Immediately persist completed transaction and updated balance to cloud
    syncAccountToCloud(currentUser, true);
  };

  // Recover and reconcile submitted on-chain transactions idempotently
  const handleRecheckReceipt = async (txRecord: CompletedTransactionRecord) => {
    if (!txRecord.txHash || !txRecord.txHash.startsWith('0x')) return;

    try {
      const receiptCheck = await checkTransactionReceipt(txRecord.txHash);

      if (receiptCheck.status === 'CONFIRMED_ON_CHAIN') {
        const existingIndex = history.findIndex(
          (h) => (h.txHash && h.txHash.toLowerCase() === txRecord.txHash.toLowerCase()) || h.id === txRecord.id
        );

        // Idempotency check: if this transaction is already marked confirmed, do not re-advance or duplicate
        if (existingIndex >= 0 && history[existingIndex].status === 'CONFIRMED_ON_CHAIN') {
          setIntegrityNotice({
            message: `Transaction ${txRecord.txHash.slice(0, 10)}... is confirmed on Base Mainnet (Block #${receiptCheck.blockNumber || history[existingIndex].blockNumber}).`,
            type: 'info',
          });
          return;
        }

        const confirmedRecord: CompletedTransactionRecord = {
          ...txRecord,
          status: 'CONFIRMED_ON_CHAIN',
          occurrenceState: 'CONFIRMED',
          blockNumber: receiptCheck.blockNumber ?? txRecord.blockNumber,
        };

        let updatedHistory: CompletedTransactionRecord[];
        if (existingIndex >= 0) {
          updatedHistory = [...history];
          updatedHistory[existingIndex] = confirmedRecord;
        } else {
          updatedHistory = [confirmedRecord, ...history];
        }
        setHistory(updatedHistory);
        saveCompletedTransactions(updatedHistory);

        // Reconcile occurrence record
        if (txRecord.occurrenceId) {
          const target = intentions.find((i) => i.id === txRecord.intentionId);
          setOccurrenceState(
            txRecord.occurrenceId,
            txRecord.intentionId,
            target?.nextDueDate || new Date().toISOString().split('T')[0],
            'CONFIRMED',
            { txHash: txRecord.txHash, blockNumber: receiptCheck.blockNumber }
          );
        }

        // Reconcile intention recurrence or one-time completion (strictly idempotent)
        const targetIntention = intentions.find((i) => i.id === txRecord.intentionId);
        if (targetIntention) {
          const completionTimestamp = new Date().toISOString();
          const updatedIntentions = intentions.map((intent) => {
            if (intent.id === targetIntention.id) {
              if (intent.frequency === 'once') {
                if (!intent.isCompleted) {
                  return {
                    ...intent,
                    active: false,
                    isCompleted: true,
                    completedAt: completionTimestamp,
                    lastCheckedAt: completionTimestamp,
                  };
                }
                return intent;
              } else {
                // For recurring intentions: only advance if the confirmed occurrence matches current nextDueDate!
                const currentOccId = getOccurrenceId(intent.id, intent.nextDueDate);
                if (txRecord.occurrenceId && txRecord.occurrenceId === currentOccId) {
                  const nextDueDate = advanceNextDueDate(intent);
                  return {
                    ...intent,
                    nextDueDate,
                    lastCheckedAt: completionTimestamp,
                  };
                }
                return intent;
              }
            }
            return intent;
          });
          setIntentions(updatedIntentions);
          saveIntentions(updatedIntentions);
        }

        // Refresh live balance if wallet connected
        if (walletState.isConnected && walletState.address) {
          fetchLiveWalletBalance(walletState.address, walletState.chainId).then(setWalletBalance);
        }

        if (currentUser) {
          syncAccountToCloud(currentUser, true);
        }

        setIntegrityNotice({
          message: `Receipt verified! Transaction confirmed on Base Mainnet (Block #${receiptCheck.blockNumber}). State updated successfully.`,
          type: 'info',
        });
      } else if (receiptCheck.status === 'FAILED_ON_CHAIN') {
        const existingIndex = history.findIndex(
          (h) => (h.txHash && h.txHash.toLowerCase() === txRecord.txHash.toLowerCase()) || h.id === txRecord.id
        );

        const failedRecord: CompletedTransactionRecord = {
          ...txRecord,
          status: 'FAILED_ON_CHAIN',
          occurrenceState: 'FAILED',
          blockNumber: receiptCheck.blockNumber ?? txRecord.blockNumber,
        };

        let updatedHistory: CompletedTransactionRecord[];
        if (existingIndex >= 0) {
          updatedHistory = [...history];
          updatedHistory[existingIndex] = failedRecord;
        } else {
          updatedHistory = [failedRecord, ...history];
        }
        setHistory(updatedHistory);
        saveCompletedTransactions(updatedHistory);

        if (txRecord.occurrenceId) {
          const target = intentions.find((i) => i.id === txRecord.intentionId);
          setOccurrenceState(
            txRecord.occurrenceId,
            txRecord.intentionId,
            target?.nextDueDate || new Date().toISOString().split('T')[0],
            'FAILED',
            { txHash: txRecord.txHash, blockNumber: receiptCheck.blockNumber }
          );
        }

        if (currentUser) {
          syncAccountToCloud(currentUser, true);
        }

        setIntegrityNotice({
          message: `On-chain execution failed (Status 0x0 / reverted on Base Mainnet). Occurrence marked as FAILED.`,
          type: 'warning',
        });
      } else {
        // Still pending (receipt not yet mined)
        setIntegrityNotice({
          message: `Transaction ${txRecord.txHash.slice(0, 10)}... is still pending on-chain confirmation. You can check again shortly.`,
          type: 'info',
        });
      }
    } catch (e) {
      console.error('Failed to re-check transaction receipt:', e);
      setIntegrityNotice({
        message: 'Could not query Base Mainnet receipt. Network or provider error.',
        type: 'warning',
      });
    }
  };

  // Reject occurrence action
  const handleRejectOccurrence = (occurrenceId: string, intentionId?: string) => {
    const targetIntention = intentions.find(
      (i) => i.id === (intentionId || activePreparedTx?.intentionId)
    );
    if (!targetIntention) {
      setActivePreparedTx(null);
      setIsPreparedTxEarly(false);
      return;
    }

    const rejectionTimestamp = new Date().toISOString();

    // 1. Persist occurrence record as REJECTED
    setOccurrenceState(
      occurrenceId,
      targetIntention.id,
      targetIntention.nextDueDate,
      'REJECTED'
    );

    // 2. Update intention lifecycle
    const updatedIntentions = intentions.map((intent) => {
      if (intent.id === targetIntention.id) {
        if (intent.frequency === 'once') {
          // Terminal invariant: Rejecting a one-time payment intention permanently marks it rejected & inactive
          return {
            ...intent,
            active: false,
            isRejected: true,
            rejectedAt: rejectionTimestamp,
            lastCheckedAt: rejectionTimestamp,
          };
        }
        // Recurring intention: Advance nextDueDate to next scheduled occurrence while preserving recurrence rule
        const nextDate = advanceNextDueDate(intent);
        return {
          ...intent,
          nextDueDate: nextDate,
          lastCheckedAt: rejectionTimestamp,
        };
      }
      return intent;
    });

    setIntentions(updatedIntentions);
    saveIntentions(updatedIntentions);
    syncAccountToCloud(currentUser, true);

    setActivePreparedTx(null);
    setIsPreparedTxEarly(false);
  };

  // Defer occurrence action
  const handleDeferOccurrence = (occurrenceId: string, intentionId?: string) => {
    const targetIntention = intentions.find(
      (i) => i.id === (intentionId || activePreparedTx?.intentionId)
    );
    if (targetIntention) {
      // Record DEFERRED occurrence state without advancing schedule or making terminal
      setOccurrenceState(
        occurrenceId,
        targetIntention.id,
        targetIntention.nextDueDate,
        'DEFERRED'
      );

      const timestamp = new Date().toISOString();
      const updatedIntentions = intentions.map((intent) => {
        if (intent.id === targetIntention.id) {
          return {
            ...intent,
            lastCheckedAt: timestamp,
          };
        }
        return intent;
      });

      setIntentions(updatedIntentions);
      saveIntentions(updatedIntentions);
      syncAccountToCloud(currentUser);
    }

    setActivePreparedTx(null);
    setIsPreparedTxEarly(false);
  };

  // Manual state refresh / schedule recalculation
  const handleRefresh = async () => {
    if (currentUser && currentUser.provider !== 'local') {
      await loadAndApplyCloudData(currentUser);
    }
    setRecipients(loadRecipients());
    const loadedHistory = loadCompletedTransactions();
    const reconciledIntentions = reconcileCompletedIntentions(loadIntentions(), loadedHistory);
    saveIntentions(reconciledIntentions);
    setIntentions(reconciledIntentions);
    setHistory(loadedHistory);

    for (const h of loadedHistory) {
      if (h.status === 'BROADCAST_SUBMITTED' && h.txHash && h.txHash.startsWith('0x')) {
        checkTransactionReceipt(h.txHash).then((receiptCheck) => {
          if (receiptCheck.status === 'CONFIRMED_ON_CHAIN' || receiptCheck.status === 'FAILED_ON_CHAIN') {
            handleRecheckReceipt(h);
          }
        }).catch(() => {});
      }
    }
    if (walletState.isConnected && walletState.address) {
      fetchLiveWalletBalance(walletState.address, walletState.chainId).then(setWalletBalance);
    } else {
      setWalletBalance(INITIAL_WALLET_BALANCE);
    }
    setCurrentUser(getCurrentUser());
  };

  // Reset Demo Data
  const handleResetDemo = () => {
    if (confirm('Restore workspace to the default sample dataset? This will reinitialize sample recipients and payment intentions.')) {
      resetAllToDemo();
      setRecipients(loadRecipients());
      setIntentions(loadIntentions());
      setHistory(loadCompletedTransactions());
      if (walletState.isConnected && walletState.address) {
        fetchLiveWalletBalance(walletState.address, walletState.chainId).then(setWalletBalance);
      } else {
        setWalletBalance(INITIAL_WALLET_BALANCE);
      }
      setCurrentUser(getCurrentUser());
      setActivePreparedTx(null);
      setActiveDetailIntention(null);
      setEarlyExecutionCandidate(null);
      setIsPreparedTxEarly(false);
      syncAccountToCloud(currentUser);
    }
  };

  const isAuthenticated = Boolean(
    currentUser && (currentUser.provider !== 'email' || currentUser.emailVerified)
  );

  if (initState === 'initializing') {
    return (
      <div className="min-h-screen bg-signa-app text-signa-primary flex flex-col items-center justify-center font-sans antialiased p-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-10 h-10 rounded-xl bg-signa-surface border border-signa-subtle flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-sm font-semibold text-signa-primary">Initializing JEXI</h1>
            <p className="text-xs text-signa-muted">Synchronizing secure session and account data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-signa-app text-signa-primary flex flex-col font-sans antialiased w-full overflow-x-hidden">
        {/* Clean Top Bar */}
        <header className="border-b border-signa-subtle bg-signa-surface/80 backdrop-blur-md px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-signa-elevated border border-signa-subtle flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="font-bold text-base text-signa-primary tracking-tight">JEXI</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-signa-elevated border border-signa-subtle text-signa-secondary text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Base Mainnet (8453)</span>
          </div>
        </header>

        {/* Auth Barrier Content */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full bg-signa-surface border border-signa-subtle rounded-2xl p-6 sm:p-8 space-y-6 text-center shadow-lg dark:shadow-none">
            <div className="w-12 h-12 rounded-xl bg-signa-elevated border border-signa-subtle flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-signa-primary">Sign in or create your JEXI account.</h2>
              <p className="text-xs text-signa-muted font-medium">
                Your secure workspace starts here.
              </p>
            </div>

            <button
              onClick={() => setIsAccountModalOpen(true)}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <User className="w-4 h-4" />
              <span>Sign In / Create Account</span>
            </button>

            <p className="text-[11px] text-signa-muted pt-1 leading-relaxed">
              Self-custody payment memory · Zero private key storage · Deterministic safety verification
            </p>
          </div>
        </div>

        {/* Account Modal for Sign In / Sign Up / Verification */}
        <AccountModal
          isOpen={isAccountModalOpen}
          onClose={() => {
            setIsAccountModalOpen(false);
          }}
          currentUser={currentUser}
          onUserChange={async (user) => {
            setCurrentUser(user);
            if (user && (user.emailVerified || user.provider !== 'email')) {
              attachFirebaseAuthUser(user);
              await loadAndApplyCloudData(user);
              setRecipients(loadRecipients());
              setIntentions(loadIntentions());
              setHistory(loadCompletedTransactions());
              setIsAccountModalOpen(false);
            } else if (!user) {
              saveCurrentUser(null);
              setRecipients([]);
              setIntentions([]);
              setHistory([]);
              setIsAccountModalOpen(true);
            } else {
              setIsAccountModalOpen(true);
            }
          }}
          recipientsCount={0}
          intentionsCount={0}
          historyCount={0}
          syncStatus={syncStatus}
          lastSyncedAt={lastSyncedAt}
          syncError={syncError}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-signa-app text-signa-primary flex flex-col font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-700 dark:selection:bg-emerald-500/30 dark:selection:text-emerald-200 w-full overflow-x-hidden">
      {/* Top Header */}
      <Header
        walletBalance={walletBalance}
        onRefresh={handleRefresh}
        onResetDemo={handleResetDemo}
        currentUser={currentUser}
        onOpenAccount={() => setIsAccountModalOpen(true)}
        syncStatus={syncStatus}
        walletState={walletState}
        onConnectWallet={() => setIsWalletModalOpen(true)}
        onSwitchNetwork={handleSwitchNetwork}
        onClearWalletError={() => setWalletState((prev) => ({ ...prev, error: null }))}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-28">
        {/* Transaction Integrity Banner */}
        {integrityNotice && (
          <div className="mb-4 p-3.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-500/50 rounded-xl flex items-start justify-between gap-3 text-xs text-sky-800 dark:text-sky-200 shadow-xs">
            <div className="flex items-start gap-2.5">
              <Radio className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <span className="font-bold text-sky-950 dark:text-sky-100 block">Transaction Integrity Notice</span>
                <span className="text-[11px] text-sky-800 dark:text-sky-200 block mt-0.5 leading-relaxed">{integrityNotice.message}</span>
              </div>
            </div>
            <button
              onClick={() => setIntegrityNotice(null)}
              className="p-1 text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-200 text-xs font-semibold cursor-pointer shrink-0"
              title="Dismiss Notice"
            >
              ✕
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            intentions={intentions}
            recipients={recipients}
            completedCount={history.length}
            onNavigateTab={setActiveTab}
            onPrepareTransaction={handlePrepareTransaction}
            onOpenNewIntention={() => {
              setPreselectedRecipientId(null);
              setActiveTab('intentions');
            }}
            onOpenNewRecipient={() => {
              setActiveTab('recipients');
            }}
            onSkipOccurrence={handleSkipOccurrence}
          />
        )}

        {activeTab === 'intentions' && (
          <IntentionsView
            intentions={intentions}
            recipients={recipients}
            onAddIntention={handleAddIntention}
            onDeleteIntention={handleDeleteIntention}
            onToggleIntentionActive={handleToggleIntentionActive}
            onPrepareTransaction={handlePrepareTransaction}
            onViewDetail={(intent) => setActiveDetailIntention(intent)}
            onAddRecipient={handleAddRecipient}
            onSkipOccurrence={handleSkipOccurrence}
            preselectedRecipientId={preselectedRecipientId}
            onClearPreselectedRecipient={() => setPreselectedRecipientId(null)}
          />
        )}

        {activeTab === 'recipients' && (
          <RecipientsView
            recipients={recipients}
            intentions={intentions}
            onAddRecipient={handleAddRecipient}
            onUpdateRecipient={handleUpdateRecipient}
            onDeleteRecipient={handleDeleteRecipient}
            onSelectRecipientForIntention={(recId) => {
              setPreselectedRecipientId(recId);
              setActiveTab('intentions');
            }}
            onSelectRecipientForHistory={(recId) => {
              setHistoryRecipientFilter(recId);
              setActiveTab('history');
            }}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarView
            intentions={intentions}
            recipients={recipients}
            history={history}
            onPrepareTransaction={handlePrepareTransaction}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            history={history}
            recipients={recipients}
            selectedRecipientIdFilter={historyRecipientFilter}
            onClearFilter={() => setHistoryRecipientFilter(null)}
            onRecheckReceipt={handleRecheckReceipt}
          />
        )}
      </main>

      {/* Early Execution Explicit Confirmation Dialog */}
      {earlyExecutionCandidate && (
        <div className="fixed inset-0 z-50 bg-signa-overlay backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-signa-modal border border-signa-subtle rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 text-signa-primary">
            <div className="flex items-center gap-3 pb-3 border-b border-signa-subtle">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-signa-primary">Early Payment Execution</h3>
                <p className="text-xs text-signa-muted">Scheduled payment advance review</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/40 rounded-xl space-y-2 text-xs">
              <p className="text-amber-800 dark:text-amber-200 font-medium leading-relaxed">
                This payment is scheduled for <strong className="text-amber-900 dark:text-amber-300 font-bold">{earlyExecutionCandidate.nextDueDate}{earlyExecutionCandidate.scheduleTime ? ` at ${earlyExecutionCandidate.scheduleTime}` : ''}</strong>. You are choosing to execute it early.
              </p>
              <div className="pt-2 border-t border-amber-200 dark:border-amber-500/20 space-y-1.5 text-signa-secondary">
                <div className="flex justify-between">
                  <span className="text-signa-muted">Recipient:</span>
                  <span className="font-semibold text-signa-primary">
                    {recipients.find((r) => r.id === earlyExecutionCandidate.recipientId)?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-signa-muted">Amount:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {earlyExecutionCandidate.amount.toLocaleString()} {earlyExecutionCandidate.tokenSymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-signa-muted">Recurrence Cadence:</span>
                  <span className="text-signa-secondary font-medium">
                    {formatScheduleCadence(earlyExecutionCandidate)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-signa-surface border border-signa-subtle rounded-xl text-xs text-signa-secondary space-y-1">
              <p className="text-signa-primary font-medium">Schedule Continuity Guarantee</p>
              <p className="text-[11px] leading-relaxed text-signa-muted">
                The recurring schedule will remain unchanged and will advance to the next recurring occurrence in accordance with the recurrence rule.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-signa-divider">
              <button
                type="button"
                onClick={() => setEarlyExecutionCandidate(null)}
                className="px-4 py-2 rounded-lg bg-signa-elevated hover:bg-signa-hover text-signa-secondary border border-signa-subtle text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const candidate = earlyExecutionCandidate;
                  setEarlyExecutionCandidate(null);
                  handlePrepareTransaction(candidate, true);
                }}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white dark:bg-amber-400 dark:hover:bg-amber-300 dark:text-zinc-950 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>Proceed with Early Execution</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Inspection Modal */}
      {activeDetailIntention && (
        <PaymentDetailModal
          intention={activeDetailIntention}
          recipient={
            recipients.find((r) => r.id === activeDetailIntention.recipientId) || recipients[0]
          }
          onClose={() => setActiveDetailIntention(null)}
          onPrepareTransaction={(intent) => {
            setActiveDetailIntention(null);
            handlePrepareTransaction(intent);
          }}
        />
      )}

      {/* Transaction Preparation & Simulation Modal */}
      {activePreparedTx && (() => {
        const matchingIntention = intentions.find((i) => i.id === activePreparedTx.intentionId);
        const matchingRecipient = recipients.find((r) => r.id === activePreparedTx.recipientId);
        if (!matchingIntention) return null;
        return (
          <TransactionPreparationModal
            preparedTx={activePreparedTx}
            intention={matchingIntention}
            recipient={
              matchingRecipient || {
                id: activePreparedTx.recipientId,
                name: activePreparedTx.recipientName || 'Unregistered Recipient',
                address: activePreparedTx.recipientAddress,
              }
            }
            isEarlyExecution={isPreparedTxEarly}
            connectedWallet={walletState}
            liveBalance={walletBalance}
            onClose={() => {
              setActivePreparedTx(null);
              setIsPreparedTxEarly(false);
            }}
            onTransactionConfirmed={handleTransactionConfirmed}
            onViewHistory={() => {
              setActivePreparedTx(null);
              setIsPreparedTxEarly(false);
              setActiveTab('history');
            }}
            onRejectOccurrence={handleRejectOccurrence}
            onDeferOccurrence={handleDeferOccurrence}
          />
        );
      })()}

      {/* Connect Wallet Modal */}
      <ConnectWalletModal
        isOpen={isWalletModalOpen}
        onClose={() => {
          setIsWalletModalOpen(false);
          setWalletState((prev) => ({ ...prev, error: null }));
        }}
        walletState={walletState}
        onConnectProvider={handleConnectWallet}
        onDisconnect={handleDisconnectWallet}
        onSwitchNetwork={handleSwitchNetwork}
      />

      {/* Account & Cross-Device Synchronization Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => {
          if (currentUser?.provider === 'email' && !currentUser.emailVerified) {
            setIsAccountModalOpen(true);
          } else {
            setIsAccountModalOpen(false);
          }
        }}
        currentUser={currentUser}
        onUserChange={async (user) => {
          setCurrentUser(user);
          if (user && (user.emailVerified || user.provider !== 'email')) {
            attachFirebaseAuthUser(user);
            await loadAndApplyCloudData(user);
            handleRefresh();
            setIsAccountModalOpen(false);
          } else if (!user) {
            saveCurrentUser(null);
            setRecipients([]);
            setIntentions([]);
            setHistory([]);
            setIsAccountModalOpen(true);
          } else {
            setIsAccountModalOpen(true);
          }
        }}
        recipientsCount={recipients.length}
        intentionsCount={intentions.length}
        historyCount={history.length}
        onDataRestored={() => {
          handleRefresh();
        }}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        syncError={syncError}
        onManualSync={async () => {
          if (currentUser && (currentUser.emailVerified || currentUser.provider !== 'email')) {
            await syncAccountToCloud(currentUser, true);
          }
        }}
        onOpenPinModal={(mode) => {
          setPinModalMode(mode);
          setPinActionTitle(mode === 'create' ? 'Create JEXI Security PIN' : 'Change Security PIN');
          setPinActionDescription(
            mode === 'create'
              ? 'Choose a 4–8 digit Security PIN to protect sensitive actions.'
              : 'Enter your current PIN and choose a new Security PIN.'
          );
          setIsPinModalOpen(true);
        }}
      />

      {/* SIGNA Security PIN Authorization / Setup Modal */}
      {currentUser && (
        <SecurityPinModal
          isOpen={isPinModalOpen}
          mode={pinModalMode}
          userId={currentUser.id}
          actionTitle={pinActionTitle}
          actionDescription={pinActionDescription}
          onSuccess={handlePinSuccess}
          onCancel={handlePinCancel}
        />
      )}

      {/* Mobile-first Bottom Navigation */}
      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} dueCount={dueCount} />
    </div>
  );
}
