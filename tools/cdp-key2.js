// 一次会话连发多个按键：node tools/cdp-key2.js Enter Enter Enter Backspace [gapMs]
const http = require('http');
const argv = process.argv.slice(2);
const GAP = parseInt(argv[argv.length - 1], 10);
const keys = (Number.isFinite(GAP) && GAP > 0) ? argv.slice(0, -1) : argv;
const gap = Number.isFinite(GAP) && GAP > 0 ? GAP : 200;
function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
const KEY_CODES = {
  Enter: { code: 'Enter', win: 13, native: 13, text: '\r' },
  Backspace: { code: 'Backspace', win: 8, native: 8 },
  Delete: { code: 'Delete', win: 46, native: 46 }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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
      pending.delete(mid = msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  await new Promise(r => { ws.onopen = r; });
  for (let i = 0; i < keys.length; i++) {
    const keyName = keys[i];
    const kc = KEY_CODES[keyName] || { code: keyName, win: 0, native: 0 };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code: kc.code, windowsVirtualKeyCode: kc.win, nativeVirtualKeyCode: kc.native });
    if (kc.text) await send('Input.dispatchKeyEvent', { type: 'char', text: kc.text, code: kc.code, windowsVirtualKeyCode: kc.win, nativeVirtualKeyCode: kc.native });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code: kc.code, windowsVirtualKeyCode: kc.win, nativeVirtualKeyCode: kc.native });
    if (i < keys.length - 1) await sleep(gap);
  }
  console.log('keys sent: ' + keys.join(',') + ' gap=' + gap);
  ws.close();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
