// 主进程翻译服务 —— 渲染层受 CSP 限制不能直接发外部请求，翻译统一走主进程。
// 默认使用 MyMemory（免 key、国内网络可达、已验证中英双向），按字节切块规避其 500 字节/次限制。
// 若用户配置了 translateKey（Microsoft 订阅密钥），则优先走 Microsoft 官方 Azure AI Translator v3
// 接口（质量更高）。
//
// 注意：这里必须使用**官方文档化**的终结点 api.cognitive.microsofttranslator.com。
// 早期版本曾指向 api-edge.cognitive.microsofttranslator.com（Edge 浏览器内部使用的私有主机），
// 该主机不在 Azure AI Translator 的公开 API 契约内，属于未文档化端点，随时可能变更且不被许可条款覆盖，
// 因此已改为官方终结点。密钥仅保存在本机用户设置中，不随应用分发。
const https = require('https');

const MYMEMORY = 'https://api.mymemory.translated.net/get';
// Microsoft Azure AI Translator v3 官方终结点（文档：learn.microsoft.com/azure/ai-services/translator）
const MS_TRANSLATOR = 'https://api.cognitive.microsofttranslator.com/translate';

// 判定源语言：含 CJK → 中文（译为英文），否则 → 英文（译为中文）
function detectFrom(text) {
  return /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/.test(text) ? 'zh' : 'en';
}

// 把 from/to 归一化成 MyMemory langpair 用的语言代码
function langCode(from, to) {
  const src = from === 'zh' ? 'zh-CN' : 'en';
  const tgt = to === 'en' ? 'en' : 'zh-CN';
  return src + '|' + tgt;
}

// 按 UTF-8 字节上限切块：优先保留换行段落边界，超长的单行再硬切
function chunkText(text, maxBytes) {
  maxBytes = maxBytes || 400;
  const chunks = [];
  let cur = '';
  let curBytes = 0;
  const push = () => { if (cur.trim()) chunks.push(cur); cur = ''; curBytes = 0; };
  const lines = text.split('\n');
  for (const line of lines) {
    const lb = Buffer.byteLength(line, 'utf8');
    if (lb > maxBytes) {
      push();
      let buf = '', b = 0;
      for (const ch of line) {
        const cb = Buffer.byteLength(ch, 'utf8');
        if (b + cb > maxBytes) { chunks.push(buf); buf = ch; b = cb; }
        else { buf += ch; b += cb; }
      }
      if (buf.trim()) chunks.push(buf);
    } else {
      if (curBytes + lb + (cur ? 1 : 0) > maxBytes) push();
      cur += (cur ? '\n' : '') + line;
      curBytes += lb + (cur.endsWith(line) && cur !== line ? 1 : 0);
    }
  }
  push();
  return chunks.length ? chunks : [text];
}

function httpJson(url, { method = 'GET', headers = {}, body = null, timeout = 15000 } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', ...headers },
      timeout
    }, (r) => {
      let d = '';
      r.on('data', c => (d += c));
      r.on('end', () => resolve({ status: r.statusCode, body: d }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.on('error', (e) => resolve({ status: 0, body: e.code || e.message }));
    if (body) req.write(body);
    req.end();
  });
}

// MyMemory：免 key。逐块翻译后按原顺序拼接
async function translateMyMemory(text, from, to) {
  const langpair = langCode(from, to);
  const chunks = chunkText(text, 400);
  const out = [];
  for (const c of chunks) {
    const url = MYMEMORY + '?q=' + encodeURIComponent(c) + '&langpair=' + encodeURIComponent(langpair);
    const r = await httpJson(url, { timeout: 15000 });
    if (r.status !== 200) throw new Error('MyMemory HTTP ' + r.status);
    let j;
    try { j = JSON.parse(r.body); } catch (e) { throw new Error('MyMemory 响应解析失败'); }
    if (!j || j.responseStatus !== 200 || !j.responseData || !j.responseData.translatedText) {
      throw new Error('MyMemory 返回异常(' + (j && j.responseStatus) + ')');
    }
    out.push(j.responseData.translatedText);
  }
  return out.join('\n');
}

// Microsoft Azure AI Translator v3（官方终结点）：需 translateKey，可选 region。
// 整段一次提交（长度上限远大于 MyMemory）。
async function translateMicrosoft(text, from, to, key, region) {
  const src = from === 'zh' ? 'zh-Hans' : 'en';
  const tgt = to === 'en' ? 'en' : 'zh-Hans';
  const body = JSON.stringify([{ Text: text }]);
  const r = await httpJson(MS_TRANSLATOR + '?api-version=3.0&from=' + src + '&to=' + tgt, {
    method: 'POST', timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': key,
      'Ocp-Apim-Subscription-Region': region || 'global'
    },
    body
  });
  if (r.status !== 200) throw new Error('Microsoft HTTP ' + r.status);
  let j;
  try { j = JSON.parse(r.body); } catch (e) { throw new Error('Microsoft 响应解析失败'); }
  if (!Array.isArray(j) || !j.length || !j[0].translations || !j[0].translations[0].text) {
    throw new Error('Microsoft 返回异常');
  }
  return j[0].translations[0].text;
}

// 对外入口：{ text, from, to, key, region } → { ok, text?, error? }
async function translateText(payload) {
  const text = (payload && payload.text || '').trim();
  if (!text) return { ok: false, error: '没有可翻译的文本' };
  const from = (payload && payload.from) || detectFrom(text);
  const to = (payload && payload.to) || (from === 'zh' ? 'en' : 'zh-CN');
  const key = (payload && payload.key) || '';
  const region = (payload && payload.region) || '';
  // 有配置密钥则先试 Microsoft，失败再回退 MyMemory
  if (key) {
    try {
      const t = await translateMicrosoft(text, from, to, key, region);
      return { ok: true, text: t, from, to };
    } catch (e) { /* 回退 */ }
  }
  try {
    const t = await translateMyMemory(text, from, to);
    return { ok: true, text: t, from, to };
  } catch (e) {
    return { ok: false, error: '翻译失败：' + e.message };
  }
}

module.exports = { translateText, detectFrom };
