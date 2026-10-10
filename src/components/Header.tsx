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
import { ConnectedWalletBalance } from '../lib/balance';
import { UserAccount } from '../types';
import { SyncStatus } from '../lib/firestoreSync';
import { WalletState } from '../lib/wallet';
import { BASE_MAINNET_CHAIN_ID } from '../constants';

interface HeaderProps {
  walletBalance: ConnectedWalletBalance;
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
  walletBalance,
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
    <header className="sticky top-0 z-40 bg-jexi-surface/90 backdrop-blur-md border-b border-jexi-subtle text-jexi-primary w-full max-w-full overflow-x-hidden transition-colors">
      <div className="max-w-5xl mx-auto px-2 sm:px-6 py-2 sm:py-3 flex items-center justify-between gap-1 sm:gap-3 w-full">
        {/* Brand Zone - Clean single wordmark */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-jexi-elevated border border-jexi-subtle flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <span className="font-bold tracking-tight text-sm sm:text-lg text-jexi-primary">
            JEXI
          </span>
        </div>

        {/* Right Zone - Actions & Status */}
        <div className="flex items-center gap-1 sm:gap-2 shrink min-w-0 flex-nowrap">
          {/* Network tag or Wrong Network Button */}
          {!walletState.isConnected || !walletState.address ? (
            <div
              title="No wallet connected"
              className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-jexi-elevated border border-jexi-subtle text-jexi-muted text-xs font-medium shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-zinc-500 shrink-0" />
              <span>Not Connected</span>
            </div>
          ) : walletState.isWrongNetwork ? (
            <button
              onClick={onSwitchNetwork}
              title="Click to switch wallet network to Base"
              className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-500/20 text-xs font-medium shrink-0 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0" />
              <span className="text-[10px] sm:text-xs">
                <span className="hidden sm:inline">Switch to </span>Base
              </span>
            </button>
          ) : (
            <div
              title="Connected network: Base"
              className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-lg bg-jexi-elevated border border-jexi-subtle text-jexi-secondary text-xs font-medium shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shrink-0" />
              <span className="text-[10px] sm:text-xs">
                Base
              </span>
            </div>
          )}

          {/* Balance Display */}
          <div
            title={
              !walletState.isConnected || !walletState.address
                ? 'Connect wallet to view live balance'
                : walletBalance?.status === 'loading'
                ? 'Fetching live on-chain balance...'
                : walletBalance?.status === 'available'
                ? `Live on-chain USDC balance for ${walletState.address}`
                : 'Balance unavailable'
            }
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-jexi-elevated border border-jexi-subtle text-xs font-mono tabular-nums text-jexi-primary shrink-0"
          >
            <span className="text-jexi-muted font-sans text-[11px]">Balance:</span>
            {!walletState.isConnected || !walletState.address ? (
              <span className="text-jexi-muted font-sans font-medium">—</span>
            ) : walletBalance?.status === 'loading' ? (
              <Loader2 className="w-3 h-3 text-jexi-muted animate-spin" />
            ) : walletBalance?.status === 'available' && walletBalance.formatted !== null ? (
              <>
                <span className="text-jexi-primary font-semibold">{walletBalance.formatted}</span>
                <span className="text-jexi-muted font-sans text-[11px]">USDC</span>
              </>
            ) : (
              <span className="text-jexi-muted font-sans text-[11px]">—</span>
            )}
          </div>

          {/* Wallet Connection Control */}
          <button
            onClick={onConnectWallet}
            disabled={walletState.isConnecting}
            title={
              walletState.isConnected
                ? `Connected: ${walletState.address} (${
                    walletState.isWrongNetwork
                      ? 'Wrong Network'
                      : 'Base'
                  })`
                : walletState.isAvailable
                ? 'Connect MetaMask wallet'
                : 'No browser wallet detected.'
            }
            aria-label="Connect Wallet"
            className={`px-1.5 sm:px-2.5 py-1 rounded-lg transition-colors text-xs flex items-center gap-1 sm:gap-1.5 border shrink-0 cursor-pointer ${
              walletState.isConnected
                ? walletState.isWrongNetwork
                  ? 'text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20'
                  : 'text-jexi-primary bg-jexi-elevated border-jexi-subtle hover:bg-jexi-hover'
                : 'text-jexi-secondary hover:text-jexi-primary hover:bg-jexi-hover border-jexi-subtle bg-jexi-surface'
            }`}
          >
            <Wallet className={`w-3.5 h-3.5 shrink-0 ${walletState.isConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-jexi-muted'}`} />
            {walletState.isConnecting ? (
              <span className="text-[11px] sm:text-xs font-medium flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-jexi-muted" />
                <span className="hidden sm:inline">Connecting...</span>
              </span>
            ) : walletState.isConnected ? (
              <span className="text-[11px] sm:text-xs font-mono font-medium truncate max-w-[65px] sm:max-w-none">
                {shortAddress}
              </span>
            ) : (
              <span className="text-[11px] sm:text-xs font-medium whitespace-nowrap">
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
                      ? 'Syncing changes...'
                      : syncStatus === 'synced'
                      ? 'Cloud backup active'
                      : syncStatus === 'error'
                      ? 'Sync error'
                      : 'Active'
                  })`
                : 'JEXI Account & Security'
            }
            aria-label="JEXI Account"
            className="px-1.5 sm:px-2.5 py-1 rounded-lg transition-colors text-xs flex items-center gap-1 sm:gap-1.5 border border-jexi-subtle bg-jexi-surface hover:bg-jexi-hover text-jexi-primary shrink-0 cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-jexi-muted shrink-0" />
            <span className="hidden sm:inline text-[11px] sm:text-xs font-medium max-w-[85px] truncate">
              {currentUser ? currentUser.displayName || currentUser.email.split('@')[0] : 'Account'}
            </span>
            {currentUser && (
              <span className="flex items-center shrink-0">
                {syncStatus === 'syncing' ? (
                  <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                ) : syncStatus === 'error' ? (
                  <AlertCircle className="w-3 h-3 text-rose-500" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                )}
              </span>
            )}
          </button>

          {/* Header Refresh Control */}
          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            title={isRefreshing ? 'Refreshing application...' : 'Refresh workspace'}
            aria-label="Refresh workspace"
            className="p-1 sm:p-1.5 rounded-lg text-jexi-secondary hover:text-jexi-primary hover:bg-jexi-hover disabled:opacity-50 border border-jexi-subtle bg-jexi-surface transition-colors shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600 dark:text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile Live Balance & Identity Bar (Visible on mobile screens) */}
      <div className="md:hidden flex items-center justify-between px-3 py-1.5 bg-jexi-elevated/70 border-t border-jexi-divider text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-jexi-muted text-[10px] uppercase font-sans tracking-wide">Live Balance:</span>
          {!walletState.isConnected || !walletState.address ? (
            <span className="text-jexi-muted font-sans font-medium text-[11px]">—</span>
          ) : walletBalance?.status === 'loading' ? (
            <span className="flex items-center gap-1 text-[11px] text-jexi-muted">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Fetching on-chain...</span>
            </span>
          ) : walletBalance?.status === 'available' && walletBalance.formatted !== null ? (
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
              {walletBalance.formatted} <span className="text-jexi-muted font-sans font-normal text-[10px]">USDC</span>
            </span>
          ) : (
            <span className="text-rose-500 font-sans text-[11px]">Unavailable</span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-jexi-muted">
          {walletState.isConnected && walletState.address ? (
            <span className="font-mono text-jexi-primary font-medium">{shortAddress}</span>
          ) : (
            <span className="text-[10px] text-jexi-muted">Self-Custody</span>
          )}
        </div>
      </div>

      {/* Subtle Notice Ribbon (Desktop) */}
      <div className="hidden md:flex bg-jexi-elevated/60 border-t border-jexi-divider px-4 py-1.5 text-center text-xs text-jexi-muted items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
        <span>
          Self-Custody · Payment Preparation & Deterministic Safety
        </span>
      </div>

      {/* Wallet Connection Notice */}
      {walletState.error && (
        <div className="bg-amber-50/90 dark:bg-amber-950/40 border-b border-amber-500/30 px-3 sm:px-4 py-2 text-xs text-slate-800 dark:text-slate-200">
          <div className="max-w-5xl mx-auto flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <div className="p-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                <Info className="w-3.5 h-3.5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-amber-800 dark:text-amber-300 text-xs">Wallet Connection Notice</span>
                </div>
                <p className="text-slate-700 dark:text-zinc-300 leading-relaxed text-[11px]">
                  {walletState.error}
                </p>
              </div>
            </div>
            <button
              onClick={onClearWalletError}
              aria-label="Dismiss wallet notice"
              className="text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
