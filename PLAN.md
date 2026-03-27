# KeyGate — MVP 开发计划

> 架构文档：~/.openclaw/workspace/docs/keygate-architecture.md

## 技术决策
- **核心语言**：TypeScript (Node.js)
- **密钥保护**：Rust (napi-rs) — mlock / zeroize
- **插件语言**：TS + Python
- **MVP 聚焦**：crypto（框架保留通用扩展能力）

---

## Step 1 — 骨架 + 密钥体系 ✅ (2026-03-28)
- [x] monorepo 初始化（types / core / plugins）
- [x] package.json + tsconfig + workspace 配置
- [x] Ed25519 密钥生成 + 签名/验证
- [x] AES-256-GCM 加密存储 + Argon2id KDF
- [x] CredentialManager: 加密文件 + 客户端解封
- [x] 沙盒双端口 server（agent:9800 / client:9801）
- [x] 三端点路由完整实现
- [x] TokenManager + LimitTracker + AuditLog
- [x] PluginManager（TS + Python 运行时）
- [x] Mock 插件端到端测试通过
- [ ] Rust napi 模块：SecureBuffer（mlock + zeroize）— 延后到 Step 5
- [ ] Ed25519 配对仪式（扫码交换公钥）— 延后，MVP 先信任 localhost

## Step 2 — 沙盒核心 ✅ (merged into Step 1)
已在 Step 1 中完成全部内容。

## Step 3 — 插件系统 + 执行器 ✅ (2026-03-28)
- [x] 插件加载器（plugin.json manifest）
- [x] JSON Schema 参数校验（ajv，per-action schemas）
- [x] TS 插件运行时（ESM + top-level await via tsx）
- [x] Python 插件运行时（subprocess）
- [x] CHECKSUM 完整性校验（加载时 + 执行前双重验证）
- [x] 凭证注入（KEYGATE_CREDENTIAL 环境变量）
- [x] 3 内置插件：evm-swap (Paraswap) / solana-swap (Jupiter Ultra) / transfer
- [x] 验收：schema 校验全通过，mock swap 执行成功，transfer 审批流正确

## Step 4 — CLI 客户端完整功能 ⬜
- [ ] keygate keys import / configure / authorize
- [ ] keygate plugins install / toggle
- [ ] keygate tokens issue / revoke
- [ ] keygate approve-once
- [ ] cli-direct 通道（终端审批）
- [ ] daemon 模式（常驻后台）
- [ ] 验收：完整链路「导入→授权→执行→超限拒绝→approve-once放行」

## Step 5 — Docker + 文档 + 自用 ⬜
- [ ] Dockerfile + docker-compose.yml
- [ ] 安全加固（read_only / cap_drop / seccomp）
- [ ] README.md（快速开始 + 架构概览）
- [ ] fund CLI 接入 KeyGate
- [ ] 验收：交易系统跑在 KeyGate 上

---

## 进度日志

### 2026-03-28: Step 1+2 完成
一口气把骨架、密钥体系、沙盒核心、三端点、插件系统都搭完了。
端到端测试通过：导入 key → 解封 → 配置授权 → 查看能力 → 执行 swap → 限额拒绝 → 未授权拒绝。
下一步：Step 3（真实插件 + 参数校验）

### 2026-03-28: Step 3 完成
- ajv JSON Schema 校验：缺字段/错枚举/多余属性/零金额/地址格式全拦住
- CHECKSUM 双重验证（加载 + 执行前）
- 3 个真实插件写完：evm-swap, solana-swap, transfer
- ESM 运行时搞定（插件 package.json type:module）
- 下一步：Step 4（CLI 客户端）
