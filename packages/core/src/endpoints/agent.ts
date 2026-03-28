/**
 * /agent/* — AI Agent endpoints
 *
 * - GET /agent/capabilities?key=<id>  — discover what's available
 * - POST /agent/execute               — execute an action
 * - GET /agent/status                  — sandbox status
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SandboxDeps } from '../server.js';
import type { ExecuteRequest, CapabilitiesResponse } from '@keygate/types';

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function createAgentRouter() {
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse, body: unknown, deps: SandboxDeps) => Promise<void>>();

  // GET /agent/capabilities?key=<id>
  routes.set('GET /agent/capabilities', async (req, res, _body, deps) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const keyId = url.searchParams.get('key');

    if (!keyId) {
      return json(res, 400, { ok: false, error: 'missing_key', hint: 'Specify ?key=<key_id>' });
    }

    if (deps.credentials.isSealed) {
      return json(res, 503, { ok: false, error: 'sealed', hint: 'Sandbox is sealed, waiting for client unseal' });
    }

    const meta = deps.credentials.getMeta(keyId);
    if (!meta) {
      return json(res, 404, { ok: false, error: 'key_not_found' });
    }

    const plugins: CapabilitiesResponse['plugins'] = [];

    for (const [pluginName, config] of Object.entries(meta.plugins)) {
      const pluginInfo = deps.plugins.get(pluginName);
      if (!pluginInfo) continue;

      plugins.push({
        plugin: pluginName,
        actions: pluginInfo.manifest.capabilities.actions.map((a) => ({
          name: a.name,
          description: a.description,
          riskLevel: a.riskLevel,
          paramsSchema: undefined, // TODO: load schema
        })),
        limits: {
          dailyLimit: config.dailyLimit,
          perTx: config.perTx,
          remainingDaily: deps.limits.remaining(keyId, pluginName, config.dailyLimit),
          currency: config.currency,
        },
      });
    }

    return json(res, 200, { key: keyId, plugins } satisfies CapabilitiesResponse);
  });

  // POST /agent/execute
  routes.set('POST /agent/execute', async (_req, res, body, deps) => {
    if (deps.credentials.isSealed) {
      return json(res, 503, { ok: false, error: 'sealed' });
    }

    const req_body = body as ExecuteRequest;
    if (!req_body?.plugin || !req_body?.action || !req_body?.key) {
      return json(res, 400, { ok: false, error: 'invalid_request', hint: 'Required: plugin, action, key' });
    }

    const { plugin, action, key: keyId, params } = req_body;

    // Step 1: Plugin exists + enabled + integrity
    const pluginInfo = deps.plugins.get(plugin);
    if (!pluginInfo) {
      await deps.audit.append({ source: 'agent', keyId, plugin, action, result: 'denied', error: 'plugin_not_found' });
      return json(res, 404, { ok: false, error: 'plugin_not_found' });
    }

    // Step 2: Action exists
    const actionDef = pluginInfo.manifest.capabilities.actions.find((a) => a.name === action)
      ?? pluginInfo.manifest.capabilities.queries?.find((a) => a.name === action);
    if (!actionDef) {
      await deps.audit.append({ source: 'agent', keyId, plugin, action, result: 'denied', error: 'action_not_found' });
      return json(res, 404, { ok: false, error: 'action_not_found' });
    }

    // Step 2.5: Param validation (JSON Schema)
    const validationError = deps.plugins.validateParams(plugin, action, params ?? {});
    if (validationError) {
      await deps.audit.append({ source: 'agent', keyId, plugin, action, params, result: 'denied', error: 'invalid_params' });
      return json(res, 400, { ok: false, error: 'invalid_params', details: validationError });
    }

    // Step 3: Key exists + authorized for plugin
    if (!deps.credentials.isAuthorized(keyId, plugin)) {
      await deps.audit.append({ source: 'agent', keyId, plugin, action, result: 'denied', error: 'plugin_not_authorized' });
      return json(res, 403, { ok: false, error: 'plugin_not_authorized', key: keyId, plugin, hint: 'This key is not authorized for this plugin' });
    }

    // Step 4: Action requires approval?
    if (deps.credentials.requiresApproval(keyId, plugin, action)) {
      // Check for one-time token
      const token = deps.tokens.findValid(keyId, plugin, action);
      if (!token) {
        await deps.audit.append({ source: 'agent', keyId, plugin, action, result: 'denied', error: 'approval_required' });
        return json(res, 403, { ok: false, error: 'approval_required', key: keyId, plugin, action, hint: 'Request one-time approval from user' });
      }
    }

    // Step 5: Limit check
    const meta = deps.credentials.getMeta(keyId)!;
    const pluginConfig = meta.plugins[plugin];
    const amount = typeof params?.amount === 'number' ? params.amount : 0;

    const limitCheck = deps.limits.check(
      keyId, plugin, amount,
      pluginConfig?.dailyLimit,
      pluginConfig?.perTx,
      meta.globalDailyLimit?.amount,
    );

    if (!limitCheck.allowed) {
      await deps.audit.append({
        source: 'agent', keyId, plugin, action, params,
        result: 'denied', error: limitCheck.reason,
        amount, currency: pluginConfig?.currency,
      });
      return json(res, 403, {
        ok: false,
        error: limitCheck.reason,
        key: keyId, plugin,
        limit: limitCheck.limit,
        used: limitCheck.used,
        currency: pluginConfig?.currency ?? meta.globalDailyLimit?.currency,
        resetsAt: deps.limits.resetsAt,
      });
    }

    // Step 6: Get credential + execute
    const secret = deps.credentials.getSecret(keyId);
    if (!secret) {
      return json(res, 500, { ok: false, error: 'credential_unavailable' });
    }

    try {
      const result = await deps.plugins.execute(plugin, action, params ?? {}, secret);

      // Record usage on success
      if (amount > 0) {
        deps.limits.record(keyId, plugin, amount);
      }

      await deps.audit.append({
        source: 'agent', keyId, plugin, action, params,
        result: 'success', amount, currency: pluginConfig?.currency,
      });

      return json(res, 200, { ok: true, result });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await deps.audit.append({
        source: 'agent', keyId, plugin, action, params,
        result: 'error', error: errorMsg,
      });
      return json(res, 500, { ok: false, error: 'execution_error', message: errorMsg });
    }
  });

  // POST /agent/request-approval — ask user to approve an action via notification channel
  routes.set('POST /agent/request-approval', async (_req, res, body, deps) => {
    const { plugin, action, key: keyId, params, reason } = body as Record<string, any>;

    if (!plugin || !action || !keyId) {
      return json(res, 400, { ok: false, error: 'missing_fields', required: ['plugin', 'action', 'key'] });
    }

    if (!deps.channels || deps.channels.size === 0) {
      return json(res, 503, { ok: false, error: 'no_channels', hint: 'No notification channels configured. Use CLI to approve manually.' });
    }

    // Create a pending approval record
    const approvalId = deps.tokens.createPendingApproval({
      keyId,
      plugin,
      action,
      params: params ?? {},
    });

    // Push to all channels
    await deps.channels.notify({
      type: 'approval_request',
      title: 'Approval Required',
      body: `${plugin}/${action} for key ${keyId}`,
      approvalRequest: {
        id: approvalId,
        keyId,
        plugin,
        action,
        params: params ?? {},
        reason,
        requestedAt: new Date().toISOString(),
      },
    });

    await deps.audit.append({
      source: 'agent', keyId, plugin, action, params,
      result: 'success',
    });

    return json(res, 202, {
      ok: true,
      approvalId,
      hint: 'Approval request sent to notification channels. Retry /agent/execute after user approves.',
    });
  });

  // GET /agent/status
  routes.set('GET /agent/status', async (_req, res, _body, deps) => {
    return json(res, 200, {
      ok: true,
      sealed: deps.credentials.isSealed,
      paired: !!deps.clientPk,
      pluginCount: deps.plugins.count,
      channels: deps.channels?.list() ?? [],
    });
  });

  return { routes };
}
