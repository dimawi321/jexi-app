import {
  Recipient,
  PaymentIntention,
  CompletedTransactionRecord,
  PreparedTransaction,
  UserAccount,
  SignaAccountDataPayload,
  JexiAccountDataPayload,
  TransactionOccurrenceState,
  PaymentOccurrenceRecord,
} from '../types';
import { getAddress } from 'viem';
import { getFirebaseAuth } from '../lib/firebase';

const KEYS = {
  RECIPIENTS: 'signa_recipients_v1',
  INTENTIONS: 'signa_intentions_v1',
  COMPLETED_TXS: 'signa_completed_txs_v1',
  PREPARED_TXS: 'signa_prepared_txs_v1',
  TESTNET_BALANCE: 'signa_testnet_balance_v1',
  CURRENT_USER: 'signa_current_user_v1',
  ACCOUNTS_INDEX: 'signa_accounts_index_v1',
  ACCOUNT_DATA_PREFIX: 'signa_account_data_v1_',
  OCCURRENCE_STATES: 'signa_occurrence_states_v1',
};

const LEGACY_KEYS = {
  RECIPIENTS: 'jexi_recipients_v1',
  INTENTIONS: 'jexi_intentions_v1',
  COMPLETED_TXS: 'jexi_completed_txs_v1',
  PREPARED_TXS: 'jexi_prepared_txs_v1',
  TESTNET_BALANCE: 'jexi_testnet_balance_v1',
  CURRENT_USER: 'jexi_current_user_v1',
  ACCOUNTS_INDEX: 'jexi_accounts_index_v1',
  ACCOUNT_DATA_PREFIX: 'jexi_account_data_v1_',
  OCCURRENCE_STATES: 'jexi_occurrence_states_v1',
};

function getItemWithFallback(key: string, legacyKey: string): string | null {
  const item = localStorage.getItem(key);
  if (item !== null) return item;
  return localStorage.getItem(legacyKey);
}

export function getAuthenticatedUid(): string | null {
  try {
    const auth = getFirebaseAuth();
    if (auth?.currentUser?.uid) {
      return auth.currentUser.uid;
    }
  } catch {
    // Auth not initialized yet or not in browser context
  }
  try {
    const raw = localStorage.getItem(KEYS.CURRENT_USER);
    if (raw) {
      const user = JSON.parse(raw) as UserAccount;
      if (user && user.id && user.provider !== 'local') {
        return user.id;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function getUserKey(baseKey: string): string {
  const uid = getAuthenticatedUid();
  if (uid) {
    return `${baseKey}_${uid}`;
  }
  return baseKey;
}

export interface WalletBalance {
  USDC: number;
  ETH: number;
}

const DEFAULT_BALANCE: WalletBalance = {
  USDC: 0,
  ETH: 0,
};

export function loadRecipients(): Recipient[] {
  const uid = getAuthenticatedUid();
  if (!uid) {
    return [];
  }
  try {
    const key = getUserKey(KEYS.RECIPIENTS);
    const raw = localStorage.getItem(key);
    if (!raw) {
      saveRecipients([]);
      return [];
    }
    const list: Recipient[] = JSON.parse(raw);
    let modified = false;

    for (const r of list) {
      if ((r.networkId as string) !== 'base-mainnet') {
        r.networkId = 'base-mainnet';
        modified = true;
      }
      if (!r.tokenSymbol || r.tokenSymbol.toLowerCase().includes('test')) {
        r.tokenSymbol = r.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC';
        modified = true;
      }
      if (r.address && /^0x[0-9a-fA-F]{40}$/.test(r.address)) {
        try {
          const checksummed = getAddress(r.address);
          if (checksummed !== r.address) {
            r.address = checksummed;
            modified = true;
          }
        } catch {
          // ignore
        }
      }
    }

    if (modified) {
      saveRecipients(list);
    }
    return list;
  } catch (e) {
    console.error('Failed to load recipients from storage:', e);
    return [];
  }
}

export function saveRecipients(recipients: Recipient[]): void {
  const uid = getAuthenticatedUid();
  if (!uid) return;
  try {
    for (const r of recipients) {
      r.networkId = 'base-mainnet';
      if (!r.tokenSymbol || r.tokenSymbol.toLowerCase().includes('test')) {
        r.tokenSymbol = r.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC';
      }
    }
    const key = getUserKey(KEYS.RECIPIENTS);
    localStorage.setItem(key, JSON.stringify(recipients));
  } catch (e) {
    console.error('Failed to save recipients:', e);
  }
}

export function loadIntentions(): PaymentIntention[] {
  const uid = getAuthenticatedUid();
  if (!uid) {
    return [];
  }
  try {
    const key = getUserKey(KEYS.INTENTIONS);
    const raw = localStorage.getItem(key);
    if (!raw) {
      saveIntentions([]);
      return [];
    }
    const list: PaymentIntention[] = JSON.parse(raw);
    let modified = false;
    for (const i of list) {
      if ((i.networkId as string) !== 'base-mainnet') {
        i.networkId = 'base-mainnet';
        modified = true;
      }
      if (!i.tokenSymbol || i.tokenSymbol.toLowerCase().includes('test')) {
        i.tokenSymbol = i.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC';
        modified = true;
      }
    }
    if (modified) {
      saveIntentions(list);
    }
    return list;
  } catch (e) {
    console.error('Failed to load intentions from storage:', e);
    return [];
  }
}

export function saveIntentions(intentions: PaymentIntention[]): void {
  const uid = getAuthenticatedUid();
  if (!uid) return;
  try {
    for (const i of intentions) {
      i.networkId = 'base-mainnet';
      if (!i.tokenSymbol || i.tokenSymbol.toLowerCase().includes('test')) {
        i.tokenSymbol = i.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC';
      }
    }
    const key = getUserKey(KEYS.INTENTIONS);
    localStorage.setItem(key, JSON.stringify(intentions));
  } catch (e) {
    console.error('Failed to save intentions:', e);
  }
}

export function loadCompletedTransactions(): CompletedTransactionRecord[] {
  const uid = getAuthenticatedUid();
  if (!uid) {
    return [];
  }
  try {
    const key = getUserKey(KEYS.COMPLETED_TXS);
    let raw = localStorage.getItem(key);
    if (!raw) {
      raw = localStorage.getItem(KEYS.COMPLETED_TXS) || localStorage.getItem(LEGACY_KEYS.COMPLETED_TXS);
      if (raw) {
        try {
          localStorage.setItem(key, raw);
        } catch {
          // ignore
        }
      }
    }
    if (!raw) {
      saveCompletedTransactions([]);
      return [];
    }
    const list: CompletedTransactionRecord[] = JSON.parse(raw);
    let modified = false;
    for (const tx of list) {
      if ((tx.networkId as string) !== 'base-mainnet') {
        tx.networkId = 'base-mainnet';
        modified = true;
      }
      if (!tx.tokenSymbol || tx.tokenSymbol.toLowerCase().includes('test')) {
        tx.tokenSymbol = tx.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC';
        modified = true;
      }
    }
    if (modified) {
      saveCompletedTransactions(list);
    }
    return list.map((record) => ({
      ...record,
      isOnChain: record.isOnChain ?? (record.isSimulation ? false : true),
      simulatedRefId: record.simulatedRefId || (record.isSimulation ? record.txHash : undefined),
    }));
  } catch (e) {
    console.error('Failed to load completed transactions:', e);
    return [];
  }
}

export function saveCompletedTransactions(txs: CompletedTransactionRecord[]): void {
  const uid = getAuthenticatedUid();
  if (!uid) return;
  try {
    for (const tx of txs) {
      tx.networkId = 'base-mainnet';
      if (!tx.tokenSymbol || tx.tokenSymbol.toLowerCase().includes('test')) {
        tx.tokenSymbol = tx.tokenSymbol?.toLowerCase().includes('eth') ? 'ETH' : 'USDC';
      }
    }
    const key = getUserKey(KEYS.COMPLETED_TXS);
    localStorage.setItem(key, JSON.stringify(txs));
  } catch (e) {
    console.error('Failed to save completed transactions:', e);
  }
}

export function loadOccurrenceRecords(): Record<string, PaymentOccurrenceRecord> {
  const uid = getAuthenticatedUid();
  if (!uid) return {};
  try {
    const key = getUserKey(KEYS.OCCURRENCE_STATES);
    const legacyKey = getUserKey(LEGACY_KEYS.OCCURRENCE_STATES);
    const raw = getItemWithFallback(key, legacyKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveOccurrenceRecords(records: Record<string, PaymentOccurrenceRecord>): void {
  const uid = getAuthenticatedUid();
  if (!uid) return;
  try {
    const key = getUserKey(KEYS.OCCURRENCE_STATES);
    localStorage.setItem(key, JSON.stringify(records));
  } catch (e) {
    console.error('Failed to save occurrence records:', e);
  }
}

export function getOccurrenceRecord(occurrenceId: string): PaymentOccurrenceRecord | null {
  const records = loadOccurrenceRecords();
  return records[occurrenceId] || null;
}

export function deleteOccurrenceRecord(occurrenceId: string): void {
  const uid = getAuthenticatedUid();
  if (!uid) return;
  try {
    const records = loadOccurrenceRecords();
    if (records[occurrenceId]) {
      delete records[occurrenceId];
      saveOccurrenceRecords(records);
    }
  } catch (e) {
    console.error('Failed to delete occurrence record:', e);
  }
}

export function setOccurrenceState(
  occurrenceId: string,
  intentionId: string,
  dueDate: string,
  state: TransactionOccurrenceState,
  extra?: { txHash?: string; blockNumber?: number; error?: string; signingMethod?: string }
): PaymentOccurrenceRecord {
  const records = loadOccurrenceRecords();
  const existing = records[occurrenceId];

  const updated: PaymentOccurrenceRecord = {
    occurrenceId,
    intentionId,
    dueDate,
    state,
    updatedAt: new Date().toISOString(),
    txHash: extra?.txHash || existing?.txHash,
    blockNumber: extra?.blockNumber ?? existing?.blockNumber,
    error: extra?.error || existing?.error,
    signingMethod: extra?.signingMethod || existing?.signingMethod,
  };

  records[occurrenceId] = updated;
  saveOccurrenceRecords(records);
  return updated;
}

export function loadStoredWalletBalance(): WalletBalance {
  const uid = getAuthenticatedUid();
  if (!uid) return DEFAULT_BALANCE;
  try {
    const key = getUserKey(KEYS.TESTNET_BALANCE);
    const raw = localStorage.getItem(key);
    if (!raw) {
      return DEFAULT_BALANCE;
    }
    const parsed = JSON.parse(raw);
    return {
      USDC: typeof parsed?.USDC === 'number' ? parsed.USDC : 0,
      ETH: typeof parsed?.ETH === 'number' ? parsed.ETH : 0,
    };
  } catch (e) {
    return DEFAULT_BALANCE;
  }
}

export function deductStoredWalletBalance(tokenSymbol: string, amount: number): void {
  const uid = getAuthenticatedUid();
  if (!uid) return;
  try {
    const key = getUserKey(KEYS.TESTNET_BALANCE);
    const current = loadStoredWalletBalance();
    const cleanSymbol = (tokenSymbol || 'USDC').replace(/^Test\s+/i, '') as keyof WalletBalance;
    if (current[cleanSymbol] !== undefined) {
      current[cleanSymbol] = Math.max(0, current[cleanSymbol] - amount);
      localStorage.setItem(key, JSON.stringify(current));
    }
  } catch (e) {
    console.error('Failed to deduct balance:', e);
  }
}

export function resetAllToDemo(): void {
  const uid = getAuthenticatedUid();
  if (!uid) return;
  saveRecipients([]);
  saveIntentions([]);
  const key = getUserKey(KEYS.TESTNET_BALANCE);
  localStorage.setItem(key, JSON.stringify(DEFAULT_BALANCE));
  saveCompletedTransactions([]);
}

// ---------------------------------------------------------------------------
// Account & Cross-Device Synchronization Architecture Foundation
// ---------------------------------------------------------------------------

export function getCurrentUser(): UserAccount | null {
  try {
    const raw = localStorage.getItem(KEYS.CURRENT_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCurrentUser(user: UserAccount | null): void {
  try {
    if (user) {
      localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(KEYS.CURRENT_USER);
    }
  } catch (e) {
    console.error('Failed to save current user session:', e);
  }
}

export function getRegisteredAccounts(): UserAccount[] {
  try {
    const raw = localStorage.getItem(KEYS.ACCOUNTS_INDEX);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRegisteredAccounts(accounts: UserAccount[]): void {
  try {
    localStorage.setItem(KEYS.ACCOUNTS_INDEX, JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to update accounts registry:', e);
  }
}

export function getStoredAccountPayload(accountId: string): JexiAccountDataPayload | null {
  try {
    const raw = localStorage.getItem(`${KEYS.ACCOUNT_DATA_PREFIX}${accountId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCurrentStateToAccount(accountId: string, userEmail: string): void {
  try {
    const payload: SignaAccountDataPayload = {
      version: 1,
      schemaVersion: '1.0',
      accountId,
      userEmail,
      exportedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recipients: loadRecipients(),
      intentions: loadIntentions(),
      history: loadCompletedTransactions(),
      balance: loadStoredWalletBalance(),
      metadata: {
        client: 'SIGNA Self-Custody Web',
        deviceSyncReady: true,
      },
    };
    localStorage.setItem(`${KEYS.ACCOUNT_DATA_PREFIX}${accountId}`, JSON.stringify(payload));
  } catch (e) {
    console.error('Failed to snapshot account payload:', e);
  }
}

export function applyPayloadToActiveStorage(payload: JexiAccountDataPayload): void {
  if (Array.isArray(payload.recipients)) {
    saveRecipients(payload.recipients);
  }
  if (Array.isArray(payload.intentions)) {
    saveIntentions(payload.intentions);
  }
  if (Array.isArray(payload.history)) {
    saveCompletedTransactions(payload.history);
  }
  if (payload.balance) {
    const key = getUserKey(KEYS.TESTNET_BALANCE);
    try {
      localStorage.setItem(key, JSON.stringify(payload.balance));
    } catch (e) {
      console.error('Failed to save balance to storage:', e);
    }
  }
}

export function signInOrCreateAccount(
  email: string,
  provider: 'email' | 'google' = 'email',
  displayName?: string
): { user: UserAccount; isNew: boolean } {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = getRegisteredAccounts();
  const now = new Date().toISOString();

  let existing = accounts.find((a) => a.email.toLowerCase() === normalizedEmail);
  let isNew = false;
  let user: UserAccount;

  if (existing) {
    user = {
      ...existing,
      displayName: displayName || existing.displayName,
      lastLoginAt: now,
    };
    const updatedAccounts = accounts.map((a) => (a.id === user.id ? user : a));
    saveRegisteredAccounts(updatedAccounts);
  } else {
    isNew = true;
    user = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: normalizedEmail,
      displayName: displayName || normalizedEmail.split('@')[0],
      provider,
      createdAt: now,
      lastLoginAt: now,
    };
    saveRegisteredAccounts([...accounts, user]);
  }

  saveCurrentUser(user);

  // Check if account has prior data stored on this device
  const existingSnapshot = getStoredAccountPayload(user.id);
  if (existingSnapshot) {
    applyPayloadToActiveStorage(existingSnapshot);
  } else {
    // Brand new user: initialize empty dataset isolated to this user's account
    const emptyPayload: SignaAccountDataPayload = {
      version: 1,
      schemaVersion: '1.0',
      accountId: user.id,
      userEmail: user.email,
      exportedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recipients: [],
      intentions: [],
      history: [],
      balance: DEFAULT_BALANCE,
      metadata: {
        client: 'SIGNA Self-Custody Web',
        deviceSyncReady: true,
      },
    };
    applyPayloadToActiveStorage(emptyPayload);
    saveCurrentStateToAccount(user.id, user.email);
  }

  return { user, isNew };
}

export function attachFirebaseAuthUser(user: UserAccount): void {
  const accounts = getRegisteredAccounts();
  const existingIndex = accounts.findIndex(
    (a) => a.id === user.id || a.email.toLowerCase() === user.email.toLowerCase()
  );

  if (existingIndex >= 0) {
    accounts[existingIndex] = {
      ...accounts[existingIndex],
      id: user.id, // Authoritative Firebase UID
      displayName: user.displayName || accounts[existingIndex].displayName,
      emailVerified: user.emailVerified,
      photoURL: user.photoURL,
      provider: user.provider,
      lastLoginAt: user.lastLoginAt,
    };
    saveRegisteredAccounts(accounts);
  } else {
    saveRegisteredAccounts([...accounts, user]);
  }

  saveCurrentUser(user);

  // Check if this authenticated account already has a snapshot on this device
  const existingSnapshot = getStoredAccountPayload(user.id);
  if (existingSnapshot) {
    applyPayloadToActiveStorage(existingSnapshot);
  } else {
    // Brand new authenticated user: start with an empty dataset isolated to their Firebase UID
    const emptyPayload: SignaAccountDataPayload = {
      version: 1,
      schemaVersion: '1.0',
      accountId: user.id,
      userEmail: user.email,
      exportedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recipients: [],
      intentions: [],
      history: [],
      balance: DEFAULT_BALANCE,
      metadata: {
        client: 'SIGNA Self-Custody Web',
        deviceSyncReady: true,
      },
    };
    applyPayloadToActiveStorage(emptyPayload);
    saveCurrentStateToAccount(user.id, user.email);
  }
}

export function logoutUser(): void {
  const user = getCurrentUser();
  if (user) {
    saveCurrentStateToAccount(user.id, user.email);
  }
  saveCurrentUser(null);
}

export function exportSignaAccountPayload(): SignaAccountDataPayload {
  const user = getCurrentUser();
  const uid = getAuthenticatedUid();
  return {
    version: 1,
    schemaVersion: '1.0',
    accountId: uid || user?.id || 'guest_local',
    userEmail: user?.email || 'local_session@signa.internal',
    exportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recipients: loadRecipients(),
    intentions: loadIntentions(),
    history: loadCompletedTransactions(),
    balance: loadStoredWalletBalance(),
    metadata: {
      client: 'SIGNA Self-Custody Web',
      deviceSyncReady: true,
    },
  };
}

export function exportJexiAccountPayload(): SignaAccountDataPayload {
  return exportSignaAccountPayload();
}

export function importSignaAccountPayload(payload: SignaAccountDataPayload): { success: boolean; message: string } {
  try {
    if (!payload || !Array.isArray(payload.recipients) || !Array.isArray(payload.intentions)) {
      return { success: false, message: 'Invalid JEXI sync payload structure.' };
    }

    applyPayloadToActiveStorage(payload);

    const user = getCurrentUser();
    if (user) {
      saveCurrentStateToAccount(user.id, user.email);
    }

    return { success: true, message: 'Account data successfully restored from device backup.' };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Failed to restore device payload.' };
  }
}

export function importJexiAccountPayload(payload: SignaAccountDataPayload): { success: boolean; message: string } {
  return importSignaAccountPayload(payload);
}
