import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { UserAccount } from '../types';

export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyAgnflvydh_vs2gg_EYAROBtjiyjegzj4c',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'jexi-44e94.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'jexi-44e94',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'jexi-44e94.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '775640972397',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:775640972397:web:5310a9013905cc08b41364',
};

/**
 * Checks if Firebase configuration environment variables are present.
 */
export function isFirebaseConfigured(): boolean {
  const { apiKey, projectId } = FIREBASE_CONFIG;
  return Boolean(
    apiKey &&
    apiKey.trim() !== '' &&
    apiKey !== 'MY_API_KEY' &&
    projectId &&
    projectId.trim() !== ''
  );
}

let firebaseAppInstance: FirebaseApp | null = null;
let firebaseAuthInstance: Auth | null = null;

/**
 * Lazily retrieves the Firebase Auth client.
 * Returns null if Firebase is not yet configured with valid credentials.
 */
export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured()) {
    return null;
  }

  if (!firebaseAppInstance) {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      firebaseAppInstance = existingApps[0];
    } else {
      firebaseAppInstance = initializeApp(FIREBASE_CONFIG);
    }
  }

  if (!firebaseAuthInstance && firebaseAppInstance) {
    firebaseAuthInstance = getAuth(firebaseAppInstance);
  }

  return firebaseAuthInstance;
}

let firebaseFirestoreInstance: Firestore | null = null;

/**
 * Lazily retrieves the Firebase Firestore client.
 * Returns null if Firebase is not yet configured.
 */
export function getFirebaseFirestore(): Firestore | null {
  if (!isFirebaseConfigured()) {
    return null;
  }

  if (!firebaseAppInstance) {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      firebaseAppInstance = existingApps[0];
    } else {
      firebaseAppInstance = initializeApp(FIREBASE_CONFIG);
    }
  }

  if (!firebaseFirestoreInstance && firebaseAppInstance) {
    firebaseFirestoreInstance = getFirestore(firebaseAppInstance);
  }

  return firebaseFirestoreInstance;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData?.map((p) => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
    },
  };
  console.error('Firestore Security / Operation Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Maps a Firebase User to JEXI's UserAccount schema.
 * Uses the authoritative Firebase User UID as the primary account id.
 */
export function mapFirebaseUser(fbUser: FirebaseUser): UserAccount {
  const isGoogle = fbUser.providerData.some((p) => p.providerId === 'google.com');
  return {
    id: fbUser.uid,
    email: fbUser.email || '',
    displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'JEXI User',
    provider: isGoogle ? 'google' : 'email',
    emailVerified: fbUser.emailVerified,
    photoURL: fbUser.photoURL || undefined,
    createdAt: fbUser.metadata.creationTime || new Date().toISOString(),
    lastLoginAt: fbUser.metadata.lastSignInTime || new Date().toISOString(),
  };
}

/**
 * Convert Firebase error codes to friendly messages.
 */
export function getFirebaseErrorMessage(error: any): string {
  const code = error?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'The email address is formatted incorrectly.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in window closed. Tap once to try again.';
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled. Tap once to try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window. Please allow pop-ups and try again.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in the Firebase Console.';
    case 'auth/unauthorized-domain':
      return 'This web domain is not authorized in the Firebase Console (Authentication -> Settings -> Authorized domains).';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Access temporarily disabled due to too many failed attempts. Try again later or reset your password.';
    default:
      return error?.message || 'Authentication failed. Please try again.';
  }
}

/**
 * Create a new account with email and password.
 * Also initiates email verification.
 */
export async function signUpWithEmail(email: string, pass: string): Promise<UserAccount> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }

  const credential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
  try {
    await sendEmailVerification(credential.user);
  } catch (err) {
    console.warn('Could not send email verification immediately:', err);
  }
  return mapFirebaseUser(credential.user);
}

/**
 * Sign in with existing email and password.
 */
export async function signInWithEmail(email: string, pass: string): Promise<UserAccount> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }

  const credential = await signInWithEmailAndPassword(auth, email.trim(), pass);
  return mapFirebaseUser(credential.user);
}

/**
 * Real Google Sign-In with Firebase Authentication popup.
 * Mobile-resilient: does not force select_account parameter, preventing unnecessary round-trip delays.
 */
export async function signInWithGoogle(): Promise<UserAccount> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }

  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return mapFirebaseUser(result.user);
}

/**
 * Sign out from Firebase Auth.
 */
export async function signOutUser(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) {
    await signOut(auth);
  }
}

/**
 * Send password reset email.
 * Safely attaches ActionCodeSettings with the current application origin so users
 * can return directly to JEXI after resetting their password.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }

  // Safely provide continueUrl using window.location.origin if available
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : undefined;
  if (origin && origin.startsWith('http')) {
    await sendPasswordResetEmail(auth, email.trim(), {
      url: origin,
    });
  } else {
    await sendPasswordResetEmail(auth, email.trim());
  }
}

/**
 * Resend email verification to current user.
 */
export async function resendVerificationEmail(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) {
    throw new Error('No user is currently signed in.');
  }

  await sendEmailVerification(auth.currentUser);
}

/**
 * Listen to real-time auth state changes.
 */
export function subscribeToAuthState(callback: (user: UserAccount | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    // If not configured, immediately return null
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, (fbUser) => {
    if (fbUser) {
      callback(mapFirebaseUser(fbUser));
    } else {
      callback(null);
    }
  });
}
