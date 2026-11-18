/** Pure production planner shared by editor and server. Coordinates remain document pixels. */
export type PrintUnit={id:string;name:string;raised:boolean;ids:string[];bounds:{x:number;y:number;width:number;height:number}}
// Giới hạn xuất: khớp MAX_SIDE_PX / MAX_PIXELS ở src/utils/tinix/units.ts. Không import units.ts vì file này dùng chung với server (units.ts kéo theo vue).
const MAX_SIDE=12000
const MAX_PIXELS=100000000
const clone=(v:any)=>JSON.parse(JSON.stringify(v))
export function printUnits(layers:any[]):PrintUnit[]{
 const all=new Map(layers.map(w=>[String(w.uuid),w]))
 const visible=layers.filter(layer=>{let w=layer;const seen=new Set();while(w&&!seen.has(w.uuid)){if(w.hidden)return false;seen.add(w.uuid);w=all.get(String(w.parent))}return true}); const byId=new Map(visible.map(w=>[String(w.uuid),w]))
 const rootOf=(start:any)=>{let w=start;const seen=new Set();while(w.parent&&byId.has(String(w.parent))&&!seen.has(w.uuid)){seen.add(w.uuid);w=byId.get(String(w.parent))}return w}
 const groups=new Map<string,any[]>()
 for(const w of visible){const root=rootOf(w); const key=String(root.printGroup||root.uuid);if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(w)}
 const units:PrintUnit[]=[]
 groups.forEach((members,id)=>{
  const roots=members.filter(w=>!byId.has(String(w.parent))); const primary=roots.find(w=>w.printRole)||roots[0]||members[0]
  let x=Infinity; let y=Infinity; let right=-Infinity; let bottom=-Infinity
  for(const w of roots){
   // printInset: số px đệm TRONG SUỐT ở mỗi cạnh của lớp ảnh (chỗ chứa bóng/viền); hộp cắt chỉ tính phần nhìn thấy để xếp tiết kiệm giấy.
   const inset=w.isContainer?0:Math.max(0,Number(w.printInset)||0); const width=Math.max(1,(Number(w.width)||0)-2*inset); const height=Math.max(1,(Number(w.height)||0)-2*inset); const angle=(parseFloat(String(w.rotate||w.degree||0))||0)*Math.PI/180
   // Groups render around top-left; individual images render around their centre.
   const ox=w.isContainer?0:width/2; const oy=w.isContainer?0:height/2; const c=Math.cos(angle); const s=Math.sin(angle)
   const corners=[[0,0],[width,0],[0,height],[width,height]].map(([px,py])=>({x:Number(w.left)+inset+ox+(px-ox)*c-(py-oy)*s,y:Number(w.top)+inset+oy+(px-ox)*s+(py-oy)*c}))
   // Leave room for visible shadows as well as the cut contour.
   const padding=Math.max(0,...members.map(v=>Number(v.effects?.shadow)||0))*2
   x=Math.min(x,...corners.map(p=>p.x-padding));y=Math.min(y,...corners.map(p=>p.y-padding));right=Math.max(right,...corners.map(p=>p.x+padding));bottom=Math.max(bottom,...corners.map(p=>p.y+padding))
  }
  const raised=primary.printRole?primary.printRole==='raised':members.some(w=>w.cutoutEdit||String(w.name).includes('cắt nổi'))
  units.push({id,name:primary.printName||primary.name||'Cụm ảnh',raised,ids:members.map(w=>String(w.uuid)),bounds:{x,y,width:right-x,height:bottom-y}})
 })
 return units
}
export type PrintOptions={paperWidthMm?:number;paperHeightMm?:number;marginMm:number;gapMm:number;marks?:boolean}
// Dấu căn laser: 3 góc chữ L (trên-trái, trên-phải, dưới-trái) nằm trong vùng lề, cách mép tờ MARK.offsetMm, hai cạnh dài MARK.armMm.
// In lên tờ cắt (JPG) và nằm trong SVG đường cắt: đặt đầu laser lên đỉnh chữ L để căn. Chỉ thêm khi options.marks===true và lề >= MARK.minMarginMm.
export const MARK={offsetMm:3,armMm:5,strokeMm:0.3,minMarginMm:4}
export function markCorners(width:number,height:number,dpi:number){
 const px=dpi/25.4; const o=MARK.offsetMm*px; const a=MARK.armMm*px
 return [{x:o,y:o,dx:1,dy:1,arm:a},{x:width-o,y:o,dx:-1,dy:1,arm:a},{x:o,y:height-o,dx:1,dy:-1,arm:a}]
}
function markLayers(width:number,height:number,dpi:number){
 const stroke=Math.max(2,Math.round(MARK.strokeMm*dpi/25.4))
 return markCorners(width,height,dpi).map((c,i)=>{
  const arm=Math.round(c.arm); const size=arm+stroke
  const vx=c.dx>0?stroke/2:size-stroke/2; const vy=c.dy>0?stroke/2:size-stroke/2 // đỉnh chữ L trong hệ tọa độ của lớp
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path d="M${vx+c.dx*arm} ${vy}H${vx}V${vy+c.dy*arm}" fill="none" stroke="#000" stroke-width="${stroke}"/></svg>`
  const left=Math.round(c.x-vx); const top=Math.round(c.y-vy)
  return {name:'Dấu căn laser '+(i+1),type:'w-image',uuid:'print-mark-'+(i+1),printMark:true,left,top,width:size,height:size,zoom:1,transform:'scale(1)',radius:0,opacity:1,parent:'-1',
   imgUrl:'data:image/svg+xml,'+encodeURIComponent(svg),mask:'',isContainer:false,setting:[],rotate:0,record:{width:size,height:size,minWidth:10,minHeight:10,dir:'all'},lock:true,isNinePatch:false,flip:'',
   sliceData:{ratio:0,left:0},fit:'fill',slot:false,printRole:'raised',degree:0,templateRole:'fixed',cropX:50,cropY:50,effects:{}}
 })
}
export function planCollagePrint(layout:any,options:PrintOptions){
 const page=layout.global; const layers=layout.layers
 if(!page||!Array.isArray(layers)||!Number.isFinite(Number(page.width))||!Number.isFinite(Number(page.height)))throw new Error('Thiết kế không hợp lệ')
 const dpi=Number(page.dpi)||300
 if(page.width<1||page.height<1||page.width>MAX_SIDE||page.height>MAX_SIDE||page.width*page.height>MAX_PIXELS)throw new Error('Kích thước thành phẩm vượt giới hạn xuất')
 if(dpi<36||dpi>1200)throw new Error('DPI không hợp lệ')
 const values=[options.marginMm,options.gapMm]
 if(values.some(v=>!Number.isFinite(v))||options.marginMm<0||options.gapMm<0)throw new Error('Khổ giấy, lề hoặc khoảng cách không hợp lệ')
 const px=(mm:number)=>mm*dpi/25.4; const W=Math.round(Number(page.width)); const H=Math.round(Number(page.height)); const margin=Math.ceil(px(options.marginMm)); const gap=Math.ceil(px(options.gapMm))
 if(W>MAX_SIDE||H>MAX_SIDE||W*H>MAX_PIXELS||W-2*margin<=0||H-2*margin<=0)throw new Error('Khổ giấy/lề vượt giới hạn xuất ảnh')
 const units=printUnits(layers); const raisedIds=new Set(units.filter(u=>u.raised).flatMap(u=>u.ids))
 // Cut sheets are production artwork: omit synthetic outlines and cast shadows.
 // Work on copies so saved designs and approved/final artwork stay intact.
 const cutLayers=clone(layers)
 for(const w of cutLayers){
  if(w.effects)w.effects={...w.effects,border:0,shadow:0}
  delete w.cutoutBorderUrl
 }
 const raised=printUnits(cutLayers).filter(u=>u.raised)
 const base=clone(layout);base.layers=base.layers.filter((w:any)=>!raisedIds.has(String(w.uuid)))
 // Reserve gap to the right/bottom of each rectangle, including at free-space splits.
 const items=raised.map(unit=>{const width=Math.ceil(unit.bounds.width); const height=Math.ceil(unit.bounds.height)
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Cụm có kích thước không hợp lệ: '+unit.name)
  if(width>W-2*margin||height>H-2*margin)throw new Error(`“${unit.name}” không vừa khổ giấy. Hãy giảm lề hoặc điều chỉnh cụm trong thiết kế; tờ cắt luôn cùng khổ thành phẩm và không tự thu nhỏ.`)
  return {unit,width,height}
 })
 type Rect={x:number;y:number;w:number;h:number}
 function pack(sorted:typeof items,mode:number){
  const free:Rect[][]=[]; const placed:any[]=[]
  for(const item of sorted){
   const w=item.width+gap; const h=item.height+gap
   let best:any=null
    free.forEach((rects,sheet)=>rects.forEach(r=>{if(w<=r.w&&h<=r.h){const short=mode===0?Math.min(r.w-w,r.h-h):mode===1?r.w*r.h-w*h:r.y+h; const long=mode===2?r.x:Math.max(r.w-w,r.h-h);if(!best||sheet<best.sheet||sheet===best.sheet&&(short<best.short||short===best.short&&long<best.long))best={sheet,x:r.x,y:r.y,short,long}}}))
   if(!best){best={sheet:free.length,x:margin,y:margin};free.push([{x:margin,y:margin,w:W-2*margin+gap,h:H-2*margin+gap}])}
   const used={x:best.x,y:best.y,w,h}; const next:Rect[]=[]
   for(const r of free[best.sheet]){
    if(used.x>=r.x+r.w||used.x+w<=r.x||used.y>=r.y+r.h||used.y+h<=r.y){next.push(r);continue}
    if(used.x>r.x)next.push({...r,w:used.x-r.x})
    if(used.x+w<r.x+r.w)next.push({...r,x:used.x+w,w:r.x+r.w-used.x-w})
    if(used.y>r.y)next.push({...r,h:used.y-r.y})
    if(used.y+h<r.y+r.h)next.push({...r,y:used.y+h,h:r.y+r.h-used.y-h})
   }
   free[best.sheet]=next.filter((r,i)=>!next.some((q,j)=>i!==j&&q.x<=r.x&&q.y<=r.y&&q.x+q.w>=r.x+r.w&&q.y+q.h>=r.y+r.h&&(j<i||q.x!==r.x||q.y!==r.y||q.w!==r.w||q.h!==r.h)))
   placed.push({...item,x:best.x,y:best.y,sheet:best.sheet})
  }
  return {placed,count:free.length}
 }
 const scores=[(v:typeof items[number])=>v.width*v.height,(v:typeof items[number])=>Math.max(v.width,v.height),(v:typeof items[number])=>v.height,(v:typeof items[number])=>v.width]
 const candidates=scores.flatMap(score=>[0,1,2].map(mode=>pack([...items].sort((a,b)=>score(b)-score(a)),mode)))
 // Thêm các thứ tự xáo trộn (LCG hạt giống cố định): nhiều mảnh thì có thể tiết kiệm thêm một tờ giấy.
 if(items.length>3){let seed=items.length*7919+W; const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296}
  for(let t=0;t<80;t++){const order=[...items].sort((a,b)=>(Math.max(b.width,b.height)*(0.6+0.8*rnd()))-(Math.max(a.width,a.height)*(0.6+0.8*rnd())));candidates.push(pack(order,t%3))}}
 const occupied=(c:typeof candidates[number])=>Array.from({length:c.count},(_,sheet)=>{
  const p=c.placed.filter(v=>v.sheet===sheet)
  return Math.max(0,...p.map(v=>v.x+v.width-margin))*Math.max(0,...p.map(v=>v.y+v.height-margin))
 }).reduce((sum,v)=>sum+v,0)
 const selected=candidates.reduce((best,c)=>c.count<best.count||c.count===best.count&&occupied(c)<occupied(best)?c:best)
 const sheets:any[]=Array.from({length:selected.count},()=>({global:{...clone(page),width:W,height:H,backgroundColor:'#ffffff',backgroundImage:'',backgroundGradient:'',collage:undefined},layers:[]})); const placements:any[]=[]
 for(const {unit,width,height,x,y,sheet} of selected.placed){
  const ids=new Set(unit.ids); const copies=clone(cutLayers.filter((v:any)=>ids.has(String(v.uuid))))
  for(const v of copies){v.left+=x-unit.bounds.x;v.top+=y-unit.bounds.y}
  sheets[sheet].layers.push(...copies);placements.push({unitId:unit.id,sheet,x,y,width,height,cutInset:Math.max(0,...copies.map((v:any)=>Number(v.cutInset)||0))})
 }
 // Preserve layer stacking order on each sheet even though packing order differs.
 const order=new Map(layers.map((w:any,i:number)=>[String(w.uuid),i]))
 for(const s of sheets)s.layers.sort((a:any,b:any)=>Number(order.get(String(a.uuid)))-Number(order.get(String(b.uuid))))
 // Dấu căn laser nằm trong lề, thêm SAU khi sắp lớp; không thuộc mảnh nào nên không vào placements.
 if(options.marks===true&&options.marginMm>=MARK.minMarginMm)for(const s of sheets)s.layers.push(...markLayers(W,H,dpi))
 return {layouts:[base,...sheets,clone(layout)],names:['01_nen.jpg',...sheets.map((_,i)=>`02_chi_tiet_cat_${String(i+1).padStart(2,'0')}.jpg`),'03_thanh_pham.jpg'],units,placements,dpi}
}
