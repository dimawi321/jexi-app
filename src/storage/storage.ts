import { Recipient, PaymentIntention, CompletedTransactionRecord, PreparedTransaction, UserAccount, JexiAccountDataPayload } from '../types';
import { INITIAL_RECIPIENTS, INITIAL_INTENTIONS } from '../constants';
import { getAddress } from 'viem';

const KEYS = {
  RECIPIENTS: 'jexi_recipients_v1',
  INTENTIONS: 'jexi_intentions_v1',
  COMPLETED_TXS: 'jexi_completed_txs_v1',
  PREPARED_TXS: 'jexi_prepared_txs_v1',
  TESTNET_BALANCE: 'jexi_testnet_balance_v1',
  CURRENT_USER: 'jexi_current_user_v1',
  ACCOUNTS_INDEX: 'jexi_accounts_index_v1',
  ACCOUNT_DATA_PREFIX: 'jexi_account_data_v1_',
};

export interface TestnetWalletBalance {
  'Test USDC': number;
  'Test ETH': number;
  'Test DAI': number;
}

const DEFAULT_BALANCE: TestnetWalletBalance = {
  'Test USDC': 2500,
  'Test ETH': 1.45,
  'Test DAI': 1000,
};

export function loadRecipients(): Recipient[] {
  try {
    const raw = localStorage.getItem(KEYS.RECIPIENTS);
    if (!raw) {
      saveRecipients(INITIAL_RECIPIENTS);
      return INITIAL_RECIPIENTS;
    }
    const list: Recipient[] = JSON.parse(raw);
    let modified = false;

    // Normalize addresses to canonical EIP-55 checksum format
    for (const r of list) {
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

    // Audit recipient consistency: ensure Gospel and Coco do not share the same address
    const gospel = list.find((r) => r.name.toLowerCase().includes('gospel'));
    const coco = list.find((r) => r.name.toLowerCase().includes('coco'));

    if (gospel && coco && gospel.address.toLowerCase() === coco.address.toLowerCase()) {
      coco.address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
      modified = true;
    }

    // Ensure all demo recipients are present if user has old local cache
    for (const initRec of INITIAL_RECIPIENTS) {
      if (!list.some((r) => r.id === initRec.id || r.name.toLowerCase() === initRec.name.toLowerCase())) {
        list.push(initRec);
        modified = true;
      }
    }

    if (modified) {
      saveRecipients(list);
    }
    return list;
  } catch (e) {
    console.error('Failed to load recipients from storage:', e);
    return INITIAL_RECIPIENTS;
  }
}

export function saveRecipients(recipients: Recipient[]): void {
  try {
    localStorage.setItem(KEYS.RECIPIENTS, JSON.stringify(recipients));
  } catch (e) {
    console.error('Failed to save recipients:', e);
  }
}

export function loadIntentions(): PaymentIntention[] {
  try {
    const raw = localStorage.getItem(KEYS.INTENTIONS);
    if (!raw) {
      saveIntentions(INITIAL_INTENTIONS);
      return INITIAL_INTENTIONS;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load intentions from storage:', e);
    return INITIAL_INTENTIONS;
  }
}

export function saveIntentions(intentions: PaymentIntention[]): void {
  try {
    localStorage.setItem(KEYS.INTENTIONS, JSON.stringify(intentions));
  } catch (e) {
    console.error('Failed to save intentions:', e);
  }
}

export function loadCompletedTransactions(): CompletedTransactionRecord[] {
  try {
    const raw = localStorage.getItem(KEYS.COMPLETED_TXS);
    if (!raw) {
      const initialHistory: CompletedTransactionRecord[] = [
        {
          id: 'hist_init_1',
          preparedTxId: 'prep_mock_0',
          intentionId: 'intent_1',
          recipientId: 'rec_mum_1',
          recipientName: 'Mum',
          recipientAddress: '0x71C63B57493F5605d8c1c4f514C4FaC7AcFfe7e3',
          amount: 50,
          tokenSymbol: 'Test USDC',
          networkId: 'base-sepolia',
          txHash: 'SIM-BASE-SEP-7d2948ca7210',
          simulatedRefId: 'SIM-BASE-SEP-7d2948ca7210',
          confirmedAt: '2026-07-25T14:22:10Z',
          executionMode: 'DEVELOPMENT_TESTNET_SIMULATION',
          isSimulation: true,
          isOnChain: false,
        },
      ];
      saveCompletedTransactions(initialHistory);
      return initialHistory;
    }
    const list: CompletedTransactionRecord[] = JSON.parse(raw);
    // Ensure all simulation records are explicitly tagged as not on-chain
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
  try {
    localStorage.setItem(KEYS.COMPLETED_TXS, JSON.stringify(txs));
  } catch (e) {
    console.error('Failed to save completed transactions:', e);
  }
}

export function loadTestnetBalance(): TestnetWalletBalance {
  try {
    const raw = localStorage.getItem(KEYS.TESTNET_BALANCE);
    if (!raw) {
      localStorage.setItem(KEYS.TESTNET_BALANCE, JSON.stringify(DEFAULT_BALANCE));
      return DEFAULT_BALANCE;
    }
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULT_BALANCE;
  }
}

export function deductTestnetBalance(tokenSymbol: string, amount: number): void {
  try {
    const current = loadTestnetBalance();
    const key = tokenSymbol as keyof TestnetWalletBalance;
    if (current[key] !== undefined) {
      current[key] = Math.max(0, current[key] - amount);
      localStorage.setItem(KEYS.TESTNET_BALANCE, JSON.stringify(current));
    }
  } catch (e) {
    console.error('Failed to deduct balance:', e);
  }
}

export function resetAllToDemo(): void {
  saveRecipients(INITIAL_RECIPIENTS);
  saveIntentions(INITIAL_INTENTIONS);
  localStorage.setItem(KEYS.TESTNET_BALANCE, JSON.stringify(DEFAULT_BALANCE));
  const initialHistory: CompletedTransactionRecord[] = [
    {
      id: 'hist_init_1',
      preparedTxId: 'prep_mock_0',
      intentionId: 'intent_1',
      recipientId: 'rec_mum_1',
      recipientName: 'Mum',
      recipientAddress: '0x71C63B57493F5605d8c1c4f514C4FaC7AcFfe7e3',
      amount: 50,
      tokenSymbol: 'Test USDC',
      networkId: 'base-sepolia',
      txHash: 'SIM-BASE-SEP-7d2948ca7210',
      simulatedRefId: 'SIM-BASE-SEP-7d2948ca7210',
      confirmedAt: '2026-07-25T14:22:10Z',
      executionMode: 'DEVELOPMENT_TESTNET_SIMULATION',
      isSimulation: true,
      isOnChain: false,
    },
  ];
  saveCompletedTransactions(initialHistory);
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
    const payload: JexiAccountDataPayload = {
      version: 1,
      schemaVersion: '1.0',
      accountId,
      userEmail,
      exportedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      recipients: loadRecipients(),
      intentions: loadIntentions(),
      history: loadCompletedTransactions(),
      balance: loadTestnetBalance(),
      metadata: {
        client: 'JEXI Self-Custody Web',
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
    localStorage.setItem(KEYS.RECIPIENTS, JSON.stringify(payload.recipients));
  }
  if (Array.isArray(payload.intentions)) {
    localStorage.setItem(KEYS.INTENTIONS, JSON.stringify(payload.intentions));
  }
  if (Array.isArray(payload.history)) {
    // Preserve existing history items - history must never be lost
    const current = loadCompletedTransactions();
    const existingIds = new Set(current.map((h) => h.id || h.txHash));
    const merged = [...current];
    for (const item of payload.history) {
      const key = item.id || item.txHash;
      if (!existingIds.has(key)) {
        merged.push(item);
        existingIds.add(key);
      }
    }
    localStorage.setItem(KEYS.COMPLETED_TXS, JSON.stringify(merged));
  }
  if (payload.balance) {
    localStorage.setItem(KEYS.TESTNET_BALANCE, JSON.stringify(payload.balance));
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
    // Preserve all current active data into this account's snapshot
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
    // Non-destructively preserve current active data into this account's snapshot
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

export function exportJexiAccountPayload(): JexiAccountDataPayload {
  const user = getCurrentUser();
  return {
    version: 1,
    schemaVersion: '1.0',
    accountId: user?.id || 'guest_local',
    userEmail: user?.email || 'local_session@jexi.internal',
    exportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recipients: loadRecipients(),
    intentions: loadIntentions(),
    history: loadCompletedTransactions(),
    balance: loadTestnetBalance(),
    metadata: {
      client: 'JEXI Self-Custody Web',
      deviceSyncReady: true,
    },
  };
}

export function importJexiAccountPayload(payload: JexiAccountDataPayload): { success: boolean; message: string } {
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
