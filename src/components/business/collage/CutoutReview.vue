<template>
 <el-dialog v-model="open" title="Kiểm tra và sửa tách nền" width="960px" append-to-body :close-on-click-modal="false" @closed="handleClosed">
  <div class="review-tools">
   <label>Nền kiểm tra <select v-model="background"><option value="#fff">Sáng</option><option value="#20242b">Tối</option><option value="checker">Ô caro</option></select></label>
   <label>Cọ <select v-model="mode"><option value="erase">Xóa</option><option value="keep">Giữ / khôi phục ảnh gốc</option></select></label>
   <label>Cỡ cọ <input v-model.number="brush" type="range" min="2" max="150" /></label>
   <label>Phóng <input v-model.number="zoom" type="range" min="100" max="300" />{{ zoom }}%</label>
   <label>Viền trắng <input v-model.number="mm" type="number" min="0" max="5" step="0.1" /> mm</label>
   <button :disabled="!history.length" @click="undo">Hoàn tác</button><button @click="reset">Đặt lại mặt nạ</button>
  </div>
  <p>Rê cọ trên ảnh để sửa. Cọ Giữ lấy lại chi tiết từ ảnh gốc. Nền kiểm tra không được in. Viền tính theo khổ mẫu 30 × 20 cm.</p>
  <div class="review-stage" :style="{background:background==='checker'?'repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 0 / 24px 24px':background}">
   <canvas ref="preview" :style="{width:(baseWidth*zoom/100)+'px',margin:'0 auto'}" @pointerdown="start" @pointermove="move" @pointerup="stop" @pointercancel="stop" />
  </div>
  <div v-if="rimPreview" :style="{background:background==='checker'?'#aaa':background}"><img :src="rimPreview" alt="Xem trước viền trắng theo mm" style="max-height:100px;max-width:100%" /> Xem trước viền trắng</div>
  <p role="status">{{ error }}</p>
  <template #footer><el-button :disabled="saving" @click="open=false">Hủy</el-button><el-button type="primary" :loading="saving" @click="confirm">Dùng kết quả này</el-button></template>
 </el-dialog>
</template>
<script setup lang="ts">
import { ref,nextTick,watch,onBeforeUnmount } from 'vue'
import {applyMask,canvasBlob,canvasOf,renderSubject,subjectBounds,releaseCanvas} from '@/utils/tinix/cutout-edit'
const emit=defineEmits<{(e:'confirm',value:{blob:Blob;mm:number}):void;(e:'closed'):void}>()
const open=ref(false); const preview=ref<HTMLCanvasElement>(); const background=ref('#20242b'); const mode=ref('erase'); const brush=ref(30); const zoom=ref(100); const mm=ref(0); const saving=ref(false); const error=ref('')
let documentScale:number|undefined; let printDpi=300; let subjectBox:{width:number;height:number}|undefined
let source:ImageBitmap|null=null; let mask:HTMLCanvasElement; let initial:ImageData; let last:{x:number;y:number}|null=null
const history=ref<ImageData[]>([])
const baseWidth=ref(320)
const rimPreview=ref('');let timer:ReturnType<typeof setTimeout>|undefined
function updateRim(){
 if(!source||!mask||!open.value)return
 const ratio=Math.min(1,700/Math.max(mask.width,mask.height))
 const small=canvasOf(Math.max(1,Math.round(mask.width*ratio)),Math.max(1,Math.round(mask.height*ratio)))
 let combined:HTMLCanvasElement|undefined; let r:ReturnType<typeof renderSubject>|undefined
 try{
  small.getContext('2d')!.drawImage(mask,0,0,small.width,small.height)
  combined=applyMask(source,small)
  r=renderSubject(combined,mm.value,documentScale?documentScale/ratio:undefined,printDpi,subjectBox)
  r.rim.getContext('2d')!.drawImage(r.image,0,0)
  const thumb=canvasOf(Math.max(1,Math.round(r.rim.width*100/r.rim.height)),100)
  thumb.getContext('2d')!.drawImage(r.rim,0,0,thumb.width,100);rimPreview.value=thumb.toDataURL('image/png');releaseCanvas(thumb)
 }catch(e:any){error.value=e.message}finally{releaseCanvas(small);releaseCanvas(combined);releaseCanvas(r?.image);releaseCanvas(r?.rim)}
}
function scheduleRim(){clearTimeout(timer);timer=setTimeout(updateRim,180)}
function snapshot(){
 const max=Math.max(1,Math.min(8,Math.floor(64*1024*1024/(mask.width*mask.height*4))))
 while(history.value.length>=max)history.value.shift()
 history.value.push(mask.getContext('2d')!.getImageData(0,0,mask.width,mask.height))
}
watch(mm,scheduleRim)
async function show(original:Blob,cutout:Blob,border=0,scale?:number,dpi=300,box?:{width:number;height:number}){
 subjectBox=box
 printDpi=dpi
 documentScale=scale
 cleanup(); source=await createImageBitmap(original);const image=await createImageBitmap(cutout)
 mask=canvasOf(image.width,image.height);mask.getContext('2d')!.drawImage(image,0,0);image.close()
 initial=mask.getContext('2d')!.getImageData(0,0,mask.width,mask.height);mm.value=border;error.value='';zoom.value=100;open.value=true
 await nextTick();baseWidth.value=Math.min(preview.value?.parentElement?.clientWidth||900,480*mask.width/mask.height);draw();updateRim()
}
function draw(){
 if(!preview.value||!source||!mask)return
 const c=preview.value
 if(c.width!==mask.width||c.height!==mask.height){c.width=mask.width;c.height=mask.height}
 const ctx=c.getContext('2d',{willReadFrequently:true})!
 ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(source,0,0,c.width,c.height)
 ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0);ctx.globalCompositeOperation='source-over'
}
function point(e:PointerEvent){const box=preview.value!.getBoundingClientRect();return {x:(e.clientX-box.left)*mask.width/box.width,y:(e.clientY-box.top)*mask.height/box.height}}
function start(e:PointerEvent){if(saving.value||!source)return;e.preventDefault();preview.value!.setPointerCapture(e.pointerId);snapshot();last=point(e);paint(last,last)}
function paint(a:{x:number;y:number},b:{x:number;y:number}){const c=mask.getContext('2d')!;c.globalCompositeOperation=mode.value==='erase'?'destination-out':'source-over';c.strokeStyle='white';c.lineCap='round';c.lineWidth=brush.value;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x+.01,b.y+.01);c.stroke();draw()}
function move(e:PointerEvent){if(!last)return;const p=point(e);paint(last,p);last=p}
function stop(){last=null;scheduleRim()}
function undo(){const state=history.value.pop();if(state){mask.getContext('2d')!.putImageData(state,0,0);draw();updateRim()}}
function reset(){if(!mask)return;snapshot();mask.getContext('2d')!.putImageData(initial,0,0);draw();updateRim()}
async function confirm(){saving.value=true;error.value='';try{if(!source)return;if(!Number.isFinite(mm.value)||mm.value<0||mm.value>5)throw new Error('Viền phải từ 0 đến 5 mm');const c=applyMask(source,mask);try{subjectBounds(c);emit('confirm',{blob:await canvasBlob(c),mm:mm.value});open.value=false}finally{releaseCanvas(c)}}catch(e:any){error.value=e.message}finally{saving.value=false}}
function cleanup(){clearTimeout(timer);source?.close();source=null;history.value=[];initial=undefined as any;releaseCanvas(mask);releaseCanvas(preview.value);last=null;rimPreview.value=''}
function handleClosed(){cleanup();emit('closed')}
onBeforeUnmount(cleanup)
defineExpose({show})
</script>
<style scoped>
.review-tools{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.review-tools label{display:flex;align-items:center;gap:6px}.review-tools input[type=number]{width:65px}.review-tools input[type=range]{width:90px}.review-stage{height:500px;overflow:auto;border:1px solid #aaa}.review-stage canvas{display:block;height:auto;touch-action:none;cursor:crosshair}p{font-size:13px;line-height:1.5}
</style>
