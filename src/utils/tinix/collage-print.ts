/** Pure production planner shared by editor and server. Coordinates remain document pixels. */
export type PrintUnit={id:string;name:string;raised:boolean;ids:string[];bounds:{x:number;y:number;width:number;height:number}}
const clone=(v:any)=>JSON.parse(JSON.stringify(v))
export function printUnits(layers:any[]):PrintUnit[]{
 const all=new Map(layers.map(w=>[String(w.uuid),w]))
 const visible=layers.filter(w=>{const seen=new Set();while(w&&!seen.has(w.uuid)){if(w.hidden)return false;seen.add(w.uuid);w=all.get(String(w.parent))}return true}),byId=new Map(visible.map(w=>[String(w.uuid),w]))
 const rootOf=(w:any)=>{const seen=new Set();while(w.parent&&byId.has(String(w.parent))&&!seen.has(w.uuid)){seen.add(w.uuid);w=byId.get(String(w.parent))}return w}
 const groups=new Map<string,any[]>()
 for(const w of visible){const root=rootOf(w),key=String(root.printGroup||root.uuid);if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(w)}
 const units:PrintUnit[]=[]
 groups.forEach((members,id)=>{
  const roots=members.filter(w=>!byId.has(String(w.parent))),primary=roots.find(w=>w.printRole)||roots[0]||members[0]
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity
  for(const w of roots){
   const width=Number(w.width)||0,height=Number(w.height)||0,angle=(parseFloat(String(w.rotate||w.degree||0))||0)*Math.PI/180
   // Groups render around top-left; individual images render around their centre.
   const ox=w.isContainer?0:width/2,oy=w.isContainer?0:height/2,c=Math.cos(angle),s=Math.sin(angle)
   const corners=[[0,0],[width,0],[0,height],[width,height]].map(([px,py])=>({x:Number(w.left)+ox+(px-ox)*c-(py-oy)*s,y:Number(w.top)+oy+(px-ox)*s+(py-oy)*c}))
   // Leave room for visible shadows as well as the cut contour.
   const padding=Math.max(0,...members.map(v=>Number(v.effects?.shadow)||0))*2
   x=Math.min(x,...corners.map(p=>p.x-padding));y=Math.min(y,...corners.map(p=>p.y-padding));right=Math.max(right,...corners.map(p=>p.x+padding));bottom=Math.max(bottom,...corners.map(p=>p.y+padding))
  }
  const raised=primary.printRole?primary.printRole==='raised':members.some(w=>w.cutoutEdit||String(w.name).includes('cắt nổi'))
  units.push({id,name:primary.printName||primary.name||'Cụm ảnh',raised,ids:members.map(w=>String(w.uuid)),bounds:{x,y,width:right-x,height:bottom-y}})
 })
 return units
}
export type PrintOptions={paperWidthMm?:number;paperHeightMm?:number;marginMm:number;gapMm:number}
export function planCollagePrint(layout:any,options:PrintOptions){
 const page=layout.global,layers=layout.layers
 if(!page||!Array.isArray(layers)||!Number.isFinite(Number(page.width))||!Number.isFinite(Number(page.height)))throw new Error('Thiết kế không hợp lệ')
 const dpi=Number(page.dpi)||300
 if(page.width<1||page.height<1||page.width>12000||page.height>12000||page.width*page.height>80000000)throw new Error('Kích thước thành phẩm vượt giới hạn xuất')
 if(dpi<36||dpi>1200)throw new Error('DPI không hợp lệ')
 const values=[options.marginMm,options.gapMm]
 if(values.some(v=>!Number.isFinite(v))||options.marginMm<0||options.gapMm<0)throw new Error('Khổ giấy, lề hoặc khoảng cách không hợp lệ')
 const px=(mm:number)=>mm*dpi/25.4,W=Math.round(Number(page.width)),H=Math.round(Number(page.height)),margin=Math.ceil(px(options.marginMm)),gap=Math.ceil(px(options.gapMm))
 if(W>12000||H>12000||W*H>80000000||W-2*margin<=0||H-2*margin<=0)throw new Error('Khổ giấy/lề vượt giới hạn xuất ảnh')
 const units=printUnits(layers),raisedIds=new Set(units.filter(u=>u.raised).flatMap(u=>u.ids))
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
 const items=raised.map(unit=>{const width=Math.ceil(unit.bounds.width),height=Math.ceil(unit.bounds.height)
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Cụm có kích thước không hợp lệ: '+unit.name)
  if(width>W-2*margin||height>H-2*margin)throw new Error(`“${unit.name}” không vừa khổ giấy. Hãy giảm lề hoặc điều chỉnh cụm trong thiết kế; tờ cắt luôn cùng khổ thành phẩm và không tự thu nhỏ.`)
  return {unit,width,height}
 })
 type Rect={x:number;y:number;w:number;h:number}
 function pack(sorted:typeof items,mode:number){
  const free:Rect[][]=[],placed:any[]=[]
  for(const item of sorted){
   const w=item.width+gap,h=item.height+gap
   let best:any=null
    free.forEach((rects,sheet)=>rects.forEach(r=>{if(w<=r.w&&h<=r.h){const short=mode===0?Math.min(r.w-w,r.h-h):mode===1?r.w*r.h-w*h:r.y+h,long=mode===2?r.x:Math.max(r.w-w,r.h-h);if(!best||sheet<best.sheet||sheet===best.sheet&&(short<best.short||short===best.short&&long<best.long))best={sheet,x:r.x,y:r.y,short,long}}}))
   if(!best){best={sheet:free.length,x:margin,y:margin};free.push([{x:margin,y:margin,w:W-2*margin+gap,h:H-2*margin+gap}])}
   const used={x:best.x,y:best.y,w,h},next:Rect[]=[]
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
 const occupied=(c:typeof candidates[number])=>Array.from({length:c.count},(_,sheet)=>{
  const p=c.placed.filter(v=>v.sheet===sheet)
  return Math.max(0,...p.map(v=>v.x+v.width-margin))*Math.max(0,...p.map(v=>v.y+v.height-margin))
 }).reduce((sum,v)=>sum+v,0)
 const selected=candidates.reduce((best,c)=>c.count<best.count||c.count===best.count&&occupied(c)<occupied(best)?c:best)
 const sheets:any[]=Array.from({length:selected.count},()=>({global:{...clone(page),width:W,height:H,backgroundColor:'#ffffff',backgroundImage:'',backgroundGradient:'',collage:undefined},layers:[]})),placements:any[]=[]
 for(const {unit,width,height,x,y,sheet} of selected.placed){
  const ids=new Set(unit.ids),copies=clone(cutLayers.filter((v:any)=>ids.has(String(v.uuid))))
  for(const v of copies){v.left+=x-unit.bounds.x;v.top+=y-unit.bounds.y}
  sheets[sheet].layers.push(...copies);placements.push({unitId:unit.id,sheet,x,y,width,height})
 }
 // Preserve layer stacking order on each sheet even though packing order differs.
 const order=new Map(layers.map((w:any,i:number)=>[String(w.uuid),i]))
 for(const s of sheets)s.layers.sort((a:any,b:any)=>Number(order.get(String(a.uuid)))-Number(order.get(String(b.uuid))))
 return {layouts:[base,...sheets,clone(layout)],names:['01_nen.jpg',...sheets.map((_,i)=>`02_chi_tiet_cat_${String(i+1).padStart(2,'0')}.jpg`),'03_thanh_pham.jpg'],units,placements,dpi}
}
