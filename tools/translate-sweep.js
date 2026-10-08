// 官方翻译端点批量扫描：一次性打印所有已登记官方端点的可达性与认证状态。
//
// 只使用 tools/translate-probe.js 中的官方端点登记表——**不含任何网页端私有接口**。
// 不要在这里补回百度/QQ/搜狗/有道/Yandex/Bing ttranslatev3/Google gtx 等未公开端点：
// 它们不在服务方的 API 契约内，且使用可能违反服务条款（详见 translate-probe.js 头部说明）。
//
// 用法：node tools/translate-sweep.js
// 需要密钥的端点通过环境变量配置：AZURE_TRANSLATOR_KEY / AZURE_TRANSLATOR_REGION / DEEPL_KEY
const { ENDPOINTS, probeEndpoint, format } = require('./translate-probe');

(async () => {
  const names = Object.keys(ENDPOINTS);
  const rows = [];
  for (const n of names) rows.push(await probeEndpoint(n));
  console.log('==== 官方翻译端点扫描（' + names.length + ' 个）====');
  for (let i = 0; i < rows.length; i++) {
    console.log(ENDPOINTS[rows[i].name].label);
    console.log('  ' + format(rows[i]));
  }
  const usable = rows.filter((r) => r.status === 200).map((r) => r.name);
  console.log('---- 当前可用（HTTP 200）：' + (usable.join(', ') || '（无）') + ' ----');
})();
