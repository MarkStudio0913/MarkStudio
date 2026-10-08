#!/usr/bin/env node
// 仓库卫生与安全不变量检查（CI 门禁，零依赖，可在干净检出上直接运行）。
//
// 目的：把「开源前一次性排查」固化成可重复执行的检查，防止后续 PR 把问题带回来。
// 运行：node tools/repo-lint.js
// 退出码：0 = 全部通过；1 = 有失败项。
//
// 说明：本脚本只读取文件、不修改任何内容。涉及路径的存在性判断都基于仓库根目录。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0;
const failures = [];

const ok = (name) => { pass++; };
const bad = (name, detail) => { failures.push(detail ? name + ' — ' + detail : name); };
const check = (name, cond, detail) => { if (cond) ok(name); else bad(name, detail); };

const abs = (rel) => path.join(ROOT, rel);
const exists = (rel) => fs.existsSync(abs(rel));
const read = (rel) => fs.readFileSync(abs(rel), 'utf8').replace(/\r\n/g, '\n');

// 需要遍历检查的文本文件（排除 vendor 与锁文件：前者是上游代码，后者是机器生成的依赖清单）
const SCAN_EXCLUDE = [
  /^vendor[\\/]/,
  /^node_modules[\\/]/,
  /^dist/,
  /^package-lock\.json$/,
  /^\.git[\\/]/
];
const TEXT_EXT = /\.(js|json|md|html|css|yml|yaml|nsh|npmrc|txt|gitignore|gitattributes|editorconfig)$/;

function walkTextFiles(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, e.name)).replace(/\\/g, '/');
    if (SCAN_EXCLUDE.some((re) => re.test(rel))) continue;
    if (e.isDirectory()) { walkTextFiles(path.join(dir, e.name), out); continue; }
    if (TEXT_EXT.test(e.name) || e.name === '.gitignore' || e.name === '.gitattributes' || e.name === '.editorconfig') {
      out.push(rel);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 1. 必备文件
const REQUIRED_FILES = [
  'LICENSE', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md',
  'SECURITY.md', 'THIRD-PARTY-NOTICES.md',
  '.gitignore', '.gitattributes', '.editorconfig', '.npmrc',
  'package.json', 'package-lock.json',
  'src/main/main.js', 'src/main/preload.js', 'src/main/translate.js',
  'src/renderer/index.html', 'src/renderer/renderer.js', 'src/renderer/docx-gen.js',
  'src/renderer/style.css', 'src/renderer/stats-worker.js',
  // 随分发物一起提供的第三方许可证（含本仓库为 Lute 补齐的那份）
  'vendor/vditor/LICENSE',
  'vendor/vditor/dist/js/katex/LICENSE',
  'vendor/vditor/dist/js/highlight.js/LICENSE',
  'vendor/vditor/dist/js/lute/LICENSE',
  // vendor 核心运行时资源：缺失则该克隆无法运行/无法离线构建。
  // 这几个断言专门用于捕捉 .gitignore 误把 vendor/vditor/dist 排除掉的情况
  //（例如把根目录构建产物写成不带前导 / 的 `dist*/`，会在任意层级命中同名目录）。
  'vendor/vditor/dist/index.js',
  'vendor/vditor/dist/index.css',
  'vendor/vditor/dist/js/lute/lute.min.js',
  'vendor/vditor/dist/js/katex/katex.min.js',
  'vendor/vditor/dist/js/katex/katex.min.css',
  'vendor/vditor/dist/js/highlight.js/highlight.min.js',
  'vendor/vditor/dist/js/highlight.js/styles/github.min.css',
  'vendor/vditor/dist/js/highlight.js/styles/github-dark.min.css',
  'vendor/vditor/dist/css/content-theme/light.css',
  'vendor/vditor/dist/css/content-theme/dark.css',
  'vendor/vditor/dist/css/content-theme/ant-design.css',
  'vendor/vditor/dist/css/content-theme/wechat.css',
  '.github/workflows/build.yml', '.github/workflows/ci.yml',
  '.github/dependabot.yml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml'
];
for (const f of REQUIRED_FILES) check('必备文件存在：' + f, exists(f));

// ---------------------------------------------------------------- 2. 不得入库的产物
const FORBIDDEN_FILES = [
  'test-table.md', 'test-large.md', 'test-large-prose.md',
  'test-assets/smoke-test.md', 'tools/heavy-perf.md',
  'node_modules', 'dist', 'tools/asar-x3'
];
for (const f of FORBIDDEN_FILES) check('未提交生成物/' + f, !exists(f));

// tools/big*.md（tools/gen-big320.js 的产物）
const strayBig = exists('tools')
  ? fs.readdirSync(abs('tools')).filter((n) => /^big.*\.md$/.test(n))
  : [];
check('未提交 tools/big*.md', strayBig.length === 0, strayBig.join(', '));

// ---------------------------------------------------------------- 3. 密钥与个人信息
const SECRET_PATTERNS = [
  { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'OpenAI 风格密钥', re: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: 'GitHub Token', re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: '私钥文件内容', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  // 形如 password = "字面值" / apiKey: "字面值"（值必须是被引号包住的非空字面量）
  { name: '硬编码口令/密钥赋值', re: /(?:password|passwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token)\s*[:=]\s*['"][^'"\s]{6,}['"]/i },
  // 含真实用户名的绝对路径（占位符 C:\Users\<你的用户名> 不算）
  { name: '含用户名的绝对路径', re: /[A-Za-z]:\\Users\\(?![<*])[A-Za-z0-9._-]+|\/Users\/(?![<*])[A-Za-z0-9._-]+|\/home\/(?![<*])[A-Za-z0-9._-]+/ },
  { name: '邮箱地址', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ }
];
const SCAN_ALLOW = [
  // 上游 npm 元数据与许可证文本里的邮箱/链接（vendor 已排除；这里放行明确的第三方署名）
  /feross\.org|patreon\.com|opencollective\.com|tidelift\.com/,
  // 行尾注释里显式说明「不得出现」的示例（如 translate-probe.js 的禁止清单）
  /禁止|不得|不要|例如|曾指向|早期版本/
];
const textFiles = walkTextFiles(ROOT);
for (const f of textFiles) {
  const lines = read(f).split('\n');
  for (const pat of SECRET_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!pat.re.test(line)) continue;
      if (SCAN_ALLOW.some((re) => re.test(line))) continue;
      bad('敏感内容扫描：' + f + ':' + (i + 1), pat.name + ' → ' + line.trim().slice(0, 100));
    }
  }
}
ok('敏感内容扫描（' + textFiles.length + ' 个文本文件）');

// ---------------------------------------------------------------- 4. 第三方许可证与补丁不变量
const vditorIndex = read('vendor/vditor/dist/index.js');
check('vendor Vditor 保留 MIT 版权头', /Copyright \(c\) 2018-present B3log/.test(vditorIndex));
check('vendor Vditor 保留 MarkStudio 补丁标记（R39）', vditorIndex.includes('MarkStudio R39'),
  'npm install 的 postinstall 重建 vendor 时补丁可能已丢失');
check('vendor Lute 许可证为 Mulan PSL v2（非 MIT）', /Mulan PSL v2/i.test(read('vendor/vditor/dist/js/lute/LICENSE')));
check('vendor KaTeX 许可证为 Apache-2.0', /Apache License/.test(read('vendor/vditor/dist/js/katex/LICENSE')));
check('vendor highlight.js 许可证为 BSD-3-Clause', /BSD 3-Clause/.test(read('vendor/vditor/dist/js/highlight.js/LICENSE')));
check('README 未把 Lute 误标为 MIT',
  !/\|\s*Lute\s*\|[^|]*\|\s*MIT\s*\|/.test(read('README.md')));

// ---------------------------------------------------------------- 5. 安全不变量
const renderer = read('src/renderer/renderer.js');
const mainJs = read('src/main/main.js');
const translateJs = read('src/main/translate.js');
const indexHtml = read('src/renderer/index.html');

check('阅读模式 Lute 实例开启净化', renderer.includes('SetSanitize(true)'),
  '未净化的 Md2HTML 结果写入 innerHTML 会导致文档中的脚本执行');
check('最近文件列表不再用 innerHTML 拼接路径',
  !renderer.includes('<span class="rname">${baseName(p)}</span>') && renderer.includes('nameEl.textContent = baseName(p)'));
check('导出 HTML 的标题已转义', renderer.includes('<title>${escHtml(title)}</title>'));
check('导出 HTML 剥离正文脚本', renderer.includes("tmp.querySelectorAll('script').forEach((s) => s.remove())"));
check('导出 HTML 内联本地资源（不泄露本机路径）', renderer.includes('function embedLocalAssets'));
check('渲染进程开启沙箱', /sandbox:\s*true/.test(mainJs) && !/sandbox:\s*false/.test(mainJs));
check('翻译不复用 Edge 私有主机', !/const\s+MS_\w+\s*=\s*['"]https:\/\/api-edge\./.test(translateJs),
  'api-edge.cognitive.microsofttranslator.com 不是 Azure 公开 API 契约内的终结点');
check('翻译使用官方文档化终结点', translateJs.includes('api.cognitive.microsofttranslator.com'));
check('渲染层 CSP 存在且未放行 http(s) 到 connect-src/img-src',
  indexHtml.includes('Content-Security-Policy') &&
  /connect-src 'self' file: data: blob:/.test(indexHtml) &&
  !/connect-src[^;]*https?:/.test(indexHtml));
check('preload 仍使用 IPC 通道白名单', read('src/main/preload.js').includes('ALLOW_INVOKE'));

// ---------------------------------------------------------------- 6. 仓库配置与 CI 权限
const gitignore = read('.gitignore');
check('.gitignore 的构建产物规则锚定到仓库根目录',
  /^\/dist\/$/m.test(gitignore) && /^\/dist\*\/$/m.test(gitignore) && !/^dist\*?\/$/m.test(gitignore),
  '不带前导 / 的 `dist*/` 会在任意层级匹配，把 vendor/vditor/dist 一并排除，克隆后无法运行');

const buildYml = read('.github/workflows/build.yml');
check('build.yml 顶层权限为只读', /^permissions:\n\s+contents:\s*read\s*$/m.test(buildYml));
check('build.yml 仅在 release job 授予写权限', (buildYml.match(/contents:\s*write/g) || []).length === 1);
check('build.yml 未使用 pull_request_target', !/pull_request_target/.test(buildYml));

// ---------------------------------------------------------------- 汇总
console.log('==== repo-lint: ' + pass + ' 通过 / ' + failures.length + ' 失败 ====');
if (failures.length) {
  console.log('');
  for (const f of failures) console.log('FAIL  ' + f);
  console.log('');
  console.log('提示：其中「安全不变量」「第三方许可证」「敏感内容扫描」三类失败通常意味着');
  console.log('      需要同时更新 THIRD-PARTY-NOTICES.md / SECURITY.md 的说明。');
  process.exit(1);
}
process.exit(0);
