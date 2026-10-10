import React, { useState } from 'react';
import {
  Wallet,
  X,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  LogOut,
  Loader2,
  Cpu,
  Smartphone,
  Download,
} from 'lucide-react';
import {
  WalletState,
  WalletProviderId,
  getSupportedWalletProviders,
  isMobileDevice,
  openInMetaMaskApp,
} from '../lib/wallet';
import { BASE_MAINNET_CHAIN_ID } from '../constants';

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletState: WalletState;
  onConnectProvider: (providerId: WalletProviderId) => Promise<void>;
  onDisconnect: () => void;
  onSwitchNetwork: () => Promise<void>;
}

export const ConnectWalletModal: React.FC<ConnectWalletModalProps> = ({
  isOpen,
  onClose,
  walletState,
  onConnectProvider,
  onDisconnect,
  onSwitchNetwork,
}) => {
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const [connectingId, setConnectingId] = useState<WalletProviderId | null>(null);

  if (!isOpen) return null;

  const providers = getSupportedWalletProviders();
  const isMobile = isMobileDevice();
  const metaMaskOption = providers.find((p) => p.id === 'metamask') || providers[0];

  const handleCopy = () => {
    if (!walletState.address) return;
    navigator.clipboard.writeText(walletState.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }
  };

  const handleConnect = async (providerId: WalletProviderId) => {
    setConnectingId(providerId);
    try {
      await onConnectProvider(providerId);
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-jexi-overlay backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-md shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto text-jexi-primary">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-jexi-subtle">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-jexi-primary">JEXI Connect Wallet</h3>
              <p className="text-[11px] text-jexi-muted">Self-custody signing identity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-jexi-muted hover:text-jexi-primary p-1 text-sm font-semibold rounded-lg hover:bg-jexi-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* State: Connected Wallet Overview */}
        {walletState.isConnected && walletState.address ? (
          <div className="space-y-4">
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/40 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Wallet Connected</span>
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                  {walletState.providerName || 'EVM Wallet'}
                </span>
              </div>

              {/* Address with Copy */}
              <div className="pt-1">
                <span className="text-[10px] text-jexi-muted block uppercase font-mono">Signing Address</span>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="font-mono text-xs text-jexi-primary font-medium truncate">
                    {walletState.address}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="p-1 rounded bg-jexi-surface hover:bg-jexi-hover border border-jexi-subtle text-jexi-secondary hover:text-jexi-primary transition-colors shrink-0 cursor-pointer"
                    title="Copy full address"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Network */}
              <div className="pt-2 border-t border-emerald-200/50 dark:border-emerald-500/20 flex items-center justify-between text-xs">
                <span className="text-jexi-muted text-[11px]">Network:</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${walletState.isWrongNetwork ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  />
                  <span className="font-medium text-jexi-primary">
                    {walletState.chainId === BASE_MAINNET_CHAIN_ID
                      ? 'Base'
                      : `Chain ID: ${walletState.chainId || 'Unknown'}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Wrong Network Warning */}
            {walletState.isWrongNetwork && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/40 rounded-xl space-y-2 text-xs">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Network Mismatch</span>
                </div>
                <p className="text-[11px] text-rose-600 dark:text-rose-200">
                  Your connected wallet is on chain {walletState.chainId}. JEXI supports Base Mainnet (8453).
                </p>
                <button
                  onClick={onSwitchNetwork}
                  className="w-full py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Switch Network to Base
                </button>
              </div>
            )}

            {/* Safety Boundary Callout */}
            <div className="p-3 bg-jexi-elevated rounded-xl border border-jexi-subtle text-[11px] text-jexi-muted space-y-1">
              <span className="font-semibold text-jexi-primary flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                <span>Self-Custody Safety Guarantee</span>
              </span>
              <p className="leading-relaxed">
                Wallet connection establishes your signing authority identity. JEXI never possesses private keys and cannot autonomously trigger transactions.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-jexi-divider">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary border border-jexi-subtle text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>

              <button
                onClick={() => {
                  onDisconnect();
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect Wallet</span>
              </button>
            </div>
          </div>
        ) : (
          /* State: Select / Connect Provider */
          <div className="space-y-4">
            <p className="text-xs text-jexi-secondary leading-relaxed">
              Connect your Web3 wallet (MetaMask or Ledger) to establish your self-custody signing identity for payment preparation and authorization reviews.
            </p>

            {/* Error Notice Banner */}
            {walletState.error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/40 rounded-xl space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Wallet Connection Notice</span>
                </div>
                <p className="text-[11px] text-rose-600 dark:text-rose-200 leading-relaxed">
                  {walletState.error}
                </p>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {isMobile && (
                    <button
                      onClick={() => openInMetaMaskApp()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Open in MetaMask App</span>
                    </button>
                  )}
                  {/install|download/i.test(walletState.error) && (
                    <a
                      href="https://metamask.io/download/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Install MetaMask</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Mobile Recommended Action */}
            {isMobile && !metaMaskOption.isInstalled && (
              <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-jexi-primary">Mobile Browser Detected</span>
                </div>
                <p className="text-[11px] text-jexi-secondary leading-relaxed">
                  For the fastest, 1-tap connection on mobile devices, open JEXI inside the MetaMask Mobile app:
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={() => openInMetaMaskApp()}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Open in MetaMask App</span>
                  </button>
                  <button
                    onClick={handleCopyUrl}
                    className="py-2 px-2.5 rounded-lg border border-jexi-subtle bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    title="Copy URL to paste into MetaMask browser"
                  >
                    {urlCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="text-[11px]">{urlCopied ? 'Copied' : 'Copy URL'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Provider Options List */}
            <div className="space-y-2">
              {providers.map((p) => {
                const isConnectingThis = connectingId === p.id;
                return (
                  <button
                    key={p.id}
                    disabled={walletState.isConnecting}
                    onClick={() => handleConnect(p.id)}
                    className="w-full p-3 rounded-xl border border-jexi-subtle bg-jexi-elevated hover:bg-jexi-hover hover:border-emerald-500/40 text-left flex items-center justify-between gap-3 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-jexi-primary">{p.name}</span>
                        {p.isInstalled ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 uppercase">
                            Detected
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-jexi-surface text-jexi-muted border border-jexi-subtle">
                            {isMobile ? 'Mobile App' : 'Browser Extension'}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-jexi-muted">{p.description}</p>
                    </div>

                    <div className="shrink-0">
                      {isConnectingThis ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                          <Loader2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-spin" />
                          <span>Connecting...</span>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-950 transition-colors">
                          Connect
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop without extension: direct install & QR connect options */}
            {!isMobile && !metaMaskOption.isInstalled && (
              <div className="p-3 bg-jexi-surface border border-jexi-subtle rounded-xl text-xs space-y-2">
                <span className="font-semibold text-jexi-primary block text-[11px]">Desktop Connection Options</span>
                <div className="flex items-center gap-2">
                  <a
                    href="https://metamask.io/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>Install MetaMask Extension</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            )}

            {/* Environment & Compatibility Note */}
            <div className="p-3 bg-jexi-surface border border-jexi-subtle rounded-xl text-[11px] text-jexi-muted space-y-1">
              <span className="font-semibold text-jexi-primary block">Environment & Compatibility Note</span>
              <p className="leading-relaxed">
                JEXI uses Base Mainnet (Chain ID 8453). Connect with any Web3 wallet extension on desktop or MetaMask Mobile app on mobile devices.
              </p>
            </div>

            <div className="flex justify-end pt-2 border-t border-jexi-divider">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-jexi-elevated hover:bg-jexi-hover text-jexi-secondary border border-jexi-subtle text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
