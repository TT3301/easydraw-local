export type AppLocale = "zh-CN" | "en";

export const LOCALE_STORAGE_KEY = "easydraw.locale";

export const APP_LOCALES: ReadonlyArray<{
  code: AppLocale;
  nativeLabel: string;
  descriptionKey: string;
}> = [
  { code: "zh-CN", nativeLabel: "简体中文", descriptionKey: "使用简体中文界面" },
  { code: "en", nativeLabel: "English", descriptionKey: "使用英文界面" },
];

const english: Record<string, string> = {
  "对象链接无效": "Invalid object link",
  "对象链接属于其他项目，请先打开对应项目": "This object belongs to another project. Open that project first.",
  "链接目标不存在，可能已被删除": "The linked object was not found. It may have been deleted.",
  "画布": "Canvases",
  "{count} 个画布": "{count} canvases",
  "搜索画布": "Search canvases",
  "搜索画布名称": "Search canvas names",
  "新建画布": "New canvas",
  "画布列表": "Canvas list",
  "管理": "Manage",
  "重命名": "Rename",
  "复制画布": "Duplicate canvas",
  "删除画布": "Delete canvas",
  "可以通过撤销恢复。": "You can restore it with Undo.",
  "没有匹配的画布": "No matching canvases",
  "新建画布，开始绘制": "Create a canvas to start drawing",
  "画布操作": "Canvas actions",

  "文件": "File",
  "编辑": "Edit",
  "视图": "View",
  "窗口": "Window",
  "设置": "Settings",
  "设置…": "Settings…",
  "偏好设置": "Preferences",
  "语言": "Language",
  "界面语言": "Interface language",
  "选择 EasyDraw 菜单、按钮、提示与画布工具使用的语言。":
    "Choose the language used for EasyDraw menus, buttons, messages, and canvas tools.",
  "语言更改会立即生效并自动保存。":
    "Language changes take effect immediately and are saved automatically.",
  "使用简体中文界面": "Use the Simplified Chinese interface",
  "使用英文界面": "Use the English interface",
  "关闭设置": "Close settings",
  "完成": "Done",
  "应用菜单": "Application menu",
  "关闭菜单": "Close menu",
  "新建项目": "New project",
  "打开项目": "Open project",
  "保存项目": "Save project",
  "另存项目": "Save project as",
  "撤销": "Undo",
  "重做": "Redo",
  "剪切": "Cut",
  "复制": "Copy",
  "粘贴": "Paste",
  "全选": "Select all",
  "重新加载": "Reload",
  "强制重新加载": "Force reload",
  "实际大小": "Actual size",
  "放大": "Zoom in",
  "缩小": "Zoom out",
  "切换全屏": "Toggle full screen",
  "左侧边栏": "Left sidebar",
  "右侧边栏": "Right sidebar",
  "EasyDraw 主窗口": "EasyDraw main window",
  "EasyDraw 画布": "EasyDraw canvas",
  "收起左侧边栏": "Collapse left sidebar",
  "展开左侧边栏": "Expand left sidebar",
  "收起右侧边栏": "Collapse right sidebar",
  "展开右侧边栏": "Expand right sidebar",
  "撤销与重做": "Undo and redo",
  "画布缩放": "Canvas zoom",
  "当前缩放 {zoom}%，点击恢复 100%":
    "Current zoom {zoom}%, click to reset to 100%",
  "资源边栏": "Resources sidebar",
  "资源类型": "Resource type",
  "页面": "Pages",
  "图标": "Icons",
  "素材库": "Library",
  "选择页面 {index}": "Select page {index}",
  "页面 {index}": "Page {index}",
  "搜索图标": "Search icons",
  "搜索所有图标": "Search all icons",
  "清除搜索": "Clear search",
  "关闭图标面板": "Close icon panel",
  "全部图标": "All icons",
  "选择图标以查看详情": "Select an icon to see details",
  "图标分组": "Icon group",
  "全部": "All",
  "全部分组": "All groups",
  "正在读取图标库": "Loading icon library",
  "插入图标 {name}": "Insert icon {name}",
  "插入中": "Inserting",
  "没有匹配的图标": "No matching icons",
  "调整搜索词或切换分组": "Change the search term or choose another group",
  "内置图标库加载失败": "Built-in icon library failed to load",
  "请重新打开 EasyDraw": "Reopen EasyDraw and try again",
  "{count} 个图标": "{count} icons",
  "{count} 个素材": "{count} items",
  "正在添加": "Adding",
  "添加选中": "Add selection",
  "添加选中元素": "Add selected elements",
  "素材 {index}": "Item {index}",
  "插入素材 {name}": "Insert library item {name}",
  "插入“{name}”": "Insert “{name}”",
  "正在插入": "Inserting",
  "{count} 个元素": "{count} elements",
  "删除素材 {name}": "Delete library item {name}",
  "删除“{name}”": "Delete “{name}”",
  "还没有素材": "No library items yet",
  "在画布中选择一个或多个元素，然后点击“添加选中”":
    "Select one or more canvas elements, then choose Add selection.",
  "MCP 状态边栏": "MCP status sidebar",
  "MCP 状态": "MCP status",
  "打开 MCP 状态": "Open MCP status",
  "打开 AI 设置": "Open AI settings",
  "关闭 AI 设置": "Close AI settings",
  "AI 设置分类": "AI settings tabs",
  "管理 MCP 连接与应用内 Skills": "Manage MCP connections and bundled skills",
  "复制 Skills 目录": "Copy skills directory",
  "更新Skills": "Update Skills",
  "更新中…": "Updating…",
  "Skills 已更新到公共目录，请在 Agent 中重新加载或新建会话。": "Skills updated in the shared directory. Reload your Agent or start a new session.",
  "Skills 已更新，但无法保存更新提示状态。": "Skills updated, but the update acknowledgement could not be saved.",
  "无法更新 Skills，请重启 EasyDraw 并检查公共目录权限后重试。": "Could not update Skills. Restart EasyDraw and check the shared directory permissions, then try again.",
  "Skills 目录已复制，可粘贴给 Agent。": "Skills directory copied. Paste it to your agent.",
  "无法复制 Skills 目录，请重启 EasyDraw 后重试。": "Could not copy the skills directory. Restart EasyDraw and try again.",
  "无法读取 Skills 更新状态，请重启 EasyDraw 后重试。": "Could not read the skills update status. Restart EasyDraw and try again.",
  "新版本": "New version",
  "Skills 有新版本": "Skills updated",
  "有更新": "Updated",
  "标记为已读": "Mark as read",
  "应用内 Skill 已更新。若已复制到 Agent 的安装目录，请重新复制整个目录以更新。": "The bundled skill has changed. If you installed a copy in your agent's skills directory, copy the entire directory again to update it.",
  "知道了": "Got it",
  "无法保存 Skills 确认状态，请稍后重试。": "Could not save the skills acknowledgement. Try again later.",
  "产品草图 Skill": "Product sketch skill",
  "用于创建和调整可编辑的低保真产品界面草图，包含绘制方法与协议说明。": "Create and refine editable low-fidelity product interface sketches, with drawing guidance and protocol reference.",
  "Skills 随 EasyDraw 更新，但不会自动推送给 Agent。": "Skills are updated with EasyDraw but are not automatically pushed to your Agent.",
  "点击「更新Skills」，可将应用内置的技能安装或更新到当前用户的公共目录 {path}。": "Click Update Skills to install or update the bundled skill in your shared directory, {path}.",
  "如果希望安装到其他目录，请点击「复制 Skills 目录」，将路径交给 Agent，由它完成安装或更新。": "To install it elsewhere, click Copy skills directory and give the path to your Agent to install or update it.",
  "如何使用": "How to use",
  "复制目录路径给 Agent，让它读取其中的 SKILL.md 及引用文件；需要安装时，将整个目录复制到该客户端支持的 Skill 目录。": "Give the directory path to your agent so it can read SKILL.md and its references. To install it, copy the entire directory to a skills location supported by that client.",
  "手动安装的副本不会随应用自动更新。“知道了”只关闭更新提示，不会安装或更新 Agent 的 Skill。": "Manually installed copies do not update with the app. Got it only dismisses the update notice; it does not install or update your agent's skill.",
  "关闭 MCP 状态": "Close MCP status",
  "删除": "Delete",
  "本地画布已就绪": "Local canvas is ready",
  "MCP 接入": "MCP access",
  "关闭 MCP 接入": "Close MCP access",
  "为支持 stdio MCP 的 Agent 提供通用画布能力": "Universal canvas tools for agents supporting stdio MCP",
  "允许 MCP 访问": "Allow MCP access",
  "开启后，本机 Agent 可以读取和修改当前项目。关闭会断开所有连接。": "When enabled, local agents can read and edit the current project. Turning this off disconnects all clients.",
  "浏览器预览不提供本地 MCP 服务。": "Local MCP service is unavailable in browser preview.",
  "正在读取 MCP 状态。": "Reading MCP status.",
  "MCP 已关闭": "MCP is off",
  "MCP 已关闭，客户端无法访问画布。": "MCP is off. Clients cannot access the canvas.",
  "已开启，{count} 个客户端": "Enabled, connected clients: {count}",
  "已开启，等待客户端连接。": "Enabled, waiting for a client.",
  "已连接的客户端": "Connected clients",
  "未提供名称的客户端": "Unnamed client",
  "客户端名称由对方报告，仅用于展示，不代表身份认证。": "Client names are self-reported for display, not verified identities.",
  "复制接入信息": "Copy connection info",
  "查看接入指南": "View setup guide",
  "EasyDraw MCP 接入指南": "EasyDraw MCP setup guide",
  "关闭接入指南": "Close setup guide",
  "返回 AI": "Back to AI",
  "复制下方指南交给你的Agent执行": "Copy the guide below and give it to your agent to follow.",
  "1. Agent 执行步骤": "1. Instructions for agents",
  "请将 EasyDraw 接入你当前使用的 MCP 客户端，并完成只读连接验证。": "Connect EasyDraw to your current MCP client and perform a read-only connection check.",
  "先检查客户端是否支持 stdio MCP，确认其配置位置、格式和已有 easydraw 条目。不要假设所有客户端使用相同路径或 mcpServers JSON 格式。": "Check whether the client supports stdio MCP. Identify its configuration location, format, and any existing easydraw entry. Do not assume all clients use the same path or mcpServers JSON format.",
  "使用下方 command、args、env 的原值，转换为当前客户端支持的格式；保留参数顺序、路径和环境变量。只添加或更新 easydraw，保留其他服务及设置，不要覆盖整个配置文件。": "Use the exact command, args, and env values below in the client's supported format. Preserve argument order, paths, and environment variables. Add or update only easydraw, preserving other servers and settings; do not replace the entire configuration file.",
  "若没有配置修改权限，提供具体的人工操作步骤；已有配置无法解析时不要覆盖。不要声称已完成尚未执行的修改或验证。": "If you cannot modify the configuration, provide specific manual steps. Do not overwrite an existing configuration that cannot be parsed. Do not claim changes or verification that have not been performed.",
  "按客户端支持的方式重新加载 MCP 或提示用户新建会话，确认 easydraw 工具已出现，再调用 get_status。": "Reload MCP using the client's supported method or ask the user to start a new session. Confirm that easydraw tools are available, then call get_status.",
  "验证成功后报告 documentId、canvasId 和 revision。接入验证只读取状态，不创建画布、不修改项目；实际编辑需另有用户任务。": "After successful verification, report documentId, canvasId, and revision. Setup verification only reads status; do not create canvases or edit the project. Editing requires a separate user task.",
  "2. 当前启动配置": "2. Current launch configuration",
  "使用下方当前安装的启动配置，无需另装 Node.js。若路径失效，请让用户从当前应用重新复制指南；不要读取或复制桥接描述文件中的令牌。": "Use the launch configuration below for the current installation; no separate Node.js installation is needed. If paths are invalid, ask the user to copy a fresh guide from the current app. Do not read or copy tokens from the bridge descriptor file.",
  "当前启动配置尚未就绪，请让用户在 EasyDraw 桌面端重新复制指南。": "The launch configuration is not ready. Ask the user to copy a fresh guide from the EasyDraw desktop app.",
  "3. 验证与排障": "3. Verification and troubleshooting",
  "调用 get_status，检查返回的 documentId、canvasId 和 revision；仅看到“已开启”或客户端名称不代表工具调用成功。": "Call get_status and check the returned documentId, canvasId, and revision. An enabled status or a listed client name alone does not confirm a successful tool call.",
  "找不到工具：检查 easydraw 是否启用、启动配置是否保存，并重新加载 MCP 或新建会话。": "Tools missing: check that easydraw is enabled and its launch configuration is saved, then reload MCP or start a new session.",
  "无法连接或应用未就绪：确认 EasyDraw 已启动、项目已打开、MCP 访问已开启，并检查启动路径是否仍有效。": "Cannot connect or app not ready: confirm that EasyDraw is running, a project is open, and MCP access is enabled. Check that the launch paths are still valid.",
  "4. 可选：产品草图 Skill": "4. Optional: product sketch skill",
  "MCP 连接不依赖 Skill。需要产品草图工作方法时，读取下方目录中的 SKILL.md 及引用文件；需要安装时，将整个目录复制到你支持的 Skill 目录。": "MCP does not require a skill. For product sketch guidance, read SKILL.md and its references from the directory below. To install it, copy the entire directory to a skills location you support.",
  "实际编辑前先调用 get_capabilities 了解能力和限制，再调用 begin_task；按最新 revision 提交修改，完成验证后调用 finish_task。": "Before editing, call get_capabilities to learn the capabilities and limits, then begin_task. Submit changes against the latest revision and call finish_task after verification.",
  "完整接入指南已复制，可直接粘贴给 Agent。": "Full setup guide copied. Paste it directly to your agent.",
  "无法复制接入指南，请稍后重试。": "Could not copy the setup guide. Try again later.",
  "打开项目并开启 MCP 访问。": "Open a project and enable MCP access.",
  "将接入信息交给 Agent，让其按自己的 MCP 配置格式添加 easydraw 服务，保留其他已有配置。": "Give the connection info to your agent. Ask it to add the easydraw server using its MCP configuration format and preserve other settings.",
  "重新加载 Agent 的 MCP 配置或新建会话，调用 get_status 验证连接。": "Reload the agent's MCP configuration or start a new session, then call get_status to verify the connection.",
  "以下是常见 JSON 配置示例。不同客户端的配置文件、格式和入口可能不同；通用的是 command、args 和 env。": "This is a common JSON configuration example. Clients may use different files, formats, and setup interfaces; command, args, and env are the shared launch information.",
  "保持 EasyDraw 和项目打开。移动安装位置后请重新复制接入信息；不要手动复制桥接令牌。": "Keep EasyDraw and the project open. Copy fresh connection info if you move the installation; never manually copy the bridge token.",
  "可选：产品草图 Skill": "Optional: product sketch skill",
  "MCP 连接不依赖 Skill。需要产品草图工作方法时，可将下面的整个目录复制到 Agent 支持的 Skill 目录，或让 Agent 读取 SKILL.md。EasyDraw 不会自动安装或更新 Skill。": "MCP does not require a skill. For product sketch guidance, copy the entire directory below into a skill directory supported by your agent, or ask it to read SKILL.md. EasyDraw does not install or update skills automatically.",
  "无法读取 MCP 状态，请稍后重试。": "Could not read MCP status. Try again later.",
  "无法读取 MCP 接入信息，请稍后重试。": "Could not read MCP connection info. Try again later.",
  "无法更改 MCP 开关，请稍后重试。": "Could not change MCP access. Try again later.",
  "请重启 EasyDraw 以加载新版 MCP 接入功能。": "Restart EasyDraw to load the updated MCP access controls.",
  "MCP 已关闭，但开关状态未能保存。下次启动请确认访问状态。": "MCP is off, but the preference could not be saved. Check access again at the next launch.",
  "MCP 接入信息已复制。请交给 Agent 按其配置格式接入。": "MCP connection info copied. Give it to your agent to configure using its own format.",
  "无法复制 MCP 接入信息，请稍后重试。": "Could not copy MCP connection info. Try again later.",
  "MCP 连接": "MCP connections",
  "关闭 MCP 连接": "Close MCP connections",
  "管理可访问当前画布的客户端": "Manage clients that can access this canvas",
  "正在启动 MCP 服务": "Starting MCP service",
  "EasyDraw MCP 服务已就绪": "EasyDraw MCP service is ready",
  "本地服务正在运行，可接受客户端连接。":
    "The local service is running and ready for client connections.",
  "已连接，可以读取画布并提交修改。":
    "Connected. This client can read and update the canvas.",
  "已配置，等待新任务连接。":
    "Configured. Waiting for a new task to connect.",
  "已有客户端连接，可以读取画布并提交修改。":
    "A client is connected and can read and update the canvas.",
  "配置客户端后，新建任务即可连接当前画布。":
    "Configure a client, then start a new task to connect this canvas.",
  "客户端": "Clients",
  "更新配置": "Update setup",
  "添加到 Pi": "Add to Pi",
  "正在检测 Pi 配置。": "Checking Pi configuration.",
  "已配置，新建会话或执行 /reload 后连接。": "Configured. Start a new session or run /reload to connect.",
  "未找到可运行的 Pi。请安装 Pi 后重新检测。": "No working Pi installation found. Install Pi and check again.",
  "Pi 版本过旧，请升级到 0.99.0 或更新版本以使用内置 MCP。": "Update Pi to 0.99.0 or later for built-in MCP support.",
  "Pi MCP 配置无法读取，请修复后重新检测。": "Pi MCP configuration could not be read. Fix it and check again.",
  "无法更新 Pi 配置，请检查文件权限后重试。": "Could not update Pi configuration. Check file permissions and try again.",
  "Pi 与 EasyDraw Skill 均已配置。新建 Pi 会话或执行 /reload 即可使用。": "Pi and the EasyDraw skill are configured. Start a new session or run /reload.",
  "检测到旧的或已停用的 Pi 配置，可一键更新。": "An outdated or disabled Pi configuration was found. Update it here.",
  "Pi 尚未注册 EasyDraw MCP。": "Pi has not registered EasyDraw MCP.",
  "无法检测 Pi 配置，请稍后重试。": "Could not check Pi configuration. Try again later.",
  "Pi 连接已配置。请新建 Pi 会话，或执行 /reload 开始使用 EasyDraw。": "Pi is configured. Start a new session or run /reload to use EasyDraw.",
  "连接 Pi 失败": "Could not connect Pi",
  "添加到 DeepSeek Harness": "Add to DeepSeek Harness",
  "正在检测 DeepSeek Harness 配置。": "Checking DeepSeek Harness configuration.",
  "已配置，新建会话后连接；必要时重启 DeepSeek Harness。": "Configured. Start a new session; restart DeepSeek Harness if needed.",
  "未找到已初始化的 DeepSeek Harness。请安装并启动一次后重新检测。": "DeepSeek Harness has not been initialized. Install and launch it once, then check again.",
  "DeepSeek Harness MCP 配置无法安全更新，请修复后重新检测。": "DeepSeek Harness MCP configuration cannot be safely updated. Fix it and check again.",
  "检测到全局 EasyDraw MCP 覆盖配置，请先手动调整后重新检测。": "A global EasyDraw MCP override was found. Adjust it manually and check again.",
  "无法更新 DeepSeek Harness 配置，请检查文件权限后重试。": "Could not update DeepSeek Harness configuration. Check file permissions and try again.",
  "DeepSeek Harness 与 EasyDraw Skill 均已配置。新建会话即可使用。": "DeepSeek Harness and the EasyDraw skill are configured. Start a new session to use them.",
  "检测到旧的或已停用的 DeepSeek Harness 配置，可一键更新。": "An outdated or disabled DeepSeek Harness configuration was found. Update it here.",
  "DeepSeek Harness 尚未注册 EasyDraw MCP。": "DeepSeek Harness has not registered EasyDraw MCP.",
  "无法检测 DeepSeek Harness 配置，请稍后重试。": "Could not check DeepSeek Harness configuration. Try again later.",
  "DeepSeek Harness 连接已配置。请新建会话；必要时重启 DeepSeek Harness。": "DeepSeek Harness is configured. Start a new session; restart DeepSeek Harness if needed.",
  "连接 DeepSeek Harness 失败": "Could not connect DeepSeek Harness",

  "AI 客户端已连接": "AI client connected",
  "等待客户端连接": "Waiting for a client",
  "有未识别的客户端连接，请重启对应客户端以刷新连接身份。": "An unidentified client is connected. Restart that client to refresh its identity.",
  "添加到 Codex": "Add to Codex",
  "暂不支持自动配置": "Automatic setup is not available yet",
  "即将支持": "Coming soon",
  "画布连接": "Canvas connection",
  "Codex 可以读取画布、提交事务并检查页面截图。":
    "Codex can read the canvas, submit transactions, and inspect page captures.",
  "正在启动 EasyDraw 本地控制服务。":
    "Starting the EasyDraw local control service.",
  "本地控制服务已就绪，等待 Codex 新任务连接。":
    "The local control service is ready and waiting for a new Codex task.",
  "Codex 配置": "Codex setup",
  "正在检测 Codex 配置。": "Checking the Codex configuration.",
  "浏览器预览不提供桌面 MCP 注册。":
    "Desktop MCP registration is unavailable in browser preview.",
  "正在配置": "Configuring",
  "更新 Codex 连接": "Update Codex connection",
  "连接 Codex": "Connect Codex",
  "重新检测": "Check again",
  "正在重新检测": "Checking again",
  "页面容器（Frame）": "Page frame",
  "页面容器（Frame）— F": "Page frame — F",
  "插入图片": "Insert image",
  "支持 PNG、JPG 和 WebP": "Supports PNG, JPG, and WebP",
  "关闭插入图片弹窗": "Close insert image dialog",
  "选择本地图片": "Choose a local image",
  "图片将插入当前选中的页面": "The image will be inserted into the selected page",
  "图片将插入画布当前可视区域": "The image will be inserted into the visible canvas area",
  "取消": "Cancel",
  "选择图片": "Choose image",
  "开始一个项目": "Start a project",
  "打开已有项目，或选择保存位置创建新项目。":
    "Open an existing project or choose where to save a new one.",
  "正在选择保存位置": "Choosing a save location",
  "创建空白画布并立即保存": "Create a blank canvas and save it now",
  "正在选择项目文件": "Choosing a project file",
  "从本地继续编辑已有项目": "Continue editing a local project",
  "正式项目会在停止修改 900ms 后自动保存。":
    "Saved projects are written automatically 900 ms after editing stops.",
  "正在启动本地服务": "Starting local service",
  "Codex 已连接": "Codex connected",
  "等待 Codex 连接": "Waiting for Codex",
  "已保存到本地": "Saved locally",
  "正在保存": "Saving",
  "保存失败": "Save failed",
  "抓手": "Hand",
  "选择": "Selection",
  "矩形": "Rectangle",
  "椭圆": "Ellipse",
  "箭头": "Arrow",
  "线条": "Line",
  "文本": "Text",
  "页面容器": "Page frame",
  "铅笔": "Pencil",
  "激光笔": "Laser pointer",
  "激光笔 — K": "Laser pointer — K",
  "更多形状工具": "More shape tools",
  "关闭更多工具": "Close more tools",
  "v0.2 多页面与素材工作台已就绪":
    "EasyDraw multi-page workspace is ready",
  "素材库已更新，但无法持久保存": "The library was updated but could not be saved",
  "无法检测 Codex 连接": "Could not check the Codex connection",
  "Codex 连接已配置。请新建一个 Codex 任务开始使用 EasyDraw。":
    "Codex is configured. Start a new Codex task to use EasyDraw.",
  "连接 Codex 失败": "Could not connect Codex",
  "图标库读取失败": "Could not load the icon library",
  "自动保存失败": "Autosave failed",
  "设计计划坐标解析失败": "Could not resolve design plan coordinates",
  "设计计划预检失败": "Design plan preflight failed",
  "设计计划中的图标只能在桌面应用中使用":
    "Icons in design plans are only available in the desktop app",
  "设计区块中的图标和图片占位只能在桌面应用中使用":
    "Icons and image placeholders in design sections are only available in the desktop app",
  "页面已删除，可使用撤销恢复": "Page deleted. Use Undo to restore it.",
  "添加素材失败": "Could not add the library item",
  "插入素材失败": "Could not insert the library item",
  "删除素材失败": "Could not delete the library item",
  "新建项目失败": "Could not create the project",
  "打开项目失败": "Could not open the project",
  "打开失败": "Open failed",
  "手动": "Manual",
  "未检测到 Codex。安装 Codex 后可在这里一键连接。":
    "Codex was not detected. Install Codex to connect it here.",
  "未找到可运行的 Codex 命令。请安装或修复 Codex 后重新检测。":
    "No working Codex command was found. Install or repair Codex, then check again.",
  "Codex 尚未注册 EasyDraw MCP。": "Codex has not registered the EasyDraw MCP.",
  "Codex 与 EasyDraw Skill 均已配置。新建 Codex 任务即可使用。":
    "Codex and the EasyDraw skill are configured. Start a new Codex task to use them.",
  "检测到旧的 EasyDraw MCP 路径，可一键更新到当前安装。":
    "An older EasyDraw MCP path was found. Update it to the current installation.",
  "MCP 已配置，但 EasyDraw Skill 需要安装或更新。":
    "MCP is configured, but the EasyDraw skill must be installed or updated.",
  "未检测到 Codex，无法注册 EasyDraw MCP":
    "Codex was not detected, so the EasyDraw MCP could not be registered",
  "EasyDraw 主窗口尚未就绪": "The EasyDraw main window is not ready",
  "该项目路径尚未由用户授权，请先打开项目或使用“另存项目”":
    "This project path has not been authorized. Open the project or use Save project as.",
  "该项目路径尚未由用户授权，请使用“另存项目”":
    "This project path has not been authorized. Use Save project as.",
  "素材路径无效": "The asset path is invalid",
  "请先打开项目，或新建并保存项目":
    "Open a project, or create and save one first",
  "素材路径超出项目目录": "The asset path is outside the project folder",
  "内置图标不存在，请重新打开图标库":
    "The built-in icon does not exist. Reopen the icon library.",
  "图标文件为空或超过 2 MB": "The icon file is empty or exceeds 2 MB",
  "不允许直接指定素材路径": "Asset paths cannot be specified directly",
  "仅支持 PNG、JPG、WEBP、GIF 和 SVG":
    "Only PNG, JPG, WEBP, GIF, and SVG are supported",
  "无法读取该图片素材": "Could not read the image asset",
  "剪贴板素材仅支持 PNG、JPG、WebP、GIF 和 SVG":
    "Clipboard assets support only PNG, JPG, WebP, GIF, and SVG",
  "剪贴板素材内容为空": "The clipboard asset is empty",
  "无法读取剪贴板中的图片": "Could not read the image from the clipboard",
  "批量导出文件名无效": "A batch export file name is invalid",
  "无法创建剪贴板图片": "Could not create the clipboard image",
  "操作参数无效": "The operation parameters are invalid",
  "页面容器关系验证失败": "Page frame relationship validation failed",
  "项目状态验证失败": "Project state validation failed",
  "手动画布状态验证失败": "Manual canvas state validation failed",
  "手动画布调整": "Manual canvas edit",
  "选择中包含不存在或不可操作的元素":
    "The selection contains missing or unsupported elements",
  "找不到要复制的页面": "Could not find the page to copy",
  "该工具不在 EasyDraw 当前元素协议中":
    "This tool is not supported by the current EasyDraw element protocol",
  "画布尚未就绪": "The canvas is not ready",
  "当前项目没有可用页面": "This project has no available page",
  "请先在 EasyDraw 中打开项目或新建项目":
    "Open or create a project in EasyDraw first",
  "素材文件仅能从桌面项目中读取":
    "Asset files can only be read from a desktop project",
  "内置图标库仅能从桌面应用中搜索":
    "The built-in icon library can only be searched in the desktop app",
  "内置图标库仅能从桌面应用中读取":
    "The built-in icon library can only be read in the desktop app",
  "内置图标库只能从桌面应用中使用":
    "The built-in icon library is only available in the desktop app",
  "内置图片占位符只能从桌面应用中使用":
    "Built-in image placeholders are only available in the desktop app",
  "缺少 iconId": "iconId is required",
  "图标必须完整放置在目标页面边界内":
    "The icon must fit completely inside the target page",
  "图片占位符必须完整放置在目标页面边界内":
    "The image placeholder must fit completely inside the target page",
  "无法解析内置图片占位符的 SVG 矢量路径":
    "Could not parse the built-in image placeholder SVG paths",
  "图片占位素材写入失败": "Failed to write the image placeholder asset",
  "放置图片占位符": "Place image placeholder",
  "AI 已将内置图片占位符放置到画布":
    "AI placed the built-in image placeholder on the canvas",
  "最近一笔事务不是可撤销的 AI 事务":
    "The latest transaction is not an undoable AI transaction",
  "页面任务不能重复声明同一个页面":
    "A page task cannot declare the same page more than once",
  "请在 EasyDraw 桌面应用中导入素材":
    "Import assets from the EasyDraw desktop app",
  "请在 EasyDraw 桌面应用中粘贴 SVG 代码":
    "Paste SVG code in the EasyDraw desktop app",
  "请在 EasyDraw 桌面应用中粘贴图片":
    "Paste images in the EasyDraw desktop app",
  "请先保存项目，再粘贴图片": "Save the project before pasting an image",
  "SVG 代码中没有可编辑的 path，请复制完整的 SVG 源码":
    "The SVG contains no editable paths. Copy the complete SVG source.",
  "单个素材不能超过 25 MB": "An asset cannot exceed 25 MB",
  "已粘贴 SVG 图标": "SVG icon pasted",
  "请先选择矩形、圆形、线条、箭头或文字，再添加到素材库":
    "Select a rectangle, ellipse, line, arrow, or text element before adding it to the library",
  "当前项目没有可插入素材的页面":
    "This project has no page where the library item can be inserted",
  "该素材不包含 EasyDraw 当前支持的元素":
    "This library item contains no elements supported by EasyDraw",
  "未命名素材": "Untitled item",
  "请在 EasyDraw 桌面应用中创建项目":
    "Create projects in the EasyDraw desktop app",
  "已创建并保存新项目": "New project created and saved",
  "请在 EasyDraw 桌面应用中打开项目":
    "Open projects in the EasyDraw desktop app",
  "浏览器预览不支持本地项目保存":
    "Browser preview cannot save local projects",
  "项目与素材已安全保存，可整体移动到其他电脑":
    "The project and its assets are saved and can be moved together to another computer",
  "已撤销上一笔完整事务": "Undid the previous transaction",
  "没有可撤销的事务": "There is no transaction to undo",
  "已重做上一笔完整事务": "Redid the previous transaction",
  "没有可重做的事务": "There is no transaction to redo",
  "截图导出失败": "Page export failed",
  "批量导出失败": "Batch export failed",
  "请在桌面应用中复制页面截图":
    "Copy page captures from the desktop app",
  "AI 正在编辑页面：{pages}": "AI is editing pages: {pages}",
};

const iconGroups: Record<string, string> = {
  箭头: "Arrows",
  建筑: "Buildings",
  商务: "Business",
  沟通: "Communication",
  设计: "Design",
  开发: "Development",
  设备: "Device",
  文档: "Document",
  编辑: "Editor",
  金融: "Finance",
  食物: "Food",
  游戏与运动: "Game & Sports",
  健康与医疗: "Health & Medical",
  品牌: "Logos",
  地图: "Map",
  媒体: "Media",
  其他: "Others",
  系统: "System",
  用户与表情: "User & Faces",
  天气: "Weather",
  未分组: "Ungrouped",
};

export const getInitialLocale = (): AppLocale => {
  if (typeof window === "undefined") return "zh-CN";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "en" || stored === "zh-CN" ? stored : "zh-CN";
};

const interpolate = (
  message: string,
  values?: Record<string, string | number>,
) =>
  message.replace(/\{(\w+)\}/g, (match, key: string) =>
    values && key in values ? String(values[key]) : match,
  );

export const translate = (
  locale: AppLocale,
  message: string,
  values?: Record<string, string | number>,
) => interpolate(locale === "en" ? english[message] ?? message : message, values);

export const translateIconGroup = (locale: AppLocale, group: string) =>
  locale === "en" ? iconGroups[group] ?? group : group;

export const localizeRuntimeMessage = (
  locale: AppLocale,
  value: unknown,
): string => {
  const message = value instanceof Error ? value.message : String(value);
  if (locale !== "en") return message;
  const direct = english[message];
  if (direct) return direct;

  const patterns: Array<[RegExp, string]> = [
    [/^页面容器 (.+) 不存在$/, "Page frame $1 does not exist"],
    [/^页面 (.+) 不存在$/, "Page $1 does not exist"],
    [/^页面 (.+) 已存在$/, "Page $1 already exists"],
    [/^素材 (.+) 不存在$/, "Asset $1 does not exist"],
    [/^图标 (.+) 不存在$/, "Icon $1 does not exist"],
    [/^元素 (.+) 不存在$/, "Element $1 does not exist"],
    [/^元素 (.+) 已存在$/, "Element $1 already exists"],
    [/^无法解析 SVG 图标：(.+)$/, "Could not parse SVG icon: $1"],
    [/^素材“(.+)”缺失，画布已保留可定位的降级元素$/, "Asset “$1” is missing. A positioned fallback remains on the canvas."],
    [/^已创建 (.+)$/, "Created $1"],
    [/^已复制页面及 (\d+) 个元素$/, "Copied the page and $1 elements"],
    [/^页面已重命名为“(.+)”$/, "Page renamed to “$1”"],
    [/^删除“(.+)”及其中 (\d+) 个元素？此操作可以撤销。$/, "Delete “$1” and its $2 elements? You can undo this action."],
    [/^已将“(.+)”插入画布$/, "Inserted “$1” onto the canvas"],
    [/^已粘贴图片“(.+)”$/, "Pasted image “$1”"],
    [/^粘贴 SVG 代码失败：(.+)$/, "Could not paste SVG code: $1"],
    [/^粘贴图片失败：(.+)$/, "Could not paste image: $1"],
    [/^已插入图标“(.+)”$/, "Inserted icon “$1”"],
    [/^插入图标失败：(.+)$/, "Could not insert the icon: $1"],
    [/^已将 (\d+) 个元素保存为“(.+)”$/, "Saved $1 elements as “$2”"],
    [/^已将“(.+)”插入当前页面$/, "Inserted “$1” into the current page"],
    [/^从素材库删除“(.+)”？$/, "Delete “$1” from the library?"],
    [/^已删除“(.+)”$/, "Deleted “$1”"],
    [/^已打开项目：(.+)$/, "Opened project: $1"],
    [/^已提交单笔 AI 事务，修订 (\d+)$/, "Submitted one AI transaction at revision $1"],
    [/^已导出 (.+) PNG$/, "Exported $1 PNG"],
    [/^已按页面顺序导出 (\d+) 张 PNG$/, "Exported $1 PNG files in page order"],
    [/^已复制 (.+)x 页面截图$/, "Copied the page capture at $1x"],
    [/^AI 已完成设计计划：(\d+) 个区块$/, "AI completed the design plan: $1 sections"],
    [/^AI 已完成设计区块：(.+)$/, "AI completed the design section: $1"],
    [/^AI 已批量放置 (\d+) 个图标$/, "AI placed $1 icons"],
    [/^AI 已放置图标“(.+)”$/, "AI placed icon “$1”"],
    [/^AI 已批量放置 (\d+) 个图片占位符$/, "AI placed $1 image placeholders"],
    [/^AI 事务已提交：(.+)$/, "AI transaction submitted: $1"],
    [/^AI 正在处理：(.+)$/, "AI is working: $1"],
    [/^AI 已完成：(.+)$/, "AI completed: $1"],
    [/^图标 (.+) 的素材写入失败$/, "Failed to write the asset for icon $1"],
    [/^素材缺失：(.+)$/, "Missing asset: $1"],
    [/^素材文件不存在：(.+)$/, "Asset file does not exist: $1"],
    [/^已撤销：(.+)$/, "Undid: $1"],
    [/^已重做：(.+)$/, "Redid: $1"],
    [/^对齐 (\d+) 个元素$/, "Aligned $1 elements"],
    [/^水平分布 (\d+) 个元素$/, "Distributed $1 elements horizontally"],
    [/^垂直分布 (\d+) 个元素$/, "Distributed $1 elements vertically"],
    [/^组合 (\d+) 个元素$/, "Grouped $1 elements"],
    [/^解除 (\d+) 个元素的组合$/, "Ungrouped $1 elements"],
    [/^操作基于修订 (\d+)，当前修订为 (\d+)$/, "The operation targets revision $1, but the current revision is $2"],
    [/^REVISION_CONFLICT: 操作基于修订 (\d+)，当前修订为 (\d+)$/, "REVISION_CONFLICT: the operation targets revision $1, but the current revision is $2"],
  ];
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  const separatorIndex = message.indexOf("：");
  if (separatorIndex > 0) {
    const prefix = message.slice(0, separatorIndex);
    const translatedPrefix = english[prefix];
    if (translatedPrefix) {
      return `${translatedPrefix}: ${localizeRuntimeMessage(
        locale,
        message.slice(separatorIndex + 1),
      )}`;
    }
  }
  return message;
};
