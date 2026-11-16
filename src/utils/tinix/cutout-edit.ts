import { renderSubjectCanvas } from '../../../shared/cutout-render.mjs'
export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve,reject)=>{canvas.toBlob(b=>b?resolve(b):reject(new Error('Không tạo được ảnh')),'image/png')})
}
export function canvasOf(width:number,height:number) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>12000||height>12000||width*height>32000000)throw new Error('Ảnh quá lớn để sửa an toàn. Hãy dùng ảnh dưới 32 triệu pixel và tối đa 12000 px mỗi cạnh.')
  const c=document.createElement('canvas');c.width=width;c.height=height
  c.getContext('2d',{willReadFrequently:true}) // CPU-backed editing avoids large GPU canvas allocations in WebView2.
  return c
}
export function releaseCanvas(c:HTMLCanvasElement|undefined) {if(c){c.width=1;c.height=1}}
/** Source pixels stay untouched. Only the independent alpha mask is edited. */
export function applyMask(source:CanvasImageSource,mask:HTMLCanvasElement) {
  const c=canvasOf(mask.width,mask.height); const ctx=c.getContext('2d')!
  ctx.drawImage(source,0,0,c.width,c.height);ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);return c
}
export function subjectBounds(c:HTMLCanvasElement) {
  const data=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data
  let left=c.width; let top=c.height; let right=-1; let bottom=-1
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(data[(y*c.width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}
  if(right<left)throw new Error('Chủ thể đã bị xóa hết. Hãy hoàn tác hoặc đặt lại.')
  return {left,top,width:right-left+1,height:bottom-top+1}
}
/** 5 mm reserved padding keeps geometry stable when the rim changes (0..5 mm).
 * Actual subject scale in document px defines the mm-to-source-pixel conversion. */
export function renderSubject(c:HTMLCanvasElement,mm:number,documentScale?:number,dpi=300,box={width:620*3543/1800,height:660*2362/1200}) {
  return renderSubjectCanvas(c,mm,documentScale,dpi,box)
}
