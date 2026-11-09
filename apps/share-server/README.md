# EasyDraw 自托管分享服务器

本 fork 新增的分享后端。单文件、零依赖（Node 22+ 内置模块），只保存桌面端加密后的密文。

桌面端「本机局域网」模式会直接在应用内运行同一个 `server.mjs`（随安装包分发，开关默认关闭），无需单独部署；
本文档描述的是在 VPS 上独立部署、用于公网分享的方式。局域网链接是 `http://`，浏览器在非 HTTPS 页面没有 WebCrypto，
查看器会自动改用纯 JS 的 AES-GCM（`@noble/ciphers`）解密。

## 安全模型

- 桌面端用 AES-256-GCM 加密项目快照（含所有画布与素材），密钥只放在链接 `#` 之后，浏览器不会把它发给服务器或 Cloudflare。
- 服务器只保存密文和元数据（大小、时间、是否暂停、过期时间），看不到项目名和内容。
- 写操作需要 `SHARE_TOKEN`（Bearer）。令牌在桌面端由系统钥匙串加密保存，不写入 `.edw`。
- 任何拿到完整链接的人都能查看；「删除」会立即清除密文，「暂停」保留密文但链接返回 404。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 是 | 测试连接，返回 `maxBytes` |
| POST | `/api/shares` | 是 | 上传密文，可选 `X-Expires-At`，返回元数据和随机 id |
| GET | `/api/shares/:id` | 是 | 元数据 |
| PUT | `/api/shares/:id` | 是 | 覆盖密文（链接不变） |
| PATCH | `/api/shares/:id` | 是 | `{ enabled?, expiresAt? }` |
| DELETE | `/api/shares/:id` | 是 | 删除 |
| GET | `/api/shares/:id/blob` | 否 | 公开下载密文；暂停或过期时返回 404 |
| GET | `/s/:id` | 否 | 只读查看器（在浏览器端解密） |

过期分享在访问时返回 404，并在启动时和之后每小时清理一次。认证失败超过 10 次/10 分钟的 IP 会收到 429。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `SHARE_TOKEN` | 必填 | 至少 32 字节随机串 |
| `MAX_BLOB_MB` | `50` | 单个快照上限；Cloudflare 免费版请求体上限是 100 MB |
| `DATA_DIR` | `./data` | 密文目录 |
| `VIEWER_DIR` | `./viewer`（镜像内为 `/viewer`） | `npm run build:viewer` 的产物 `dist-viewer/` |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | 只监听本机，由 nginx 反代 |

## 镜像

GitHub Actions（`.github/workflows/share-server-image.yml`）构建 `linux/amd64` 与 `linux/arm64` 多架构镜像，推送到 GHCR，查看器已内置在镜像中：

| 标签 | 来源 |
|---|---|
| `ghcr.io/tt3301/easydraw-share:latest`、`:sha-<短哈希>` | `tt/main` 分支 |
| `:1.0.0`、`:1.0` | `v*` tag |

## 部署（Docker Compose + 已有 nginx + Cloudflare）

1. Cloudflare：为分享域名添加 A 记录并开启代理（橙云），SSL 模式设为 **Full (strict)**，nginx 使用 Cloudflare Origin 证书。对这个子域名关闭 Rocket Loader；Email Obfuscation 只在页面含邮箱地址时注入脚本，查看器不受影响。若 zone 里有通配的 Origin Rule 改写了回源端口，要为分享域名单独加一条回源 443 的规则。
2. 在本机仓库根目录执行：

   ```sh
   apps/share-server/deploy.sh <ssh-host>                  # 默认 /root/easydraw-share，镜像标签 latest
   apps/share-server/deploy.sh <ssh-host> /root/easydraw-share 1.0.0   # 固定版本
   ```

   脚本只上传 `compose.yaml`，首次部署时生成 `.env`（`SHARE_TOKEN`，权限 600），然后执行 `docker compose pull && docker compose up -d`。服务器上不需要源码，也不在服务器上构建。也可以手动：把 `compose.yaml` 放到任意目录，写好 `.env`，执行 `docker compose up -d`。
3. nginx：参照 `nginx.share.conf.example`，**新增**一个站点文件，然后：

   ```sh
   docker exec nginx nginx -t && docker exec nginx nginx -s reload
   ```

4. 桌面端：设置 → 分享服务器，填写 `https://<分享域名>`，以及 `.env` 中的 `SHARE_TOKEN`，然后点「测试连接」。

回滚：删除新增的 nginx 站点文件并 reload，再在部署目录执行 `docker compose down`；固定到旧版本则用 `deploy.sh <host> <dir> <旧版本号>`。

## 开发

```sh
SHARE_TOKEN=$(openssl rand -hex 24) VIEWER_DIR=dist-viewer node apps/share-server/server.mjs
npx vitest run apps/share-server electron/share-service.test.ts src/features/share
```
