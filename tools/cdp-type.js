// CDP 辅助：通过 Input.dispatchKeyEvent 注入真实按键（走浏览器完整输入管线）
// 用法: node tools/cdp-type.js "文本" [前置 eval 表达式（可选）]
const http = require('http');
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
async function main() {
  const text = process.argv[2] || '';
  const pre = process.argv[3] || '';
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && /index\.html/.test(t.url || '')) || targets.find(t => t.type === 'page');
  if (!page) { console.error('no page target'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
  }
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  await new Promise((r) => ws.onopen = r);
  // 1) 前置：聚焦编辑器并定位光标
  if (pre) {
    await send('Runtime.evaluate', { expression: pre, awaitPromise: true, returnByValue: true });
  } else {
    await send('Runtime.evaluate', {
      expression: '(() => { const rs = document.querySelector(".vditor-ir .vditor-reset"); rs.focus(); const sel = window.getSelection(); const range = document.createRange(); range.selectNodeContents(rs); range.collapse(false); sel.removeAllRanges(); sel.addRange(range); return "focused"; })()',
      returnByValue: true
    });
  }
  // 2) 逐字符真实输入
  for (const ch of text) {
    await send('Input.insertText', { text: ch });
  }
  await new Promise(r => setTimeout(r, 300));
  // 3) 读回状态
  const r = await send('Runtime.evaluate', {
    expression: '({ dirty: state.dirty, len: state.vditor.getValue().length, has: (t) => state.vditor.getValue().includes(t) })',
    returnByValue: true
  });
  console.log(JSON.stringify(r.result.value, null, 2));
  ws.close();
}
main().catch(e => { console.error('CDP error: ' + e.message); process.exit(1); });
