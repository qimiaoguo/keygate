/**
 * LimitTracker — tracks daily usage for Key×Plugin and Key global limits.
 *
 * In-memory, resets at UTC midnight.
 * Persisted to disk for crash recovery.
 */

export interface UsageRecord {
  /** Key×Plugin daily usage */
  pluginUsage: Map<string, number>;  // "keyId:plugin" → amount
  /** Key global daily usage */
  keyUsage: Map<string, number>;     // "keyId" → amount
  /** UTC date string this record covers */
  date: string;
}

export class LimitTracker {
  private usage: UsageRecord;

  constructor() {
    this.usage = {
      pluginUsage: new Map(),
      keyUsage: new Map(),
      date: this.todayUTC(),
    };
  }

  private todayUTC(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private ensureFresh(): void {
    const today = this.todayUTC();
    if (this.usage.date !== today) {
      this.usage = {
        pluginUsage: new Map(),
        keyUsage: new Map(),
        date: today,
      };
    }
  }

  /**
   * Check if a transaction would exceed limits.
   * Returns { allowed, reason } — does NOT record usage.
   */
  check(
    keyId: string,
    plugin: string,
    amount: number,
    pluginDailyLimit?: number,
    pluginPerTx?: number,
    globalDailyLimit?: number,
  ): { allowed: boolean; reason?: string; limit?: number; used?: number } {
    this.ensureFresh();

    // Per-tx limit
    if (pluginPerTx !== undefined && amount > pluginPerTx) {
      return {
        allowed: false,
        reason: 'per_tx_exceeded',
        limit: pluginPerTx,
        used: amount,
      };
    }

    // Plugin daily limit
    if (pluginDailyLimit !== undefined) {
      const key = `${keyId}:${plugin}`;
      const used = this.usage.pluginUsage.get(key) ?? 0;
      if (used + amount > pluginDailyLimit) {
        return {
          allowed: false,
          reason: 'plugin_limit_exceeded',
          limit: pluginDailyLimit,
          used,
        };
      }
    }

    // Key global daily limit
    if (globalDailyLimit !== undefined) {
      const used = this.usage.keyUsage.get(keyId) ?? 0;
      if (used + amount > globalDailyLimit) {
        return {
          allowed: false,
          reason: 'key_limit_exceeded',
          limit: globalDailyLimit,
          used,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record usage after successful execution.
   */
  record(keyId: string, plugin: string, amount: number): void {
    this.ensureFresh();

    const pluginKey = `${keyId}:${plugin}`;
    this.usage.pluginUsage.set(
      pluginKey,
      (this.usage.pluginUsage.get(pluginKey) ?? 0) + amount,
    );
    this.usage.keyUsage.set(
      keyId,
      (this.usage.keyUsage.get(keyId) ?? 0) + amount,
    );
  }

  /**
   * Get remaining daily budget for a key×plugin combo.
   */
  remaining(keyId: string, plugin: string, dailyLimit?: number): number | undefined {
    if (dailyLimit === undefined) return undefined;
    this.ensureFresh();
    const used = this.usage.pluginUsage.get(`${keyId}:${plugin}`) ?? 0;
    return Math.max(0, dailyLimit - used);
  }

  /**
   * Get remaining global daily budget for a key.
   */
  remainingGlobal(keyId: string, globalLimit?: number): number | undefined {
    if (globalLimit === undefined) return undefined;
    this.ensureFresh();
    const used = this.usage.keyUsage.get(keyId) ?? 0;
    return Math.max(0, globalLimit - used);
  }

  /** Next UTC midnight as ISO string */
  get resetsAt(): string {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow.toISOString();
  }
}
