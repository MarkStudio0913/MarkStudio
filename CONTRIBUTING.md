# 贡献指南 / Contributing

感谢你愿意为 MarkStudio 出一份力！本文说明开发环境、代码约定与提交流程。

## 目录

- [行为准则](#行为准则)
- [开始之前](#开始之前)
- [开发环境](#开发环境)
- [项目结构与关键约定](#项目结构与关键约定)
- [提交改动](#提交改动)
- [Pull Request 检查清单](#pull-request-检查清单)
- [报告问题](#报告问题)
- [安全漏洞](#安全漏洞)

## 行为准则

参与本项目即表示你同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 开始之前

- **请先开 Issue 再动手**：较大的改动（新功能、重构、依赖升级）建议先开 Issue 讨论，避免你写完才发现方向不一致。
- **小而聚焦**：一个 PR 只做一件事。修 bug 的 PR 里不要顺手重排格式或改无关代码——那会让 review 变得非常困难。
- **不要提交构建产物**：`dist/`、`node_modules/`、`tools/big*.md` 等已在 `.gitignore` 中。

## 开发环境

要求 **Node.js ≥ 18**（推荐 20，与 CI 一致）与 npm。

```bash
git clone <你的 fork 地址>
cd MarkStudio-OpenSource
npm install          # postinstall 会从 npm 包重建 vendor/vditor/dist 并还原 MarkStudio 补丁
npm start            # 以开发模式启动应用
npm run smoke        # 冒烟测试：启动 → 自动编辑 → 保存 → 校验落盘
```

### 网络受限时的镜像

仓库自带 `.npmrc` 指向 npmmirror（国内镜像）。不需要的话可以删除，但那样需要重新生成 `package-lock.json`：

```bash
rm .npmrc
npm install --package-lock-only
```

### 三平台打包

```bash
npm run dist:win     # Windows: NSIS 安装版 + Portable
npm run dist:mac     # macOS: DMG + ZIP（未配证书时为未签名包）
npm run dist:linux   # Linux: AppImage + deb
```

`electron-builder` 无法交叉构建，每个平台的产物必须在对应系统上构建。CI（`.github/workflows/build.yml`）会在推 tag 时于三个原生 runner 上分别构建并汇总到同一个 Release。

## 项目结构与关键约定

```
src/main/        主进程：窗口、托盘、文件关联、导出、翻译代理
  main.js        窗口生命周期、IPC handler、ZIP(docx) 组装、托盘
  preload.js     contextBridge 白名单（新增 IPC 通道必须同时加进 ALLOW_INVOKE）
  translate.js   翻译网络请求（渲染层受 CSP 限制，只能由主进程发起）
src/renderer/    渲染层
  index.html     页面骨架 + CSP
  renderer.js    编辑器 / 快速阅读模式 / 大纲 / 查找 / 导出
  docx-gen.js    Word OOXML 生成器（零依赖）
  style.css      样式
vendor/vditor/   vendored 的 Vditor 3.11.3（含本地补丁）
tools/           开发/测试工具（不随安装包分发）
scripts/         构建辅助（vendor 复制、图标生成、冒烟测试）
```

### 约定 1：第三方代码必须 vendored 且可重建

`vendor/vditor/dist` **不是**手工维护的目录。`scripts/copy-vendor.js` 会在 `postinstall` 时：

1. 从 `node_modules/vditor/dist` 重新复制；
2. 按 `PRUNE` 清单裁掉未启用的渲染器（mermaid / mathjax / plantuml 等，约 15MB）；
3. **备份并还原** `dist` 下的 `LICENSE` / `COPYING` / `NOTICE`（上游 npm 包缺 Lute 的许可证，本仓库已补齐，见 `vendor/vditor/dist/js/lute/LICENSE`）；
4. 备份并还原带 `MarkStudio R39` 标记的 `index.js`（本地补丁）。

**因此**：`vendor/vditor/dist/index.js` 里的补丁必须以 `// MarkStudio R##: ...` 注释标注，否则 `npm install` 时会被上游原版覆盖。

### 约定 2：改动 vendor 补丁后必须跑校验

`tools/asar-check.js` 对打包产物做 300+ 项静态校验（含 vendor 补丁标记）：

```bash
npm run dist:win
node tools/asar-check.js dist/win-unpacked/resources/app.asar
```

Windows CI 在打包后会执行同一条命令，**补丁丢失会让构建失败**，所以请不要绕过它。

### 约定 3：渲染层不能直接访问网络或 Node

- 渲染层 CSP（`src/renderer/index.html`）的 `connect-src` / `img-src` **不含 `http(s):`**，不要试图在渲染层 fetch。
- 需要网络请走主进程（参考 `src/main/translate.js` + `translate:text` 通道）。
- 需要文件/系统能力请走 preload 白名单，不要开 `nodeIntegration`。

### 约定 4：渲染层禁止未净化地写 innerHTML

文档内容是不可信输入。若要把 Markdown 渲染结果写进 `innerHTML`：

- 必须使用开启了 `SetSanitize(true)` 的 Lute 实例（参考 `readerLute()`）；
- 或用 `textContent`、`escHtml()`。

`tools/asar-check.js` 中有对应的 `SEC-*` 断言，改坏会失败。背景见 [SECURITY.md](SECURITY.md)。

### 代码风格

- 2 空格缩进、LF 换行、UTF-8（见 `.editorconfig` / `.gitattributes`）。
- 注释用中文，与现有代码一致。
- 修复/功能类的非显然改动，请在注释里标注 `R##` 编号与原因（本仓库用 `R##` 追踪迭代），说明**为什么**这么改，而不是复述代码在做什么。

## 提交改动

### Commit message

本项目使用 [Conventional Commits](https://www.conventionalcommits.org/) 风格：

```
<type>(<scope>): <简短描述>

<可选：为什么这么改、影响范围>
```

常用 `type`：

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `perf` | 性能优化 |
| `refactor` | 重构（不改变外部行为） |
| `docs` | 文档 |
| `build` | 构建/打包/依赖 |
| `ci` | CI 配置 |
| `test` | 测试 |
| `chore` | 杂项 |

示例：

```
fix(renderer): 阅读模式 Lute 实例开启净化

未净化的 Md2HTML 结果写入 innerHTML 会让文档里的原始 HTML 执行脚本，
再经 preload 的 fs:read-* / shell:open-external 读取并外发本地文件。
```

### 分支命名

`feat/xxx`、`fix/xxx`、`docs/xxx`。

## Pull Request 检查清单

提交 PR 前请自查：

- [ ] 已关联相关 Issue（`Fixes #123`）
- [ ] `npm start` 能正常启动，改动涉及的功能手工验证过
- [ ] 改动涉及 vendor 补丁 → 已跑 `node tools/asar-check.js`，且**没有 FAIL**
- [ ] 改动涉及 markdown 渲染 / innerHTML → 已确认净化仍然生效
- [ ] 没有提交 `dist/`、`node_modules/`、生成的测试文档等产物
- [ ] 没有引入新的网络请求（若必须，说明它只在用户主动操作时发生）
- [ ] 没有提交任何密钥、token、个人路径或真实用户数据
- [ ] 文档（`README.md` / `docs/使用说明.md`）已同步更新
- [ ] 新增第三方代码/素材 → 已在 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 登记许可与出处

PR 模板会再提醒一遍这些项。

## 报告问题

请使用 [Issue 模板](.github/ISSUE_TEMPLATE/) 提交，并尽量附上：

- 操作系统与版本、MarkStudio 版本（帮助 → 关于）
- 复现步骤、期望结果、实际结果
- 若与解析/渲染相关，请附**最小化的 `.md` 片段**（这比截图有用得多）
- 若是崩溃，请附控制台输出；可用 `MARKSTUDIO_DEBUG=1` 启动以转发渲染层日志

## 安全漏洞

**请不要开公开 Issue。** 报告方式见 [SECURITY.md](SECURITY.md)。

## 许可

向本项目提交贡献，即表示你同意你的贡献以本项目的 [MIT 许可](LICENSE) 发布。
