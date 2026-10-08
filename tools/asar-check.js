// t193: 验证 dist20 asar 内含 R50+R51+R52+R53 全部代码（构建后一次性运行）
const asar = require('@electron/asar');
const root = process.argv[2] || 'dist20/win-unpacked/resources/app.asar';
const raw = asar.listPackage(root);
const list = raw.map(x => x.replace(/\\/g, '/'));
const find = (re) => raw[list.findIndex(x => re.test(x))].replace(/^\\/, '');
const txt = (re) => asar.extractFile(root, find(re)).toString('utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } };

const s = txt(/renderer\/renderer\.js$/);
console.log('renderer.js bytes:', s.length);
const dx = txt(/docx-gen\.js$/);
// R50 表格
check('R50 applyEdgeColAbsorb（边缘拖=首末列吸收）', s.includes('applyEdgeColAbsorb'));
check('R50 syncHandlePositions', s.includes('function syncHandlePositions'));
check('R50-A pinTableCols', s.includes('function pinTableCols'));
check('R50-A pinTableAtCaret（selectionchange 钉死）', s.includes('pinTableAtCaret') && s.includes("document.addEventListener('selectionchange', pinTableAtCaret)"));
check('R50-A 防重钉守卫（saved.cols.length === n）', s.includes('saved.cols.length === n'));
check('R50 retabCols（列操作同步列宽记录）', s.includes('function retabCols') && s.includes('L0.cols = retabCols'));
check('R50 行/列移动工具条接线（moveRow/moveCol）', s.includes("type: 'moveRow'") && s.includes("type: 'moveCol'"));
check('R50 操作后槽重建（buildGutters(op.table)）', s.includes('if (TBL.sel) buildGutters(op.table)'));
// R53
check('R53-5 mbCancelSubTimers（三级子菜单）', s.includes('function mbCancelSubTimers'));
check('R53-7 confirmUnsaved（未保存弹窗）', s.includes('function confirmUnsaved'));
check('R53-8 tray:new-file 监听', s.includes("ms.on('tray:new-file'"));
check('R53-8 启动参数 newfile', s.includes("params.get('newfile')"));
check('R53-9 stats Worker', s.includes('stats-worker.js') && s.includes('getStatsWorker'));
// R52
check('R52 状态栏未保存判定（!tab.path）', s.includes('!tab.path || state.dirty'));
check('R52 行：列 占位', s.includes("'行：列'"));
check('R52 标签卡「尚未保存到磁盘」', s.includes('尚未保存到磁盘'));
check('R52 欢迎页显示判定 isWelcomeVisible', s.includes('function isWelcomeVisible'));
// 旧代码必须消失
check('旧 focusin 钉死已移除', !s.includes("reset.addEventListener('focusin'"));
check('旧 #ctx-table 段引用已移除', !/#ctx-table(?![\w-])/.test(s)); // R61：新分隔符 #ctx-table-sep 带连字符，不被负向前瞻误伤
check('旧 刷新按钮绑定已移除', !s.includes('btn-refresh-tree'));
// R54 双扩展名修复（dist22）：悬停卡片失焦不得静默改名 + 保存默认名幂等补 .md
check('R54 mdSuggestName（保存默认名幂等）', s.includes('function mdSuggestName') && (s.match(/mdSuggestName\(/g) || []).length >= 4);
check('R54 卡片无改动提交直接返回（no-op 守卫）', /文件名不能为空[\s\S]{0,260}?if \(name === tab\.name\) return;/.test(s));
check('R54 旧 name+\' .md\' 直接拼接已移除', !s.includes("tab.name + '.md'") && !s.includes("t.name + '.md'") && !s.includes("tab ? tab.name : '未命名') + '.md'"));
// R55 图标配色（与欢迎页渐变一致）：asar 内图标必须等于磁盘新生成版
const crypto = require('crypto');
const path2 = require('path');
const fs2 = require('fs');
const iconMd5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');
const iconDisk = fs2.readFileSync(path2.join(__dirname, '..', 'resources', 'icon.png'));
check('R55 asar icon.png = 欢迎页配色版（MD5 一致）', iconMd5(asar.extractFile(root, find(/resources\/icon\.png$/))) === iconMd5(iconDisk));
check('R55 asar icon.ico 已更新（含多尺寸 >10KB）', asar.extractFile(root, find(/resources\/icon\.ico$/)).length > 10000);
// R56 行拖拽/对齐修复（dist23）：手柄按 data-row 定位 + 行高钳制到自然高度 + 左对齐显式写 th
check('R56 行手柄 data-row 绑定', s.includes('h.dataset.row = String(r - 1)') && s.includes('h.dataset.row = String(rows.length - 1)'));
check('R56 syncHandlePositions 按 data-row 定位（不再按 DOM 序）', s.includes('rowTops[k + 1]') && !s.includes('if (rres[r]) rres[r].style.top'));
check('R56 行高钳制到自然高度（旧 24px 钳制已移除）', s.includes('const naturalH = Math.ceil(tr.getBoundingClientRect().height)') && !s.includes('Math.max(24, startH + dy)'));
check('R56 左对齐显式写 align（旧删属性已移除）', !s.includes("if (align === 'left') cell.removeAttribute('align')"));

const ih = txt(/renderer\/index\.html$/);
check('html: #st-pos 默认「行：列」', /id="st-pos"[^>]*>\s*行：列\s*</.test(ih));
check('html: 无 #btn-refresh-tree', !ih.includes('btn-refresh-tree'));
check('html: 右键菜单通用项（translate 项）', ih.includes('data-ctx="translate"') && !/data-ctx="row-/.test(ih) && !/data-ctx="col-/.test(ih));
check('html: R61 右键表格对齐/清空项存在（默认 hidden）', ih.includes('data-ctx="align-left"') && ih.includes('data-ctx="align-center"') && ih.includes('data-ctx="align-right"') && ih.includes('data-ctx="clear-cells"') && ih.includes('id="ctx-table-sep"'));
check('html: #unsaved-x 红点关闭钮（12x12 交叉线）', /id="unsaved-x"[\s\S]{0,400}?viewBox="0 0 12 12"/.test(ih));

const sc = txt(/renderer\/style\.css$/);
// R53-2 图标尺寸（flex 子项 svg 塌缩修复）
check('css: .ms-ttools button svg 显式尺寸', /\.ms-ttools button svg\s*{[^}]*width:\s*14px/.test(sc));
// R53-6 设置标签纯黑
check('css: .form-row label 用 --text（非 dim）', /\.form-row label\s*{[^}]*color:\s*var\(--text\)/.test(sc));
// R53-7 未保存弹窗红点
check('css: .unsaved-x 红点 #ff5f57', sc.includes('#ff5f57') && sc.includes('.unsaved-x'));
check('css: 无 #btn-refresh-tree 规则', !sc.includes('#btn-refresh-tree'));
// R51 文本清晰（玻璃走伪层/变量）
check('css: R51 玻璃变量 + backdrop-filter 保留', sc.includes('--glass-blur') && sc.includes('backdrop-filter'));

const mj = txt(/main\/main\.js$/);
check('main: createTray + 托盘菜单', mj.includes('function createTray') && mj.includes('打开 MarkStudio') && mj.includes('退出 MarkStudio'));
check('main: 最近打开子菜单（整体重建+setContextMenu，无 removeAll/menu-will-show）', mj.includes('tray.setContextMenu(Menu.buildFromTemplate') && !mj.includes('.removeAll()') && !mj.includes('menu-will-show') && (mj.match(/trayRebuildRecent\(\);/g) || []).length >= 4);
check('main: 关窗后常驻（MARKSTUDIO_SMOKE 分支）', mj.includes('MARKSTUDIO_SMOKE'));
check('main: newfile 启动参数', mj.includes("query.newfile = '1'"));

const pj = txt(/main\/preload\.js$/);
check('preload: tray:new-file 通道', pj.includes("'tray:new-file'"));
check('preload: app:close-intent 通道', pj.includes("'app:close-intent'"));

const listHasWorker = list.some(x => /stats-worker\.js$/.test(x));
check('asar: stats-worker.js 已打包', listHasWorker);

// R57 表格 DOM 手术 + md 基线（dist24）
check('R57 applyTableOpDom（单表手术替换）', s.includes('function applyTableOpDom') && s.includes('oldTable.replaceWith(newTable)'));
check('R57 editorMdBaseline（干净时复用 tab.content）', s.includes('function editorMdBaseline') && s.includes('state.editorDomDirty'));
check('R57 input 置脏（DOM 领先检测）', s.includes("root.addEventListener('input', () => { state.editorDomDirty = true; })"));
// R58 关闭行为设置（dist24）
check('R58 closeAction 默认 ask + 三值校验', mj.includes("closeAction: 'ask'") && mj.includes("['ask', 'minimize', 'quit']"));
check('R58 requestCloseDecision（minimize/quit/弹框三路径，R62 起为 async）', mj.includes('const requestCloseDecision = async () =>') && mj.includes('win.__closeDecision = requestCloseDecision'));
check('R58 未保存先走应用内弹窗再执行关闭决定', mj.includes("win.webContents.send('app:close-intent')") && mj.includes('app:close-done'));
check('R61 关闭流程修复：无真实 app.isQuitting() 调用（Electron 无此 API，原调用抛 TypeError；注释中的字面量不算）', !mj.split('\n').some((l) => { const t = l.trim(); return t && !t.startsWith('//') && l.includes('app.isQuitting()'); }) && mj.includes('let appQuitting = false') && mj.includes("app.on('before-quit', () => { appQuitting = true; })"));
check('R61 驻留不吞正式退出（window-all-closed 放行 appQuitting；跨平台：win32+darwin 驻留，linux/冒烟退出）', /'win32' \|\| process\.platform === 'darwin'\) && !appQuitting\) return;/.test(mj));
// R59 快捷键冲突修复（vendor 热键移除 + 应用统一处理）
const v = txt(/vditor\/dist\/index\.js$/);
check('R59 vendor 热键 ⌘B/⌘I/⌘Z 已移除（⌘Y 保留）', v.includes('MarkStudio R59') && !v.includes('hotkey: "⌘B"') && !v.includes('hotkey: "⌘I"') && !v.includes('hotkey: "⌘Z"') && v.includes('hotkey: "⌘Y"'));
check('R59 应用层 undo/redo 置脏 + 布局重放', s.includes('__msUndoDirtyMarked') && s.includes('const _undo = u.undo.bind(u)'));
// R60 僵尸工具条/扶正选框修复（覆盖层剥离 + 孤儿清扫 + 天生已钉）
check('R60 vendor addCaret 剥离覆盖层', v.includes('MarkStudio R60') && v.includes('.ms-ttools,.ms-tsel,.ms-cre,.ms-rre,.ms-grow,.ms-gcol'));
check('R60 vendor renderDiff getRangeAt 守卫（焦点外选区为空不再抛错）', v.includes('var msSel = getSelection()') && v.includes('if (msSel.rangeCount > 0)'));
check('R60 cleanIrHtml（irHTML 缓存剥离覆盖层）', s.includes('function cleanIrHtml(pre)') && s.includes('cleanIrHtml(state.vditor.vditor.ir.element)'));
check('R60 sweepTableOrphans 五处清扫触点', (s.match(/sweepTableOrphans\(\);/g) || []).length >= 5 && s.includes('function sweepTableOrphans'));
check('R60 加载/undo/操作后主动钉列（天生已钉）', s.includes('reapplyTableLayout(true)') && s.includes('[150, 400, 1000, 2500].forEach'));
// R61 拖拽路径多选 + 右键单独对齐 + 列槽同距（dist24）
check('R61 路径多选精确集合（selIsFullRect/selBBox/ms-drag-sel）', s.includes('function selIsFullRect') && s.includes('function selBBox') && sc.includes('.ms-drag-sel'));
check('R61 拖拽累积不删（drag.cells.set 只加）', s.includes('drag.cells.set(p2.r * 100 + p2.c') && !s.includes('TBL.dragging = true;'));
check('R61 clearCells 视觉行→md 行映射（分隔行不再被误清）', s.includes('op.cells.map(p => mRow(p.r) * 100 + p.c)') && !s.includes('op.cells.map(p => p.r * 100 + p.c)'));
check('R61 非矩形选区删/移行列守卫', s.includes('needRect') && s.includes('请先选择矩形区域再删除行'));
check('R61 右键单独对齐走精确集合', s.includes('applyCellAlign(act.slice(6), null') && s.includes('cells.forEach(p => setAttr(rows[p.r]'));
check('R85-P2 行/列槽改「内容坐标」定位(=表格视口位置+scrollTop/scrollLeft，随内容滚动贴住表格；列槽仍贴表顶、行槽贴表左 8px)', s.includes('const tableTopContent = (tr.top - rr.top) + reset.scrollTop;') && s.includes('const tableLeftContent = (tr.left - rr.left) + reset.scrollLeft;') && s.includes("gutRow.style.top = Math.max(0, tableTopContent) + 'px';") && s.includes("gutCol.style.top = Math.max(0, tableTopContent) + 'px';") && s.includes("gutRow.style.left = Math.max(0, tableLeftContent - 8) + 'px';"));
check('R85-P1 工具条改「内容坐标」定位(=表格视口位置+scrollTop/scrollLeft)贴表格上方 2px——修文档中部表格(深 scrollTop)工具条漂到视口外~740px「还是太远」根因；上方放不下钳到内容顶端 top=0', s.includes('let top = tableTopContent - 2 - ttH;') && s.includes('if (top < 0) top = 0;') && s.includes('let left = tableLeftContent - 3;') && !s.includes('let top = tableTopRel - 2 - ttH;'));
check('R83-P4 跨窗拖走最后一个标签 → 本窗口强制关闭（removeTabById 空则 win:close-by-id 自关；saved-file 跨窗走 removeTabById 而非 closeTab）', s.includes("ms.invoke('win:close-by-id', { id: state.winId })") && s.includes('if (tab && !tab.dirty) removeTabById(tab.id);'));
check('R84-P2 行/列选择槽「清晰可见」(.show 淡蓝填充 .18 + 醒目握把；列槽 z-index 45 近顶表格工具条钳顶端时仍可点选整列)', sc.includes('.ms-grow.show, .ms-gcol.show { opacity: 1; pointer-events: auto; background: rgba(10, 132, 255, .18); }') && sc.includes('.ms-gcol.show::after { width: 28px; height: 4px; }') && sc.includes('.ms-gcol { height: 8px; z-index: 45; }'));

// R62 应用内关闭确认/关于弹窗（iOS 毛玻璃，替代系统原生对话框）（dist25）
const pl = txt(/main\/preload\.js$/);
check('R62 应用内关闭确认弹窗（confirmClose + app:close-ask 往返）', s.includes('function confirmClose') && s.includes("ms.on('app:close-ask'") && s.includes('app:close-ask-done'));
check('R62 主进程 ask 路径改 IPC（promise + 5s 兜底 + 重入守卫）', mj.includes("win.webContents.send('app:close-ask')") && mj.includes('app:close-ask-done') && mj.includes('__askingClose') && mj.includes("setTimeout(() => {"));
check('R62 旧原生关闭询问弹框已移除', !mj.includes('退出软件') && !mj.includes('省去每次询问'));
check('R62 应用内关于弹窗（showAbout/hideAbout + app:info 版本）', s.includes('function showAbout') && s.includes('function hideAbout') && s.includes("{ label: '关于 MarkStudio', act: () => showAbout() }") && s.includes('app:info'));
check('R62 html 双弹窗 + 红点关闭钮 + 关于 logo', ih.includes('id="close-modal"') && ih.includes('id="about-modal"') && ih.includes('id="close-x"') && ih.includes('id="about-x"') && ih.includes('about-logo'));
check('R62 css 场景样式（about-logo / 关闭蓝图标）', sc.includes('.about-logo') && sc.includes('#close-modal .unsaved-icon'));
check('R62 preload 通道白名单（app:close-ask / app:close-ask-done）', pl.includes("'app:close-ask-done'") && pl.includes("'app:close-ask'"));
// R63 选区描边跟随 / 右键对齐误报 / 关闭兜底超时（dist26）
check('R63a updateSelBox 轻量重定位 + 四处拖拽钩子', s.includes('function updateSelBox') && (s.match(/updateSelBox\(table\);/g) || []).length === 4);
check('R63b 清除选区的 capture mousedown 豁免 #ctxmenu', s.includes(".ms-gcol, #ctxmenu") && s.includes('}, true);'));
check('R63c 渲染层同步收起失效弹窗（closeAskFinish + app:close-ask-timeout）', s.includes('closeAskFinish = finish') && s.includes("ms.on('app:close-ask-timeout'"));
check('R63c 主进程兜底超时 30s（5s 竞态修复）+ 超时通知渲染层', mj.includes('}, 30000);') && mj.includes("win.webContents.send('app:close-ask-timeout')"));
check('R63c preload 放行 app:close-ask-timeout', pl.includes("'app:close-ask-timeout'"));
// R64 关闭弹窗「最小化」文案 + 记住我的选择（dist26）
check('R64 关闭弹窗按钮文案「最小化」（设置面板下拉框的「最小化到任务栏」属另一 UI，保留）', ih.includes('id="close-min">最小化</button>') && !ih.includes('id="close-min">最小化到任务栏'));
check('R64 记住我的选择 勾选框（html）', ih.includes('id="close-remember"') && ih.includes('记住我的选择'));
check('R64 勾选+最小化/退出 持久化 closeAction（取消不持久化）', s.includes("el('#close-remember')") && s.includes('closeAction: r') && s.includes("if (r === 'minimize' || r === 'quit')"));
check('R64 每次弹窗重置勾选（不残留上次勾选）', s.includes("if (cb0) cb0.checked = false"));
check('R64 记住行样式（css）', sc.includes('.close-remember'));
// R65 多选单元格体验：文字不跳动 + 拖拽期手柄零反应（dist27）
check('R65b ms-celdrag 生命周期（加类 1 处 + 移除 2 处：onUp/兜底）', s.includes("table.classList.add('ms-celdrag')") && s.includes("table.classList.remove('ms-celdrag'); // R65b：拖拽结束，手柄恢复响应") && s.includes("t.classList.remove('ms-celdrag'); // R65b：兜底清理拖拽期的手柄禁反应类"));
check('R65b 拖拽期 mouseover 悬停处理短路', s.includes("if (TBL.dragging) return; // R65b：单元格拖拽进行中不做悬停处理"));
check('R65b 拖拽期手柄 pointer-events:none（css，含列/行两类手柄）', sc.includes('table.ms-celdrag .ms-cre, .vditor-ir table.ms-celdrag .ms-rre') && sc.includes('pointer-events: none;'));
check('R65a 表内 ::selection 与单元格选中同色（css）', sc.includes('.vditor-ir td::selection, .vditor-ir th::selection') && sc.includes('background: rgba(10, 132, 255, .14);\n  color: inherit;'));
check('R65a 拖拽 active 期原生选区同步清除（capture selectionchange 守卫）', s.includes('document.addEventListener(\'selectionchange\', () => {\n    const drag = TBL.dragging;\n    if (!drag || !drag.active) return;') && s.includes('if (s && s.rangeCount > 0 && !s.getRangeAt(0).collapsed) s.removeAllRanges();') && s.includes('  }, true);'));
// R66 行对齐不动标题行 + Ctrl+点选多选（dist28）
check('R66a 表头只在选区覆盖第 0 行时写（行选中对齐不再误改标题行）', s.includes("if (r1 <= 0) for (let c = c1; c <= c2; c++) setAttr(rows[0] && rows[0].children[c]);"));
check('R66b toggleTableSelCells（Ctrl 点选 toggle 核心：已全选则移除，否则并入）', s.includes('function toggleTableSelCells(idx, newCells)') && s.includes('const allIn = target.every(k => cur.has(k));') && s.includes('if (allIn) cur.delete(k); else cur.add(k);') && s.includes('if (!cur.size) { clearTableSelection(); return; }'));
check('R66b 单元格 Ctrl+点选分支（不进入拖选、preventDefault 不动光标）', s.includes('if (e.ctrlKey) {\n      e.preventDefault();\n      toggleTableSelCells(idx, [pos]);\n      return;\n    }'));
check('R66b 行槽/列槽 Ctrl+点选分支（整行/整列 toggle）', s.includes('if (e.ctrlKey) {\n      const cells = isRow') && s.includes('Array.from({ length: nc }, (_, c) => ({ r: a.r, c }))'));
check('R66b 清选区不再隐藏行/列槽（hover 指示器仅由 hideTableToolsIfNoSel 隐藏）', (s.match(/gutRow\.classList\.remove\('show'\)/g) || []).length === 1);
// R67 快捷键总览/自定义/实时冲突检测（dist29）
check('R67 快捷键注册表 SC_DEFS（32 项可自定义，末项=快捷键说明）', s.includes('const SC_DEFS = [') && s.includes("{ id: 'shortcuts-help', label: '快捷键说明', cat: '帮助', def: 'Ctrl+Shift+/' }"));
check('R67 系统标准键 SC_FIXED（剪贴板 4 项，只读+参与冲突）', s.includes('const SC_FIXED = [') && s.includes("{ id: 'paste', label: '粘贴', cat: '编辑', def: 'Ctrl+V', fixed: true }"));
check('R67 组合归一/解析 + 生效表 + 分发 Map + 冲突检测', s.includes('function scParseCombo(str)') && s.includes('function scCanon(str)') && s.includes('function scRebuild()') && s.includes('function scRebuildMap()') && s.includes('function scConflict(combo, exceptId)'));
check('R70 keydown→组合 归一（拒 Cmd；Shift 单独不算修饰；Shift+= /? 归基础键）', s.includes('if (e.metaKey) return null;') && s.includes('if (!e.ctrlKey && !e.altKey) return null; // Shift 单独不构成快捷键') && s.includes("if (key === '+') key = '=';") && s.includes("if (key === '?') key = '/';"));
check('R67 onGlobalKeys 表驱动分发（combo→id→runShortcut，硬编码链已移除）', s.includes('const combo = scComboFromEvent(e);') && s.includes('const id = scMap.get(combo);') && s.includes('function runShortcut(id)') && !s.includes("if (mod && !e.shiftKey && kl === 'n') { e.preventDefault(); newFile(); return; }"));
check('R67 录入监听（捕获阶段注册 + 逐键实时校验 + 忽略自动重复）', s.includes("document.addEventListener('keydown', scOnCaptureKey, true);") && s.includes('function scOnCaptureKey(e)') && s.includes('if (e.repeat) return;'));
check('R67 冲突实时提示 + 保留旧值 + toast 提醒重设', s.includes('冲突，请重新设置') && s.includes('快捷键冲突：'));
check('R67 保存落盘完整生效表（主进程对象整体替换语义下不丢旧项）', s.includes('partial.shortcuts = scAll;') && s.includes('SC_DEFS.forEach(d => { scAll[d.id] = scLive[d.id]; });'));
check('R67 取消/未保存关闭回滚（含弹窗本就关闭的守卫）', s.includes('function closeSettingsModal()') && s.includes("if (!modal.classList.contains('hidden')) {") && s.includes("el('#settings-cancel').onclick = closeSettingsModal;"));
check('R67 主进程 shortcuts 归一（缺失/写坏→{}）', mj.includes("if (!s.shortcuts || typeof s.shortcuts !== 'object' || Array.isArray(s.shortcuts)) s.shortcuts = {};"));
check('R67 设置内总览列表 + 说明弹窗动态表（html）', ih.includes('id="set-sc-list"') && ih.includes('id="shortcuts-table"'));
check('R67 菜单 accelId 动态跟随自定义（accel 文案取生效值）', s.includes('accelId: \'new-file\'') && s.includes('ac.textContent = it.accelId ? (scLive[it.accelId] || it.accel) : it.accel;'));
check('R67 快捷键行样式（css：自定义高亮/冲突徽章/录入态）', sc.includes('#set-sc-list .sc-combo.custom') && sc.includes('#set-sc-list .sc-warn') && sc.includes('.sc-row.capturing .sc-combo'));
// R68 设置分 tab + 全界面 iOS 毛玻璃 + 安装界面品牌化（dist29）
check('R68a 设置 4 tab（通用/外观/编辑/快捷键，html）', ih.includes('id="set-tabs"') && ih.includes('data-pane="pane-general"') && ih.includes('data-pane="pane-appearance"') && ih.includes('data-pane="pane-editor"') && ih.includes('data-pane="pane-shortcuts"'));
check('R68a tab 切换 + 记忆 + 录入中切页取消录入', s.includes('function setTab(paneId)') && s.includes("let setTabMem = 'pane-general'") && s.includes("if (scCaptureId && paneId !== 'pane-shortcuts') { scCaptureId = null; renderScSettings(); }") && s.includes('setTab(setTabMem);'));
check('R68a 各页滚动 + 分段控件样式（css）', sc.includes('.set-pane.active { display: block; max-height: 430px; overflow-y: auto; padding-right: 4px; }') && sc.includes('.set-tabs'));
check('R68b 工作区整片毛玻璃（::before 玻璃底 + 顶缘发丝线）', sc.includes('#workspace::before') && sc.includes('border-top: 1px solid var(--glass-border);'));
check('R68b 编辑器/源码透明化（透出工作区玻璃）', sc.includes('#editor.vditor { border: none; height: 100%; background: transparent; }') && sc.includes('#editor .vditor-ir { background: transparent; }'));
check('R68b body 壁纸渐变增强（浅/深两主题加光斑）', sc.includes('radial-gradient(58% 46% at 94% 110%, rgba(94, 92, 230, .12)') && sc.includes('radial-gradient(58% 46% at 94% 110%, rgba(94, 92, 230, .18)'));
// R68c：构建配置挂 NSIS 玻璃品牌化。asar 内的 package.json 被 electron-builder 剥掉了
// "build" 段，所以改读项目根 package.json（构建输入），并用 asar 内 renderer 佐证产物一致。
const projPkg = require('fs').readFileSync(require('path').join(__dirname, '..', 'package.json'), 'utf8').replace(/\r\n/g, '\n');
check('R68c 构建配置挂 NSIS 玻璃品牌化（项目 package.json：include + 欢迎/卸载页背景图）', projPkg.includes('"include": "build/installer.nsh"') && projPkg.includes('"installerSidebar": "build/installer-bg.bmp"') && projPkg.includes('"uninstallerSidebar": "build/installer-bg.bmp"'));
// R69 关闭最小化 = 隐藏窗口只留托盘（dist29）
check('R69 关闭/弹窗选最小化 → win.hide()（任务栏按钮消失）', mj.includes("if (action === 'minimize') { win.hide(); return; }") && mj.includes("else if (choice === 'minimize') win.hide();"));
check('R69 second-instance 恢复隐藏窗口（补 show）', mj.includes('else if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }'));
check('R69 托盘「最近打开」先 show 再开文件', mj.includes('if (w) { w.show(); w.focus(); openPathIn(w, p); } else createWindow(p);'));
check('R69 文案更新（设置=最小化到系统托盘；弹窗=点托盘图标恢复）', ih.includes('最小化到系统托盘（保持运行）') && ih.includes('点任务栏最右侧的系统托盘图标即可恢复') && !ih.includes('最小化到任务栏（保持运行）'));
// R70 快捷键体验精修：Alt 放行 + 冲突全文提示 + 单滚动条 + 分类凸显 + 说明弹窗（dist30）
check('R70-1 解析放行 Alt（Ctrl 或 Alt 必需，Shift 可叠加，F 键单独）', s.includes('if (!ctrl && !alt) return null; // 必须含 Ctrl 或 Alt') && s.includes('if (n < 1 || n > 12 || mods.length) return null; // 功能键单独使用'));
check('R70-1 归一输出 Ctrl/Alt/Shift 顺序 + 事件组合含 Alt', s.includes("(p.alt ? (p.ctrl ? '+' : '') + 'Alt' : '')") && s.includes("(e.ctrlKey ? 'Ctrl' : '') + (e.altKey ? (e.ctrlKey ? '+' : '') + 'Alt' : '')"));
check('R70-1 菜单加速键（Alt+字母）保留为冲突项', s.includes("if (m.key && combo === 'Alt+' + m.key) return { label: m.label + '菜单加速键', def: 'Alt+' + m.key, fixed: true };"));
check('R70-1 onGlobalKeys 自定义 Alt 组合优先于菜单加速键', s.includes('const cAlt = scComboFromEvent(e);') && s.includes('const idAlt = scMap.get(cAlt);'));
check('R70-1 无效组合新文案（需包含 Ctrl 或 Alt）', s.includes('需包含 Ctrl 或 Alt（可叠加 Shift；或单独的功能键 F1–F12），请重新按'));
check('R70-6 标题栏区域顶光晕还原为 R68 前强度（用户：标题栏背景颜色又被修改）', sc.includes('radial-gradient(120% 55% at 50% -12%, rgba(10, 132, 255, .08) 0%, rgba(94, 92, 230, .045) 42%, rgba(10, 132, 255, 0) 72%)') && sc.includes('radial-gradient(120% 55% at 50% -12%, rgba(10, 132, 255, .13) 0%, rgba(94, 92, 230, .08) 45%, rgba(10, 132, 255, 0) 75%)') && !sc.includes('rgba(10, 132, 255, .15) 0%') && !sc.includes('rgba(10, 132, 255, .22) 0%'));
check('R70-7 冲突/无效 = 红色感叹号徽章 + 悬浮全文（fixed 提示，移走消失）', s.includes('warn.className = \'sc-warn\'') && s.includes('warn.setAttribute(\'data-tip\', text)') && s.includes('function scTipShow(anchor, text)') && s.includes('function scTipHide()') && sc.includes('#set-sc-list .sc-warn {') && sc.includes('#sc-tip {') && !s.includes('msg.title = text'));
check('R70-3 快捷键页只留列表内滚动（去页面级滚动条）', sc.includes('.set-pane#pane-shortcuts.active { max-height: none; overflow: visible; padding-right: 0; }'));
check('R70-4 设置内分类标题凸显（主题色+圆角浅底）', sc.includes('#set-sc-list .sc-cat {') && sc.includes('background: rgba(10, 132, 255, .08);') && sc.includes('#set-sc-list .sc-cat:first-child { margin-top: 2px; }'));
check('R70-5 说明弹窗：内容区滚动 + 关闭按钮常驻（html sc-scroll）', ih.includes('class="sc-scroll"') && sc.includes('.modal-card.shortcuts { display: flex; flex-direction: column; max-height: min(88vh, 640px); }') && sc.includes('.modal-card.shortcuts .sc-scroll { flex: 1; min-height: 0; overflow-y: auto;'));
check('R70-5 说明弹窗分类行改圆角浅色底（不再是白矩形）', sc.includes('.modal-card.shortcuts .sc-cat-row td {') && sc.includes('border-radius: 7px; padding: 5px 10px; letter-spacing: .5px;') && !sc.includes('background: var(--bg-soft); padding: 6px 8px;'));
check('R70 设置页提示文案更新（R73：说明段整体移除，不再显示「新快捷键需包含…」）', !ih.includes('新快捷键需包含 Ctrl 或 Alt（可叠加 Shift；或单独的功能键 F1–F12），与现有快捷键、菜单加速键（Alt+字母）冲突时会即时提示'));
// R48/R49 既有能力不回退
check('R48 行距保底 max(var(--lh, 1.75), 2)（css）', sc.includes('max(var(--lh, 1.75), 2)'));
check('R49 边缘手柄（edge-l/edge-r）', s.includes('ms-cre-edge-l') && s.includes('ms-cre-edge-r'));
check('R49 对齐图标按钮', s.includes('所有单元格文字左对齐'));
check('R48 换行按钮已移除（不回退）', !s.includes('data-tt="wrap"'));
check('R48 gutterShiftBelowTable', s.includes('gutterShiftBelowTable'));
check('调试钩子已清理', !s.includes('__dbg'));
// R71 任务栏单图标 + 表格行手柄贴实际边框线（dist31）
check('R71-1 托盘接线（show/hide/closed 监听 + destroy/重建显隐；R74 起常驻不再按可见性隐藏）', mj.includes('function syncTrayVisibility') && mj.includes("win.on('show', syncTrayVisibility)") && mj.includes("win.on('hide', syncTrayVisibility)") && mj.includes('showTrayIcon(); // R74：常驻') && !mj.includes('anyVisible ? hideTrayIcon() : showTrayIcon()') && mj.includes('wins.delete(win);\n    syncTrayVisibility()') && mj.includes('trayIconVisible = false;\n  try { if (tray) { tray.destroy(); tray = null; } } catch (e) { }'));
check('R71-2 行手柄按小数行 rect 定位（两处：build + sync；旧整数累加与 y-5 偏移移除）', (s.match(/const base = rows\[0\]\.getBoundingClientRect\(\)\.top/g) || []).length >= 2 && s.includes('(rows[rows.length - 1].getBoundingClientRect().bottom - base)') && !s.includes('acc += tr.offsetHeight') && !s.includes('(acc - 5)'));
// R72 拖入本地 md 文件 → 咨询（复制到当前文件夹 / 新窗口打开 / 取消）（dist32）
check('R72-1 咨询弹窗结构（html：三按钮 + 拖拽悬停遮罩）', ih.includes('id="drop-modal"') && ih.includes('id="drop-copy"') && ih.includes('id="drop-newwin"') && ih.includes('id="drop-cancel"') && ih.includes('id="drop-overlay"') && ih.includes('松开以打开 Markdown 文件'));
check('R72-2 拖拽遮罩计数显隐 + drop 走咨询（renderer）', s.includes('let dragDepth = 0;') && s.includes("indexOf('Files') !== -1") && s.includes('dragDepth++') && s.includes('const choice = await askDropFiles(textFiles);') && s.includes('await actDropFiles(choice, textFiles);'));
check('R72-3 咨询弹窗逻辑（Esc=取消 / Enter=新窗口 / 无文件夹隐藏复制钮 / 显隐收口）', s.includes('function askDropFiles(paths)') && s.includes("finish('cancel')") && s.includes("finish('newwin')") && s.includes('copyBtn.classList.add(\'hidden\');') && s.includes("copyBtn.textContent = outside.length ? '复制到当前文件夹并打开' : '在当前窗口打开';") && s.includes('mask.classList.remove(\'hidden\');'));
check('R72-4 copy=复制到当前文件夹（同名不覆盖、已在目录内直接打开）（renderer）', s.includes('async function actDropFiles(choice, paths)') && s.includes("ms.invoke('fs:copy-file', { from: p, to: target })") && s.includes('if (r && r.exists) kept++; else copied++;') && s.includes('if (inFolder(p)) { await openPath(p); opened++; continue; }'));
check('R72-5 newwin=新窗口（目录=文件所在目录、多文件一并打开）（renderer）', s.includes('const folder = paths[0].replace(/[\\\\/][^\\\\/]+$/, \'\');') && s.includes('ms.invoke(\'window:new\', { path: paths[0], folder: folder || undefined, files: paths.length > 1 ? paths.slice(1) : undefined })'));
check('R72-6 fs:copy-file 主进程 handler（同名不覆盖）+ preload 白名单', mj.includes('handler(\'fs:copy-file\', async ({ from, to }) => {') && mj.includes('目标已有同名文件时不覆盖') && mj.includes('return { exists: true };') && mj.includes('await fsp.copyFile(from, to);') && pl.includes("'fs:copy-file'"));
check('R72-7 window:new 支持 folder+files（main：createWindow query 接线；R73 起加 x/y 落点）', mj.includes('if (opts.folder) query.folder = opts.folder;') && mj.includes('handler(\'window:new\', ({ path: p, folder: f, files: extra, x, y }) => {') && mj.includes('extraFiles: Array.isArray(extra) ? extra.filter((x2) => typeof x2 === \'string\' && x2) : undefined'));
check('R72-8 弹窗与遮罩样式（css：卡宽 420 / 复制钮单行 / 遮罩 z-90 不拦截）', sc.includes('.drop-card { width: 420px; }') && sc.includes('#drop-copy { flex: 1.5; white-space: nowrap; }') && sc.includes('#drop-overlay {') && sc.includes('pointer-events: none;') && sc.includes('z-index: 90;'));
// R73 任务栏每窗口独立图标 + 标签拖出拆窗/跨窗移动 + 快捷键页文案（dist33）
check('R73-1 每窗口独立任务栏图标（main：SetWindowInfo 窗口级 AUMID，建窗+show 前各设一次；PS 用 [uint32]）', mj.includes('function applyWindowAumid(win)') && mj.includes('SetWindowInfo(IntPtr hWnd,int dwItem,uint cbItem,IntPtr pvInfo)') && mj.includes('com.markstudio.app.win') && mj.includes('[uint32]($s.Length*2+2)') && mj.split('applyWindowAumid(win)').length >= 3);
check('R73-1b AUMID 可用性探测（main：启动时探 SetWindowInfo 导出，缺失则跳过不空转）', mj.includes('let aumidSupported = null;') && mj.includes('function aumidSupportedCheck()') && mj.includes('if (aumidSupported === false) return;') && mj.includes('aumidSupportedCheck();'));
check('R73-2 窗口间 IPC（main：window:new 返回 id + win:id 下发 + 关预览(脏保留) + 跨窗转告移除）', mj.includes("win.webContents.send('win:id', win.id)") && mj.includes('return { id: win.id };') && mj.includes("handler('win:close-by-id'") && mj.includes('w.__dirty) return { skipped: \'dirty\' };') && mj.includes("handler('win:tab-moved'") && mj.includes("w.webContents.send('win:remote-tab-moved', { path: p })"));
check('R73-3 preload 白名单（invoke: win:close-by-id/win:tab-moved；on: win:id/win:remote-tab-moved）', pl.includes("'win:close-by-id', 'win:tab-moved'") && pl.includes("'win:id', 'win:remote-tab-moved'"));
check('R73-4 标签拖出（R74 松手点才开新窗 + R75 未保存标签带内容）（renderer：自定义拖拽类型 + dragend 400ms 闸 + 脏标签拦截 + 未保存走 win:open-unsaved）', s.includes('let outDrag = null;') && s.includes('application/x-markstudio-tab') && s.includes('function fireOutDragNewWin(od)') && s.includes('fireOutDragNewWin(od); }, 400)') && s.includes('ms.invoke(\'window:new\', { path: od.path, folder: dirOf(od.path) || undefined, x: nx, y: ny })') && s.includes('ms.invoke(\'win:open-unsaved\', { name: od.name, content: od.content, x: nx, y: ny })') && s.includes('该标签页有未保存的修改，无法拖到新窗口'));
check('R73-5 跨窗口移动（R74：consumed 闸 + 冗余窗兜底）（R83-P4：源窗口改走 removeTabById，最后标签拖走即自关；目标窗口打开 + 脏保留）', s.includes("ms.invoke('win:close-by-id', { id: pv })") && s.includes('movedFrom !== state.winId') && s.includes("ms.on('win:remote-tab-moved'") && s.includes('outDrag.consumed = true;') && s.includes('if (tab && !tab.dirty) removeTabById(tab.id);') && s.includes('scheduleOutDragNewWin(e); // R74：鼠标松开才决定是否开新窗口（松手不在任何 MarkStudio 窗口上时）'));
check('R73-6 设置>快捷键页说明文字移除（html 无「点按快捷键即可重新定义」+ css 规则删除）', !ih.includes('点按快捷键即可重新定义') && !sc.includes('.sc-sec-hint {'));
check('R73-7 帮助>快捷键说明条目名改正文色（css：td:first-child = var(--text)）', sc.includes('.modal-card.shortcuts td:first-child { color: var(--text); }'));
// R74 托盘常驻 + 右键菜单 + 帮助页去（系统标准）+ 拖拽松手时机（dist34）
check('R74-1 托盘运行期间常驻（main：syncTrayVisibility 恒 show，覆盖 R71 互斥）', mj.includes('function syncTrayVisibility() {') && mj.includes('showTrayIcon(); // R74：常驻——窗口 show/hide 只确保托盘存在，不再按可见性隐藏') && !mj.includes('anyVisible ? hideTrayIcon() : showTrayIcon()'));
check('R74-2 托盘右键菜单（最近打开 5 条/无最近文件占位 + 新建文件 + 退出 MarkStudio）', mj.includes("label: '最近打开', submenu: sub") && mj.includes("label: '（无最近文件）', enabled: false") && mj.includes("label: '新建文件', click: trayNewFile") && mj.includes("label: '退出 MarkStudio', click: () => app.quit()") && mj.includes("t.on('click', trayOpenApp)"));
check('R74-3 帮助>快捷键说明去「（系统标准）」后缀（固定键只显示默认组合）', s.includes("td2.textContent = d.fixed ? d.def : (scLive[d.id] || d.def);") && !s.includes("d.def + '（系统标准）'"));
check('R74-4 拖拽松手时机（renderer：dragend 400ms 闸 + outDragPreviewWin 3s 宽限关冗余窗 + 旧 200ms 预览机制移除）', s.includes('function scheduleOutDragNewWin(e)') && s.includes('setTimeout(() => { od.timer = 0; fireOutDragNewWin(od); }, 400)') && s.includes('let outDragPreviewWin = 0;') && s.includes('setTimeout(() => { if (outDragPreviewWin === r.id) outDragPreviewWin = 0; }, 3000)') && !s.includes('fireTabOutDrag') && !s.includes('restoreOutDrag'));

// R75 九项 + R76 两项（dist35）
// R75-1 大文件性能：WYSIWYG 行号刷新强制单次回流（读/写分离），字体/段落切换免重建编辑器
check('R75-1 大文件性能（refreshLines 强制单次 reflow）', s.includes('void reset.offsetHeight'));
// R75-2 文件→最近文件夹子菜单
check('R75-2 最近文件夹（main：pushRecentFolder+app:recent-folders；preload 白名单；renderer：state+子菜单）', mj.includes('function pushRecentFolder') && mj.includes("handler('app:recent-folders'") && pl.includes("'app:recent-folders'") && s.includes('state.recentFolders') && s.includes('最近文件夹'));
// R75-3 设置恢复默认（R78-1 起仅保留底部统一按钮 settings-reset-all；分区按钮移除见 R78-1）
check('R75-3 恢复默认（main：app:reset-settings；renderer：doSettingsReset(all)；html：统一按钮 settings-reset-all）', mj.includes("handler('app:reset-settings'") && pl.includes("'app:reset-settings'") && s.includes('function doSettingsReset') && s.includes("doSettingsReset('all'") && ih.includes('id="settings-reset-all"'));
// R75-4a 图片：选中工具条 + {=WxH} 尺寸（DOM style）+ 裁剪 canvas
check('R75-4a 图片操作（applyImageSize {=WxH} + resyncImageSizes style + openCropModal；html #imgbar/#modal-crop）', s.includes('function applyImageSize') && s.includes("sizeSuffix = '{='") && s.includes('function resyncImageSizes') && s.includes('function openCropModal') && ih.includes('id="imgbar"') && ih.includes('data-imgact') && ih.includes('id="modal-crop"'));
check('R75-4a-b 旧 in-paren =WxH（会退化成纯文本）已废弃', !s.includes("sizePart = ' = '"));
// R75-4b 全屏/退出全屏（单菜单项动态标签）
check('R75-4b 全屏切换（main：window:full-state；renderer：setFullState+isFullScreen+视图菜单「全屏/退出全屏」）', mj.includes("webContents.send('window:full-state'") && pl.includes("'window:full-state'") && s.includes('function setFullState') && s.includes('state.isFullScreen') && s.includes('退出全屏'));
// R75-5 未保存标签可拖动（内容随 MIME + 新窗口 win:open-unsaved/take-unsaved + 源窗 win:remote-unsaved-moved）
check('R75-5 未保存标签拖拽（MIME 带 content + win:open-unsaved/take-unsaved + remote-unsaved-moved）', s.includes('application/x-markstudio-tab') && s.includes('function removeTabById') && s.includes("ms.on('win:remote-unsaved-moved'") && mj.includes('pendingUnsaved') && mj.includes("handler('win:open-unsaved'") && mj.includes("handler('win:take-unsaved'"));
// R75-6 标题栏可作为 drop 目标（拖拽中标题栏 no-drag）
check('R75-6 标题栏 drop（body.ms-tab-dragging 时标题栏 no-drag）', s.includes('ms-tab-dragging') && sc.includes('ms-tab-dragging'));
// R75-7 提升/降低标题级别
check('R75-7 提升/降低标题级别（caretHeadingLevel + changeHeadingLevel + 编辑菜单项）', s.includes('function caretHeadingLevel') && s.includes('function changeHeadingLevel') && s.includes('提升标题级别') && s.includes('降低标题级别'));
// R75-8 查找替换：毛玻璃可移动 + 整词匹配
check('R75-8 查找替换（整词匹配 isWholeWord/collectMatches + 全字匹配 + 可移动 grip + 关闭钮）', s.includes('isWholeWord') && s.includes('function collectMatches') && s.includes('全字匹配') && ih.includes('id="findbar-grip"') && ih.includes('findbar-close'));
// R75-9 专注模式（CSS 类实现，切换免重建编辑器）
check('R75-9 专注模式（.ms-focus 类 + applyFocusMode/updateFocusHighlight，免 recreateEditor）', s.includes('function applyFocusMode') && s.includes('function updateFocusHighlight') && s.includes('state.focusApplied') && sc.includes('.ms-focus'));
// R76-1 未保存改动对话框警告图标改粗体实心（主流警告风格，替代纤细描边）
check('R76-1 未保存图标改粗体实心（新 rect 圆角+circle；旧纤细 M12 5v9 已移除）', /id="unsaved-modal"[\s\S]{0,900}?x="10.4"/.test(ih) && !ih.includes('M12 5v9'));
// R76-2 托盘隔离（测试/调试实例 MARKSTUDIO_NO_TRAY 不建托盘，避免与正式实例图标叠加）
check('R76-2 托盘隔离（main：showTrayIcon 遇 MARKSTUDIO_NO_TRAY 早返回）', mj.includes('MARKSTUDIO_NO_TRAY') && mj.includes('if (process.env.MARKSTUDIO_NO_TRAY) return;'));
// R77 拖拽 .md 到正文区遮罩卡死 + 文件打不开（dist36）
check('R77-1 拖拽遮罩看门狗（lastFileDrag + 拖拽停止 500ms 强制清遮罩 + dragover 自愈）', s.includes('let lastFileDrag = 0;') && s.includes('(Date.now() - lastFileDrag) > 500') && s.includes('lastFileDrag = Date.now(); setOverlay(true);'));
check('R77-2 捕获阶段 drop 拦截 md/txt（先于 Vditor paste；stopPropagation + askDropFiles）', s.includes(', { capture: true });') && s.includes('阻止 Vditor 的 paste()') && s.includes('const choice = await askDropFiles(textFiles);'));
// R78 设置去分区恢复默认 + 大纲选中联动 + 未保存图标放大配色（dist36）
check('R78-1 设置仅保留统一「恢复默认」（分区按钮 reset-general/appearance/editor 已移除）', ih.includes('id="settings-reset-all"') && !ih.includes('reset-general') && !ih.includes('reset-appearance') && !ih.includes('reset-editor') && s.includes("el('#settings-reset-all').onclick") && !s.includes("el('#reset-general')"));
check('R78-2 大纲选中联动（outlineIndexForSelection + applyOutlineHighlight + data-oi + .ol-row.active）', s.includes('function outlineIndexForSelection') && s.includes('function applyOutlineHighlight') && s.includes('function initOutlineSelectionSync') && s.includes('row.dataset.oi = String(node.idx)') && s.includes('state.outlineActiveIdx') && sc.includes('.ol-row.active'));
check('R78-3 未保存感叹号放大+警示橙（#unsaved-modal 56/34px + #f57c00）', sc.includes('#unsaved-modal .unsaved-icon { width: 56px; height: 56px; background: rgba(245, 124, 0, .14); color: #f57c00; }') && sc.includes('#unsaved-modal .unsaved-icon svg { width: 34px; height: 34px; }'));
// R79 大纲联动修正：选中「标题文字本身」应高亮该标题章节（修复 compareDocumentPosition 对自身返回 0 导致回落上一章）
check('R79 选中标题本身→该章节（父链向上找最近标题祖先或自身，返回 heads.indexOf 索引）', s.includes('while (node && node !== reset)') && s.includes('const k = heads.indexOf(node)') && s.includes('if (k >= 0) return k;'));
// R80-1 表格选中行/列+悬浮工具条在编辑器重建后消失：拆「全局一次」与「reset 作用域」监听，recreate 收尾重绑
check('R80-1 表格监听拆分（bindTableGlobal 全局一次 + bindTableReset 按 reset 重绑）', s.includes('function bindTableGlobal()') && s.includes('function bindTableReset()') && s.includes('let tblGlobalBound = false') && s.includes('let tblBoundReset = null') && s.includes('if (!reset || reset === tblBoundReset) return;'));
check('R80-1 recreate 收尾重绑表格交互（新 reset 不孤儿化行列槽/工具条）', s.includes('bindTableInteractions(); // R80-1'));
// R80-2 插入图片可用鼠标拖 8 个边框手柄放大缩小（尺寸回写 {=WxH}），裁剪沿用 #imgbar
check('R80-2 图片 8 向缩放手柄（showImageHandles/startImageResize/persistImageSize + 8 方向 + display 修正）', s.includes('function showImageHandles') && s.includes('function startImageResize') && s.includes('function persistImageSize') && s.includes("IMG_HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']") && s.includes("imgFrame.style.display = 'block'") && sc.includes('#ms-img-frame') && sc.includes('.ms-ih[data-dir="nw"]'));
// R80-3 段落菜单「在上方/下方插入段落」+ 编辑模式悬停段落/标题时的上下文悬浮栏
check('R80-3 插入段落核心（mdTopLevelBlocks 解析 + 行区间 + &nbsp; 行 splice + setValue）', s.includes('function mdTopLevelBlocks') && s.includes('function insertParagraph') && s.includes("['&nbsp;', '']") && s.includes("['', '&nbsp;']") && s.includes('state.vditor.setValue(newLines.join'));
check('R80-3 段落菜单新增「在上方插入段落」+「在下方插入段落」', s.includes("label: '在上方插入段落'") && s.includes("label: '在下方插入段落'") && s.includes("insertParagraph('above')") && s.includes("insertParagraph('below')"));
check('R80-3 上下文悬浮栏（#para-bar + 悬停段落/标题即现，表格/代码/引用/列表/分隔线不弹）', s.includes('function onParaBarHover') && s.includes('function bindParaBar') && s.includes('function domBlockEligible') && ih.includes('id="para-bar"') && ih.includes('data-paraact="above"') && ih.includes('data-paraact="below"') && sc.includes('#para-bar'));
check('R85-P2 段落悬浮栏 hover 自动弹出「已停用」(bindParaBar 不再绑 document mousemove/onParaBarHover → #para-bar 恒隐藏；两项迁入右键菜单)', !s.includes("host.addEventListener('mousemove', onParaBarHover)") && s.includes('function bindParaBar() {') && s.includes('R85-P2：段落悬浮栏（鼠标上下移动自动弹出'));
check('R82-4 段落插入用实时 getValue() 基线（防 editorMdBaseline 返回过期 tab.content 致 md/DOM 块索引错位）', s.includes('state.vditor.getValue().replace') && s.includes('R82：用实时 getValue()'));
check('R82-4b 插入后光标移入新空段落（placeCaretInNewPara 轮询定位 html-entity 块，连续插入不再失败）', s.includes('function placeCaretInNewPara') && s.includes('placeCaretInNewPara(idx, dir)'));
check('R85-P2 右键菜单「在上方/下方插入段落」点击 → insertParagraph(dir, ctxParaBlock)（锚定右键命中块，不依赖光标/悬浮栏）', s.includes("act === 'insert-para-above' || act === 'insert-para-below'") && s.includes("insertParagraph(act === 'insert-para-above' ? 'above' : 'below', ctxParaBlock)"));
check('R85-P2 右键菜单新增「在上方/下方插入段落」项（#ctxmenu 两按钮 + ctx-para-sep 分隔 + updateParaItems 仅段落/标题内显示并锚定 ctxParaBlock）', ih.includes('data-ctx="insert-para-above"') && ih.includes('data-ctx="insert-para-below"') && ih.includes('id="ctx-para-sep"') && s.includes('function updateParaItems') && s.includes('updateParaItems(e.target)') && s.includes('let ctxParaBlock = null;') && s.includes('ctxParaBlock = block;'));
check('R86-PDF 导出样式不再丢失：file:// URL 路径先 decodeURIComponent 再读 asar（桌面 等非 ASCII 路径被编码成 %E6... 曾致 "Invalid package"，PDF/HTML 无主题/KaTeX/高亮样式 = 用户「PDF 格式有问题」根因）', s.includes('function fileUrlToDiskPath') && s.includes('decodeURIComponent(rel)') && s.includes('const p = fileUrlToDiskPath(rel);') && !s.includes("const p = rel.replace('file:///', ''"));
check('R86-PDF 导出时渲染代码高亮 + 数学公式（getHTML 只给原始文本；用编辑器已加载的 hljs/KaTeX 渲染，导出 PDF/HTML/DOC 里代码有高亮、公式为 KaTeX 而非 LaTeX 源码）', s.includes('window.hljs.highlightElement(c)') && s.includes('window.katex.renderToString(tex') && s.includes("tmp.querySelectorAll('.language-math')"));
check('R87-DOC 新增 OOXML 生成器 docx-gen.js（renderer：window.MsDocx.buildParts + 可编辑 OMML 公式 + 删除线/任务列表/分割线/表格/当前字体字号）', dx.includes('window.MsDocx = {') && dx.includes('async function buildParts') && dx.includes('function mathToOoml') && dx.includes('<m:oMathPara>') && dx.includes('<w:strike/>') && dx.includes('vditor-task--done') && dx.includes('<w:tbl>') && dx.includes('<w:pStyle w:val="Heading'));
check('R87-DOC OMML 可编辑公式（KaTeX output:mathml -> m:sSup/m:f/m:rad/m:sSubSup；跳过 annotation 防原始 TeX 泄漏到文档）', dx.includes("output: 'mathml'") && dx.includes('<m:sSubSup>') && dx.includes('<m:f>') && dx.includes('<m:rad>') && dx.includes("case 'annotation':"));
check('R87-DOC 主进程极简 ZIP（makeZip STORE/DEFLATE + crc32）+ export:doc 处理器（parts->zip，docx/doc 双过滤器，支持 .doc 与 .docx）', mj.includes('function makeZip') && mj.includes('function crc32') && mj.includes("handler('export:doc'") && mj.includes("extensions: ['docx']") && mj.includes("extensions: ['doc']") && mj.includes('makeZip(entries)'));
check('R87-DOC renderer exportDoc 改走 OOXML（原始 getHTML + window.MsDocx.buildParts，移除 HTML 伪装 buildWordHtml；index.html 先载入 docx-gen.js）', s.includes('window.MsDocx.buildParts(bodyHtml') && !s.includes('buildWordHtml') && s.includes("'.docx'") && ih.includes('src="docx-gen.js"'));
check('R88-1 Word 超链接可跳转：docx-gen.js 生成真实 w:hyperlink（外部 r:id 关系 + 内部 w:anchor 指向标题书签）+ 标题 bookmarkStart/End + githubSlug 锚点 + hyperlink 关系（TargetMode External）', dx.includes('function githubSlug') && dx.includes('S.anchorMap = anchorMap') && dx.includes('<w:bookmarkStart w:id="') && dx.includes('<w:bookmarkEnd w:id="') && dx.includes('<w:hyperlink w:anchor="') && dx.includes('<w:hyperlink r:id="') && dx.includes("type: 'hyperlink'") && dx.includes('TargetMode'));
check('R88-2 表格左/右边框拖拽时行列选择槽实时跟随：startColDrag 的 applyAt 每帧 + onUp 收敛都调 positionGutters（边缘拖拽改表宽/左边距，槽随边框移动）', s.includes('positionGutters(); // R88-2：边缘拖拽') && s.includes('positionGutters(); // R88-2：收敛到最终几何'));
// ---- R89（dist47）：Word 导出对齐 Word 原生（参考 docx 库）——超链接走字符样式 + runPr 严格 CT_RPr 序 + 任务列表=原生 Wingdings 复选框 + ListParagraph/Hyperlink 样式 ----
check('R89-1 超链接用 Word 字符样式 Hyperlink（rStyle 置于 rPr 末尾；<a> 文字走 ctx.link，不再直接塞乱序 u/color）', dx.includes('<w:rStyle w:val="Hyperlink"/>') && dx.includes('if (ctx.link)') && dx.includes('{ link: 1 }'));
check('R89-1b runPr 严格按 CT_RPr 序（color<sz<u<shd<vertAlign；纠正旧序 u/shd/vertAlign 排在 color/sz 前）', dx.indexOf("if (ctx.color) r += '<w:color") < dx.indexOf("if (ctx.u) r += '<w:u") && dx.indexOf("if (ctx.u) r += '<w:u") < dx.indexOf("if (ctx.mono) r += '<w:shd") && dx.indexOf("if (ctx.mono) r += '<w:shd") < dx.indexOf("if (ctx.va) r += '<w:vertAlign"));
check('R89-3 任务列表=Word 原生 Wingdings 复选框项目符号（勾选=¨/未勾=o 作 bullet，numId 4/3，ListParagraph 样式；移除正文 ☐/☑ run 字面）', dx.includes('function lvlTask') && dx.includes("lvlTask('o')") && dx.includes("lvlTask('" + String.fromCharCode(0xA8) + "')") && dx.includes('(done ? 4 : 3)') && dx.includes('<w:pStyle w:val="ListParagraph"/><w:numPr>') && !dx.includes('const box = done'));
check('R89-3b numbering 增 Wingdings 任务 abstractNum(2/3)+numId(3/4)；lvlJc 全 start（去 left）', dx.includes('w:abstractNumId="3"') && dx.includes('<w:num w:numId="4">') && dx.includes('w:lvlJc w:val="start"') && !dx.includes('w:lvlJc w:val="left"'));
check('R89-4 styles.xml 增 DefaultParagraphFont/Hyperlink(蓝 0563C1+下划线)/ListParagraph 样式', dx.includes('w:styleId="DefaultParagraphFont"') && dx.includes('w:styleId="Hyperlink"') && dx.includes('w:styleId="ListParagraph"') && /w:styleId="Hyperlink"[\s\S]{0,220}?w:color w:val="0563C1"\/><w:u w:val="single"\/>/.test(dx));
check('R89-4b fontTable 声明 Wingdings（复选框字形可用）', dx.includes('w:ascii="Wingdings"') && dx.includes("S.codeFont, 'Wingdings']"));
// R81-1 单元格内 Enter/输入致行高实时变化时，选区蓝框（.ms-tsel 蓝框+淡蓝区域）实时跟随（reset 级 MutationObserver + rAF 合并）
check('R81-1 选中态跟随观察器（startSelWatch/refreshSelectionVisual + reset 级 MutationObserver 监听子树）', s.includes('function startSelWatch') && s.includes('function refreshSelectionVisual') && s.includes('function stopSelWatch') && s.includes('selWatchMo.observe(reset, { childList: true, subtree: true, characterData: true })'));
check('R81-1 重建/切文件后重挂跟随观察器（bindTableReset 收尾 startSelWatch）', s.includes('startSelWatch(reset);') && s.includes('function bindTableReset'));
// R81-2 表格单元格内插入：内联类就地、块级类插到整张表格之后（表格原样保留）
check('R81-2 单元格块级类型表 + 光标在格判定（CELL_BLOCK_TYPES + caretInCell/relocateCell）', s.includes('const CELL_BLOCK_TYPES = {') && s.includes('function caretInCell') && s.includes('function relocateCell'));
check('R81-2 工具栏拦截：格内块级按钮改插整表之后（clickToolbar 分支，不再拍扁全表）', s.includes('if (CELL_BLOCK_TYPES[type] && caretInCell()) { insertBlockAfterTable(type); return; }'));
check('R81-2 insertBlockAfterTable 保表 + NBSP 占位（空 列表/有序/引用 重解析丢失，NBSP 让空项渲染；任务项不带 NBSP 防 lute 空指针崩溃）', s.includes('function insertBlockAfterTable') && s.includes('\\u00a0') && (s.match(/\\u00a0/g) || []).length >= 3 && s.includes("'- [ ] '") && s.includes("'- \\u00a0'") && s.includes("'1. \\u00a0'") && s.includes("'> \\u00a0'"));
check('R81-2 lute(WASM) 崩溃兜底（insertBlockAfterTable 内 setValue 包 try/catch + 失败 toast，异常不冒泡）', s.includes('function insertBlockAfterTable') && s.includes("toast('插入失败，请重试')") && /function insertBlockAfterTable[\s\S]{0,1600}?try\s*\{[\s\S]{0,120}?state\.vditor\.setValue[\s\S]{0,120}?catch\s*\(/.test(s));
check('R81-2 块级插入后光标移入新块（placeCaretAfterTableBlock 轮询；代码块按 DIV 容器内 .vditor-ir__marker--pre 判就绪）', s.includes('function placeCaretAfterTableBlock') && s.includes("nb.querySelector('.vditor-ir__marker--pre')") && s.includes('range.collapse(false)'));
check('R81-2 单元格行内公式（insertFormula，insertValue 就地插入不破坏表格）', s.includes('function insertFormula') && s.includes("insertValue('$E=mc^2$')"));
// R80-1b（R81 一并收口）悬浮工具条/行/列槽贴近表格：gutter 8px + 工具条距表 10px
check('R80-1b 行槽贴表左 8px（R85 内容坐标：gutRow.left = 表左内容坐标 - 8）', s.includes('gutRow.style.left = Math.max(0, tableLeftContent - 8)'));
check('R80-1b 行/列槽 8px 宽/高（css .ms-grow width / .ms-gcol height）', sc.includes('.ms-grow { width: 8px; }') && sc.includes('.ms-gcol { height: 8px; z-index: 45; }'));
check('R82-3 图片相对路径 src 同步修正（MutationObserver 内 fixImageSrcNow 同步改对 src 消除破图闪烁；fixImagesSoon 复用同一同步函数）', s.includes('function fixImageSrcNow') && s.includes('let _fixImgReenter = false;') && s.includes('const mo = new MutationObserver(() => { fixImageSrcNow(); fixImagesSoon(); })') && /function fixImagesSoon\(\)\s*\{[\s\S]{0,200}?fixImageSrcNow\(\)/.test(s));
// ---- R90（dist48）：超大文件快速阅读模式（13MB 级文档整篇 IR 渲染卡死主线程 → 只读分块虚拟渲染）----
check('R90-1 阈值与入口：READER_THRESHOLD=1MB + isReader + openPath/openContentTab 打 reader 标记', s.includes('const READER_THRESHOLD = 1000000;') && s.includes('function isReader()') && s.includes('reader: isReaderFile,') && s.includes('reader: content.length >= READER_THRESHOLD,'));
check('R90-2 分块器：splitReaderChunks 目标/硬上限 + 围栏/公式失衡保护（>300/>200 行未闭合即重置）+ 行数估高', s.includes('function splitReaderChunks') && s.includes('const READER_CHUNK_TARGET = 16000;') && s.includes('const READER_CHUNK_MAX = 131072;') && s.includes('i - fenceStart > 300') && s.includes('i - mathStart > 200') && s.includes('ln * 28 + 40'));
check('R90-3 渲染管线：readerMaskMath 数学占位（zzdmth/zzimth token + 行内代码屏蔽）+ Md2HTML + KaTeX 回填 + 图片 file:// + 卸载回收', s.includes('function readerMaskMath') && s.includes("'zz' + (display ? 'd' : 'i') + 'mth'") && s.includes('Md2HTML(masked)') && s.includes('window.katex.renderToString(tex') && s.includes('resolveLocalPath(src)') && s.includes('fileUrlOf(abs)') && s.includes('function readerUnrenderChunk'));
check('R90-4 虚拟化：视口渲染 + 前缀和 + 保留区回收（READER_KEEP_RANGE）+ 占位 DOM', s.includes('function readerRenderVisible') && s.includes('function readerSums') && s.includes('const READER_KEEP_RANGE = 6;') && s.includes('function readerBuildDom') && s.includes('readerScheduleRender._raf'));
check('R90-5 集成：loadTabIntoEditor reader 分支 + getCurrentContent 守卫 + enterReaderMode/readerTeardown + readerTabId', /function loadTabIntoEditor[\s\S]{0,900}if \(tab\.reader\) \{[\s\S]{0,400}enterReaderMode\(tab\)/.test(s) && s.includes("if (isReader()) { const t = activeTab(); return t ? (t.content || '') : ''; }") && s.includes('function enterReaderMode') && s.includes('function readerTeardown') && s.includes('let readerTabId = null;'));
check('R90-6 只读守卫：handleMenu 白名单拦截 + 替换拦截 + 导出/打印提示', s.includes("if (isReader()) {\n    const OK = { 'new-file': 1, 'open-file-dialog': 1") && s.includes("toast(/^(export-|print-doc)/.test(action) ? '阅读模式为只读快速视图，不支持导出/打印'") && s.includes("if (isReader()) { toast('阅读模式为只读，不支持替换'); return; }"));
check('R90-7 阅读查找/大纲跳转：findNext isReader 分支（collectMatches+reveal+高亮）+ jumpToHeading 偏移跳块 + 大纲带偏移解析与 4000 封顶', s.includes('function readerRevealMatch') && s.includes('function readerHighlightIn') && s.includes("mark.className = 'ms-rfind'") && /function jumpToHeading[\s\S]{0,300}isReader\(\)/.test(s) && s.includes('function readerOutlineWithOffsets') && s.includes('const READER_OUTLINE_CAP = 4000;') && s.includes('标题过多，仅显示前 '));
check('R90-8 行号栏保护：阅读模式跳过 + 源码/IR 超 25000 行(块)隐藏 nolines（不再逐行建几万个节点）', s.includes('if (isReader()) return; // R90：阅读模式无行号栏') && s.includes('if (n > 25000) {') && s.includes('if (kids.length > 25000) {') && s.includes("classList.add('nolines')"));
check('R90-9 逃生通道：横幅双击确认（4 秒窗口）转编辑模式', s.includes('(function bindReaderEdit()') && s.includes('Date.now() - last > 4000') && s.includes('再点一次确认（整篇编辑可能卡顿数十秒）'));
check('R90-10 html/css：#reader 结构 + katex 本地静态加载 + 阅读样式/禁用态/nolines', ih.includes('id="reader-banner"') && ih.includes('id="reader-scroll"') && ih.includes('id="reader-body" class="vditor-reset"') && ih.includes('id="reader-edit"') && ih.includes('js/katex/katex.min.css') && ih.includes('js/katex/katex.min.js') && sc.includes('#fbar.reader-mode .fbar-btn') && sc.includes('#line-gutter.nolines') && sc.includes('mark.ms-rfind') && sc.includes('#reader-body'));
check('R90-11 parseOutline 围栏失衡保护（编辑器模式大纲同样受益）', /function parseOutline[\s\S]{0,600}fenceStart[\s\S]{0,200}fenceStart >= 0 && li - fenceStart > 300/.test(s));
// ---- R91（dist49）：阅读模式大纲跳转落点精确化（元素级定位替代前缀和估算）----
check('R91-1 大纲跳转元素级定位：readerJumpToHeading + 跳转前预渲染前后 ±2 块（防渲染收缩推离视口）+ 空文本标题元素跳过/精确优先匹配', s.includes('function readerJumpToHeading') && s.includes('function readerRenderAround') && /readerRenderAround\(ci\)/.test(s) && s.includes('if (t && t === want)') && s.includes("t.length > want.length && t.indexOf(want) !== -1"));
check('R91-2 两段式落点自校正（alignHeading：实测 gap 一次补偿到 8px 顶隙 + 150ms 复核）', s.includes('const alignHeading') && s.includes('sc.scrollTop += gap - 8') && s.includes(", 150)"));
check('R91-3 查找定位升级：块内文本节点拼接串定位（跨内联元素命中）+ md 标记剥离重试 + 跨节点选区高亮兜底', s.includes('const starts = new Array(nodes.length)') && s.includes("full += nodes[i].nodeValue") && s.includes("replace(/^[\\s#>*_~`\\-—·•]+/, '')") && s.includes('sel.addRange(r)'));
// ---- R92（dist50）：阅读模式文件夹跟随 + 超大文件编辑保护 + 渲染进程崩溃自愈 ----
check('R92-1 阅读分支文件夹跟随（此前提前 return 跳过 → 侧栏文件面板空）', /if \(tab\.reader\) \{[\s\S]{0,900}parentR !== state\.folder[\s\S]{0,120}refreshTree\(\)/.test(s) && s.includes('else highlightTreeFile(tab.path);'));
check('R92-2 超大文件禁止整篇编辑（EDITOR_ESCAPE_MAX=3M：防 IR 渲染耗尽内存崩溃→窗口全白顶栏"消失"）', s.includes('const EDITOR_ESCAPE_MAX = 3000000;') && s.includes('整篇编辑可能耗尽内存导致界面崩溃') && /content\.length > EDITOR_ESCAPE_MAX[\s\S]{0,200}toast\(/.test(s));
check('R92-3 渲染进程崩溃自动重载（main：render-process-gone → reload，非 clean-exit）', /render-process-gone[\s\S]{0,300}clean-exit[\s\S]{0,200}reload\(\)/.test(mj));
// ---- R93（dist51）：阅读模式禁用 scrollIntoView（祖先链把 overflow:hidden 的 body 程序化滚动 → 顶栏被顶出窗口"消失"）----
check('R93-1 阅读跳转纯内层滚动器数学（readerScrollChunkIntoView 用 rect 差+scrollTop；readerJumpToHeading/readerRevealMatch 无 scrollIntoView 调用）', s.includes('function readerScrollChunkIntoView') && s.includes('ck.el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop') && !/function readerJumpToHeading[\s\S]{0,2000}\.scrollIntoView\(/.test(s) && !/function readerRevealMatch[\s\S]{0,1200}\.scrollIntoView\(/.test(s));
check('R93-2 页面级滚动兜底归零（readerPinPageScroll：body/documentElement.scrollTop 归零，跳转/查找后调用）', s.includes('function readerPinPageScroll') && /readerPinPageScroll\(\)/.test(s) && (s.match(/readerPinPageScroll\(\)/g) || []).length >= 2);
// ---- R94（dist52）：阅读模式单波浪号转义（0~7 数值范围被 GFM 配对成删除线 → \~ 字面渲染，~~对~~ 保留）----
check('R94 阅读渲染单 ~ 转义 \\~（readerMaskMath：~+ 跑只保留成对的 ~~，代码 span/公式/围栏不受影响）', /R94：单个 ~ 转义/.test(s) && s.includes("s.replace(/~+/g, (m) => m.length === 2 ? m : m.replace(/~/g, '\\\\~'))"));

// ---- 开源前安全加固（SEC-1~SEC-8）：XSS / 路径泄露 / 进程沙箱 ----
// 背景见 SECURITY.md。这些断言防止后续改动把已修好的安全问题再带回来。
check('SEC-1 阅读模式 Lute 实例必须净化（SetSanitize(true)；否则文档原始 HTML 会执行脚本）', s.includes('readerLute._i.SetSanitize(true)') && !/function readerLute\(\)\s*\{\s*return readerLute\._i \|\| \(readerLute\._i = Lute\.New\(\)\);/.test(s));
check('SEC-2 欢迎页最近文件列表不得用 innerHTML 拼接路径（改用 textContent）', !s.includes('<span class="rname">${baseName(p)}</span>') && s.includes('nameEl.textContent = baseName(p)') && s.includes("dirEl.textContent = p"));
check('SEC-3 导出 HTML 的 <title> 必须转义文件名（防标记注入）', s.includes('<title>${escHtml(title)}</title>') && !s.includes('<title>${title}</title>'));
check('SEC-4 导出产物自带严格 CSP（script-src/connect-src none，禁脚本禁外联）+ 剥离正文 <script>', s.includes("script-src 'none'") && s.includes("connect-src 'none'") && s.includes("tmp.querySelectorAll('script').forEach((s) => s.remove())"));
check('SEC-5 导出 HTML 内联本地资源为 data:（不把用户名/安装目录写进分享出去的产物）', s.includes('function embedLocalAssets') && s.includes('function assetMimeOf') && s.includes('embedLocalAssetsInOutput') && s.includes('embedLocalAssets(html, localAssets)'));
check('SEC-6 PDF/打印保留 file:// 本地路径（源 HTML 只落在本机临时目录，不内联以免拖慢导出）', (s.match(/\{ keepLocalPaths: true \}/g) || []).length >= 2);
check('SEC-7 图片尺寸映射用无原型对象（constructor/__proto__ 作图片地址不再抛异常）', s.includes('const ann = Object.create(null)') && s.includes('const seen = Object.create(null)'));
check('SEC-8 渲染进程开启沙箱（main.js sandbox: true，且不再有 sandbox: false）', /contextIsolation: true[\s\S]{0,80}nodeIntegration: false[\s\S]{0,400}sandbox: true/.test(mj) && !mj.includes('sandbox: false'));
// 注意：translate.js 的注释里会保留对旧私有主机（api-edge）的说明，因此这里断言的是
// 「终结点常量不得再指向 api-edge」，而不是「文件里不出现该字符串」。
check('SEC-9 翻译终结点只走官方文档化主机（常量不得再指向 Edge 私有主机 api-edge）', mj.includes("require('./translate')") && !/const\s+MS_\w+\s*=\s*['"]https:\/\/api-edge\./.test(txt(/main\/translate\.js$/)) && txt(/main\/translate\.js$/).includes('api.cognitive.microsofttranslator.com'));
check('SEC-10 index.html 保留 CSP 且 http(s) 未被放行到 connect-src/img-src', ih.includes('Content-Security-Policy') && /connect-src 'self' file: data: blob:/.test(ih) && !/connect-src[^;]*https?:/.test(ih));

console.log('==== t193 asar 校验: ' + pass + ' 通过 / ' + fail + ' 失败 ====');
process.exit(fail ? 1 : 0);
