import React, { useState } from 'react';
import {
  ShieldCheck,
  Cpu,
  RefreshCw,
  Wallet,
  User,
  Cloud,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  X,
  Info,
} from 'lucide-react';
import { TestnetWalletBalance } from '../storage/storage';
import { UserAccount } from '../types';
import { SyncStatus } from '../lib/firestoreSync';
import { WalletState } from '../lib/wallet';

interface HeaderProps {
  balance: TestnetWalletBalance;
  onRefresh: () => void;
  onResetDemo?: () => void;
  currentUser: UserAccount | null;
  onOpenAccount: () => void;
  syncStatus?: SyncStatus;
  walletState: WalletState;
  onConnectWallet: () => void;
  onSwitchNetwork: () => void;
  onClearWalletError: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  balance,
  onRefresh,
  currentUser,
  onOpenAccount,
  syncStatus = 'idle',
  walletState,
  onConnectWallet,
  onSwitchNetwork,
  onClearWalletError,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshClick = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    // Give the user immediate UI feedback, call onRefresh in case of async cleanup, then perform true browser reload
    try {
      onRefresh();
    } catch {
      // ignore
    }
    // Perform genuine browser reload from the server/cache to reconstruct a clean runtime
    window.location.reload();
  };

  const shortAddress = walletState.address
    ? `${walletState.address.slice(0, 6)}...${walletState.address.slice(-4)}`
    : null;

  return (
    <header className="sticky top-0 z-40 bg-zinc-900/95 backdrop-blur-md border-b border-zinc-800 text-zinc-100 w-full overflow-hidden">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold shadow-xs shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold tracking-tight text-lg text-zinc-100">JEXI</span>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60 hidden sm:inline-block">
                Self-Custody
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">Scheduled Payments & Transaction Preparation</p>
          </div>
        </div>

        {/* Testnet & Balance Badge & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Network tag or Wrong Network Button */}
          {walletState.isConnected && walletState.isWrongNetwork ? (
            <button
              onClick={onSwitchNetwork}
              title="Click to switch wallet network to Base Sepolia"
              className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1 rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 text-xs font-medium shrink-0 transition-colors animate-pulse"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="hidden sm:inline">Switch to</span>
              <span>Base Sepolia</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium shrink-0">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="hidden sm:inline">Base Sepolia</span>
              <span className="text-[10px] font-mono opacity-80">Testnet</span>
            </div>
          )}

          {/* Test Balance Display */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-800/80 border border-zinc-700 text-xs text-zinc-300 shrink-0">
            <Wallet className="w-3.5 h-3.5 text-zinc-400" />
            <span>{balance['Test USDC'].toLocaleString()} <span className="text-zinc-500">USDC</span></span>
          </div>

          {/* Wallet Connection Control */}
          <button
            onClick={onConnectWallet}
            disabled={walletState.isConnecting}
            title={
              walletState.isConnected
                ? `Connected: ${walletState.address} (${walletState.isWrongNetwork ? 'Wrong Network' : 'Base Sepolia'})`
                : walletState.isAvailable
                ? 'Connect browser wallet (MetaMask, Coinbase, Rabby, etc.)'
                : 'No browser wallet detected. If in iframe, open app in new tab.'
            }
            aria-label="Connect Wallet"
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-md transition-colors text-xs flex items-center gap-1.5 border shadow-xs shrink-0 ${
              walletState.isConnected
                ? walletState.isWrongNetwork
                  ? 'text-rose-300 bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20'
                  : 'text-teal-300 bg-teal-500/10 border-teal-500/30 hover:bg-teal-500/20'
                : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 border-zinc-800 bg-zinc-900/90'
            }`}
          >
            <Wallet className={`w-3.5 h-3.5 shrink-0 ${walletState.isConnected ? 'text-teal-400' : 'text-zinc-400'}`} />
            {walletState.isConnecting ? (
              <span className="text-[11px] font-semibold flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="hidden sm:inline">Connecting...</span>
              </span>
            ) : walletState.isConnected ? (
              <span className="text-[11px] font-mono font-medium">
                {shortAddress}
              </span>
            ) : (
              <span className="text-[11px] font-semibold">
                <span className="hidden sm:inline">Connect </span>Wallet
              </span>
            )}
          </button>

          {/* Account & Sync Button */}
          <button
            onClick={onOpenAccount}
            title={
              currentUser
                ? `Account: ${currentUser.email} (${
                    syncStatus === 'syncing'
                      ? 'Syncing to Firestore...'
                      : syncStatus === 'synced'
                      ? 'Cloud Synced'
                      : syncStatus === 'error'
                      ? 'Sync Error'
                      : 'Active'
                  })`
                : 'JEXI Account & Cloud Sync'
            }
            aria-label="JEXI Account"
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-md transition-colors text-xs flex items-center gap-1.5 border shadow-xs shrink-0 ${
              currentUser
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 border-zinc-800 bg-zinc-900/90'
            }`}
          >
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[11px] font-semibold max-w-[85px] truncate hidden sm:inline">
              {currentUser ? currentUser.displayName || currentUser.email.split('@')[0] : 'Account'}
            </span>
            <span className="sm:hidden text-[11px] font-semibold">Account</span>
            {currentUser && (
              <span className="flex items-center ml-0.5 shrink-0" title={`Firestore Sync: ${syncStatus}`}>
                {syncStatus === 'syncing' ? (
                  <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                ) : syncStatus === 'error' ? (
                  <AlertCircle className="w-3 h-3 text-red-400" />
                ) : (
                  <Cloud className="w-3 h-3 text-emerald-400" />
                )}
              </span>
            )}
          </button>

          {/* Single Authoritative Header Refresh Control */}
          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            title={isRefreshing ? 'Refreshing application...' : 'Refresh'}
            aria-label="Refresh"
            className="p-1.5 sm:px-2.5 sm:py-1 text-zinc-200 hover:text-emerald-400 hover:bg-zinc-800 disabled:opacity-60 disabled:pointer-events-none rounded-md transition-colors text-xs flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/90 shadow-xs shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
            <span className="text-[11px] font-semibold hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Testnet Dev Mode Banner */}
      <div className="bg-amber-950/40 border-t border-b border-amber-800/40 px-3 sm:px-4 py-1 text-center text-[10px] sm:text-[11px] text-amber-200/90 flex items-center justify-center gap-1.5 sm:gap-2">
        <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>
          <strong className="font-semibold text-amber-300">DEVELOPMENT TESTNET MODE:</strong> Offline preparation & simulation only. Ledger hardware signing will be attached in a subsequent stage.
        </span>
      </div>

      {/* Wallet Connection Feedback / Preview Environment Notice */}
      {walletState.error && (
        <div className="bg-zinc-900 border-b border-amber-500/30 px-3 sm:px-4 py-2.5 text-xs text-zinc-200">
          <div className="max-w-4xl mx-auto flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="p-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
                <Info className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-amber-300">AI Studio Preview Environment Notice</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    EIP-1193 Sandbox Limit
                  </span>
                </div>
                <p className="text-zinc-300 leading-relaxed text-[11px] sm:text-xs">
                  Embedded iframes in AI Studio cannot access browser wallet extensions like MetaMask, Rabby, or Coinbase Wallet.
                  This is a browser sandbox security limitation, <strong className="text-zinc-100">not a JEXI failure</strong>. All payment scheduling and transaction preparation remain fully functional in testnet simulation mode.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 text-[11px] font-medium transition-colors"
                  >
                    <span>Open in New Tab</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <span className="text-[11px] text-zinc-500">or continue testing with the built-in testnet simulator below</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClearWalletError}
              aria-label="Dismiss wallet notice"
              className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
