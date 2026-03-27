/**
 * /client/* — Client (CLI daemon) endpoints
 *
 * - GET  /client/plugins          — list plugins
 * - POST /client/plugins/install  — install plugin
 * - POST /client/plugins/toggle   — enable/disable plugin
 * - POST /client/tokens/issue     — issue auth token
 * - POST /client/tokens/revoke    — revoke token
 * - GET  /client/tokens           — list tokens
 * - POST /client/approve-once     — one-time approval
 * - POST /client/unseal           — unseal credential store
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SandboxDeps } from '../server.js';

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// TODO: Verify client_sk signature on all write operations
// For MVP, we trust localhost client port is not exposed

export function createClientRouter() {
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse, body: unknown, deps: SandboxDeps) => Promise<void>>();

  // POST /client/unseal
  routes.set('POST /client/unseal', async (_req, res, body, deps) => {
    const { password } = body as { password: string };
    if (!password) {
      return json(res, 400, { ok: false, error: 'missing_password' });
    }

    try {
      const count = await deps.credentials.unseal(
        new TextEncoder().encode(password),
      );
      return json(res, 200, { ok: true, unsealed: count });
    } catch (err) {
      return json(res, 401, {
        ok: false,
        error: 'unseal_failed',
        message: err instanceof Error ? err.message : 'Bad password or corrupted files',
      });
    }
  });

  // GET /client/plugins
  routes.set('GET /client/plugins', async (_req, res, _body, deps) => {
    return json(res, 200, { ok: true, plugins: deps.plugins.list() });
  });

  // POST /client/plugins/toggle
  routes.set('POST /client/plugins/toggle', async (_req, res, body, deps) => {
    const { name, enabled } = body as { name: string; enabled: boolean };
    if (!name || typeof enabled !== 'boolean') {
      return json(res, 400, { ok: false, error: 'invalid_request' });
    }

    const result = deps.plugins.toggle(name, enabled);
    if (!result) {
      return json(res, 404, { ok: false, error: 'plugin_not_found' });
    }
    return json(res, 200, { ok: true, plugin: name, enabled });
  });

  // POST /client/tokens/issue
  routes.set('POST /client/tokens/issue', async (_req, res, body, deps) => {
    const { keyId, plugin, actions, limits, expiresIn } = body as {
      keyId: string;
      plugin: string;
      actions?: string[];
      limits?: { dailyLimit?: number; perTx?: number; currency?: string };
      expiresIn?: number;
    };

    if (!keyId || !plugin) {
      return json(res, 400, { ok: false, error: 'missing_keyId_or_plugin' });
    }

    const token = deps.tokens.issue({
      keyId,
      plugin,
      actions: actions ?? '*',
      limits,
      expiresIn,
    });

    await deps.audit.append({
      source: 'client',
      keyId,
      plugin,
      action: 'token_issued',
      result: 'success',
    });

    return json(res, 200, { ok: true, token });
  });

  // POST /client/tokens/revoke
  routes.set('POST /client/tokens/revoke', async (_req, res, body, deps) => {
    const { tokenId, keyId } = body as { tokenId?: string; keyId?: string };

    if (tokenId) {
      deps.tokens.revoke(tokenId);
      return json(res, 200, { ok: true });
    }
    if (keyId) {
      const count = deps.tokens.revokeAllForKey(keyId);
      return json(res, 200, { ok: true, revoked: count });
    }

    return json(res, 400, { ok: false, error: 'missing_tokenId_or_keyId' });
  });

  // GET /client/tokens
  routes.set('GET /client/tokens', async (_req, res, _body, deps) => {
    return json(res, 200, { ok: true, tokens: deps.tokens.list() });
  });

  // POST /client/approve-once
  routes.set('POST /client/approve-once', async (_req, res, body, deps) => {
    const { keyId, plugin, action, expiresIn } = body as {
      keyId: string;
      plugin: string;
      action: string;
      expiresIn?: number;
    };

    if (!keyId || !plugin || !action) {
      return json(res, 400, { ok: false, error: 'missing_fields' });
    }

    const token = deps.tokens.issue({
      keyId,
      plugin,
      actions: [action],
      expiresIn: expiresIn ?? 60,
      oneTime: true,
    });

    await deps.audit.append({
      source: 'client',
      keyId,
      plugin,
      action: `approve_once:${action}`,
      result: 'success',
    });

    return json(res, 200, { ok: true, token });
  });

  return { routes };
}
