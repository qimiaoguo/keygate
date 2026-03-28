/**
 * KeyGate Sandbox Server
 *
 * Two listeners:
 * - Agent socket/port: /agent/* endpoints
 * - Client socket/port: /client/* and /keys/* endpoints
 *
 * MVP: HTTP on localhost ports (Unix sockets in production).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { CredentialManager } from './credential-manager.js';
import type { AuditLog } from './audit/audit-log.js';
import type { TokenManager } from './auth/token-manager.js';
import type { LimitTracker } from './auth/limit-tracker.js';
import type { PluginManager } from './plugin/plugin-manager.js';
import type { ChannelManager } from './channels/channel-manager.js';
import { createAgentRouter } from './endpoints/agent.js';
import { createClientRouter } from './endpoints/client.js';
import { createKeysRouter } from './endpoints/keys.js';

export interface SandboxDeps {
  credentials: CredentialManager;
  tokens: TokenManager;
  limits: LimitTracker;
  audit: AuditLog;
  plugins: PluginManager;
  channels?: ChannelManager;
  /** Ed25519 public key of paired client (hex). Empty if not paired. */
  clientPk: string;
}

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  deps: SandboxDeps,
) => Promise<void>;

interface Router {
  routes: Map<string, RouteHandler>;
}

function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(undefined);
      }
    });
  });
}

function createHttpHandler(routers: Router[], deps: SandboxDeps) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const routeKey = `${method} ${path}`;

    for (const router of routers) {
      const handler = router.routes.get(routeKey);
      if (handler) {
        try {
          const body = method === 'POST' || method === 'PUT' ? await readBody(req) : undefined;
          await handler(req, res, body, deps);
        } catch (err) {
          console.error(`[KeyGate] Error handling ${routeKey}:`, err);
          jsonResponse(res, 500, { ok: false, error: 'internal_error' });
        }
        return;
      }
    }

    jsonResponse(res, 404, { ok: false, error: 'not_found' });
  };
}

export function startAgentServer(deps: SandboxDeps, port: number): ReturnType<typeof createServer> {
  const agentRouter = createAgentRouter();
  const handler = createHttpHandler([agentRouter], deps);
  const server = createServer(handler);
  server.listen(port, '127.0.0.1', () => {
    console.log(`[KeyGate] Agent server listening on 127.0.0.1:${port}`);
  });
  return server;
}

export function startClientServer(deps: SandboxDeps, port: number): ReturnType<typeof createServer> {
  const clientRouter = createClientRouter();
  const keysRouter = createKeysRouter();
  const handler = createHttpHandler([clientRouter, keysRouter], deps);
  const server = createServer(handler);
  server.listen(port, '127.0.0.1', () => {
    console.log(`[KeyGate] Client server listening on 127.0.0.1:${port}`);
  });
  return server;
}
