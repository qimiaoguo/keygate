/**
 * Ed25519 key generation and operations for sandbox ↔ client pairing.
 *
 * Uses @noble/ed25519 — no native deps, audited, fast.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2';

// ed25519 needs sha512 sync
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export interface Ed25519KeyPair {
  publicKey: Uint8Array;  // 32 bytes
  secretKey: Uint8Array;  // 32 bytes (seed)
}

/** Generate a new Ed25519 keypair */
export function generateKeyPair(): Ed25519KeyPair {
  const secretKey = ed.utils.randomPrivateKey(); // 32 bytes
  const publicKey = ed.getPublicKey(secretKey);
  return { publicKey, secretKey };
}

/** Sign a message with the secret key */
export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return ed.sign(message, secretKey);
}

/** Verify a signature */
export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  return ed.verify(signature, message, publicKey);
}

/** Hex encode */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hex decode */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
