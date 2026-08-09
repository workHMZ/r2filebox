# R2FileBox

[中文](#中文) | [English](#english) | [Latest Release](https://github.com/workHMZ/r2filebox/releases/latest)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/workHMZ/r2filebox)

---

## 中文

R2FileBox 是一个运行在 Cloudflare Workers 上的文件与文本分享服务。用户无需注册，通过提取码分享和获取内容；管理员可在后台查看文件、审计日志、运行状态和存储配置。

### 主要优势

- **Cloudflare 原生架构**：API 与 Vue 前端由 Workers 托管，文件进入私有 R2，元数据和配置进入 D1。
- **安全提取**：提取码使用 SHA-256 + Pepper 哈希，R2 对象不提供可绕过 Worker 的公开地址。
- **适合文件传输**：支持 R2 Multipart Upload、HTTP Range、ETag、断点续传和短期下载会话。
- **低维护成本**：自带定时清理、双层限流、审计日志、运行指标和管理后台。
- **完整客户端体验**：支持中文、English、日本語、PWA 安装和文本分享目标。

### 架构

#### 数据与授权流程

```text
上传文件 / 文本
    │
    ▼
Worker：校验、限流、生成随机提取码
    ├─ 正文 ─────────────────────────→ 私有 R2（随机对象键）
    └─ SHA-256(Pepper:提取码) + 元数据 ─→ D1（不保存提取码明文）

输入提取码 → Worker 重新哈希 → D1 查找分享并原子扣减提取次数
    ├─ 文本：Worker 从 R2 读取后返回
    └─ 文件：签发 15 分钟 JWT → Worker 从 R2 流式返回（Range / ETag）
```

这里采用的是服务端访问控制，不是端到端加密：Worker 必须能够读取正文才能返回内容。安全边界来自私有 R2、不可逆的提取码哈希、短期下载会话和只经过 Worker 的访问路径；如需端到端加密，应在上传前自行加密文件。

| 层级 | 技术 | 用途 |
|------|------|------|
| 边缘应用 | Hono + Cloudflare Workers | API、鉴权、安全头、流式下载、Cron 清理 |
| 对象存储 | Cloudflare R2 | 私有存储文件和文本正文 |
| 数据库 | Cloudflare D1 | 分享元数据、配置、上传会话、审计和精确限流 |
| 前端 | Vue 3 + Element Plus | 用户页面和管理后台，由 Workers Static Assets 托管 |
| 指标与防护 | Analytics Engine + Workers Rate Limiting | 轻量指标和边缘限流 |

### 测试与质量检查

```bash
npm run verify          # 配置、PWA 资源、多语言、类型检查、脚本测试和 Worker 测试
npm run deploy:dry-run  # 完整构建并验证 Wrangler 部署包，不上传
```

测试覆盖管理员鉴权、分享解析与下载、ETag、限流、存储计数、运行时配置、定时清理、指标、健康检查和版本信息。GitHub Actions 会在每次推送和 Pull Request 时运行相同检查。

### 部署

需要 Node.js `>=24.11.0 <25`，版本以 [.nvmrc](./.nvmrc) 为准。

#### 命令行部署（推荐）

```bash
npm run deploy:cf
```

首次运行会引导登录 Cloudflare、创建或绑定 R2/D1、设置管理员凭据和密钥、应用 D1 迁移并部署 Worker。后续运行会复用现有资源和密钥，只执行构建、迁移和部署。

#### Deploy to Cloudflare

点击顶部按钮，并确认构建配置为：

```text
Build command:  npm run build
Deploy command: npm run deploy
```

`npm run deploy` 会先应用 D1 迁移再部署 Worker，不要替换成单独的 `wrangler deploy`。首次部署需要配置：

| Secret | 要求 |
|--------|------|
| `ADMIN_PASSWORD` | 管理员密码，16–4096 字符 |
| `CODE_HASH_PEPPER` | 使用 `openssl rand -hex 32` 生成，设置后不要更换 |
| `SESSION_SECRET` | 使用 `openssl rand -hex 32` 生成，更换后已有会话失效 |

`ADMIN_USERNAME` 可选，默认为 `admin`。Turnstile 默认关闭，可在部署后从管理后台启用。

### 本地开发

```bash
cp .dev.vars.example .dev.vars   # 填写本地管理员密码和密钥
npm ci
npm run build
npm run db:migrate:local
npm run dev                       # http://localhost:8787
```

修改前端后重新运行 `npm run build`，Wrangler 会自动重新加载静态资源。

### 安全提示

- `.dev.vars`、管理员密码和生产密钥不得提交到 Git。
- `CODE_HASH_PEPPER` 更换后，已有提取码将无法验证。
- `SESSION_SECRET` 更换后，管理员和下载会话会失效。
- 公开部署建议结合 Cloudflare WAF，并按需要启用 Turnstile。

### 许可

本项目参考了 [FileCodeBox](https://github.com/vastsa/FileCodeBox) 的提取码交互设计及其 [Go 实现](https://github.com/zy84338719/FileCodeBox) 的部分思路，是独立的 Cloudflare Workers 实现。

**LGPL-3.0-or-later** · [LICENSE](./LICENSE) · [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

---

## English

R2FileBox is a file and text sharing service built for Cloudflare Workers. Users share and retrieve content with pickup codes—no registration required—while one admin console manages files, audit logs, runtime health, and storage configuration.

### Screenshots

| File sharing | Get a share |
|:---:|:---:|
| [![File sharing screen](./docs/screenshots/home-file-share.png)](./docs/screenshots/home-file-share.png) | [![Pickup code entry screen](./docs/screenshots/home-get-share.png)](./docs/screenshots/home-get-share.png) |
| **Share created** | **Pickup box** |
| [![Share created dialog](./docs/screenshots/share-created.png)](./docs/screenshots/share-created.png) | [![Shared file pickup screen](./docs/screenshots/pickup-file.png)](./docs/screenshots/pickup-file.png) |
| **Admin dashboard** | **Maintenance and storage** |
| [![Admin dashboard](./docs/screenshots/admin-dashboard.png)](./docs/screenshots/admin-dashboard.png) | [![Maintenance and storage screen](./docs/screenshots/admin-maintenance.png)](./docs/screenshots/admin-maintenance.png) |

### Highlights

- **Cloudflare-native**: the API and Vue frontend run on Workers, objects stay private in R2, and metadata lives in D1.
- **Code-based access**: pickup codes are SHA-256 + Pepper hashed, and R2 objects have no public bypass URL.
- **Transfer-friendly**: R2 Multipart Upload, HTTP Range, ETag, resume support, and short-lived download sessions.
- **Low maintenance**: scheduled cleanup, two-tier rate limiting, audit logs, operational metrics, and an admin console.
- **Complete client experience**: Chinese, English, Japanese, PWA installation, and a text share target.

### Architecture

#### Data and authorization flow

```text
Upload file / text
    │
    ▼
Worker: validate, rate-limit, and generate a random pickup code
    ├─ Body ───────────────────────────────→ private R2 (opaque object key)
    └─ SHA-256(Pepper:pickup code) + metadata → D1 (no plaintext code stored)

Enter code → Worker hashes it again → D1 finds the share and atomically consumes one pickup
    ├─ Text: Worker reads the R2 object and returns it
    └─ File: issue a 15-minute JWT → Worker streams from R2 (Range / ETag)
```

This is server-side access control, not end-to-end encryption: the Worker must be able to read content in order to serve it. Protection comes from private R2 storage, irreversible pickup-code hashing, short-lived download sessions, and routing access through the Worker. Encrypt files before upload if end-to-end encryption is required.

| Layer | Technology | Purpose |
|-------|------------|---------|
| Edge app | Hono + Cloudflare Workers | API, authentication, security headers, streaming, cron cleanup |
| Object storage | Cloudflare R2 | Private file and shared-text bodies |
| Database | Cloudflare D1 | Metadata, settings, upload sessions, audit logs, exact rate counters |
| Frontend | Vue 3 + Element Plus | Public UI and admin console through Workers Static Assets |
| Metrics and guard | Analytics Engine + Workers Rate Limiting | Lightweight events and edge throttling |

### Test Coverage

```bash
npm run verify          # config, PWA assets, i18n, types, scripts, and Worker tests
npm run deploy:dry-run  # full build and Wrangler bundle validation without upload
```

The suite covers admin authentication, share resolution and downloads, ETag behavior, rate limiting, storage accounting, runtime config, scheduled cleanup, metrics, health, and version reporting. GitHub Actions runs the same checks on every push and pull request.

### Deploy

Node.js `>=24.11.0 <25` is required; [.nvmrc](./.nvmrc) is the source of truth.

#### CLI (recommended)

```bash
npm run deploy:cf
```

The first run provisions or binds R2 and D1, configures admin credentials and secrets, applies D1 migrations, and deploys the Worker. Later runs preserve existing resources and secrets, then build, migrate, and deploy.

#### Deploy to Cloudflare

Use the button at the top and set:

```text
Build command:  npm run build
Deploy command: npm run deploy
```

`npm run deploy` applies D1 migrations before `wrangler deploy`. The first deployment requires `ADMIN_PASSWORD`, `CODE_HASH_PEPPER`, and `SESSION_SECRET`; `ADMIN_USERNAME` is optional and defaults to `admin`.

### Local Development

```bash
cp .dev.vars.example .dev.vars   # add local admin credentials and secrets
npm ci
npm run build
npm run db:migrate:local
npm run dev                       # http://localhost:8787
```

Run `npm run build` again after frontend changes; Wrangler will reload the generated static assets.

### Security

- Never commit `.dev.vars`, admin passwords, or production secrets.
- Rotating `CODE_HASH_PEPPER` invalidates existing pickup codes.
- Rotating `SESSION_SECRET` invalidates admin and download sessions.
- Public instances should consider Cloudflare WAF and enable Turnstile when appropriate.

### License

Inspired by [FileCodeBox](https://github.com/vastsa/FileCodeBox) and parts of its [Go implementation](https://github.com/zy84338719/FileCodeBox). This is an independent Cloudflare Workers implementation.

**LGPL-3.0-or-later** · [LICENSE](./LICENSE) · [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
