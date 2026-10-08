// MyMemory 官方接口专项验证（响应结构与限额行为）。
// 只使用官方文档化端点（https://mymemory.translated.net/doc/spec.php），
// **不含任何网页端私有接口**——原因见 tools/translate-probe.js 头部说明。
//
// 用法：node tools/translate-verify.js
const https = require('https');
function probe(name, url) {
  return new Promise((res) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'MarkStudio-translate-verify/1.0' }, timeout: 10000 }, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(name + ' => ' + r.statusCode + ' | ' + d.slice(0, 300).replace(/\s+/g, ' ')));
    });
    req.on('timeout', () => { req.destroy(); res(name + ' => TIMEOUT'); });
    req.on('error', e => res(name + ' => ERR ' + e.code));
    req.end();
  });
}
(async () => {
  const out = [];
  // zh -> en
  out.push(await probe('zh->en', 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent('今天天气很好') + '&langpair=zh-CN|en'));
  // en -> zh (longer)
  out.push(await probe('en->zh', 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent('The quick brown fox jumps over the lazy dog. This is a test of the translation feature.') + '&langpair=en|zh-CN'));
  // check responseStatus for errors / quota
  out.push(await probe('status', 'https://api.mymemory.translated.net/get?q=hi&langpair=en|zh-CN'));
  console.log(out.join('\n'));
})();
