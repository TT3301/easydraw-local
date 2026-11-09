# EasyDraw Local

[English](README.md) · **简体中文**

> [!IMPORTANT]
> **产品官网：[https://easydraw.pinkhorse.xyz](https://easydraw.pinkhorse.xyz)**

本地优先的桌面画布，用于绘制草图、线框图和可编辑原型。
既可以手动绘制，也可以通过 MCP 连接 AI Agent；项目以本地文件保存。

## 功能

- **自由画布**：形状、文字、箭头、Frame、图片与原生 SVG 矢量元素。
- **多画布项目**：一个项目内管理多个独立画布。
- **单文件保存**：文档和素材打包为 `.edw` 文件；首次保存后支持防抖自动保存。
- **本地素材**：内置图标、离线语义图标检索、图片占位图及可复用素材。
- **导出**：保存或复制图片，以及批量导出 Frame。
- **可选 AI 辅助**：通过兼容 MCP 的 Agent 读取、编辑画布。
- **中英文界面**：可在设置中切换。

本仓库不包含账号、同步服务或 EasyDraw 官方云端后端。

> **本 fork 新增：端到端加密分享。** 项目快照在本机加密后发布为浏览器可打开的只读链接（密钥只在链接 `#` 之后）。
> - **本机局域网**（默认）：在设置中打开「局域网分享服务」，地址与令牌自动预填，同一局域网内的设备即可打开链接，无需 VPS。
> - **自定义服务器**：填写你自己的 VPS 地址和访问令牌，即可公网分享。
> 服务端与部署方式见 [apps/share-server](apps/share-server/README.md)。
> 二开版本号从 **1.0.0** 起（基于上游 EasyDraw Local v0.3.7），macOS Apple Silicon 安装包见 Releases。

## v0.3.7 更新

同步 [EasyDraw v0.3.7](https://github.com/lostcrab9/EasyDraw/releases/tag/v0.3.7)
（源码提交 `ee98f22d883d3c8aa3c20c4ba4f562c924810628`）中适用于本地版的改动：

- AI 写入文字按自动尺寸或固定宽度排版，形状内文字正确对齐。
- AI 新建箭头默认使用肘形走线，支持连接 Frame，目标变化后更新连线。
- 打开项目时清理失效连线绑定，首次进入画布适配全部内容，切回保留会话内视图。
- 修复右键、画布重命名后的操作阻塞，以及属性面板打开时的退格删除。

账号、云端分享密钥、登录恢复、官网与服务端更新不包含在本地版中。

## 快速开始

环境要求：**Node.js 22.12+**（建议 Node.js 22 或 24）、**npm 10+**，
以及能够运行 Electron 的桌面环境。

```sh
git clone <你的仓库地址> easydraw-local
cd easydraw-local
npm ci
npm run dev
```

启动后新建项目并选择保存位置，或打开已有的 `.edw` 文件。
已保存项目在停止修改 900 ms 后自动保存；需要独立副本时使用“另存为”。

安装依赖和 Electron 时需要联网。安装完成后，常规本地编辑不需要
EasyDraw 服务或网络连接。

### 浏览器预览

```sh
npm run dev:web
```

访问 `http://127.0.0.1:1420`。浏览器预览仅用于画布开发；
桌面文件对话框、项目持久化和本地 MCP 接入需要 Electron。
完整功能请使用 `npm run dev`。

## AI / MCP 接入

点击画布工具栏的 **AI**，开启“允许 MCP 访问”，将接入指南复制给支持 MCP
的 Agent。不内置任何 API Key，也不捆绑安装外部 Agent。

MCP **默认关闭**。开启后，桌面程序启动带鉴权的本机回环桥接，
Agent 通过本地 stdio MCP 进程连接。这是本地桌面集成，不是云端服务。

请只连接可信的 Agent：它能够读取和修改当前项目。外部 Agent 可能按照自身配置
将项目内容发送给模型提供商；本地保存不等于 AI 模型也在本地运行。

详见 [MCP 接入说明](docs/mcp.md) 和内置的
[产品草图 Skill](skills/easydraw-product-sketch/SKILL.md)。

## 开发与验证

```sh
npm test                     # 单元测试与架构测试
npm run build                # 类型检查，构建桌面 UI 和本地 MCP sidecar
npm run check:source         # 检查公开源码卫生及本地版边界
npm run engine:typecheck
npm run model:typecheck
npm run mcp:smoke            # 使用模拟本地桥接进行 MCP 协议测试
npm run mcp:bundle-smoke     # 验证构建后的 MCP sidecar
npm run test:desktop         # 构建并运行 Electron 界面、文件操作冒烟测试
npm run test:canvas-fit      # 构建并验证首次进入画布适配与切换视图
```

桌面冒烟测试需要交互式桌面会话，使用隔离的临时用户目录。
其他集成检查见 [贡献指南](CONTRIBUTING.md)。

### 打包桌面应用

```sh
npm run desktop:dir          # 当前平台的未封装应用目录
npm run desktop:pack         # 当前平台的分发包
```

产物输出到 `release/`，由 electron-builder 打包。
仓库不包含签名或公证凭据，建议在目标操作系统上构建；
Windows 安装程序使用 NSIS，Linux 需要图形桌面环境。
应用标识为 **EasyDraw Local**，与其他 EasyDraw 版本区分。

## 目录结构

```text
src/                         React 桌面编辑器
electron/                    本地文件、素材、导出及 MCP 桥接
packages/canvas-engine/      画布渲染与交互
packages/document-model/     文档 Schema 与几何定义
packages/editor-contracts/   编辑器及 MCP 协议
packages/mcp-server/         本地 stdio MCP sidecar
assets/                      品牌资源及离线图标检索模型
remix-icons/                 内置图标及其许可证
skills/                      可选 Agent 绘图技能
tests/                       正式自动化测试源码，不包含测试报告
scripts/                     构建与验证工具
```

构建产物、安装包、依赖、项目文件、凭据、截图和测试报告不进入版本控制。
仓库不包含部署基础设施及私人的规划、调研和开发过程文档。

## 许可证与致谢

EasyDraw 代码使用 [MIT 许可证](LICENSE)，允许商业使用。

画布引擎和文档模型源自 [Excalidraw](https://github.com/excalidraw/excalidraw)，
保留上游 MIT 声明。内置字体、离线模型和图标分别遵守原许可证，
不因项目根目录的 MIT 许可证而被重新授权。
图标来自 [Remix Icon](https://remixicon.com)。

分发内置资源前请查看 [第三方许可声明](THIRD_PARTY_NOTICES.md)。
信任边界及已知依赖限制见 [安全说明](SECURITY.md)。
