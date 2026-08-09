# R2FileBox

[中文](#中文) | [English](#english) | [Latest Release](https://github.com/workHMZ/r2filebox/releases/latest)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/workHMZ/r2filebox)

---

## 中文

一个运行在 Cloudflare 边缘网络上的匿名文件与文本分享服务。用户通过提取码存取内容，管理员通过后台管理一切。没有注册流程，没有用户系统，部署完成即可使用。

### 它是怎么工作的

```
用户上传文件 ──→ Worker 分片写入 R2 ──→ 生成提取码（明文仅返回一次）
                       │                         │
                       ▼                         ▼
                D1 存储哈希后的提取码      R2 以不透明随机路径存储原始文件
                       │
                       ▼
用户输入提取码 ──→ Worker 比对哈希 ──→ 签发 15 分钟下载会话 ──→ 流式返回文件
```

提取码经过 SHA-256 + Pepper 哈希后存入 D1，明文永远不落库。文件存储在私有 R2 Bucket 中，不需要开启公开访问。下载通过短期 JWT 会话完成，R2 对象不会暴露为可绕过 Worker 的公开地址。

### 技术栈

| 层级 | 技术 | 职责 |
|------|------|------|
| **API** | Hono on Workers | 路由、鉴权、安全头、Cron 清理 |
| **数据库** | Cloudflare D1 | 分享元数据、上传会话、配置、审计日志、原子限流计数 |
| **存储** | Cloudflare R2 | 文件（Multipart Upload）和文本的对象存储 |
| **前端** | Vue 3 + Element Plus | SPA，由 Workers Static Assets 托管 |
| **指标** | Analytics Engine | 选定的创建和提取事件，不消耗 D1 写入配额 |
| **限流** | Native Rate Limiting + D1 | 边缘粗粒度拦截 + 全局精确计数双层防护 |

### 关键设计

**分片上传**：大文件通过 R2 Multipart Upload 分片传输。每个上传会话签发 HMAC JWT Token，包含 session/upload/r2_key 等信息。分片上传结束后，Worker 在一个 D1 事务中同时插入 share 记录并删除上传会话预留，保证存储配额计数的原子性。

**下载会话**：解析提取码时一次性扣减下载次数并签发 15 分钟 JWT 下载会话。会话有效期内所有 Range 请求（视频拖拽、断点续传）不再消耗下载次数和 D1 写操作。支持 HTTP 206 Range 和 ETag 条件请求。

**双层限流**：公开接口先经过 Cloudflare Native Rate Limiting（边缘位置的低开销粗粒度保护），再经过 D1 原子计数器精确执行管理员配置的全局限额。管理员登录仅使用 D1 精确限流，不走 Native 层。

**定时清理**：每小时 Cron Trigger 自动清理过期分享、失效上传会话、历史日志和过期限流计数器。清理结果中若有失败项，会在 Cloudflare Past Events 中标记为失败。

**PWA 分享目标**：安装为 Web App 后可接收系统分享菜单中的文本、标题和链接，并自动填入文本分享页；当前不会声明或接收文件分享目标。

### 部署

#### 方式一：命令行部署（推荐）

前置条件：Node.js `>=24.11.0 <25`（见 `.nvmrc`），已登录 Wrangler。

```bash
npm run deploy:cf
```

首次部署时，脚本会自动完成以下全部步骤：

1. 安装依赖并检查 Wrangler 登录状态
2. 创建或绑定 R2 Bucket 和 D1 数据库
3. 将实际的 D1 database_id 写入 `wrangler.toml`
4. 构建前端并应用 D1 数据库迁移
5. 交互式设置管理员密码（留空则自动生成强密码并显示一次）
6. 自动生成 `CODE_HASH_PEPPER` 和 `SESSION_SECRET`
7. 部署 Worker

**后续升级**再次运行 `npm run deploy:cf`；脚本检测到已有 D1 绑定后会要求确认，确认后仅执行构建、迁移和部署，不会重新创建资源或修改密钥。

#### 方式二：Deploy to Cloudflare 按钮

点击本页顶部的 **Deploy to Cloudflare** 按钮。在部署配置页中：

- **Build command**：`npm run build`
- **Deploy command**：`npm run deploy`（⚠️ 如果页面默认显示 `npx wrangler deploy`，务必改为 `npm run deploy`，否则数据库迁移不会执行）

需要填写的 Secrets：

| Secret | 说明 |
|--------|------|
| `ADMIN_PASSWORD` | 管理员密码，16–4096 字符 |
| `CODE_HASH_PEPPER` | `openssl rand -hex 32` 生成，**不可更换**（否则已有提取码失效） |
| `SESSION_SECRET` | `openssl rand -hex 32` 生成，更换后已有会话失效 |

`ADMIN_USERNAME` 可选，默认为 `admin`。Turnstile 默认关闭，部署后可在管理后台启用。

#### 方式三：本地开发

```bash
cp .dev.vars.example .dev.vars   # 填入密码和密钥
npm ci
npm run build
npm run db:migrate:local
npm run dev                       # → http://localhost:8787
```

### 验证

```bash
npm run verify    # 类型检查 + 配置/多语言/资源校验 + 全部测试
npm run deploy:dry-run   # 构建并模拟部署（不上传）
```

### 安全要点

- 提取码哈希使用 SHA-256 + Pepper，`CODE_HASH_PEPPER` 一旦设置就不应更换
- `SESSION_SECRET` 用于签发所有 JWT（管理员会话、下载会话、上传 Token），更换后全部失效
- 静态页和 API 响应携带 CSP、X-Frame-Options、X-Content-Type-Options 等安全头
- 多实例部署时，给每个实例的 Rate Limiting binding 分配不同的 `namespace_id`
- 高流量场景建议额外配合 Cloudflare WAF 规则和 Turnstile 人机验证

### 项目结构

```
r2filebox/
├── frontend/              Vue 3 + Vite + Element Plus
│   ├── src/views/         页面组件
│   └── src/components/    可复用组件
├── worker/
│   ├── src/routes/        API 路由 (share / admin / health / config / version)
│   ├── src/lib/           核心逻辑 (db / r2 / auth / rate-limit / cleanup / ...)
│   ├── migrations/        D1 SQL 迁移
│   └── test/              Vitest + Cloudflare Workers 运行时测试
├── scripts/               部署与校验脚本
└── wrangler.toml          Worker 配置、绑定与默认参数
```

### 致谢与许可

本项目参考了 [FileCodeBox](https://github.com/vastsa/FileCodeBox) (LGPL-3.0) 的提取码交互设计，以及其 [Go 实现](https://github.com/zy84338719/FileCodeBox) (MIT) 的部分管理后台和分片上传思路。本项目是独立的 Cloudflare Workers 实现，不是 FileCodeBox 官方版本。

**LGPL-3.0-or-later** · [LICENSE](./LICENSE) · [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

---

## English

A file and text sharing service running on Cloudflare's edge network. Users exchange content through extraction codes. One admin account controls everything. No sign-ups, no user management — deploy and go.

### How It Works

```
Upload file ──→ Worker chunks to R2 ──→ Returns extraction code (shown once)
                     │                           │
                     ▼                           ▼
              D1 stores hashed code      R2 stores file at opaque key
                     │
                     ▼
Enter code ──→ Worker matches hash ──→ Issues 15-min download session ──→ Streams file
```

Extraction codes are SHA-256 + Pepper hashed before storage — plaintext never touches the database. Files live in a private R2 bucket with no public access. Downloads go through short-lived JWT sessions, and R2 objects are not exposed through public URLs that bypass the Worker.

### Stack

| Layer | Technology | Role |
|-------|-----------|------|
| **API** | Hono on Workers | Routing, auth, security headers, cron cleanup |
| **Database** | Cloudflare D1 | Share metadata, upload sessions, config, audit logs, atomic rate counters |
| **Storage** | Cloudflare R2 | Object storage for multipart-uploaded files and text |
| **Frontend** | Vue 3 + Element Plus | SPA served by Workers Static Assets |
| **Metrics** | Analytics Engine | Selected creation and extraction events without D1 writes |
| **Rate Limiting** | Native + D1 | Edge-level coarse guard + globally exact counters |

### Key Design Decisions

**Chunked uploads** use R2 Multipart Upload. Each upload session carries an HMAC-signed JWT token. On completion, the Worker atomically inserts the share record and deletes the upload reservation in one D1 batch, keeping storage accounting consistent.

**Download sessions** decouple code resolution from file transfer. Resolving a code consumes a download slot once and issues a 15-minute JWT. Within that window, all Range requests (video seeking, resume) cost zero additional download slots or D1 writes. HTTP 206 Range and ETag conditional requests are fully supported.

**Two-tier rate limiting**: public endpoints pass through Cloudflare Native Rate Limiting as a low-overhead, coarse per-location guard, then D1 atomic counters enforce the exact admin-configured global limits. Admin login uses only the exact D1 tier.

**Scheduled cleanup** runs hourly via Cron Triggers — expired shares, stale upload sessions, old audit logs, and rate-limit counters. Partial failures surface as failed invocations in Cloudflare Past Events.

**PWA share target** accepts text, titles, and links from the system share sheet after installation and pre-fills the text-sharing form. It intentionally does not declare or accept file share targets.

### Deploy

#### Option A: CLI (Recommended)

Prerequisites: Node.js `>=24.11.0 <25` (see `.nvmrc`), logged into Wrangler.

```bash
npm run deploy:cf
```

On first run, the script handles everything: dependency install, R2/D1 provisioning, `wrangler.toml` patching, frontend build, D1 migrations, interactive password setup (or auto-generation), secret creation, and deployment. On subsequent runs, an existing D1 binding triggers a confirmation prompt; after confirmation, the script only builds, migrates, and deploys without changing secrets.

#### Option B: Deploy Button

Click the **Deploy to Cloudflare** button at the top. On the config page:

- **Build command**: `npm run build`
- **Deploy command**: `npm run deploy` (⚠️ replace the default `npx wrangler deploy` — otherwise migrations won't run)

Required secrets:

| Secret | Notes |
|--------|-------|
| `ADMIN_PASSWORD` | 16–4,096 characters |
| `CODE_HASH_PEPPER` | `openssl rand -hex 32` — **never rotate** (breaks existing codes) |
| `SESSION_SECRET` | `openssl rand -hex 32` — rotation invalidates all sessions |

`ADMIN_USERNAME` is optional (defaults to `admin`). Turnstile is off by default; enable it in the admin panel after deployment.

#### Option C: Local Development

```bash
cp .dev.vars.example .dev.vars   # fill in password and secrets
npm ci
npm run build
npm run db:migrate:local
npm run dev                       # → http://localhost:8787
```

### Verification

```bash
npm run verify          # type checks + config/i18n/asset validation + all tests
npm run deploy:dry-run  # build and simulate deploy (no upload)
```

### Security Notes

- Extraction codes are hashed with SHA-256 + Pepper; `CODE_HASH_PEPPER` must never be rotated
- `SESSION_SECRET` signs all JWTs (admin sessions, download sessions, upload tokens); rotation invalidates everything
- Responses include CSP, X-Frame-Options, X-Content-Type-Options, and cache-control headers
- Multi-instance deployments should assign distinct `namespace_id` values to each Rate Limiting binding
- High-traffic instances should additionally enable Cloudflare WAF rules and Turnstile

### Acknowledgements & License

Inspired by [FileCodeBox](https://github.com/vastsa/FileCodeBox) (LGPL-3.0) and its [Go implementation](https://github.com/zy84338719/FileCodeBox) (MIT). This is an independent Cloudflare Workers implementation, not an official FileCodeBox release.

**LGPL-3.0-or-later** · [LICENSE](./LICENSE) · [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
