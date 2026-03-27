#!/usr/bin/env tsx
/**
 * KeyGate CLI — manage your sandbox from the terminal.
 *
 * Usage:
 *   keygate status                          — sandbox status
 *   keygate unseal                          — unseal credential store
 *   keygate keys list                       — list keys
 *   keygate keys import <id> <type> <label> — import a key
 *   keygate keys configure <id> <json>      — set plugin authorizations
 *   keygate keys disable <id>               — emergency disable
 *   keygate plugins list                    — list plugins
 *   keygate plugins toggle <name> <on|off>  — enable/disable plugin
 *   keygate tokens list                     — list tokens
 *   keygate tokens issue <keyId> <plugin>   — issue auth token
 *   keygate tokens revoke <id>              — revoke token
 *   keygate approve <keyId> <plugin> <action> — one-time approval
 *   keygate exec <plugin> <action> <key> [params-json] — execute (test)
 *   keygate caps <keyId>                    — show capabilities
 */

import { KeyGateClient } from './api.js';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const client = new KeyGateClient();
const [,, cmd, ...args] = process.argv;

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function die(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function pp(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

async function readLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function readSecret(prompt: string): Promise<string> {
  // Simple: just read from stdin. For real CLI, use terminal raw mode.
  process.stdout.write(prompt);
  const rl = createInterface({ input: process.stdin, terminal: false });
  return new Promise((resolve) => {
    rl.on('line', (line) => {
      rl.close();
      resolve(line);
    });
  });
}

async function main() {
  switch (cmd) {
    case 'status': {
      const s = await client.status();
      console.log(`Sandbox: ${s.sealed ? '🔒 SEALED' : '🔓 UNSEALED'}`);
      console.log(`Paired:  ${s.paired ? '✅ Yes' : '❌ No'}`);
      console.log(`Plugins: ${s.pluginCount}`);
      break;
    }

    case 'unseal': {
      const password = await readSecret('Password: ');
      const result = await client.unseal(password);
      if (result.ok) {
        console.log(`✅ Unsealed ${result.unsealed} credential(s)`);
      } else {
        die(result.error ?? 'Unseal failed');
      }
      break;
    }

    case 'keys': {
      const sub = args[0];
      switch (sub) {
        case 'list': {
          const result = await client.listKeys();
          if (!result.ok) die(result.error ?? 'Failed');
          pp(result.keys);
          break;
        }
        case 'import': {
          const [id, type, label] = args.slice(1);
          if (!id || !type || !label) die('Usage: keygate keys import <id> <type> <label> [--secret <hex>] [--password <pw>]');
          // Support both interactive and flag-based input
          let secret = getFlagValue(args, '--secret');
          let password = getFlagValue(args, '--password');
          if (!secret) secret = await readLine('Secret (hex): ');
          if (!password) password = await readLine('Encryption password: ');
          const result = await client.importKey({ id, type, label, secret, password });
          if (result.ok) {
            console.log(`✅ Key imported: ${result.key?.id}`);
          } else {
            die(result.error ?? 'Import failed');
          }
          break;
        }
        case 'configure': {
          const [keyId, jsonStr] = args.slice(1);
          if (!keyId || !jsonStr) die('Usage: keygate keys configure <id> <plugins-json>');
          const plugins = JSON.parse(jsonStr);
          const result = await client.configureKey({ keyId, plugins });
          if (result.ok) {
            console.log(`✅ Key configured: ${keyId}`);
          } else {
            die(result.error ?? 'Configure failed');
          }
          break;
        }
        case 'disable': {
          const [keyId] = args.slice(1);
          if (!keyId) die('Usage: keygate keys disable <id>');
          const result = await client.disableKey(keyId);
          if (result.ok) {
            console.log(`🔴 Key disabled: ${keyId}`);
          } else {
            die(result.error ?? 'Disable failed');
          }
          break;
        }
        default:
          die('Usage: keygate keys <list|import|configure|disable>');
      }
      break;
    }

    case 'plugins': {
      const sub = args[0];
      switch (sub) {
        case 'list': {
          const result = await client.listPlugins();
          if (!result.ok) die(result.error ?? 'Failed');
          pp(result.plugins);
          break;
        }
        case 'toggle': {
          const [name, state] = args.slice(1);
          if (!name || !['on', 'off'].includes(state)) die('Usage: keygate plugins toggle <name> <on|off>');
          const result = await client.togglePlugin(name, state === 'on');
          if (result.ok) {
            console.log(`✅ Plugin ${name}: ${state === 'on' ? 'enabled' : 'disabled'}`);
          } else {
            die(result.error ?? 'Toggle failed');
          }
          break;
        }
        default:
          die('Usage: keygate plugins <list|toggle>');
      }
      break;
    }

    case 'tokens': {
      const sub = args[0];
      switch (sub) {
        case 'list': {
          const result = await client.listTokens();
          if (!result.ok) die(result.error ?? 'Failed');
          pp(result.tokens);
          break;
        }
        case 'issue': {
          const [keyId, plugin] = args.slice(1);
          if (!keyId || !plugin) die('Usage: keygate tokens issue <keyId> <plugin>');
          const expiresIn = args[3] ? parseInt(args[3], 10) : undefined;
          const result = await client.issueToken({ keyId, plugin, expiresIn });
          if (result.ok) {
            pp(result.token);
          } else {
            die(result.error ?? 'Issue failed');
          }
          break;
        }
        case 'revoke': {
          const [tokenId] = args.slice(1);
          if (!tokenId) die('Usage: keygate tokens revoke <tokenId>');
          const result = await client.revokeToken(tokenId);
          if (result.ok) {
            console.log('✅ Token revoked');
          } else {
            die(result.error ?? 'Revoke failed');
          }
          break;
        }
        default:
          die('Usage: keygate tokens <list|issue|revoke>');
      }
      break;
    }

    case 'approve': {
      const [keyId, plugin, action] = args;
      if (!keyId || !plugin || !action) die('Usage: keygate approve <keyId> <plugin> <action>');
      const expiresIn = args[3] ? parseInt(args[3], 10) : 120;
      const result = await client.approveOnce({ keyId, plugin, action, expiresIn });
      if (result.ok) {
        console.log(`✅ Approved: ${plugin}/${action} for key ${keyId} (${expiresIn}s)`);
      } else {
        die(result.error ?? 'Approval failed');
      }
      break;
    }

    case 'exec': {
      const [plugin, action, key, paramsJson] = args;
      if (!plugin || !action || !key) die('Usage: keygate exec <plugin> <action> <key> [params-json]');
      const params = paramsJson ? JSON.parse(paramsJson) : {};
      const result = await client.execute({ plugin, action, key, params });
      pp(result);
      break;
    }

    case 'caps': {
      const [keyId] = args;
      if (!keyId) die('Usage: keygate caps <keyId>');
      const result = await client.capabilities(keyId);
      pp(result);
      break;
    }

    case 'help':
    case undefined: {
      console.log(`
KeyGate CLI — AI Agent Secure Credential Sandbox

Commands:
  status                              Sandbox status
  unseal                              Unseal credential store
  keys list                           List all keys
  keys import <id> <type> <label>     Import a key (prompts for secret)
  keys configure <id> <plugins-json>  Set plugin authorizations
  keys disable <id>                   Emergency disable a key
  plugins list                        List plugins
  plugins toggle <name> <on|off>      Enable/disable a plugin
  tokens list                         List auth tokens
  tokens issue <keyId> <plugin>       Issue an auth token
  tokens revoke <id>                  Revoke a token
  approve <keyId> <plugin> <action>   One-time approval (120s default)
  exec <plugin> <action> <key> [json] Execute an action (test mode)
  caps <keyId>                        Show capabilities for a key
  help                                Show this help
      `.trim());
      break;
    }

    default:
      die(`Unknown command: ${cmd}. Run 'keygate help' for usage.`);
  }
}

main().catch((err) => {
  if (err.cause?.code === 'ECONNREFUSED') {
    die('Cannot connect to sandbox. Is it running?');
  }
  die(err.message);
});
