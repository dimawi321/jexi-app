import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getFirebaseFirestore,
  getFirebaseAuth,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  UserAccount,
  SignaAccountDataPayload,
  Recipient,
  PaymentIntention,
  CompletedTransactionRecord,
} from '../types';
import {
  exportSignaAccountPayload,
  applyPayloadToActiveStorage,
  saveCurrentStateToAccount,
} from '../storage/storage';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

interface SyncListener {
  (status: SyncStatus, lastSyncedAt: string | null, errorMessage?: string): void;
}

let currentSyncStatus: SyncStatus = 'idle';
let lastSyncedTimestamp: string | null = null;
let lastSyncError: string | undefined = undefined;
const syncListeners: Set<SyncListener> = new Set();

export function getSyncStatus(): {
  status: SyncStatus;
  lastSyncedAt: string | null;
  errorMessage?: string;
} {
  return {
    status: currentSyncStatus,
    lastSyncedAt: lastSyncedTimestamp,
    errorMessage: lastSyncError,
  };
}

export function subscribeSyncStatus(listener: SyncListener): () => void {
  syncListeners.add(listener);
  listener(currentSyncStatus, lastSyncedTimestamp, lastSyncError);
  return () => {
    syncListeners.delete(listener);
  };
}

function notifySyncStatus(status: SyncStatus, errorMsg?: string) {
  currentSyncStatus = status;
  if (status === 'synced') {
    lastSyncedTimestamp = new Date().toISOString();
    lastSyncError = undefined;
  } else if (status === 'error') {
    lastSyncError = errorMsg;
  }
  for (const listener of syncListeners) {
    try {
      listener(currentSyncStatus, lastSyncedTimestamp, lastSyncError);
    } catch (err) {
      console.error('Error notifying sync listener:', err);
    }
  }
}

/**
 * Merges local and cloud account data safely:
 * - History is strictly undeletable: all local and cloud records are unified.
 * - Recipients: unified by unique ID.
 * - Intentions: unified by unique ID.
 * - Balances: preserved from cloud (or latest transaction).
 */
export function mergeLocalAndCloudPayload(
  localPayload: SignaAccountDataPayload,
  cloudPayload: SignaAccountDataPayload
): SignaAccountDataPayload {
  // 1. Merge Recipients by id
  const recipientMap = new Map<string, Recipient>();
  for (const rec of localPayload.recipients || []) {
    recipientMap.set(rec.id, {
      ...rec,
      networkId: 'base-mainnet',
      tokenSymbol: rec.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC',
    });
  }
  for (const rec of cloudPayload.recipients || []) {
    recipientMap.set(rec.id, {
      ...rec,
      networkId: 'base-mainnet',
      tokenSymbol: rec.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC',
    });
  }
  const mergedRecipients = Array.from(recipientMap.values());

  // 2. Undeletable History: complete union of all unique completed transactions with conflict resolution
  function resolveHistoryRecordConflict(
    existing: CompletedTransactionRecord,
    incoming: CompletedTransactionRecord
  ): CompletedTransactionRecord {
    const isExistingConfirmed = existing.status === 'CONFIRMED_ON_CHAIN';
    const isIncomingConfirmed = incoming.status === 'CONFIRMED_ON_CHAIN';
    const isExistingFailed = existing.status === 'FAILED_ON_CHAIN';
    const isIncomingFailed = incoming.status === 'FAILED_ON_CHAIN';
    const isExistingPending = existing.status === 'BROADCAST_SUBMITTED' || (!existing.status && !existing.isSimulation);
    const isIncomingPending = incoming.status === 'BROADCAST_SUBMITTED' || (!incoming.status && !incoming.isSimulation);

    // Rule 1: A terminal on-chain receipt outcome (CONFIRMED_ON_CHAIN or FAILED_ON_CHAIN)
    // MUST NEVER be overwritten by an older BROADCAST_SUBMITTED (pending) record!
    if ((isExistingConfirmed || isExistingFailed) && isIncomingPending) {
      return {
        ...incoming,
        ...existing,
        blockNumber: existing.blockNumber ?? incoming.blockNumber,
        occurrenceId: existing.occurrenceId || incoming.occurrenceId,
      };
    }
    if ((isIncomingConfirmed || isIncomingFailed) && isExistingPending) {
      return {
        ...existing,
        ...incoming,
        blockNumber: incoming.blockNumber ?? existing.blockNumber,
        occurrenceId: incoming.occurrenceId || existing.occurrenceId,
      };
    }

    // Rule 2: Both are CONFIRMED_ON_CHAIN or both FAILED_ON_CHAIN or both BROADCAST_SUBMITTED
    if (existing.status === incoming.status) {
      return {
        ...existing,
        ...incoming,
        blockNumber: incoming.blockNumber ?? existing.blockNumber,
        occurrenceId: incoming.occurrenceId || existing.occurrenceId,
        confirmedAt: existing.confirmedAt || incoming.confirmedAt,
      };
    }

    // Rule 3: Conflict between CONFIRMED_ON_CHAIN and FAILED_ON_CHAIN for the same txHash
    // Prefer the record with verified blockNumber; if conflict remains unresolved, preserve confirmed record.
    if (isExistingConfirmed && isIncomingFailed) {
      if (existing.blockNumber && !incoming.blockNumber) {
        return existing;
      }
      if (incoming.blockNumber && !existing.blockNumber) {
        return incoming;
      }
      console.warn(`[SIGNA Sync] Terminal status conflict for tx ${existing.txHash}: CONFIRMED vs FAILED. Preserving confirmed record.`);
      return existing;
    }
    if (isIncomingConfirmed && isExistingFailed) {
      if (incoming.blockNumber && !existing.blockNumber) {
        return incoming;
      }
      if (existing.blockNumber && !incoming.blockNumber) {
        return existing;
      }
      console.warn(`[SIGNA Sync] Terminal status conflict for tx ${incoming.txHash}: FAILED vs CONFIRMED. Preserving confirmed record.`);
      return incoming;
    }

    return {
      ...existing,
      ...incoming,
      blockNumber: incoming.blockNumber ?? existing.blockNumber,
      occurrenceId: incoming.occurrenceId || existing.occurrenceId,
    };
  }

  const mergedHistoryList: CompletedTransactionRecord[] = [];
  const txHashToIndex = new Map<string, number>();
  const occurrenceIdToIndex = new Map<string, number>();
  const idToIndex = new Map<string, number>();

  const processHistoryItem = (h: CompletedTransactionRecord) => {
    const normalized: CompletedTransactionRecord = {
      ...h,
      networkId: 'base-mainnet',
      tokenSymbol: h.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC',
    };

    let existingIdx: number | undefined;
    const lowerTxHash =
      normalized.txHash && normalized.txHash.startsWith('0x')
        ? normalized.txHash.toLowerCase()
        : null;

    if (lowerTxHash && txHashToIndex.has(lowerTxHash)) {
      existingIdx = txHashToIndex.get(lowerTxHash);
    } else if (normalized.occurrenceId && occurrenceIdToIndex.has(normalized.occurrenceId)) {
      existingIdx = occurrenceIdToIndex.get(normalized.occurrenceId);
    } else if (normalized.id && idToIndex.has(normalized.id)) {
      existingIdx = idToIndex.get(normalized.id);
    }

    if (existingIdx !== undefined) {
      const merged = resolveHistoryRecordConflict(mergedHistoryList[existingIdx], normalized);
      mergedHistoryList[existingIdx] = merged;
      if (lowerTxHash) txHashToIndex.set(lowerTxHash, existingIdx);
      if (merged.occurrenceId) occurrenceIdToIndex.set(merged.occurrenceId, existingIdx);
      if (merged.id) idToIndex.set(merged.id, existingIdx);
    } else {
      const newIdx = mergedHistoryList.length;
      mergedHistoryList.push(normalized);
      if (lowerTxHash) txHashToIndex.set(lowerTxHash, newIdx);
      if (normalized.occurrenceId) occurrenceIdToIndex.set(normalized.occurrenceId, newIdx);
      if (normalized.id) idToIndex.set(normalized.id, newIdx);
    }
  };

  for (const h of localPayload.history || []) {
    processHistoryItem(h);
  }
  for (const h of cloudPayload.history || []) {
    processHistoryItem(h);
  }

  const mergedHistory = mergedHistoryList.sort(
    (a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime()
  );

  const completedIntentionIdsInHistory = new Set(
    mergedHistory
      .filter((h) => h.status === 'CONFIRMED_ON_CHAIN' || (h.isSimulation && h.status !== 'FAILED_ON_CHAIN'))
      .map((h) => h.intentionId)
      .filter(Boolean)
  );

  // 3. Merge Intentions by id with Terminal One-Time Completion Protection
  const intentionMap = new Map<string, PaymentIntention>();
  for (const intent of localPayload.intentions || []) {
    intentionMap.set(intent.id, {
      ...intent,
      networkId: 'base-mainnet',
      tokenSymbol: intent.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC',
    });
  }
  for (const intent of cloudPayload.intentions || []) {
    const normalizedCloudIntent: PaymentIntention = {
      ...intent,
      networkId: 'base-mainnet',
      tokenSymbol: intent.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC',
    };
    const existing = intentionMap.get(normalizedCloudIntent.id);
    if (existing) {
      // Check if either copy is completed
      const isLocallyCompleted =
        existing.isCompleted ||
        (existing.frequency === 'once' && (!!existing.completedAt || completedIntentionIdsInHistory.has(existing.id)));
      const isCloudCompleted =
        normalizedCloudIntent.isCompleted ||
        (normalizedCloudIntent.frequency === 'once' && (!!normalizedCloudIntent.completedAt || completedIntentionIdsInHistory.has(normalizedCloudIntent.id)));

      // Check if either copy is rejected (terminal invariant for one-time intentions)
      const isLocallyRejected =
        existing.isRejected ||
        (existing.frequency === 'once' && (!!existing.rejectedAt || existing.isRejected));
      const isCloudRejected =
        normalizedCloudIntent.isRejected ||
        (normalizedCloudIntent.frequency === 'once' && (!!normalizedCloudIntent.rejectedAt || normalizedCloudIntent.isRejected));

      if (isLocallyCompleted || isCloudCompleted) {
        // Terminal invariant: once completed, a one-time intention can never be reverted to active or paused
        const completedSource = isLocallyCompleted ? existing : normalizedCloudIntent;
        const otherSource = isLocallyCompleted ? normalizedCloudIntent : existing;
        const completionTime =
          completedSource.completedAt ||
          otherSource.completedAt ||
          mergedHistory.find((h) => h.intentionId === normalizedCloudIntent.id)?.confirmedAt ||
          new Date().toISOString();

        intentionMap.set(normalizedCloudIntent.id, {
          ...otherSource,
          ...completedSource,
          networkId: 'base-mainnet',
          tokenSymbol: completedSource.tokenSymbol || 'USDC',
          active: false,
          isCompleted: true,
          completedAt: completionTime,
        });
      } else if (isLocallyRejected || isCloudRejected) {
        // Terminal invariant: once rejected, a one-time intention can never be reverted to active or paused
        const rejectedSource = isLocallyRejected ? existing : normalizedCloudIntent;
        const otherSource = isLocallyRejected ? normalizedCloudIntent : existing;
        const rejectTime =
          rejectedSource.rejectedAt ||
          otherSource.rejectedAt ||
          new Date().toISOString();

        intentionMap.set(normalizedCloudIntent.id, {
          ...otherSource,
          ...rejectedSource,
          networkId: 'base-mainnet',
          tokenSymbol: rejectedSource.tokenSymbol || 'USDC',
          active: false,
          isRejected: true,
          rejectedAt: rejectTime,
        });
      } else {
        // Schedule Monotonicity Guarantee: nextDueDate must NEVER roll backwards
        const maxNextDueDate =
          existing.nextDueDate && normalizedCloudIntent.nextDueDate
            ? (existing.nextDueDate > normalizedCloudIntent.nextDueDate ? existing.nextDueDate : normalizedCloudIntent.nextDueDate)
            : existing.nextDueDate || normalizedCloudIntent.nextDueDate;

        const existingTime = new Date(existing.lastCheckedAt || existing.createdAt).getTime();
        const cloudTime = new Date(normalizedCloudIntent.lastCheckedAt || normalizedCloudIntent.createdAt).getTime();
        const chosen = cloudTime >= existingTime ? normalizedCloudIntent : existing;

        intentionMap.set(normalizedCloudIntent.id, {
          ...chosen,
          nextDueDate: maxNextDueDate,
        });
      }
    } else {
      intentionMap.set(normalizedCloudIntent.id, normalizedCloudIntent);
    }
  }

  // Final check: any one-time intention with a matching record in history must be marked completed
  for (const [id, intent] of intentionMap.entries()) {
    if (intent.frequency === 'once' && completedIntentionIdsInHistory.has(id) && !intent.isCompleted) {
      intentionMap.set(id, {
        ...intent,
        active: false,
        isCompleted: true,
        completedAt:
          intent.completedAt ||
          mergedHistory.find((h) => h.intentionId === id)?.confirmedAt ||
          new Date().toISOString(),
      });
    }
  }
  const mergedIntentions = Array.from(intentionMap.values());

  // 4. Balances: prefer cloud if present, else local
  const balance = cloudPayload.balance || localPayload.balance;

  return {
    version: 1,
    schemaVersion: '1.0',
    accountId: cloudPayload.accountId || localPayload.accountId,
    userEmail: cloudPayload.userEmail || localPayload.userEmail,
    exportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recipients: mergedRecipients,
    intentions: mergedIntentions,
    history: mergedHistory,
    balance,
    metadata: {
      client: 'SIGNA Self-Custody Web',
      deviceSyncReady: true,
      lastSyncedAt: new Date().toISOString(),
    },
  };
}

/**
 * Fetches the user's isolated account data document from Firestore.
 * Strictly scoped to `/users/${userId}` where userId === request.auth.uid.
 */
export async function fetchUserCloudData(userId: string): Promise<SignaAccountDataPayload | null> {
  const db = getFirebaseFirestore();
  if (!db) {
    return null;
  }

  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return null;
    }

    const data = snap.data() as SignaAccountDataPayload;
    return data;
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    console.error('Error fetching cloud account data:', error);
    throw error;
  }
}

/**
 * Saves or updates the user's account data in Firestore.
 * Strictly scoped to `/users/${userId}` where userId === request.auth.uid.
 */
export async function saveUserCloudData(
  userId: string,
  payload: SignaAccountDataPayload
): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) {
    throw new Error('Firestore is not initialized');
  }

  const path = `users/${userId}`;
  try {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, payload, { merge: true });
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    console.error('Error saving cloud account data:', error);
    throw error;
  }
}

/**
 * Automatically invoked when a user signs in.
 * Safely synchronizes cloud data with active local state:
 * - If user already has cloud data, retrieves and merges it without losing history or local records.
 * - If user has no cloud data yet, uploads current local state.
 */
export async function loadAndApplyCloudData(
  user: UserAccount
): Promise<{ success: boolean; dataLoaded: boolean; error?: string }> {
  if (!user || !user.id || user.provider === 'local') {
    return { success: false, dataLoaded: false };
  }

  notifySyncStatus('syncing');

  try {
    const cloudPayload = await fetchUserCloudData(user.id);
    const localPayload = exportSignaAccountPayload();

    if (cloudPayload) {
      // Validate that cloud payload strictly belongs to this authenticated user
      if (cloudPayload.accountId && cloudPayload.accountId !== user.id) {
        throw new Error('Cloud data account ID mismatch with authenticated UID');
      }

      // Always merge local and cloud payloads to prevent dropping locally saved transactions
      const merged = mergeLocalAndCloudPayload(localPayload, cloudPayload);

      // Apply to active local storage
      applyPayloadToActiveStorage(merged);
      saveCurrentStateToAccount(user.id, user.email);

      // If local had newer items or local history exists, update cloud
      if (
        (localPayload.history && localPayload.history.length > 0) ||
        (localPayload.history && cloudPayload.history && localPayload.history.length > cloudPayload.history.length) ||
        (localPayload.recipients && localPayload.recipients.length > cloudPayload.recipients.length)
      ) {
        await saveUserCloudData(user.id, merged);
      }

      notifySyncStatus('synced');
      return { success: true, dataLoaded: true };
    } else {
      // First time this user signs in: initialize empty isolated dataset for this authenticated UID
      const isLocalUserOwned = localPayload.accountId === user.id;
      const initialCloudPayload: SignaAccountDataPayload = {
        version: 1,
        schemaVersion: '1.0',
        accountId: user.id,
        userEmail: user.email,
        exportedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recipients: isLocalUserOwned ? (localPayload.recipients || []) : [],
        intentions: isLocalUserOwned ? (localPayload.intentions || []) : [],
        history: isLocalUserOwned ? (localPayload.history || []) : [],
        balance: isLocalUserOwned ? (localPayload.balance || {
          USDC: 0,
          ETH: 0,
        }) : {
          USDC: 0,
          ETH: 0,
        },
        metadata: {
          client: 'SIGNA Self-Custody Web',
          deviceSyncReady: true,
          lastSyncedAt: new Date().toISOString(),
        },
      };

      await saveUserCloudData(user.id, initialCloudPayload);
      applyPayloadToActiveStorage(initialCloudPayload);
      saveCurrentStateToAccount(user.id, user.email);
      notifySyncStatus('synced');
      return { success: true, dataLoaded: true };
    }
  } catch (error: any) {
    const msg = error?.message || 'Failed to sync with cloud storage';
    notifySyncStatus('error', msg);
    return { success: false, dataLoaded: false, error: msg };
  }
}

// Debounce timer for active state syncing
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Synchronizes current local state to Firestore cloud document.
 * Can be called immediately or with debounce.
 */
export function syncAccountToCloud(
  user: UserAccount | null,
  immediate: boolean = false
): Promise<{ success: boolean; error?: string }> {
  if (!user || !user.id || user.provider === 'local') {
    return Promise.resolve({ success: false });
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  const executeSync = async (): Promise<{ success: boolean; error?: string }> => {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser || auth.currentUser.uid !== user.id) {
      return { success: false, error: 'User is not authenticated' };
    }

    notifySyncStatus('syncing');
    try {
      const localPayload = exportSignaAccountPayload();
      const payloadToSave: SignaAccountDataPayload = {
        ...localPayload,
        accountId: user.id,
        userEmail: user.email,
        updatedAt: new Date().toISOString(),
        metadata: {
          client: 'SIGNA Self-Custody Web',
          deviceSyncReady: true,
          lastSyncedAt: new Date().toISOString(),
        },
      };

      await saveUserCloudData(user.id, payloadToSave);
      saveCurrentStateToAccount(user.id, user.email);
      notifySyncStatus('synced');
      return { success: true };
    } catch (error: any) {
      const msg = error?.message || 'Cloud sync failed';
      notifySyncStatus('error', msg);
      return { success: false, error: msg };
    }
  };

  if (immediate) {
    return executeSync();
  }

  return new Promise((resolve) => {
    debounceTimer = setTimeout(async () => {
      const res = await executeSync();
      resolve(res);
    }, 800);
  });
}
