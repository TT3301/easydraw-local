# EasyDraw Local

[English](README.md) · **简体中文**

本地优先的桌面画布，用于绘制草图、线框图和可编辑原型。
可以手动绘制，也可以通过 MCP 连接 AI Agent；项目以本地文件保存，
并能以**端到端加密的只读链接**分享给他人：局域网内无需服务器，公网分享可自托管。

当前版本：**1.1.0**

## 下载安装

在 [Releases](https://github.com/TT3301/easydraw-local/releases) 下载 `EasyDraw-Local-<版本>-mac-arm64.dmg`（macOS Apple Silicon），
可用同目录的 `SHA256SUMS.txt` 校验。

安装包为 ad-hoc 签名、未经 Apple 公证。首次打开若提示“已损坏”或“无法验证开发者”，执行：

```sh
xattr -dr com.apple.quarantine "/Applications/EasyDraw Local.app"
```

## 功能

- **自由画布**：形状、文字、箭头、Frame、图片与原生 SVG 矢量元素。
- **多画布项目**：一个项目内管理多个独立画布。
- **单文件保存**：文档和素材打包为 `.edw` 文件；首次保存后自动保存。
- **本地素材**：内置图标、离线语义图标检索、图片占位图及可复用素材。
- **导出**：保存或复制图片，以及批量导出 Frame。
- **加密分享**：把整个项目发布为浏览器可打开的只读链接，支持更新、暂停、有效期与删除。
- **可选 AI 辅助**：通过兼容 MCP 的 Agent 读取、编辑画布。
- **中英文界面**：可在设置中切换。

不包含账号或同步服务。

## 分享

点击画布右上角的 **分享**，打开「链接分享」即可发布当前项目（全部画布与素材）的快照。

| 操作 | 说明 |
|---|---|
| 复制 | 复制完整链接，打开即可只读浏览，可切换画布 |
| 更新内容 | 用最新内容覆盖快照，链接不变 |
| 关闭开关 | 暂停：保留快照，链接返回 404，再打开即恢复 |
| 删除 | 立即清除服务器上的快照，链接永久失效 |
| 有效期 | 永久、7 天或 30 天，到期自动删除 |

分享服务器在 **设置 → 分享服务器** 中选择：

- **本机局域网**（默认）：打开「启动局域网分享服务」，本机地址与访问令牌自动生成并预填，
  同一局域网内的手机、电脑即可打开链接，无需 VPS。服务默认关闭，退出应用即停止；
  本机关闭或休眠时链接无法访问。首次启动时 macOS 可能询问是否允许传入连接。
- **自定义服务器**：填写你自己的服务器地址（`https://`）和访问令牌，用于公网分享。
  服务端是一个零依赖的 Node 文件，提供 amd64 / arm64 的 Docker 镜像，
  部署方式见 [apps/share-server](apps/share-server/README.md)。

**安全模型**：项目内容与素材在本机用 AES-256-GCM 加密，密钥只在链接 `#` 之后，
浏览器不会把它发给服务器；服务器只保存密文和大小、时间等元数据。
任何拿到完整链接的人都能查看，请谨慎转发。访问令牌与分享密钥由系统钥匙串加密保存，不写入 `.edw` 文件。
局域网链接为 `http://`，浏览器在非 HTTPS 页面没有 WebCrypto，查看器会改用纯 JS 的 AES-GCM 解密；
此时同一网络中的攻击者理论上可以篡改页面，公网分享请使用 HTTPS 服务器。

## AI / MCP 接入

点击画布工具栏的 **AI**，开启“允许 MCP 访问”，将接入指南复制给支持 MCP
的 Agent。不内置任何 API Key，也不捆绑安装外部 Agent。

MCP **默认关闭**。开启后，桌面程序启动带鉴权的本机回环桥接，
Agent 通过本地 stdio MCP 进程连接。MCP 不能发布或修改分享。

请只连接可信的 Agent：它能够读取和修改当前项目。外部 Agent 可能按照自身配置
将项目内容发送给模型提供商；本地保存不等于 AI 模型也在本地运行。

详见 [MCP 接入说明](docs/mcp.md) 和内置的
[产品草图 Skill](skills/easydraw-product-sketch/SKILL.md)。

## 从源码运行

环境要求：**Node.js 22.12+**（建议 22 或 24）、**npm 10+**，以及能够运行 Electron 的桌面环境。

```sh
git clone https://github.com/TT3301/easydraw-local.git
cd easydraw-local
npm ci
npm run dev
```

npm 11 默认不执行依赖的安装脚本，若启动时提示 Electron 未正确安装，执行
`node node_modules/electron/install.js`（下载受阻时可加 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`，仍按包内校验和验证）。

`npm run dev:web` 在 `http://127.0.0.1:1420` 提供浏览器预览，仅用于画布开发；
文件对话框、项目保存、MCP 与分享需要 Electron。

## 开发与验证

```sh
npm test                     # 单元测试与架构测试（含分享服务端、编解码与局域网服务）
npm run check                # 源码卫生检查 + 测试 + 桌面构建（与 CI 一致）
npm run build:viewer         # 构建分享只读查看器（dist-viewer/）
npm run engine:typecheck
npm run model:typecheck
npm run mcp:smoke            # 使用模拟本地桥接进行 MCP 协议测试
npm run test:desktop         # 构建并运行 Electron 界面、文件操作冒烟测试
```

### 打包与发布

```sh
npm run desktop:dir          # 当前平台的未封装应用目录
npm run desktop:pack         # 当前平台的分发包，输出到 release/
```

GitHub Actions：

| 工作流 | 触发 | 产物 |
|---|---|---|
| `ci.yml` | 每次推送 | 检查、测试、构建 |
| `build-macos.yml` | `tt/main`、`feat/**`、`v*` tag | Apple Silicon DMG；`v*` tag 自动创建 Release |
| `share-server-image.yml` | `tt/main`（分享相关改动）、`v*` tag | `ghcr.io/tt3301/easydraw-share` 多架构镜像 |

发布新版本：更新 `package.json` 版本号，推送到 `tt/main`，再推送 `v<版本>` tag。

## 版本记录

- **1.1.0**：本机局域网分享。客户端内置分享服务，地址与令牌自动预填；查看器在非 HTTPS 环境改用纯 JS 解密；分享服务端提供 GHCR 多架构镜像。
- **1.0.0**：端到端加密分享与自托管服务端；只读网页查看器；macOS Apple Silicon 安装包。

## 目录结构

```text
src/                         React 桌面编辑器
src/features/share/          分享弹窗、服务器设置与快照解码
src/share-viewer/            浏览器只读查看器（viewer.html）
electron/                    本地文件、素材、导出、MCP 桥接与分享服务
apps/share-server/           分享服务端（server.mjs、Dockerfile、compose、部署脚本）
packages/canvas-engine/      画布渲染与交互
packages/document-model/     文档 Schema 与几何定义
packages/editor-contracts/   编辑器及 MCP 协议
packages/mcp-server/         本地 stdio MCP sidecar
assets/                      品牌资源及离线图标检索模型
remix-icons/                 内置图标及其许可证
skills/                      可选 Agent 绘图技能
tests/                       自动化测试源码
scripts/                     构建与验证工具
```

## 分支

| 分支 | 用途 |
|---|---|
| `tt/main` | 主线（默认分支），发布版本均由此打 tag |
| `main` | 上游镜像，只用于同步上游更新 |
| `feat/*` | 功能开发，完成后合入 `tt/main` |

## 许可证与致谢

代码使用 [MIT 许可证](LICENSE)，允许商业使用。
本项目 fork 自 [lostcrab9/easydraw-local](https://github.com/lostcrab9/easydraw-local)。

画布引擎和文档模型源自 [Excalidraw](https://github.com/excalidraw/excalidraw)，
保留上游 MIT 声明。内置字体、离线模型和图标分别遵守原许可证，
不因项目根目录的 MIT 许可证而被重新授权。图标来自 [Remix Icon](https://remixicon.com)，
局域网解密使用 [@noble/ciphers](https://github.com/paulmillr/noble-ciphers)（MIT）。

分发内置资源前请查看 [第三方许可声明](THIRD_PARTY_NOTICES.md)。
信任边界及已知依赖限制见 [安全说明](SECURITY.md)。
