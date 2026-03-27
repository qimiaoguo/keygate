/**
 * Append-only JSON Lines audit log.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuditEntry } from '@keygate/types';
import { nanoid } from 'nanoid';

export class AuditLog {
  private dir: string;

  constructor(auditDir: string) {
    this.dir = auditDir;
  }

  async append(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<AuditEntry> {
    await mkdir(this.dir, { recursive: true });

    const full: AuditEntry = {
      id: nanoid(16),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    const date = full.timestamp.slice(0, 10); // YYYY-MM-DD
    const file = join(this.dir, `${date}.jsonl`);
    await appendFile(file, JSON.stringify(full) + '\n');

    return full;
  }
}
