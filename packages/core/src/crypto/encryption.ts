/**
 * AES-256-GCM encryption for credential storage.
 *
 * Strategy A: Encrypted file + client unseal.
 * - Master key derived from user password / client-provided secret
 * - Each credential encrypted individually
 * - Decrypted credentials held in memory only
 */

import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { argon2id } from '@noble/hashes/argon2';

export interface EncryptedPayload {
  ciphertext: Uint8Array;
  iv: Uint8Array;    // 12 bytes for GCM
  salt: Uint8Array;  // 32 bytes for Argon2
}

export interface Argon2Params {
  memCost: number;     // KB
  timeCost: number;    // iterations
  parallelism: number;
}

const DEFAULT_ARGON2: Argon2Params = {
  memCost: 65536,   // 64 MB
  timeCost: 3,
  parallelism: 1,
};

/**
 * Derive a 256-bit key from a password/secret using Argon2id.
 */
export function deriveKey(
  secret: Uint8Array,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2,
): Uint8Array {
  return argon2id(secret, salt, {
    t: params.timeCost,
    m: params.memCost,
    p: params.parallelism,
    dkLen: 32,
  });
}

/**
 * Encrypt plaintext with AES-256-GCM.
 *
 * @param plaintext - Data to encrypt
 * @param masterKey - 32-byte key
 * @returns Encrypted payload (ciphertext includes GCM tag)
 */
export function encrypt(plaintext: Uint8Array, masterKey: Uint8Array): { ciphertext: Uint8Array; iv: Uint8Array } {
  const iv = randomBytes(12);
  const aes = gcm(masterKey, iv);
  const ciphertext = aes.encrypt(plaintext);
  return { ciphertext, iv };
}

/**
 * Decrypt ciphertext with AES-256-GCM.
 *
 * @throws If decryption fails (wrong key, tampered data)
 */
export function decrypt(ciphertext: Uint8Array, iv: Uint8Array, masterKey: Uint8Array): Uint8Array {
  const aes = gcm(masterKey, iv);
  return aes.decrypt(ciphertext);
}

/**
 * Encrypt a credential for storage.
 * Generates fresh salt + IV each time.
 */
export function encryptCredential(
  secret: Uint8Array,
  password: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2,
): EncryptedPayload {
  const salt = randomBytes(32);
  const key = deriveKey(password, salt, params);
  const { ciphertext, iv } = encrypt(secret, key);

  // Wipe derived key from memory
  key.fill(0);

  return { ciphertext, iv, salt };
}

/**
 * Decrypt a stored credential.
 */
export function decryptCredential(
  payload: EncryptedPayload,
  password: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2,
): Uint8Array {
  const key = deriveKey(password, payload.salt, params);
  try {
    return decrypt(payload.ciphertext, payload.iv, key);
  } finally {
    key.fill(0);
  }
}

/** Zero-fill a Uint8Array */
export function zeroize(buf: Uint8Array): void {
  buf.fill(0);
}

/** Encode Uint8Array to base64 */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Decode base64 to Uint8Array */
export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
