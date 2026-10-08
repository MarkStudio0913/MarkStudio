// 生成重负载测试文档（120 章 + 表格/链接/列表/代码块）
const fs = require('fs');
let md = '# 重负载性能测试文档\n\n';
for (let i = 1; i <= 120; i++) {
  md += '## 第' + i + '章 章节标题\n\n';
  md += '段落文本带[内链](https://example.com/page' + i + ')与**加粗**和`行内代码`，用于撑大文档。第' + i + '段内容占位，继续补充一些文字让行更长。\n\n';
  if (i % 4 === 0) {
    md += '| 参数 | 数值 | 单位 | 备注 |\n| --- | --- | --- | --- |\n';
    for (let r = 0; r < 6; r++) md += '| param_' + i + '_' + r + ' | 123.45 | dB | 表格占位备注文字 |\n';
    md += '\n';
  }
  if (i % 12 === 0) {
    md += '```bash\n# 代码块占位 line ' + i + '\necho hello markstudio performance test ' + i + '\n```\n\n';
  }
  md += '- 列表项 A' + i + '：内容占位\n- 列表项 B' + i + '：内容占位文字更长一些\n\n';
}
fs.writeFileSync('tools/heavy-perf.md', md, 'utf8');
console.log('bytes:', Buffer.byteLength(md), 'lines:', md.split('\n').length);
