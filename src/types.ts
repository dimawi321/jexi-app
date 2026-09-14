export type NetworkId = 'base-sepolia';

export interface NetworkConfig {
  id: NetworkId;
  name: string;
  chainId: number;
  currencySymbol: string;
  explorerUrl: string;
  isTestnet: true;
  rpcUrl: string;
}

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  contractAddress: string;
  networkId: NetworkId;
  isTestnet: boolean;
}

export interface Recipient {
  id: string;
  name: string;
  address: string;
  networkId: NetworkId;
  tokenSymbol: string;
  defaultAmount?: number;
  notes?: string;
  createdAt: string;
}

export type ScheduleFrequency = 'monthly' | 'weekly' | 'biweekly' | 'custom_days' | 'once';

export interface PaymentIntention {
  id: string;
  recipientId: string;
  amount: number;
  tokenSymbol: string;
  networkId: NetworkId;
  frequency: ScheduleFrequency;
  dueDayOfMonth?: number; // 1-31 for monthly (e.g. 25th)
  dueDayOfWeek?: number;  // 0-6 for weekly/biweekly (0=Sun, 1=Mon, ..., 6=Sat)
  scheduleTime?: string;  // e.g. "10:00"
  startDate?: string;     // YYYY-MM-DD
  customIntervalDays?: number; // e.g. 30, 45, 90
  nextDueDate: string;    // YYYY-MM-DD
  notes?: string;
  active: boolean;
  createdAt: string;
  lastCheckedAt?: string;
}

export type PaymentLifecycleState =
  | 'scheduled'
  | 'due'
  | 'checking'
  | 'ready_for_review'
  | 'awaiting_approval'
  | 'signed'
  | 'broadcast'
  | 'confirmed'
  | 'rejected'
  | 'failed';

export type PreflightStatus = 'PASS' | 'WARNING' | 'BLOCKED';

export interface PreflightCheckItem {
  id: string;
  title: string;
  description: string;
  status: PreflightStatus;
  details?: string;
}

export interface PreflightReport {
  overallStatus: PreflightStatus;
  checks: PreflightCheckItem[];
  timestamp: string;
  canProceed: boolean;
}

export interface PreparedTransaction {
  id: string;
  intentionId: string;
  recipientId: string;
  recipientName: string;
  recipientAddress: string;
  amount: number;
  tokenSymbol: string;
  networkId: NetworkId;
  value: string;
  rawCalldata: string;
  estimatedGas: string;
  preflightReport: PreflightReport;
  status: PaymentLifecycleState;
  executionMode: 'DEVELOPMENT_TESTNET_SIMULATION';
  txHash?: string;
  signedAt?: string;
  broadcastAt?: string;
  confirmedAt?: string;
  blockNumber?: number;
}

export interface CompletedTransactionRecord {
  id: string;
  preparedTxId: string;
  intentionId: string;
  recipientId: string;
  recipientName: string;
  recipientAddress: string;
  amount: number;
  tokenSymbol: string;
  networkId: NetworkId;
  txHash: string;
  confirmedAt: string;
  executionMode: 'DEVELOPMENT_TESTNET_SIMULATION';
  isSimulation: boolean;
  isOnChain?: boolean;
  simulatedRefId?: string;
}

export interface UserAccount {
  id: string; // Authoritative UID (from Firebase Auth)
  email: string;
  displayName?: string;
  provider: 'email' | 'google' | 'local';
  emailVerified?: boolean;
  photoURL?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface JexiAccountDataPayload {
  version: number;
  schemaVersion: '1.0';
  accountId: string;
  userEmail: string;
  exportedAt: string;
  updatedAt: string;
  recipients: Recipient[];
  intentions: PaymentIntention[];
  history: CompletedTransactionRecord[];
  balance: {
    'Test USDC': number;
    'Test ETH': number;
    'Test DAI': number;
  };
  metadata?: {
    client: string;
    deviceSyncReady: boolean;
    lastSyncedAt?: string;
  };
}

export type AppInitState = 'initializing' | 'ready';
