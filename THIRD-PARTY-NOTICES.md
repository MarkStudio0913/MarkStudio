# 第三方组件与许可声明 / Third-Party Notices

MarkStudio 自身代码以 **MIT** 许可发布（见 [LICENSE](LICENSE)）。
本项目分发中包含以下第三方组件。所有组件均采用**宽松许可**，与 MIT 兼容。
完整的许可证全文随仓库/安装包一同分发（路径见下表），以满足各许可证「随分发提供许可证副本并保留版权声明」的要求。

## 一、随应用分发的组件（vendored / 运行时依赖）

| 组件 | 版本 | 许可证 | 版权 | 许可证全文位置 |
| --- | --- | --- | --- | --- |
| [Vditor](https://github.com/B3log/vditor) | 3.11.3 | MIT | © 2018-present B3log 开源, b3log.org | [`vendor/vditor/LICENSE`](vendor/vditor/LICENSE) |
| [Lute](https://github.com/88250/lute) | 随 Vditor | Mulan PSL v2 | © 2019-present 88250 | [`vendor/vditor/dist/js/lute/LICENSE`](vendor/vditor/dist/js/lute/LICENSE) |
| [KaTeX](https://katex.org) | 随 Vditor | Apache-2.0 | © Khan Academy 及 KaTeX contributors | [`vendor/vditor/dist/js/katex/LICENSE`](vendor/vditor/dist/js/katex/LICENSE) |
| [highlight.js](https://highlightjs.org) | 11.7.0 | BSD-3-Clause | © 2006 Ivan Sagalaev 及 contributors | [`vendor/vditor/dist/js/highlight.js/LICENSE`](vendor/vditor/dist/js/highlight.js/LICENSE) |
| [iconv-lite](https://github.com/ashtuchkin/iconv-lite) | 0.7.3 | MIT | © 2011 Alexander Shtuchkin | `node_modules/iconv-lite/LICENSE`（打包进 `app.asar`） |
| [Electron](https://github.com/electron/electron) | 31.7.7 | MIT | © Electron contributors | 安装包内 `LICENSE.electron.txt` |
| Chromium | 随 Electron | BSD-3-Clause 等 | © The Chromium Authors | 安装包内 `LICENSES.chromium.html` |

### 关于 Vditor 的本地修改

`vendor/vditor/dist/index.js` 中包含少量 **MarkStudio 本地修复补丁**（源码中以 `MarkStudio R39`、`MarkStudio R40` 等注释标记）。
Vditor 采用 MIT 许可，允许修改与再分发；原始的 Vditor 版权与许可证声明已完整保留在该文件头部及 `vendor/vditor/LICENSE` 中，符合 MIT 的要求。

### 关于 Lute

上游 Vditor 的 npm 分发包中**未附带**其内嵌引擎 Lute 的许可证文件，而 Lute 采用 **Mulan PSL v2**（木兰宽松许可证第 2 版，非 MIT）。
本项目已在 `vendor/vditor/dist/js/lute/LICENSE` 补齐其许可证全文与版权声明，以满足 Mulan PSL v2 第 4 条的分发要求。
（`scripts/copy-vendor.js` 会在 `npm install` 重建 vendor 时自动备份并还原该目录下的 `LICENSE` 文件，因此补齐的许可证不会在重建后丢失。）

## 二、源码中引用的第三方图标

界面工具栏/标签栏中的部分 SVG 图标路径取自 **Feather Icons**（MIT）。这些图标以 SVG `path` 数据的形式内联在 `src/renderer/index.html` 与 `src/renderer/renderer.js` 中，属于「实质性部分」，因此在此保留其版权与许可声明。

| 组件 | 版本 | 许可证 | 版权 |
| --- | --- | --- | --- |
| [Feather Icons](https://github.com/feathericons/feather) | 4.x | MIT | © 2013-2023 Cole Bemis |

```
The MIT License (MIT)

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

> 其余图标（应用图标、窗口按钮、表格工具条、文件类型图标等）为 MarkStudio 自行绘制，不涉及第三方许可。

## 三、仅用于构建/开发、不随应用分发的工具

以下工具属于开发期依赖，不进入最终用户安装包，其许可证不构成本项目分发物的合规义务：

| 工具 | 许可证 | 用途 |
| --- | --- | --- |
| [electron-builder](https://www.electron.build/) | MIT | 打包（`devDependencies`） |
| NSIS | NSIS License（zlib/libpng 风格） | Windows 安装器 |
| 7-Zip（`7zip-bin`） | LGPL-2.1+ / 部分 public domain | electron-builder 内部解压 |
| AppImage / `app-builder-bin` | MIT / 各自许可 | Linux 打包 |
| [Vditor](https://github.com/B3log/vditor) npm 包 | MIT | 构建期重建 `vendor/vditor/dist` 的来源（`devDependencies`） |

## 四、商标说明

Typora、Microsoft Word、WPS、Visual Studio Code、GitHub、YouTube、优酷、腾讯视频等名称与商标归各自权利人所有。
MarkStudio 仅在**描述界面交互参考对象或兼容目标**时以文字方式提及这些名称，属于指明性（nominative）合理使用；
本项目**未使用**上述产品的任何代码、图标、字体或美术资源，与其权利人**无任何隶属、赞助或背书关系**。

## 五、上游许可证文本索引

- MIT：<https://opensource.org/license/mit>
- Apache-2.0：<https://www.apache.org/licenses/LICENSE-2.0>
- BSD-3-Clause：<https://opensource.org/license/bsd-3-clause>
- Mulan PSL v2：<http://license.coscl.org.cn/MulanPSL2>

---

如发现遗漏的第三方组件或声明错误，请提交 Issue，我们会尽快补充。
