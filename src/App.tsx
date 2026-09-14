/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
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
  loadTestnetBalance,
  deductTestnetBalance,
  resetAllToDemo,
  TestnetWalletBalance,
  getCurrentUser,
  saveCurrentUser,
  attachFirebaseAuthUser,
} from './storage/storage';
import { subscribeToAuthState } from './lib/firebase';
import {
  syncAccountToCloud,
  loadAndApplyCloudData,
  subscribeSyncStatus,
  SyncStatus,
} from './lib/firestoreSync';
import { prepareUnsignedTransaction } from './utils/preflight';
import { getTodayDateString, BASE_SEPOLIA_CHAIN_ID } from './constants';
import { advanceNextDueDate, formatScheduleCadence, getIntentionStatus } from './utils/scheduler';
import {
  WalletState,
  INITIAL_WALLET_STATE,
  connectBrowserWallet,
  switchToBaseSepolia,
  subscribeToWalletEvents,
  checkConnectedWallet,
} from './lib/wallet';

export default function App() {
  const [initState, setInitState] = useState<AppInitState>('initializing');
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [intentions, setIntentions] = useState<PaymentIntention[]>([]);
  const [history, setHistory] = useState<CompletedTransactionRecord[]>([]);
  const [balance, setBalance] = useState<TestnetWalletBalance>(() => loadTestnetBalance());
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

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
        setRecipients(loadRecipients());
        setIntentions(loadIntentions());
        setHistory(loadCompletedTransactions());
        setBalance(loadTestnetBalance());
        const stored = getCurrentUser();
        if (stored) setCurrentUser(stored);
        setInitState('ready');
      }
    }, 4000);

    const unsubscribe = subscribeToAuthState(async (fbUser) => {
      clearTimeout(fallbackTimer);
      try {
        if (fbUser) {
          attachFirebaseAuthUser(fbUser);
          if (isMounted) setCurrentUser(fbUser);

          // Safely load and merge cloud data for this user
          await loadAndApplyCloudData(fbUser);
          if (isMounted) {
            setRecipients(loadRecipients());
            setIntentions(loadIntentions());
            setHistory(loadCompletedTransactions());
            setBalance(loadTestnetBalance());
          }
        } else {
          const stored = getCurrentUser();
          if (stored && stored.provider !== 'local') {
            saveCurrentUser(null);
            if (isMounted) setCurrentUser(null);
          } else if (stored && isMounted) {
            setCurrentUser(stored);
          }
          if (isMounted) {
            setRecipients(loadRecipients());
            setIntentions(loadIntentions());
            setHistory(loadCompletedTransactions());
            setBalance(loadTestnetBalance());
          }
        }
      } catch (err) {
        console.error('Initialization error during auth/hydration:', err);
        if (isMounted) {
          setRecipients(loadRecipients());
          setIntentions(loadIntentions());
          setHistory(loadCompletedTransactions());
          setBalance(loadTestnetBalance());
        }
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

    // Check if wallet is already connected
    checkConnectedWallet().then(({ address, chainId }) => {
      if (!isSubscribed) return;
      if (address) {
        setWalletState({
          address,
          chainId,
          isConnecting: false,
          isConnected: true,
          isWrongNetwork: chainId !== null && chainId !== BASE_SEPOLIA_CHAIN_ID,
          isAvailable: true,
          error: null,
        });
      }
    });

    // Subscribe to EIP-1193 events
    const unsubEvents = subscribeToWalletEvents({
      onAccountsChanged: (accounts) => {
        if (!isSubscribed) return;
        if (accounts.length === 0) {
          setWalletState((prev) => ({
            ...prev,
            address: null,
            isConnected: false,
            isConnecting: false,
            error: null,
          }));
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
        const newChainId = parseInt(chainIdHex, 16);
        setWalletState((prev) => ({
          ...prev,
          chainId: newChainId,
          isWrongNetwork: newChainId !== BASE_SEPOLIA_CHAIN_ID,
        }));
      },
      onDisconnect: () => {
        if (!isSubscribed) return;
        setWalletState((prev) => ({
          ...prev,
          address: null,
          isConnected: false,
          isConnecting: false,
        }));
      },
    });

    return () => {
      isSubscribed = false;
      unsubEvents();
    };
  }, []);

  // Wallet user action handlers
  const handleConnectWallet = async () => {
    setWalletState((prev) => ({ ...prev, isConnecting: true, error: null }));
    const result = await connectBrowserWallet();

    if (result.address) {
      setWalletState({
        address: result.address,
        chainId: result.chainId,
        isConnecting: false,
        isConnected: true,
        isWrongNetwork: result.chainId !== null && result.chainId !== BASE_SEPOLIA_CHAIN_ID,
        isAvailable: true,
        error: null,
      });
    } else {
      setWalletState((prev) => ({
        ...prev,
        isConnecting: false,
        error: result.error || 'Failed to connect wallet',
      }));
    }
  };

  const handleSwitchNetwork = async () => {
    const res = await switchToBaseSepolia();
    if (!res.success && res.error) {
      setWalletState((prev) => ({ ...prev, error: res.error || null }));
    }
  };

  // Modals state
  const [activePreparedTx, setActivePreparedTx] = useState<PreparedTransaction | null>(null);
  const [isPreparedTxEarly, setIsPreparedTxEarly] = useState(false);
  const [earlyExecutionCandidate, setEarlyExecutionCandidate] = useState<PaymentIntention | null>(null);
  const [activeDetailIntention, setActiveDetailIntention] = useState<PaymentIntention | null>(null);

  // Routing / Filter state passed between tabs
  const [preselectedRecipientId, setPreselectedRecipientId] = useState<string | null>(null);
  const [historyRecipientFilter, setHistoryRecipientFilter] = useState<string | null>(null);

  const todayStr = getTodayDateString();
  const dueCount = intentions.filter((i) => {
    const status = getIntentionStatus(i);
    return status === 'OVERDUE' || status === 'DUE_TODAY';
  }).length;

  // Handlers for Recipients
  const handleAddRecipient = (newRec: Recipient) => {
    const updated = [newRec, ...recipients];
    setRecipients(updated);
    saveRecipients(updated);
    syncAccountToCloud(currentUser);
  };

  const handleUpdateRecipient = (updatedRec: Recipient) => {
    const updated = recipients.map((r) => (r.id === updatedRec.id ? updatedRec : r));
    setRecipients(updated);
    saveRecipients(updated);
    syncAccountToCloud(currentUser);
  };

  const handleDeleteRecipient = (id: string) => {
    const updated = recipients.filter((r) => r.id !== id);
    setRecipients(updated);
    saveRecipients(updated);
    // Also remove associated intentions
    const updatedIntentions = intentions.filter((i) => i.recipientId !== id);
    setIntentions(updatedIntentions);
    saveIntentions(updatedIntentions);
    syncAccountToCloud(currentUser);
  };

  // Handlers for Intentions
  const handleAddIntention = (newIntention: PaymentIntention) => {
    const updated = [newIntention, ...intentions];
    setIntentions(updated);
    saveIntentions(updated);
    syncAccountToCloud(currentUser);
  };

  const handleDeleteIntention = (id: string) => {
    const updated = intentions.filter((i) => i.id !== id);
    setIntentions(updated);
    saveIntentions(updated);
    syncAccountToCloud(currentUser);
  };

  const handleToggleIntentionActive = (id: string) => {
    const updated = intentions.map((i) => (i.id === id ? { ...i, active: !i.active } : i));
    setIntentions(updated);
    saveIntentions(updated);
    syncAccountToCloud(currentUser);
  };

  // Skip occurrence without executing transaction
  const handleSkipOccurrence = (intentionId: string) => {
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
  const handlePrepareTransaction = (intention: PaymentIntention, bypassEarlyConfirm?: boolean) => {
    const recipient = recipients.find((r) => r.id === intention.recipientId);
    if (!recipient) return;

    const status = getIntentionStatus(intention);
    const isEarly = status === 'UPCOMING';

    // Check if the scheduled payment date is upcoming in the future
    if (!bypassEarlyConfirm && isEarly) {
      setEarlyExecutionCandidate(intention);
      return;
    }

    setIsPreparedTxEarly(isEarly);
    const prepared = prepareUnsignedTransaction(recipient, intention);
    setActivePreparedTx(prepared);
  };

  // Confirmation on Testnet Simulation
  const handleTransactionConfirmed = (
    completedRecord: CompletedTransactionRecord,
    updatedNextDueDate: string
  ) => {
    // 1. Save to History
    const updatedHistory = [completedRecord, ...history];
    setHistory(updatedHistory);
    saveCompletedTransactions(updatedHistory);

    // 2. Deduct testnet balance
    deductTestnetBalance(completedRecord.tokenSymbol, completedRecord.amount);
    setBalance(loadTestnetBalance());

    // 3. Advance Next Due Date for recurring intention (or mark inactive if once)
    const updatedIntentions = intentions.map((intent) => {
      if (intent.id === completedRecord.intentionId) {
        return {
          ...intent,
          nextDueDate: updatedNextDueDate,
          active: intent.frequency === 'once' ? false : intent.active,
          lastCheckedAt: new Date().toISOString(),
        };
      }
      return intent;
    });
    setIntentions(updatedIntentions);
    saveIntentions(updatedIntentions);

    // Immediately persist completed transaction and updated balance to cloud
    syncAccountToCloud(currentUser, true);
  };

  // Manual state refresh / schedule recalculation
  const handleRefresh = async () => {
    if (currentUser && currentUser.provider !== 'local') {
      await loadAndApplyCloudData(currentUser);
    }
    setRecipients(loadRecipients());
    setIntentions(loadIntentions());
    setHistory(loadCompletedTransactions());
    setBalance(loadTestnetBalance());
    setCurrentUser(getCurrentUser());
  };

  // Reset Demo Data
  const handleResetDemo = () => {
    if (confirm('Reset Jexi testnet state to default demo dataset?')) {
      resetAllToDemo();
      setRecipients(loadRecipients());
      setIntentions(loadIntentions());
      setHistory(loadCompletedTransactions());
      setBalance(loadTestnetBalance());
      setCurrentUser(getCurrentUser());
      setActivePreparedTx(null);
      setActiveDetailIntention(null);
      setEarlyExecutionCandidate(null);
      setIsPreparedTxEarly(false);
      syncAccountToCloud(currentUser);
    }
  };

  if (initState === 'initializing') {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center font-sans antialiased p-4 selection:bg-emerald-500/30 selection:text-emerald-200">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 animate-pulse">
            <span className="font-bold text-zinc-950 text-lg tracking-wider">JX</span>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-base font-semibold text-zinc-100">Initializing JEXI</h1>
            <p className="text-xs text-zinc-400">Synchronizing secure session and account data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-200 w-full overflow-x-hidden">
      {/* Top Header */}
      <Header
        balance={balance}
        onRefresh={handleRefresh}
        onResetDemo={handleResetDemo}
        currentUser={currentUser}
        onOpenAccount={() => setIsAccountModalOpen(true)}
        syncStatus={syncStatus}
        walletState={walletState}
        onConnectWallet={handleConnectWallet}
        onSwitchNetwork={handleSwitchNetwork}
        onClearWalletError={() => setWalletState((prev) => ({ ...prev, error: null }))}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-5 pb-24 overflow-x-hidden">
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
          />
        )}
      </main>

      {/* Early Execution Explicit Confirmation Dialog */}
      {earlyExecutionCandidate && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-100">Early Payment Execution</h3>
                <p className="text-xs text-zinc-400">Scheduled payment advance review</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-950/20 border border-amber-500/40 rounded-xl space-y-2 text-xs">
              <p className="text-amber-200 font-medium leading-relaxed">
                This payment is scheduled for <strong className="text-amber-300 font-bold">{earlyExecutionCandidate.nextDueDate}</strong>. You are choosing to execute it early.
              </p>
              <div className="pt-2 border-t border-amber-500/20 space-y-1.5 text-zinc-300">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Recipient:</span>
                  <span className="font-semibold text-zinc-200">
                    {recipients.find((r) => r.id === earlyExecutionCandidate.recipientId)?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Amount:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {earlyExecutionCandidate.amount.toLocaleString()} {earlyExecutionCandidate.tokenSymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Recurrence Cadence:</span>
                  <span className="text-zinc-300 font-medium">
                    {formatScheduleCadence(earlyExecutionCandidate)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-400 space-y-1">
              <p className="text-zinc-300 font-medium">Schedule Continuity Guarantee</p>
              <p className="text-[11px] leading-relaxed">
                The recurring schedule will remain unchanged and will advance to the next recurring occurrence in accordance with the recurrence rule.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEarlyExecutionCandidate(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
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
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
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
      {activePreparedTx && (
        <TransactionPreparationModal
          preparedTx={activePreparedTx}
          intention={
            intentions.find((i) => i.id === activePreparedTx.intentionId) || intentions[0]
          }
          recipient={
            recipients.find((r) => r.id === activePreparedTx.recipientId) || recipients[0]
          }
          isEarlyExecution={isPreparedTxEarly}
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
        />
      )}

      {/* Account & Cross-Device Synchronization Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        currentUser={currentUser}
        onUserChange={(user) => {
          setCurrentUser(user);
          handleRefresh();
          if (user) {
            setIsAccountModalOpen(false);
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
          if (currentUser) {
            await syncAccountToCloud(currentUser, true);
          }
        }}
      />

      {/* Mobile-first Bottom Navigation */}
      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} dueCount={dueCount} />
    </div>
  );
}
