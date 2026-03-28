/**
 * CredentialManager — manages encrypted credentials on disk, decrypted in memory.
 *
 * Lifecycle:
 * 1. Sandbox starts → credentials are encrypted on disk
 * 2. Client connects → sends unseal secret
 * 3. Manager decrypts credentials into memory (SecureStore)
 * 4. Executor requests credential by keyId → gets Uint8Array from memory
 * 5. Sandbox stops → memory zeroed
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  encryptCredential,
  decryptCredential,
  zeroize,
  toBase64,
  fromBase64,
} from './crypto/encryption.js';
import type {
  CredentialMeta,
  CredentialType,
  PluginKeyConfig,
  LimitConfig,
  EncryptedKeyFile,
} from '@keygate/types';

interface DecryptedCredential {
  secret: Uint8Array;
  meta: CredentialMeta;
}

export class CredentialManager {
  private keyDir: string;
  /** In-memory decrypted credentials. Zeroed on seal(). */
  private store = new Map<string, DecryptedCredential>();
  private sealed = true;

  constructor(keyDir: string) {
    this.keyDir = keyDir;
  }

  get isSealed(): boolean {
    return this.sealed;
  }

  /**
   * Import a new credential (called by client endpoint).
   * Encrypts and saves to disk, also loads into memory if unsealed.
   */
  async import(opts: {
    id: string;
    type: CredentialType;
    label: string;
    secret: Uint8Array;
    password: Uint8Array;
  }): Promise<CredentialMeta> {
    await mkdir(this.keyDir, { recursive: true });

    const payload = encryptCredential(opts.secret, opts.password);

    const file: EncryptedKeyFile = {
      keyId: opts.id,
      type: opts.type,
      ciphertext: toBase64(payload.ciphertext),
      iv: toBase64(payload.iv),
      tag: '',  // GCM tag is included in ciphertext for @noble/ciphers
      kdf: {
        algorithm: 'argon2id',
        salt: toBase64(payload.salt),
        memCost: 65536,
        timeCost: 3,
        parallelism: 1,
      },
    };

    await writeFile(
      join(this.keyDir, `${opts.id}.enc.json`),
      JSON.stringify(file, null, 2),
    );

    const meta: CredentialMeta = {
      id: opts.id,
      type: opts.type,
      label: opts.label,
      createdAt: new Date().toISOString(),
      plugins: {},
      enabled: true,
    };

    // Save meta separately (not encrypted, no secrets)
    await writeFile(
      join(this.keyDir, `${opts.id}.meta.json`),
      JSON.stringify(meta, null, 2),
    );

    // If unsealed, also decrypt into memory
    if (!this.sealed) {
      this.store.set(opts.id, { secret: opts.secret.slice(), meta });
    }

    return meta;
  }

  /**
   * Unseal: decrypt all credentials into memory.
   */
  async unseal(password: Uint8Array): Promise<number> {
    await mkdir(this.keyDir, { recursive: true });

    const files = await readdir(this.keyDir);
    const encFiles = files.filter((f) => f.endsWith('.enc.json'));
    let count = 0;

    for (const file of encFiles) {
      const raw = await readFile(join(this.keyDir, file), 'utf-8');
      const enc: EncryptedKeyFile = JSON.parse(raw);

      const payload = {
        ciphertext: fromBase64(enc.ciphertext),
        iv: fromBase64(enc.iv),
        salt: fromBase64(enc.kdf.salt),
      };

      const secret = decryptCredential(payload, password, {
        memCost: enc.kdf.memCost,
        timeCost: enc.kdf.timeCost,
        parallelism: enc.kdf.parallelism,
      });

      // Load meta
      const metaPath = join(this.keyDir, file.replace('.enc.json', '.meta.json'));
      const metaRaw = await readFile(metaPath, 'utf-8');
      const meta: CredentialMeta = JSON.parse(metaRaw);

      this.store.set(enc.keyId, { secret, meta });
      count++;
    }

    this.sealed = false;
    return count;
  }

  /**
   * Seal: zero all decrypted credentials in memory.
   */
  seal(): void {
    for (const [, cred] of this.store) {
      zeroize(cred.secret);
    }
    this.store.clear();
    this.sealed = true;
  }

  /**
   * Get decrypted secret for executor injection.
   * Returns undefined if sealed or key not found.
   */
  getSecret(keyId: string): Uint8Array | undefined {
    return this.store.get(keyId)?.secret;
  }

  /**
   * Get credential metadata (no secrets).
   */
  getMeta(keyId: string): CredentialMeta | undefined {
    return this.store.get(keyId)?.meta;
  }

  /**
   * List all credential metadata.
   */
  async listMeta(): Promise<CredentialMeta[]> {
    // If unsealed, return from memory
    if (!this.sealed) {
      return Array.from(this.store.values()).map((c) => c.meta);
    }

    // If sealed, read meta files from disk
    await mkdir(this.keyDir, { recursive: true });
    const files = await readdir(this.keyDir);
    const metaFiles = files.filter((f) => f.endsWith('.meta.json'));
    const metas: CredentialMeta[] = [];

    for (const file of metaFiles) {
      const raw = await readFile(join(this.keyDir, file), 'utf-8');
      metas.push(JSON.parse(raw));
    }

    return metas;
  }

  /**
   * Update key configuration (plugin authorizations, limits).
   * Called by client endpoint.
   */
  async configure(
    keyId: string,
    plugins: Record<string, PluginKeyConfig>,
    globalDailyLimit?: LimitConfig,
  ): Promise<CredentialMeta | undefined> {
    const cred = this.store.get(keyId);
    if (!cred) return undefined;

    cred.meta.plugins = plugins;
    cred.meta.globalDailyLimit = globalDailyLimit;

    // Persist meta
    await writeFile(
      join(this.keyDir, `${keyId}.meta.json`),
      JSON.stringify(cred.meta, null, 2),
    );

    return cred.meta;
  }

  /**
   * Check if a key is authorized for a plugin.
   */
  isAuthorized(keyId: string, plugin: string): boolean {
    const meta = this.store.get(keyId)?.meta;
    if (!meta || !meta.enabled) return false;
    return plugin in meta.plugins;
  }

  /**
   * Check if an action requires approval for this key+plugin.
   */
  requiresApproval(keyId: string, plugin: string, action: string): boolean {
    const config = this.store.get(keyId)?.meta.plugins[plugin];
    if (!config) return true; // not authorized = require everything
    if (config.requireApproval?.includes(action)) return true;
    if (config.autoAllow?.includes(action)) return false;
    // Default: normal actions auto, elevated require
    return false;
  }

  /**
   * Emergency disable a key (sets enabled=false).
   */
  disableKey(keyId: string): boolean {
    const cred = this.store.get(keyId);
    if (!cred) return false;
    cred.meta.enabled = false;
    return true;
  }
}
