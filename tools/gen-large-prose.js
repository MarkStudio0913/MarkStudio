const fs = require('fs');
const path = require('path');
// 生成一个现实的 1MB+ 大文件：长段落散文 + 章节标题 + 少量列表/代码
const chunks = [];
chunks.push('# 大型文档性能压测\n\n这是一份用于测试大文件打开性能的长文档。它以真实的散文段落为主，模拟实际工作中可能遇到的大型 Markdown 文档。\n\n');
let total = 0;
let chap = 0;
const filler = '这是一段用于填充篇幅的正文内容，包含对技术方案的详细描述与论证。在实际的工程实践中，文档往往包含大量的背景说明、方案对比、风险评估与实施步骤等内容，这些都会显著增加文档的体积。';
while (total < 1050000) {
  chap++;
  chunks.push('## 第 ' + chap + ' 章 ' + '主题'.repeat(1) + chap + '\n\n');
  // 每个章节 3-6 个长段落
  const paras = 3 + (chap % 4);
  for (let p = 0; p < paras; p++) {
    const para = (filler + ' 段落编号 ' + chap + '-' + p + '。' + filler + ' 进一步的说明与补充内容，用于增加段落长度，使文档更接近真实的大型文档。').repeat(3);
    chunks.push(para + '\n\n');
    total += para.length;
  }
  if (chap % 7 === 0) {
    chunks.push('- 要点一：' + filler.slice(0, 40) + '\n- 要点二：' + filler.slice(0, 40) + '\n- 要点三：' + filler.slice(0, 40) + '\n\n');
    total += 200;
  }
  if (chap % 23 === 0) {
    const code = '```js\n// 示例代码块 ' + chap + '\nfunction example' + chap + '() {\n  return "第 ' + chap + ' 章的示例";\n}\n```\n\n';
    chunks.push(code);
    total += code.length;
  }
}
const md = chunks.join('');
const out = path.join(__dirname, '..', 'test-large-prose.md');
fs.writeFileSync(out, md, 'utf8');
console.log('written', out, md.length, 'chars,', md.split('\n').length, 'lines, blocks~', chap * 5);
