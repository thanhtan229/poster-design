// Generate editable letter layers from a single customer-name slot.
export function expandScrapbookNames(layout) {
  const sources = layout.layers.filter(w => w.scrapbookName);
  for (const source of sources) {
    layout.layers = layout.layers.filter(w => w.scrapbookNameSource !== source.uuid);
    const chars = Array.from(String(source.text || '').normalize('NFC').trim());
    if (!chars.length) throw new Error('Tên scrapbook không được để trống');
    if (chars.length > 60) throw new Error('Tên scrapbook tối đa 60 ký tự');
    const image = layout.layers.find(w => w.type === 'w-image');
    const rows = chars.length > 14 ? 2 : 1;
    const perRow = Math.ceil(chars.length / rows);
    const height = source.height / rows;
    const cell = Math.min(source.width / perRow, height * .85);
    const colors = ['#dc829d','#eac064','#d793ab','#e5a6b0'];
    for (let i = 0; i < chars.length; i++) {
      if (/\s/.test(chars[i])) continue;
      const row = Math.floor(i / perRow), col = i % perRow;
      const count = Math.min(perRow, chars.length - row * perRow);
      const left = source.left + (source.width - count * cell) / 2 + col * cell;
      const top = source.top + row * height;
      const common = {parent:'-1',printRole:source.printRole,printGroup:source.printGroup,templateRole:'fixed',scrapbookNameSource:source.uuid,opacity:1,rotate:0,degree:0};
      const uuid = suffix => `${source.uuid}-letter-${i}-${suffix}`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="120"><path d="M5 8L92 3 97 112 8 117Z" fill="${colors[i%4]}"/></svg>`;
      layout.layers.push({...image,...common,uuid:uuid('paper'),name:`Giấy chữ ${i+1}`,left,top,width:cell,height:height,fit:'fill',slot:false,zoom:1,transform:'',mask:'',radius:0,imgUrl:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});
      const safe = chars[i].replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      layout.layers.push({...source,...common,scrapbookName:undefined,uuid:uuid('text'),name:`Chữ ${i+1}`,text:safe,left:left+cell*.08,top:top+height*.12,width:cell*.84,height:height*.8,fontSize:Math.min(cell*.85,height*.55),textAlign:'center',color:'#a33c61'});
    }
    source.opacity = 0;
    source.fontSize = 1; // Keep the binding field measurable without overflowing the export DOM.
  }
  return layout;
}
