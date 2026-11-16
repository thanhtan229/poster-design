<template>
 <section class="custom-templates">
  <CutoutReview ref="review" @confirm="confirmCutout" @closed="cancelCutout" />
  <el-dialog v-model="alignOpen" title="Căn ảnh" width="480px" append-to-body :close-on-click-modal="false" :close-on-press-escape="false" :show-close="false" @opened="measurePreview" @closed="alignClosed">
   <p>{{ alignWidget?.name }} · Kéo ảnh để căn vị trí</p>
   <div v-if="alignWidget" class="align-stage" :style="{aspectRatio:isSubject?'1':`${alignBox.width} / ${alignBox.height}`,width:isSubject?'min(100%, 320px)':`min(100%, 320px, ${320*alignBox.width/alignBox.height}px)`}" @pointerdown="startAlign" @pointermove="moveAlign" @pointerup="stopAlign" @pointercancel="stopAlign">
    <div class="preview-world" :style="{width:alignBox.width+'px',height:alignBox.height+'px',transform:`translate(${view.x}px,${view.y}px) scale(${view.scale})`}">
     <div v-if="isSubject" class="original-frame" :style="{width:alignBox.width+'px',height:alignBox.height+'px'}" />
     <div class="preview-frame" :style="{left:previewImage.left+'px',top:previewImage.top+'px',width:previewImage.width+'px',height:previewImage.height+'px',opacity:previewImage.opacity,...imageFrameStyle(previewImage)}">
      <ImageSurface :image="previewImage" :src="previewImage.imgUrl" />
     </div>
    </div>
   </div>
   <label>Phóng to / thu nhỏ {{ alignScale.toFixed(2) }}× <input v-model.number="alignScale" type="range" :min="alignWidget?.templateRole==='subject' ? 0.5 : 1" max="3" step="0.01" /></label>
   <p v-if="isSubject">Khung nét đứt là vị trí ban đầu. Góc nhìn tự thu vừa để thấy trọn chủ thể; kích thước in do thanh tỷ lệ quyết định.</p>
   <button @click="resetAlign">Đặt lại</button>
   <template #footer><el-button @click="finishAlign(false)">Hủy tạo đơn</el-button><el-button type="primary" @click="finishAlign(true)">Dùng ảnh này</el-button></template>
  </el-dialog>
  <el-dialog v-model="fullOpen" title="Xem thành phẩm trước khi lưu đơn" width="800px" append-to-body :show-close="false" :close-on-click-modal="false" :close-on-press-escape="false">
   <p v-if="fullLoading">Đang dựng ảnh thành phẩm…</p>
   <p v-if="fullError" role="alert">{{ fullError }}</p>
   <img v-if="fullUrl" :src="fullUrl" style="display:block;width:100%;max-height:65vh;object-fit:contain" @load="fullLoading=false" @error="fullError='Không tải được ảnh thành phẩm';fullLoading=false" />
   <button v-for="w in fullSlots" :key="w.uuid" :disabled="fullLoading" @click="reAlign(w)">Căn lại {{ w.name }}</button>
   <template #footer><el-button :disabled="fullLoading" @click="finishFull(false)">Hủy tạo đơn</el-button><el-button type="primary" :disabled="fullLoading||!!fullError||!fullUrl" @click="finishFull(true)">Lưu đơn với bố cục này</el-button></template>
  </el-dialog>
  <h3>Mẫu cắt dán của tôi</h3>
  <button @click="editCurrent">Lưu trang hiện tại thành mẫu</button>
  <button @click="load">Làm mới mẫu</button>
  <p role="status">{{ message }}</p>
  <div v-for="t in templates" :key="t.id" class="template-row"><b>{{ t.name }}</b> · {{ t.category||'Chưa phân nhóm' }} · v{{ t.version }}<br/><button @click="useTemplate(t)">Tạo đơn khách</button><button @click="editCurrent(t)">Lưu trang thành phiên bản mới</button><button @click="editCurrent(t,true)">Nhân bản từ trang</button></div>
  <el-dialog v-model="editing" title="Lưu mẫu cắt dán" width="700px" append-to-body>
   <label>Tên mẫu <input v-model="name" maxlength="100" /></label><label>Nhóm <input v-model="category" maxlength="100" /></label>
   <p>Chọn lớp cần thay cho khách. Các lớp còn lại và cách in nền/cắt nổi được giữ trong mẫu.</p>
   <div v-for="w in candidateLayers" :key="w.uuid" class="slot"><span>{{ w.name||w.type }}</span><select v-model="roles[w.uuid]"><option value="fixed">Cố định</option><option v-if="w.type==='w-image' && !w.linkedPhotoId" value="photo">Ảnh giữ nền</option><option v-if="w.type==='w-image' && !w.linkedPhotoId" value="subject">Chủ thể tách nền</option><option v-if="w.type==='w-text'" value="text">Chữ thay thế</option></select><label v-if="roles[w.uuid]==='subject'">Điểm tựa <select v-model="anchors[w.uuid]"><option value="bottom">Chân</option><option value="center">Tâm</option></select></label></div>
   <template #footer><el-button @click="editing=false">Hủy</el-button><el-button type="primary" :loading="busy" @click="saveTemplate">Lưu mẫu</el-button></template>
  </el-dialog>
  <el-dialog v-model="creating" class="custom-template-order" title="Tạo đơn khách từ mẫu" width="700px" append-to-body :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy">
   <label>Tên khách / mã đơn <input v-model="customer" /></label>
   <div v-for="slot in slots" :key="slot.uuid" class="slot"><label>{{ slot.name||slot.type }} <input v-if="slot.templateRole==='photo'||slot.templateRole==='subject'" type="file" accept="image/*" @change="setFile(slot.uuid,$event)"/><input v-else v-model="texts[slot.uuid]" /></label></div>
   <p>Chủ thể được tách nền local và xem lại viền trước khi tạo đơn. Ảnh giữ nền được đặt vào khung.</p><p role="alert">{{ orderError }}</p>
   <p v-if="created"><a :href="created" target="_blank" rel="noopener">Mở thiết kế khách mới</a></p>
   <template #footer><el-button :disabled="busy" @click="creating=false">Đóng</el-button><el-button type="primary" :loading="busy" @click="createOrder">Tạo đơn riêng</el-button></template>
  </el-dialog>
 </section>
</template>
<script setup lang="ts">
import {ref,computed,onMounted} from 'vue'
import {useWidgetStore,useCanvasStore} from '@/store'
import api from '@/api'
import config from '@/config'
import {uploadCollagePhoto,extractCollageSubject,prepareEditedSubject} from '@/utils/tinix/collage'
import CutoutReview from './CutoutReview.vue'
import {nanoid} from 'nanoid'
import {syncLinkedImages, imageFrameStyle} from '@/utils/tinix/image-effects'

import ImageSurface from '@/components/modules/widgets/wImage/ImageSurface.vue'
import {loadLibraryFont} from '@/utils/tinix/font-loader'
import {expandScrapbookNames} from '../../../../shared/scrapbook-name.mjs'
const store=useWidgetStore(); const canvas=useCanvasStore(); const templates=ref<any[]>([]); const message=ref(''); const editing=ref(false); const creating=ref(false); const busy=ref(false); const name=ref(''); const category=ref(''); const customer=ref(''); const created=ref('')
const roles=ref<Record<string,string>>({}); const anchors=ref<Record<string,string>>({}); const texts=ref<Record<string,string>>({}); const files=ref<Record<string,File>>({}); const current=ref<any>(null); const chosen=ref<any>(null)
const candidateLayers=computed(()=>(store.dWidgets as any[]).filter(w=>!w.hidden&&(w.type==='w-image'||w.type==='w-text')))
const slots=computed(()=>chosen.value?.data?.layers.filter((w:any)=>w.templateRole==='photo'||w.templateRole==='subject'||w.templateRole==='text')||[])
async function load(){try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates`);if(!r.ok)throw new Error('Không tải được mẫu');templates.value=(await r.json()).list}catch(e:any){message.value=e.message}}
function editCurrent(t?:any,duplicate=false){current.value=duplicate?null:t||null;name.value=t?.name||'';category.value=t?.category||'';roles.value=Object.fromEntries(candidateLayers.value.map(w=>[w.uuid,w.templateRole||'fixed']));anchors.value=Object.fromEntries(candidateLayers.value.map(w=>[w.uuid,w.templateAnchor||'bottom']));editing.value=true}
async function saveTemplate(){busy.value=true;try{const layers=JSON.parse(JSON.stringify(store.dWidgets));for(const w of layers){w.templateRole=roles.value[w.uuid]||'fixed';if(w.templateRole==='subject')w.templateAnchor=anchors.value[w.uuid]||'bottom'}const layout={global:JSON.parse(JSON.stringify(canvas.dPage)),layers};const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:current.value?.id,version:current.value?.version,name:name.value,category:category.value,layout})});const data=await r.json();if(!r.ok)throw new Error(data.message);editing.value=false;message.value='Đã lưu mẫu phiên bản '+data.version;await load()}catch(e:any){message.value=e.message}finally{busy.value=false}}
function useTemplate(t:any){chosen.value=t;customer.value='';created.value='';files.value={};texts.value=Object.fromEntries(t.data.layers.filter((w:any)=>w.templateRole==='text').map((w:any)=>[w.uuid,w.text||'']));creating.value=true}
function setFile(id:string,e:Event){const f=(e.target as HTMLInputElement).files?.[0];if(f)files.value[id]=f;else delete files.value[id]}
const alignOpen=ref(false); const alignWidget=ref<any>(null); const alignBox=ref({width:1,height:1}); const alignScale=ref(1); const alignX=ref(50); const alignY=ref(50); const subjectX=ref(0); const subjectY=ref(0)
const previewScale=ref(1)
const isSubject=computed(()=>alignWidget.value?.templateRole==='subject')
let alignInitial:any=null; let alignResolve:((ok:boolean)=>void)|null=null; let alignResult=false; let drag:any=null
function withScale(transform:string,scale:number){return /scale\([^)]*\)/.test(transform||'')?transform.replace(/scale\([^)]*\)/,`scale(${scale})`):`${transform||''} scale(${scale})`.trim()}
const previewImage=computed(()=>{
 const w=alignWidget.value||{}; const b=alignBox.value; const f=w.templateAnchor==='center'?.5:1; const z=alignScale.value
 return isSubject.value ? {...w,left:b.width*((1-z)/2+subjectX.value/100),top:b.height*((1-z)*f+subjectY.value/100),width:b.width*z,height:b.height*z} : {...w,left:0,top:0,cropX:alignX.value,cropY:alignY.value,zoom:z,transform:withScale(w.transform||'',z)}
})
const view=computed(()=>{
 if(!isSubject.value)return {scale:previewScale.value,x:0,y:0}
 const b=alignBox.value; const w=previewImage.value; const pad=Math.max(b.width,b.height)*.08
 const left=Math.min(0,w.left)-pad; const top=Math.min(0,w.top)-pad; const right=Math.max(b.width,w.left+w.width)+pad; const bottom=Math.max(b.height,w.top+w.height)+pad
 const size=previewScale.value*b.width; const scale=size/Math.max(right-left,bottom-top)
 return {scale,x:(size-(right-left)*scale)/2-left*scale,y:(size-(bottom-top)*scale)/2-top*scale}
})
function resetAlign(){alignScale.value=alignInitial.scale;alignX.value=alignInitial.x;alignY.value=alignInitial.y;subjectX.value=0;subjectY.value=0}
function startAlign(e:PointerEvent){if(!alignWidget.value)return;const el=e.currentTarget as HTMLElement;el.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,cropX:alignX.value,cropY:alignY.value,subjectX:subjectX.value,subjectY:subjectY.value,width:el.clientWidth,height:el.clientHeight,scale:view.value.scale}}
function moveAlign(e:PointerEvent){if(!drag||!alignWidget.value)return;const dx=e.clientX-drag.x; const dy=e.clientY-drag.y;if(alignWidget.value.templateRole==='subject'){subjectX.value=drag.subjectX+dx/drag.scale/alignBox.value.width*100;subjectY.value=drag.subjectY+dy/drag.scale/alignBox.value.height*100;return}const img=document.querySelector('.preview-frame .target') as HTMLImageElement|null;if(!img?.naturalWidth||!img.naturalHeight)return;const w=drag.width; const h=drag.height; const f=Math.max(w/img.naturalWidth,h/img.naturalHeight); const z=alignScale.value; const ex=Math.max(0,img.naturalWidth*f-w+w*(1-1/z)); const ey=Math.max(0,img.naturalHeight*f-h+h*(1-1/z));alignX.value=Math.max(0,Math.min(100,drag.cropX-dx*100/(z*(ex||Infinity))));alignY.value=Math.max(0,Math.min(100,drag.cropY-dy*100/(z*(ey||Infinity))))}
function stopAlign(){drag=null}
function measurePreview(){const stage=document.querySelector('.align-stage') as HTMLElement|null;if(stage&&alignBox.value.width)previewScale.value=stage.clientWidth/alignBox.value.width}
function alignSlot(w:any){alignWidget.value=w;alignBox.value={width:w.width,height:w.height};alignInitial={left:w.left,top:w.top,width:w.width,height:w.height,scale:w.templateRole==='subject'?1:Number(w.zoom)||1,x:w.cropX??50,y:w.cropY??50};resetAlign();alignOpen.value=true;return new Promise<boolean>(resolve=>{alignResolve=resolve})}
function finishAlign(ok:boolean){if(ok){const w=alignWidget.value;if(w.templateRole==='subject'){const f=w.templateAnchor==='center'?.5:1;w.width=alignInitial.width*alignScale.value;w.height=alignInitial.height*alignScale.value;w.left=alignInitial.left+(alignInitial.width-w.width)/2+subjectX.value*alignInitial.width/100;w.top=alignInitial.top+(alignInitial.height-w.height)*f+subjectY.value*alignInitial.height/100}else{w.zoom=alignScale.value;w.cropX=alignX.value;w.cropY=alignY.value;w.transform=withScale(w.transform||'',alignScale.value)}}alignResult=ok;alignOpen.value=false}
function alignClosed(){const resolve=alignResolve;alignResolve=null;resolve?.(alignResult)}
const review=ref<InstanceType<typeof CutoutReview>>(); const orderError=ref('')
let resolveReview:((v:{blob:Blob;mm:number})=>void)|null=null; let rejectReview:((e:Error)=>void)|null=null; let reviewResult:{blob:Blob;mm:number}|null=null
function confirmCutout(value:{blob:Blob;mm:number}){reviewResult=value}
function cancelCutout(){const done=resolveReview; const cancel=rejectReview; const result=reviewResult;resolveReview=null;rejectReview=null;reviewResult=null;if(result)done?.(result);else cancel?.(new Error('Đã hủy duyệt ảnh chủ thể'))}
async function reviewSubject(file:File,w:any,dpi:number){
 const raw=await extractCollageSubject(file,s=>{orderError.value=s})
 const pending=new Promise<{blob:Blob;mm:number}>((resolve,reject)=>{resolveReview=resolve;rejectReview=reject})
 try{await review.value!.show(file,raw,w.cutoutEdit?.mm??0,undefined,dpi,{width:w.width,height:w.height})}catch(e){resolveReview=null;rejectReview=null;throw e}
 return pending
}
async function fitReplacementText(w:any,value:string){
 w.text=value
 if(!value||!w.width||!w.height)return
 await loadLibraryFont(w.fontClass)
 const context=document.createElement('canvas').getContext('2d')!
 const maxSize=Number(w.fontSize); const lineHeight=Number(w.lineHeight)||1.2; const spacing=Number(w.letterSpacing)||0
 const padding=Math.max(0,Math.min(.4,Number(w.templateTextPadding)||0)); const boxWidth=Number(w.width); const boxHeight=Number(w.height); const boxTop=Number(w.top)
 const lines=value.split(/\r?\n/)
 const fits=(size:number)=>{context.font=`${w.fontStyle||'normal'} ${w.fontWeight||'normal'} ${size}px "${w.fontClass.value}"`;return lines.length*size*lineHeight<=boxHeight*(1-2*padding)&&lines.every(line=>context.measureText(line).width+Math.max(0,line.length-1)*size*spacing/100<=boxWidth*(1-2*padding)-4)}
 let lo=1; let hi=maxSize;for(let i=0;i<20;i++){const mid=(lo+hi)/2;if(fits(mid))lo=mid;else hi=mid}w.fontSize=Math.floor(lo*100)/100
 if(w.templateTextCenterVertical){const textHeight=Math.min(boxHeight,lines.length*w.fontSize*lineHeight+Math.max(12,w.fontSize*.2));w.top=boxTop+(boxHeight-textHeight)/2;w.height=textHeight}
}
function remapLayout(layout:any){
 const ids=new Map<string,string>(); const groups=new Map<string,string>()
 for(const w of layout.layers){const old=String(w.uuid);if(ids.has(old))throw new Error('Mẫu có ID lớp trùng nhau');ids.set(old,nanoid())}
 for(const w of layout.layers)if(w.scrapbookNameSource)w.scrapbookNameSource=ids.get(String(w.scrapbookNameSource))
 for(const w of layout.layers){const old=String(w.uuid);w.uuid=ids.get(old);if(w.parent&&w.parent!=='-1'){if(!ids.has(String(w.parent)))throw new Error('Mẫu có nhóm cha bị thiếu');w.parent=ids.get(String(w.parent))}if(w.linkedPhotoId){if(!ids.has(String(w.linkedPhotoId)))throw new Error('Mẫu có ảnh liên kết bị thiếu');w.linkedPhotoId=ids.get(String(w.linkedPhotoId))}if(w.printGroup){const oldGroup=String(w.printGroup);if(!groups.has(oldGroup))groups.set(oldGroup,nanoid());w.printGroup=groups.get(oldGroup)}}
 return ids
}
const fullOpen=ref(false); const fullLoading=ref(false); const fullError=ref(''); const fullUrl=ref(''); const fullLayout=ref<any>(null)
const fullSlots=computed(()=>fullLayout.value?.layers.filter((w:any)=>['photo','subject'].includes(w.templateRole))||[])
let fullJob=''; let fullResolve:((ok:boolean)=>void)|null=null
async function releaseFull(){if(fullJob){const id=fullJob;fullJob='';await fetch(`${config.SCREEN_URL}/api/tinix/collage-print/${id}`,{method:'DELETE'})}}
async function refreshFull(){fullLoading.value=true;fullError.value='';fullUrl.value='';try{await releaseFull();syncLinkedImages(fullLayout.value.layers);const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({layout:fullLayout.value})});const data=await r.json();if(!r.ok)throw new Error(data.message);fullJob=data.id;fullUrl.value=`${config.SCREEN_URL}/api/tinix/collage-print/${data.id}/image/0`}catch(e:any){fullError.value=e.message;fullLoading.value=false}}
async function reAlign(w:any){if(await alignSlot(w))await refreshFull()}
function finishFull(ok:boolean){fullOpen.value=false;void releaseFull();const resolve=fullResolve;fullResolve=null;resolve?.(ok)}
function reviewFull(layout:any){fullLayout.value=layout;fullOpen.value=true;const pending=new Promise<boolean>(resolve=>{fullResolve=resolve});void refreshFull();return pending}
async function createOrder(){
 if(!customer.value.trim()){orderError.value='Nhập tên khách';return}
 for(const slot of slots.value)if((slot.templateRole==='photo'||slot.templateRole==='subject')&&!files.value[slot.uuid]){orderError.value='Chọn ảnh cho '+(slot.name||'vị trí ảnh');return}
 busy.value=true;created.value='';orderError.value=''
 try{
  const layout=JSON.parse(JSON.stringify(chosen.value.data)); const dpi=Number(layout.global.dpi)||300
  for(const w of layout.layers){
   if(w.templateRole==='photo'){const p=await uploadCollagePhoto(files.value[w.uuid],files.value[w.uuid].name);w.imgUrl=p.url;delete w.origin;delete w.cutoutEdit;delete w.cutoutBorderUrl}
   else if(w.templateRole==='subject'){
    if(w.linkedPhotoId)throw new Error('Chủ thể không thể là ảnh nền liên kết')
    const file=files.value[w.uuid]; const result=await reviewSubject(file,w,dpi)
    orderError.value='Đang lưu ảnh và viền…'
    const p=await prepareEditedSubject(file,result.blob,result.mm,undefined,dpi,{width:w.width,height:w.height})
    const width=p.width*p.documentScale!; const height=p.height*p.documentScale!
    w.left+=(w.width-width)/2;w.top+=(w.height-height)*(w.templateAnchor==='center'?.5:1);w.width=width;w.height=height
    w.imgUrl=p.url;w.cutoutBorderUrl=p.borderUrl;w.cutoutEdit=p.edit;delete w.origin
   }else if(w.templateRole==='text'){if(w.scrapbookName)w.text=texts.value[w.uuid]||'';else await fitReplacementText(w,texts.value[w.uuid]||'')}
   if(w.templateRole==='photo'||w.templateRole==='subject'){if(!await alignSlot(w))throw new Error('Đã hủy căn ảnh')}
  }
  expandScrapbookNames(layout)
  syncLinkedImages(layout.layers)
  if(!await reviewFull(layout))throw new Error('Đã hủy duyệt bố cục')
  remapLayout(layout);syncLinkedImages(layout.layers)
  layout.global.collage={template:'custom-'+chosen.value.id,version:chosen.value.version,customer:customer.value.trim(),printWorkflow:'separate-sheets'}
  const r:any=await api.home.saveWorks({title:customer.value.trim()+' — '+chosen.value.name,data:JSON.stringify([layout]),width:layout.global.width,height:layout.global.height})
  if(!r?.id)throw new Error(r?.msg||'Không lưu được đơn')
  created.value='/home?id='+r.id;message.value='Đã tạo đơn độc lập';orderError.value=''
 }catch(e:any){orderError.value=e.message;message.value=e.message}finally{busy.value=false}
}
onMounted(load)
</script>
<style scoped>.custom-templates{padding:10px;background:#f4f7fa;margin:12px 0}.template-row,.slot{padding:8px;border-bottom:1px solid #ddd}.slot{display:flex;justify-content:space-between;gap:8px}label{display:block;margin:10px 0}button{margin:4px}.align-stage{width:min(100%,320px);max-height:320px;position:relative;overflow:hidden;background:#ddd;touch-action:none;cursor:grab}.preview-world{position:absolute;left:0;top:0;transform-origin:top left}.preview-frame{position:absolute}.preview-border{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.preview-image-box{position:relative;width:100%;height:100%;overflow:hidden}.preview-image-box.mask{-webkit-mask-size:100% 100%;-webkit-mask-position:center}.photo-preview{display:block;width:100%;height:100%;pointer-events:none}</style>

<style scoped>.original-frame{position:absolute;left:0;top:0;outline:3px dashed #2563eb;pointer-events:none}.preview-frame{position:absolute}</style>
