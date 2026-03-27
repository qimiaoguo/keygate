# KeyGate

**AI Agent Secure Credential Sandbox** — Let AI agents use keys, API credentials, and payment secrets without ever touching them.

> ⚠️ Early development. Not production-ready.

## What is this?

AI agents are being used for on-chain trading, payments, and API calls. But most setups just hand the agent the private key and hope for the best.

KeyGate puts a policy-enforced sandbox between the agent and your secrets:

- **Agent** sees capabilities + limits, never sees keys
- **Sandbox** validates requests, enforces limits, injects credentials into isolated plugin scripts
- **Client** (you) controls which keys can do what, with per-plugin and per-key limits
- **Plugins** are isolated scripts that perform the actual operations

```
AI Agent ──→ Sandbox (policy engine) ──→ Plugin (executes with injected credential)
                ↑
            Client CLI (you control everything)
```

## Quick Start

```bash
# Start sandbox
npx tsx packages/core/src/bin/sandbox.ts

# Import a key (client port)
curl -X POST http://127.0.0.1:9801/keys/import \
  -H "Content-Type: application/json" \
  -d '{"id":"my-key","type":"crypto_key","label":"Trading","secret":"<hex>","password":"<pass>"}'

# Unseal
curl -X POST http://127.0.0.1:9801/client/unseal \
  -d '{"password":"<pass>"}'

# Configure key permissions
curl -X POST http://127.0.0.1:9801/keys/configure \
  -d '{"keyId":"my-key","plugins":{"evm-swap":{"dailyLimit":500,"perTx":100,"currency":"USDC"}}}'

# Agent discovers capabilities
curl http://127.0.0.1:9800/agent/capabilities?key=my-key

# Agent executes
curl -X POST http://127.0.0.1:9800/agent/execute \
  -d '{"plugin":"evm-swap","action":"swap","key":"my-key","params":{"from":"USDC","to":"ETH","amount":50}}'
```

## Architecture

See [docs/keygate-architecture.md](docs/keygate-architecture.md) for the full design.

## License

MIT
