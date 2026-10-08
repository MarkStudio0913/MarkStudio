/* MarkStudio R87 — real .docx (Office Open XML) generator.
 * Runs in the RENDERER: it needs the body DOM, window.katex (TeX→MathML),
 * and window.ms.invoke('fs:read-base64') for image bytes.
 * Emits a parts list [{name, b64}] that the main process zips into a .docx/.doc.
 * No external dependencies. */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---- image dimensions from raw bytes (no async decode) ----
  function b64ToBytes(b64) {
    const s = atob(b64); const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }
  function parseImageDims(b) {
    try {
      if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
        return {
          w: b[16] * 16777216 + b[17] * 65536 + b[18] * 256 + b[19],
          h: b[20] * 16777216 + b[21] * 65536 + b[22] * 256 + b[23]
        };
      }
      if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
        return { w: b[6] + (b[7] << 8), h: b[8] + (b[9] << 8) };
      }
      if (b.length > 4 && b[0] === 0xFF && b[1] === 0xD8) {
        let i = 2;
        while (i < b.length - 9) {
          if (b[i] !== 0xFF) { i++; continue; }
          const m = b[i + 1];
          if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
            return { h: b[i + 5] * 256 + b[i + 6], w: b[i + 7] * 256 + b[i + 8] };
          }
          i += 2;
        }
      }
    } catch (e) { /* fall through */ }
    return { w: 0, h: 0 };
  }
  function extOf(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    const e = m ? m[1].toLowerCase() : '';
    if (e === 'jpeg' || e === 'jpe') return 'jpg';
    return e || 'png';
  }

  // ---- math: TeX -> KaTeX MathML -> OMML (editable equations) ----
  function mRun(text) {
    return '<m:r><m:t xml:space="preserve">' + esc(text) + '</m:t></m:r>';
  }
  function convMath(node) {
    if (node.nodeType === 3) return mRun(node.textContent);
    const t = node.localName;
    const kids = Array.from(node.childNodes);
    const K = kids.map(convMath);
    switch (t) {
      case 'math': case 'mrow': case 'mstyle': case 'mpadded':
      case 'mphantom': case 'menclose': case 'merror':
        return K.join('');
      case 'mi': case 'mn': case 'mo': case 'mtext':
        return mRun(node.textContent);
      case 'mspace': return mRun(' '); case 'annotation': case 'annotation-xml': return '';
      case 'msub':
        return '<m:sSub><m:e>' + (K[0] || '') + '</m:e><m:sub>' + (K[1] || '') + '</m:sub></m:sSub>';
      case 'msup':
        return '<m:sSup><m:e>' + (K[0] || '') + '</m:e><m:sup>' + (K[1] || '') + '</m:sup></m:sSup>';
      case 'msubsup':
        return '<m:sSubSup><m:e>' + (K[0] || '') + '</m:e><m:sub>' + (K[1] || '') +
          '</m:sub><m:sup>' + (K[2] || '') + '</m:sup></m:sSubSup>';
      case 'mfrac':
        return '<m:f><m:num>' + (K[0] || '') + '</m:num><m:den>' + (K[1] || '') + '</m:den></m:f>';
      case 'msqrt':
        return '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:e>' + (K[0] || '') + '</m:e></m:rad>';
      case 'mroot':
        return '<m:rad><m:deg>' + (K[0] || '') + '</m:deg><m:e>' + (K[1] || '') + '</m:e></m:rad>';
      case 'mover': {
        const el2 = kids.filter(function (k) { return k.nodeType === 1; });
        const accNode = el2[1]; const at = accNode ? accNode.textContent : '';
        const base = K[0] || '';
        if (/‾|overline|bar/.test(at)) {
          return '<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>' + base + '</m:e></m:bar>';
        }
        const chr = /~|tilde/.test(at) ? '˜' : 'ˆ';
        return '<m:acc><m:accPr><m:chr m:val="' + esc(chr) + '"/></m:accPr><m:e>' + base + '</m:e></m:acc>';
      }
      case 'munder':
        return '<m:sSub><m:e>' + (K[0] || '') + '</m:e><m:sub>' + (K[1] || '') + '</m:sub></m:sSub>';
      case 'munderover':
        return '<m:sSubSup><m:e>' + (K[0] || '') + '</m:e><m:sub>' + (K[1] || '') +
          '</m:sub><m:sup>' + (K[2] || '') + '</m:sup></m:sSubSup>';
      case 'mfenced': {
        const open = node.getAttribute('open'); const close = node.getAttribute('close');
        return '<m:d><m:dPr><m:begChr m:val="' + esc(open || '(') + '"/><m:endChr m:val="' +
          esc(close || ')') + '"/></m:dPr><m:e>' + K.join('') + '</m:e></m:d>';
      }
      case 'mtable':
        return '<m:m>' + K.join('') + '</m:m>';
      case 'mtr': return '<m:mr>' + K.join('') + '</m:mr>';
      case 'mtd': return '<m:e>' + (K[0] || '') + '</m:e>';
      default: return K.join('');
    }
  }
  function mathToOoml(tex, display) {
    if (!window.katex) return null;
    let mathEl = null;
    try {
      const s = window.katex.renderToString(tex, {
        output: 'mathml', displayMode: !!display, throwOnError: false
      });
      const d = document.createElement('div'); d.innerHTML = s;
      mathEl = d.querySelector('math');
    } catch (e) { mathEl = null; }
    if (!mathEl) return null;
    try { return convMath(mathEl); } catch (e) { return null; }
  }

  // ---- resolve a (possibly relative) image src against the doc directory ----
  function resolveDocPath(docDir, rel) {
    if (!rel) return null;
    if (/^[a-zA-Z]:[\\/]/.test(rel)) return rel.replace(/\//g, '\\');
    if (rel.indexOf('file:///') === 0) {
      try { return decodeURIComponent(rel).replace('file:///', '').replace(/\//g, '\\'); } catch (e) { return null; }
    }
    if (/^https?:/i.test(rel)) return null;
    const stack = (docDir || '').replace(/\\/g, '/').split('/').filter(Boolean);
    for (const seg of (rel || '').split('/')) {
      if (seg === '' || seg === '.') continue;
      else if (seg === '..') stack.pop();
      else stack.push(seg);
    }
    if (!stack.length) return null;
    if (/^[a-zA-Z]:$/.test(stack[0])) return stack[0] + '\\' + stack.slice(1).join('\\');
    return stack.join('\\');
  }

  const CJK_FONT = /[\u4e00-\u9fff]|yahei|simhei|simsun|kaiti|fangsong|song|hei|ming|pingfang|noto.*cjk|source.*cjk/i;
  function eastAsiaFor(f) { return CJK_FONT.test(f || '') ? (f || 'Microsoft YaHei') : 'Microsoft YaHei'; }
  // GitHub-style heading slug (matches Vditor/lute anchor targets) for internal-link bookmarks
  function githubSlug(s) {
    return (s || '').trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // =====================================================================
  // buildParts(bodyHtml, docDir, settings) -> [{name, b64}]
  // =====================================================================
  async function buildParts(bodyHtml, docDir, settings) {
    settings = settings || {};
    const baseFont = ((settings.contentFont || '').trim()) || 'Microsoft YaHei';
    const baseSize = Math.max(8, Math.round((settings.fontSize || 16) * 1.5)); // half-points
    const codeFont = 'Consolas';

    const S = {
      baseFont: baseFont, baseSize: baseSize, codeFont: codeFont,
      docDir: docDir || '', rels: [], img: 0, pic: 0, hl: 0,
      baseCtx: { b: 0, i: 0, strike: 0, mono: 0, u: 0, color: null, font: null, sz: null },
      headCtx: { b: 0, i: 0, strike: 0, mono: 0, u: 0, color: null, font: null, sz: null, useStyle: 1 }
    };

    const root = document.createElement('body');
    root.innerHTML = bodyHtml || '';

    // ---- pre-load every image (async, once) into imgMap keyed by element ----
    const imgMap = new Map();
    const imgEls = Array.from(root.querySelectorAll('img'));
    const mediaParts = [];
    for (const im of imgEls) {
      const src = im.getAttribute('src') || '';
      let abs = null;
      try { abs = (typeof resolveLocalPath === 'function') ? resolveLocalPath(src) : resolveDocPath(S.docDir, src); } catch (e) { abs = null; }
      if (!abs) continue;
      let r = null;
      try { r = await window.ms.invoke('fs:read-base64', { path: abs }); } catch (e) { r = null; }
      if (!r || r.error || !r.dataB64) continue;
      S.img++;
      const ext = extOf(abs);
      const id = 'rId' + (100 + S.img);
      S.rels.push({ id: id, type: 'image', target: 'media/img' + S.img + '.' + ext, external: false });
      mediaParts.push({ name: 'word/media/img' + S.img + '.' + ext, b64: r.dataB64 });
      let dims = { w: 0, h: 0 };
      try { dims = parseImageDims(b64ToBytes(r.dataB64)); } catch (e) { dims = { w: 0, h: 0 }; }
      imgMap.set(im, { id: id, dims: dims });
    }

    S.imgMap = imgMap;

    // ---- R88-1: heading bookmarks + anchor map (targets for internal/TOC links) ----
    const anchorMap = {};
    Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).forEach(function (hh, i) {
      const ht = (hh.textContent || '').trim();
      const slug = githubSlug(ht);
      const bmName = '_H' + i;
      hh.__bm = { id: 9000 + i, name: bmName };
      if (slug && !anchorMap[slug]) anchorMap[slug] = bmName;
      if (ht && !anchorMap[ht.toLowerCase()]) anchorMap[ht.toLowerCase()] = bmName;
    });
    S.anchorMap = anchorMap;

    const bodyXml = walkBlocks(root, S);

    // ---- assemble parts ----
    const parts = [];
    parts.push({ name: '[Content_Types].xml', b64: b64Str(contentTypesXml()) });
    parts.push({ name: '_rels/.rels', b64: b64Str(rootRelsXml()) });
    parts.push({ name: 'word/document.xml', b64: b64Str(documentXml(bodyXml)) });
    parts.push({ name: 'word/styles.xml', b64: b64Str(stylesXml(S)) });
    parts.push({ name: 'word/settings.xml', b64: b64Str(settingsXml()) });
    parts.push({ name: 'word/numbering.xml', b64: b64Str(numberingXml()) });
    parts.push({ name: 'word/fontTable.xml', b64: b64Str(fontTableXml(S)) });
    parts.push({ name: 'word/_rels/document.xml.rels', b64: b64Str(docRelsXml(S)) });
    for (const m of mediaParts) parts.push(m);
    return parts;
  }

  function b64Str(s) {
    try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return btoa(encodeURIComponent(s)); }
  }

  // ================= block-level =================
  function walkBlocks(parent, S) {
    let out = '';
    for (const n of parent.childNodes) out += blockXml(n, S);
    return out;
  }

  function blockXml(n, S) {
    if (n.nodeType === 3) {
      const t = n.nodeValue;
      if (t == null || t.trim() === '') return '';
      return '<w:p>' + runsOf(n, S.baseCtx, S).join('') + '</w:p>';
    }
    if (n.nodeType !== 1) return '';
    const tag = n.localName;

    if (/^h[1-6]$/.test(tag)) {
      const lvl = +tag[1];
      const hruns = runsOf(n, S.headCtx, S).join('');
      const bm = n.__bm;
      const bs = bm ? '<w:bookmarkStart w:id="' + bm.id + '" w:name="' + bm.name + '"/>' : '';
      const be = bm ? '<w:bookmarkEnd w:id="' + bm.id + '"/>' : '';
      return '<w:p><w:pPr><w:pStyle w:val="Heading' + lvl + '"/></w:pPr>' + bs + hruns + be + '</w:p>';
    }
    if (tag === 'p') {
      const imgs = n.querySelectorAll('img');
      if (imgs.length === 1 && (n.textContent || '').trim() === '') {
        return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr>' + imgFlowEl(imgs[0], S) + '</w:p>';
      }
      const items = runsOf(n, S.baseCtx, S);
      if (items.length === 0 && (n.textContent || '').trim() === '') return '';
      return '<w:p>' + items.join('') + '</w:p>';
    }
    if (tag === 'div' && ((n.className || '').indexOf('language-math') !== -1)) {
      const tex = (n.textContent || '').trim();
      const omml = mathToOoml(tex, true);
      if (omml != null) {
        return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><m:oMathPara><m:oMath>' + omml + '</m:oMath></m:oMathPara></w:p>';
      }
      return '<w:p>' + runsOf(n, S.baseCtx, S).join('') + '</w:p>';
    }
    if (tag === 'blockquote') {
      let out = '';
      for (const c of n.children) out += blockQuotePara(c, S);
      return out || '<w:p/>';
    }
    if (tag === 'ul' || tag === 'ol') {
      const ordered = (tag === 'ol');
      let out = '';
      for (const li of n.children) if (li.localName === 'li') out += listItem(li, 0, ordered, S);
      return out;
    }
    if (tag === 'pre') {
      const code = n.querySelector('code');
      const raw = (code || n).textContent || '';
      const lines = raw.replace(/\n$/, '').split('\n');
      let out = '';
      for (const line of lines) {
        out += '<w:p><w:pPr>' + codeParaPr() + '</w:pPr>' +
          run(S_codeCtx(S), line === '' ? ' ' : line, S) + '</w:p>';
      }
      return out + '<w:p/>';
    }
    if (tag === 'hr') {
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="auto"/></w:pBdr>' +
        '<w:spacing w:before="80" w:after="80"/></w:pPr></w:p>';
    }
    if (tag === 'table') return tableXml(n, S) + '<w:p/>';
    if (tag === 'div') return walkBlocks(n, S);
    return '<w:p>' + runsOf(n, S.baseCtx, S).join('') + '</w:p>';
  }

  function S_codeCtx(S) { return Object.assign({}, S.baseCtx, { mono: 1 }); }

  function blockQuotePara(c, S) {
    const items = runsOf(c, S.baseCtx, S);
    const pPr = '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="auto"/></w:pBdr>' +
      '<w:shd w:val="clear" w:color="auto" w:fill="F7F7F7"/>' +
      '<w:ind w:left="480" w:right="240"/>';
    return '<w:p><w:pPr>' + pPr + '</w:pPr>' + items.join('') + '</w:p>';
  }

  function codeParaPr() {
    return '<w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>' +
      '<w:spacing w:line="240" w:lineRule="auto"/>';
  }

  function listItem(li, depth, ordered, S) {
    const cls = li.className || '';
    const isTask = cls.indexOf('vditor-task') !== -1;
    let pPr, items;
    if (isTask) {
      // R89-3：任务列表改用 Word 原生「Wingdings 复选框项目符号列表」——勾选=¨(U+00A8)、未勾=o 作为列表 bullet
      //（原来把 ☐/☑ 当正文文字塞进 run，在 Word 里字形/对齐都不对、不像真正的待办复选框）
      const inp = li.querySelector('input');
      const done = cls.indexOf('vditor-task--done') !== -1 || (inp && inp.checked);
      pPr = '<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + (done ? 4 : 3) + '"/></w:numPr>';
      items = runsOf(li, S.baseCtx, S);
    } else {
      pPr = '<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="' + depth + '"/><w:numId w:val="' + (ordered ? 2 : 1) + '"/></w:numPr>';
      items = runsOf(li, S.baseCtx, S);
    }
    let out = '<w:p><w:pPr>' + pPr + '</w:pPr>' + items.join('') + '</w:p>';
    for (const child of li.children) {
      if (child.localName === 'ul' || child.localName === 'ol') {
        let sub = '';
        for (const sli of child.children) if (sli.localName === 'li') sub += listItem(sli, depth + 1, child.localName === 'ol', S);
        out += sub;
      }
    }
    return out;
  }

  function borderXml(side) { return '<w:' + side + ' w:val="single" w:sz="4" w:space="0" w:color="auto"/>'; }

  function tableXml(n, S) {
    const rows = Array.from(n.querySelectorAll('tr'));
    const ncols = rows.length ? rows[0].querySelectorAll('th,td').length : 0;
    const usable = 8306;
    const colW = Math.max(600, Math.floor(usable / Math.max(1, ncols)));
    let grid = '<w:tblGrid>';
    for (let i = 0; i < ncols; i++) grid += '<w:gridCol w:w="' + colW + '"/>';
    grid += '</w:tblGrid>';
    let out = '<w:tbl><w:tblPr><w:tblW w:w="' + (colW * ncols) + '" w:type="dxa"/><w:tblBorders>' +
      borderXml('top') + borderXml('left') + borderXml('bottom') + borderXml('right') +
      borderXml('insideH') + borderXml('insideV') +
      '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>' + grid;
    rows.forEach(function (tr) {
      const isHead = tr.closest('thead') != null;
      out += '<w:tr>';
      Array.from(tr.children).forEach(function (cell) {
        if (cell.localName !== 'td' && cell.localName !== 'th') return;
        const align = cell.getAttribute('align') || 'left';
        const jc = align === 'right' ? 'right' : (align === 'center' ? 'center' : 'left');
        const fill = isHead ? 'F2F2F2' : '';
        let tcPr = '<w:tcW w:w="' + colW + '" w:type="dxa"/>' +
          (fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>' : '') +
          '<w:vAlign w:val="center"/>';
        const ctx = Object.assign({}, S.baseCtx);
        if (isHead) ctx.b = 1;
        const cellItems = runsOf(cell, ctx, S);
        out += '<w:tc><w:tcPr>' + tcPr + '</w:tcPr><w:p><w:pPr><w:jc w:val="' + jc +
          '"/></w:pPr>' + (cellItems.length ? cellItems.join('') : run(ctx, ' ', S)) + '</w:p></w:tc>';
      });
      out += '</w:tr>';
    });
    out += '</w:tbl>';
    return out;
  }

  // ================= inline/run-level =================
  function styleCtxFromEl(el) {
    const out = {};
    const st = el.getAttribute && el.getAttribute('style');
    if (!st) return out;
    const ff = /font-family\s*:\s*([^;]+)/i.exec(st);
    if (ff) { const fam = ff[1].trim().split(',')[0].replace(/["']/g, '').trim(); if (fam) out.font = fam; }
    const fs = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/i.exec(st);
    if (fs) out.sz = Math.max(8, Math.round(parseFloat(fs[1]) * 1.5));
    return out;
  }

  function runPr(ctx, S) {
    // R89-1：超链接 run 用 Word 字符样式 Hyperlink（与 Word 原生一致），不再直接塞乱序的 u/color
    if (ctx.link) {
      let r2 = '';
      if (ctx.b) r2 += '<w:b/><w:bCs/>';
      if (ctx.i) r2 += '<w:i/><w:iCs/>';
      if (ctx.strike) r2 += '<w:strike/>';
      if (ctx.va) r2 += '<w:vertAlign w:val="' + ctx.va + '"/>';
      r2 += '<w:rStyle w:val="Hyperlink"/>'; // R89-1：rStyle 置于 rPr 末尾（CT_RPr 序，避免被 Word 忽略）
      return '<w:rPr>' + r2 + '</w:rPr>';
    }
    let r = '';
    if (ctx.mono) {
      r += '<w:rFonts w:ascii="' + S.codeFont + '" w:hAnsi="' + S.codeFont + '" w:cs="' + S.codeFont + '"/>';
    } else if (!ctx.useStyle) {
      const f = ctx.font || S.baseFont;
      r += '<w:rFonts w:ascii="' + esc(f) + '" w:eastAsia="' + esc(eastAsiaFor(f)) + '" w:hAnsi="' + esc(f) + '" w:cs="' + esc(f) + '"/>';
    }
    if (ctx.b) r += '<w:b/><w:bCs/>';
    if (ctx.i) r += '<w:i/><w:iCs/>';
    if (ctx.strike) r += '<w:strike/>';
    if (ctx.color) r += '<w:color w:val="' + ctx.color + '"/>';
    if (!ctx.useStyle) r += '<w:sz w:val="' + (ctx.sz || S.baseSize) + '"/><w:szCs w:val="' + (ctx.sz || S.baseSize) + '"/>';
    if (ctx.u) r += '<w:u w:val="single"/>';
    if (ctx.mono) r += '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>';
    if (ctx.va) r += '<w:vertAlign w:val="' + ctx.va + '"/>';
    return r ? '<w:rPr>' + r + '</w:rPr>' : '';
  }

  function run(ctx, text, S, o) {
    o = o || {};
    const rPr = runPr(ctx, S);
    if (o.br) return '<w:r>' + rPr + '<w:br/></w:r>';
    return '<w:r>' + rPr + '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>';
  }

  function imgFlowEl(im, S) {
    const info = S.imgMap ? S.imgMap.get(im) : null;
    if (!info) return '';
    const d = info.dims;
    let wpx = d && d.w > 0 ? d.w : 480;
    let hpx = d && d.h > 0 ? d.h : (wpx * 0.6);
    const maxW = 6 * 96; // ~6 inches at 96 dpi
    if (wpx > maxW) { hpx = hpx * maxW / wpx; wpx = maxW; }
    const cx = Math.round(wpx * 9525), cy = Math.round(hpx * 9525);
    S.pic++;
    const pid = S.pic;
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + pid + '" name="Picture ' + pid + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + pid + '" name="img' + pid + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + info.id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }

  function runsOf(node, ctx, S) {
    const items = [];
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const txt = n.nodeValue;
        if (txt === '' || txt == null) continue;
        items.push(run(ctx, txt, S));
      } else if (n.nodeType === 1) {
        const tag = n.localName;
        if (tag === 'br') { items.push(run(ctx, '', S, { br: true })); }
        else if (tag === 'strong' || tag === 'b') { items.push.apply(items, runsOf(n, Object.assign({}, ctx, { b: 1 }), S)); }
        else if (tag === 'em' || tag === 'i') { items.push.apply(items, runsOf(n, Object.assign({}, ctx, { i: 1 }), S)); }
        else if (tag === 'del' || tag === 's' || tag === 'strike') { items.push.apply(items, runsOf(n, Object.assign({}, ctx, { strike: 1 }), S)); }
        else if (tag === 'u') { items.push.apply(items, runsOf(n, Object.assign({}, ctx, { u: 1 }), S)); }
        else if (tag === 'sup') { items.push.apply(items, runsOf(n, Object.assign({}, ctx, { va: 'superscript' }), S)); }
        else if (tag === 'sub') { items.push.apply(items, runsOf(n, Object.assign({}, ctx, { va: 'subscript' }), S)); }
        else if (tag === 'code') { items.push.apply(items, runsOf(n, Object.assign({}, ctx, { mono: 1 }, styleCtxFromEl(n)), S)); }
        else if (tag === 'a') {
          const href = (n.getAttribute('href') || '').trim();
          if (!href) { items.push.apply(items, runsOf(n, ctx, S)); }
          else {
            const inner = runsOf(n, Object.assign({}, ctx, { link: 1 }), S); // R89-1：链接文字走 Hyperlink 字符样式（蓝+下划线由样式提供）
            if (!inner.length) { items.push(run(ctx, ' ', S)); }
            else if (href.charAt(0) === '#') {
              const raw2 = href.slice(1).trim();
              const nm = S.anchorMap ? (S.anchorMap[raw2] || S.anchorMap[(raw2 || '').toLowerCase()] || S.anchorMap[githubSlug(raw2)]) : null;
              items.push(nm ? ('<w:hyperlink w:anchor="' + nm + '" w:history="1">' + inner.join('') + '</w:hyperlink>') : inner.join(''));
            } else {
              S.hl++;
              const rid = 'rId' + (300 + S.hl);
              S.rels.push({ id: rid, type: 'hyperlink', target: href, external: true });
              items.push('<w:hyperlink r:id="' + rid + '" w:history="1">' + inner.join('') + '</w:hyperlink>');
            }
          }
        }
        else if (tag === 'span' && ((n.className || '').indexOf('language-math') !== -1)) {
          const tex = n.textContent || '';
          const omml = mathToOoml(tex, false);
          if (omml != null) items.push('<m:oMath>' + omml + '</m:oMath>');
          else items.push.apply(items, runsOf(n, ctx, S));
        }
        else if (tag === 'img') {
          const flow = imgFlowEl(n, S);
          if (flow) items.push(flow);
        }
        else if (tag === 'input') { /* checkbox inputs handled at list level; skip */ }
        else { items.push.apply(items, runsOf(n, Object.assign({}, ctx, styleCtxFromEl(n)), S)); }
      }
    }
    return items;
  }

  // ================= OOXML part templates =================
  function contentTypesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="gif" ContentType="image/gif"/>' +
      '<Default Extension="webp" ContentType="image/webp"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
      '</Types>';
  }

  function rootRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';
  }

  function documentXml(body) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';
  }

  function headingStyle(lvl, sz, S) {
    const f = S.baseFont, ea = eastAsiaFor(f);
    return '<w:style w:type="paragraph" w:styleId="Heading' + lvl + '">' +
      '<w:name w:val="heading ' + lvl + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
      '<w:pPr><w:keepNext/><w:keepLines/>' +
      '<w:spacing w:before="' + (lvl <= 2 ? 240 : 160) + '" w:after="' + (lvl <= 2 ? 120 : 80) + '"/>' +
      '<w:outlineLvl w:val="' + (lvl - 1) + '"/></w:pPr>' +
      '<w:rPr><w:rFonts w:ascii="' + esc(f) + '" w:eastAsia="' + esc(ea) + '" w:hAnsi="' + esc(f) + '"/>' +
      '<w:b/><w:bCs/><w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/></w:rPr></w:style>';
  }

  function stylesXml(S) {
    const f = S.baseFont, ea = eastAsiaFor(f), sz = S.baseSize;
    let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="' + esc(f) + '" w:eastAsia="' + esc(ea) + '" w:hAnsi="' + esc(f) + '" w:cs="' + esc(f) + '"/>' +
      '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/>' +
      '<w:lang w:val="en-US" w:eastAsia="zh-CN" w:bidi="ar-SA"/>' +
      '</w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
      '</w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>';
    const hsizes = [32, 28, 26, 24, 22, 20];
    for (let l = 1; l <= 6; l++) s += headingStyle(l, hsizes[l - 1], S);
    s += '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>';
    s += '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>';
    s += '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>';
    s += '</w:styles>';
    return s;
  }

  function settingsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/>' +
      '<w:characterSpacingControl w:val="compressPunctuation"/>' +
      '</w:settings>';
  }

  function numberingXml() {
    function lvlBullet(ilvl) {
      const chars = ['\u2022', '\u25E6', '\u25AA'];
      const c = chars[ilvl % chars.length];
      return '<w:lvl w:ilvl="' + ilvl + '"><w:start w:val="1"/><w:numFmt w:val="bullet"/>' +
        '<w:lvlText w:val="' + esc(c) + '"/><w:lvlJc w:val="start"/>' +
        '<w:pPr><w:ind w:left="' + (720 + ilvl * 360) + '" w:hanging="360"/></w:pPr></w:lvl>';
    }
    function lvlDec(ilvl) {
      return '<w:lvl w:ilvl="' + ilvl + '"><w:start w:val="1"/><w:numFmt w:val="decimal"/>' +
        '<w:lvlText w:val="%' + (ilvl + 1) + '."/><w:lvlJc w:val="start"/>' +
        '<w:pPr><w:ind w:left="' + (720 + ilvl * 360) + '" w:hanging="360"/></w:pPr></w:lvl>';
    }
    function lvlTask(ch) {
      return '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/>' +
        '<w:lvlText w:val="' + ch + '"/><w:lvlJc w:val="start"/>' +
        '<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>' +
        '<w:rPr><w:rFonts w:ascii="Wingdings" w:cs="Wingdings" w:eastAsia="Wingdings" w:hAnsi="Wingdings"/></w:rPr></w:lvl>';
    }
    let b = '', d = '';
    for (let i = 0; i < 9; i++) { b += lvlBullet(i); d += lvlDec(i); }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' + b + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>' + d + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>' + lvlTask('o') + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="3"><w:multiLevelType w:val="hybridMultilevel"/>' + lvlTask('¨') + '</w:abstractNum>' +
      '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
      '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>' +
      '<w:num w:numId="3"><w:abstractNumId w:val="2"/></w:num>' +
      '<w:num w:numId="4"><w:abstractNumId w:val="3"/></w:num>' +
      '</w:numbering>';
  }

  function fontTableXml(S) {
    const fonts = [S.baseFont, eastAsiaFor(S.baseFont), S.codeFont, 'Wingdings'];
    const uniq = [];
    for (const f of fonts) if (f && uniq.indexOf(f) < 0) uniq.push(f);
    let r = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">';
    for (const f of uniq) {
      r += '<w:font w:name="' + esc(f) + '"><w:charset w:val="86"/><w:family w:val="auto"/></w:font>';
    }
    r += '</w:fonts>';
    return r;
  }

  function docRelsXml(S) {
    let r = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>' +
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>';
    for (const rel of S.rels) {
      const ext = rel.external ? ' TargetMode="External"' : '';
      r += '<Relationship Id="' + rel.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + rel.type +
        '" Target="' + esc(rel.target) + '"' + ext + '/>';
    }
    r += '</Relationships>';
    return r;
  }

  window.MsDocx = { buildParts: buildParts, __convMath: convMath, __mathToOoml: mathToOoml, __resolve: resolveDocPath };
})();
