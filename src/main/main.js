const { app, BrowserWindow, ipcMain, dialog, Menu, MenuItem, shell, nativeTheme, clipboard, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const zlib = require('zlib');
const iconv = require('iconv-lite');
const { pathToFileURL } = require('url');
const { execFile, spawn } = require('child_process');
const { translateText } = require('./translate');

app.setName('MarkStudio');

// R61: Electron 没有内建 app.isQuitting()——直接调用抛 TypeError（R58 关闭流程因此
// 从首次运行即断裂：点窗口 X / 未保存弹窗确认后都会触发主进程未捕获异常弹框）。
// 改模块级标志：before-quit（托盘「退出 MarkStudio」/系统关机）时置 true
let appQuitting = false;
app.on('before-quit', () => { appQuitting = true; });

// ---------------------------------------------------------------- R87: 极简 ZIP 写入器（STORE + DEFLATE）
// 无外部依赖，用于把 OOXML 部件组装成合法的 .docx/.doc 容器（Word/WPS 依容器嗅探打开）。
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function makeZip(entries) {
  const chunks = []; const central = []; let offset = 0;
  const dosTime = 0; const dosDate = ((1996 - 1980) << 9) | (2 << 5) | 1; // 固定日期 1996-02-01
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = e.buf;
    const crc = crc32(data);
    let payload = data; let method = 0;
    try {
      const deflated = zlib.deflateRawSync(data, { level: 9 });
      if (deflated.length < data.length) { payload = deflated; method = 8; }
    } catch (err) { payload = data; method = 0; }
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);       // version needed
    lh.writeUInt16LE(0x0800, 6);   // flag: UTF-8 文件名
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    chunks.push(lh, nameBuf, payload);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([ch, nameBuf]));
    offset += 30 + nameBuf.length + payload.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

// ---------------------------------------------------------------- 通用状态
const wins = new Set(); // 所有窗口
// R75-5：拖拽未保存标签开新窗口时暂存「待取内容」，token 经 query 传给新窗口，
// 渲染层启动后按 token 取走（内容可能很大，不走 query 字符串避免 URL 长度上限）
const pendingUnsaved = new Map();
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = { theme: 'light', contentTheme: 'auto', fontSize: 16, contentFont: '', autosave: false, typewriter: false, focusMode: false, sidebarWidth: 260, contentWidth: 'full', contentCenter: false, wrap: true, lineHeight: 1.75, closeAction: 'ask' };
let settingsCache = null;
// 渲染进程上报的 UI 状态（用于菜单项动态标签，如 隐藏/打开侧边栏）
let uiState = { sidebarVisible: false, sourceMode: false, showLines: true };

function loadStore() {
  if (settingsCache) return settingsCache;
  try {
    settingsCache = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch (e) {
    settingsCache = { settings: { ...DEFAULT_SETTINGS }, recent: [] };
  }
  if (!settingsCache.settings) settingsCache.settings = { ...DEFAULT_SETTINGS };
  if (!Array.isArray(settingsCache.recent)) settingsCache.recent = [];
  // R75-2：最近打开的文件夹（文件→最近文件夹 子菜单）
  if (!Array.isArray(settingsCache.recentFolders)) settingsCache.recentFolders = [];
  return settingsCache;
}
function saveStore() {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(loadStore(), null, 2), 'utf8');
  } catch (e) { /* 忽略持久化失败 */ }
}
function getSettings() {
  const s = { ...DEFAULT_SETTINGS, ...loadStore().settings };
  // 防污染：历史上可能写入过 null/NaN，读回时统一归一为默认值
  if (!Number.isFinite(s.fontSize) || !s.fontSize) s.fontSize = DEFAULT_SETTINGS.fontSize;
  if (!Number.isFinite(s.lineHeight) || s.lineHeight < 1 || s.lineHeight > 3) s.lineHeight = DEFAULT_SETTINGS.lineHeight;
  if (!['ask', 'minimize', 'quit'].includes(s.closeAction)) s.closeAction = DEFAULT_SETTINGS.closeAction;
  // R67：快捷键自定义表（id → 组合串），历史版本无此字段或写坏时归一为 {}
  if (!s.shortcuts || typeof s.shortcuts !== 'object' || Array.isArray(s.shortcuts)) s.shortcuts = {};
  return s;
}

function pushRecent(filePath) {
  if (!filePath) return;
  const store = loadStore();
  store.recent = [filePath, ...store.recent.filter(p => path.resolve(p) !== path.resolve(filePath))].slice(0, 15);
  saveStore();
  rebuildMenus();
  trayRebuildRecent();
}

// R75-2：记录最近打开的文件夹（去重、置顶，保留最近 10 个）
function pushRecentFolder(folderPath) {
  if (!folderPath) return;
  const store = loadStore();
  store.recentFolders = [folderPath, ...store.recentFolders.filter(p => path.resolve(p) !== path.resolve(folderPath))].slice(0, 10);
  saveStore();
  rebuildMenus();
}

// ---------------------------------------------------------------- 文本读写（UTF-8 / GBK 自动识别）
function decodeBuffer(buf) {
  let hadBom = false;
  let body = buf;
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    hadBom = true;
    body = buf.subarray(3);
  }
  // 先按 UTF-8 严格解码，失败则回退 GBK
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    return { text: decoder.decode(body), encoding: 'utf-8', hadBom };
  } catch (e) {
    return { text: iconv.decode(body, 'gbk'), encoding: 'gbk', hadBom };
  }
}

function detectEol(text) {
  const idx = text.indexOf('\n');
  if (idx > 0 && text[idx - 1] === '\r') return '\r\n';
  return '\n';
}

async function readTextFile(filePath) {
  const buf = await fsp.readFile(filePath);
  const { text, encoding, hadBom } = decodeBuffer(buf);
  return { path: filePath, content: text, eol: detectEol(text), hadBom, encoding };
}

async function writeTextFile(filePath, content, eol, hadBom) {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  let out = (content || '').replace(/\r\n/g, '\n').replace(/\n/g, eol || '\n');
  let buf = Buffer.from(out, 'utf8');
  if (hadBom) buf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), buf]);
  const tmp = filePath + '.mkstudio-tmp';
  await fsp.writeFile(tmp, buf);
  await fsp.rename(tmp, filePath);
  return { ok: true, mtime: (await fsp.stat(filePath)).mtimeMs };
}

// ---------------------------------------------------------------- 窗口
function filesFromArgv(argv) {
  // R40：argv 可能带多个文件（拖拽多个文件到 exe / 命令行多参数）。
  // 按命令行原始顺序全部收集并按绝对路径去重，不再只取最后一个
  const out = [];
  const seen = new Set();
  for (let i = argv.length - 1; i >= 1; i--) {
    const a = argv[i];
    if (typeof a === 'string' && /\.(md|markdown|txt)$/i.test(a) && fs.existsSync(a)) {
      const p = path.resolve(a);
      if (!seen.has(p)) { seen.add(p); out.unshift(p); }
    }
  }
  return out;
}

function titleFor(win) {
  const name = win.__docPath ? path.basename(win.__docPath) : '未命名';
  return `${name}${win.__dirtyActive ? ' *' : ''} - MarkStudio`;
}

// ---------------------------------------------------------------- 任务栏图标分组（R73-1）
// Win11 默认把同一应用的所有窗口合并成一个任务栏按钮（带数字角标）。用户要求
// 「一个窗口 = 一个任务栏图标」：同一窗口内多文件标签不增图标，开新窗口才 +1。
// 做法：给每个窗口设置独立的 Application User Model ID（Win10 2004+/Win11 起
// 任务栏按「窗口级 AUMID」分组）。Electron 31 只有应用级 app.setAppUserModelId，
// 窗口级 AUMID 必须调 Win32 SetWindowInfo(WNI_APP_USER_MODEL_ID)——
// 用 PowerShell Add-Type P/Invoke（与 app:list-fonts 同一模式），HWND 取自
// win.getNativeWindowHandle()。失败无碍：回落到任务栏默认分组，不影响功能。
const AUMID_CSHARP = 'using System;using System.Runtime.InteropServices;public static class MsAumid{[DllImport("user32.dll",SetLastError=true)]public static extern bool SetWindowInfo(IntPtr hWnd,int dwItem,uint cbItem,IntPtr pvInfo);}';
const AUMID_PS = 'Add-Type -TypeDefinition $args[1];$s=$args[0];$p=[System.Runtime.InteropServices.Marshal]::StringToHGlobalUni($s);try{[void][MsAumid]::SetWindowInfo([IntPtr][long]$args[2],2,[uint32]($s.Length*2+2),$p)}finally{[System.Runtime.InteropServices.Marshal]::FreeHGlobal($p)}';
// 一次性探测系统是否提供 SetWindowInfo（个别精简系统镜像的 user32.dll 没有该导出，
// 例如部分 VDI 镜像）——确认后不再重复 spawn，避免每次开窗口都跑一遍注定失败的脚本
let aumidSupported = null; // null=未确认 / true / false
function aumidSupportedCheck() {
  if (process.platform !== 'win32') { aumidSupported = false; return; }
  const probe = 'Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public class MsProbe{[DllImport("kernel32.dll")]public static extern IntPtr GetModuleHandle(string n);[DllImport("kernel32.dll",CharSet=CharSet.Ansi)]public static extern IntPtr GetProcAddress(IntPtr h,string n);}\';([MsProbe]::GetProcAddress([MsProbe]::GetModuleHandle("user32.dll"),"SetWindowInfo") -ne [IntPtr]::Zero)';
  try {
    const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', probe], { windowsHide: true });
    let out = '';
    ps.stdout.on('data', (d) => { out += d; });
    ps.on('error', () => { });
    ps.on('exit', () => { aumidSupported = /true/i.test(out); });
  } catch (e) { aumidSupported = false; }
}
function applyWindowAumid(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return;
  if (aumidSupported === false) return; // 已确认系统无此 API（null=未确认，照常尝试）
  let hwnd = 0;
  try {
    const buf = win.getNativeWindowHandle();
    if (buf && buf.length >= 4) hwnd = buf.readUInt32LE(0);
  } catch (e) { return; }
  if (!hwnd) return;
  try {
    spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', AUMID_PS, 'com.markstudio.app.win' + win.id, AUMID_CSHARP, String(hwnd)],
      { windowsHide: true, stdio: 'ignore' });
  } catch (e) { /* AUMID 失败不影响窗口本身 */ }
}

function createWindow(filePath, opts = {}) {
  const s = getSettings();
  const dark = s.theme === 'dark';
  const win = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    show: false,
    // R73：标签拖出新窗口的落点（源窗口右下方偏移，WPS 式）；未指定时由系统级联
    x: Number.isFinite(opts.x) ? Math.round(opts.x) : undefined,
    y: Number.isFinite(opts.y) ? Math.round(opts.y) : undefined,
    // 无框窗口：标题栏（MarkStudio 标签 + 文件标签 + 窗口按钮）由渲染层自绘
    frame: false,
    backgroundColor: dark ? '#1e1e1e' : '#ffffff',
    autoHideMenuBar: false,
    icon: path.join(app.getAppPath(), 'resources', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 渲染进程沙箱：preload 只用到 electron 的 contextBridge/ipcRenderer/webUtils 与
      // process.platform（沙箱化 preload 均可用），渲染层本身本就 nodeIntegration:false，
      // 因此开启沙箱不改变现有功能，只缩小渲染进程被攻破后的影响面。
      sandbox: true,
      spellcheck: false,
      webSecurity: true
    }
  });
  win.__docPath = filePath || null;
  win.__dirty = false;
  wins.add(win);
  // R92：渲染进程崩溃（如超大文档整篇编辑耗尽内存）自动重载——否则窗口全白，
  // 自绘的菜单栏/标题栏/标签栏全是 DOM，会随进程死亡一起"消失"，用户只能强退
  win.webContents.on('render-process-gone', (e, details) => {
    if (details && details.reason === 'clean-exit') return;
    console.error('[markstudio] renderer gone:', details && details.reason, details && details.exitCode);
    try { win.webContents.reload(); } catch (err) { }
  });
  applyWindowAumid(win); // R73-1：独立任务栏图标（尽早设置；show 前再补一次防竞争）
  // R73-2：把窗口 id 发给渲染层——标签跨窗口拖拽时源窗口 id 要放进拖拽数据，
  // 目标窗口落地后凭它通知源窗口移除对应标签
  // R73-2：把窗口 id 发给渲染层（双通道：事件 + 主动查询，防 init() 异步延迟的
  // 竞态——bindUi 的监听注册晚于 did-finish-load 时事件会丢，查询通道无此问题）
  win.webContents.once('did-finish-load', () => {
    try { win.webContents.send('win:id', win.id); } catch (e) { }
  });
  // 兜底：禁止页面 window.open 弹出新 MarkStudio 窗口（http(s) 链接交由系统浏览器打开）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const query = {};
  if (filePath) query.file = filePath;
  if (opts.extraFiles && opts.extraFiles.length) query.files = JSON.stringify(opts.extraFiles);
  if (process.env.MARKSTUDIO_FOLDER) query.folder = process.env.MARKSTUDIO_FOLDER;
  if (opts.folder) query.folder = opts.folder; // R72：新窗口打开拖入文件时，目录=文件所在目录
  if (opts.smoke) query.smoke = '1';
  if (opts.trayNewFile) query.newfile = '1';
  if (opts.debug) query.debug = '1';
  // R75-5：新窗口以「未保存内容」打开（拖拽未保存标签到松手点）——内容走 IPC 取，token 走 query
  if (opts.unsavedToken) query.unsaved = opts.unsavedToken;
  win.loadFile(path.join(__dirname, '../renderer/index.html'), { query });

  if (opts.debug) {
    // 后台管道断开时 stdout 会以异步 error 事件抛 EPIPE，吞掉以免主进程崩溃
    try { process.stdout.on('error', () => {}); process.stderr.on('error', () => {}); } catch (err) { }
    win.webContents.on('console-message', (e, level, message) => {
      try { process.stdout.write('[renderer] ' + (message || String(e)) + '\n'); } catch (err) { }
    });
  }

  win.once('ready-to-show', () => {
    applyWindowAumid(win); // R73-1：show 之前再设一次，确保任务栏按钮按窗口级 AUMID 分组
    if (opts.maximized) win.maximize();
    win.show();
    win.webContents.send('window:max-state', win.isMaximized());
    win.webContents.send('window:full-state', win.isFullScreen()); // R75：初始全屏状态（菜单「全屏/退出全屏」切换用）
  });

  // 最大化/还原状态同步给渲染层（自绘标题栏切换图标），拖顶边、双击等外部操作也能同步
  win.on('maximize', () => { try { win.webContents.send('window:max-state', true); } catch (e) { } });
  win.on('unmaximize', () => { try { win.webContents.send('window:max-state', false); } catch (e) { } });
  // R75：全屏状态同步给渲染层——视图菜单据此显示「全屏」或「退出全屏」（同一时间只出现一个）
  win.on('enter-full-screen', () => { try { win.webContents.send('window:full-state', true); } catch (e) { } });
  win.on('leave-full-screen', () => { try { win.webContents.send('window:full-state', false); } catch (e) { } });
  // R71：窗口可见性 ↔ 托盘图标互斥（show=窗口出现→托盘隐藏；hide=藏到托盘→托盘出现）
  win.on('show', syncTrayVisibility);
  win.on('hide', syncTrayVisibility);

  // R58：关闭决定（设置 closeAction）——用户点 X（或未保存弹窗里选择保存/不保存后）：
  // minimize=最小化到系统托盘（程序保持运行）/ quit=完全退出 / ask=每次询问
  // R69：minimize 用 win.hide() 而非 minimize()——任务栏窗口按钮一并消失，
  //      只保留托盘图标（用户要求）；托盘左键 / 右键「打开 MarkStudio」恢复窗口
  // R62：ask 询问改用应用内 iOS 毛玻璃弹窗（渲染层 #close-modal），不再弹系统原生框
  const requestCloseDecision = async () => {
    if (!win || win.isDestroyed() || appQuitting) return;
    const action = getSettings().closeAction || 'ask';
    if (action === 'minimize') { win.hide(); return; }
    if (action === 'quit') { app.quit(); return; }
    // 询问弹窗已打开时忽略重复的关闭请求（用户连点 X），避免叠加
    if (win.__askingClose) return;
    win.__askingClose = true;
    let timer = null;
    const choice = await new Promise((resolve) => {
      win.__askCloseResolve = resolve;
      win.webContents.send('app:close-ask');
      // 渲染层异常（崩溃/卡死）兜底：30 秒无应答按「取消」处理，窗口原样保留。
      // R63：5 秒太短——用户读提示词、想一想就超过 5 秒，届时主进程先吞掉应答，
      // 用户再点「退出」/「最小化」时 win.__askCloseResolve 已为 null，点击静默无效
      // （用户报告「选了退出但没退出」的根因）。同时通知渲染层同步收起弹窗，
      // 避免一个「已失效但仍可点」的弹窗留下
      timer = setTimeout(() => {
        if (win.__askCloseResolve) {
          win.__askCloseResolve = null;
          resolve('cancel');
          try { win.webContents.send('app:close-ask-timeout'); } catch (err) { }
        }
      }, 30000);
    });
    if (timer) clearTimeout(timer);
    win.__askingClose = false;
    if (win.isDestroyed()) return;
    if (choice === 'quit') app.quit();
    else if (choice === 'minimize') win.hide(); // R69：隐藏到托盘（任务栏不留按钮）
    // 'cancel'（含超时）：什么都不做
  };

  win.on('close', (e) => {
    if (win.__closing || appQuitting) return; // 应用自身在退出（托盘「退出」/系统关机）→ 放行
    if (process.env.MARKSTUDIO_SMOKE) return; // 冒烟测试：直接关闭
    if (win.__askingClose) { e.preventDefault(); return; } // R62：关闭确认弹窗打开中
    if (win.__dirty) {
      // R50：未保存 → 先走应用内毛玻璃弹窗（保存/不保存/取消）；用户确认关闭后
      // close-done(ok=true) 再执行关闭决定
      e.preventDefault();
      win.__pendingClose = true;
      win.webContents.send('app:close-intent');
      return;
    }
    e.preventDefault();
    requestCloseDecision();
  });
  win.__closeDecision = requestCloseDecision; // 供 app:close-done（未保存弹窗结束后）复用

  win.on('closed', () => {
    wins.delete(win);
    syncTrayVisibility(); // R71：窗口被销毁（非隐藏）后重算托盘可见性
    closeWatch(win);
    if (win.__tabWatchers) {
      for (const w of win.__tabWatchers.values()) { try { w.close(); } catch (e) { } }
      win.__tabWatchers = null;
    }
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.__watcher = null;
  return win;
}

function closeWatch(win) {
  if (win.__watcher) { try { win.__watcher.close(); } catch (e) { } win.__watcher = null; }
  if (win.__tabWatchers) {
    for (const w of win.__tabWatchers.values()) { try { w.close(); } catch (e) { } }
    win.__tabWatchers = new Map();
  }
}
// 多标签：按渲染层上报的「全部已打开标签路径」做外部修改监听（增量增删，保留各文件基线 mtime）
function watchTabPaths(win, paths) {
  if (!win || win.isDestroyed()) return;
  const cur = win.__tabWatchers || (win.__tabWatchers = new Map());
  const want = new Set((paths || []).filter(Boolean).map(p => path.resolve(p)));
  for (const [p, w] of Array.from(cur.entries())) {
    if (!want.has(p)) { try { w.close(); } catch (e) { } cur.delete(p); }
  }
  for (const pRaw of want) {
    if (cur.has(pRaw)) continue;
    if (!fs.existsSync(pRaw)) continue;
    try {
      let lastMtime = fs.statSync(pRaw).mtimeMs;
      const w = fs.watch(pRaw, () => {
        try {
          const st = fs.statSync(pRaw);
          // 过滤我们自己的保存：mtime 与刚写入值一致且时间窗内，不报“外部修改”
          const own = win.__lastWriteMtime || 0;
          if (own && Math.abs(st.mtimeMs - own) < 20 && (Date.now() - (win.__lastWriteAt || 0)) < 5000) {
            lastMtime = st.mtimeMs;
            return;
          }
          if (st.mtimeMs > lastMtime + 5) {
            lastMtime = st.mtimeMs;
            if (!win.isDestroyed()) win.webContents.send('fs:changed', { path: pRaw });
          }
        } catch (e) { /* 文件可能被删除 */ }
      });
      cur.set(pRaw, w);
    } catch (e) { /* watch 失败不影响主流程 */ }
  }
}

// ---------------------------------------------------------------- 菜单
// 界面已改用渲染层自绘菜单栏（悬浮即开、切换灵敏、支持富 UI 如颜色/字体面板），
// 不再安装原生菜单；所有快捷键改由渲染层 keydown 统一处理。
function rebuildMenus() {
  // macOS 例外：菜单栏自绘之外必须保留原生菜单，否则没有「退出 MarkStudio」(Cmd+Q)、
  // 标准复制/粘贴/撤销菜单项，macOS 顶部菜单栏也是空的（平台惯例要求存在 appMenu）。
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' }
    ]));
    return;
  }
  Menu.setApplicationMenu(null);
}

function updateSettings(partial) {
  const store = loadStore();
  store.settings = { ...getSettings(), ...partial };
  saveStore();
  if (partial.theme) {
    nativeTheme.themeSource = partial.theme === 'dark' ? 'dark' : (partial.theme === 'auto' ? 'system' : 'light');
  }
  rebuildMenus(); // 刷新菜单勾选态（主题/宽度/字体/换行等）
}

function openPathIn(win, p) {
  // 多标签模式：一律在指定窗口内以标签页打开（渲染层负责去重/激活），不再弹出新窗口
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send('app:open-path', p);
  } else {
    createWindow(p);
  }
}


// ---------------------------------------------------------------- 导出（PDF / 打印 用隐藏窗口渲染）
async function renderHidden(html) {
  const tmpHtml = path.join(app.getPath('temp'), 'markstudio-export.html');
  await fsp.writeFile(tmpHtml, html, 'utf8');
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await w.loadFile(tmpHtml);
  return w;
}

// ---------------------------------------------------------------- IPC
function registerIpc() {
  const handler = (channel, fn) => ipcMain.handle(channel, (e, payload) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return fn(payload, win, e);
  });

  handler('dialog:open-file', async (payload, win) => {
    const r = await dialog.showOpenDialog(win, {
      title: payload && payload.image ? '插入图片' : '打开 Markdown 文件',
      properties: ['openFile'],
      filters: payload && payload.image
        ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }]
        : [
            { name: 'Markdown 与文本', extensions: ['md', 'markdown', 'txt'] },
            { name: '所有文件', extensions: ['*'] }
          ]
    });
    if (r.canceled || !r.filePaths.length) return null;
    if (payload && payload.image) return { path: r.filePaths[0] };
    pushRecent(r.filePaths[0]);
    return readTextFile(r.filePaths[0]);
  });

  handler('dialog:open-folder', async (p, win) => {
    const r = await dialog.showOpenDialog(win, { title: '打开文件夹', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths.length) return null;
    pushRecentFolder(r.filePaths[0]); // R75-2：记住文件夹
    return r.filePaths[0];
  });

  handler('fs:read-file', async ({ path: p }) => {
    try { return await readTextFile(p); }
    catch (err) { return { error: String(err.message || err) }; }
  });

  handler('fs:write-file', async ({ path: p, content, eol, hadBom }, win) => {
    try {
      const r = await writeTextFile(p, content, eol, hadBom);
      if (win) { win.__lastWriteMtime = r.mtime; win.__lastWriteAt = Date.now(); }
      pushRecent(p);
      return r;
    } catch (err) {
      return { error: String(err.message || err) };
    }
  });

  // R72：拖入文件「复制到当前文件夹」用——目标已有同名文件时不覆盖（返回 exists，
  // 渲染层直接打开现有文件，避免覆盖用户数据）
  handler('fs:copy-file', async ({ from, to }) => {
    try {
      if (!from || !to || !path.isAbsolute(from) || !path.isAbsolute(to)) return { error: '路径无效' };
      const srcExists = await fsp.access(from).then(() => true, () => false);
      if (!srcExists) return { error: '源文件不存在' };
      if (await fsp.access(to).then(() => true, () => false)) return { exists: true };
      await fsp.copyFile(from, to);
      return { ok: true, to };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });

  handler('dialog:save-file', async ({ defaultPath }, win) => {
    const r = await dialog.showSaveDialog(win, {
      title: '保存 Markdown 文件',
      defaultPath: defaultPath || '未命名.md',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (r.canceled || !r.filePath) return null;
    if (!/\.(md|markdown|txt)$/i.test(r.filePath)) return r.filePath + '.md';
    return r.filePath;
  });

  handler('doc:state', ({ path: p, dirty, anyDirty }, win) => {
    if (!win) return;
    // 关闭拦截按「任一标签未保存」判断；标题星号只反映当前活动标签
    win.__dirty = !!(anyDirty || dirty);
    win.__dirtyActive = !!dirty;
    if (p !== undefined) {
      if (p && (!win.__docPath || path.resolve(win.__docPath) !== path.resolve(p))) {
        win.__docPath = p;
        pushRecent(p);
      } else if (!p) {
        win.__docPath = null;
      }
    }
    win.setTitle(titleFor(win));
  });

  // 多标签：上报全部已打开标签的文件路径，主进程增量维护 fs.watch
  handler('fs:watch-tabs', ({ paths }, win) => watchTabPaths(win, paths || []));

  // F11 全屏（自定义菜单栏后由渲染层触发）
  handler('window:fullscreen', ({ full }, win) => {
    if (!win) return;
    win.setFullScreen(full !== undefined ? !!full : !win.isFullScreen());
  });

  // 自绘标题栏：最小化 / 最大化(还原)
  handler('window:minimize', (p, win) => { if (win) win.minimize(); });
  handler('window:maximize', (p, win) => {
    if (!win) return;
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  });

  handler('app:close-done', ({ ok }, win) => {
    if (!win || !win.__pendingClose) return;
    win.__pendingClose = false;
    win.__closing = false;
    if (!ok) return; // 用户取消：窗口原样保留
    if (process.env.MARKSTUDIO_SMOKE || appQuitting) { try { win.destroy(); } catch (e) { } return; }
    // 用户确认关闭（保存/不保存）→ 执行关闭决定（设置 closeAction：最小化/退出/询问）
    if (typeof win.__closeDecision === 'function') win.__closeDecision();
    else win.destroy();
  });

  // R62：应用内关闭确认弹窗（ask 路径）的结果回传
  handler('app:close-ask-done', ({ action }, win) => {
    if (!win || !win.__askCloseResolve) return;
    const r = win.__askCloseResolve;
    win.__askCloseResolve = null;
    r(action === 'quit' ? 'quit' : (action === 'minimize' ? 'minimize' : 'cancel'));
  });

  handler('fs:read-dir', async ({ path: root }) => {
    const SKIP = new Set(['node_modules', '.git', '.svn', '.hg', '.idea', '.vscode', '__pycache__']);
    const MD_EXT = /\.(md|markdown|txt)$/i;
    async function walk(dir, depth) {
      let entries = [];
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return []; }
      entries = entries.filter(e => !e.name.startsWith('.') && !SKIP.has(e.name));
      entries.sort((a, b) => {
        const ad = a.isDirectory() ? 0 : 1, bd = b.isDirectory() ? 0 : 1;
        if (ad !== bd) return ad - bd;
        const am = MD_EXT.test(a.name) ? 0 : 1, bm = MD_EXT.test(b.name) ? 0 : 1;
        if (am !== bm) return am - bm;
        return a.name.localeCompare(b.name, 'zh-Hans-CN');
      });
      const out = [];
      for (const e of entries.slice(0, 2000)) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          out.push({ name: e.name, path: full, isDir: true, children: depth < 8 ? await walk(full, depth + 1) : [] });
        } else {
          // 显示全部文件；openable 标记本应用能否直接编辑（md/markdown/txt）
          out.push({ name: e.name, path: full, isDir: false, openable: MD_EXT.test(e.name) });
        }
      }
      return out;
    }
    return { name: path.basename(root) || root, path: root, isDir: true, children: await walk(root, 1) };
  });

  handler('app:get-settings', () => getSettings());
  handler('app:set-settings', ({ partial }) => { updateSettings(partial || {}); return getSettings(); });
  // R75-3：恢复默认——按范围把对应字段重置为 DEFAULT_SETTINGS 并立即落盘。
  // 单源真理在 DEFAULT_SETTINGS（main.js），渲染层不各自硬编码默认值。
  handler('app:reset-settings', ({ scope }) => {
    const store = loadStore();
    if (!store.settings || typeof store.settings !== 'object') store.settings = {};
    const def = DEFAULT_SETTINGS;
    const setFields = (fields) => { fields.forEach(f => { if (f in def) store.settings[f] = def[f]; }); };
    if (scope === 'general') setFields(['theme', 'contentTheme', 'closeAction']);
    else if (scope === 'appearance') setFields(['fontSize', 'contentFont', 'lineHeight', 'contentWidth', 'contentCenter']);
    else if (scope === 'editor') setFields(['wrap', 'autosave', 'typewriter', 'focusMode']);
    else if (scope === 'all') {
      Object.keys(def).forEach(f => { store.settings[f] = def[f]; });
      store.settings.shortcuts = {};
    } else return getSettings(); // 未知范围：原样返回，不误改
    saveStore();
    return getSettings();
  });
  handler('app:menu-state', (s) => {
    if (s) {
      if (typeof s.sidebarVisible === 'boolean') uiState.sidebarVisible = s.sidebarVisible;
      if (typeof s.sourceMode === 'boolean') uiState.sourceMode = s.sourceMode;
      if (typeof s.showLines === 'boolean') uiState.showLines = s.showLines;
    }
    rebuildMenus();
    return true;
  });
  handler('app:recent', () => loadStore().recent || []);
  // 重命名后把最近文件里的旧路径替换为新路径（标签悬浮卡片「重命名」用）
  handler('app:recent-replace', ({ from, to }) => {
    const st = loadStore();
    if (!Array.isArray(st.recent)) st.recent = [];
    st.recent = st.recent.map(p => (p === from ? to : p));
    saveStore();
    rebuildMenus();
    trayRebuildRecent();
    return st.recent;
  });
  handler('app:clear-recent', () => { loadStore().recent = []; saveStore(); rebuildMenus(); trayRebuildRecent(); });

  // R75-2：最近文件夹（文件→最近文件夹 子菜单）
  handler('app:recent-folders', () => loadStore().recentFolders || []);
  handler('app:push-recent-folder', ({ path: p }) => { pushRecentFolder(p); return loadStore().recentFolders || []; });

  handler('shell:open-external', ({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  handler('shell:open-path', ({ path: p }) => { if (p) shell.openPath(p); });
  handler('shell:show-item', ({ path: p }) => { if (p) shell.showItemInFolder(p); });
  handler('clipboard:write', ({ text }) => clipboard.writeText(text || ''));
  handler('clipboard:read', () => clipboard.readText());

  // 翻译：渲染层把选中文本 + 方向传上来，主进程调翻译服务（MyMemory / 可选 Microsoft）
  handler('translate:text', async ({ text, from, to }) => {
    const s = getSettings();
    return translateText({ text, from, to, key: s.translateKey || '', region: s.translateRegion || '' });
  });

  handler('app:cdn-url', () => pathToFileURL(path.join(app.getAppPath(), 'vendor', 'vditor')).href);

  // 系统已安装字体列表（进程内缓存，仅查询一次）
  let fontsCache = null;
  handler('app:list-fonts', async () => {
    if (process.platform !== 'win32') return [];
    if (fontsCache) return fontsCache;
    fontsCache = [];
    // 管道里 PowerShell 按系统代码页（GBK）输出，中文字体名会乱码；
    // 改为让 PowerShell 以「无 BOM 的 UTF-8」写入临时文件，再由 Node 按 UTF-8 读回。
    // 每行输出两列（制表符分隔）：family 名 + 本地化名（zh-CN，LCID 0x0804）。
    // 中文界面下字体列表应显示中文名称（如「微软雅黑」而不是 Microsoft YaHei），
    // 而 CSS font-family 应用仍用 family 名，保证选中字体一定生效。
    // 注意：System.Drawing 的 FontFamily.GetName 只有 int(LCID) 重载，
    // PowerShell 直接调用会绑定失败（报 int 转换错误），必须走 C# Add-Type。
    const tmpFile = path.join(app.getPath('temp'), 'markstudio-fonts-' + process.pid + '.txt');
    try {
      await new Promise((resolve) => {
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
          'Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition \'using System;using System.Drawing.Text;using System.Text;public static class MsFontList{public static string GetAll(){var sb=new StringBuilder();var fc=new InstalledFontCollection();foreach(var fam in fc.Families){string loc=fam.Name;try{loc=fam.GetName(0x0804);}catch{ }sb.AppendLine(fam.Name+"\\t"+loc);}return sb.ToString();}}\';' +
          '$enc = New-Object System.Text.UTF8Encoding($false);' +
          '[System.IO.File]::WriteAllText(\'' + tmpFile.replace(/\\/g, '/') + '\', [MsFontList]::GetAll(), $enc)'],
          { timeout: 20000, windowsHide: true },
          () => resolve());
      });
      const raw = await fsp.readFile(tmpFile, 'utf8');
      const seen = new Set();
      fontsCache = raw.split(/\r?\n/).map(s => s.replace(/^\uFEFF/, '').trim()).filter(Boolean)
        .map((line) => {
          const i = line.indexOf('\t');
          if (i === -1) return { family: line, local: line };
          const family = line.slice(0, i).trim();
          const local = line.slice(i + 1).trim();
          return { family, local: local || family };
        })
        .filter((f) => { if (!f.family || seen.has(f.family.toLowerCase())) return false; seen.add(f.family.toLowerCase()); return true; })
        .sort((a, b) => (a.local || '').localeCompare(b.local || '', 'zh-Hans-CN'));
    } catch (e) { fontsCache = []; }
    try { await fsp.unlink(tmpFile); } catch (e) {}
    return fontsCache;
  });

  // 重命名文件（同目录内；标签悬浮卡片「重命名」用）
  handler('fs:rename', async ({ from, to }) => {
    try {
      if (!from || !to) return { error: '路径为空' };
      const st = await fsp.stat(to).catch(() => null);
      if (st) return { error: '目标文件已存在：' + path.basename(to) };
      await fsp.rename(from, to);
      return { ok: true, path: to };
    } catch (e) { return { error: e.message || String(e) }; }
  });

  handler('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }));

  handler('app:native-theme', ({ theme }) => {
    nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light';
  });

  // 图片粘贴/拖入：按内容 hash 去重保存到文档同目录 assets/
  handler('img:save', async ({ dataB64, baseDir, suggestedName }, win) => {
    const buf = Buffer.from(dataB64, 'base64');
    const dir = baseDir && fs.existsSync(baseDir) ? baseDir : app.getPath('pictures');
    const assetsDir = path.join(dir, 'assets');
    await fsp.mkdir(assetsDir, { recursive: true });
    const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 12);
    const ext = (suggestedName && /\.([a-z0-9]+)$/i.test(suggestedName)) ? RegExp.$1.toLowerCase() : 'png';
    let name = `image-${hash}.${ext}`;
    let full = path.join(assetsDir, name);
    if (!fs.existsSync(full)) await fsp.writeFile(full, buf);
    const rel = 'assets/' + name;
    return { abs: full, rel };
  });

  handler('fs:read-base64', async ({ path: p }) => {
    try {
      const buf = await fsp.readFile(p);
      return { dataB64: buf.toString('base64'), mime: guessMime(p) };
    } catch (e) { return { error: String(e.message || e) }; }
  });

  handler('fs:read-text', async ({ path: p }) => {
    try { return { text: await fsp.readFile(p, 'utf8') }; }
    catch (e) { return { error: String(e.message || e) }; }
  });

  handler('export:pdf', async ({ html, suggestedName }, win) => {
    const r = await dialog.showSaveDialog(win, {
      title: '导出 PDF',
      defaultPath: suggestedName || '导出.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    const w = await renderHidden(html);
    try {
      const pdf = await w.webContents.printToPDF({ printBackground: true, margins: { top: 0.6, bottom: 0.6, left: 0.5, right: 0.5 }, pageSize: 'A4' });
      await fsp.writeFile(r.filePath, pdf);
      return { ok: true, path: r.filePath };
    } catch (err) {
      return { error: String(err.message || err) };
    } finally {
      w.destroy();
    }
  });

  handler('export:html', async ({ html, suggestedName }, win) => {
    const r = await dialog.showSaveDialog(win, {
      title: '导出 HTML',
      defaultPath: suggestedName || '导出.html',
      filters: [{ name: 'HTML', extensions: ['html'] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    await fsp.writeFile(r.filePath, html, 'utf8');
    return { ok: true, path: r.filePath };
  });

  // R87：导出 Word（.docx / .doc）——真实 OOXML 容器（含可编辑公式/标题样式/删除线/任务列表/表格）
  handler('export:doc', async ({ parts, suggestedName }, win) => {
    const r = await dialog.showSaveDialog(win, {
      title: '导出 Word 文档',
      defaultPath: suggestedName || '导出.docx',
      filters: [
        { name: 'Word 文档 (*.docx)', extensions: ['docx'] },
        { name: 'Word 97-2003 文档 (*.doc)', extensions: ['doc'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    try {
      const entries = (parts || []).map(p => ({ name: p.name, buf: Buffer.from(p.b64 || '', 'base64') }));
      if (!entries.length) return { error: '无内容可导出' };
      const zip = makeZip(entries);
      await fsp.writeFile(r.filePath, zip);
      return { ok: true, path: r.filePath, bytes: zip.length };
    } catch (err) {
      return { error: String(err.message || err) };
    }
  });

  handler('print:doc', async ({ html }) => {
    const w = await renderHidden(html);
    try {
      w.webContents.print({ silent: false, printBackground: true }, () => w.destroy());
      return { ok: true };
    } catch (err) {
      w.destroy();
      return { error: String(err.message || err) };
    }
  });

  handler('msg:confirm', async ({ message, detail, buttons }, win) => {
    const r = await dialog.showMessageBox(win, {
      type: 'question', message, detail: detail || '', buttons: buttons || ['确定', '取消'], noLink: true, cancelId: (buttons || ['确定', '取消']).length - 1
    });
    return r.response;
  });

  // R72：拖入文件「新窗口打开」——新窗口目录 = 首个文件所在目录，其余文件一并打开
  // R73：标签拖出拆新窗口也走这里（x/y=源窗口右下方偏移）；返回窗口 id 供
  // 渲染层在「拖回原窗口/落到另一窗口」时关掉这个预览窗口
  handler('window:new', ({ path: p, folder: f, files: extra, x, y }) => {
    const win = createWindow(p || null, {
      folder: f || undefined,
      x,
      y,
      extraFiles: Array.isArray(extra) ? extra.filter((x2) => typeof x2 === 'string' && x2) : undefined
    });
    return { id: win.id };
  });

  // R73：渲染层主动查询本窗口 id（标签跨窗口拖拽的源窗口 id）
  handler('win:self-id', (p, win) => (win && !win.isDestroyed()) ? win.id : null);

  // R73：关掉「标签拖出」产生的预览窗口——仅当无未保存改动（__dirty 由渲染层
  // doc:state 上报，含任一脏标签）；脏时保留窗口，绝不留丢数据的口子
  handler('win:close-by-id', ({ id }) => {
    let w = null;
    for (const x of wins) { if (x.id === id && !x.isDestroyed()) { w = x; break; } }
    if (!w) return false;
    if (w.__dirty) return { skipped: 'dirty' };
    w.__closing = true;
    try { w.destroy(); } catch (e) { }
    return true;
  });

  // R73：跨窗口拖标签——目标窗口已在本窗口打开该文件，转告源窗口（按 id 找）移除
  handler('win:tab-moved', ({ path: p, from }) => {
    for (const w of wins) {
      if (w.id === from && !w.isDestroyed()) {
        try { w.webContents.send('win:remote-tab-moved', { path: p }); } catch (e) { }
        return true;
      }
    }
    return false;
  });

  // R75-5：拖拽「未保存标签」开新窗口——内容暂存于 pendingUnsaved，新窗口按 token 取走
  handler('win:open-unsaved', ({ name, path: p, content, x, y }) => {
    const token = 'u' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
    pendingUnsaved.set(token, { name: name || '未命名', path: p || null, content: content || '' });
    setTimeout(() => pendingUnsaved.delete(token), 5 * 60 * 1000); // 兜底清理
    const win = createWindow(null, { x, y, unsavedToken: token });
    return { id: win.id };
  });
  // R75-5：新窗口渲染层按 token 取走暂存的未保存内容（取后即删，防串窗）
  handler('win:take-unsaved', ({ token }) => {
    const p = pendingUnsaved.get(token);
    pendingUnsaved.delete(token);
    return p || null;
  });
  // R75-6：未保存标签被拖到另一窗口打开 → 转告源窗口（按 id 找）移除该标签
  handler('win:remote-unsaved-moved', ({ tabId, from }) => {
    for (const w of wins) {
      if (w.id === from && !w.isDestroyed()) {
        try { w.webContents.send('win:remote-unsaved-moved', { tabId }); } catch (e) { }
        return true;
      }
    }
    return false;
  });
}

function guessMime(p) {
  const ext = path.extname(p).toLowerCase();
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp' })[ext] || 'image/png';
}

// ---------------------------------------------------------------- 系统托盘（R53-8）
// Windows 任务栏通知区常驻应用图标；右键菜单：打开 MarkStudio / 最近打开 / 新建文件 / 退出。
// 全部窗口关闭后不再退出（Windows 下驻留托盘，仅托盘「退出 MarkStudio」退出）；
// 冒烟模式（MARKSTUDIO_SMOKE）保持原行为——最后一个窗口关闭即退出，冒烟脚本才能结束
// 动态托盘菜单的正确姿势（dist20 用户报障修复）：Electron 31 的 Menu 实例没有
// removeAll，clear() 实测是 no-op——托盘原生子菜单是 setContextMenu 时的快照，
// 事后再往旧 Menu 实例里增删都不会反映到显示出的菜单。所以「最近打开」变化时
// 整体重建菜单并重新 setContextMenu（初始建托盘 + pushRecent/重命名/清空时各重建一次）
let tray = null;
function trayOpenApp() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  else createWindow(null);
}
function trayNewFile() {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    try { win.webContents.send('tray:new-file'); } catch (e) { }
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
  } else createWindow(null, { trayNewFile: true });
}
function trayOpenPath(p) {
  const w = BrowserWindow.getAllWindows()[0];
  // R69：窗口可能藏在托盘（hide）——先 show 再打开文件，否则文件开了窗口却看不见
  if (w) { w.show(); w.focus(); openPathIn(w, p); } else createWindow(p);
}
function trayRebuildRecent() {
  if (!tray) return;
  const recent = (loadStore().recent || []).slice(0, 5);
  const sub = recent.length
    ? recent.map((p) => ({ label: path.basename(p), title: p, click: () => trayOpenPath(p) }))
    : [{ label: '（无最近文件）', enabled: false }];
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 MarkStudio', click: trayOpenApp },
    { label: '最近打开', submenu: sub },
    { label: '新建文件', click: trayNewFile },
    { type: 'separator' },
    { label: '退出 MarkStudio', click: () => app.quit() }
  ]));
}
function createTray() {
  if (tray) return;
  // 用 32px 位图：Win11 托盘 1x 取 16px、2x 取 32px，比直接丢 256px 源图清晰
  const img = nativeImage.createFromPath(path.join(app.getAppPath(), 'resources', 'icon.png'));
  const t = new Tray(img.isEmpty() ? img : img.resize({ width: 32, height: 32 }));
  tray = t;
  t.setToolTip('MarkStudio');
  trayRebuildRecent();
  // Windows 托盘左键单击=打开（与右键菜单并存）
  t.on('click', trayOpenApp);
}
app.on('will-quit', () => { trayIconVisible = false; if (tray) { tray.destroy(); tray = null; } });
// R74：托盘图标在应用运行期间常驻（覆盖 R71 的「窗口可见时隐藏」互斥）：
// 用户澄清——任务栏的窗口按钮是「活动图标」（一个窗口一个），最右侧托盘图标
// 只要软件打开就必须一直在（右键菜单：最近打开 / 新建文件 / 退出 MarkStudio）。
// 退出应用时由 will-quit 销毁托盘。
// 注意：Electron 31 的 Tray 没有 show()/hide() API，显隐只能 destroy/重建
let trayIconVisible = false;
function showTrayIcon() {
  if (trayIconVisible || appQuitting || process.platform !== 'win32') return;
  // R76-2：测试/调试实例（MARKSTUDIO_NO_TRAY）不建托盘——它们用独立 userData 会绕过
  // 单实例锁与正式实例并存，各建一个托盘图标，用户在系统托盘里就会看到两个 MarkStudio。
  // 正式发行版不设该环境变量，托盘行为不变。
  if (process.env.MARKSTUDIO_NO_TRAY) return;
  createTray();
  trayIconVisible = true;
}
function hideTrayIcon() {
  if (!trayIconVisible) return;
  trayIconVisible = false;
  try { if (tray) { tray.destroy(); tray = null; } } catch (e) { }
}
function syncTrayVisibility() {
  showTrayIcon(); // R74：常驻——窗口 show/hide 只确保托盘存在，不再按可见性隐藏
}

// ---------------------------------------------------------------- 启动
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    // R40：拖拽多个文件到运行中的程序 → 逐个打开（渲染层 openPath 自带去重/激活）
    const files = filesFromArgv(argv);
    const win = BrowserWindow.getAllWindows()[0];
    if (files.length && win) { win.show(); win.focus(); files.forEach((f) => openPathIn(win, f)); }
    else if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } // R69：托盘隐藏窗口也要 show
    else createWindow(files[0] || null, { extraFiles: files.slice(1) });
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = getSettings().theme === 'dark' ? 'dark' : 'light';
    aumidSupportedCheck(); // R73-1：探测系统是否支持窗口级 AUMID（无则后续不再尝试）
    registerIpc();
    rebuildMenus();
    if (process.platform === 'win32') { createTray(); trayIconVisible = true; } // R53-8：Windows 任务栏托盘图标（R74 起运行期间常驻）
    const files = filesFromArgv(process.argv);
    const smoke = !!process.env.MARKSTUDIO_SMOKE;
    createWindow(files[0] || null, { smoke, maximized: !!process.env.MARKSTUDIO_MAX, debug: !!process.env.MARKSTUDIO_DEBUG, extraFiles: files.slice(1) });
  });

  app.on('window-all-closed', () => {
    // R53-8：Windows 下全部窗口关闭后驻留托盘（托盘图标常驻，右键「退出 MarkStudio」才退出）；
    // macOS 遵循平台惯例驻留 Dock（点 Dock 图标重建窗口，Cmd+Q 或菜单退出）；
    // 冒烟模式与 Linux 保持「最后一个窗口关闭即退出」。
    // R61：app.quit() 的完成依赖 window-all-closed 的默认退出行为——被这里的驻留逻辑
    // 吞掉后「退出」永远退不出（窗口已关、进程常驻、托盘点击无窗口可恢复）。
    // 正式退出（before-quit 已置 appQuitting：托盘「退出」/closeAction=quit/系统关机）时放行
    if (process.env.MARKSTUDIO_SMOKE) { app.quit(); return; }
    if ((process.platform === 'win32' || process.platform === 'darwin') && !appQuitting) return;
    app.quit();
  });

  // macOS：Dock 图标点击且无窗口时重建窗口
  app.on('activate', () => {
    if (process.platform === 'darwin' && BrowserWindow.getAllWindows().length === 0) createWindow(null);
  });
  // macOS 系统「打开方式」文件关联事件（Linux/Windows 走 argv，见 filesFromArgv）
  app.on('open-file', (e, p) => {
    e.preventDefault();
    openPathIn(BrowserWindow.getAllWindows()[0] || null, p);
  });
}
