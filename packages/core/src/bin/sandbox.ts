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
import { ChannelManager, TelegramChannel } from '../channels/index.js';
import { startAgentServer, startClientServer, type SandboxDeps } from '../server.js';

const { values: args } = parseArgs({
  options: {
    'agent-port': { type: 'string', default: '9800' },
    'client-port': { type: 'string', default: '9801' },
    'data-dir': { type: 'string', default: './data' },
    'plugin-dir': { type: 'string', default: './plugins' },
    'telegram-token': { type: 'string' },
    'telegram-chat-id': { type: 'string' },
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

// Initialize channels
const channels = new ChannelManager();

const tgToken = args['telegram-token'] ?? process.env.KEYGATE_TELEGRAM_TOKEN;
const tgChatId = args['telegram-chat-id'] ?? process.env.KEYGATE_TELEGRAM_CHAT_ID;

if (tgToken && tgChatId) {
  const chatIds = tgChatId.split(',').map(Number).filter(Boolean);
  channels.register(new TelegramChannel({
    botToken: tgToken,
    authorizedChatIds: chatIds,
  }));
}

const deps: SandboxDeps = {
  credentials,
  tokens,
  limits,
  audit,
  plugins,
  channels,
  clientPk: '', // TODO: pairing
};

// Start channels
if (channels.size > 0) {
  await channels.startAll(async (cmd) => {
    // Handle commands from notification channels
    switch (cmd.type) {
      case 'approve': {
        if (!cmd.approvalId) return '❌ Missing approval ID';
        const pending = deps.tokens.findPendingApproval(cmd.approvalId);
        if (!pending) return `❌ Approval request \`${cmd.approvalId}\` not found or expired`;
        deps.tokens.issue({
          keyId: pending.keyId,
          plugin: pending.plugin,
          actions: [pending.action],
          expiresIn: 120,
          oneTime: true,
        });
        deps.tokens.consumePendingApproval(cmd.approvalId);
        return `✅ Approved: ${pending.plugin}/${pending.action} for key ${pending.keyId} (120s)`;
      }
      case 'deny': {
        if (!cmd.approvalId) return '❌ Missing approval ID';
        deps.tokens.denyPendingApproval(cmd.approvalId);
        return `❌ Denied: ${cmd.approvalId}`;
      }
      case 'status': {
        const sealed = deps.credentials.isSealed;
        const pCount = deps.plugins.count;
        return `🔑 KeyGate Status\n\nSealed: ${sealed ? '🔒 Yes' : '🔓 No'}\nPlugins: ${pCount}\nChannels: ${channels.list().map(c => `${c.name}: ${c.connected ? '✅' : '❌'}`).join(', ')}`;
      }
      case 'disable_key': {
        if (!cmd.keyId) return '❌ Missing key ID';
        deps.credentials.disableKey(cmd.keyId);
        return `🔴 Key \`${cmd.keyId}\` disabled`;
      }
      default:
        return `Unknown command: ${cmd.type}`;
    }
  });
  console.log(`[KeyGate] ${channels.size} channel(s) active`);
}

// Start servers
startAgentServer(deps, agentPort);
startClientServer(deps, clientPort);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[KeyGate] Shutting down...');
  await channels.stopAll();
  credentials.seal();
  console.log('[KeyGate] Credentials sealed. Goodbye.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await channels.stopAll();
  credentials.seal();
  process.exit(0);
});
