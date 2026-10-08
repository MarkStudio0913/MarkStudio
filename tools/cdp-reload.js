// CDP 辅助：重载渲染进程页面（拾取磁盘上最新的 renderer.js），随后等待
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
  await send('Runtime.evaluate', { expression: 'location.reload(); "reloading"' });
  ws.close();
  console.log('reload sent');
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const ts = await getTargets();
      const p = ts.find(t => t.type === 'page');
      if (p) {
        const ws2 = new WebSocket(p.webSocketDebuggerUrl);
        await new Promise((r) => ws2.onopen = r);
        let id2 = 0;
        const res = await new Promise((resolve) => {
          const m = ++id2;
          const done = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id === m) { ws2.onmessage = null; ws2.close(); resolve(msg); }
          };
          ws2.onmessage = done;
          ws2.send(JSON.stringify({ id: m, method: 'Runtime.evaluate', params: { expression: 'typeof state !== "undefined" && state.editorReady ? "ready" : "booting"', returnByValue: true } }));
        });
        const v = res.result && res.result.value;
        if (v === 'ready') { console.log('ready'); process.exit(0); }
      }
    } catch (e) { /* 页面重载中，忽略 */ }
  }
  console.log('timeout waiting for ready');
  process.exit(1);
}
main().catch(e => { console.error('CDP error: ' + e.message); process.exit(1); });
