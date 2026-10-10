import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import {
  BASE_MAINNET_CHAIN_ID,
  SUPPORTED_NETWORKS,
} from '../constants';

export type WalletBalanceStatus = 'disconnected' | 'loading' | 'available' | 'unavailable';

export interface ConnectedWalletBalance {
  status: WalletBalanceStatus;
  usdc: number | null;
  formatted: string | null;
  raw?: bigint | null;
  error?: string | null;
}

export const INITIAL_WALLET_BALANCE: ConnectedWalletBalance = {
  status: 'disconnected',
  usdc: null,
  formatted: null,
  raw: null,
  error: null,
};

// Official Base Mainnet USDC contract address
const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  [BASE_MAINNET_CHAIN_ID]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

const BALANCE_OF_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Fetches real on-chain USDC balance for a connected wallet address on Base Mainnet.
 * Returns disconnected status if no active wallet address or network is present.
 */
export async function fetchLiveWalletBalance(
  address: `0x${string}` | null,
  chainId: number | null
): Promise<ConnectedWalletBalance> {
  if (!address) {
    return {
      status: 'disconnected',
      usdc: null,
      formatted: null,
    };
  }

  const targetChainId = chainId || BASE_MAINNET_CHAIN_ID;
  const tokenContract = USDC_ADDRESSES[targetChainId] || USDC_ADDRESSES[BASE_MAINNET_CHAIN_ID];
  if (!tokenContract) {
    return {
      status: 'unavailable',
      usdc: null,
      formatted: null,
      raw: null,
      error: `Chain ID ${targetChainId} is not configured for USDC verification.`,
    };
  }

  const rpcUrl = SUPPORTED_NETWORKS['base-mainnet']?.rpcUrl || 'https://mainnet.base.org';

  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl, { timeout: 8000 }),
    });

    const rawBalance = await publicClient.readContract({
      address: tokenContract,
      abi: BALANCE_OF_ABI,
      functionName: 'balanceOf',
      args: [address],
    } as any);

    const rawBigInt = rawBalance as bigint;
    const formattedUnits = formatUnits(rawBigInt, 6);
    const num = parseFloat(formattedUnits);

    return {
      status: 'available',
      usdc: num,
      formatted: num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      raw: rawBigInt,
      error: null,
    };
  } catch (error: any) {
    console.warn('Failed to fetch live on-chain USDC balance:', error);
    return {
      status: 'unavailable',
      usdc: null,
      formatted: null,
      raw: null,
      error: error?.message || 'RPC balance query failed',
    };
  }
}
