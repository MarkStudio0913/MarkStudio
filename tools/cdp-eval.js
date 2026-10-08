// CDP 辅助：在 MarkStudio 渲染进程内执行 JS 并打印结果
// 用法: node tools/cdp-eval.js "<js expression>"  或  node tools/cdp-eval.js -f script.js
const http = require('http');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:' + (process.env.CDP_PORT || 9222) + '/json', (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const arg = process.argv[2];
  let expr;
  if (arg === '-f') {
    const fs = require('fs');
    expr = fs.readFileSync(process.argv[3], 'utf8');
  } else {
    expr = arg || '';
  }
  if (!expr) { console.error('usage: node cdp-eval.js "<expr>" | -f file.js'); process.exit(2); }

  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && /index\.html/.test(t.url || '')) || targets.find(t => t.type === 'page');
  if (!page) { console.error('no page target found: ' + JSON.stringify(targets.map(t => t.url))); process.exit(1); }

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
  try {
    const r = await send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
      timeout: 30000
    });
    if (r.exceptionDetails) {
      console.error('EXCEPTION: ' + JSON.stringify(r.exceptionDetails, null, 2));
      process.exit(3);
    }
    const v = r.result && r.result.value !== undefined ? r.result.value : r.result;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  } finally {
    ws.close();
  }
}
main().catch(e => { console.error('CDP error: ' + e.message); process.exit(1); });
