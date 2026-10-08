// 查询 CDP 页面目标的窗口状态（是否最小化）
const http = require('http');
http.get('http://127.0.0.1:9222/json', (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => {
    const targets = JSON.parse(data);
    const page = targets.find(t => t.type === 'page');
    if (!page) { console.log('no page'); return; }
    const ws = new WebSocket(page.webSocketDebuggerUrl.replace('127.0.0.1', '127.0.0.1'));
    const bws = new WebSocket('ws://127.0.0.1:9222/devtools/browser/' + (process.env.BROWSER_ID || 'x'));
    // 用 page target 的 ws 发 Browser.getWindowForTarget 是不行的，需要 browser ws；
    // 简化：直接看 /json/version 拿 webSocketDebuggerUrl
    ws.close(); bws.close();
    http.get('http://127.0.0.1:9222/json/version', (r2) => {
      let d2 = '';
      r2.on('data', (c) => d2 += c);
      r2.on('end', () => {
        const ver = JSON.parse(d2);
        const b = new WebSocket(ver.webSocketDebuggerUrl);
        b.onopen = () => b.send(JSON.stringify({ id: 1, method: 'Browser.getWindowForTarget', params: { targetId: page.id } }));
        b.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id === 1) {
            console.log(JSON.stringify(m.result || m.error));
            process.exit(0);
          }
        };
        setTimeout(() => process.exit(0), 5000);
      });
    });
  });
}).on('error', (e) => { console.log('ERR', e.message); process.exit(1); });
