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
  <div class="tpl-toolbar">
   <el-input v-model="search" :placeholder="$t('tinix.ui.collageTab.search')" clearable class="tpl-search" />
   <el-button @click="load">{{ $t('tinix.ui.collageTab.refresh') }}</el-button>
   <el-button @click="() => editCurrent()">{{ $t('tinix.ui.collageTab.save_current') }}</el-button>
  </div>
  <div class="tpl-cats"><button v-for="c in cats" :key="c" :class="{on:cat===c}" @click="cat=c">{{ c===ALL?$t('tinix.ui.collageTab.all_cats'):c }}</button></div>
  <p v-if="message" role="status" class="tpl-msg">{{ message }}</p>
  <p v-if="!shown.length" class="tpl-empty">{{ $t('tinix.ui.collageTab.empty') }}</p>
  <div class="tpl-grid">
   <article v-for="t in shown" :key="t.id" class="tpl-card">
    <div class="tpl-thumb" @click="useTemplate(t)"><CollagePreview :layout="t.data" /></div>
    <div class="tpl-info"><b :title="t.name">{{ t.name }}</b><small>{{ t.category||$t('tinix.ui.collageTab.no_cat') }} · {{ $t('tinix.ui.collageTab.version',{v:t.version}) }}</small></div>
    <div class="tpl-actions">
     <el-button type="primary" size="small" style="flex:1" @click="useTemplate(t)">{{ $t('tinix.ui.collageTab.use') }}</el-button>
     <el-dropdown trigger="click" @command="(c:string)=>editCurrent(t,c==='dup')">
      <el-button size="small" :title="$t('tinix.ui.collageTab.more')">⋯</el-button>
      <template #dropdown><el-dropdown-menu><el-dropdown-item command="ver">{{ $t('tinix.ui.collageTab.save_new_version') }}</el-dropdown-item><el-dropdown-item command="dup">{{ $t('tinix.ui.collageTab.duplicate') }}</el-dropdown-item></el-dropdown-menu></template>
     </el-dropdown>
    </div>
   </article>
  </div>
  <el-dialog v-model="editing" :title="$t('tinix.ui.collageTab.save_dialog')" width="640px" append-to-body>
   <el-form label-position="top"><el-form-item :label="$t('tinix.ui.collageTab.tpl_name')"><el-input v-model="name" maxlength="100" /></el-form-item><el-form-item :label="$t('tinix.ui.collageTab.tpl_cat')"><el-input v-model="category" maxlength="100" /></el-form-item></el-form>
   <p class="hint">{{ $t('tinix.ui.collageTab.slot_hint') }}</p>
   <div class="slot-list">
    <div v-for="w in candidateLayers" :key="w.uuid" class="slot-row"><span :title="w.name||w.type">{{ w.name||w.type }}</span>
     <el-select v-model="roles[w.uuid]" size="small" style="width:170px"><el-option value="fixed" :label="$t('tinix.ui.collageTab.role_fixed')" /><el-option v-if="w.type==='w-image' && !w.linkedPhotoId" value="photo" :label="$t('tinix.ui.collageTab.role_photo')" /><el-option v-if="w.type==='w-image' && !w.linkedPhotoId" value="subject" :label="$t('tinix.ui.collageTab.role_subject')" /><el-option v-if="w.type==='w-text'" value="text" :label="$t('tinix.ui.collageTab.role_text')" /></el-select>
     <el-select v-if="roles[w.uuid]==='subject'" v-model="anchors[w.uuid]" size="small" style="width:110px" :placeholder="$t('tinix.ui.collageTab.anchor')"><el-option value="bottom" :label="$t('tinix.ui.collageTab.anchor_bottom')" /><el-option value="center" :label="$t('tinix.ui.collageTab.anchor_center')" /></el-select>
    </div>
   </div>
   <template #footer><el-button @click="editing=false">{{ $t('tinix.ui.collageTab.cancel') }}</el-button><el-button type="primary" :loading="busy" @click="saveTemplate">{{ $t('tinix.ui.collageTab.save') }}</el-button></template>
  </el-dialog>
  <el-dialog v-model="creating" class="custom-template-order" :title="$t('tinix.ui.collageTab.order_title',{name:chosen?.name||''})" width="720px" append-to-body :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy">
   <div class="order-body">
    <div class="order-side"><CollagePreview v-if="chosen" :layout="chosen.data" /></div>
    <div class="order-form">
     <el-form label-position="top">
      <el-form-item :label="$t('tinix.ui.collageTab.customer')"><el-input v-model="customer" maxlength="100" :placeholder="$t('tinix.ui.collageTab.customer_ph')" /></el-form-item>
      <el-form-item v-for="(slot,i) in slots" :key="slot.uuid" :label="slotLabel(slot,Number(i))">
       <template v-if="slot.templateRole==='photo'||slot.templateRole==='subject'">
        <div class="photo-pick">
         <img v-if="slotPreview[slot.uuid]" :src="slotPreview[slot.uuid]" alt="" class="photo-thumb" />
         <div v-else class="photo-thumb empty">?</div>
         <div class="photo-btns">
          <el-button size="small" @click="pickFromDisk(slot.uuid)">{{ $t('tinix.ui.collageTab.pick_file') }}</el-button>
          <el-button size="small" @click="openStrip(slot.uuid)">{{ $t('tinix.ui.collageTab.pick_strip') }}</el-button>
          <el-button v-if="files[slot.uuid]" size="small" text @click="clearSlot(slot.uuid)">{{ $t('tinix.ui.collageTab.clear') }}</el-button>
         </div>
        </div>
       </template>
       <el-input v-else v-model="texts[slot.uuid]" />
      </el-form-item>
     </el-form>
     <input ref="diskInput" type="file" accept="image/*" hidden @change="diskPicked" />
     <p class="hint">{{ $t('tinix.ui.collageTab.order_hint') }}</p>
     <el-alert v-if="orderError" :title="orderError" type="warning" show-icon :closable="false" />
     <p v-if="created"><a :href="created" target="_blank" rel="noopener">{{ $t('tinix.ui.collageTab.open_order') }}</a></p>
    </div>
   </div>
   <template #footer><el-button :disabled="busy" @click="creating=false">{{ $t('tinix.ui.collageTab.close') }}</el-button><el-button type="primary" :loading="busy" @click="createOrder">{{ $t('tinix.ui.collageTab.create_order') }}</el-button></template>
  </el-dialog>
  <el-dialog v-model="stripOpen" :title="$t('tinix.ui.collageTab.strip_title')" width="760px" append-to-body>
   <p v-if="!stripList.length" class="hint">{{ $t('tinix.ui.collageTab.strip_empty') }}</p>
   <div class="strip-grid"><button v-for="p in stripList" :key="p.key" :title="p.name" @click="pickStrip(p)"><img :src="p.thumb" alt="" loading="lazy" /></button></div>
  </el-dialog>
 </section>
</template>
<script setup lang="ts">
import {ref,computed,onMounted,onBeforeUnmount} from 'vue'
import i18n from '@/languages'
import {ElForm,ElFormItem,ElDropdown,ElDropdownMenu,ElDropdownItem,ElSelect,ElOption,ElAlert} from 'element-plus'
import CollagePreview from './CollagePreview.vue'
import {reloadPhotos,toStripItems,type StripItem} from '@/utils/tinix/photo-strip'
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
const tt=(k:string,p?:any)=>i18n.global.t('tinix.ui.collageTab.'+k,p) as string
const ALL='__all'; const search=ref(''); const cat=ref(ALL)
const cats=computed(()=>[ALL,...Array.from(new Set(templates.value.map(t=>t.category||tt('no_cat'))))])
const shown=computed(()=>templates.value.filter(t=>(cat.value===ALL||(t.category||tt('no_cat'))===cat.value)&&String(t.name).toLowerCase().includes(search.value.trim().toLowerCase())))
const slotPreview=ref<Record<string,string>>({}); const diskInput=ref<HTMLInputElement>(); const stripOpen=ref(false); const stripList=ref<StripItem[]>([]); let pickingSlot=''
function slotLabel(slot:any,i:number){return slot.templateRole==='text'?(slot.name&&!/^Chữ /.test(slot.name)?slot.name:tt('text_slot')+' '+(i+1)):(slot.templateRole==='subject'?tt('subject_slot'):tt('photo_slot')+' '+(i+1))}
function setSlotFile(id:string,f:File){const old=slotPreview.value[id];if(old)URL.revokeObjectURL(old);files.value[id]=f;slotPreview.value[id]=URL.createObjectURL(f)}
function clearSlot(id:string){const old=slotPreview.value[id];if(old)URL.revokeObjectURL(old);delete slotPreview.value[id];delete files.value[id]}
function pickFromDisk(id:string){pickingSlot=id;diskInput.value!.value='';diskInput.value!.click()}
function diskPicked(e:Event){const f=(e.target as HTMLInputElement).files?.[0];if(f&&pickingSlot)setSlotFile(pickingSlot,f)}
async function openStrip(id:string){pickingSlot=id;stripOpen.value=true;await reloadPhotos();stripList.value=toStripItems()}
async function pickStrip(p:StripItem){try{const r=await fetch(p.hq||p.web);if(!r.ok)throw new Error('Không tải được ảnh');const b=await r.blob();setSlotFile(pickingSlot,new File([b],p.name||'photo.jpg',{type:b.type}));stripOpen.value=false}catch(e:any){orderError.value=e.message}}
onBeforeUnmount(()=>{for(const u of Object.values(slotPreview.value))URL.revokeObjectURL(u)})
const candidateLayers=computed(()=>(store.dWidgets as any[]).filter(w=>!w.hidden&&(w.type==='w-image'||w.type==='w-text')))
const slots=computed(()=>chosen.value?.data?.layers.filter((w:any)=>w.templateRole==='photo'||w.templateRole==='subject'||w.templateRole==='text')||[])
async function load(){try{const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates`);if(!r.ok)throw new Error('Không tải được mẫu');templates.value=(await r.json()).list}catch(e:any){message.value=e.message}}
function editCurrent(t?:any,duplicate=false){current.value=duplicate?null:t||null;name.value=t?.name||'';category.value=t?.category||'';roles.value=Object.fromEntries(candidateLayers.value.map(w=>[w.uuid,w.templateRole||'fixed']));anchors.value=Object.fromEntries(candidateLayers.value.map(w=>[w.uuid,w.templateAnchor||'bottom']));editing.value=true}
async function saveTemplate(){busy.value=true;try{const layers=JSON.parse(JSON.stringify(store.dWidgets));for(const w of layers){w.templateRole=roles.value[w.uuid]||'fixed';if(w.templateRole==='subject')w.templateAnchor=anchors.value[w.uuid]||'bottom'}const layout={global:JSON.parse(JSON.stringify(canvas.dPage)),layers};const r=await fetch(`${config.SCREEN_URL}/api/tinix/collage-templates`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:current.value?.id,version:current.value?.version,name:name.value,category:category.value,layout})});const data=await r.json();if(!r.ok)throw new Error(data.message);editing.value=false;message.value=tt('saved',{v:data.version});await load()}catch(e:any){message.value=e.message}finally{busy.value=false}}
function useTemplate(t:any){chosen.value=t;customer.value='';created.value='';for(const k of Object.keys(slotPreview.value))clearSlot(k);files.value={};orderError.value='';texts.value=Object.fromEntries(t.data.layers.filter((w:any)=>w.templateRole==='text').map((w:any)=>[w.uuid,w.text||'']));creating.value=true}
const alignOpen=ref(false); const alignWidget=ref<any>(null); const alignBox=ref({width:1,height:1}); const alignScale=ref(1); const alignX=ref(50); const alignY=ref(50); const subjectX=ref(0); const subjectY=ref(0)
const previewScale=ref(1); const orderError=ref('')
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
const review=ref<InstanceType<typeof CutoutReview>>()
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
 if(!customer.value.trim()){orderError.value=tt('order_missing_customer');return}
 for(const slot of slots.value)if((slot.templateRole==='photo'||slot.templateRole==='subject')&&!files.value[slot.uuid]){orderError.value=tt('order_missing_photo',{name:slotLabel(slot,slots.value.indexOf(slot))});return}
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
<style scoped>
.custom-templates{padding:4px 0}
.tpl-toolbar{display:flex;gap:8px;flex-wrap:wrap}.tpl-search{flex:1;min-width:140px}
.tpl-cats{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.tpl-cats button{border:1px solid #d9cdbf;background:#fff;border-radius:14px;padding:3px 11px;font-size:12px;cursor:pointer;color:#6b5c52}.tpl-cats button.on{background:#733e43;border-color:#733e43;color:#fff}
.tpl-msg{font-size:12px;color:#246b36}.tpl-empty{color:#999;text-align:center;padding:24px 0;font-size:13px}
.tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:12px}
.tpl-card{background:#fff;border:1px solid #e6dccf;border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
.tpl-thumb{cursor:pointer;background:#f3ece2}.tpl-info{padding:8px 8px 0;display:flex;flex-direction:column;gap:2px;min-height:44px}.tpl-info b{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tpl-info small{font-size:11px;color:#8a7d72}
.tpl-actions{display:flex;gap:6px;padding:8px}
.hint{font-size:12px;color:#8a7d72;line-height:1.5}
.slot-list{max-height:340px;overflow:auto;border:1px solid #eee;border-radius:6px}.slot-row{display:flex;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid #f0f0f0}.slot-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.order-body{display:flex;gap:18px;align-items:flex-start}.order-side{width:200px;flex:none;border:1px solid #e6dccf;border-radius:6px;overflow:hidden}.order-form{flex:1;min-width:0;max-height:60vh;overflow:auto;padding-right:4px}
.photo-pick{display:flex;gap:10px;align-items:center}.photo-thumb{width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #ddd;background:#f6f6f6;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:20px}.photo-btns{display:flex;flex-wrap:wrap;gap:4px}
.strip-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;max-height:460px;overflow:auto}.strip-grid button{border:1px solid #ddd;background:#fff;padding:4px;cursor:pointer;border-radius:6px}.strip-grid img{width:100%;height:110px;object-fit:cover;display:block}
.align-stage{width:min(100%,320px);max-height:320px;position:relative;overflow:hidden;background:#ddd;touch-action:none;cursor:grab}.preview-world{position:absolute;left:0;top:0;transform-origin:top left}.preview-frame{position:absolute}.preview-border{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.preview-image-box{position:relative;width:100%;height:100%;overflow:hidden}.preview-image-box.mask{-webkit-mask-size:100% 100%;-webkit-mask-position:center}.photo-preview{display:block;width:100%;height:100%;pointer-events:none}</style>

<style scoped>.original-frame{position:absolute;left:0;top:0;outline:3px dashed #2563eb;pointer-events:none}.preview-frame{position:absolute}</style>
