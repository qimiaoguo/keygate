#!/usr/bin/env tsx
/**
 * KeyGate Sandbox — entry point
 *
 * Usage:
 *   keygate-sandbox [--agent-port 9800] [--client-port 9801] [--data-dir ./data]
 */

import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { CredentialManager } from '../credential-manager.js';
import { TokenManager } from '../auth/token-manager.js';
import { LimitTracker } from '../auth/limit-tracker.js';
import { AuditLog } from '../audit/audit-log.js';
import { PluginManager } from '../plugin/plugin-manager.js';
import { startAgentServer, startClientServer, type SandboxDeps } from '../server.js';

const { values: args } = parseArgs({
  options: {
    'agent-port': { type: 'string', default: '9800' },
    'client-port': { type: 'string', default: '9801' },
    'data-dir': { type: 'string', default: './data' },
    'plugin-dir': { type: 'string', default: './plugins' },
  },
});

const dataDir = args['data-dir']!;
const agentPort = parseInt(args['agent-port']!, 10);
const clientPort = parseInt(args['client-port']!, 10);
const pluginDir = args['plugin-dir']!;

console.log(`
╔═══════════════════════════════════════╗
║         KeyGate Sandbox v0.1          ║
║   AI Agent Secure Credential Sandbox  ║
╚═══════════════════════════════════════╝
`);
console.log(`Data dir:    ${dataDir}`);
console.log(`Plugin dir:  ${pluginDir}`);
console.log(`Agent port:  ${agentPort}`);
console.log(`Client port: ${clientPort}`);
console.log();

// Initialize components
const credentials = new CredentialManager(join(dataDir, 'keys'));
const tokens = new TokenManager();
const limits = new LimitTracker();
const audit = new AuditLog(join(dataDir, 'audit'));
const plugins = new PluginManager(pluginDir);

// Load plugins
const pluginCount = await plugins.loadAll();
console.log(`[KeyGate] Loaded ${pluginCount} plugin(s)`);
console.log(`[KeyGate] Sandbox is SEALED — waiting for client unseal`);
console.log();

const deps: SandboxDeps = {
  credentials,
  tokens,
  limits,
  audit,
  plugins,
  clientPk: '', // TODO: pairing
};

// Start servers
startAgentServer(deps, agentPort);
startClientServer(deps, clientPort);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[KeyGate] Shutting down...');
  credentials.seal();
  console.log('[KeyGate] Credentials sealed. Goodbye.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  credentials.seal();
  process.exit(0);
});
