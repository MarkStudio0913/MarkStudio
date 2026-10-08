<!--
感谢提交 PR！请先阅读 CONTRIBUTING.md。标题请用 Conventional Commits 风格，
例如：fix(renderer): 阅读模式 Lute 实例开启净化
-->

## 这个 PR 做了什么

<!-- 一句话说明改动的目的 -->

## 关联 Issue

<!-- Fixes #123 / Closes #123；没有对应 Issue 的话请说明为什么需要这个改动 -->

## 改动类型

- [ ] `feat` 新功能
- [ ] `fix` 修复 bug
- [ ] `perf` 性能优化
- [ ] `refactor` 重构（不改变外部行为）
- [ ] `docs` 文档
- [ ] `build` / `ci` 构建与 CI
- [ ] `chore` 杂项

## 自查清单

- [ ] 本 PR 只做一件事，未夹带无关的格式重排或重构
- [ ] `npm start` 能正常启动，涉及的功能已手工验证
- [ ] 改动涉及 `vendor/vditor` 补丁 → 已跑 `node tools/asar-check.js <app.asar>` 且**没有 FAIL**
- [ ] 改动涉及 markdown 渲染 / `innerHTML` → 已确认净化（`SetSanitize(true)` / `textContent` / `escHtml`）仍然生效
- [ ] 未提交 `dist/`、`node_modules/`、`tools/gen-*.js` 生成的测试文档等产物
- [ ] 未引入新的运行时网络请求；如有，已说明它只在用户主动操作时发生
- [ ] 未提交任何密钥、token、个人路径或真实用户数据
- [ ] 新增第三方代码/素材 → 已在 `THIRD-PARTY-NOTICES.md` 登记许可与出处
- [ ] `README.md` / `docs/使用说明.md` / `CHANGELOG.md` 已按需同步

## 验证方式

<!-- 你是怎么验证的？手工步骤、截图、测试命令及结果。评审者据此判断可信度。 -->

## 破坏性改动

<!-- 有的话请说明影响范围与迁移方式；没有请写「无」 -->
