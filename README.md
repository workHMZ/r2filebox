# R2FileBox

[中文](#中文说明) | [English](#english)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/workHMZ/r2filebox)

R2FileBox is a minimal Cloudflare-native file/text sharing app inspired by the FileCodeBox family of projects. It keeps the extraction-code workflow, but replaces the original server stack with Cloudflare Workers, Workers Static Assets, D1, KV, and R2.

## 中文说明

### 项目简介

R2FileBox 是一个简单的匿名文本/文件分享工具：访客上传文字或文件，系统生成提取码；管理员只有一个后台账号，用来查看、删除、清理和调整运行配置。

本项目参考了 FileCodeBox 系列项目的产品形态和交互思路，是面向 Cloudflare 全托管架构的独立 TypeScript / Workers 变体。

### 功能

- 匿名文本分享和匿名文件分享。
- 提取码访问，D1 只保存提取码哈希，不保存明文提取码。
- 文件和大文本存储在 R2，R2 bucket 不需要公开访问。
- 文件使用 R2 multipart upload，前端按分片上传，支持断点续传。
- KV 固定窗口限流覆盖公开接口，后台登录使用 D1 强一致限流。
- 单管理员后台，无用户注册和平台用户系统。
- 管理后台可调整上传限制、访问日志、Turnstile、限流等运行配置。
- 下载使用短期 token，R2 key 和对象地址不会暴露给用户。
- 定时任务自动清理过期分享和过期上传会话。
- Workers Static Assets 直接提供带内容哈希的前端资源；动态 API 全部禁止缓存。

### 架构

```text
frontend/        Vue 3 + Vite 前端
worker/src/      Hono + TypeScript Worker API
worker/migrations/ D1 数据库迁移
scripts/         本地 Cloudflare 一键部署脚本
wrangler.toml    Cloudflare Worker 根配置
```

Cloudflare 资源：

- Workers：API、静态资源托管、定时清理。
- Workers Static Assets：前端产物。
- D1：分享元数据、上传会话、运行配置、审计/限流记录。
- R2：文件内容和大文本内容。
- KV：低成本限流计数。

### GitHub 一键部署

点击顶部 **Deploy to Cloudflare** 按钮即可从 GitHub 部署。

本仓库的 `wrangler.toml` 放在仓库根目录，Cloudflare Deploy Button 能直接读取 D1/R2/KV 绑定并在部署流程中创建或绑定资源。部署时请配置这些 secret：

- `ADMIN_PASSWORD`：管理员登录密码，必须至少 16 位，推荐使用随机字符串。
- `CODE_HASH_PEPPER`：提取码哈希 pepper。
- `SESSION_SECRET`：后台会话和下载 token 签名密钥。
- `TURNSTILE_SECRET_KEY`：可选，仅启用 Turnstile 时需要。

高级用法：如果你不想保存明文后台密码 secret，可以改用 `ADMIN_PASSWORD_HASH`。它会优先于 `ADMIN_PASSWORD` 生效。
管理员用户名默认为 `admin`，可通过 `ADMIN_USERNAME` secret 修改。

如果一键部署页面没有自动填入配置，说明 GitHub 端还不是最新代码，先确认仓库根目录存在 `wrangler.toml` 和 `package.json` 的 `build`/`deploy` 脚本。

### 本地一键部署

首次部署可以在项目根目录运行：

```bash
npm run deploy:cf
```

脚本会执行：

- 安装根目录和前端依赖。
- 检查 Wrangler 登录状态。
- 创建或复用 R2 bucket、D1 database、KV namespace。
- 将真实 D1/KV ID 写入本地 `wrangler.toml`。
- 生成并上传 Cloudflare Secrets。
- 构建前端。
- 执行 D1 migration。
- 部署 Worker。

如果你有多个 Cloudflare 账号，脚本会要求选择；也可以提前指定：

```bash
export CLOUDFLARE_ACCOUNT_ID="你的 account id"
npm run deploy:cf
```

### 手动部署

```bash
npm install
npm --prefix frontend ci
npm run build

npx wrangler login
npx wrangler r2 bucket create r2filebox-files
npx wrangler d1 create r2filebox-db
npx wrangler kv namespace create r2filebox-rate-limit
```

把 `wrangler d1 create` 输出的 `database_id` 写入根目录 `wrangler.toml`，把 `wrangler kv namespace create` 输出的 `id` 写入 `RATE_LIMIT`。

设置 secret：

```bash
npx wrangler secret put ADMIN_PASSWORD
openssl rand -hex 32 | npx wrangler secret put CODE_HASH_PEPPER
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
```

如果使用哈希登录，先生成哈希：

```bash
npm run hash-password
npx wrangler secret put ADMIN_PASSWORD_HASH
```

执行迁移并部署：

```bash
npm run deploy
```

### 本地开发

创建 `.dev.vars`：

```bash
cp .dev.vars.example .dev.vars
```

把 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`CODE_HASH_PEPPER` 和 `SESSION_SECRET` 写入 `.dev.vars`，然后运行：

```bash
npm install
npm --prefix frontend ci
npm run build
npm run db:migrate:local
npm run dev
```

访问 `http://localhost:8787`。

### 验证

```bash
npm run typecheck
npm run deploy:dry-run
```

`deploy:dry-run` 会构建前端并执行 `wrangler deploy --dry-run`，用于检查 Worker 配置和静态资源绑定是否可部署。

### 安全和免费层注意

- 默认单文件 50MB，硬限制不建议超过 Cloudflare Workers/R2 免费层适合的范围。
- R2 bucket 不要开启 public access，也不要绑定公开自定义域名。
- 默认关闭详细访问日志，减少 D1 写入。
- KV 限流是低成本固定窗口限流，不是强一致计数；公开服务建议叠加 Cloudflare WAF 速率限制和 Turnstile。
- 文本请求体限制为 1MiB；文件分片在流式写入 R2 时按会话声明大小逐字节校验。
- 文件上传会话和文本分享通过 D1 原子写入共同受总存储上限约束，避免并发请求绕过软限制。
- 静态页面和 API 都设置了 CSP、禁止嵌入、MIME 嗅探防护和严格缓存策略。
- 启用 Turnstile 前，需要在后台填写 Site Key，并配置 `TURNSTILE_SECRET_KEY` secret。
- 不要提交 `.dev.vars`、真实 secret、私钥或 Cloudflare API token。
- `wrangler.toml` 中的 D1/KV ID 对公开仓库不是密码，但模板仓库应保留占位值，真实 ID 只留在你自己的部署副本里。

### 致谢与许可证

本项目不是 FileCodeBox 官方版本，也不把上游仓库作为 vendor/submodule 发布。它参考并致谢：

- [vastsa/FileCodeBox](https://github.com/vastsa/FileCodeBox)：原始 FileCodeBox 项目，基于 FastAPI + Vue3，许可证为 LGPL-3.0。
- [zy84338719/FileCodeBox](https://github.com/zy84338719/FileCodeBox)：FileCodeBox 的 Go 实现，本项目的部分改造目标、管理后台和分片上传思路参考了该版本，许可证为 MIT。

本项目采用 LGPL-3.0-or-later。许可证全文见 [LICENSE](./LICENSE)。

如果现有或后续改动包含从上游项目移植的实质性代码片段，请同时保留对应上游项目的版权声明和许可证文本；当前仓库的第三方致谢见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## English

### Overview

R2FileBox is a small anonymous file/text sharing app for Cloudflare. Visitors upload text or files and receive extraction codes. A single admin account manages shares, settings, cleanup, and abuse controls.

This project references the FileCodeBox family of projects, but is an independent Cloudflare Workers implementation rather than an official FileCodeBox release.

### Features

- Anonymous text and file sharing.
- Extraction-code access; D1 stores code hashes, not raw codes.
- Files and large text payloads are stored in R2.
- Resumable multipart upload backed by R2.
- KV fixed-window rate limiting for public endpoints and D1-backed strict throttling for admin login.
- Single-admin backend; no public user registration.
- Runtime settings for upload limits, access logs, Turnstile, and rate limits.
- Short-lived download tokens; R2 keys are never exposed to users.
- Scheduled cleanup for expired shares and stale upload sessions.
- Workers Static Assets serves fingerprinted frontend assets directly; dynamic API responses are not cached.

### Deploy From GitHub

Click the **Deploy to Cloudflare** button at the top of this README.

The repository root contains the Worker `wrangler.toml`, so Cloudflare can read the D1, R2, and KV bindings during the Deploy Button flow. Configure these secrets when prompted:

- `ADMIN_PASSWORD` (minimum 16 characters)
- `CODE_HASH_PEPPER`
- `SESSION_SECRET`
- `TURNSTILE_SECRET_KEY` if Turnstile is enabled

Advanced users can use `ADMIN_PASSWORD_HASH` instead of `ADMIN_PASSWORD`; the hash takes precedence when both are set.
The admin username defaults to `admin` and can be changed with the `ADMIN_USERNAME` secret.

### Deploy From Local CLI

```bash
npm run deploy:cf
```

The helper installs dependencies, checks Wrangler login, provisions R2/D1/KV, patches local binding IDs, creates secrets, builds assets, applies D1 migrations, and deploys the Worker.

For manual deployment:

```bash
npm install
npm --prefix frontend ci
npm run build
npm run deploy
```

### Local Development

```bash
cp .dev.vars.example .dev.vars
npm install
npm --prefix frontend ci
npm run build
npm run db:migrate:local
npm run dev
```

Open `http://localhost:8787`.

### Validation

```bash
npm run typecheck
npm run deploy:dry-run
```

### Security Notes

- Text request bodies are capped at 1 MiB. File parts are byte-counted while streaming to R2.
- File upload reservations and text shares use atomic D1 writes to enforce the shared storage cap under concurrency.
- Static pages and APIs include CSP, frame, MIME-sniffing, referrer, and cache protections.
- KV counters are intentionally low-cost and eventually consistent. For a public instance, combine them with Cloudflare WAF rate limiting and Turnstile.
- Enabling Turnstile requires both a Site Key in the admin settings and a `TURNSTILE_SECRET_KEY` secret.

### Acknowledgements and License

This project is not an official FileCodeBox release and does not publish either upstream repository as a vendored dependency or submodule. It acknowledges:

- [vastsa/FileCodeBox](https://github.com/vastsa/FileCodeBox): the original FastAPI + Vue3 FileCodeBox project, licensed under LGPL-3.0.
- [zy84338719/FileCodeBox](https://github.com/zy84338719/FileCodeBox): the Go implementation of FileCodeBox. Some migration goals, admin-console ideas, and chunk-upload design references came from this version, which is licensed under MIT.

LGPL-3.0-or-later. See [LICENSE](./LICENSE).

If current or future changes include substantial code adapted from either upstream project, preserve the corresponding upstream copyright notice and license text. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
