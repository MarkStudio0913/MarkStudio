(async () => {
  const out = {};
  state.vditor.setValue('开头**加粗内容**结尾\n');
  await new Promise(r => setTimeout(r, 500));
  const reset = document.querySelector('.vditor-ir .vditor-reset');
  const all = Array.from(reset.querySelectorAll('*'));
  out.markerClassEls = all.filter(e => /marker/i.test(e.className && e.className.baseVal !== undefined ? '' : e.className)).map(e => e.tagName + '.' + e.className).slice(0, 10);
  const p = Array.from(reset.querySelectorAll('p, div')).find(e => e.textContent === '开头加粗内容结尾');
  out.html = p ? p.outerHTML : null;
  out.resetInnerSample = reset.innerHTML.slice(0, 600);
  return out;
})()
