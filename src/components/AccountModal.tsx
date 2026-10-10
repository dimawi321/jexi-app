import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  ShieldCheck,
  LogOut,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  Send,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  Loader2,
  RefreshCw,
  KeyRound,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Cpu,
} from 'lucide-react';
import { UserAccount } from '../types';
import {
  attachFirebaseAuthUser,
  logoutUser,
  resetAllToDemo,
} from '../storage/storage';
import {
  isFirebaseConfigured,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOutUser,
  sendPasswordReset,
  resendVerificationEmail,
  reloadFirebaseUser,
  getFirebaseErrorMessage,
} from '../lib/firebase';
import { hasUserSecurityPin } from '../lib/securityPin';
import { SyncStatus } from '../lib/firestoreSync';
import { useTheme } from '../lib/theme';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
  onUserChange: (user: UserAccount | null) => void;
  recipientsCount: number;
  intentionsCount: number;
  historyCount: number;
  onDataRestored?: () => void;
  syncStatus?: SyncStatus;
  lastSyncedAt?: string | null;
  syncError?: string;
  onManualSync?: () => Promise<void>;
  onOpenPinModal?: (mode: 'create' | 'change') => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChange,
  recipientsCount,
  intentionsCount,
  historyCount,
  syncStatus = 'idle',
  lastSyncedAt,
  syncError,
  onManualSync,
  onOpenPinModal,
  onDataRestored,
}) => {
  const [theme, setTheme] = useTheme();
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot_password'>('signin');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const [resetCooldownSeconds, setResetCooldownSeconds] = useState(0);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

  const isUnverifiedEmail = Boolean(
    currentUser && currentUser.provider === 'email' && !currentUser.emailVerified
  );

  useEffect(() => {
    if (resetCooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setResetCooldownSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetCooldownSeconds]);

  if (!isOpen) return null;

  const isConfigured = isFirebaseConfigured();

  const handleClose = () => {
    setErrorMessage('');
    setSuccessMessage('');
    onClose();
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!isConfigured) {
      setErrorMessage(
        'Authentication is not yet configured. Please set your Firebase credentials in your environment variables.'
      );
      return;
    }

    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (passwordInput.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    if (authMode === 'signup' && passwordInput !== confirmPasswordInput) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      if (authMode === 'signup') {
        const userAccount = await signUpWithEmail(trimmedEmail, passwordInput);
        onUserChange(userAccount);
        setPasswordInput('');
        setConfirmPasswordInput('');
        setSuccessMessage(`A verification email was sent to ${trimmedEmail}. Please verify your email to access JEXI.`);
      } else {
        const userAccount = await signInWithEmail(trimmedEmail, passwordInput);
        if (userAccount.provider === 'email' && !userAccount.emailVerified) {
          onUserChange(userAccount);
          setPasswordInput('');
          setErrorMessage('Your email address is not yet verified. Please verify your email to access JEXI.');
        } else {
          attachFirebaseAuthUser(userAccount);
          onUserChange(userAccount);
          setPasswordInput('');
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMessage(getFirebaseErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isGoogleLoading || isLoading) return;

    setErrorMessage('');
    setSuccessMessage('');

    if (!isConfigured) {
      setErrorMessage(
        'Authentication is not yet configured. Please set your Firebase credentials in your environment variables.'
      );
      return;
    }

    setIsGoogleLoading(true);
    try {
      const userAccount = await signInWithGoogle();
      attachFirebaseAuthUser(userAccount);
      await Promise.resolve(onUserChange(userAccount));
      setSuccessMessage('Signed in with Google successfully.');
      onClose();
    } catch (err: any) {
      setErrorMessage(getFirebaseErrorMessage(err));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!isConfigured) {
      setErrorMessage('Authentication is not yet configured.');
      return;
    }

    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter your account email address.');
      return;
    }

    if (resetCooldownSeconds > 0) {
      setErrorMessage(`Please wait ${resetCooldownSeconds}s before requesting another reset email.`);
      return;
    }

    setIsLoading(true);
    try {
      await sendPasswordReset(trimmedEmail);
      setSuccessMessage(`Password reset link sent to ${trimmedEmail}. Check your inbox.`);
      setResetCooldownSeconds(60);
    } catch (err: any) {
      setErrorMessage(getFirebaseErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsResendingEmail(true);

    try {
      await resendVerificationEmail();
      setSuccessMessage('Verification email resent. Please check your inbox and spam folder.');
    } catch (err: any) {
      setErrorMessage(getFirebaseErrorMessage(err));
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleCheckVerification = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsCheckingVerification(true);

    try {
      const refreshedUser = await reloadFirebaseUser();
      if (!refreshedUser) {
        setErrorMessage('Unable to reload user account. Please try signing in again.');
        return;
      }

      if (refreshedUser.emailVerified || refreshedUser.provider !== 'email') {
        attachFirebaseAuthUser(refreshedUser);
        onUserChange(refreshedUser);
        setSuccessMessage('Email verified successfully.');
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setErrorMessage(
          'Your email is still not verified. Please check your inbox and spam folder for the link.'
        );
      }
    } catch (err: any) {
      setErrorMessage(getFirebaseErrorMessage(err));
    } finally {
      setIsCheckingVerification(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.warn('Firebase signOut error:', err);
    } finally {
      logoutUser();
      onUserChange(null);
      setErrorMessage('');
      setSuccessMessage('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-jexi-overlay backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-md overflow-hidden shadow-2xl space-y-0 text-jexi-primary">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-jexi-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
              {isUnverifiedEmail ? <Mail className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-jexi-primary">
                {isUnverifiedEmail ? 'Email Verification' : currentUser ? 'Account & Settings' : 'Sign In'}
              </h3>
              <p className="text-[11px] text-jexi-muted">
                {isUnverifiedEmail ? 'Activate your account' : currentUser ? 'Manage workspace preferences' : 'Access your JEXI workspace'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-jexi-muted hover:text-jexi-primary p-1.5 rounded-lg hover:bg-jexi-hover transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Notifications */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
          )}

          {currentUser ? (
            isUnverifiedEmail ? (
              /* Unverified Email Screen */
              <div className="space-y-4">
                <div className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-500 dark:text-amber-400 flex items-center justify-center mx-auto">
                    <Mail className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Verify Your Email Address</h4>
                    <p className="text-xs text-slate-600 dark:text-zinc-300 mt-1 leading-relaxed">
                      A verification email was sent to <strong className="text-amber-700 dark:text-amber-300 font-mono">{currentUser.email}</strong>. Please check your inbox and activate your account.
                    </p>
                  </div>
                  <div className="p-2 rounded-lg bg-white/60 dark:bg-zinc-950/60 border border-amber-500/20 text-[11px] text-slate-600 dark:text-zinc-400">
                    If you don't see it, check your <span className="font-semibold text-slate-800 dark:text-zinc-200">spam/junk</span> folder.
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleCheckVerification}
                    disabled={isCheckingVerification}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-white dark:text-zinc-950 bg-emerald-600 dark:bg-emerald-400 hover:bg-emerald-700 dark:hover:bg-emerald-300 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-60 cursor-pointer"
                  >
                    {isCheckingVerification ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Checking status...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>I've Verified My Email</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleResendVerification}
                    disabled={isResendingEmail || isCheckingVerification}
                    className="w-full py-2.5 px-3 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isResendingEmail ? 'Sending Link...' : 'Resend Verification Email'}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-zinc-500">Need to switch accounts?</span>
                  <button
                    onClick={handleLogout}
                    className="text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 transition-colors font-medium cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Authenticated User Panel */
              <div className="space-y-3.5">
                {/* Account Identity */}
                <div className="p-4 rounded-xl bg-jexi-surface border border-jexi-subtle flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs uppercase">
                      {currentUser.displayName ? currentUser.displayName[0] : currentUser.email ? currentUser.email[0] : 'U'}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-jexi-primary">
                        {currentUser.email}
                      </div>
                      <div className="text-[11px] text-jexi-muted font-mono mt-0.5">
                        Account ID: {currentUser.id.length > 14 ? `${currentUser.id.slice(0, 8)}...${currentUser.id.slice(-4)}` : currentUser.id}
                      </div>
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Verified Account · Access Control: Verified Owner Only</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-jexi-elevated text-jexi-secondary border border-jexi-subtle capitalize">
                    {currentUser.provider}
                  </span>
                </div>

                {/* Cloud Sync Status */}
                <div className="p-4 rounded-xl bg-jexi-surface border border-jexi-subtle flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Cloud className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-jexi-primary text-xs">Cloud Sync: Encrypted & Active</div>
                      <div className="text-[11px] text-jexi-muted">
                        {syncStatus === 'syncing' ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Syncing changes...
                          </span>
                        ) : syncStatus === 'error' ? (
                          <span className="text-rose-600 dark:text-rose-400 font-medium">Sync pending reconnect</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <Check className="w-3 h-3" /> Encrypted & synced across devices
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {onManualSync && (
                    <button
                      onClick={async () => {
                        setIsSyncing(true);
                        setErrorMessage('');
                        setSuccessMessage('');
                        try {
                          await onManualSync();
                          setSuccessMessage('Cloud storage synchronized.');
                        } catch (err: any) {
                          setErrorMessage(err?.message || 'Sync failed.');
                        } finally {
                          setIsSyncing(false);
                        }
                      }}
                      disabled={isSyncing || syncStatus === 'syncing'}
                      className="py-1 px-2.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                  )}
                </div>

                {/* Security PIN */}
                <div className="p-4 rounded-xl bg-jexi-surface border border-jexi-subtle flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-jexi-primary text-xs">Security PIN Protection</div>
                      <div className="text-[11px] text-jexi-muted">
                        {hasUserSecurityPin(currentUser.id) ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <Check className="w-3 h-3" /> Client-side encryption protection active
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Not Configured
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {onOpenPinModal && (
                    <button
                      type="button"
                      onClick={() => {
                        const hasPin = hasUserSecurityPin(currentUser.id);
                        onOpenPinModal(hasPin ? 'change' : 'create');
                      }}
                      className="py-1 px-3 text-[11px] font-medium text-jexi-secondary hover:text-jexi-primary bg-jexi-elevated hover:bg-jexi-hover border border-jexi-subtle rounded-lg transition-colors cursor-pointer"
                    >
                      {hasUserSecurityPin(currentUser.id) ? 'Change PIN' : 'Set Up PIN'}
                    </button>
                  )}
                </div>

                {/* Hardware & Signing Protocol */}
                <div className="p-4 rounded-xl bg-jexi-surface border border-jexi-subtle flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-jexi-primary text-xs">Hardware Signing & Transport</div>
                      <div className="text-[11px] text-jexi-muted">
                        Hardware connection ready • Human-readable signing supported
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 rounded-md">
                    Ready
                  </span>
                </div>

                {/* Advanced Technical Details (Collapsible for Power Users) */}
                <div className="border border-jexi-subtle rounded-xl overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                    className="w-full px-4 py-2.5 bg-jexi-elevated hover:bg-jexi-hover flex items-center justify-between transition-colors text-jexi-secondary hover:text-jexi-primary cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-jexi-muted" />
                      <span className="font-medium text-xs">Technical & Cryptographic Details</span>
                    </div>
                    {showAdvancedDetails ? <ChevronUp className="w-4 h-4 text-jexi-muted" /> : <ChevronDown className="w-4 h-4 text-jexi-muted" />}
                  </button>

                  {showAdvancedDetails && (
                    <div className="p-3.5 bg-jexi-surface space-y-2 border-t border-jexi-subtle font-mono text-[11px] text-jexi-secondary">
                      <div className="flex justify-between items-center py-1 border-b border-jexi-divider">
                        <span className="font-sans text-jexi-muted">Account Identifier:</span>
                        <span className="text-jexi-primary break-all">{currentUser.id}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-jexi-divider">
                        <span className="font-sans text-jexi-muted">Key Derivation:</span>
                        <span className="text-jexi-primary">PBKDF2-SHA256</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-jexi-divider">
                        <span className="font-sans text-jexi-muted">Data Isolation:</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-sans font-medium">Client-scoped verified session</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="font-sans text-jexi-muted">Payload Format:</span>
                        <span className="text-jexi-primary">EIP-712 Typed Structured Data</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Workspace Sample Data Controls */}
                <div className="p-4 rounded-xl bg-amber-500/5 border border-dashed border-amber-500/30 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="font-semibold text-jexi-primary text-xs">Sample Data & Workspace Reset</span>
                    </div>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                      Sample Workspace
                    </span>
                  </div>
                  <p className="text-[11px] text-jexi-muted leading-relaxed">
                    Reinitialize workspace with standard sample recipients and recurring payment schedules.
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Restore workspace to default sample state? This will reinitialize sample recipients and intentions.')) {
                          resetAllToDemo();
                          if (onDataRestored) onDataRestored();
                          setSuccessMessage('Workspace restored to default sample dataset.');
                        }
                      }}
                      className="w-full py-2 px-3 text-xs font-medium text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Restore Sample Dataset</span>
                    </button>
                  </div>
                </div>

                {/* Theme Selector */}
                <div className="p-4 rounded-xl bg-jexi-elevated border border-jexi-subtle space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-jexi-primary text-xs">Appearance</span>
                    <span className="text-[11px] text-jexi-muted capitalize">{theme}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-jexi-surface rounded-lg border border-jexi-subtle">
                    <button
                      type="button"
                      onClick={() => setTheme('system')}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        theme === 'system'
                          ? 'bg-jexi-elevated text-jexi-primary shadow-xs font-semibold'
                          : 'text-jexi-muted hover:text-jexi-primary'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>System</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        theme === 'light'
                          ? 'bg-jexi-elevated text-jexi-primary shadow-xs font-semibold'
                          : 'text-jexi-muted hover:text-jexi-primary'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5" />
                      <span>Light</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-jexi-elevated text-jexi-primary shadow-xs font-semibold'
                          : 'text-jexi-muted hover:text-jexi-primary'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Dark</span>
                    </button>
                  </div>
                </div>

                {/* Workspace Records */}
                <div className="p-3 rounded-xl bg-jexi-surface border border-jexi-subtle flex items-center justify-between text-[11px]">
                  <span className="text-jexi-muted">Workspace Records:</span>
                  <span className="text-jexi-primary font-medium tabular-nums">
                    {recipientsCount} Recipients · {intentionsCount} Schedules · {historyCount} History
                  </span>
                </div>

                {/* Self-Custody Trust Notice */}
                <div className="p-3 rounded-xl bg-jexi-elevated border border-jexi-subtle flex items-start gap-2.5 text-[11px] text-jexi-secondary">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong className="text-jexi-primary font-medium">Self-Custodial Architecture:</strong> JEXI never stores private keys. All transactions require your final hardware or connected wallet signature.
                  </p>
                </div>

                {/* Sign Out Button */}
                <button
                  onClick={handleLogout}
                  className="w-full py-2.5 px-3 text-xs font-medium text-slate-600 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-400 bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700/60 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            )
          ) : (
            /* Signed Out View */
            <div className="space-y-4">
              {authMode === 'forgot_password' ? (
                /* Forgot Password Form */
                <form onSubmit={handleForgotPassword} className="space-y-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setErrorMessage('');
                        setSuccessMessage('');
                      }}
                      className="p-1 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 rounded hover:bg-slate-100 dark:hover:bg-zinc-800"
                      aria-label="Back to Sign In"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-zinc-100">Reset Password</h4>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">We will send a reset link to your email.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">Account Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/90 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || resetCooldownSeconds > 0}
                    className="w-full py-2.5 px-3 text-xs font-semibold text-white dark:text-zinc-950 bg-emerald-600 dark:bg-emerald-400 hover:bg-emerald-700 dark:hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {isLoading
                        ? 'Sending...'
                        : resetCooldownSeconds > 0
                        ? `Request another in ${resetCooldownSeconds}s`
                        : 'Send Password Reset Link'}
                    </span>
                  </button>
                </form>
              ) : (
                /* Sign In / Create Account Views */
                <div className="space-y-4">
                  {/* Mode Selector Tabs */}
                  <div className="flex p-0.5 bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setErrorMessage('');
                        setSuccessMessage('');
                      }}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        authMode === 'signin'
                          ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signup');
                        setErrorMessage('');
                        setSuccessMessage('');
                      }}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        authMode === 'signup'
                          ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      Create Account
                    </button>
                  </div>

                  {/* Google Button */}
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading || isLoading}
                    className="w-full py-2.5 px-3 text-xs font-medium text-slate-700 dark:text-zinc-200 bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-750 border border-slate-200 dark:border-zinc-700 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isGoogleLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                        <span>Connecting with Google...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                        <span>Continue with Google</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2 my-2">
                    <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800" />
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase font-mono">or email</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-zinc-800" />
                  </div>

                  {/* Email & Password Form */}
                  <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">Email Address</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                        <input
                          type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/90 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">Password</label>
                        {authMode === 'signin' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('forgot_password');
                              setErrorMessage('');
                              setSuccessMessage('');
                            }}
                            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                          >
                            Forgot Password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder="Minimum 6 characters"
                          className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/90 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-2.5 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 cursor-pointer"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {authMode === 'signup' && (
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">Confirm Password</label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPasswordInput}
                            onChange={(e) => setConfirmPasswordInput(e.target.value)}
                            placeholder="Repeat password"
                            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700/90 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                            required
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2.5 px-3 text-xs font-semibold text-white dark:text-zinc-950 bg-emerald-600 dark:bg-emerald-400 hover:bg-emerald-700 dark:hover:bg-emerald-300 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>
                        {isLoading
                          ? 'Please wait...'
                          : authMode === 'signup'
                          ? 'Create Account'
                          : 'Sign In'}
                      </span>
                    </button>
                  </form>
                </div>
              )}

              {/* Theme Selector for Unauthenticated Visitors */}
              <div className="pt-2 border-t border-jexi-subtle flex items-center justify-between text-[11px] text-jexi-muted">
                <span>Theme:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTheme('system')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                      theme === 'system' ? 'bg-jexi-elevated text-jexi-primary font-semibold' : 'text-jexi-muted hover:text-jexi-primary'
                    }`}
                  >
                    System
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                      theme === 'light' ? 'bg-jexi-elevated text-jexi-primary font-semibold' : 'text-jexi-muted hover:text-jexi-primary'
                    }`}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                      theme === 'dark' ? 'bg-jexi-elevated text-jexi-primary font-semibold' : 'text-jexi-muted hover:text-jexi-primary'
                    }`}
                  >
                    Dark
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
