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
  Copy,
} from 'lucide-react';
import { UserAccount } from '../types';
import {
  attachFirebaseAuthUser,
  logoutUser,
} from '../storage/storage';
import {
  isFirebaseConfigured,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOutUser,
  sendPasswordReset,
  resendVerificationEmail,
  getFirebaseErrorMessage,
} from '../lib/firebase';
import { SyncStatus } from '../lib/firestoreSync';

const FIRESTORE_RULES_TEXT = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
    function isAuthenticated() {
      return request.auth != null && request.auth.uid != null;
    }
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    function isValidId(id) {
      return id is string && id.size() > 0 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$');
    }
    function isValidAccountData(data, userId) {
      return data.accountId == userId
        && data.userEmail is string
        && data.userEmail.size() > 0
        && data.userEmail.size() <= 256
        && data.version is number
        && data.schemaVersion is string
        && data.updatedAt is string
        && data.recipients is list
        && data.recipients.size() <= 1000
        && data.intentions is list
        && data.intentions.size() <= 1000
        && data.history is list
        && data.history.size() <= 10000;
    }
    match /users/{userId} {
      allow get: if isOwner(userId) && isValidId(userId);
      allow list: if false;
      allow create: if isOwner(userId)
        && isValidId(userId)
        && isValidAccountData(request.resource.data, userId);
      allow update: if isOwner(userId)
        && isValidId(userId)
        && isValidAccountData(request.resource.data, userId)
        && request.resource.data.accountId == resource.data.accountId
        && request.resource.data.history.size() >= resource.data.history.size();
      allow delete: if false;
    }
  }
}`;

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
  onUserChange: (user: UserAccount | null) => void;
  recipientsCount: number;
  intentionsCount: number;
  historyCount: number;
  onDataRestored: () => void;
  syncStatus?: SyncStatus;
  lastSyncedAt?: string | null;
  syncError?: string;
  onManualSync?: () => Promise<void>;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChange,
  recipientsCount,
  intentionsCount,
  historyCount,
  onDataRestored,
  syncStatus = 'idle',
  lastSyncedAt,
  syncError,
  onManualSync,
}) => {
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
  const [copiedRules, setCopiedRules] = useState(false);
  const [resetCooldownSeconds, setResetCooldownSeconds] = useState(0);

  // Timer effect for password reset 60-second cooldown
  useEffect(() => {
    if (resetCooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setResetCooldownSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetCooldownSeconds]);

  if (!isOpen) return null;

  const isConfigured = isFirebaseConfigured();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!isConfigured) {
      setErrorMessage(
        'Firebase Authentication is not yet configured. Please set VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID in your environment.'
      );
      return;
    }

    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!passwordInput || passwordInput.length < 6) {
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
        attachFirebaseAuthUser(userAccount);
        onUserChange(userAccount);
        setPasswordInput('');
        setConfirmPasswordInput('');
        onClose();
      } else {
        const userAccount = await signInWithEmail(trimmedEmail, passwordInput);
        attachFirebaseAuthUser(userAccount);
        onUserChange(userAccount);
        setPasswordInput('');
        onClose();
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
        'Firebase Authentication is not yet configured. Please add your Firebase credentials to your environment to enable real Google Sign-In.'
      );
      return;
    }

    setIsGoogleLoading(true);
    try {
      const userAccount = await signInWithGoogle();
      attachFirebaseAuthUser(userAccount);
      onUserChange(userAccount);
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
      setErrorMessage(
        'Firebase Authentication is not yet configured. Please set your Firebase credentials in your environment.'
      );
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

  const handleLogout = async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.warn('Firebase signOut error:', err);
    }
    logoutUser();
    onUserChange(null);
    setSuccessMessage('Logged out successfully. Your local payment records remain safe.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">JEXI Account</h3>
              <p className="text-[11px] text-zinc-400">Authentication & Identity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Unconfigured Notice */}
          {!isConfigured && (
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/50 text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-semibold text-amber-300">Firebase Setup Required:</span> Live authentication requires configuring your Firebase project variables (<code className="text-amber-200 font-mono text-[10px]">VITE_FIREBASE_*</code>).
              </div>
            </div>
          )}

          {/* Error / Success Notifications */}
          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs leading-relaxed">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Current User State (Signed In) */}
          {currentUser ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-zinc-950/70 border border-zinc-800/90 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold text-zinc-200">{currentUser.email}</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    {currentUser.provider}
                  </span>
                </div>

                {/* Authoritative UID */}
                <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-mono">
                  <span className="text-zinc-500">UID:</span>
                  <span className="text-zinc-300 text-[10px] truncate max-w-[240px]" title={currentUser.id}>
                    {currentUser.id}
                  </span>
                </div>

                {/* Email Verification State */}
                <div className="pt-1.5 border-t border-zinc-800/80 flex items-center justify-between text-xs">
                  {currentUser.emailVerified ? (
                    <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Email Verified</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5 text-amber-400 text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Email Not Verified</span>
                      </div>
                      <button
                        onClick={handleResendVerification}
                        disabled={isResendingEmail}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium underline disabled:opacity-50"
                      >
                        {isResendingEmail ? 'Sending...' : 'Resend Link'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Cloud Synchronization Card */}
              <div className="p-3.5 rounded-lg bg-zinc-950/70 border border-zinc-800/90 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-semibold text-zinc-200 text-xs">Automatic Firestore Sync</div>
                      <div className="text-[10px] text-zinc-400">Database: <span className="font-mono text-zinc-300">africa-south1</span> (jexi-44e94)</div>
                    </div>
                  </div>
                  <div>
                    {syncStatus === 'syncing' ? (
                      <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Syncing...</span>
                      </span>
                    ) : syncStatus === 'error' ? (
                      <span className="flex items-center gap-1 text-[11px] text-red-400 font-medium px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Error</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Connected</span>
                      </span>
                    )}
                  </div>
                </div>

                {syncError && (() => {
                  const isPermission = syncError.includes('permission') || syncError.includes('Missing or insufficient');
                  if (isPermission) {
                    return (
                      <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs space-y-2.5">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="leading-snug">
                            <span className="font-semibold text-amber-300">Firestore Rules Pending Publication:</span>
                            <p className="text-[11px] text-zinc-300 mt-1">
                              Firestore returned a permissions notice for your isolated account path <code className="font-mono text-zinc-200">users/{currentUser.id}</code>. Security rules must be published in Firebase Console to enable remote syncing.
                            </p>
                          </div>
                        </div>

                        <div className="p-2 rounded bg-zinc-950/80 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                          <div className="font-medium text-zinc-300 text-[10px] uppercase tracking-wider">Quick Setup (1-minute):</div>
                          <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-zinc-400">
                            <li>Open <span className="text-zinc-200">Firebase Console &gt; Firestore Database &gt; Rules</span>.</li>
                            <li>Copy the rules below, paste into the editor, and click <strong className="text-zinc-200">Publish</strong>.</li>
                            <li>Click <strong className="text-emerald-400">Sync Now</strong> below.</li>
                          </ol>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(FIRESTORE_RULES_TEXT);
                            setCopiedRules(true);
                            setTimeout(() => setCopiedRules(false), 2500);
                          }}
                          className="w-full py-1.5 px-3 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                        >
                          {copiedRules ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedRules ? 'Copied to Clipboard!' : 'Copy Firestore Rules for Console'}</span>
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/40 text-[11px] text-red-300">
                      {syncError}
                    </div>
                  );
                })()}

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400">
                    {lastSyncedAt
                      ? `Last synced: ${new Date(lastSyncedAt).toLocaleTimeString()}`
                      : 'Auto-sync active on changes'}
                  </span>
                  {onManualSync && (
                    <button
                      onClick={async () => {
                        setIsSyncing(true);
                        setErrorMessage('');
                        setSuccessMessage('');
                        try {
                          await onManualSync();
                          setSuccessMessage('Cloud storage synchronized successfully.');
                        } catch (err: any) {
                          setErrorMessage(err?.message || 'Manual cloud sync failed.');
                        } finally {
                          setIsSyncing(false);
                        }
                      }}
                      disabled={isSyncing || syncStatus === 'syncing'}
                      className="py-1 px-2.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                  )}
                </div>

                <div className="text-[10px] text-zinc-500 pt-0.5">
                  Isolated by <code className="text-zinc-400 font-mono">request.auth.uid</code>. History is strictly undeletable.
                </div>
              </div>

              {/* Data Summary */}
              <div className="p-3 rounded-lg bg-zinc-950/50 border border-zinc-800/60 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Account Records:</span>
                <span className="text-zinc-200 font-medium">
                  {recipientsCount} Recipients • {intentionsCount} Schedules • {historyCount} History
                </span>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="w-full py-2 px-3 text-xs font-medium text-zinc-300 hover:text-red-400 bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/80 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          ) : (
            /* Signed Out View */
            <div className="space-y-4">
              {authMode === 'forgot_password' ? (
                /* Forgot Password Form */
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setErrorMessage('');
                        setSuccessMessage('');
                      }}
                      className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800"
                      aria-label="Back to Sign In"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-100">Reset Password</h4>
                      <p className="text-[11px] text-zinc-400">We will send a reset link to your email.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-zinc-300">Account Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full bg-zinc-950 border border-zinc-700/90 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || resetCooldownSeconds > 0}
                    className="w-full py-2 px-3 text-xs font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {isLoading
                        ? 'Sending...'
                        : resetCooldownSeconds > 0
                        ? `You can request another reset email in ${resetCooldownSeconds}s`
                        : 'Send Password Reset Link'}
                    </span>
                  </button>
                </form>
              ) : (
                /* Sign In / Create Account Views */
                <div className="space-y-4">
                  {/* Mode Selector Tabs */}
                  <div className="flex p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('signin');
                        setErrorMessage('');
                        setSuccessMessage('');
                      }}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                        authMode === 'signin'
                          ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
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
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                        authMode === 'signup'
                          ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Create Account
                    </button>
                  </div>

                  {/* Real Google Button */}
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading || isLoading}
                    className="w-full py-2 px-3 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isGoogleLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
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
                    <div className="flex-1 h-px bg-zinc-800" />
                    <span className="text-[10px] text-zinc-500 uppercase font-mono">or email</span>
                    <div className="flex-1 h-px bg-zinc-800" />
                  </div>

                  {/* Email & Password Form */}
                  <form onSubmit={handleEmailSubmit} className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-zinc-300">Email Address</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                        <input
                          type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full bg-zinc-950 border border-zinc-700/90 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-zinc-300">Password</label>
                        {authMode === 'signin' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('forgot_password');
                              setErrorMessage('');
                              setSuccessMessage('');
                            }}
                            className="text-[10px] text-emerald-400 hover:text-emerald-300 underline"
                          >
                            Forgot Password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder="Minimum 6 characters"
                          className="w-full bg-zinc-950 border border-zinc-700/90 rounded-lg pl-9 pr-9 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {authMode === 'signup' && (
                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-zinc-300">Confirm Password</label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPasswordInput}
                            onChange={(e) => setConfirmPasswordInput(e.target.value)}
                            placeholder="Repeat password"
                            className="w-full bg-zinc-950 border border-zinc-700/90 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                            required
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-2 px-3 text-xs font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
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
            </div>
          )}

          {/* Security & Boundary Notice */}
          <div className="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 flex items-start gap-2 text-[11px] text-zinc-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-zinc-300">Self-custody protected:</strong> JEXI never stores private keys or seed phrases. Only your contact profiles, payment schedules, and transaction history are backed up.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
