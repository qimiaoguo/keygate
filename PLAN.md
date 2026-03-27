# KeyGate — MVP 开发计划

> 架构文档：~/.openclaw/workspace/docs/keygate-architecture.md

## 技术决策
- **核心语言**：TypeScript (Node.js)
- **密钥保护**：Rust (napi-rs) — mlock / zeroize
- **插件语言**：TS + Python
- **MVP 聚焦**：crypto（框架保留通用扩展能力）

---

## Step 1 — 骨架 + 密钥体系 ⬜
- [ ] monorepo 初始化（core / cli / plugins / rust-crypto）
- [ ] package.json + tsconfig + workspace 配置
- [ ] Ed25519 配对流程（sandbox_pk ↔ client_pk 交换）
- [ ] Rust napi 模块：SecureBuffer（mlock + zeroize）
- [ ] 凭证存储：Strategy A（AES-256-GCM 加密文件 + 客户端解封）
- [ ] 验收：`keygate sandbox start` + `keygate cli init` 配对成功

## Step 2 — 沙盒核心 ⬜
- [ ] 双 Unix socket server（agent.sock / client.sock）
- [ ] 三端点路由（/agent /client /keys）
- [ ] Key 配置模型（授权列表 + 两层限额）
- [ ] JSON Schema 校验
- [ ] 审计日志（JSON lines）
- [ ] 验收：curl 调 /agent/capabilities 看到 mock 插件

## Step 3 — 插件系统 + 执行器 ⬜
- [ ] 插件加载器（读 plugin.yaml + schema.json）
- [ ] TS 插件运行时
- [ ] Python 插件运行时
- [ ] CHECKSUM 完整性校验
- [ ] 凭证注入（环境变量）
- [ ] 3 内置插件：evm-swap / solana-swap / transfer
- [ ] 验收：/agent/execute 执行一笔真实 swap

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

（每步完成后记录）
