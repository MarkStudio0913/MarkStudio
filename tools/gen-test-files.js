// 生成测试文档（避免 bash 反引号转义问题）
const fs = require('fs');
const path = require('path');

const t = [
  '# 表格功能测试',
  '',
  '下面是一个 3 行 3 列表格，用于测试增删行、列与移动。',
  '',
  '| 姓名 | 部门 | 城市 |',
  '| --- | --- | --- |',
  '| 张三 | 研发 | 北京 |',
  '| 李四 | 产品 | 上海 |',
  '| 王五 | 设计 | 深圳 |',
  '',
  '## 代码块测试',
  '',
  '```js',
  'function hi() { console.log(1); }',
  '```',
  '',
  '结尾段落。'
].join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'test-table.md'), t, 'utf8');

const parts = [];
for (let i = 1; i <= 3000; i++) {
  parts.push('## 章节 ' + i);
  parts.push('');
  parts.push('这是第 ' + i + ' 章的正文段落，用于压测大文件打开与输入性能。内容足够长，用来模拟真实的大 Markdown 文档场景，包含一些 **加粗** 和 `行内代码`。');
  parts.push('');
  if (i % 5 === 0) {
    parts.push('```js');
    parts.push('// 第 ' + i + ' 章的代码示例');
    parts.push('const n = ' + i + ';');
    parts.push('console.log(n);');
    parts.push('```');
    parts.push('');
  }
  parts.push('- 要点 ' + i + ' 甲');
  parts.push('- 要点 ' + i + ' 乙');
  parts.push('');
}
const large = parts.join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'test-large.md'), large, 'utf8');
console.log('table bytes =', t.length);
console.log('large chars =', large.length, 'KB =', (Buffer.byteLength(large) / 1024).toFixed(0));
