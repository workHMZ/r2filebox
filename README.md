# R2FileBox

[![CI](https://github.com/workHMZ/r2filebox/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/workHMZ/r2filebox/actions/workflows/ci.yml)
[![CodeQL](https://github.com/workHMZ/r2filebox/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/workHMZ/r2filebox/actions/workflows/codeql.yml)
[![Dependabot](https://img.shields.io/badge/Dependabot-Enabled-1f883d?logo=dependabot&logoColor=white)](https://github.com/workHMZ/r2filebox/security/dependabot)
[![Secret Scanning](https://img.shields.io/badge/Secret%20Scanning-Enabled-1f883d?logo=github&logoColor=white)](https://github.com/workHMZ/r2filebox/security)
[![Latest Release](https://img.shields.io/github/v/release/workHMZ/r2filebox?sort=semver)](https://github.com/workHMZ/r2filebox/releases/latest)
[![License](https://img.shields.io/github/license/workHMZ/r2filebox)](./LICENSE)

[中文](#中文) · [English](#english) · [日本語](#日本語) · [Deploy to Cloudflare](#deploy-to-cloudflare)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/workHMZ/r2filebox)

一个跑在 Cloudflare Workers 上的文件 / 文本分享服务：上传后拿到一个提取码，对方输入提取码或打开链接即可获取，双方都不需要注册登录。全部依赖 Workers + R2 + D1，免费额度内就能长期自托管。

---

## 中文

### 使用方式

1. 拖入一个文件，或粘贴要分享的文本。
2. 把提取码、完整链接或二维码发给对方。
3. 对方输入提取码 / 粘贴链接 / 扫码，直接拿到内容，不需要注册。

### 截图

| File sharing (Light) | Get a share (Dark) |
|:---:|:---:|
| [![File sharing screen in light mode](./docs/screenshots/home-file-share.png)](./docs/screenshots/home-file-share.png) | [![Pickup code entry screen in dark mode](./docs/screenshots/home-get-share.png)](./docs/screenshots/home-get-share.png) |
| **Share created (Light)** | **Pickup box (Dark)** |
| [![Share created dialog in light mode](./docs/screenshots/share-created.png)](./docs/screenshots/share-created.png) | [![Shared file pickup screen in dark mode](./docs/screenshots/pickup-file.png)](./docs/screenshots/pickup-file.png) |
| **Admin dashboard (Light)** | **Maintenance and storage (Dark)** |
| [![Admin dashboard in light mode](./docs/screenshots/admin-dashboard.png)](./docs/screenshots/admin-dashboard.png) | [![Maintenance and storage screen in dark mode](./docs/screenshots/admin-maintenance.png)](./docs/screenshots/admin-maintenance.png) |

### 亮点

- **深浅色模式自动跟随**：自动适配设备系统主题，支持手动切换并本地记忆偏好。
- **隐私与安全保护**：提取码仅保存不可逆哈希；管理员凭据保存在 Cloudflare Secret 中，命令行部署默认使用 PBKDF2 哈希；生产部署全程 HTTPS 加密。
- **多语言与自动识别**：原生支持中、英、日三语，自动识别浏览器偏好语言并支持随时无缝切换。
- **零成本私有化部署**：一键部署至 Cloudflare，个人常规使用完全覆盖在免费额度内。
- **分片与断点续传**：支持大文件分片上传，网络中断亦可无缝续传；支持流式下载与拖拽播放。
- **多途径免密提取**：通过提取码、分享链接或扫码均可获取内容，发送与接收方均无需注册。
- **动态后台管理**：支持在可视化控制台实时调整有效期、提取次数等核心参数，保存即生效。
- **PWA 系统级集成**：支持作为独立应用安装至设备桌面，并深度接入系统原生分享菜单。
- **全自动空间回收**：定时任务每天自动清理过期文件与冗余分片，长期运行免维护。

### 技术亮点

- **密码与提取码保护**：命令行部署生成的管理员密码哈希使用 PBKDF2(SHA-256, 10 万轮)；Deploy Button 提供的 `ADMIN_PASSWORD` 作为 Cloudflare Secret 保存。两种模式均使用常量时间比较。提取码只存 SHA-256 加盐哈希，随机码生成用拒绝采样（Rejection Sampling）保证字符分布无偏，而不是简单取模。
- **下载令牌**：基于 Web Crypto API 手写的 HMAC-SHA256 JWT，作用域仅限单次提取会话、15 分钟过期，不依赖第三方 JWT 库；会话期内允许反复发 Range 请求，不会重复扣减剩余提取次数。
- **O(1) 存储计数**：D1 触发器在写入时原子维护 `storage_usage` 汇总表，管理后台读取存储占用不需要扫描 shares 全表。
- **双层限流，互补而非二选一**：Workers 原生 Rate Limiting API 做边缘粗粒度丢弃，D1 滑动时间窗口计数器做跨节点精确限流，专门防提取码被暴力枚举。
- **内容安全**：SVG 等存在脚本注入风险的文件格式，强制以附件形式下载，不做内联渲染；API / 管理后台走严格的 Content-Security-Policy，静态资源走宽松策略，按路由分层而不是全站统一规则。
- **结构化错误码 + i18n 三级回退**：后端返回稳定的 ErrorCode、参数和英文兜底 message；前端 `formatApiError` 依次尝试 ErrorCode 对应的 i18n 文案→原始 message→通用兜底。
- **定时清理不只是删记录**：每天的 Cron Triggers 除了删过期分享，还会主动 abort 因上传中断而滞留在 R2 里的未合并分片，避免这类残留分片长期占用存储空间。
- **隐私保护**：审计日志与限流记录只存 IP 的单向哈希，不落明文 IP。
- **CI 护栏**：`verify-config.mjs` 在 CI 里断言 `wrangler.toml` 的 D1 `database_id` 保持占位符（防止误提交真实生产库 ID）、限流 namespace 互不冲突、Deploy 按钮所需的 Secret 描述与 `.dev.vars.example` 保持同步。
- **构建元数据用 Cloudflare 原生能力**：`version_metadata` 绑定拿部署时间戳，`WORKERS_CI_COMMIT_SHA`（Workers Builds 官方注入的环境变量）拿真实 commit hash，而不是自己在 CI 脚本里拼接。

### 架构与安全模型

```text
上传文件 / 文本
    │
    ▼
Worker：校验、限流、生成随机提取码
    ├─ 正文 ─────────────────────────→ 私有 R2(不透明对象键)
    └─ 提取码的 SHA-256 加盐哈希 + 元数据 ─→ D1，不保存提取码明文

输入提取码或完整 URL → Worker 提取并重新哈希 → D1 查找并原子扣减提取次数
    ├─ 文本：Worker 从 R2 读取后返回
    └─ 文件：签发 15 分钟下载会话 → Worker 从 R2 流式返回(Range / ETag)
```

这是服务端访问控制，不是端到端加密：Worker 必须能读到正文才能返回内容。安全边界来自私有 R2、不可逆的提取码哈希、短期下载会话，以及所有访问都经过 Worker。重要文件建议上传前自行加密，例如打包为带密码的压缩包。

| 层级 | 技术 | 用途 |
|------|------|------|
| 边缘应用 | Hono + Cloudflare Workers | API、鉴权、安全头、流式下载、定时清理 |
| 对象存储 | Cloudflare R2 | 私有文件与文本正文 |
| 数据库 | Cloudflare D1 | 分享元数据、设置、上传会话、审计日志、精确限流 |
| 前端 | Vue 3 + Element Plus | 用户界面与管理后台，由 Workers Static Assets 托管 |
| 指标与防护 | Analytics Engine + Workers Rate Limiting | 轻量指标与边缘粗粒度限流 |

### 默认值与边界

| 项目 | 当前行为 |
|------|----------|
| 单文件上传 | 默认 50 MiB，管理员可配置 1–95 MiB |
| 应用上传上限 | 95 MiB；这是当前应用配置和分片数量的实现边界，不是 R2 Multipart 本身的总文件上限 |
| 总存储软限制 | 默认 8 GiB；达到后停止创建新分享，不删除已有内容 |
| 有效期 | 默认 24 小时，默认最长 168 小时，可由管理员调整 |
| 最大提取次数 | 默认 10 次，可由管理员调整 |
| 自动清理 | 每天 00:00 UTC 处理过期分享和残留分片 |

### 部署

> [!IMPORTANT]
> **部署前提：激活 R2 服务**
> Cloudflare 要求账户绑定有效支付方式才能激活 R2。不绑定支付方式，部署脚本或 "Deploy to Cloudflare" 按钮都会因无法创建 R2 桶而失败。

需要 Node.js 24(`>=24.11.0 <25`)，推荐使用 `.nvmrc` 固定的版本。

#### 命令行部署（推荐）

```bash
npm ci
npm run deploy:cf
```

全自动交互式引导：自动创建或复用 R2 / D1、把生成的 D1 `database_id` 回写到本地 `wrangler.toml`、交互式设置高强度管理员密码并哈希化后部署为加密 Secret、最后跑迁移并发布 Worker。检测到现有绑定时不会自动轮换密钥。

#### Deploy to Cloudflare

点击 [页面顶部的 Deploy to Cloudflare 按钮](#r2filebox) 进行部署，并设置：

```text
Build command:  npm run build
Deploy command: npm run deploy
```

`npm run deploy` 会先应用远程 D1 迁移，再执行 `wrangler deploy`。首次部署需要：

| Secret | 要求 |
|--------|------|
| `ADMIN_PASSWORD` | 管理员密码，16–4096 字符 |
| `CODE_HASH_PEPPER` | 用 `openssl rand -hex 32` 生成；更换后已有提取码失效 |
| `SESSION_SECRET` | 用 `openssl rand -hex 32` 生成；更换后已有会话失效 |

`ADMIN_USERNAME` 可选，默认为 `admin`。Turnstile 默认关闭，可在部署后从后台启用。

### 本地开发

```bash
cp .dev.vars.example .dev.vars
npm ci
npm run build
npm run db:migrate:local
npm run dev                       # http://localhost:8787
```

### 测试与仓库安全

```bash
npm run verify          # 配置、PWA/主题资源、三语言、类型、脚本与 Worker 测试
npm run deploy:dry-run  # 构建前端并验证 Wrangler 部署包，不上传
```

测试覆盖管理员鉴权、分享解析与下载、Range/ETag、限流、存储计数、断点续传错误分类、定时清理、健康检查等场景。CI 在推送 `main` 和 Pull Request 时跑完整验证；CodeQL 做每周 + PR 的语义扫描；Dependabot 与 Secret Scanning 常驻开启。

---

## English

### How it works

1. Drop in one file, or paste the text you want to share.
2. Send the pickup code, full share URL, or QR code to the recipient.
3. They enter the code, paste the URL, or scan the code — no account needed on either side.

### Highlights

- **Automatic Theme Switching**: Seamlessly adapts to your device's light or dark mode, with manual override and local preference memory.
- **Privacy & Security First**: Pickup codes are stored only as irreversible hashes. Admin credentials are kept in Cloudflare Secrets, and CLI deployments use PBKDF2 hashes by default. Production traffic is HTTPS-encrypted.
- **Multilingual Support**: Natively supports English, Chinese, and Japanese. Automatically detects your browser's language with instant manual switching.
- **Zero-Cost Self-Hosting**: One-click deployment to Cloudflare. Typical personal use fits entirely within the generous free tier limits.
- **Chunked & Resumable Uploads**: Supports robust multipart uploads that resume seamlessly after network interruptions, plus streaming downloads for media playback.
- **Frictionless Sharing**: Retrieve files instantly via pickup code, direct link, or QR code. No account registration required for either party.
- **Dynamic Admin Console**: Modify expiries, download limits, and system parameters on the fly via the web dashboard without redeploying.
- **Native PWA Integration**: Installable to your home screen as a standalone app, fully integrated with your OS's native share menu (Web Share Target).
- **Automated Maintenance**: A daily cron job automatically purges expired shares and orphaned data chunks, keeping your storage clean effortlessly.

### Technical Highlights

- **Password & Code Protection**: CLI deployments store the admin password as a PBKDF2 hash (SHA-256, 100k iterations); Deploy Button installations keep `ADMIN_PASSWORD` in a Cloudflare Secret. Both modes use constant-time verification. Pickup codes are stored only as salted SHA-256 hashes, and random codes use rejection sampling for an unbiased character distribution.
- **Stateless Download Tokens**: A hand-rolled HMAC-SHA256 JWT built on the Web Crypto API, scoped to a single pickup session and expiring in 15 minutes, with no third-party JWT library. Repeated Range requests within that session are allowed without consuming extra pickups.
- **O(1) Storage Accounting**: A D1 trigger atomically maintains a `storage_usage` summary on every write, meaning the admin dashboard never scans the full shares table to report usage.
- **Two Complementary Rate-Limiting Layers**: Workers' native Rate Limiting API drops obvious abuse at the edge, while D1 sliding-window counters enforce exact, cross-node limits specifically against brute-forcing pickup codes.
- **Content Safety**: Formats with script-injection risk, like SVG, are always forced to download as attachments instead of rendering inline. API and admin routes get a strict Content-Security-Policy; the static asset shell gets a looser one—split by route rather than one blanket policy.
- **Structured Errors & i18n Fallbacks**: The backend returns a stable ErrorCode, parameters, and an English fallback message. The frontend's `formatApiError` resolves them in order: localized ErrorCode → raw message → generic fallback.
- **Deep Scheduled Cleanup**: A daily Cron job removes expired shares and also aborts orphaned R2 multipart parts left behind by interrupted uploads, so they don't sit around occupying storage.
- **Privacy-Preserving Logs**: Audit logs and rate-limit keys only ever store a one-way hash of the client IP, never plaintext.
- **CI Guardrails**: `verify-config.mjs` asserts in CI that the D1 `database_id` in `wrangler.toml` stays a placeholder, that rate-limit namespaces don't collide, and that the Deploy-button secret descriptions stay in sync with `.dev.vars.example`.
- **Native Build Metadata**: The `version_metadata` binding supplies the deploy timestamp, and `WORKERS_CI_COMMIT_SHA` (an official Workers Builds environment variable) supplies the real commit hash—nothing is hand-assembled in CI scripts.

### Architecture and security model

```text
Upload file / text
    │
    ▼
Worker: validate, rate-limit, and generate a random pickup code
    ├─ Body ───────────────────────────────→ private R2 (opaque object key)
    └─ Salted SHA-256 hash + metadata → D1, no plaintext code stored

Enter a code or full URL → Worker extracts and hashes it → D1 finds the share and atomically consumes one pickup
    ├─ Text: Worker reads the R2 object and returns it
    └─ File: issue a 15-minute download session → stream from R2 (Range / ETag)
```

This is server-side access control, not end-to-end encryption: the Worker has to be able to read content in order to serve it. Security comes from private R2 storage, irreversible pickup-code hashing, short-lived sessions, and routing every access through the Worker. Encrypt sensitive files before upload, such as in a password-protected archive, if you need more than that.

| Layer | Technology | Purpose |
|-------|------------|---------|
| Edge app | Hono + Cloudflare Workers | API, auth, security headers, streaming, scheduled cleanup |
| Object storage | Cloudflare R2 | Private file and shared-text bodies |
| Database | Cloudflare D1 | Metadata, settings, upload sessions, audit logs, exact rate counters |
| Frontend | Vue 3 + Element Plus | Public UI and admin console via Workers Static Assets |
| Metrics and guard | Analytics Engine + Workers Rate Limiting | Lightweight metrics and edge throttling |

### Defaults and limits

| Item | Current behavior |
|------|------------------|
| Single-file upload | 50 MiB by default, configurable 1–95 MiB |
| Application upload ceiling | 95 MiB — this is the app's current chunk-count boundary, not R2 multipart's own file-size limit |
| Total-storage soft limit | 8 GiB by default; new shares stop when reached, existing content is untouched |
| Expiry | 24 hours by default, 168 hours max by default, admin-configurable |
| Maximum pickups | 10 by default, admin-configurable |
| Scheduled cleanup | Daily at 00:00 UTC for expired shares and leftover multipart parts |

### Deploy

> [!IMPORTANT]
> **Prerequisite: R2 needs a payment method on file**
> Cloudflare requires a valid payment method on file to activate R2. Without a payment method, the deploy script and the "Deploy to Cloudflare" button will fail to create the R2 bucket.

Node.js 24 (`>=24.11.0 <25`) is required; the version pinned in `.nvmrc` is recommended.

#### CLI (recommended)

```bash
npm ci
npm run deploy:cf
```

A fully automatic interactive deploy helper: it provisions or reuses R2/D1, writes the generated D1 `database_id` back into your local `wrangler.toml`, prompts for an admin password and hashes it before deploying it as an encrypted secret, then runs migrations and deploys the Worker. Existing bindings are not rotated automatically.

#### Deploy to Cloudflare

Click the [Deploy to Cloudflare button at the top of this page](#r2filebox) and set:

```text
Build command:  npm run build
Deploy command: npm run deploy
```

`npm run deploy` applies remote D1 migrations before `wrangler deploy`. The first deployment requires:

| Secret | Requirement |
|--------|-------------|
| `ADMIN_PASSWORD` | Admin password, 16–4096 characters |
| `CODE_HASH_PEPPER` | Generate with `openssl rand -hex 32`; rotating it invalidates existing pickup codes |
| `SESSION_SECRET` | Generate with `openssl rand -hex 32`; rotating it invalidates existing sessions |

`ADMIN_USERNAME` is optional, defaults to `admin`. Turnstile is off by default and can be enabled later from the admin console.

### Local development

```bash
cp .dev.vars.example .dev.vars
npm ci
npm run build
npm run db:migrate:local
npm run dev                       # http://localhost:8787
```

Re-run `npm run build` after frontend changes so Wrangler reloads the generated assets. Never commit `.dev.vars`, admin credentials, or production secrets.

### Tests and repository security

```bash
npm run verify          # config, PWA/theme assets, i18n, types, scripts, and Worker tests
npm run deploy:dry-run  # build the frontend and validate the Wrangler bundle without uploading
```

Coverage includes admin auth, share resolution and downloads, Range/ETag, rate limiting, storage accounting, resumable-upload error classification, and scheduled cleanup. CI runs full verification on pushes to `main` and on pull requests; CodeQL runs semantic SAST weekly and on PRs; Dependabot and Secret Scanning are always on — those two are repository settings rather than workflows, so their badge just says `Enabled`.

### License

Inspired by [FileCodeBox](https://github.com/vastsa/FileCodeBox) and parts of its [Go implementation](https://github.com/zy84338719/FileCodeBox). This is an independent Cloudflare Workers implementation.

**LGPL-3.0-or-later** · [LICENSE](./LICENSE) · [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

---

## 日本語

<details>
<summary>日本語版を開く / Expand Japanese</summary>

### 使い方
1. ファイルをドラッグ＆ドロップするか、テキストを貼り付けます。
2. 受取コード・共有URL・QRコードのいずれかを相手に送ります。
3. 相手はコードを入力するか URL を開くだけで取得できます。登録は不要です。

### 主な特徴

- **自動テーマ切り替え**: デバイスのダーク / ライトモードに自動適応し、手動での切り替えや設定の保存にも対応しています。
- **プライバシーとセキュリティ**: 受取コードは不可逆ハッシュのみを保存します。管理者認証情報は Cloudflare Secret に保存され、CLI デプロイでは既定で PBKDF2 ハッシュを使用します。本番通信は HTTPS で暗号化されます。
- **多言語対応**: 日本語、英語、中国語をネイティブサポート。ブラウザの言語を自動認識し、いつでも手動で切り替え可能です。
- **ゼロコストで自己ホスト**: Cloudflare にワンクリックでデプロイ可能。個人利用であれば、通常は無料枠内に収まります。
- **分割アップロードとレジューム機能**: 大容量ファイルの分割アップロードに対応し、通信が途切れても再開可能。シーク再生を伴うダウンロードもサポートしています。
- **登録不要で簡単共有**: 受取コード、リンク、QR コードから即座にファイルを取得可能。送信者・受信者ともにアカウントは不要です。
- **動的な管理画面**: 有効期限やダウンロード回数などの設定をウェブ上から直接変更でき、再デプロイなしで即座に反映されます。
- **PWA とシステム統合**: アプリとしてホーム画面に追加可能で、OS 標準の共有メニューとも深く統合されています。
- **完全自動のクリーンアップ**: 定期ジョブが期限切れのファイルや不要なデータ断片を毎日自動で削除するため、メンテナンスフリーで運用できます。

### 技術的なハイライト

- **パスワードと受取コードの保護**: CLI デプロイでは管理者パスワードを PBKDF2 (SHA-256、10万回イテレーション) ハッシュとして保存し、Deploy Button では `ADMIN_PASSWORD` を Cloudflare Secret に保存します。どちらも定数時間で検証します。受取コードはソルト付き SHA-256 ハッシュのみを保存し、ランダムコードの生成には棄却サンプリングを使用します。
- **ダウンロードトークン**: Web Crypto API を使って自前実装した HMAC-SHA256 JWT。単一の受取セッションに限定され、有効期限は 15 分。サードパーティの JWT ライブラリには依存していません。セッション内であれば Range リクエストを繰り返しても、受取回数は追加で消費されません。
- **O(1) のストレージ集計**: D1 のトリガーが書き込み時に `storage_usage` 集計テーブルをアトミックに更新するため、管理画面での使用量表示に shares テーブル全体をスキャンする必要がありません。
- **二層のレート制限**: Workers ネイティブの Rate Limiting API がエッジで粗い防御を行い、D1 のスライディングウィンドウカウンターが受取コードへのブルートフォース攻撃に対してノードをまたいだ厳密な制限を行います。
- **コンテンツの安全性**: SVG などスクリプトインジェクションのリスクがある形式は、インラインプレビューを無効化し、強制的に添付ファイルとしてダウンロードさせます。API・管理画面には厳格な Content-Security-Policy を、静的アセット配信には緩やかなポリシーを適用し、ルートごとに使い分けています。
- **構造化エラーコード + i18n フォールバック**: バックエンドは安定した ErrorCode、パラメータ、英語のフォールバックメッセージを返します。フロントエンドの `formatApiError` は ErrorCode のローカライズ文言 → 元のメッセージ → 汎用フォールバックの順に解決します。
- **定時クリーンアップの徹底**: 毎日の Cron ジョブは期限切れ共有の削除に加え、中断されたアップロードによる R2 上の未結合分片も自動で abort し、ストレージの占有を防ぎます。
- **プライバシー保護**: 監査ログやレート制限のキーには IP の一方向ハッシュ値のみを保存し、平文の IP は保存しません。
- **CI によるガードレール**: `verify-config.mjs` が CI 上で `wrangler.toml` の D1 `database_id` がプレースホルダーのままであること、レート制限のネームスペースが重複していないこと、Deploy ボタン用の Secret 説明が `.dev.vars.example` と同期していることを検証します。
- **Cloudflare ネイティブなビルドメタデータ**: `version_metadata` バインディングでデプロイ時刻を、Workers Builds 公式の環境変数である `WORKERS_CI_COMMIT_SHA` で実際のコミットハッシュを取得しており、CI 側で手動組み立てしていません。

### アーキテクチャとセキュリティモデル

これはサーバーサイドのアクセス制御であり、エンドツーエンドの暗号化ではありません。Worker がコンテンツを配信するためにはデータを読み込める必要があります。安全性はプライベート R2、不可逆な受取コードハッシュ、短命なダウンロードセッション、そしてすべてのアクセスが Worker を経由することに由来します。機密ファイルはアップロード前にパスワード付きアーカイブなどで暗号化してください。

### デフォルト値と制限

単一ファイルは既定 50 MiB(管理者設定で 1–95 MiB)、アプリの上限は 95 MiB、総容量ソフト上限は既定 8 GiB、有効期限は既定 24 時間(既定最大 168 時間)、最大受取回数は既定 10 回、クリーンアップは毎日 00:00 UTC に実行されます。いずれも管理画面から変更可能です。

### デプロイ

> [!IMPORTANT]
> R2 を有効化するには、Cloudflare アカウントに有効な支払い方法を登録する必要があります。支払い方法を登録しないと、R2 バケットの作成に失敗するため、デプロイスクリプトや「Deploy to Cloudflare」ボタンでのデプロイが失敗します。

Node.js 24(`>=24.11.0 <25`)が必要です。`.nvmrc` のバージョンを推奨します。

```bash
npm ci
npm run deploy:cf
```

R2/D1 の作成またはバインド、`wrangler.toml` への `database_id` の書き戻し、管理者パスワードのハッシュ化とシークレットへのデプロイ、マイグレーションと Worker のデプロイまでを対話形式で自動実行します。既存のバインディングはシークレットを自動ローテーションしません。

初回デプロイに必要な Secret は `ADMIN_PASSWORD`(16–4096文字)、`CODE_HASH_PEPPER`、`SESSION_SECRET`(いずれも `openssl rand -hex 32` で生成)。`ADMIN_USERNAME` は任意で既定値は `admin` です。

### ローカル開発

```bash
cp .dev.vars.example .dev.vars
npm ci
npm run build
npm run db:migrate:local
npm run dev                       # http://localhost:8787
```

`.dev.vars`、管理者認証情報、本番シークレットはコミットしないでください。

</details>
