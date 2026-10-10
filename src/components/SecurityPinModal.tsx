import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  Check,
  Loader2,
} from 'lucide-react';
import {
  getUserPinConfig,
  verifyPin,
  setUserSecurityPin,
  changeUserSecurityPin,
} from '../lib/securityPin';

export type PinModalMode = 'create' | 'verify' | 'change';

interface SecurityPinModalProps {
  isOpen: boolean;
  mode: PinModalMode;
  userId: string;
  actionTitle?: string;
  actionDescription?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const SecurityPinModal: React.FC<SecurityPinModalProps> = ({
  isOpen,
  mode,
  userId,
  actionTitle = 'Authorize Protected Action',
  actionDescription = 'Enter your JEXI Security PIN to proceed with this sensitive action.',
  onSuccess,
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const validatePinFormat = (val: string): boolean => {
    return /^\d{4,8}$/.test(val);
  };

  const handleResetForm = () => {
    setPin('');
    setConfirmPin('');
    setCurrentPin('');
    setErrorMessage('');
    setIsProcessing(false);
  };

  const handleCancel = () => {
    handleResetForm();
    onCancel();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (mode === 'create') {
      if (!validatePinFormat(pin)) {
        setErrorMessage('PIN must be between 4 and 8 digits (numbers only).');
        return;
      }
      if (pin !== confirmPin) {
        setErrorMessage('Confirmation PIN does not match.');
        return;
      }

      setIsProcessing(true);
      try {
        await setUserSecurityPin(userId, pin);
        handleResetForm();
        onSuccess();
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to save Security PIN.');
      } finally {
        setIsProcessing(false);
      }
    } else if (mode === 'verify') {
      if (!validatePinFormat(pin)) {
        setErrorMessage('Please enter your 4 to 8 digit PIN.');
        return;
      }

      setIsProcessing(true);
      try {
        const stored = getUserPinConfig(userId);
        if (!stored) {
          setErrorMessage('No Security PIN configured for this account.');
          setIsProcessing(false);
          return;
        }

        const isValid = await verifyPin(pin, stored);
        if (isValid) {
          handleResetForm();
          onSuccess();
        } else {
          setErrorMessage('Incorrect Security PIN. Please try again.');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Error verifying Security PIN.');
      } finally {
        setIsProcessing(false);
      }
    } else if (mode === 'change') {
      if (!validatePinFormat(currentPin)) {
        setErrorMessage('Please enter your current 4 to 8 digit PIN.');
        return;
      }
      if (!validatePinFormat(pin)) {
        setErrorMessage('New PIN must be between 4 and 8 digits (numbers only).');
        return;
      }
      if (pin === currentPin) {
        setErrorMessage('New PIN cannot be the same as your current PIN.');
        return;
      }
      if (pin !== confirmPin) {
        setErrorMessage('New PIN confirmation does not match.');
        return;
      }

      setIsProcessing(true);
      try {
        const result = await changeUserSecurityPin(userId, currentPin, pin);
        if (result.success) {
          handleResetForm();
          onSuccess();
        } else {
          setErrorMessage(result.error || 'Failed to change Security PIN.');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Error updating Security PIN.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-jexi-overlay backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-jexi-modal border border-jexi-subtle rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl space-y-4 text-jexi-primary">
        {/* Header */}
        <div className="px-5 py-4 border-b border-jexi-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-jexi-primary">
                {mode === 'create'
                  ? 'Create Security PIN'
                  : mode === 'change'
                  ? 'Change Security PIN'
                  : 'Security Authorization'}
              </h3>
              <p className="text-[11px] text-jexi-muted">JEXI Application Guard</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="text-jexi-muted hover:text-jexi-primary p-1 rounded-md hover:bg-jexi-hover transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 pb-5 space-y-4">
          <div className="text-xs text-jexi-secondary leading-relaxed bg-jexi-elevated p-3 rounded-xl border border-jexi-subtle">
            <div className="font-semibold text-jexi-primary">{actionTitle}</div>
            <p className="text-jexi-muted text-[11px] mt-1">{actionDescription}</p>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-red-950/40 border border-rose-200 dark:border-red-800/60 text-rose-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-red-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'change' && (
              <div>
                <label className="block text-[11px] font-medium text-jexi-secondary mb-1">
                  Current Security PIN
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter current PIN"
                    autoFocus
                    required
                    className="w-full pl-3 pr-10 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-sm text-jexi-primary font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-jexi-secondary mb-1">
                {mode === 'create'
                  ? 'Choose Security PIN (4–8 digits)'
                  : mode === 'change'
                  ? 'New Security PIN (4–8 digits)'
                  : 'Enter Security PIN'}
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={mode === 'create' || mode === 'change' ? 'e.g. 1234' : '••••'}
                  autoFocus={mode !== 'change'}
                  required
                  className="w-full pl-3 pr-10 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-sm text-jexi-primary font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-jexi-muted hover:text-jexi-primary cursor-pointer"
                  aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {(mode === 'create' || mode === 'change') && (
              <div>
                <label className="block text-[11px] font-medium text-jexi-secondary mb-1">
                  Confirm Security PIN
                </label>
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Re-enter PIN to confirm"
                  required
                  className="w-full px-3 py-2 bg-jexi-surface border border-jexi-subtle rounded-lg text-sm text-jexi-primary font-mono tracking-widest placeholder:tracking-normal placeholder:font-sans placeholder:text-jexi-muted focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isProcessing}
                className="py-2 px-3 text-xs font-medium text-jexi-secondary hover:text-jexi-primary hover:bg-jexi-hover rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessing || !pin}
                className="py-2 px-4 text-xs font-semibold text-white dark:text-zinc-950 bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-400 dark:hover:bg-emerald-300 active:scale-[0.98] rounded-lg flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {mode === 'create'
                        ? 'Set Security PIN'
                        : mode === 'change'
                        ? 'Update PIN'
                        : 'Authorize'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="pt-1 text-[10px] text-jexi-muted text-center flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Protected with client-side key derivation. Raw PIN is never stored.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
