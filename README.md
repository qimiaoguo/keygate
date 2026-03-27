# KeyGate

**AI Agent Secure Credential Sandbox** — Let AI agents use keys, API credentials, and payment secrets without ever touching them.

> ⚠️ Early development. Not production-ready.

## The Problem

AI agents are being used for on-chain trading, payments, and API calls. But most setups just hand the agent the private key and hope for the best. One prompt injection and your funds are gone.

## The Solution

KeyGate puts a policy-enforced sandbox between the agent and your secrets:

```
AI Agent ──→ Sandbox (policy engine) ──→ Plugin (executes with injected credential)
                ↑
            Client CLI (you control everything)
```

- **Agent** sees capabilities + limits, never sees keys
- **Sandbox** validates requests, enforces limits, checks integrity
- **Client** (you) controls which keys can do what, with per-plugin and per-key limits
- **Plugins** are isolated scripts that perform the actual operations

## Security Model

| Component | Sees Secrets | Can Execute | Can Change Permissions |
|-----------|:-----------:|:-----------:|:---------------------:|
| **You (CLI)** | ❌ | ❌ | ✅ |
| **Sandbox** | ✅ (in memory) | ✅ (with valid token) | ❌ |
| **AI Agent** | ❌ | ❌ (needs token) | ❌ |

Any single component being compromised is not enough to steal funds.

## Features

- 🔐 **AES-256-GCM encryption** with Argon2id KDF for all credentials
- 🛡️ **JSON Schema validation** on every request (bad params never reach plugins)
- 🔍 **CHECKSUM integrity** verified at load + before every execution
- 📊 **Two-layer limits**: per-plugin + global daily, per-transaction caps
- 🎫 **Approval tokens**: persistent tokens for routine ops, one-time for sensitive
- 📝 **Audit log**: every action recorded (JSON Lines)
- 🔌 **Plugin system**: TS + Python, isolated subprocess execution

## Quick Start

### Run locally

```bash
git clone https://github.com/user/keygate.git
cd keygate && npm install

# Start sandbox
npx tsx packages/core/src/bin/sandbox.ts

# In another terminal — import a key
npx tsx packages/cli/src/cli.ts keys import my-key crypto_key "Trading Key" \
  --secret <hex-private-key> --password <encryption-password>

# Unseal the vault
echo "<encryption-password>" | npx tsx packages/cli/src/cli.ts unseal

# Configure permissions
npx tsx packages/cli/src/cli.ts keys configure my-key \
  '{"evm-swap":{"dailyLimit":500,"perTx":100,"currency":"USDC"}}'

# Agent discovers what it can do
curl http://127.0.0.1:9800/agent/capabilities?key=my-key

# Agent executes a swap
curl -X POST http://127.0.0.1:9800/agent/execute \
  -d '{"plugin":"evm-swap","action":"swap","key":"my-key","params":{"chain":"polygon","from_token":"USDC","to_token":"ETH","amount":50}}'
```

### Run with Docker

```bash
docker compose up -d

# Plugins are mounted from ./plugins (read-only)
# Data is persisted in a Docker volume
```

## CLI Commands

```
keygate status                              — Sandbox status
keygate unseal                              — Unseal credential store
keygate keys list                           — List all keys
keygate keys import <id> <type> <label>     — Import a key
keygate keys configure <id> <plugins-json>  — Set plugin authorizations
keygate keys disable <id>                   — Emergency disable
keygate plugins list                        — List plugins
keygate plugins toggle <name> <on|off>      — Enable/disable
keygate tokens list                         — List auth tokens
keygate tokens issue <keyId> <plugin>       — Issue token
keygate tokens revoke <id>                  — Revoke token
keygate approve <keyId> <plugin> <action>   — One-time approval
keygate exec <plugin> <action> <key> [json] — Execute (test)
keygate caps <keyId>                        — Show capabilities
```

## Included Plugins

| Plugin | Description | Risk |
|--------|-------------|------|
| `evm-swap` | DEX swap via Paraswap (ETH/Polygon/Arbitrum/BSC) | normal |
| `solana-swap` | DEX swap via Jupiter Ultra | normal |
| `transfer` | Send tokens to external addresses | **elevated** (requires approval) |
| `mock-swap` | Testing plugin | normal |

## Writing Plugins

Create a directory in `plugins/` with:

```
my-plugin/
  plugin.json      — manifest (name, version, capabilities)
  schemas/         — JSON Schema for each action's params
    swap.json
  swap.ts          — action script (reads env vars, outputs JSON)
  package.json     — { "type": "module" }
```

Your script receives:
- `KEYGATE_CREDENTIAL` — hex-encoded secret (injected by sandbox)
- `KEYGATE_PARAMS` — JSON parameters

Output JSON to stdout. That's it.

## Architecture

See [docs/keygate-architecture.md](docs/keygate-architecture.md) for the full design.

## License

MIT
