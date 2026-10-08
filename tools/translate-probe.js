// 翻译后端连通性探针（**仅使用官方文档化的公开 API**）
//
// 用途：本地开发时验证「翻译」功能依赖的第三方后端是否可达、是否需要密钥。
// 该脚本不随安装包分发（package.json 的 build.files 不含 tools/），也不读取任何用户文档，
// 只发送固定的示例文本。
//
// 设计约束（重要，请勿违反）：
//   1. 只允许官方文档化的公开 API。**禁止**加入任何网页端私有/未公开接口
//      （例如 fanyi.baidu.com / fanyi.qq.com / fanyi.sogou.com / translate.yandex.net 的
//      前端 XHR、bing.com/ttranslatev3.aspx、translate.googleapis.com 的 client=gtx、
//      以及 api-edge.cognitive.microsofttranslator.com 这类浏览器内部主机）——
//      这类端点不在服务方的 API 契约内，随时可能变更，且使用它们可能违反服务条款。
//   2. 密钥一律从**环境变量**读取，不得通过命令行参数传入（避免进入 shell 历史 / 进程列表 / CI 日志）。
//
// 用法：
//   node tools/translate-probe.js                 # 探测所有已配置的官方端点
//   node tools/translate-probe.js mymemory        # 只探测指定端点
//   set AZURE_TRANSLATOR_KEY=xxx & set AZURE_TRANSLATOR_REGION=eastasia
//   set DEEPL_KEY=xxx
const https = require('https');

// 官方端点登记表：key 为探测名。需要密钥的端点在缺少对应环境变量时会被跳过（并说明原因）。
const ENDPOINTS = {
  // MyMemory：官方文档化免费接口，无需密钥。
  // 文档 https://mymemory.translated.net/doc/spec.php ；限额 https://mymemory.translated.net/doc/usagelimits.php
  // 应用默认使用该接口，注意其 q 参数上限 500 字节（应用内按 400 字节切块）。
  mymemory: {
    label: 'MyMemory（官方免费接口，免 key）',
    build: () => 'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent('Hello world') + '&langpair=' + encodeURIComponent('en|zh-CN'),
    method: 'GET',
    auth: () => null
  },
  // Microsoft Azure AI Translator v3：官方终结点，需要订阅密钥 + 区域。
  // 文档 https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/v3/translate
  azure: {
    label: 'Azure AI Translator v3（官方终结点，需 AZURE_TRANSLATOR_KEY）',
    build: () => 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hans',
    method: 'POST',
    body: () => JSON.stringify([{ Text: 'Hello world' }]),
    auth: () => {
      const key = process.env.AZURE_TRANSLATOR_KEY || '';
      if (!key) return null;
      return {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': process.env.AZURE_TRANSLATOR_REGION || 'global'
      };
    }
  },
  // DeepL：官方 API（免费版与 Pro 版主机不同），需要 auth key。
  // 文档 https://developers.deepl.com/docs/api-reference/translate
  deepl: {
    label: 'DeepL API Free（官方终结点，需 DEEPL_KEY）',
    build: () => 'https://api-free.deepl.com/v2/translate?text=' +
      encodeURIComponent('Hello world') + '&target_lang=ZH',
    method: 'POST',
    auth: () => {
      const key = process.env.DEEPL_KEY || '';
      return key ? { Authorization: 'DeepL-Auth-Key ' + key } : null;
    }
  }
};

function probe(name, url, opts) {
  opts = opts || {};
  return new Promise((res) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: { 'User-Agent': 'MarkStudio-translate-probe/1.0', ...(opts.headers || {}) },
      timeout: opts.timeout || 10000
    }, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => res({ name, status: r.statusCode, body: d.slice(0, 200).replace(/\s+/g, ' ') }));
    });
    req.on('timeout', () => { req.destroy(); res({ name, status: 0, body: 'TIMEOUT' }); });
    req.on('error', (e) => res({ name, status: 0, body: 'ERR ' + (e.code || e.message) }));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function probeEndpoint(name) {
  const ep = ENDPOINTS[name];
  if (!ep) return { name, status: 0, body: '未知端点（只允许官方登记表中的端点）' };
  const headers = ep.auth();
  if (headers === null) return { name, status: 0, body: '已跳过：缺少所需环境变量（密钥）' };
  return probe(name, ep.build(), { method: ep.method, headers, body: ep.body ? ep.body() : null });
}

function format(r) {
  return r.name.padEnd(10) + ' => ' + (r.status || 'ERR') + ' | ' + r.body;
}

module.exports = { ENDPOINTS, probe, probeEndpoint, format };

if (require.main === module) {
  (async () => {
    const only = process.argv[2];
    const names = only ? [only] : Object.keys(ENDPOINTS);
    console.log('只探测官方文档化端点：' + names.join(', '));
    for (const n of names) {
      if (!ENDPOINTS[n]) { console.log('未知端点：' + n + '（可选：' + Object.keys(ENDPOINTS).join(', ') + '）'); continue; }
      console.log(ENDPOINTS[n].label);
      console.log('  ' + format(await probeEndpoint(n)));
    }
  })();
}
