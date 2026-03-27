/**
 * /keys/* — Credential management endpoints (client-only)
 *
 * - GET  /keys/list       — list all credentials (sanitized)
 * - POST /keys/import     — import a new credential
 * - POST /keys/configure  — set plugin authorizations + limits
 * - POST /keys/disable    — emergency disable
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SandboxDeps } from '../server.js';
import type { CredentialType, PluginKeyConfig, LimitConfig } from '@keygate/types';

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function createKeysRouter() {
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse, body: unknown, deps: SandboxDeps) => Promise<void>>();

  // GET /keys/list
  routes.set('GET /keys/list', async (_req, res, _body, deps) => {
    const metas = await deps.credentials.listMeta();
    // Sanitized: no secrets, only metadata
    return json(res, 200, {
      ok: true,
      keys: metas.map((m) => ({
        id: m.id,
        type: m.type,
        label: m.label,
        enabled: m.enabled,
        plugins: Object.keys(m.plugins),
        createdAt: m.createdAt,
      })),
    });
  });

  // POST /keys/import
  routes.set('POST /keys/import', async (_req, res, body, deps) => {
    const { id, type, label, secret, password } = body as {
      id: string;
      type: CredentialType;
      label: string;
      secret: string;  // hex-encoded
      password: string;
    };

    if (!id || !type || !label || !secret || !password) {
      return json(res, 400, { ok: false, error: 'missing_fields' });
    }

    // Decode hex secret
    const secretBytes = new Uint8Array(
      (secret.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)),
    );

    try {
      const meta = await deps.credentials.import({
        id,
        type,
        label,
        secret: secretBytes,
        password: new TextEncoder().encode(password),
      });

      // Zero the input buffer
      secretBytes.fill(0);

      await deps.audit.append({
        source: 'client',
        keyId: id,
        action: 'key_imported',
        result: 'success',
      });

      return json(res, 200, { ok: true, key: { id: meta.id, type: meta.type, label: meta.label } });
    } catch (err) {
      secretBytes.fill(0);
      return json(res, 500, {
        ok: false,
        error: 'import_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // POST /keys/configure
  routes.set('POST /keys/configure', async (_req, res, body, deps) => {
    if (deps.credentials.isSealed) {
      return json(res, 503, { ok: false, error: 'sealed' });
    }

    const { keyId, plugins, globalDailyLimit } = body as {
      keyId: string;
      plugins: Record<string, PluginKeyConfig>;
      globalDailyLimit?: LimitConfig;
    };

    if (!keyId || !plugins) {
      return json(res, 400, { ok: false, error: 'missing_fields' });
    }

    const meta = await deps.credentials.configure(keyId, plugins, globalDailyLimit);
    if (!meta) {
      return json(res, 404, { ok: false, error: 'key_not_found' });
    }

    await deps.audit.append({
      source: 'client',
      keyId,
      action: 'key_configured',
      result: 'success',
    });

    return json(res, 200, { ok: true, key: { id: meta.id, plugins: Object.keys(meta.plugins) } });
  });

  // POST /keys/disable
  routes.set('POST /keys/disable', async (_req, res, body, deps) => {
    const { keyId } = body as { keyId: string };
    if (!keyId) {
      return json(res, 400, { ok: false, error: 'missing_keyId' });
    }

    // Disable the key + revoke all tokens
    const meta = deps.credentials.getMeta(keyId);
    if (!meta) {
      return json(res, 404, { ok: false, error: 'key_not_found' });
    }

    meta.enabled = false;
    deps.tokens.revokeAllForKey(keyId);

    await deps.audit.append({
      source: 'client',
      keyId,
      action: 'key_disabled',
      result: 'success',
    });

    return json(res, 200, { ok: true });
  });

  return { routes };
}
