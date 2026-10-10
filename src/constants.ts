import { NetworkConfig, TokenConfig, Recipient, PaymentIntention, NetworkId } from './types';

export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_MAINNET_CHAIN_HEX = '0x2105';

export const SUPPORTED_NETWORKS: Record<NetworkId, NetworkConfig> = {
  'base-mainnet': {
    id: 'base-mainnet',
    name: 'Base',
    chainId: BASE_MAINNET_CHAIN_ID,
    currencySymbol: 'ETH',
    explorerUrl: 'https://basescan.org',
    isTestnet: false,
    rpcUrl: 'https://mainnet.base.org',
  },
};

export const SUPPORTED_TOKENS: TokenConfig[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    networkId: 'base-mainnet',
    isTestnet: false,
  },
  {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    contractAddress: '0x0000000000000000000000000000000000000000',
    networkId: 'base-mainnet',
    isTestnet: false,
  },
];

// Helper to format today's date in YYYY-MM-DD
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// User-facing display helper for token symbols
export function formatTokenSymbol(symbol: string): string {
  if (!symbol) return '';
  return symbol.replace(/^Test\s+/i, '');
}

// Initial seed recipients
export const INITIAL_RECIPIENTS: Recipient[] = [
  {
    id: 'rec_mum_1',
    name: 'Mum',
    address: '0x71C63B57493F5605d8c1C4f514c4Fac7acFfe7E3',
    networkId: 'base-mainnet',
    tokenSymbol: 'USDC',
    defaultAmount: 50,
    notes: 'Monthly living allowance',
    createdAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'rec_alex_2',
    name: 'Alex (Dev Contractor)',
    address: '0x9965507d1a55bcc2695c58ba16Fb37D819b0A4dF',
    networkId: 'base-mainnet',
    tokenSymbol: 'USDC',
    defaultAmount: 350,
    notes: 'Bi-weekly infrastructure retainer',
    createdAt: '2026-08-10T14:30:00Z',
  },
  {
    id: 'rec_gospel_4',
    name: 'Gospel',
    address: '0x250e76987d838a75310c34bf422ea9f1AC4Cc906',
    networkId: 'base-mainnet',
    tokenSymbol: 'USDC',
    defaultAmount: 1000,
    notes: 'Monthly recurring design retainer',
    createdAt: '2026-08-12T11:00:00Z',
  },
  {
    id: 'rec_coco_5',
    name: 'Coco (Base Wallet)',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    networkId: 'base-mainnet',
    tokenSymbol: 'USDC',
    defaultAmount: 75,
    notes: 'Weekly operations allocation',
    createdAt: '2026-08-14T08:00:00Z',
  },
  {
    id: 'rec_host_3',
    name: 'Decentralized Hosting',
    address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
    networkId: 'base-mainnet',
    tokenSymbol: 'ETH',
    defaultAmount: 0.05,
    notes: 'Node server upkeep',
    createdAt: '2026-08-15T09:15:00Z',
  },
];

// Initial seed payment intentions with precise scheduling parameters
export const INITIAL_INTENTIONS: PaymentIntention[] = [
  {
    id: 'intent_1',
    recipientId: 'rec_mum_1',
    amount: 50,
    tokenSymbol: 'USDC',
    networkId: 'base-mainnet',
    frequency: 'monthly',
    dueDayOfMonth: new Date().getDate(),
    scheduleTime: '10:00',
    nextDueDate: getTodayDateString(), // Due today!
    notes: 'Monthly support payment',
    active: true,
    createdAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'intent_2',
    recipientId: 'rec_alex_2',
    amount: 350,
    tokenSymbol: 'USDC',
    networkId: 'base-mainnet',
    frequency: 'biweekly',
    dueDayOfWeek: 2, // Tuesday
    scheduleTime: '14:00',
    startDate: getTodayDateString(),
    nextDueDate: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })(),
    notes: 'Development sprint payment',
    active: true,
    createdAt: '2026-08-10T14:30:00Z',
  },
  {
    id: 'intent_4',
    recipientId: 'rec_gospel_4',
    amount: 1000,
    tokenSymbol: 'USDC',
    networkId: 'base-mainnet',
    frequency: 'monthly',
    dueDayOfMonth: 5,
    scheduleTime: '10:00',
    nextDueDate: '2026-09-05', // Scheduled September 5, 2026 (Overdue)
    notes: 'Monthly design retainer',
    active: true,
    createdAt: '2026-08-12T11:00:00Z',
  },
  {
    id: 'intent_5',
    recipientId: 'rec_coco_5',
    amount: 75,
    tokenSymbol: 'USDC',
    networkId: 'base-mainnet',
    frequency: 'weekly',
    dueDayOfWeek: 2, // Every Tuesday
    scheduleTime: '09:00',
    nextDueDate: (() => {
      const d = new Date();
      const currentDay = d.getDay();
      const diff = (2 - currentDay + 7) % 7;
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })(),
    notes: 'Weekly ops allocation',
    active: true,
    createdAt: '2026-08-14T08:00:00Z',
  },
  {
    id: 'intent_3',
    recipientId: 'rec_host_3',
    amount: 0.05,
    tokenSymbol: 'ETH',
    networkId: 'base-mainnet',
    frequency: 'monthly',
    dueDayOfMonth: 15,
    scheduleTime: '12:00',
    nextDueDate: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 12);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })(),
    notes: 'Base RPC node relay',
    active: true,
    createdAt: '2026-08-15T09:15:00Z',
  },
];
