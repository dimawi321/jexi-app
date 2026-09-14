import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getFirebaseFirestore,
  getFirebaseAuth,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  UserAccount,
  JexiAccountDataPayload,
  Recipient,
  PaymentIntention,
  CompletedTransactionRecord,
} from '../types';
import {
  exportJexiAccountPayload,
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
  localPayload: JexiAccountDataPayload,
  cloudPayload: JexiAccountDataPayload
): JexiAccountDataPayload {
  // 1. Merge Recipients by id
  const recipientMap = new Map<string, Recipient>();
  for (const rec of localPayload.recipients || []) {
    recipientMap.set(rec.id, rec);
  }
  for (const rec of cloudPayload.recipients || []) {
    recipientMap.set(rec.id, rec);
  }
  const mergedRecipients = Array.from(recipientMap.values());

  // 2. Merge Intentions by id
  const intentionMap = new Map<string, PaymentIntention>();
  for (const intent of localPayload.intentions || []) {
    intentionMap.set(intent.id, intent);
  }
  for (const intent of cloudPayload.intentions || []) {
    // If present in both, keep the intention with latest timestamp
    const existing = intentionMap.get(intent.id);
    if (existing) {
      const existingTime = new Date(existing.lastCheckedAt || existing.createdAt).getTime();
      const cloudTime = new Date(intent.lastCheckedAt || intent.createdAt).getTime();
      intentionMap.set(intent.id, cloudTime >= existingTime ? intent : existing);
    } else {
      intentionMap.set(intent.id, intent);
    }
  }
  const mergedIntentions = Array.from(intentionMap.values());

  // 3. Undeletable History: complete union of all unique completed transactions
  const historyMap = new Map<string, CompletedTransactionRecord>();
  for (const h of localPayload.history || []) {
    const key = h.id || h.txHash || `${h.intentionId}_${h.confirmedAt}`;
    historyMap.set(key, h);
  }
  for (const h of cloudPayload.history || []) {
    const key = h.id || h.txHash || `${h.intentionId}_${h.confirmedAt}`;
    historyMap.set(key, h);
  }
  const mergedHistory = Array.from(historyMap.values()).sort(
    (a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime()
  );

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
      client: 'JEXI Self-Custody Web',
      deviceSyncReady: true,
      lastSyncedAt: new Date().toISOString(),
    },
  };
}

/**
 * Fetches the user's isolated account data document from Firestore.
 * Strictly scoped to `/users/${userId}` where userId === request.auth.uid.
 */
export async function fetchUserCloudData(userId: string): Promise<JexiAccountDataPayload | null> {
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

    const data = snap.data() as JexiAccountDataPayload;
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
  payload: JexiAccountDataPayload
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
    const localPayload = exportJexiAccountPayload();

    if (cloudPayload) {
      // Merge cloud and local data safely
      const merged = mergeLocalAndCloudPayload(localPayload, cloudPayload);

      // Apply to active local storage
      applyPayloadToActiveStorage(merged);
      saveCurrentStateToAccount(user.id, user.email);

      // If local had newer items (like history), update cloud
      if (
        (localPayload.history && localPayload.history.length > cloudPayload.history.length) ||
        (localPayload.recipients && localPayload.recipients.length > cloudPayload.recipients.length)
      ) {
        await saveUserCloudData(user.id, merged);
      }

      notifySyncStatus('synced');
      return { success: true, dataLoaded: true };
    } else {
      // First time this user signs in: upload current local state to cloud
      const initialCloudPayload: JexiAccountDataPayload = {
        ...localPayload,
        accountId: user.id,
        userEmail: user.email,
        updatedAt: new Date().toISOString(),
        metadata: {
          client: 'JEXI Self-Custody Web',
          deviceSyncReady: true,
          lastSyncedAt: new Date().toISOString(),
        },
      };

      await saveUserCloudData(user.id, initialCloudPayload);
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
      const localPayload = exportJexiAccountPayload();
      const payloadToSave: JexiAccountDataPayload = {
        ...localPayload,
        accountId: user.id,
        userEmail: user.email,
        updatedAt: new Date().toISOString(),
        metadata: {
          client: 'JEXI Self-Custody Web',
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
