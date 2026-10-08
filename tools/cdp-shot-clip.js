// 局部截图：node tools/cdp-shot-clip.js out.png x y w h
const http = require('http');
const fs = require('fs');
const out = process.argv[2] || require('os').tmpdir() + '/clip.png';
const x = Number(process.argv[3] || 0), y = Number(process.argv[4] || 0);
const w = Number(process.argv[5] || 200), h = Number(process.argv[6] || 200);
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && /index\.html/.test(t.url || ''));
  if (!page) { console.error('no page'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params) => new Promise((resolve, reject) => {
    const mid = ++id; pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  await new Promise(r => ws.onopen = r);
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 3 } });
  fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
  console.log('saved ' + out);
  ws.close();
})().catch(e => { console.error(e.message); process.exit(1); });
