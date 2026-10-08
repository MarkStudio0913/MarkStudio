const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
const start = src.indexOf("execFile('powershell', [");
const arrStart = src.indexOf('[', start);
const optsStart = src.indexOf('{ timeout', arrStart);
const arrEnd = src.lastIndexOf(']', optsStart);
const tmpFile = path.join(os.tmpdir(), 'ms-font-e2e.txt').replace(/\\/g, '/');
const arr = eval(src.slice(arrStart, arrEnd + 1));
console.log('running powershell...');
execFile('powershell', arr, { timeout: 30000, windowsHide: true }, (err) => {
  if (err) { console.log('EXEC ERR', err.message); process.exit(1); }
  const raw = fs.readFileSync(tmpFile, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  console.log('lines:', lines.length);
  const yh = lines.filter(l => /YaHei|雅黑/.test(l));
  console.log('--- YaHei lines ---');
  yh.forEach(l => console.log(l));
  const cjk = lines.filter(l => /[\u4e00-\u9fff]/.test(l));
  console.log('--- CJK-name lines (first 15) ---');
  cjk.slice(0, 15).forEach(l => console.log(l));
  fs.unlinkSync(tmpFile);
});
