# Mac 本机测试指南

更新日期：2026-10-21

## 本次结果

| 检查 | 结果 |
| --- | --- |
| `npm run verify:local` | 通过：类型检查、59 个测试文件 / 379 项单测、三浏览器构建、生产产物检查、Manifest、Firefox lint、密钥扫描 |
| `npm run test:e2e:extension` | 14 项通过，无跳过；包含填写、撤销、非法值拒绝、安全边界、桌面及 320px 布局、异步变化、登录态清理、请求无响应重试和业务码 401 |
| `npm run test:e2e:ai` | 1 项通过；检查真实 Service Worker 请求中的 URL 和联系方式脱敏，审核、编辑和拒绝草稿 |
| `npm run test:contracts` | 未通过：网站仓库缺少 `lib/extension-ai.ts`；Node 契约自动识别同级 `ai-resume-node` |
| Firefox runtime | 未通过：临时扩展安装超时；详细日志显示当前代理执行沙箱限制访问 Firefox 应用支持目录 |
| Firefox fixture | 调试端口与进程清理已修复并有脚本单测，尚无修复后的真实运行通过证据；需在正常终端执行 |
| 官网生产登录、真实 AI、招聘网站申请表 | 尚未验收，本地 mock 不能代替生产结果 |

没有修改网站或 Node 仓库，没有提交代码。完整发布门禁仍未通过。

## 登录一直检查时

1. 在 `chrome://extensions` 重新加载 Offer Star，确认加载目录为 `.output/chrome-mv3`。
2. 同时刷新 `https://offer.gfjianli.com/` 和招聘页面，使两边加载新版内容脚本；只关闭再打开面板不够。
3. 在官网本人完成登录，回到招聘页点击“刷新登录状态”。
4. 网络请求无响应约 12 秒后应显示“简历服务响应超时”，后台消息无响应约 15 秒后应出现兜底错误；不能无限转圈。
5. 登录过期应返回未登录状态，不能继续显示缓存简历。仍有问题时提供面板提示和脱敏截图，不提供 token、密码或验证码。

缓存 E2E 明确模拟简历服务离线；业务码 401 独立测试并禁止缓存回退。这些测试没有验证真实账号的官网登录成功。

## 自动测试

在插件项目根目录的 macOS 终端执行。依赖已存在时不必重复安装；新环境先执行：

```bash
npm ci
npx playwright install chromium firefox
```

按顺序执行，避免多个命令同时改写扩展构建：

```bash
npm run verify:local
npm run test:e2e:extension
npm run test:e2e:ai
```

浏览器测试使用独立临时 profile，不使用日常 Chrome 登录态。Chromium 默认使用与当前 Playwright 匹配的测试浏览器，指定浏览器可以设置 `CHROME_EXECUTABLE_PATH`，路径错误会明确失败，不会静默跳过扩展测试。

AI 测试使用本地网关，不需要真实 API Key，结束后恢复生产 Chrome 构建。截图及错误上下文放在系统临时目录的 `offer-star-extension-e2e` 下，不进入仓库。

Firefox 在正常 macOS 终端中另行执行：

```bash
npm run test:firefox:runtime
npm run test:firefox:fixture
```

默认优先发现已安装的 Firefox，找不到时使用 Playwright Firefox。需要指定正式安装版时：

```bash
FIREFOX_EXECUTABLE_PATH="/Applications/Firefox.app/Contents/MacOS/firefox" npm run test:firefox:runtime
FIREFOX_EXECUTABLE_PATH="/Applications/Firefox.app/Contents/MacOS/firefox" npm run test:firefox:fixture
```

fixture 自动启动并清理本地测试页和临时浏览器，使用 web-ext 实际分配的调试端口，不需要手工设置端口。执行前关闭自己启动的 `dev:fixtures`，避免占用 4173 端口。失败需保留中文错误，不能视为填写通过。

## 手工安装和测试

1. 执行 `npm run build:chrome`。
2. Chrome 打开 `chrome://extensions`，开启开发者模式，点击“加载已解压的扩展程序”，选择项目下 `.output/chrome-mv3`。已经安装则点击扩展的刷新按钮，并刷新测试网页。
3. 在项目终端执行 `npm run dev:fixtures`，保持该终端运行。
4. Chrome 打开 `http://127.0.0.1:4173/simple.html`，确认右下角悬浮球存在。点击它，确认面板打开；关闭后点击浏览器工具栏插件图标，应打开同一个网页内面板。
5. 点击“扫描当前页面”，应识别姓名、手机号、邮箱三个字段。未登录时至少可以验证扫描；完整填写需要先登录官网并选择脱敏测试简历。官网登录、简历读取失败请记录，不修改浏览器存储伪造真实登录结果。
6. 选择测试简历并确认填写，检查三个输入框，再点击“撤销本次填写”，应恢复原值。
7. 打开 `http://127.0.0.1:4173/` 测试已有值和附件。“仅填写新增内容”应保留已有姓名；“全部覆盖重填”应使用所选简历值。照片、PDF 附件先显示待确认预览，确认后才写入页面控件。
8. 需要非法值拒绝、动态表单过期、登录态清理等可重复验证时，运行上面的自动扩展 E2E，避免在真实简历中故意保存错误数据。
9. 完成后在本地测试页终端按 `Control+C` 停止服务。

Firefox 手工安装使用 `about:debugging#/runtime/this-firefox` 的“临时加载附加组件”，选择 `.output/firefox-mv2/manifest.json`，重复入口和表单测试。

## URL 和 AI 隐私检查

打开下列只含虚构信息的本地地址并扫描：

```text
http://127.0.0.1:4173/simple.html?email=url-private%40example.com&phone=13812345678#private-fragment
```

面板地址和扫描日志不应出现查询参数或片段。AI 的职位描述、自我介绍摘要、技能和字段标签会在出站前清除常见手机号、邮箱和身份证号；查询参数、片段、URL 用户名密码不会发送给 AI。非法或非 HTTP/HTTPS 地址被拒绝。本地用于页面导航、版本判断和填写的数据不被此脱敏流程改写。

`npm run test:e2e:ai` 会直接断言实际网关请求，建议优先用它验证，不需要向生产 AI 发送个人信息。此机制不是任意文本的完整匿名化：姓名、公司名、自由文本中的其他隐私，以及路径中的不透明标识仍需谨慎处理。密钥扫描也只覆盖已定义匹配规则，不等于完整安全审计。

## 剩余门禁

`verify:local` 只证明插件本地检查通过；`verify` 额外严格检查插件、网站和 Node 三方字段契约，`verify:full` 再运行扩展 E2E、AI E2E、Firefox runtime 和 fixture。

当前网站源码缺少原约定的扩展 AI 契约。需先确定正确网站版本或接口位置，而非创建一个插件字段副本冒充服务端。真实文件位于其他位置时，通过 `OFFER_STAR_WEB_CONTRACT_PATH` 和 `OFFER_STAR_NODE_CONTRACT_PATH` 指定其绝对路径，再执行 `npm run test:contracts`。

恢复契约和 Firefox 环境后执行 `npm run verify:full`。随后由用户登录 Moka / 北森等实际申请表，处理验证码、确认附件和填写，记录站点、浏览器、扫描字段数、成功及失败字段。不点击最终提交或投递；BOSS 的职位详情或沟通页没有申请表时，不应据此判定字段扫描失败。
