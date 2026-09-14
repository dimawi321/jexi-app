import { NetworkConfig, TokenConfig, Recipient, PaymentIntention } from './types';

export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const SUPPORTED_NETWORKS: Record<string, NetworkConfig> = {
  'base-sepolia': {
    id: 'base-sepolia',
    name: 'Base Sepolia',
    chainId: BASE_SEPOLIA_CHAIN_ID,
    currencySymbol: 'ETH',
    explorerUrl: 'https://sepolia.basescan.org',
    isTestnet: true,
    rpcUrl: 'https://sepolia.base.org',
  },
};

export const SUPPORTED_TOKENS: TokenConfig[] = [
  {
    symbol: 'Test USDC',
    name: 'USD Coin (Testnet)',
    decimals: 6,
    contractAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    networkId: 'base-sepolia',
    isTestnet: true,
  },
  {
    symbol: 'Test ETH',
    name: 'Sepolia Ether',
    decimals: 18,
    contractAddress: '0x0000000000000000000000000000000000000000',
    networkId: 'base-sepolia',
    isTestnet: true,
  },
  {
    symbol: 'Test DAI',
    name: 'Dai Stablecoin (Testnet)',
    decimals: 18,
    contractAddress: '0x408df55225E03A1DEB66675B8B1fD561338d76df',
    networkId: 'base-sepolia',
    isTestnet: true,
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

// Initial seed recipients for testing
export const INITIAL_RECIPIENTS: Recipient[] = [
  {
    id: 'rec_mum_1',
    name: 'Mum',
    address: '0x71C63B57493F5605d8c1C4f514c4Fac7acFfe7E3',
    networkId: 'base-sepolia',
    tokenSymbol: 'Test USDC',
    defaultAmount: 50,
    notes: 'Monthly living allowance',
    createdAt: '2026-08-01T10:00:00Z',
  },
  {
    id: 'rec_alex_2',
    name: 'Alex (Dev Contractor)',
    address: '0x9965507d1a55bcc2695c58ba16Fb37D819b0A4dF',
    networkId: 'base-sepolia',
    tokenSymbol: 'Test USDC',
    defaultAmount: 350,
    notes: 'Bi-weekly infrastructure retainer',
    createdAt: '2026-08-10T14:30:00Z',
  },
  {
    id: 'rec_gospel_4',
    name: 'Gospel',
    address: '0x250e76987d838a75310c34bf422ea9f1AC4Cc906',
    networkId: 'base-sepolia',
    tokenSymbol: 'Test USDC',
    defaultAmount: 1000,
    notes: 'Monthly recurring design retainer',
    createdAt: '2026-08-12T11:00:00Z',
  },
  {
    id: 'rec_coco_5',
    name: 'Coco (Base Wallet)',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    networkId: 'base-sepolia',
    tokenSymbol: 'Test USDC',
    defaultAmount: 75,
    notes: 'Weekly operations allocation',
    createdAt: '2026-08-14T08:00:00Z',
  },
  {
    id: 'rec_host_3',
    name: 'Decentralized Hosting',
    address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
    networkId: 'base-sepolia',
    tokenSymbol: 'Test ETH',
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
    tokenSymbol: 'Test USDC',
    networkId: 'base-sepolia',
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
    tokenSymbol: 'Test USDC',
    networkId: 'base-sepolia',
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
    tokenSymbol: 'Test USDC',
    networkId: 'base-sepolia',
    frequency: 'monthly',
    dueDayOfMonth: 5,
    scheduleTime: '10:00',
    nextDueDate: '2026-09-05', // Scheduled September 5, 2026 (Overdue by 1 day)
    notes: 'Monthly design retainer (Scheduled Sept 5)',
    active: true,
    createdAt: '2026-08-12T11:00:00Z',
  },
  {
    id: 'intent_5',
    recipientId: 'rec_coco_5',
    amount: 75,
    tokenSymbol: 'Test USDC',
    networkId: 'base-sepolia',
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
    notes: 'Weekly ops allocation (Every Tuesday)',
    active: true,
    createdAt: '2026-08-14T08:00:00Z',
  },
  {
    id: 'intent_3',
    recipientId: 'rec_host_3',
    amount: 0.05,
    tokenSymbol: 'Test ETH',
    networkId: 'base-sepolia',
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
