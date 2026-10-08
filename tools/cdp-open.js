(async () => {
  // 测试文件路径——请改成你本地任意一个 .md 文件（需含表格，用于验证分块渲染）
  const p = String.raw`C:\path\to\your\test-table.md`;
  await openPath(p);
  await new Promise(r => setTimeout(r, 1200));
  return {
    docPath: state.docPath,
    len: state.vditor.getValue().length,
    tables: document.querySelectorAll('.vditor-ir .vditor-reset table').length,
    lines: document.querySelectorAll('#line-gutter-inner .ln').length
  };
})()
