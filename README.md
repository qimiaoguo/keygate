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
- **Notification Channels** (Telegram, Discord, etc.) let you approve operations on the go

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
- 📱 **Notification channels**: Telegram (with inline approve/deny buttons), more coming
- 🔑 **Multi-key, multi-plugin**: many-to-many binding between credentials and plugins

---

## Quick Start (Local)

### 1. Clone & Install

```bash
git clone https://github.com/user/keygate.git
cd keygate
npm install
npm run build
```

### 2. Start the Sandbox

```bash
# Minimal (no notification channels)
npx tsx packages/core/src/bin/sandbox.ts

# With Telegram notifications
npx tsx packages/core/src/bin/sandbox.ts \
  --telegram-token "YOUR_BOT_TOKEN" \
  --telegram-chat-id "YOUR_CHAT_ID"

# Custom ports and directories
npx tsx packages/core/src/bin/sandbox.ts \
  --agent-port 9800 \
  --client-port 9801 \
  --data-dir ./data \
  --plugin-dir ./plugins
```

The sandbox starts **sealed** — credentials are encrypted on disk and cannot be used until you unseal.

### 3. Import a Key

```bash
# Via CLI
npx tsx packages/cli/src/cli.ts keys import my-sol-key crypto_key "Solana Trading" \
  --secret <hex-private-key> --password <encryption-password>

# Or via API
curl -X POST http://127.0.0.1:9801/keys/import \
  -d '{"id":"my-sol-key","type":"crypto_key","label":"Solana Trading","secret":"<hex>","password":"<password>"}'
```

### 4. Unseal the Vault

```bash
echo "<password>" | npx tsx packages/cli/src/cli.ts unseal

# Or via API
curl -X POST http://127.0.0.1:9801/client/unseal -d '{"password":"<password>"}'
```

After unseal, credentials are decrypted into memory. The sandbox is now ready to serve agent requests.

### 5. Configure Permissions

Tell the sandbox which plugins each key can use, with what limits:

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
    "requireApproval": ["send-sol"]
  }
}'
```

- `dailyLimit` / `perTx` — spending caps
- `requireApproval` — these actions need a one-time token before execution
- `autoAllow` — these actions execute immediately with a valid persistent token

### 6. Agent Usage

Your AI agent talks to `http://127.0.0.1:9800` (agent port):

```bash
# Discover capabilities
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

# Execute a transfer (requires approval → returns 403)
curl -X POST http://127.0.0.1:9800/agent/execute \
  -d '{
    "plugin": "transfer",
    "action": "send-sol",
    "key": "my-sol-key",
    "params": {"to":"<address>","token":"SOL","amount":1}
  }'
# → 403 {"error":"approval_required"}
```

---

## Approval Flow

When an action requires approval, the agent gets a 403. It can then request user approval:

```
Agent                         Sandbox                      You (Telegram/CLI)
  │                              │                              │
  │─── execute (transfer) ──────→│                              │
  │←── 403 approval_required ────│                              │
  │                              │                              │
  │─── request-approval ────────→│── notification ─────────────→│
  │←── 202 { approvalId } ──────│                              │
  │                              │                              │
  │          (waiting)           │←── ✅ Approve ──────────────│
  │                              │    (issues one-time token)   │
  │                              │                              │
  │─── execute (retry) ─────────→│                              │
  │←── 200 { result } ──────────│                              │
```

### Via Telegram

```bash
# Agent requests approval
curl -X POST http://127.0.0.1:9800/agent/request-approval \
  -d '{
    "plugin": "transfer",
    "action": "send-sol",
    "key": "my-sol-key",
    "params": {"to":"<address>","token":"SOL","amount":1},
    "reason": "Rebalance SOL for gas fees"
  }'
```

You receive a Telegram message with **✅ Approve** and **❌ Deny** buttons. One tap, done.

### Via CLI

```bash
# List pending approvals
npx tsx packages/cli/src/cli.ts tokens list

# Approve manually
npx tsx packages/cli/src/cli.ts approve my-sol-key transfer send-sol
```

---

## Notification Channels

Channels let you receive alerts and approve operations from anywhere.

### Telegram Setup

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Get your chat ID (send a message to the bot, then check `https://api.telegram.org/bot<TOKEN>/getUpdates`)
3. Start the sandbox with:

```bash
# Via flags
npx tsx packages/core/src/bin/sandbox.ts \
  --telegram-token "123456:ABC-DEF" \
  --telegram-chat-id "476373032"

# Or via environment variables
export KEYGATE_TELEGRAM_TOKEN="123456:ABC-DEF"
export KEYGATE_TELEGRAM_CHAT_ID="476373032"
npx tsx packages/core/src/bin/sandbox.ts
```

**Telegram bot commands:**
- `/status` — sandbox health check
- `/approve <id>` — approve a pending request
- `/deny <id>` — deny a pending request
- `/disable <keyId>` — emergency disable a key

**Security**: Telegram verifies the sender's user ID server-side. Only your authorized chat IDs can interact with the bot. Approval IDs are random and expire in 5 minutes.

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

Planned: Discord, Slack, generic webhook.

---

## Docker Deployment

### docker-compose (recommended)

```bash
# Copy and edit
cp docker-compose.yml docker-compose.override.yml
# Set KEYGATE_TELEGRAM_TOKEN and KEYGATE_TELEGRAM_CHAT_ID

docker compose up -d
```

```yaml
# docker-compose.yml
services:
  keygate:
    build: .
    ports:
      - "127.0.0.1:9800:9800"  # Agent API (localhost only!)
      - "127.0.0.1:9801:9801"  # Client API (localhost only!)
    volumes:
      - keygate-data:/app/data
      - ./plugins:/app/plugins:ro    # Plugins are read-only
    environment:
      - NODE_ENV=production
      - KEYGATE_TELEGRAM_TOKEN=your-bot-token
      - KEYGATE_TELEGRAM_CHAT_ID=your-chat-id
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

volumes:
  keygate-data:
```

**Important**: Both ports bind to `127.0.0.1` only. Never expose them to the internet.

### Post-deploy Checklist

```bash
# 1. Import keys
docker compose exec keygate keygate-cli keys import ...

# 2. Unseal
docker compose exec keygate keygate-cli unseal

# 3. Configure permissions
docker compose exec keygate keygate-cli keys configure ...

# 4. Verify
curl http://127.0.0.1:9800/agent/status
```

---

## CLI Reference

```
keygate status                                — Sandbox status
keygate unseal                                — Unseal credential store (reads password from stdin)

keygate keys list                             — List all keys
keygate keys import <id> <type> <label>       — Import a credential
keygate keys configure <id> <plugins-json>    — Set plugin authorizations + limits
keygate keys disable <id>                     — Emergency disable a key

keygate plugins list                          — List installed plugins
keygate plugins toggle <name> <on|off>        — Enable/disable a plugin

keygate tokens list                           — List active tokens
keygate tokens issue <keyId> <plugin>         — Issue a persistent token
keygate tokens revoke <id>                    — Revoke a token
keygate approve <keyId> <plugin> <action>     — Issue one-time approval (120s TTL)

keygate exec <plugin> <action> <key> [json]   — Execute directly (for testing)
keygate caps <keyId>                          — Show capabilities for a key
```

---

## Agent API Reference

All endpoints on port `9800` (agent port).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/agent/capabilities?key=<id>` | Discover available plugins, actions, limits |
| `POST` | `/agent/execute` | Execute an action |
| `POST` | `/agent/request-approval` | Request user approval via notification channel |
| `GET` | `/agent/status` | Sandbox status (sealed, plugins, channels) |

### POST /agent/execute

```json
{
  "plugin": "evm-swap",
  "action": "swap",
  "key": "my-key",
  "params": { "chain": "polygon", "from_token": "USDC", "to_token": "ETH", "amount": 50 }
}
```

**Responses:**
- `200` — executed successfully
- `400` — bad params (schema validation failed)
- `403` — `approval_required` or `plugin_not_authorized`
- `404` — plugin or action not found
- `429` — limit exceeded

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

Returns `202` with `approvalId`. User approves via Telegram/CLI → agent retries `/agent/execute`.

---

## Included Plugins

| Plugin | Description | Actions | Default Risk |
|--------|-------------|---------|:------------:|
| `evm-swap` | DEX swap via Paraswap (ETH/Polygon/Arbitrum/BSC) | `quote`, `swap` | normal |
| `solana-swap` | DEX swap via Jupiter Ultra | `quote`, `swap` | normal |
| `transfer` | Send tokens to external addresses | `send-evm`, `send-sol` | **elevated** |
| `mock-swap` | Testing plugin (no real execution) | `quote`, `swap` | normal |

---

## Writing Plugins

Create a directory in `plugins/`:

```
my-plugin/
  plugin.json          ← manifest
  schemas/
    my-action.json     ← JSON Schema for params validation
  my-action.ts         ← execution script
  package.json         ← { "type": "module" }
```

### plugin.json

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

### Execution Script

Your script receives environment variables:
- `KEYGATE_CREDENTIAL` — the secret (hex-encoded, injected by sandbox)
- `KEYGATE_PARAMS` — JSON string of validated parameters

Output JSON to stdout:

```typescript
const params = JSON.parse(process.env.KEYGATE_PARAMS!);
const credential = process.env.KEYGATE_CREDENTIAL!;

// ... do your thing ...

console.log(JSON.stringify({ success: true, txHash: "0x..." }));
```

The sandbox verifies the plugin's CHECKSUM before every execution. If someone tampers with the script, execution is blocked.

---

## Architecture

See [docs/keygate-architecture.md](docs/keygate-architecture.md) for the full design document covering:

- Three-party permission separation
- Credential encryption strategies (sealed file / master key split / client-held)
- Plugin lifecycle and integrity verification
- Token and approval models
- Notification channel architecture

---

## Roadmap

- [x] Core sandbox (credential store, plugin engine, auth tokens)
- [x] Agent + Client + Keys API endpoints
- [x] Schema validation + CHECKSUM integrity
- [x] CLI client
- [x] Telegram notification channel with inline approval
- [ ] Discord / Slack channels
- [ ] Client ↔ Sandbox pairing (Ed25519 key exchange)
- [ ] Master key split (client half + sandbox half)
- [ ] Real plugin integrations (Jupiter, Paraswap, Hyperliquid)
- [ ] Python SDK for agent integration
- [ ] Web dashboard

## License

MIT
