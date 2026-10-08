// 生成约 320KB 的重负载文档（模拟用户 292KB 翻译文档的规模）
const fs = require('fs');
const BACKTICK = '`';
let md = '# 重负载性能测试文档（约300KB+）\n\n';
for (let i = 1; i <= 700; i++) {
  md += '## 第' + i + '章 章节标题比较长一些用于撑高大纲列表区域\n\n';
  md += '段落文本带[内链](https://example.com/page' + i + ')与**加粗**和' + BACKTICK + '行内代码' + BACKTICK + '，用于撑大文档。第' + i + '段内容占位，继续补充一些文字让行更长一些以接近真实翻译文档的行密度，再加一句收尾。\n\n';
  if (i % 3 === 0) {
    md += '| 参数 | 数值 | 单位 | 备注 |\n| --- | --- | --- | --- |\n';
    for (let r = 0; r < 8; r++) md += '| param_' + i + '_' + r + ' | 123.45 | dBm | 表格占位备注文字比较长一些 |\n';
    md += '\n';
  }
  if (i % 14 === 0) {
    md += '1. 有序列表一' + i + ' 内容\n2. 有序列表二' + i + ' 内容稍长一点\n\n';
  }
  if (i % 25 === 0) {
    md += '> 引用段落占位文字，第' + i + '章引用，内容比较长一些用于撑大文档体积。\n\n';
  }
}
fs.writeFileSync('tools/big320.md', md, 'utf8');
console.log('bytes:', Buffer.byteLength(md), 'lines:', md.split('\n').length);
