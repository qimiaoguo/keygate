# KeyGate

**AI Agent Secure Credential Sandbox** — Let AI agents use keys, API credentials, and payment secrets without ever touching them.

> ⚠️ Early development. Not production-ready.

## The Problem

AI agents are being used for on-chain trading, payments, and API calls. But most setups just hand the agent the private key and hope for the best. One prompt injection and your funds are gone.

## The Solution

KeyGate puts a policy-enforced sandbox between the agent and your secrets:

```
AI Agent ──→ Sandbox (policy engine) ──→ Plugin (executes with injected credential)
                ↑                             ↑
            Client CLI                   Credentials
          (you control)              (encrypted, in-memory only)
```

- **Agent** sees capabilities + limits, never sees keys
- **Sandbox** validates requests, enforces limits, checks plugin integrity
- **Client** (you) controls which keys can do what, with per-plugin limits
- **Plugins** are isolated scripts that perform the actual operations
- **Notification Channels** (Telegram, etc.) let you approve operations on the go

## Security Model

| Component | Sees Secrets | Can Execute | Can Change Permissions |
|-----------|:-----------:|:-----------:|:---------------------:|
| **You (CLI)** | ❌ | ❌ | ✅ |
| **Sandbox** | ✅ (in memory) | ✅ (with valid token) | ❌ |
| **AI Agent** | ❌ | ❌ (needs token) | ❌ |

Any single component being compromised is not enough to steal funds.

## Features

- 🔐 **AES-256-GCM encryption** with Argon2id KDF for all credentials at rest
- 🛡️ **JSON Schema validation** on every request before reaching plugins
- 🔍 **CHECKSUM integrity** verified at plugin load + before every execution
- 📊 **Two-layer limits**: per-plugin + global daily, per-transaction caps
- 🎫 **Token system**: persistent tokens for routine ops, one-time for sensitive actions
- 📝 **Full audit trail**: every action recorded in JSON Lines format
- 🔌 **Plugin system**: TypeScript + Python, isolated subprocess execution
- 📱 **Notification channels**: Telegram with inline approve/deny buttons, pluggable for more
- 🔑 **Multi-key, multi-plugin**: many-to-many binding between credentials and plugins

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/qimiaoguo/keygate.git
cd keygate
npm install
```

### 2. Start the Sandbox

```bash
# Minimal — no notification channels
npx tsx packages/core/src/bin/sandbox.ts \
  --data-dir ./data --plugin-dir ./plugins

# With Telegram notifications
npx tsx packages/core/src/bin/sandbox.ts \
  --data-dir ./data --plugin-dir ./plugins \
  --telegram-token "YOUR_BOT_TOKEN" \
  --telegram-chat-id "YOUR_CHAT_ID"
```

The sandbox starts **sealed** — credentials are encrypted on disk and cannot be used until you unseal.

**Ports:**
- `9800` — Agent API (AI agent talks here)
- `9801` — Client API (you manage keys/tokens/plugins here)

Both bind to `127.0.0.1` only.

### 3. Import a Key

```bash
# Via CLI
npx tsx packages/cli/src/cli.ts keys import my-sol-key crypto_key "Solana Trading" \
  --secret <hex-private-key> --password <encryption-password>

# Via API
curl -X POST http://127.0.0.1:9801/keys/import \
  -d '{"id":"my-sol-key","type":"crypto_key","label":"Solana Trading","secret":"<hex>","password":"<password>"}'
```

### 4. Unseal

```bash
echo "<password>" | npx tsx packages/cli/src/cli.ts unseal
```

After unseal, credentials are decrypted into memory and the sandbox is ready.

### 5. Configure Permissions

```bash
npx tsx packages/cli/src/cli.ts keys configure my-sol-key '{
  "solana-swap": {
    "dailyLimit": 500,
    "perTx": 100,
    "currency": "USDC"
  },
  "transfer": {
    "dailyLimit": 100,
    "perTx": 20,
    "currency": "USDC",
    "requireApproval": ["send-sol", "send-evm"]
  }
}'
```

- `dailyLimit` / `perTx` — spending caps
- `requireApproval` — actions that need a one-time token before execution
- `autoAllow` — actions that execute immediately with a valid persistent token

### 6. Agent Usage

```bash
# Discover what this key can do
curl http://127.0.0.1:9800/agent/capabilities?key=my-sol-key

# Execute a swap (auto-allowed)
curl -X POST http://127.0.0.1:9800/agent/execute \
  -d '{
    "plugin": "solana-swap",
    "action": "swap",
    "key": "my-sol-key",
    "params": {
      "from_token": "USDC",
      "to_token": "SOL",
      "amount": 50,
      "slippage_bps": 50
    }
  }'
```

---

## Approval Flow

When an action requires approval, the agent gets a `403`. It then requests user approval through notification channels:

```
Agent                         Sandbox                      You (Telegram/CLI)
  │                              │                              │
  │─── execute (transfer) ──────→│                              │
  │←── 403 approval_required ────│                              │
  │                              │                              │
  │─── request-approval ────────→│── push notification ────────→│
  │←── 202 { approvalId } ──────│                              │
  │                              │                              │
  │          (waiting)           │←──── ✅ Approve ────────────│
  │                              │   (one-time token issued)    │
  │                              │                              │
  │─── execute (retry) ─────────→│                              │
  │←── 200 { result } ──────────│                              │
```

### Via Telegram

```bash
curl -X POST http://127.0.0.1:9800/agent/request-approval \
  -d '{
    "plugin": "transfer",
    "action": "send-sol",
    "key": "my-sol-key",
    "params": {"to":"<address>","token":"SOL","amount":1},
    "reason": "Rebalance SOL for gas fees"
  }'
```

You receive a Telegram message with **✅ Approve** and **❌ Deny** inline buttons. One tap and the agent can retry.

Approval tokens are random, single-use, and expire in 5 minutes (configurable).

### Via CLI

```bash
npx tsx packages/cli/src/cli.ts approve my-sol-key transfer send-sol
```

---

## Notification Channels

Channels deliver approval requests and alerts to wherever you are.

### Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Get your chat ID (message the bot, then check `https://api.telegram.org/bot<TOKEN>/getUpdates`)
3. Start the sandbox with Telegram enabled:

```bash
# Via CLI flags
npx tsx packages/core/src/bin/sandbox.ts \
  --telegram-token "123456:ABC-DEF" \
  --telegram-chat-id "476373032"

# Or via environment variables
export KEYGATE_TELEGRAM_TOKEN="123456:ABC-DEF"
export KEYGATE_TELEGRAM_CHAT_ID="476373032"
npx tsx packages/core/src/bin/sandbox.ts
```

Multiple chat IDs supported (comma-separated).

**Bot commands:**

| Command | Description |
|---------|-------------|
| `/status` | Sandbox health (sealed, plugins, channels) |
| `/approve <id>` | Approve a pending request |
| `/deny <id>` | Deny a pending request |
| `/disable <keyId>` | Emergency disable a key |

**Security:** Telegram verifies the sender's user ID server-side. Only your authorized chat IDs can interact. Approval IDs are random and expire in 5 minutes.

### Adding More Channels

Channels are pluggable. Implement the `Channel` interface:

```typescript
interface Channel {
  name: string;
  start(onCommand: CommandHandler): Promise<void>;
  stop(): Promise<void>;
  notify(payload: NotificationPayload): Promise<void>;
  sendMessage(text: string): Promise<void>;
  isConnected(): boolean;
}
```

---

## Docker Deployment

```bash
docker compose up -d
```

```yaml
# docker-compose.yml
services:
  sandbox:
    build: .
    ports:
      - "127.0.0.1:9800:9800"   # Agent API
      - "127.0.0.1:9801:9801"   # Client API
    volumes:
      - keygate-data:/data
      - ./plugins:/plugins:ro   # Read-only
    environment:
      - NODE_ENV=production
      - KEYGATE_TELEGRAM_TOKEN=your-bot-token      # optional
      - KEYGATE_TELEGRAM_CHAT_ID=your-chat-id      # optional
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    ulimits:
      core: { soft: 0, hard: 0 }    # No core dumps (secrets in memory)
    mem_limit: 512m
    memswap_limit: 512m              # No swap

volumes:
  keygate-data:
```

**Post-deploy:**

```bash
# Import keys
docker compose exec sandbox npx tsx packages/cli/src/cli.ts keys import ...

# Unseal
docker compose exec sandbox npx tsx packages/cli/src/cli.ts unseal

# Configure
docker compose exec sandbox npx tsx packages/cli/src/cli.ts keys configure ...

# Verify
curl http://127.0.0.1:9800/agent/status
```

---

## CLI Reference

```
keygate status                              — Sandbox status
keygate unseal                              — Unseal credential store (reads password from stdin)

keygate keys list                           — List all keys (meta only, never secrets)
keygate keys import <id> <type> <label>     — Import a credential
keygate keys configure <id> <plugins-json>  — Set plugin authorizations + limits
keygate keys disable <id>                   — Emergency disable a key

keygate plugins list                        — List installed plugins + integrity status
keygate plugins toggle <name> <on|off>      — Enable/disable a plugin

keygate tokens list                         — List active authorization tokens
keygate tokens issue <keyId> <plugin>       — Issue a persistent token
keygate tokens revoke <id>                  — Revoke a token
keygate approve <keyId> <plugin> <action>   — One-time approval (120s TTL)

keygate exec <plugin> <action> <key> [json] — Execute via agent API (for testing)
keygate caps <keyId>                        — Show capabilities visible to agent
```

> CLI runs as: `npx tsx packages/cli/src/cli.ts <command>`

---

## Agent API

All endpoints on port `9800`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agent/capabilities?key=<id>` | Discover available plugins, actions, limits |
| `POST` | `/agent/execute` | Execute an action |
| `POST` | `/agent/request-approval` | Request user approval via notification channel |
| `GET` | `/agent/status` | Sandbox status (sealed, plugins, channels) |

### POST /agent/execute

```json
{
  "plugin": "solana-swap",
  "action": "swap",
  "key": "my-key",
  "params": { "from_token": "USDC", "to_token": "SOL", "amount": 50, "slippage_bps": 50 }
}
```

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `400` | Schema validation failed |
| `403` | `approval_required` / `plugin_not_authorized` / `no_valid_token` |
| `404` | Plugin or action not found |
| `429` | Limit exceeded (daily or per-tx) |

### POST /agent/request-approval

```json
{
  "plugin": "transfer",
  "action": "send-sol",
  "key": "my-key",
  "params": { "to": "...", "token": "SOL", "amount": 1 },
  "reason": "Optional human-readable reason"
}
```

Returns `202` with `approvalId`. Approval is pushed to all active notification channels. Agent retries `/agent/execute` after user approves.

### Client API

All endpoints on port `9801`. Used by CLI and automation.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/client/unseal` | Unseal credential store |
| `POST` | `/client/tokens/issue` | Issue a token |
| `POST` | `/client/tokens/revoke` | Revoke a token |
| `GET` | `/client/tokens` | List tokens |
| `POST` | `/client/approve-once` | Issue one-time approval |
| `GET` | `/client/channels` | List notification channels |
| `POST` | `/keys/import` | Import a credential |
| `GET` | `/keys/list` | List credentials (meta only) |
| `POST` | `/keys/configure` | Configure key-plugin bindings |

---

## Plugins

### Included

| Plugin | Description | Actions | Risk |
|--------|-------------|---------|:----:|
| `evm-swap` | DEX swap via Paraswap (Polygon/Arbitrum/BSC/ETH) | `quote`, `swap` | normal |
| `solana-swap` | DEX swap via Jupiter Ultra | `quote`, `swap` | normal |
| `transfer` | Send tokens to external addresses | `send-evm`, `send-sol`, `estimate-evm` | **elevated** |
| `mock-swap` | Testing plugin (no real execution) | `quote`, `swap` | normal |

### Writing Your Own

Create a directory in `plugins/`:

```
my-plugin/
  plugin.json          ← manifest
  package.json         ← { "type": "module" }
  schemas/
    my-action.json     ← JSON Schema for params
  my-action.ts         ← execution script
```

**plugin.json:**

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "capabilities": {
    "actions": [
      {
        "name": "my-action",
        "description": "Human-readable description",
        "risk": "normal",
        "schema": "schemas/my-action.json",
        "script": "my-action.ts"
      }
    ]
  }
}
```

**Execution script** receives environment variables:

| Variable | Content |
|----------|---------|
| `KEYGATE_CREDENTIAL` | The secret (hex-encoded) |
| `KEYGATE_PARAMS` | JSON string of validated parameters |

Output JSON to stdout:

```typescript
const params = JSON.parse(process.env.KEYGATE_PARAMS!);
const credential = process.env.KEYGATE_CREDENTIAL!;

// ... your logic ...

console.log(JSON.stringify({ success: true, txHash: "0x..." }));
```

The sandbox computes a SHA-256 CHECKSUM of every plugin file at load time and re-verifies before each execution. If any file is tampered with, execution is blocked.

Plugins support both TypeScript (via `tsx`) and Python (via `python3`).

---

## Project Structure

```
keygate/
├── packages/
│   ├── types/           ← shared TypeScript types
│   ├── core/            ← sandbox server
│   │   └── src/
│   │       ├── bin/sandbox.ts       ← entry point
│   │       ├── endpoints/           ← agent / client / keys APIs
│   │       ├── channels/            ← notification channels (Telegram, ...)
│   │       ├── plugin/              ← plugin loader + executor
│   │       ├── auth/                ← token manager + limit tracker
│   │       ├── audit/               ← JSON Lines audit log
│   │       └── crypto/              ← AES-256-GCM + Argon2id + Ed25519
│   └── cli/             ← client CLI
├── plugins/
│   ├── evm-swap/        ← Paraswap DEX
│   ├── solana-swap/     ← Jupiter Ultra
│   ├── transfer/        ← token transfers (elevated risk)
│   └── mock-swap/       ← testing
├── docs/
│   └── keygate-architecture.md  ← full design document
├── Dockerfile
├── docker-compose.yml
└── PLAN.md
```

---

## Architecture

See [docs/keygate-architecture.md](docs/keygate-architecture.md) for the full design covering:

- Three-party permission separation model
- Credential encryption strategies (sealed file / master key split / client-held)
- Plugin lifecycle and integrity verification
- Token and approval models
- Notification channel architecture
- Key ↔ Plugin many-to-many binding

---

## Roadmap

- [x] Core sandbox — credential store, plugin engine, auth tokens, limits
- [x] Three API surfaces — agent / client / keys endpoints
- [x] Schema validation + CHECKSUM integrity on every execution
- [x] CLI client — full key/token/plugin management
- [x] Telegram notification channel with inline approve/deny
- [x] Docker deployment with security hardening
- [ ] Client ↔ Sandbox pairing (Ed25519 key exchange)
- [ ] Master key split (client half + sandbox half)
- [ ] Discord / Slack / webhook channels
- [ ] Real plugin integrations (Jupiter, Paraswap, Hyperliquid)
- [ ] Python SDK for agent integration
- [ ] Web dashboard

## License

MIT
