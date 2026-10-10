/**
 * SIGNA Security PIN Foundation
 *
 * Implements salted, iterated PBKDF2 with SHA-256 using the native Web Crypto API.
 * The plaintext PIN is never stored, serialized, or logged.
 * Each configuration is scoped strictly to the authenticated Firebase UID.
 */

export interface StoredPinConfig {
  hashHex: string;
  saltHex: string;
  iterations: number;
  createdAt: string;
  updatedAt: string;
}

const PIN_STORAGE_PREFIX = 'signa_pin_v1_';
const LEGACY_PIN_STORAGE_PREFIX = 'jexi_pin_v1_';
const DEFAULT_ITERATIONS = 100000;
const KEY_BYTE_LENGTH = 32; // 256-bit derived key

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives a salted PBKDF2-SHA256 hash for a given PIN.
 */
export async function hashPin(
  pin: string,
  saltHex?: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<{ hashHex: string; saltHex: string; iterations: number }> {
  const encoder = new TextEncoder();
  const pinBuffer = encoder.encode(pin);

  let saltBuffer: Uint8Array;
  if (saltHex) {
    saltBuffer = hexToBuffer(saltHex);
  } else {
    saltBuffer = new Uint8Array(16);
    crypto.getRandomValues(saltBuffer);
  }

  const baseKey = await crypto.subtle.importKey(
    'raw',
    pinBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    KEY_BYTE_LENGTH * 8
  );

  return {
    hashHex: bufferToHex(derivedBits),
    saltHex: saltHex || bufferToHex(saltBuffer.buffer),
    iterations,
  };
}

/**
 * Verifies a candidate PIN against stored salted hash using constant-time comparison.
 */
export async function verifyPin(
  candidatePin: string,
  stored: StoredPinConfig
): Promise<boolean> {
  if (!stored || !stored.hashHex || !stored.saltHex) {
    return false;
  }

  const { hashHex } = await hashPin(
    candidatePin,
    stored.saltHex,
    stored.iterations || DEFAULT_ITERATIONS
  );

  if (hashHex.length !== stored.hashHex.length) {
    return false;
  }

  // Constant-time equality check to prevent timing analysis
  let diff = 0;
  for (let i = 0; i < hashHex.length; i++) {
    diff |= hashHex.charCodeAt(i) ^ stored.hashHex.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Retrieves the stored salted PIN config for a specific authenticated user UID.
 */
export function getUserPinConfig(uid: string): StoredPinConfig | null {
  if (!uid || uid === 'guest_local') return null;
  try {
    const raw = localStorage.getItem(`${PIN_STORAGE_PREFIX}${uid}`) || localStorage.getItem(`${LEGACY_PIN_STORAGE_PREFIX}${uid}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredPinConfig;
  } catch {
    return null;
  }
}

/**
 * Checks if a specific authenticated user has created a Security PIN.
 */
export function hasUserSecurityPin(uid: string): boolean {
  return getUserPinConfig(uid) !== null;
}

/**
 * Saves a new Security PIN for an authenticated user using a freshly generated salt.
 */
export async function setUserSecurityPin(uid: string, pin: string): Promise<void> {
  if (!uid || uid === 'guest_local') {
    throw new Error('A valid authenticated user UID is required to set a Security PIN.');
  }

  const hashed = await hashPin(pin);
  const config: StoredPinConfig = {
    hashHex: hashed.hashHex,
    saltHex: hashed.saltHex,
    iterations: hashed.iterations,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(`${PIN_STORAGE_PREFIX}${uid}`, JSON.stringify(config));
}

/**
 * Updates a user's Security PIN after authenticating their current PIN.
 */
export async function changeUserSecurityPin(
  uid: string,
  currentPin: string,
  newPin: string
): Promise<{ success: boolean; error?: string }> {
  const existing = getUserPinConfig(uid);
  if (!existing) {
    return { success: false, error: 'No existing PIN found for this account.' };
  }

  const isValid = await verifyPin(currentPin, existing);
  if (!isValid) {
    return { success: false, error: 'Current PIN is incorrect.' };
  }

  await setUserSecurityPin(uid, newPin);
  return { success: true };
}
