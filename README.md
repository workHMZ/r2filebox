# R2FileBox

[中文](#中文说明) | [English](#english) | [Latest Release](https://github.com/workHMZ/r2filebox/releases/latest)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/workHMZ/r2filebox)

R2FileBox is a minimal Cloudflare-native file/text sharing app inspired by the FileCodeBox family of projects. It keeps the extraction-code workflow, but replaces the original server stack with Cloudflare Workers, Workers Static Assets, D1, R2, and Workers Rate Limiting bindings.

## 中文说明

### 项目简介

R2FileBox 是一个简单的匿名文本/文件分享工具：访客上传文字或文件，系统生成提取码；管理员只有一个后台账号，用来查看、删除、清理和调整运行配置。

本项目参考了 FileCodeBox 系列项目的产品形态和交互思路，是面向 Cloudflare 全托管架构的独立 TypeScript / Workers 变体。

### 功能

- 匿名文本分享和匿名文件分享。
- 提取码访问，D1 只保存提取码哈希，不保存明文提取码。
- 文件和文本内容存储在 R2，R2 bucket 不需要公开访问。
- 文件使用 R2 multipart upload，前端按分片上传，支持断点续传。
- 公开接口使用 Workers Rate Limiting 快速粗防护，并由 D1 单语句原子计数精确执行后台可配置限额；后台登录只使用 D1 精确限流。
- 单管理员后台，无用户注册和平台用户系统。
- 管理后台可调整上传限制、访问日志、Turnstile、限流等运行配置。
- 下载使用短期 token，R2 key 和对象地址不会暴露给用户。
- 定时任务自动清理过期分享和过期上传会话。
- Workers Static Assets 直接提供带内容哈希的前端资源；动态 API 全部禁止缓存。
- 无障碍支持覆盖表单标签、屏幕阅读器语义、键盘导航、可见焦点和状态播报；不会采集键盘输入或辅助功能使用数据。

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
- D1：分享元数据、上传会话、运行配置、审计记录和精确限流计数。
- R2：文件和文本内容。
- Workers Rate Limiting：公开接口的低延迟粗粒度保护。

### 环境要求

- Node.js `>=24.11.0 <25`；仓库的 `.nvmrc` 固定了经过验证的 Node 24 版本。
- 启用了 Workers、D1 和 R2 的 Cloudflare 账户。

### GitHub 一键部署

点击顶部 **Deploy to Cloudflare** 按钮即可从 GitHub 部署。

本仓库的 `wrangler.toml` 放在仓库根目录，Cloudflare Deploy Button 能直接读取 D1/R2 和 Workers Rate Limiting 绑定，并在部署流程中创建或绑定所需资源。Secret 会加密存储在 Cloudflare，不应写入 `wrangler.toml`、Git 或普通环境变量。

部署确认页中的 **Build command** 应为 `npm run build`，**Deploy command** 应为 `npm run deploy`。后者会先对绑定名 `DB` 执行远程 D1 migration，再部署 Worker；如果页面仍显示 `npx wrangler deploy`，请手动改为 `npm run deploy`，否则新数据库表或版本升级 migration 不会自动执行。

| Secret | 是否必需 | 应该填写什么 | 修改后的影响 |
| --- | --- | --- | --- |
| `ADMIN_USERNAME` | 否 | 管理员用户名；留空时为 `admin`，支持中文、日文和邮箱形式 | 下次登录需使用新用户名 |
| `ADMIN_PASSWORD` | 是，除非使用哈希 | 自己记得住的 16–4096 字符管理员密码 | 立即改变管理员登录密码 |
| `ADMIN_PASSWORD_HASH` | 高级替代项 | 由 `npm run hash-password` 交互式生成的 PBKDF2 哈希；设置后优先于 `ADMIN_PASSWORD` | 立即改变管理员登录密码 |
| `CODE_HASH_PEPPER` | 是 | 运行 `openssl rand -hex 32`，只生成并保存一次 | **不要轮换**；更改后已有提取码将无法验证 |
| `SESSION_SECRET` | 是 | 运行 `openssl rand -hex 32`，只生成并保存一次 | 更改后管理员会话和短期下载 token 会失效 |

Deploy Button 当前会显示 Secret 输入项，但不会自动生成可供你保存的随机管理员密码。首次部署最简单的方式是填写 `ADMIN_PASSWORD`、`CODE_HASH_PEPPER` 和 `SESSION_SECRET`。如果希望 Worker 只接收密码哈希，可在部署后删除 `ADMIN_PASSWORD`，改用 `ADMIN_PASSWORD_HASH`。

Turnstile 默认关闭，`TURNSTILE_SECRET_KEY` 不参与首次部署。需要启用时，先在 Cloudflare Worker 的 **Settings → Variables & Secrets** 中手动添加该 Secret，再到管理后台填写同一 Turnstile 组件的 Site Key 并启用功能。

如果一键部署页面没有自动填入配置，说明 GitHub 端还不是最新代码，先确认仓库根目录存在 `wrangler.toml` 和 `package.json` 的 `build`/`deploy` 脚本。

### 本地一键部署

首次部署可以在项目根目录运行：

```bash
npm run deploy:cf
```

脚本会执行：

- 安装根目录和前端依赖。
- 检查 Wrangler 登录状态。
- 创建或明确复用 R2 bucket 和 D1 database。
- 将真实 D1 ID 写入本地 `wrangler.toml`；Workers Rate Limiting 绑定不需要单独创建 KV namespace。
- 管理员密码留空时自动生成一个随机初始密码，并只显示一次。
- 只上传管理员密码哈希，并自动生成 `CODE_HASH_PEPPER` 和 `SESSION_SECRET`。
- 构建前端并执行 D1 migration；任一步骤失败都会在写入 Secret 前停止。
- 部署 Worker。

请立即保存脚本显示的随机管理员密码。检测到已有 D1 绑定或复用任一现有 R2/D1 资源时，脚本默认停止；明确确认后只会构建、迁移和部署，不会创建资源或读取、生成、轮换任何 Secret，因此可安全用于已有实例更新。只有在确认复用的是空资源、确实要初始化新实例时，才可显式运行 `npm run deploy:cf -- --force-reinitialize` 并输入完整确认词 `REINITIALIZE`。

如果你有多个 Cloudflare 账号，脚本会要求选择；也可以提前指定：

```bash
export CLOUDFLARE_ACCOUNT_ID="你的 account id"
npm run deploy:cf
```

### 手动部署

```bash
npm ci
npm run build

npx wrangler login
npx wrangler r2 bucket create r2filebox-files
npx wrangler d1 create r2filebox-db
```

把 `wrangler d1 create` 输出的 `database_id` 写入根目录 `wrangler.toml`。四个 `[[ratelimits]]` 绑定由 Wrangler 随 Worker 配置部署，不需要创建 KV namespace。
如果要在同一个 Cloudflare 账户中部署多个独立的 R2FileBox 实例，请同时为每个实例修改四个 `namespace_id`，确保这些正整数不与同账户中的其他 Rate Limiting 绑定重复。

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

已有实例升级到 1.40 时也必须使用 `npm run deploy`（或先单独执行 `npm run db:migrate:remote`，再执行 `npx wrangler deploy`），确保 `0002_reliability.sql` 在新 Worker 代码生效前完成。正常升级不要轮换任何 Secret。

### 本地开发

创建 `.dev.vars`：

```bash
cp .dev.vars.example .dev.vars
```

把 `ADMIN_USERNAME`、`ADMIN_PASSWORD`（或 `ADMIN_PASSWORD_HASH`）、`CODE_HASH_PEPPER` 和 `SESSION_SECRET` 写入 `.dev.vars`，然后运行：

```bash
npm ci
npm run build
npm run db:migrate:local
npm run dev
```

访问 `http://localhost:8787`。

### 验证

```bash
npm run verify
npm run deploy:dry-run
```

`verify` 会检查生成的 Cloudflare 绑定类型、TypeScript、配置一致性以及真实 Workers 运行时测试。`deploy:dry-run` 会构建前端并执行 `wrangler deploy --dry-run`，用于检查 Worker 配置和静态资源绑定是否可部署。

### 安全和免费层注意

- 默认单文件限制为 50 MiB（52,428,800 字节，界面显示为 50 MB），代码硬上限为 95 MiB；免费额度场景建议保持默认值。
- R2 bucket 不要开启 public access，也不要绑定公开自定义域名。
- 默认关闭详细访问日志，减少 D1 写入。
- 原生 Rate Limiting 绑定用于快速粗防护，后台可配置限额始终由 D1 原子计数精确执行；高流量公开服务仍建议叠加 Cloudflare WAF 速率限制和 Turnstile。
- 文本内容限制为 1 MiB；结构化请求体另预留少量 JSON 开销。文件分片在流式写入 R2 时按会话声明大小逐字节校验。
- 文件上传会话和文本分享通过 D1 原子写入共同受总存储上限约束，避免并发请求绕过软限制。
- 静态页面和 API 都设置了 CSP、禁止嵌入、MIME 嗅探防护和严格缓存策略。
- 启用 Turnstile 前，需要在后台填写 Site Key，并配置 `TURNSTILE_SECRET_KEY` secret。
- `CODE_HASH_PEPPER` 和 `SESSION_SECRET` 必须在同一实例中保持稳定；不要在普通版本更新时重新生成。
- 不要提交 `.dev.vars`、真实 secret、私钥或 Cloudflare API token。
- `ENABLE_NATIVE_RATE_LIMIT` 控制原生粗粒度保护层；D1 精确限流始终启用。
- `wrangler.toml` 中的 D1 ID 对公开仓库不是密码，但模板仓库仍应保留占位值，真实 ID 只留在你自己的部署副本里。

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
- Files and text payloads are stored in R2.
- Resumable multipart upload backed by R2.
- Workers Rate Limiting provides fast coarse protection for public endpoints, while one-statement atomic D1 counters enforce the exact configurable limits; administrator login uses only the exact D1 limiter.
- Single-admin backend; no public user registration.
- Runtime settings for upload limits, access logs, Turnstile, and rate limits.
- Short-lived download tokens; R2 keys are never exposed to users.
- Scheduled cleanup for expired shares and stale upload sessions.
- Workers Static Assets serves fingerprinted frontend assets directly; dynamic API responses are not cached.
- Accessibility support includes form labels, screen-reader semantics, keyboard navigation, visible focus, and status announcements without collecting keystrokes or assistive-technology usage data.

### Requirements

- Node.js `>=24.11.0 <25`; `.nvmrc` pins the tested Node 24 release.
- A Cloudflare account with Workers, D1, and R2 enabled.

### Deploy From GitHub

Click the **Deploy to Cloudflare** button at the top of this README.

The repository root contains the Worker `wrangler.toml`, so Cloudflare can provision or bind D1, R2, and Workers Rate Limiting resources during the Deploy Button flow. Secrets are encrypted by Cloudflare and must never be committed to Git or placed in `wrangler.toml`.

On the deployment confirmation page, use `npm run build` as the **Build command** and `npm run deploy` as the **Deploy command**. The deploy script applies remote D1 migrations through the `DB` binding before deploying the Worker. If the page still shows `npx wrangler deploy`, replace it with `npm run deploy`; otherwise new-schema and upgrade migrations will not run automatically.

| Secret | Required | Value and lifecycle |
| --- | --- | --- |
| `ADMIN_USERNAME` | No | Defaults to `admin`; Unicode names and email-style usernames are supported. |
| `ADMIN_PASSWORD` | Yes, unless using a hash | Choose and save a 16–4096 character login password. |
| `ADMIN_PASSWORD_HASH` | Advanced alternative | Run `npm run hash-password` interactively. This PBKDF2 hash takes precedence over `ADMIN_PASSWORD`. |
| `CODE_HASH_PEPPER` | Yes | Generate once with `openssl rand -hex 32`. Do not rotate it: existing extraction codes would stop validating. |
| `SESSION_SECRET` | Yes | Generate once with `openssl rand -hex 32`. Rotation invalidates admin sessions and short-lived download tokens. |

The Deploy Button presents secret input fields but does not generate a recoverable random admin password for you. For the button flow, provide `ADMIN_PASSWORD`, `CODE_HASH_PEPPER`, and `SESSION_SECRET`. Advanced users can replace `ADMIN_PASSWORD` with `ADMIN_PASSWORD_HASH` after deployment.

Turnstile is disabled by default, so `TURNSTILE_SECRET_KEY` is not requested during the initial deployment. To enable it later, add the secret under the Worker's **Settings → Variables & Secrets**, then configure the matching Site Key and enable Turnstile in the admin UI.

### Deploy From Local CLI

```bash
npm run deploy:cf
```

For a first deployment, the helper installs dependencies, checks Wrangler login, provisions or explicitly reuses R2/D1, patches the local D1 binding, builds assets, applies D1 migrations, and only then creates secrets and deploys the Worker. If the admin-password prompt is left blank, it generates a random initial password, displays it once, and uploads only its hash. `CODE_HASH_PEPPER` and `SESSION_SECRET` are generated automatically.

Save the generated password immediately. When an existing D1 binding or any existing R2/D1 resource is reused, the helper stops by default. If you explicitly continue, it only builds, migrates, and deploys; it does not create resources or read, generate, or rotate secrets. Only for intentionally empty resources, run `npm run deploy:cf -- --force-reinitialize` and type the full confirmation word `REINITIALIZE` to initialize a new instance.

For manual deployment:

```bash
npm ci
npm run build
npm run deploy
```

Existing installations upgrading to 1.40 must also use `npm run deploy`, or run `npm run db:migrate:remote` before `npx wrangler deploy`, so `0002_reliability.sql` is applied before the new Worker becomes active. Do not rotate any secrets during a routine upgrade.

### Local Development

```bash
cp .dev.vars.example .dev.vars
npm ci
npm run build
npm run db:migrate:local
npm run dev
```

Open `http://localhost:8787`.

### Validation

```bash
npm run verify
npm run deploy:dry-run
```

### Security Notes

- Text content is capped at 1 MiB, with a small additional allowance for the JSON envelope. File parts are byte-counted while streaming to R2.
- File upload reservations and text shares use atomic D1 writes to enforce the shared storage cap under concurrency.
- Static pages and APIs include CSP, frame, MIME-sniffing, referrer, and cache protections.
- Native Rate Limiting bindings provide fast coarse protection, while atomic D1 counters always enforce the exact configurable limits. High-traffic public instances should still combine these with Cloudflare WAF rate limiting and Turnstile.
- When deploying multiple independent R2FileBox instances in one Cloudflare account, assign a distinct positive `namespace_id` to each Rate Limiting binding so coarse counters are not shared between instances.
- `ENABLE_NATIVE_RATE_LIMIT` toggles the native coarse protection layer; exact D1 enforcement always remains active.
- Enabling Turnstile requires both a Site Key in the admin settings and a `TURNSTILE_SECRET_KEY` secret.
- Keep `CODE_HASH_PEPPER` and `SESSION_SECRET` stable for the lifetime of an instance; do not regenerate them during routine updates.

### Acknowledgements and License

This project is not an official FileCodeBox release and does not publish either upstream repository as a vendored dependency or submodule. It acknowledges:

- [vastsa/FileCodeBox](https://github.com/vastsa/FileCodeBox): the original FastAPI + Vue3 FileCodeBox project, licensed under LGPL-3.0.
- [zy84338719/FileCodeBox](https://github.com/zy84338719/FileCodeBox): the Go implementation of FileCodeBox. Some migration goals, admin-console ideas, and chunk-upload design references came from this version, which is licensed under MIT.

LGPL-3.0-or-later. See [LICENSE](./LICENSE).

If current or future changes include substantial code adapted from either upstream project, preserve the corresponding upstream copyright notice and license text. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
