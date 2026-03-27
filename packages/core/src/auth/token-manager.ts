/**
 * TokenManager — manages authorization tokens.
 *
 * - Persistent tokens: long-lived, stored in config
 * - One-time tokens: created by approve-once, deleted after use
 */

import { nanoid } from 'nanoid';
import type { AuthToken } from '@keygate/types';

export class TokenManager {
  private tokens = new Map<string, AuthToken>();

  /**
   * Issue a new token.
   */
  issue(opts: {
    keyId: string;
    plugin: string;
    actions: string[] | '*';
    limits?: { dailyLimit?: number; perTx?: number; currency?: string };
    expiresIn?: number; // seconds
    oneTime?: boolean;
  }): AuthToken {
    const token: AuthToken = {
      id: nanoid(24),
      keyId: opts.keyId,
      plugin: opts.plugin,
      actions: opts.actions,
      limits: opts.limits,
      issuedAt: new Date().toISOString(),
      expiresAt: opts.expiresIn
        ? new Date(Date.now() + opts.expiresIn * 1000).toISOString()
        : undefined,
      oneTime: opts.oneTime ?? false,
    };

    this.tokens.set(token.id, token);
    return token;
  }

  /**
   * Find a valid token for a given key+plugin+action.
   * Checks expiry and action match.
   * If one-time, deletes after returning.
   */
  findValid(keyId: string, plugin: string, action: string): AuthToken | undefined {
    const now = new Date().toISOString();

    for (const [id, token] of this.tokens) {
      if (token.keyId !== keyId) continue;
      if (token.plugin !== plugin) continue;
      if (token.expiresAt && token.expiresAt < now) {
        this.tokens.delete(id); // expired, clean up
        continue;
      }
      if (token.actions !== '*' && !token.actions.includes(action)) continue;

      // Match found
      if (token.oneTime) {
        this.tokens.delete(id);
      }
      return token;
    }

    return undefined;
  }

  /**
   * Revoke a specific token.
   */
  revoke(tokenId: string): boolean {
    return this.tokens.delete(tokenId);
  }

  /**
   * Revoke all tokens for a key.
   */
  revokeAllForKey(keyId: string): number {
    let count = 0;
    for (const [id, token] of this.tokens) {
      if (token.keyId === keyId) {
        this.tokens.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * List all tokens (for client inspection).
   */
  list(): AuthToken[] {
    const now = new Date().toISOString();
    // Clean expired while listing
    const result: AuthToken[] = [];
    for (const [id, token] of this.tokens) {
      if (token.expiresAt && token.expiresAt < now) {
        this.tokens.delete(id);
        continue;
      }
      result.push(token);
    }
    return result;
  }
}
