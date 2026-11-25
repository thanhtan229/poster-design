const assert=require('node:assert/strict')
const {planCollagePrint,printUnits}=require('../src/utils/tinix/collage-print.ts')
const image=(uuid,left,top,width,height,extra={})=>({uuid,type:'w-image',parent:'-1',left,top,width,height,...extra})
const layout={global:{width:1000,height:1000,dpi:254,backgroundColor:'#eee'},layers:[image('bg',0,0,1000,1000,{printRole:'base'}),image('a',100,100,600,600,{printRole:'raised'}),image('b',200,200,600,600,{printRole:'raised'}),image('c',200,200,100,100,{hidden:true,printRole:'raised'})]}
const before=JSON.stringify(layout),options={paperWidthMm:100,paperHeightMm:100,marginMm:10,gapMm:5}
const plan=planCollagePrint(layout,options)
assert.equal(plan.layouts.length,4);assert.equal(plan.names.length,4);assert.equal(plan.layouts[0].layers.filter(w=>!w.hidden).length,1);assert.equal(plan.layouts[3].layers.length,4)
assert.equal(plan.layouts[1].global.width,1000);assert.equal(plan.layouts[1].layers[0].width,600);assert.equal(plan.layouts[2].layers[0].height,600)
for(const sheet of plan.layouts){assert.equal(sheet.global.width,layout.global.width);assert.equal(sheet.global.height,layout.global.height)}
assert.equal(JSON.stringify(layout),before,'Planner must not mutate saved artwork')
assert.throws(()=>planCollagePrint(layout,{...options,marginMm:25}),/không vừa/)
assert.throws(()=>planCollagePrint(layout,{...options,gapMm:-1}),/không hợp lệ/)
const grouped={global:layout.global,layers:[image('frame',100,100,500,500,{printGroup:'photo-1',printRole:'raised'}),image('photo',120,120,460,400,{printGroup:'photo-1',printRole:'raised'}),image('g',0,0,200,200,{type:'w-group',hidden:true}),image('child',0,0,200,200,{parent:'g',printRole:'raised'})]}
assert.equal(printUnits(grouped.layers).length,1);const gp=planCollagePrint(grouped,options);assert.equal(gp.layouts[1].layers.length,2);assert.equal(gp.layouts[1].layers[1].left-gp.layouts[1].layers[0].left,20)
for(let n=1;n<40;n++){
 const data={global:layout.global,layers:Array.from({length:n},(_,i)=>image(String(i),0,0,100+(i*43)%250,100+(i*71)%350,{printRole:'raised'}))}
 const result=planCollagePrint(data,options)
 for(const p of result.placements){assert(p.x>=100&&p.y>=100&&p.x+p.width<=900&&p.y+p.height<=900);for(const q of result.placements)if(p!==q&&p.sheet===q.sheet)assert(p.x+p.width+50<=q.x||q.x+q.width+50<=p.x||p.y+p.height+50<=q.y||q.y+q.height+50<=p.y)}
}
console.log('PASS immutable clean background, full final artwork, size-preserving pagination, group spacing, hidden groups, oversize rejection and 39 packing scenarios')

// Fill the space beside a tall item instead of leaving a shelf-sized void.
const holes={global:{width:1000,height:1000,dpi:254},layers:[image('tall',0,0,400,800,{printRole:'raised'}),image('short1',0,0,350,350,{printRole:'raised'}),image('short2',0,0,350,350,{printRole:'raised'})]}
const filled=planCollagePrint(holes,{marginMm:5,gapMm:5})
assert.equal(filled.layouts.length,3,'All three items should fit one cut sheet')
assert.deepEqual(filled,planCollagePrint(holes,{marginMm:5,gapMm:5}),'Packing must be deterministic')
for(const p of filled.placements)for(const q of filled.placements)if(p!==q)assert(p.x+p.width+50<=q.x||q.x+q.width+50<=p.x||p.y+p.height+50<=q.y||q.y+q.height+50<=p.y)
console.log('PASS free-space reuse, unchanged gap and deterministic export')
// [TINIX] Keep valid previous positions and fall back if they cost an extra sheet.
{
 const opt={marginMm:5,gapMm:5}
 const first=planCollagePrint(holes,opt)
 const resized={...holes,layers:holes.layers.map(w=>w.uuid==='short1'?{...w,width:w.width-20}:w)}
 const stable=planCollagePrint(resized,opt,first.packing)
 const positions=plan=>plan.placements.map(({unitId,sheet,x,y})=>[unitId,sheet,x,y])
 assert.equal(stable.packingMode,'retained')
 assert.deepEqual(positions(stable),positions(first))
 assert.equal(stable.retained,3)
 const split={...first.packing,placements:first.placements.map(p=>p.unitId==='short1'?{...p,sheet:1}:p)}
 assert.equal(planCollagePrint(resized,opt,split).packingMode,'repacked')
 assert.equal(planCollagePrint(resized,opt,split).layouts.length,3)
 assert.equal(planCollagePrint(resized,{...opt,gapMm:6},first.packing).packingMode,'fresh')
 const overlapping={...first.packing,placements:first.placements.map(p=>({...p,x:50,y:50}))}
 const safe=planCollagePrint(resized,opt,overlapping)
 for(const p of safe.placements)for(const q of safe.placements)if(p!==q&&p.sheet===q.sheet)assert(p.x+p.width+50<=q.x||q.x+q.width+50<=p.x||p.y+p.height+50<=q.y||q.y+q.height+50<=p.y)
 console.log('PASS retained sheet positions, changed profile, conflicting input and sheet-count fallback')
}
// [TINIX] A growing piece may move its neighbors while the other sheet stays byte-identical.
{
 const opt={marginMm:5,gapMm:5}
 const start={...holes,layers:[...holes.layers,image('full',0,0,900,900,{printRole:'raised'})]}
 const before=planCollagePrint(start,opt)
 const changed={...start,layers:start.layers.map(w=>w.uuid==='short1'?{...w,height:400}:w)}
 const after=planCollagePrint(changed,opt,before.packing)
 const originalSheet=before.placements.find(p=>p.unitId==='short1').sheet
 assert.equal(after.packingMode,'local')
 assert.equal(after.placements.find(p=>p.unitId==='short1').sheet,originalSheet)
 assert.equal(after.layouts.length,4)
 assert.deepEqual(after.layouts[(1-originalSheet)+1],before.layouts[(1-originalSheet)+1])
 assert(after.placements.some(p=>p.unitId!=='short1'&&p.sheet===originalSheet&&
   before.placements.find(old=>old.unitId===p.unitId).y!==p.y))
 for(const p of after.placements)for(const q of after.placements)if(p!==q&&p.sheet===q.sheet)assert(p.x+p.width+50<=q.x||q.x+q.width+50<=p.x||p.y+p.height+50<=q.y||q.y+q.height+50<=p.y)
 console.log('PASS grown piece stays on original sheet with neighbor changes')
}
// [TINIX] Two grown pieces fit in two old sheets while the third sheet keeps its artwork.
{
 const opt={marginMm:5,gapMm:5}
 const start={global:{width:1000,height:950,dpi:254},layers:Array.from({length:17},(_,i)=>
   image(String(i),10,20,(i*37+117)%300+90,(i*51+69)%350+90,{printRole:'raised'}))}
 const before=planCollagePrint(start,opt)
 const changed={...start,layers:start.layers.map((w,i)=>({...w,width:w.width+(i===3?65:0),height:w.height+(i===4?50:0)}))}
 const after=planCollagePrint(changed,opt,before.packing)
 assert.equal(after.packingMode,'pair')
 assert.equal(after.layouts.length,5)
 assert.equal(after.layouts.slice(1,-1).filter((sheet,i)=>JSON.stringify(sheet)!==JSON.stringify(before.layouts[i+1])).length,2)
 assert.equal(after.placements.length,17)
 for(const p of after.placements){
  assert(p.x>=50&&p.y>=50&&p.x+p.width<=950&&p.y+p.height<=900)
  for(const q of after.placements)if(p!==q&&p.sheet===q.sheet)assert(p.x+p.width+50<=q.x||q.x+q.width+50<=p.x||p.y+p.height+50<=q.y||q.y+q.height+50<=p.y)
 }
 console.log('PASS two-sheet rearrangement keeps one complete sheet and respects the gap')
}

const decorated={global:layout.global,layers:[image('decorated',30,40,200,300,{printRole:'raised',effects:{border:12,shadow:20,brightness:115},cutoutBorderUrl:'/rim.png'})]}
const decoratedBefore=JSON.stringify(decorated),clean=planCollagePrint(decorated,{marginMm:5,gapMm:5})
assert.equal(clean.layouts[1].layers[0].effects.border,0);assert.equal(clean.layouts[1].layers[0].effects.shadow,0);assert.equal(clean.layouts[1].layers[0].effects.brightness,115);assert.equal(clean.layouts[1].layers[0].cutoutBorderUrl,undefined)
assert.equal(clean.placements[0].width,200);assert.equal(clean.placements[0].height,300)
assert.deepEqual(clean.layouts.at(-1),decorated);assert.equal(JSON.stringify(decorated),decoratedBefore)
console.log('PASS cut-only border/shadow removal, original dimensions, other effects and final artwork preserved')

// printInset: phần đệm trong suốt của lớp ảnh (bóng/viền) không tính vào hộp cắt → xếp được nhiều mảnh hơn trên một tờ
{
  const pad=100, visible=300, box=visible+2*pad // mỗi sticker 700×700 nhưng chỉ 500×500 nhìn thấy
  const mk=(inset)=>({global:{width:1000,height:1000,dpi:254,backgroundColor:'#eee'},layers:[image('bg',0,0,1000,1000,{printRole:'base'}),...Array.from({length:4},(_,i)=>image('s'+i,0,0,box,box,{printRole:'raised',...(inset?{printInset:pad}:{})}))]})
  const opt={paperWidthMm:100,paperHeightMm:100,marginMm:5,gapMm:2}
  const padded=planCollagePrint(mk(false),opt), tight=planCollagePrint(mk(true),opt)
  assert.ok(padded.layouts.length>tight.layouts.length,`inset phải giảm số tờ (${padded.layouts.length} → ${tight.layouts.length})`)
  const u=printUnits(mk(true).layers).filter(v=>v.raised)[0]
  assert.equal(Math.round(u.bounds.width),visible,'hộp cắt chỉ gồm phần nhìn thấy'); assert.equal(Math.round(u.bounds.height),visible)
  const again=planCollagePrint(mk(true),opt); assert.deepEqual(again.placements,tight.placements,'kết quả xếp phải lặp lại được (hạt giống cố định)')
  // lớp có printInset phải nằm đúng chỗ: phần nhìn thấy (sau đệm) nằm trong lề
  for(const p of tight.placements){assert.ok(p.x>=Math.ceil(5*254/25.4)-1&&p.y>=Math.ceil(5*254/25.4)-1,'mảnh không vào vùng lề')}
}
// nhiều mảnh: thêm thứ tự thử ngẫu nhiên không bao giờ cho kết quả tệ hơn 12 thứ tự cơ bản và vẫn đủ mảnh, không chồng nhau
{
  const sizes=[[420,260],[300,300],[180,520],[250,250],[350,120],[200,200],[150,330],[400,180],[120,120],[280,140],[220,260],[90,300]]
  const lay={global:{width:1000,height:1000,dpi:254,backgroundColor:'#eee'},layers:[image('bg',0,0,1000,1000,{printRole:'base'}),...sizes.map(([w,h],i)=>image('p'+i,0,0,w,h,{printRole:'raised'}))]}
  const plan=planCollagePrint(lay,{paperWidthMm:100,paperHeightMm:100,marginMm:5,gapMm:2})
  assert.equal(plan.placements.length,sizes.length,'đủ mọi mảnh')
  const gap=Math.ceil(2*254/25.4)
  for(let i=0;i<plan.placements.length;i++)for(let j=i+1;j<plan.placements.length;j++){const a=plan.placements[i],b=plan.placements[j]
   if(a.sheet!==b.sheet)continue
   const apart=a.x+a.width+gap<=b.x||b.x+b.width+gap<=a.x||a.y+a.height+gap<=b.y||b.y+b.height+gap<=a.y
   assert.ok(apart,`mảnh ${i} và ${j} chồng nhau hoặc sát hơn khoảng cách`)}
}
console.log('PASS printInset (hộp cắt chỉ gồm phần nhìn thấy, ít tờ hơn), xếp lặp lại được, nhiều mảnh không chồng nhau')
