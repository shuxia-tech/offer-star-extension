# Offer Star 浏览器插件

开发阶段的阶段规划、交互基线、站点适配规则和测试完成标准见 [开发与验收计划](docs/开发与验收计划.md)；真实站点的公开入口和回归状态见 [真实站点回归矩阵](docs/真实站点回归矩阵.md)，需要用户登录的页面见 [真实回归登录清单](docs/真实回归登录清单.md)。换电脑后先阅读 [AGENTS.md](AGENTS.md) 和 [CLAUDE.md](CLAUDE.md)，其中包含项目边界、当前进度、已知限制、恢复步骤和后续工作清单。

## 后续工作

完整的阶段计划、当前未完成事项、电脑维修后的恢复步骤、需要用户配合的登录与真实站点验收，以及每项功能的完成标准，统一见 [后续工作与交接清单](docs/后续工作与交接清单.md)。后续开发应先按该文档的 P0 顺序开始，再推进 P1/P2 工作。

Mac 上的自动验收、Chrome / Firefox 手工安装、测试页及当前阻断见 [Mac 测试指南](docs/Mac测试指南.md)。插件独立门禁使用 `npm run verify:local`；它不代替包含跨项目契约的 `verify` 和最终发布门禁。

Offer Star 简历助手使用 WXT、React 和 TypeScript 构建，面向 Chrome、Edge 和 Firefox。插件的目标是扫描招聘网站申请表单，优先使用通用 HTML 规则识别字段，只有遇到异步下拉、动态经历、附件路由或分步骤页面时才使用站点专用策略。

## 开发环境

- Node.js 20 或更高版本
- npm
- Chrome 或 Edge 用于 Chromium 扩展 E2E
- Firefox 用于网页内悬浮面板手工验收

安装依赖：

```powershell
npm ci
```

启动开发模式：

```powershell
npm run dev
npm run dev:chrome
npm run dev:firefox
```

## 验证命令

提交代码前至少执行：

```powershell
npm run typecheck
npm test -- --run
npm run build:all
npm run test:manifests
```

也可以直接执行汇总检查：

```powershell
npm run verify
```

需要在本机完成最终验收时执行完整门禁：

```powershell
npm run verify:full
```

`verify:full` 会在 `verify` 的基础上继续执行 Chromium 扩展 E2E、AI E2E、Firefox runtime 和 fixture；它要求本机可以启动相应测试浏览器。

AI 扩展成功路径可以单独执行：

```powershell
npm run test:e2e:ai
```

该命令临时构建一个只用于测试的 Chrome 扩展，把 AI 请求指向脱敏本地 mock 网关，验证 Service Worker 请求、AI 草稿展示、编辑和拒绝；测试结束后会自动恢复默认生产构建，产物不会保留 localhost 地址。

`verify` 会按顺序执行类型检查、全量单元测试、Chrome/Edge/Firefox 三套构建、Manifest 契约校验、插件/Web/Node 字段契约校验、Mozilla `web-ext lint` 和密钥扫描；`verify:full` 再执行真实浏览器 E2E 和 Firefox runtime smoke。Firefox lint 当前只允许构建产物的已知 React 打包 `innerHTML` 警告，不允许 Manifest 错误。

Firefox 运行时安装 smoke（需要本机 Firefox）：

```powershell
npm run test:firefox:runtime
```

如果 Firefox 是通过 `-start-debugger-server` 启动的，可以对已经打开的真实招聘页面执行只读页面冒烟检查。脚本只验证目标标签页和网页悬浮球是否注入，不点击页面、不填写表单，也不读取登录凭证：

```powershell
$env:FIREFOX_DEBUG_PORT='9728'
npm run test:firefox:page
```

端口需要替换为当前 Firefox 调试端口。脚本会脱敏 URL 查询参数；如果页面处于 `_security_check` 或验证码状态，会明确记录为安全验证边界，不会把它误报为表单填写通过。

对本地脱敏表单还可以额外检查控件是否真实存在，多个 CSS 选择器用英文逗号分隔：

```powershell
$env:FIREFOX_SMOKE_HOST='127.0.0.1'
$env:FIREFOX_SMOKE_SELECTORS='input[name="name"],input[name="phone"],input[name="email"]'
npm run test:firefox:page
```

runtime 只验证 Firefox 能启动并接受临时扩展，不代替表单交互 E2E。脚本自动识别 macOS、Windows、Linux 的 Firefox 安装路径，找不到时使用 Playwright 测试版；其他安装路径通过 `FIREFOX_EXECUTABLE_PATH` 指定。

当前测试包含通用表单、站点夹具、异步下拉、动态区块、附件、AI 映射、值格式校验、页面过期保护和一键填写安全门槛。测试日志使用中文，允许在开发阶段保留 `console.info`、`console.warn` 和 `console.error`，但不得打印 token、API Key、手机号、邮箱、身份证号或完整简历内容。

Edge 真实扩展回归：

```powershell
$env:CHROME_EXECUTABLE_PATH='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:e2e:extension
```

这组测试覆盖网页内悬浮入口、悬浮面板 iframe 展开、简历预览跳转、刷新去重、通用表单扫描和填写、登录态缓存简历后一键填写、非法值拒绝、照片/简历附件按 `accept` 路由、表单异步变化后的悬浮面板过期提示以及备用扩展页面加载。

## 浏览器手工安装

构建后会生成：

- `.output/chrome-mv3`：Chrome
- `.output/edge-mv3`：Edge
- `.output/firefox-mv2`：Firefox

不要加载项目根目录下的 `dist/`：它是历史开发产物，不属于当前 WXT 构建流程，可能缺少最新的登录参数和悬浮面板修复。每次验证前先执行对应的 `npm run build:*`，只从上面三个 `.output` 目录加载扩展。

Chrome 和 Edge 打开扩展管理页面，开启开发者模式，选择“加载已解压的扩展”，分别选择对应目录。Firefox 在 `about:debugging#/runtime/this-firefox` 选择“临时加载附加组件”，加载 `.output/firefox-mv2/manifest.json`，然后验证工具栏入口、网页内悬浮面板、通用表单和特殊控件。

Firefox 如果由于临时扩展或自动化驱动限制无法完成自动化测试，必须记录为环境阻断；不能把跳过测试当成业务通过。构建产物仍由 `npm run test:manifests` 检查无 `sidebar_action`、扩展 ID、权限和内容脚本匹配规则。

## 用户流程验收

1. 打开招聘网站申请页面，点击网页右下角悬浮球；面板会直接在当前网页右侧展开。浏览器工具栏入口与网页悬浮球使用同一个悬浮面板入口。
2. 首次使用时点击“打开 Offer Star 登录”，新标签页会直接打开登录弹窗；登录并创建至少一份简历后返回招聘页面，面板会自动刷新，也可以点击“刷新登录状态”。
3. 在悬浮面板中点击“扫描当前页面”。
4. 普通高置信度字段可以使用“一键填写”；存在低置信度字段、敏感问题、附件或页面过期时，必须先查看匹配结果并人工确认。
5. 填写完成后检查页面，不自动点击“提交”“投递”或“立即申请”。
6. 对失败字段复制脱敏诊断报告，重新扫描或手动修正后再继续。

## 功能完成标准

一个功能只有同时满足以下条件才算完成：

- 有独立实现和中文日志。
- 有正常路径测试。
- 有至少一个失败、安全边界或异常路径测试。
- 影响真实页面时有 Playwright 或 Edge 手工验收证据。
- `npm run typecheck`、扩展全量单测、相关构建均通过。
- 文档中的测试数量、站点夹具数量和实际输出一致。

## AI 配置

扩展不保存 DeepSeek API Key。AI 请求由 `offer-star-web` 服务端代理，服务端读取 `DEEPSEEK_API_KEY`、可选的 `DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL`。模型输出必须是结构化 JSON，并经过 Zod 校验；低置信度字段不会自动进入填写值，草稿必须由用户确认。

## 日志和问题定位

日志前缀按运行位置区分：

- `[Offer Star][Content]`：页面扫描、控件填写、附件和页面变化。
- `[Offer Star][Background]`：扩展消息、登录状态、缓存和 AI 请求。
- `[Offer Star][FloatingPanel]`：网页内悬浮面板的用户操作、预览、确认和错误提示。
- `[扩展AI]`：Web 服务端 AI 网关。

遇到问题时先记录浏览器、目标站点、页面 URL（去除查询参数）、扫描字段数量、失败字段和失败原因，不要提交用户简历原文或任何密钥。

