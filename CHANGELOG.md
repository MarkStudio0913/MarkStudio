# 更新日志 / Changelog

本项目的所有重要改动都会记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 计划中

- 跟进 Electron 版本升级（31.x 已进入维护尾期）
- 为纯逻辑模块（`docx-gen.js`、`translate.js`、`tools/asar-check.js` 的断言）补充可自动化运行的单元测试

## [1.0.0] - 2026-10-08

首个公开发布版本。

### 新增

- **所见即所得编辑**：基于 Vditor IR 模式，标题/加粗/斜体/删除线/表格/任务列表/代码块输入即时渲染
- **数学公式**：KaTeX 渲染行内与块级公式
- **超大文件「快速阅读模式」**：约 100 万字以上的文档自动切换为分块虚拟化只读渲染，支持大纲跳转、全文查找定位
- **大纲与文件树**：侧边栏章节大纲（随滚动联动高亮）与所在目录文件树
- **多标签与多窗口**：标签拖拽重排、跨窗口拖动、拖出拆分为新窗口
- **表格编辑**：行列增删/移动、拖拽调列宽调行高、按行/列框选、单元格对齐
- **查找与替换**、**字符/字数统计**（状态栏实时，独立 Worker 计算）
- **导出**：Word（.docx，原生 OOXML：真实超链接、目录书签、Word 原生公式 OMML、复选框列表、表格边框）、PDF（系统打印管线）、HTML（独立单文件）
- **翻译（可选启用）**：中英互译，默认 MyMemory 公共接口，可配置 Microsoft Azure Translator 密钥
- **文件关联**：安装后注册 `.md` / `.markdown` 双击打开
- **主题**：明暗主题、4 种内容主题、字体/字号/行距/正文宽度设置，全部本地保存
- **三平台打包**：Windows（NSIS + Portable）、macOS（DMG + ZIP，x64/arm64）、Linux（AppImage + deb），并提供 GitHub Actions 一键出包

### 安全

首次发布前完成的安全加固（详见 [SECURITY.md](SECURITY.md)）：

- **修复**：快速阅读模式的 Lute 实例未开启 HTML 净化，文档中的原始 HTML 可执行脚本，
  并经由 preload 的 `fs:read-*` / `shell:open-external` 读取并外发本地文件（高危）
- **修复**：欢迎页「最近打开」列表用 `innerHTML` 拼接文件路径，在 Linux/macOS 下可被特制文件名触发脚本
- **修复**：导出 HTML 会把 KaTeX 等本地资源的绝对路径写入产物，分享即泄露操作系统用户名与安装目录
- **修复**：导出产物的 `<title>` 未转义；导出 HTML 现在自带严格 CSP 并剥离正文 `<script>`
- **修复**：图片尺寸映射以文档内容为键，`constructor` / `__proto__` 形式的图片地址会抛异常
- **加固**：渲染进程开启沙箱（`sandbox: true`）
- **合规**：翻译功能由 Microsoft **未公开**的 Edge 私有主机 `api-edge.*` 改为官方文档化终结点
  `api.cognitive.microsofttranslator.com`
- **合规**：改用 `SECURITY.md` 承接漏洞报告，新增 `tools/asar-check.js` 的 `SEC-*` 回归断言

### 文档与合规

- 修正第三方许可声明：**Lute 采用 Mulan PSL v2（非 MIT）**，并补齐其缺失的许可证文件
  `vendor/vditor/dist/js/lute/LICENSE`
- 新增 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)，登记 Vditor / Lute / KaTeX / highlight.js /
  iconv-lite / Feather Icons 的许可与版权
- 新增 [SECURITY.md](SECURITY.md)、[CONTRIBUTING.md](CONTRIBUTING.md)、[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- 修正 `docs/使用说明.md` 中「支持 Mermaid 图表」的不实描述（该渲染器未随应用分发）

### 构建与维护

- GitHub Actions 升级到当前主版本（`checkout@v7` / `setup-node@v7` / `upload-artifact@v7` /
  `download-artifact@v8` / `softprops/action-gh-release@v3`），消除 runner 上 Node 20 运行时的弃用告警
- CI 与打包统一使用 Node 22 LTS（Node 20 已于 2026-04 EOL）
- 新增 [`.github/dependabot.yml`](.github/dependabot.yml)：每周跟进 npm 依赖与 Actions 版本；
  minor/patch 归组以减少噪音，major 单独出 PR 以便评估破坏性改动（尤其 Electron 大版本）
- Windows 构建在打包后强制运行 `node tools/asar-check.js`，vendor 补丁丢失会让构建失败而不是静默发出
- 新增 `tools/repo-lint.js` 并接入 CI：74 项断言覆盖安全不变量、第三方许可一致性、
  敏感内容扫描、必备文件与仓库配置（含「`.gitignore` 的 dist 规则必须锚定到根目录」这条回归断言）

[未发布]: https://github.com/MarkStudio0913/MarkStudio/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/MarkStudio0913/MarkStudio/releases/tag/v1.0.0
