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

## Step 4 — CLI 客户端完整功能 ✅ (2026-03-28)
- [x] keygate keys import / configure / list / disable
- [x] keygate plugins list / toggle
- [x] keygate tokens issue / revoke / list
- [x] keygate approve（一次性审批）
- [x] keygate exec / caps / status
- [x] Flag 模式 + 交互模式双支持
- [x] 验收：完整链路「导入→解封→授权→执行→超限拒绝→approve-once放行→禁用」
- [ ] daemon 模式（常驻后台）— 延后，MVP 先手动操作

## Step 5 — Docker + 文档 ✅ (2026-03-28)
- [x] Dockerfile（multi-stage, non-root）
- [x] docker-compose.yml（read_only / cap_drop ALL / no-new-privileges / no swap / no core dump）
- [x] README.md（完整文档：问题/方案/安全模型/快速开始/CLI/插件指南）
- [ ] fund CLI 接入 KeyGate — Phase 2，需要改造现有交易脚本

## Step 6 — 通知通道 ✅ (2026-03-28)
- [x] Channel 抽象接口（notify / sendMessage / command handling）
- [x] TelegramChannel 实现（inline keyboard / long polling / authorized chat IDs）
- [x] ChannelManager（多通道广播 + 命令路由）
- [x] /agent/request-approval 端点（Agent → 通道 → 用户审批）
- [x] Pending approval 系统（5 分钟 TTL）
- [x] 环境变量 + CLI flag 双支持
- [ ] Discord channel — 需要时再加
- [ ] Slack channel — 需要时再加
- [ ] Webhook channel — 通用 HTTP 回调

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

### 2026-03-28: Step 4 完成
- CLI 完整实现：status, unseal, keys, plugins, tokens, approve, exec, caps
- Flag 模式 + 交互模式双支持
- 完整链路验证通过（14 步测试全过）

### 2026-03-28: Step 5 完成
- Docker 安全加固 + README 文档
- MVP 全部完成！
