# 安全说明 / Security Policy

## 报告安全问题

如果你发现安全漏洞，请**不要**直接开公开 Issue，请通过以下方式私下告知：

- 在仓库的 **Security → Report a vulnerability** 提交私有安全公告：
  <https://github.com/MarkStudio0913/MarkStudio/security/advisories/new>
  （若该入口尚未启用，请先在 GitHub 仓库的 Settings → Security 中开启
  **Private vulnerability reporting**），或
- 直接在 GitHub 上私信维护者 [@MarkStudio0913](https://github.com/MarkStudio0913)。

请尽量附上：受影响版本、复现步骤、最小化的 PoC 文档（如果是「打开恶意 `.md` 就会触发」这一类问题，请提供 `.md` 内容）、以及你判断的影响范围。
我们会在确认后尽快修复，并在 Release Notes 中致谢（如你希望署名）。

**支持范围**：仅维护最新发布版本与 `main` 分支。

**请勿**把漏洞细节、利用代码或受影响的用户数据发在公开 Issue、讨论区或社交平台上，直到修复版本发布。

## 安全设计概览

MarkStudio 是一个**本地、离线优先**的桌面 Markdown 编辑器。理解下面几点有助于评估风险边界：

| 机制 | 现状 |
| --- | --- |
| 渲染进程隔离 | `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true` |
| 主进程暴露面 | preload 用**白名单**限制可调用的 IPC 通道（`src/main/preload.js` 的 `ALLOW_INVOKE`），渲染层只能调用清单内的通道 |
| 网络出口 | 渲染层 CSP 的 `connect-src` / `img-src` **不含 `http(s):`**，渲染进程无法发起任何网络请求；主进程只在用户主动触发「翻译」时访问外部接口 |
| 文档渲染 | 编辑器主路径用 Vditor 的 Lute 实例（`sanitize: true`）；超大文件的「快速阅读模式」用独立 Lute 实例，已显式 `SetSanitize(true)` |
| 导出产物 | 导出 HTML 自带严格 CSP（`script-src 'none'`、`connect-src 'none'`），剥离正文 `<script>`，并把本地资源内联为 `data:`（不泄露本机路径/用户名） |
| 本地文件访问 | 图片等资源按文档中的路径读取（这是编辑器功能的必要条件）；**不要打开来源不可信的 `.md`** 并对其执行「导出」——导出会把文档引用的本地图片内联进产物 |

## 已知的固有风险（设计取舍，非缺陷）

1. **文档可引用本地文件**。Markdown 里的图片路径会被解析并读取（编辑器要能显示本地图片）。因此一个恶意 `.md` 可以引用你机器上的文件路径，让编辑器/导出产物去读取它。这是所有桌面 Markdown 编辑器的共性，缓解方式是不要打开不可信文档。
2. **`script-src 'unsafe-inline'` 无法移除**。内嵌的 Vditor 在图片预览浮层里使用了内联 `onclick` 属性（`vendor/vditor/dist/index.js`），去掉 `'unsafe-inline'` 会导致该功能失效。这是当前 CSP 中唯一的宽松项，也是上面的净化（`SetSanitize`）必须生效的原因。
3. **翻译会把选中的文本发给第三方**。默认走 MyMemory 公共接口、可选 Microsoft Azure Translator。翻译内容离开本机——**请勿翻译含敏感信息的文本**。详见 README「隐私说明」。
4. **`--remote-debugging-port`**。开发工具（`tools/cdp-*.js`）依赖 DevTools 协议端口 9222。应用正常启动**不会**打开该端口，只有开发者显式传参才会开启；切勿在正式使用时手动开启。

## 供应链与发布

- `package-lock.json` 中 325 个依赖条目**全部带 sha512 `integrity`**，无 `git:`/`file:`/明文 `http:` 来源。
- 仓库自带 `.npmrc` 指向 npmmirror（国内镜像，便于大陆网络安装），**这是可选的**：如不需要可删除（见文件内注释）。删除后请重新生成 `package-lock.json`。
- GitHub Actions 目前将 `actions/*` 固定在可变的 major tag 上。更严格的做法是**固定到 commit SHA**（可用 Dependabot 自动升级）；workflow 已按最小权限配置：顶层 `contents: read`，只有 `release` job 拥有 `contents: write`。
- Windows 构建在打包后会运行 `node tools/asar-check.js`（300+ 项静态校验，含 vendor 补丁标记），补丁丢失会导致构建失败而不是静默发出。

## 依赖漏洞

第三方依赖（Electron / Vditor / KaTeX / highlight.js / Lute / iconv-lite）的漏洞属于上游问题。
许可与出处见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。请注意 Electron 31.x 已进入维护尾期，长期使用建议跟进 Electron 版本升级。
