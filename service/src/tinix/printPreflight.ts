import fs from 'fs'
import path from 'path'
import {filePath} from '../configs'
const sharp=require('sharp')
export type PrintIssue={severity:'error'|'warning';message:string}
/** Inspect actual source assets, not thumbnails. No external URL downloads. */
export async function preflightPrint(layout:any):Promise<PrintIssue[]>{
 const issues:PrintIssue[]=[],page=layout.global,images=new Map<string,any>()
 const dpi=Number(page.dpi)||300
 function local(url:string){const normalized=url.split('?')[0];const marker=normalized.indexOf('/static/');if(marker<0)return null;const relative=decodeURIComponent(normalized.slice(marker+8)),resolved=path.resolve(filePath,relative),root=path.resolve(filePath)+path.sep;if(!resolved.startsWith(root))throw new Error('Đường dẫn tài nguyên không hợp lệ');return resolved}
 const byId=new Map(layout.layers.map((w:any)=>[String(w.uuid),w]))
 const layers=layout.layers.filter((w:any)=>{const seen=new Set();while(w&&!seen.has(w.uuid)){if(w.hidden)return false;seen.add(w.uuid);w=byId.get(String(w.parent))}return true})
 if(page.backgroundImage)layers.push({type:'w-image',name:'Nền trang',left:0,top:0,width:page.width,height:page.height,imgUrl:page.backgroundImage})
 for(const w of layers){
  const label=w.name||'Thành phần'
  if(!Number.isFinite(Number(w.left))||!Number.isFinite(Number(w.top))||!(w.width>0)||!(w.height>0)){issues.push({severity:'error',message:label+': kích thước hoặc vị trí không hợp lệ.'});continue}
  if(w.left<-.5||w.top<-.5||w.left+w.width>page.width+.5||w.top+w.height>page.height+.5)issues.push({severity:'warning',message:label+': vượt mép thành phẩm, hãy kiểm tra phần bị cắt.'})
  if(w.type==='w-text'){
   if((Number(w.fontSize)||0)*72/dpi<8)issues.push({severity:'warning',message:label+': chữ nhỏ hơn 8 pt khi in.'})
   if(w.fontClass?.url){const p=local(w.fontClass.url);if(p&&!fs.existsSync(p))issues.push({severity:'error',message:label+': thiếu tệp font.'})}
  }
  if(w.type!=='w-image')continue
  const url=w.origin&&w.imgUrl===w.origin.proxy?w.origin.original:w.imgUrl
  for(const resource of [url,w.cutoutBorderUrl].filter(Boolean)){
   if(images.has(resource))continue
   try{let input:any;if(resource.startsWith('data:image/')){const comma=resource.indexOf(',');input=resource.slice(0,comma).includes(';base64')?Buffer.from(resource.slice(comma+1),'base64'):Buffer.from(decodeURIComponent(resource.slice(comma+1)))}else{input=local(resource);if(!input){issues.push({severity:'warning',message:label+': tài nguyên ngoài máy, cần kiểm tra ảnh xem trước.'});continue}}
    const meta=await sharp(input).metadata();images.set(resource,meta)
   }catch(_){issues.push({severity:'error',message:label+': không đọc được tài nguyên ảnh.'})}
  }
  const meta=images.get(url)
  if(meta&&meta.format!=='svg'){
   const zoom=Math.max(1,Number(w.zoom)||1)
   const effective=Math.min(meta.width/w.width,meta.height/w.height)*dpi/zoom
   if(effective<150)issues.push({severity:'warning',message:`${label}: độ phân giải hiệu dụng khoảng ${Math.round(effective)} DPI, có thể thiếu nét.`})
  }
  if(w.printRole==='raised'&&Math.min(w.width,w.height)*25.4/dpi<5)issues.push({severity:'warning',message:label+': mảnh nhỏ hơn 5 mm, có thể khó cắt thủ công.'})
 }
 return issues
}
