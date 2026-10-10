import {
  createWalletClient,
  custom,
  getAddress,
  type WalletClient,
  type CustomTransport,
} from 'viem';
import { base } from 'viem/chains';
import { createEVMClient, type MetamaskConnectEVM } from '@metamask/connect-evm';
import { BASE_MAINNET_CHAIN_ID } from '../constants';

export type WalletProviderId = 'metamask' | 'ledger';

export interface WalletProviderOption {
  id: WalletProviderId;
  name: string;
  isInstalled: boolean;
  description: string;
}

export interface WalletState {
  address: `0x${string}` | null;
  chainId: number | null;
  providerId: WalletProviderId | null;
  providerName: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  isWrongNetwork: boolean;
  isAvailable: boolean;
  error: string | null;
}

export const INITIAL_WALLET_STATE: WalletState = {
  address: null,
  chainId: null,
  providerId: null,
  providerName: null,
  isConnecting: false,
  isConnected: false,
  isWrongNetwork: false,
  isAvailable: typeof window !== 'undefined' && Boolean((window as unknown as { ethereum?: unknown }).ethereum),
  error: null,
};

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isTrust?: boolean;
  isLedgerLive?: boolean;
  providers?: (EthereumProvider & { isMetaMask?: boolean; isTrust?: boolean; isLedgerLive?: boolean })[];
};

// EIP-6963 Standard Types
export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EthereumProvider;
}

// Module-level state for discovered providers and active wallet session
const discoveredEip6963Providers = new Map<string, EIP6963ProviderDetail>();
let activeWalletProvider: EthereumProvider | null = null;
let activeMetaMaskClient: MetamaskConnectEVM | null = null;
let activeMetaMaskClientPromise: Promise<MetamaskConnectEVM> | null = null;

// Initialize EIP-6963 Event Listener on client startup
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', ((event: CustomEvent<EIP6963ProviderDetail>) => {
    if (event.detail && event.detail.info && event.detail.provider) {
      const key = event.detail.info.rdns || event.detail.info.uuid || event.detail.info.name;
      discoveredEip6963Providers.set(key, event.detail);
    }
  }) as EventListener);

  try {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  } catch {
    // ignore
  }
}

type WalletEventCallbacks = {
  onAccountsChanged: (accounts: string[]) => void;
  onChainChanged: (chainIdHex: string) => void;
  onDisconnect?: () => void;
};

const registeredCallbacks = new Set<WalletEventCallbacks>();

function notifyAccountsChanged(accounts: string[]) {
  registeredCallbacks.forEach((cb) => cb.onAccountsChanged(accounts));
}

function notifyChainChanged(chainIdHex: string) {
  registeredCallbacks.forEach((cb) => cb.onChainChanged(chainIdHex));
}

function notifyDisconnect() {
  registeredCallbacks.forEach((cb) => cb.onDisconnect?.());
}

/**
 * Returns the currently active Ethereum provider (either MetaMask Connect client or injected window.ethereum)
 */
export function getEthereumProvider(): EthereumProvider | null {
  if (activeWalletProvider) return activeWalletProvider;
  const { provider } = resolveEthereumProvider('metamask');
  if (provider && typeof provider.request === 'function') {
    activeWalletProvider = provider;
    return provider;
  }
  if (typeof window === 'undefined') return null;
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  if (!eth || typeof eth.request !== 'function') return null;
  return eth;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isInsideMetaMaskBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /MetaMaskMobile|MetaMask/i.test(ua);
}

export function isLedgerLiveEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as { ethereum?: EthereumProvider };
  if (win.ethereum?.isLedgerLive === true) return true;
  for (const [, detail] of discoveredEip6963Providers.entries()) {
    if (detail.provider.isLedgerLive === true) return true;
  }
  return false;
}

export function getMetaMaskDeepLink(rawUrl?: string): string {
  const target = rawUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const cleanUrl = target.replace(/^https?:\/\//i, '');
  return `https://metamask.app.link/dapp/${cleanUrl}`;
}

export function openInMetaMaskApp(rawUrl?: string): void {
  if (typeof window === 'undefined') return;
  const deepLink = getMetaMaskDeepLink(rawUrl);
  window.location.href = deepLink;
}

/**
 * Returns or initializes the official MetaMask Connect EVM client singleton
 */
export async function getMetaMaskConnectClient(): Promise<MetamaskConnectEVM> {
  if (activeMetaMaskClient) return activeMetaMaskClient;
  if (activeMetaMaskClientPromise) return activeMetaMaskClientPromise;

  activeMetaMaskClientPromise = (async () => {
    try {
      const origin = typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : 'https://jexi.app';
      const currentUrl = typeof window !== 'undefined' && window.location.href
        ? `${window.location.origin}${window.location.pathname}`
        : origin;

      const client = await createEVMClient({
        dapp: {
          name: 'JEXI',
          url: currentUrl,
        },
        api: {
          supportedNetworks: {
            '0x2105': 'https://mainnet.base.org', // Base Mainnet (Production)
            '0x1': 'https://ethereum-rpc.publicnode.com', // Ethereum Mainnet (bootstrap fallback)
          },
        },
        ui: {
          showInstallModal: false,
          preferExtension: true,
          headless: false,
        },
        eventHandlers: {
          accountsChanged: (accounts) => {
            if (activeMetaMaskClient) {
              const clientProvider = activeMetaMaskClient.getProvider() as unknown as EthereumProvider;
              if (!activeWalletProvider || activeWalletProvider === clientProvider) {
                if (accounts && accounts.length > 0) {
                  activeWalletProvider = clientProvider;
                }
                notifyAccountsChanged(accounts ? accounts.map(String) : []);
              }
            }
          },
          chainChanged: (chainId) => {
            if (activeMetaMaskClient) {
              const clientProvider = activeMetaMaskClient.getProvider() as unknown as EthereumProvider;
              if (!activeWalletProvider || activeWalletProvider === clientProvider) {
                notifyChainChanged(String(chainId));
              }
            }
          },
          disconnect: () => {
            if (activeMetaMaskClient) {
              const clientProvider = activeMetaMaskClient.getProvider() as unknown as EthereumProvider;
              if (!activeWalletProvider || activeWalletProvider === clientProvider) {
                notifyDisconnect();
              }
            }
          },
        },
      });

      activeMetaMaskClient = client;
      return client;
    } catch (err) {
      activeMetaMaskClientPromise = null;
      throw err;
    }
  })();

  return activeMetaMaskClientPromise;
}

/**
 * Returns list of supported wallet providers with real-time detection
 */
export function getSupportedWalletProviders(): WalletProviderOption[] {
  if (typeof window === 'undefined') {
    return [
      {
        id: 'metamask',
        name: 'MetaMask',
        isInstalled: false,
        description: 'Connect using MetaMask browser extension or mobile app',
      },
    ];
  }

  const { provider: metamaskProvider } = resolveEthereumProvider('metamask');
  const isMetaMaskInstalled = Boolean(metamaskProvider);

  const options: WalletProviderOption[] = [
    {
      id: 'metamask',
      name: 'MetaMask',
      isInstalled: isMetaMaskInstalled,
      description: isMetaMaskInstalled
        ? 'MetaMask extension / in-app wallet detected'
        : isMobileDevice()
        ? 'Open directly in MetaMask Mobile or connect via Web3'
        : 'Connect using MetaMask browser extension or QR code',
    },
  ];

  // Only show Ledger when Ledger Wallet injected EIP-1193 provider is actually detected
  const { provider: ledgerProvider } = resolveEthereumProvider('ledger');
  if (ledgerProvider) {
    options.push({
      id: 'ledger',
      name: 'Ledger',
      isInstalled: true,
      description: 'Ledger Wallet detected — hardware authority boundary active',
    });
  }

  return options;
}

/**
 * Resolves the specific target EIP-1193 provider using EIP-6963 and window.ethereum
 */
export function resolveEthereumProvider(targetProviderId: WalletProviderId = 'metamask'): {
  provider: EthereumProvider | null;
  detectedId: WalletProviderId;
  name: string;
} {
  if (typeof window === 'undefined') {
    return { provider: null, detectedId: targetProviderId, name: targetProviderId === 'ledger' ? 'Ledger' : 'MetaMask' };
  }

  const win = window as unknown as {
    ethereum?: EthereumProvider;
  };

  // If Ledger is explicitly targeted, search specifically for Ledger provider
  if (targetProviderId === 'ledger') {
    // 1. Check EIP-6963 discovered providers for Ledger
    for (const [, detail] of discoveredEip6963Providers.entries()) {
      if (detail.provider.isLedgerLive === true) {
        if (typeof detail.provider.request === 'function') {
          return { provider: detail.provider, detectedId: 'ledger', name: detail.info.name || 'Ledger' };
        }
      }
    }

    // 2. Multi-provider array check for Ledger
    if (Array.isArray(win.ethereum?.providers)) {
      const ledgerP = win.ethereum.providers.find((p) => p.isLedgerLive === true);
      if (ledgerP && typeof ledgerP.request === 'function') {
        return { provider: ledgerP, detectedId: 'ledger', name: 'Ledger' };
      }
    }

    // 3. Direct injected window.ethereum.isLedgerLive
    if (win.ethereum?.isLedgerLive === true && typeof win.ethereum.request === 'function') {
      return { provider: win.ethereum, detectedId: 'ledger', name: 'Ledger' };
    }

    return { provider: null, detectedId: 'ledger', name: 'Ledger' };
  }

  // If default / MetaMask targeted: check if running inside Ledger Wallet environment first
  if (win.ethereum?.isLedgerLive === true && typeof win.ethereum.request === 'function') {
    return { provider: win.ethereum, detectedId: 'ledger', name: 'Ledger' };
  }

  for (const [, detail] of discoveredEip6963Providers.entries()) {
    if (detail.provider.isLedgerLive === true && typeof detail.provider.request === 'function') {
      return { provider: detail.provider, detectedId: 'ledger', name: detail.info.name || 'Ledger' };
    }
  }

  // 1. Check EIP-6963 discovered providers for MetaMask
  for (const [, detail] of discoveredEip6963Providers.entries()) {
    if (
      detail.info.rdns?.includes('metamask') ||
      detail.info.name?.toLowerCase().includes('metamask') ||
      detail.provider.isMetaMask
    ) {
      if (typeof detail.provider.request === 'function') {
        return { provider: detail.provider, detectedId: 'metamask', name: detail.info.name || 'MetaMask' };
      }
    }
  }

  // 2. Multi-provider array check (e.g. MetaMask alongside other extensions)
  if (Array.isArray(win.ethereum?.providers)) {
    const metaP = win.ethereum.providers.find((p) => p.isMetaMask && !p.isTrust);
    if (metaP && typeof metaP.request === 'function') return { provider: metaP, detectedId: 'metamask', name: 'MetaMask' };
    const anyMeta = win.ethereum.providers.find((p) => p.isMetaMask);
    if (anyMeta && typeof anyMeta.request === 'function') return { provider: anyMeta, detectedId: 'metamask', name: 'MetaMask' };
    const anyEip = win.ethereum.providers.find((p) => typeof p.request === 'function');
    if (anyEip) return { provider: anyEip, detectedId: 'metamask', name: 'MetaMask' };
  }

  // 3. Direct MetaMask injected provider
  if (win.ethereum?.isMetaMask && typeof win.ethereum.request === 'function') {
    return { provider: win.ethereum, detectedId: 'metamask', name: 'MetaMask' };
  }

  // 4. Any standard EIP-1193 injected provider
  const eth = win.ethereum;
  if (eth && typeof eth.request === 'function') {
    return { provider: eth, detectedId: 'metamask', name: 'MetaMask' };
  }

  return { provider: null, detectedId: 'metamask', name: 'MetaMask' };
}

export function getWalletClient(_chainId?: number): WalletClient<CustomTransport, typeof base> | null {
  const provider = getEthereumProvider();
  if (!provider) return null;
  return createWalletClient({
    chain: base,
    transport: custom(provider),
  });
}

/**
 * Connect to user's wallet.
 * Supports injected browser extensions (EIP-1193/EIP-6963) and MetaMask Connect SDK fallback.
 */
export async function connectBrowserWallet(
  targetProviderId: WalletProviderId = 'metamask',
  options?: { mode?: 'injected' | 'sdk' }
): Promise<{
  address: `0x${string}` | null;
  chainId: number | null;
  providerId: WalletProviderId | null;
  providerName: string | null;
  error?: string;
  isNotInstalled?: boolean;
}> {
  const isMobile = isMobileDevice();

  // Try EIP-6963 / window.ethereum injected provider first (unless explicitly in SDK mode)
  if (options?.mode !== 'sdk') {
    const { provider: injectedProvider, detectedId, name: providerLabel } = resolveEthereumProvider(targetProviderId);

    if (injectedProvider && typeof injectedProvider.request === 'function') {
      try {
        // Request accounts with a 45-second user response timeout
        const accountsPromise = injectedProvider.request({
          method: 'eth_requestAccounts',
        }) as Promise<string[]>;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Connection request timed out. Please unlock ${providerLabel} and try again.`)), 45000)
        );

        const accounts = await Promise.race([accountsPromise, timeoutPromise]);

        if (!accounts || accounts.length === 0) {
          return {
            address: null,
            chainId: null,
            providerId: null,
            providerName: null,
            error: `No accounts returned by ${providerLabel}.`,
          };
        }

        const rawAddress = accounts[0];
        const checksummedAddress = getAddress(rawAddress);

        let chainId: number | null = null;
        try {
          const chainHex = (await injectedProvider.request({ method: 'eth_chainId' })) as string;
          chainId = parseInt(chainHex, 16);
        } catch {
          // ignore chain query failure
        }

        activeWalletProvider = injectedProvider;

        return {
          address: checksummedAddress,
          chainId,
          providerId: detectedId,
          providerName: providerLabel,
        };
      } catch (err: unknown) {
        const errObj = err as { code?: number; message?: string };
        if (errObj.code === 4001 || /rejected|cancelled|denied/i.test(errObj.message || '')) {
          return {
            address: null,
            chainId: null,
            providerId: null,
            providerName: null,
            error: 'Connection request was cancelled in your wallet.',
          };
        }
        if (errObj.code === -32002 || /already pending/i.test(errObj.message || '')) {
          return {
            address: null,
            chainId: null,
            providerId: null,
            providerName: null,
            error: `A ${providerLabel} connection request is already pending. Please approve or reject it in your wallet.`,
          };
        }
        return {
          address: null,
          chainId: null,
          providerId: null,
          providerName: null,
          error: errObj.message || `Failed to connect with ${providerLabel}.`,
        };
      }
    }
  }

  // If Ledger was targeted specifically and not detected, report cleanly
  if (targetProviderId === 'ledger') {
    return {
      address: null,
      chainId: null,
      providerId: null,
      providerName: null,
      isNotInstalled: true,
      error: 'Ledger Wallet provider was not detected. Please open JEXI in the Ledger Wallet dApp Browser.',
    };
  }

  // If on desktop and no extension is installed, inform the user clearly
  if (!isMobile && options?.mode !== 'sdk') {
    return {
      address: null,
      chainId: null,
      providerId: null,
      providerName: null,
      isNotInstalled: true,
      error: 'MetaMask extension was not detected in this browser. Please install the extension or connect via QR code.',
    };
  }

  // When SDK mode or mobile connection is used: check existing session first to avoid redundant prompts
  try {
    const client = await getMetaMaskConnectClient();
    const existingAccount = client.getAccount();
    if (existingAccount) {
      const checksummedAddress = getAddress(existingAccount);
      const chainIdHex = client.getChainId();
      const chainId = parseChainId(chainIdHex);
      activeWalletProvider = client.getProvider() as unknown as EthereumProvider;
      return {
        address: checksummedAddress,
        chainId,
        providerId: 'metamask',
        providerName: 'MetaMask',
      };
    }

    const connectPromise = client.connect({
      chainIds: ['0x2105', '0x1'], // Base Mainnet (8453)
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('MetaMask connection timed out.')), 30000)
    );

    const connectionResult = await Promise.race([connectPromise, timeoutPromise]);

    if (!connectionResult.accounts || connectionResult.accounts.length === 0) {
      return {
        address: null,
        chainId: null,
        providerId: null,
        providerName: null,
        error: 'No accounts returned by MetaMask.',
      };
    }

    const rawAddress = connectionResult.accounts[0];
    const checksummedAddress = getAddress(rawAddress);
    const chainIdHex = connectionResult.chainId;
    const chainId = parseChainId(chainIdHex);

    activeWalletProvider = client.getProvider() as unknown as EthereumProvider;

    return {
      address: checksummedAddress,
      chainId,
      providerId: 'metamask',
      providerName: 'MetaMask',
    };
  } catch (err: unknown) {
    const errObj = err as { code?: number; rpcCode?: number; message?: string };
    const code = errObj.code ?? errObj.rpcCode;
    const rawMsg = errObj?.message || '';

    if (code === 4001 || /rejected|cancelled|denied/i.test(rawMsg)) {
      return {
        address: null,
        chainId: null,
        providerId: null,
        providerName: null,
        error: 'Connection request was cancelled in MetaMask.',
      };
    }

    if (code === -32002 || /already pending|existing connection/i.test(rawMsg)) {
      return {
        address: null,
        chainId: null,
        providerId: null,
        providerName: null,
        error: 'A MetaMask connection request is already pending. Please check MetaMask.',
      };
    }

    if (/timed out|timeout|transport/i.test(rawMsg)) {
      if (isMobile) {
        return {
          address: null,
          chainId: null,
          providerId: null,
          providerName: null,
          error: 'Connection timed out. For the best mobile experience, tap "Open in MetaMask App" below to open JEXI in MetaMask Mobile.',
        };
      }
      return {
        address: null,
        chainId: null,
        providerId: null,
        providerName: null,
        isNotInstalled: true,
        error: 'MetaMask extension was not detected in this browser. Please install the extension or scan with MetaMask Mobile.',
      };
    }

    return {
      address: null,
      chainId: null,
      providerId: null,
      providerName: null,
      error:
        rawMsg ||
        (isMobile
          ? 'Could not connect. Tap "Open in MetaMask App" to connect directly.'
          : 'Could not connect. Please ensure MetaMask extension is installed and unlocked.'),
    };
  }
}

/**
 * Disconnect browser wallet session state
 */
export function disconnectBrowserWallet(): WalletState {
  if (activeMetaMaskClient) {
    activeMetaMaskClient.disconnect().catch(() => {});
  }
  activeWalletProvider = null;
  activeMetaMaskClient = null;
  activeMetaMaskClientPromise = null;
  return {
    ...INITIAL_WALLET_STATE,
    isAvailable: typeof window !== 'undefined' && Boolean((window as unknown as { ethereum?: unknown }).ethereum),
  };
}

/**
 * Parse chain ID from hex, decimal string, or number safely.
 */
export function parseChainId(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isNaN(raw) ? null : raw;
  const str = String(raw).trim();
  if (str.startsWith('0x') || str.startsWith('0X')) {
    const parsed = parseInt(str, 16);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = Number(str);
  return Number.isNaN(parsed) ? null : parsed;
}

// In-flight network switch request promise to prevent duplicate concurrent calls
let activeNetworkSwitchPromise: Promise<{ success: boolean; error?: string }> | null = null;

/**
 * Request wallet to switch chain to Base Mainnet (chain ID 8453 / 0x2105).
 * Uses the active EIP-1193 provider directly.
 * Handles current chain detection, 4902 (chain not added), 4001 (user cancelled),
 * and -32002 (already pending) without duplicate concurrent requests.
 */
export async function switchToBaseMainnet(): Promise<{ success: boolean; error?: string }> {
  if (activeNetworkSwitchPromise) {
    return activeNetworkSwitchPromise;
  }

  activeNetworkSwitchPromise = (async () => {
    try {
      const provider = getEthereumProvider();
      if (!provider || typeof provider.request !== 'function') {
        return { success: false, error: 'No wallet provider available' };
      }

      const baseMainnetChainIdHex = `0x${BASE_MAINNET_CHAIN_ID.toString(16)}`; // 0x2105

      // 1. Detect actual current chain from provider
      let currentChainId: number | null = null;
      try {
        const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
        currentChainId = parseChainId(chainHex);
      } catch {
        // If unable to query chain, continue to switch attempt
      }

      // 2. If already Base Mainnet (8453), do NOT call wallet_switchEthereumChain unnecessarily
      if (currentChainId === BASE_MAINNET_CHAIN_ID) {
        return { success: true };
      }

      // 3. Request wallet to switch chain to Base Mainnet
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: baseMainnetChainIdHex }],
        });
        return { success: true };
      } catch (switchError: unknown) {
        const err = switchError as { code?: number; rpcCode?: number; message?: string };
        const code = err.code ?? err.rpcCode;
        const rawMsg = err.message || '';

        // 4001: User rejected the request
        if (code === 4001 || /rejected|cancelled|denied/i.test(rawMsg)) {
          return { success: false, error: 'Network switch request was cancelled in your wallet.' };
        }

        // -32002: Request is already pending in the wallet
        if (code === -32002 || /already pending/i.test(rawMsg)) {
          return { success: false, error: 'Network switch request is already pending in your wallet. Please check your wallet.' };
        }

        // 4902: Chain has not been added to wallet
        if (code === 4902 || /unrecognized chain|chain not added|has not been added/i.test(rawMsg)) {
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: baseMainnetChainIdHex,
                  chainName: 'Base',
                  nativeCurrency: {
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18,
                  },
                  rpcUrls: ['https://mainnet.base.org'],
                  blockExplorerUrls: ['https://basescan.org'],
                },
              ],
            });

            // After successfully adding, check if wallet switched or retry switch
            try {
              const postAddHex = (await provider.request({ method: 'eth_chainId' })) as string;
              if (parseChainId(postAddHex) === BASE_MAINNET_CHAIN_ID) {
                return { success: true };
              }
              await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: baseMainnetChainIdHex }],
              });
              return { success: true };
            } catch {
              return { success: true };
            }
          } catch (addError: unknown) {
            const addErr = addError as { code?: number; rpcCode?: number; message?: string };
            const addCode = addErr.code ?? addErr.rpcCode;
            const addMsg = addErr.message || '';
            if (addCode === 4001 || /rejected|cancelled|denied/i.test(addMsg)) {
              return { success: false, error: 'Adding Base network was cancelled in your wallet.' };
            }
            if (addCode === -32002 || /already pending/i.test(addMsg)) {
              return { success: false, error: 'Request to add Base network is already pending in your wallet.' };
            }
            return {
              success: false,
              error: addMsg || 'Failed to add Base network to wallet',
            };
          }
        }

        return {
          success: false,
          error: rawMsg || 'Failed to switch to Base network in your wallet.',
        };
      }
    } finally {
      activeNetworkSwitchPromise = null;
    }
  })();

  return activeNetworkSwitchPromise;
}

/**
 * Subscribe to wallet provider events (accountsChanged, chainChanged, disconnect)
 */
export function subscribeToWalletEvents(callbacks: {
  onAccountsChanged: (accounts: string[]) => void;
  onChainChanged: (chainIdHex: string) => void;
  onDisconnect?: () => void;
}): () => void {
  registeredCallbacks.add(callbacks);

  const provider = getEthereumProvider();
  let handleAccountsChanged: ((accounts: unknown) => void) | null = null;
  let handleChainChanged: ((chainIdHex: unknown) => void) | null = null;
  let handleDisconnect: (() => void) | null = null;

  if (provider && provider.on) {
    handleAccountsChanged = (accounts: unknown) => {
      callbacks.onAccountsChanged(Array.isArray(accounts) ? (accounts as string[]) : []);
    };
    handleChainChanged = (chainIdHex: unknown) => {
      callbacks.onChainChanged(typeof chainIdHex === 'string' ? chainIdHex : String(chainIdHex));
    };
    handleDisconnect = () => {
      if (callbacks.onDisconnect) callbacks.onDisconnect();
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);
    provider.on('disconnect', handleDisconnect);
  }

  return () => {
    registeredCallbacks.delete(callbacks);
    if (provider && provider.removeListener) {
      if (handleAccountsChanged) provider.removeListener('accountsChanged', handleAccountsChanged);
      if (handleChainChanged) provider.removeListener('chainChanged', handleChainChanged);
      if (handleDisconnect) provider.removeListener('disconnect', handleDisconnect);
    }
  };
}

/**
 * Check already connected accounts on startup/refresh without triggering user prompt.
 * Rehydrates wallet and network state from the active EIP-1193 provider.
 */
export async function checkConnectedWallet(): Promise<{
  address: `0x${string}` | null;
  chainId: number | null;
  providerId: WalletProviderId | null;
  providerName: string | null;
}> {
  // 1. Check if an active injected provider already has accounts authorized
  const { provider, detectedId, name } = resolveEthereumProvider();
  if (provider && typeof provider.request === 'function') {
    try {
      let accounts = (await provider.request({ method: 'eth_accounts' })) as string[];

      // Quick retry for cold reload where extension injects accounts asynchronously
      if (!accounts || accounts.length === 0) {
        await new Promise((r) => setTimeout(r, 60));
        try {
          accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
        } catch {
          // ignore
        }
      }

      if (accounts && accounts.length > 0) {
        const address = getAddress(accounts[0]);
        let chainId: number | null = null;
        try {
          const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
          chainId = parseChainId(chainHex);
        } catch {
          // ignore chain query failure
        }
        activeWalletProvider = provider;
        return { address, chainId, providerId: detectedId, providerName: name };
      }
    } catch {
      // ignore
    }
  }

  // 2. Check MetaMask Connect client session (rehydrate via SDK on startup/refresh)
  try {
    const client = await getMetaMaskConnectClient();
    const account = client.getAccount();
    const chainHex = client.getChainId();
    if (account) {
      const address = getAddress(account);
      const chainId = parseChainId(chainHex);
      activeWalletProvider = client.getProvider() as unknown as EthereumProvider;
      return { address, chainId, providerId: 'metamask', providerName: 'MetaMask' };
    }
  } catch {
    // ignore
  }

  return { address: null, chainId: null, providerId: null, providerName: null };
}

/**
 * Executes a prepared transaction request through the active connected EIP-1193 provider.
 * All parameters (to, from, data, value) must strictly come from the verified prepared transaction.
 */
export async function sendEIP1193Transaction(params: {
  from: `0x${string}`;
  to: `0x${string}`;
  data: `0x${string}` | string;
  value?: string;
  onLateSuccess?: (txHash: `0x${string}`) => void;
}): Promise<{
  success: boolean;
  txHash?: `0x${string}`;
  error?: string;
  isUserRejected?: boolean;
}> {
  const provider = getEthereumProvider();
  if (!provider || typeof provider.request !== 'function') {
    return {
      success: false,
      error: 'No active EIP-1193 wallet provider available. Please reconnect your wallet.',
    };
  }

  // 1. Verify chain is Base Mainnet (8453)
  try {
    const chainHex = (await provider.request({ method: 'eth_chainId' })) as string;
    const currentChainId = parseChainId(chainHex);
    if (currentChainId !== null && currentChainId !== BASE_MAINNET_CHAIN_ID) {
      const switchRes = await switchToBaseMainnet();
      if (!switchRes.success) {
        return {
          success: false,
          error: switchRes.error || `Wallet is on Chain ID ${currentChainId}, but Base Mainnet (${BASE_MAINNET_CHAIN_ID}) is required. Please switch network before authorizing.`,
        };
      }
    }
  } catch {
    // ignore non-blocking chain check if provider fails chain query
  }

  // 2. Verify connected account matches the prepared signer
  try {
    let accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
    if (!accounts || accounts.length === 0) {
      try {
        accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      } catch (reqErr: unknown) {
        const err = reqErr as { code?: number; message?: string };
        if (err.code === 4001 || /rejected|cancelled|denied/i.test(err.message || '')) {
          return {
            success: false,
            isUserRejected: true,
            error: 'Account authorization was cancelled in your wallet.',
          };
        }
      }
    }
    if (!accounts || accounts.length === 0) {
      return {
        success: false,
        error: 'No active account authorized in wallet. Please unlock or reconnect your wallet.',
      };
    }
    const currentAccount = getAddress(accounts[0]);
    if (currentAccount.toLowerCase() !== params.from.toLowerCase()) {
      return {
        success: false,
        error: `Active wallet account (${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}) differs from prepared signer (${params.from.slice(0, 6)}...${params.from.slice(-4)}). Please re-prepare with the current account.`,
      };
    }
  } catch (accErr: unknown) {
    const err = accErr as { message?: string };
    if (err.message && /differ|reject/i.test(err.message)) {
      return { success: false, error: err.message };
    }
  }

  // 3. Format EIP-1193 transaction payload
  const hexValue =
    params.value && params.value !== '0'
      ? params.value.startsWith('0x')
        ? params.value
        : `0x${BigInt(params.value).toString(16)}`
      : '0x0';

  const txPayload = {
    from: params.from,
    to: params.to,
    data: params.data,
    value: hexValue,
  };

  try {
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const sendPromise = provider.request({
      method: 'eth_sendTransaction',
      params: [txPayload],
    }) as Promise<`0x${string}`>;

    if (params.onLateSuccess) {
      sendPromise.then((txHash) => {
        if (timedOut && txHash && typeof txHash === 'string' && txHash.startsWith('0x')) {
          try {
            params.onLateSuccess!(txHash);
          } catch {}
        }
      }).catch(() => {});
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => {
          timedOut = true;
          reject(
            new Error(
              'Wallet response was not received within 60 seconds. The transaction outcome is unknown; please check MetaMask Activity before attempting any action.'
            )
          );
        },
        60000
      );
    });

    let txHash: `0x${string}`;
    try {
      txHash = (await Promise.race([sendPromise, timeoutPromise])) as `0x${string}`;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!txHash || typeof txHash !== 'string' || !txHash.startsWith('0x')) {
      return {
        success: false,
        error: 'Wallet did not return a valid transaction hash.',
      };
    }

    return {
      success: true,
      txHash,
    };
  } catch (err: unknown) {
    const errObj = err as { code?: number; rpcCode?: number; message?: string };
    const code = errObj.code ?? errObj.rpcCode;
    const rawMsg = errObj?.message || '';

    if (code === 4001 || /rejected|cancelled|denied/i.test(rawMsg)) {
      return {
        success: false,
        isUserRejected: true,
        error: 'Transaction authorization was cancelled/rejected in your wallet.',
      };
    }

    if (code === -32002 || /already pending/i.test(rawMsg)) {
      return {
        success: false,
        error: 'A transaction request is already pending in your wallet. Please check MetaMask.',
      };
    }

    if (/wallet response was not received|timed out|timeout/i.test(rawMsg)) {
      return {
        success: false,
        error: rawMsg,
      };
    }

    return {
      success: false,
      error: rawMsg || 'Failed to broadcast transaction through wallet.',
    };
  }
}

export type TransactionLifecycleStatus = 'BROADCAST_SUBMITTED' | 'CONFIRMED_ON_CHAIN' | 'FAILED_ON_CHAIN';

/**
 * Checks transaction receipt status using the active EIP-1193 provider or fallback Base RPC.
 * When receipt is not yet available, returns BROADCAST_SUBMITTED (pending).
 * When receipt has status 0x1, returns CONFIRMED_ON_CHAIN.
 * When receipt has status 0x0, returns FAILED_ON_CHAIN.
 */
export async function checkTransactionReceipt(txHash: string): Promise<{
  status: TransactionLifecycleStatus;
  blockNumber?: number;
}> {
  if (!txHash || !txHash.startsWith('0x')) {
    return { status: 'BROADCAST_SUBMITTED' };
  }

  // 1. Prefer active EIP-1193 provider
  const provider = getEthereumProvider();
  if (provider && typeof provider.request === 'function') {
    try {
      const receipt = (await provider.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      })) as { status?: string | number | boolean; blockNumber?: string | number } | null;

      if (receipt && receipt.status !== undefined && receipt.status !== null) {
        const rawStatus = receipt.status;
        const isSuccess = rawStatus === '0x1' || rawStatus === 1 || rawStatus === '1' || rawStatus === true;
        const isFailure = rawStatus === '0x0' || rawStatus === 0 || rawStatus === '0' || rawStatus === false;

        const blockNum =
          typeof receipt.blockNumber === 'string'
            ? parseInt(receipt.blockNumber, 16)
            : typeof receipt.blockNumber === 'number'
            ? receipt.blockNumber
            : undefined;

        if (isSuccess) {
          return { status: 'CONFIRMED_ON_CHAIN', blockNumber: blockNum };
        }
        if (isFailure) {
          return { status: 'FAILED_ON_CHAIN', blockNumber: blockNum };
        }
      }
    } catch {
      // provider query eth_getTransactionReceipt threw, proceed to fallback
    }
  }

  // 2. Fallback to official Base Mainnet RPC
  try {
    const res = await fetch('https://mainnet.base.org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const receipt = json?.result;
      if (receipt && receipt.status !== undefined && receipt.status !== null) {
        const rawStatus = receipt.status;
        const isSuccess = rawStatus === '0x1' || rawStatus === 1 || rawStatus === '1' || rawStatus === true;
        const isFailure = rawStatus === '0x0' || rawStatus === 0 || rawStatus === '0' || rawStatus === false;

        const blockNum =
          typeof receipt.blockNumber === 'string'
            ? parseInt(receipt.blockNumber, 16)
            : typeof receipt.blockNumber === 'number'
            ? receipt.blockNumber
            : undefined;

        if (isSuccess) {
          return { status: 'CONFIRMED_ON_CHAIN', blockNumber: blockNum };
        }
        if (isFailure) {
          return { status: 'FAILED_ON_CHAIN', blockNumber: blockNum };
        }
      }
    }
  } catch {
    // network or rpc fetch error
  }

  // Receipt not yet mined / unavailable -> remain in pending broadcast status
  return { status: 'BROADCAST_SUBMITTED' };
}

