// [TINIX] In thông tin lớp chữ của file PSD (font, cỡ, hệ số phóng, tracking, caps…) để gỡ lỗi nhập PSD.
// Chạy: node scripts/tinix-psd-dump.cjs "psd-test/ten-file.psd"
const PSD = require(require('path').resolve('node_modules/psd.js'))
const file = process.argv[2]
const psd = PSD.fromFile(file); psd.parse()
const doc = psd.tree().export().document
console.log('DOC', doc.width, 'x', doc.height)
const walk = (node) => {
  for (const c of node.children()) {
    if (c.isGroup()) { walk(c); continue }
    const layer = c.layer
    if (!layer.typeTool) continue
    const tt = layer.typeTool(); const ex = c.export()
    const ss = tt.engineData.EngineDict.StyleRun.RunArray.map(r => r.StyleSheet.StyleSheetData)
    const ps = tt.engineData.EngineDict.ParagraphRun.RunArray.map(r => r.ParagraphSheet.Properties)
    const s = ss[0]
    console.log(JSON.stringify({
      name: c.name, visible: ex.visible, box: [ex.left, ex.top, ex.width, ex.height],
      text: ex.text.value.slice(0, 60).replace(/\r/g, '⏎'),
      fonts: tt.fonts(), fontIdx: s.Font, size: s.FontSize, sizes: ex.text.font.sizes,
      tf: tt.transform, tracking: s.Tracking, caps: s.FontCaps, leading: s.Leading, autoLeading: s.AutoLeading,
      align: ex.text.font.alignment, just: ps[0] && ps[0].Justification, faux: [s.FauxBold, s.FauxItalic], runs: ss.length,
      shape: tt.engineData.EngineDict.Rendered?.Shapes?.Children?.[0]?.ShapeType,
    }))
  }
}
walk(psd.tree())
