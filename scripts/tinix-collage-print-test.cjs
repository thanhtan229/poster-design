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

const decorated={global:layout.global,layers:[image('decorated',30,40,200,300,{printRole:'raised',effects:{border:12,shadow:20,brightness:115},cutoutBorderUrl:'/rim.png'})]}
const decoratedBefore=JSON.stringify(decorated),clean=planCollagePrint(decorated,{marginMm:5,gapMm:5})
assert.equal(clean.layouts[1].layers[0].effects.border,0);assert.equal(clean.layouts[1].layers[0].effects.shadow,0);assert.equal(clean.layouts[1].layers[0].effects.brightness,115);assert.equal(clean.layouts[1].layers[0].cutoutBorderUrl,undefined)
assert.equal(clean.placements[0].width,200);assert.equal(clean.placements[0].height,300)
assert.deepEqual(clean.layouts.at(-1),decorated);assert.equal(JSON.stringify(decorated),decoratedBefore)
console.log('PASS cut-only border/shadow removal, original dimensions, other effects and final artwork preserved')
