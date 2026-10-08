// 官方翻译端点双向可用性验证：确认 zh→en 与 en→zh 都真的能翻，而不只是接口可达。
//
// 只使用官方文档化端点（MyMemory / Azure AI Translator v3 / DeepL），
// **不含任何网页端私有接口**——原因见 tools/translate-probe.js 头部说明。
//
// 用法：node tools/translate-sweep2.js
// 需要密钥的端点通过环境变量配置：AZURE_TRANSLATOR_KEY / AZURE_TRANSLATOR_REGION / DEEPL_KEY
const { ENDPOINTS } = require('./translate-probe');
const https = require('https');

const SAMPLES = [
  { dir: 'zh->en', text: '今天天气很好', from: 'zh-Hans', to: 'en', pair: 'zh-CN|en' },
  { dir: 'en->zh', text: 'The quick brown fox jumps over the lazy dog. This is a test of the translation feature.', from: 'en', to: 'zh-Hans', pair: 'en|zh-CN' }
];

function probe(name, url, opts) {
  opts = opts || {};
  return new Promise((res) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: opts.method || 'GET',
      headers: { 'User-Agent': 'MarkStudio-translate-verify/1.0', ...(opts.headers || {}) },
      timeout: 12000
    }, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => res({ name, status: r.statusCode, body: d.slice(0, 300).replace(/\s+/g, ' ') }));
    });
    req.on('timeout', () => { req.destroy(); res({ name, status: 0, body: 'TIMEOUT' }); });
    req.on('error', (e) => res({ name, status: 0, body: 'ERR ' + (e.code || e.message) }));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function buildUrl(key, s) {
  if (key === 'mymemory') {
    return 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(s.text) + '&langpair=' + encodeURIComponent(s.pair);
  }
  if (key === 'azure') {
    return 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=' + s.from + '&to=' + s.to;
  }
  if (key === 'deepl') {
    return 'https://api-free.deepl.com/v2/translate?text=' + encodeURIComponent(s.text) + '&target_lang=' + (s.to === 'en' ? 'EN' : 'ZH');
  }
  return null;
}

(async () => {
  const out = [];
  for (const key of Object.keys(ENDPOINTS)) {
    const ep = ENDPOINTS[key];
    const headers = ep.auth();
    if (headers === null) { out.push(key + ' => 已跳过：缺少所需环境变量（密钥）'); continue; }
    for (const s of SAMPLES) {
      const url = buildUrl(key, s);
      if (!url) continue;
      const opts = { method: key === 'mymemory' ? 'GET' : 'POST', headers };
      if (key === 'azure') {
        opts.body = JSON.stringify([{ Text: s.text }]);
        opts.headers = { ...headers, 'Content-Type': 'application/json' };
      }
      const r = await probe(key + ' ' + s.dir, url, opts);
      out.push(r.name + ' => ' + (r.status || 'ERR') + ' | ' + r.body);
    }
  }
  console.log('==== 官方端点双向翻译验证 ====');
  console.log(out.join('\n'));
})();
