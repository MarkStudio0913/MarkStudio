<p align="center">
  <img src="resources/icon.png" width="96" height="96" alt="MarkStudio">
</p>

<h1 align="center">MarkStudio</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://github.com/MarkStudio0913/MarkStudio/releases"><img src="https://img.shields.io/github/v/release/MarkStudio0913/MarkStudio?display_name=tag&sort=semver" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/offline--first-no%20telemetry-success.svg" alt="Offline-first, no telemetry">
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
</p>

一款 **所见即所得（WYSIWYG）** 的 Markdown 编辑器，界面与交互参考 Typora：输入即渲染、无源码/预览双栏割裂。基于 Electron + 内嵌（vendored）的 [Vditor](https://github.com/B3log/vditor) IR 模式构建，**完全离线可用**（无运行时外部依赖）。

> 本项目以 [MIT 许可](LICENSE) 开源。安全设计与风险边界见 [SECURITY.md](SECURITY.md)，第三方组件/图标许可见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)，参与贡献见 [CONTRIBUTING.md](CONTRIBUTING.md)，更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## 功能特性

- **所见即所得编辑**：标题、加粗、斜体、删除线、表格、任务列表、代码块等输入即时渲染；
- **数学公式**：KaTeX 渲染行内与块级公式；
- **超大文件「快速阅读模式」**：约 100 万字以上的文档自动切换为分块虚拟化只读渲染（打开约 1 秒、内存 < 100MB，避免整篇渲染导致的长时间冻结），支持大纲跳转（精确到标题元素）、全文查找定位（跨节点高亮）、章节快速定位；
- **大纲 / 文件树**：侧边栏章节大纲（随滚动联动高亮）与所在目录文件树；
- **查找与替换**、**字符/字数统计**（状态栏实时）；
- **表格拖拽调列**：表头拖拽实时调整列宽，行高拖拽；
- **导出**：
  - Word（.docx，原生 OOXML：真正的超链接、目录书签、Word 原生公式 OMML、复选框列表、表格边框）；
  - PDF（系统打印管线，含样式）；
  - HTML（独立单文件）；
- **翻译（可选启用）**：中英互译。默认使用 MyMemory 公共接口（免 key）；如配置了 Microsoft Translator 订阅密钥则优先使用（质量更高）。不启用翻译功能时**无任何外部网络请求**；
- **多标签、最近文件、双击 .md 关联打开**（安装后注册 md / markdown 文件关联）；
- **主题**：明暗主题与多种字体/字号设置，全部本地保存。

## 系统要求

- Windows 10 / 11（x64）
- macOS 10.15 或更高版本（Intel x64 或 Apple Silicon arm64）
- Linux x64（AppImage；同时提供 Debian/Ubuntu `.deb`）
- 构建需要 Node.js ≥ 18

## 三平台构建

`electron-builder` 必须在目标操作系统的原生 runner 上构建最可靠。仓库已配置 GitHub Actions：推送 tag（例如 `v1.0.0`）或手动运行 `Build installers` workflow，会在 Windows、macOS、Ubuntu 三个 runner 上分别生成安装包，并把它们汇总到同一个 GitHub Release。

本地构建命令：

```bash
npm install
npm run dist:win    # Windows: NSIS 安装版 + Portable
npm run dist:mac    # macOS: DMG + ZIP（x64 + arm64，未配置证书时为未签名包）
npm run dist:linux  # Linux: AppImage + deb（x64）
```

未配置 Apple Developer 证书时，macOS 用户首次打开可能需要在 Finder 中右键选择「打开」或在系统设置中允许；正式分发建议配置 Developer ID 签名与公证（`.github/workflows/build.yml` 中已预留 Secrets 配置位）。Linux AppImage 需要赋予执行权限：`chmod +x MarkStudio-*.AppImage`。

## 开发与运行

```bash
# 1. 安装依赖（postinstall 会从同版本 npm 包重建 vendor/vditor/dist 并还原 MarkStudio 补丁，
#    与仓库中已提交的 vendor 内容一致；若网络受限，vendor/ 已随仓库提交，离线亦可构建）
npm install

# 2. 开发运行
npm start

# 3. 冒烟测试（启动应用 → 自动编辑保存测试文件 → 校验落盘）
npm run smoke
```

> 说明：仓库自带 `.npmrc` 指向 npmmirror（国内镜像），便于中国大陆网络环境安装；如不需要可删除该文件。

## 项目结构

```
├── src/
│   ├── main/            # 主进程（窗口、托盘、文件关联、导出、翻译代理）
│   │   ├── main.js
│   │   ├── preload.js
│   │   └── translate.js # 翻译网络请求（主进程代理，渲染层受 CSP 限制）
│   └── renderer/        # 渲染层
│       ├── index.html
│       ├── renderer.js  # 编辑器 / 快速阅读模式 / 大纲 / 查找 / 导出
│       ├── docx-gen.js  # Word (.docx) OOXML 生成器（零依赖）
│       ├── stats-worker.js
│       └── style.css
├── vendor/vditor/       # vendored Vditor 3.11.3（含 KaTeX；MIT，见其 LICENSE）
│   └── dist/js/katex/   # vendored KaTeX（Apache-2.0，见其 LICENSE）
├── resources/           # 图标等打包资源
├── build/               # NSIS 定制脚本与安装器背景
├── scripts/             # 构建辅助（vendor 复制、图标生成、冒烟测试）
├── test-assets/         # 功能演示与测试样例文档
├── tools/               # 开发/测试工具（CDP 调试脚本、asar 静态校验、测试文档生成器）
├── .github/workflows/   # 三平台构建 + Release（最小权限）
├── docs/使用说明.md       # 完整用户手册（功能详解与操作说明）
├── SECURITY.md          # 安全设计、风险边界与漏洞报告方式
└── THIRD-PARTY-NOTICES.md  # 第三方组件/图标许可与版权声明
```

## 开发辅助

- **`tools/asar-check.js`**：对打包产物 `resources/app.asar` 做 200+ 项静态校验（各功能关键代码存在性），用于发布前自检：
  ```bash
  node tools/asar-check.js dist/win-unpacked/resources/app.asar
  ```
- **`tools/cdp-eval.js`** 等：通过 Chrome DevTools Protocol 在渲染进程内执行表达式 / 截图 / 模拟输入，用于行为级测试（需以 `--remote-debugging-port=9222` 启动应用）；
- **`tools/gen-*.js`**：生成大规模测试文档（长文/大表/重内容），用于性能与压力验证；
- **`npm run smoke`**：基础冒烟测试。

## 隐私说明

- 应用**默认不发起任何外部网络请求**，所有文档数据仅保存在本地用户指定位置；
- 渲染层 CSP 的 `connect-src` / `img-src` 不含 `http(s):`，渲染进程自身**无法**访问网络；外部请求只能由主进程代理发起；
- 翻译功能**仅在用户主动对选中文字触发时**请求外部接口，且只发送被选中的待翻译文本：
  - 默认 MyMemory 公共接口（免 key）。**注意 MyMemory 是第三方公共服务**，被翻译的文本会离开本机；如配置了 Microsoft Translator 订阅密钥则优先走 Microsoft Azure Translator 官方接口（密钥保存在本地设置，不随应用分发）；
  - **请勿翻译包含敏感信息的文本**；
- 设置、最近文件列表等均保存在本机用户数据目录；
- 导出 PDF/Word 时中间 HTML 只写入本机临时目录；导出的 **HTML** 会把本地字体/图片内联为 `data:`，不会把本机路径（含操作系统用户名）写进分享出去的产物。

## 安全

- 安全设计与风险边界见 [SECURITY.md](SECURITY.md)；发现漏洞请通过 GitHub 的 Private vulnerability reporting 私下报告，不要开公开 Issue。
- 请不要打开来源不可信的 `.md`：Markdown 中的图片路径会被解析并读取本机文件（编辑器显示本地图片的必要能力），对其执行「导出」会把这些文件内联进产物。

## 第三方组件与许可

| 组件 | 版本 | 许可 | 说明 |
| --- | --- | --- | --- |
| [Vditor](https://github.com/B3log/vditor) | 3.11.3 | MIT | 编辑器核心（IR 模式），vendored 于 `vendor/vditor/`；**其 `dist/index.js` 含少量 MarkStudio 本地修复补丁**（MIT 允许修改并保留原许可） |
| [Lute](https://github.com/88250/lute) | 随 Vditor | **Mulan PSL v2** | Markdown 解析/渲染引擎（内嵌于 Vditor 分发中，即 `vendor/vditor/dist/js/lute/`）。上游 Vditor 的 npm 包未附 Lute 许可证，本仓库已补齐 `vendor/vditor/dist/js/lute/LICENSE` |
| [KaTeX](https://katex.org) | 随 Vditor | Apache-2.0 | 公式渲染（`vendor/vditor/dist/js/katex/`，含字体与 LICENSE） |
| [highlight.js](https://highlightjs.org) | 随 Vditor | BSD-3-Clause | 代码语法高亮（`vendor/vditor/dist/js/highlight.js/`，含其 LICENSE） |
| Electron | 31.x | MIT | 桌面运行时（npm 依赖，不随仓库分发） |
| electron-builder / NSIS | - | MIT / NSIS License | 打包工具（npm 依赖） |
| iconv-lite | 0.6.x | MIT | 编码转换 |

MarkStudio 自身代码采用 **MIT** 许可（见根目录 [LICENSE](LICENSE)）。上述第三方组件均为宽松许可，与 MIT 兼容；各许可证全文与图标（Feather Icons）声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

> 说明：本项目的界面交互**参考**了 Typora、Microsoft Word / WPS 等成熟产品的使用习惯，但未使用其任何代码、图标或美术资源；相关名称与商标归各自权利人所有，本项目与其无隶属或背书关系。

## 许可

[MIT License](LICENSE) © 2026 MarkStudio
