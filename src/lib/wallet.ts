import {
  createWalletClient,
  custom,
  getAddress,
  type WalletClient,
  type CustomTransport,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { BASE_SEPOLIA_CHAIN_ID } from '../constants';

export interface WalletState {
  address: `0x${string}` | null;
  chainId: number | null;
  isConnecting: boolean;
  isConnected: boolean;
  isWrongNetwork: boolean;
  isAvailable: boolean;
  error: string | null;
}

export const INITIAL_WALLET_STATE: WalletState = {
  address: null,
  chainId: null,
  isConnecting: false,
  isConnected: false,
  isWrongNetwork: false,
  isAvailable: typeof window !== 'undefined' && Boolean((window as unknown as { ethereum?: unknown }).ethereum),
  error: null,
};

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

export function getEthereumProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!eth || typeof eth.request !== 'function') return null;
  return eth;
}

export function getWalletClient(): WalletClient<CustomTransport, typeof baseSepolia> | null {
  const provider = getEthereumProvider();
  if (!provider) return null;
  return createWalletClient({
    chain: baseSepolia,
    transport: custom(provider),
  });
}

/**
 * Connect to the user's browser wallet (EIP-1193) and request accounts
 */
export async function connectBrowserWallet(): Promise<{
  address: `0x${string}` | null;
  chainId: number | null;
  error?: string;
}> {
  const provider = getEthereumProvider();
  if (!provider) {
    return {
      address: null,
      chainId: null,
      error: 'No browser wallet detected. If you are in an iframe, open in a new tab.',
    };
  }

  try {
    const accounts = (await provider.request({
      method: 'eth_requestAccounts',
    })) as string[];

    if (!accounts || accounts.length === 0) {
      return {
        address: null,
        chainId: null,
        error: 'No accounts returned by wallet.',
      };
    }

    const rawAddress = accounts[0];
    const checksummedAddress = getAddress(rawAddress);

    // Query current chain ID
    let chainId: number | null = null;
    try {
      const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
      chainId = parseInt(chainHex, 16);
    } catch {
      // ignore chain query failure
    }

    return {
      address: checksummedAddress,
      chainId,
    };
  } catch (err: unknown) {
    const errorMsg = (err as { message?: string })?.message || 'Failed to connect wallet';
    return {
      address: null,
      chainId: null,
      error: errorMsg,
    };
  }
}

/**
 * Request wallet to switch chain to Base Sepolia (chain ID 84532 / 0x14a34)
 */
export async function switchToBaseSepolia(): Promise<{ success: boolean; error?: string }> {
  const provider = getEthereumProvider();
  if (!provider) {
    return { success: false, error: 'No wallet provider available' };
  }

  const baseSepoliaChainIdHex = `0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}`;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: baseSepoliaChainIdHex }],
    });
    return { success: true };
  } catch (switchError: unknown) {
    const err = switchError as { code?: number; message?: string };
    // 4902: Unrecognized chain, request to add it
    if (err.code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: baseSepoliaChainIdHex,
              chainName: 'Base Sepolia',
              nativeCurrency: {
                name: 'Ethereum',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: ['https://sepolia.base.org'],
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            },
          ],
        });
        return { success: true };
      } catch (addError: unknown) {
        return {
          success: false,
          error: (addError as { message?: string })?.message || 'Failed to add Base Sepolia network to wallet',
        };
      }
    }
    return {
      success: false,
      error: err.message || 'Failed to switch to Base Sepolia network',
    };
  }
}

/**
 * Subscribe to wallet provider events (accountsChanged, chainChanged, disconnect)
 */
export function subscribeToWalletEvents(callbacks: {
  onAccountsChanged: (accounts: string[]) => void;
  onChainChanged: (chainIdHex: string) => void;
  onDisconnect?: () => void;
}): () => void {
  const provider = getEthereumProvider();
  if (!provider || !provider.on) {
    return () => {};
  }

  const handleAccountsChanged = (accounts: unknown) => {
    callbacks.onAccountsChanged(Array.isArray(accounts) ? (accounts as string[]) : []);
  };

  const handleChainChanged = (chainIdHex: unknown) => {
    callbacks.onChainChanged(typeof chainIdHex === 'string' ? chainIdHex : String(chainIdHex));
  };

  const handleDisconnect = () => {
    if (callbacks.onDisconnect) callbacks.onDisconnect();
  };

  provider.on('accountsChanged', handleAccountsChanged);
  provider.on('chainChanged', handleChainChanged);
  provider.on('disconnect', handleDisconnect);

  return () => {
    if (provider.removeListener) {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('chainChanged', handleChainChanged);
      provider.removeListener('disconnect', handleDisconnect);
    }
  };
}

/**
 * Check already connected accounts on startup without triggering user prompt
 */
export async function checkConnectedWallet(): Promise<{
  address: `0x${string}` | null;
  chainId: number | null;
}> {
  const provider = getEthereumProvider();
  if (!provider) return { address: null, chainId: null };

  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
    if (accounts && accounts.length > 0) {
      const address = getAddress(accounts[0]);
      let chainId: number | null = null;
      try {
        const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
        chainId = parseInt(chainHex, 16);
      } catch {
        // ignore
      }
      return { address, chainId };
    }
  } catch {
    // ignore
  }

  return { address: null, chainId: null };
}
