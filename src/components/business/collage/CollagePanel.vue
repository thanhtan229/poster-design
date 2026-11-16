<template>
  <section class="collage-panel" :aria-busy="busy">
    <h2>Cắt dán ảnh thật</h2>
    <TemplateLibrary />
    <PrintGroups v-if="(useCanvasStore().dPage as any).collage" />
    <label>Mẫu <select v-model="templateId"><option v-for="t in collageTemplates" :key="t.id" :value="t.id">{{ t.name }}</option></select></label>
    <img class="preview" :src="template.background" alt="Mẫu Kỷ niệm: nền kem, dây cờ và dải phim" />
    <h3>{{ template.name }} · {{ (template.width*2.54/template.dpi).toFixed(0) }} × {{ (template.height*2.54/template.dpi).toFixed(0) }} cm</h3>
    <p>Dùng lại nền và trang trí. Một ảnh chính cắt nổi, tối đa hai ảnh kỷ niệm giữ nền.</p>
    <CutoutReview ref="review" @confirm="acceptReview" />
    <button v-if="selectedImage" :disabled="busy" @click="openLibrary('replace')">Thay ảnh đang chọn từ thư viện</button>
    <button v-if="hasEditableSubject" :disabled="busy" @click="editPageSubject">Sửa chủ thể trên trang</button>
    <div v-if="createdUrl" class="created-result" role="status">Đã lưu thiết kế riêng: <b>{{ createdName }}</b>. <a :href="createdUrl" target="_blank" rel="noopener">Mở thiết kế của khách</a></div>
    <el-dialog v-model="libraryOpen" title="Chọn ảnh từ thư viện" width="800px" append-to-body>
      <input v-model="search" placeholder="Tìm tên ảnh" /><button @click="reloadPhotos()">Làm mới</button>
      <p v-if="photoState.loading">Đang tải thư viện…</p><p v-else-if="!library.length">Chưa có ảnh phù hợp. Bạn có thể tải ảnh từ dải ảnh hoặc chọn file trên máy.</p>
      <div class="library-grid"><button v-for="photo in library" :key="photo.key" @click="selectLibrary(photo)" :title="photo.name"><img :src="photo.thumb" alt="" loading="lazy" /><span>{{ photo.name || ('Ảnh '+photo.id) }}</span></button></div>
    </el-dialog>
    <fieldset :disabled="busy">
      <label>Tên khách / mã đơn <input v-model="customer" maxlength="100" placeholder="Ví dụ: Lan — tốt nghiệp" data-collage-customer /></label>
      <label>Ảnh chính <input type="file" accept="image/*" @change="pickMain" /></label>
      <button type="button" data-main-library @click="openLibrary('main')">Chọn ảnh chính từ thư viện</button>
      <img v-if="mainPreview" class="subject-preview" :src="mainPreview" alt="Ảnh chính đã chọn" />
      <label class="check"><input v-model="transparent" type="checkbox" /> Ảnh chính là PNG đã tách nền</label>
      <label v-if="!transparent">Chất lượng tách nền
        <select v-model="engine"><option value="birefnet">Chất lượng cao · BiRefNet / RTX 3090</option><option value="u2net">Nhanh · U²-Net</option></select>
      </label>
      <label>Ảnh kỷ niệm (0–2 ảnh)<input type="file" accept="image/*" multiple @change="pickExtras" /></label>
      <button type="button" data-extra-library @click="openLibrary('extra')">Chọn ảnh phụ từ thư viện</button>
      <p v-if="extras.length">Đã chọn {{ extras.length }} ảnh trên máy</p>
      <div v-for="photo in libraryExtras" :key="photo.key" class="selected-photo"><img :src="photo.thumb" alt="" loading="lazy" /><span>{{ photo.name || ('Ảnh '+photo.id) }}</span><button @click="libraryExtras=libraryExtras.filter(p=>p.key!==photo.key)">Bỏ</button></div>
      <label>Tiêu đề <input v-model="title" maxlength="42" /></label>
      <label>Lời nhắn <textarea v-model="body" maxlength="160" rows="3" /></label>
      <button class="primary" :disabled="(!main && !libraryMain) || !title.trim() || !customer.trim()" @click="create">{{ busy ? 'Đang dựng…' : 'Tạo thiết kế cho khách mới' }}</button>
    </fieldset>
    <p role="status">{{ status }}</p>
    <p>Thiết kế mới được lưu riêng. Bấm Mở thiết kế của khách để chỉnh sửa và xuất JPG; trang đang mở được giữ nguyên. Có thể chỉnh từng ảnh và chữ trên canvas; dùng Trợ lý AI nếu cần gợi ý lời nhắn.</p>
    <p><b>In thủ công:</b> chọn Xuất bộ JPG cắt dán phía trên. In nền sạch và các tờ chi tiết cắt; dùng ảnh hoàn thiện để gửi khách duyệt và đối chiếu lắp ráp.</p>
    <p>BiRefNet chạy local trên GPU, không gửi ảnh ra ngoài. Có thể chọn U²-Net khi cần nhanh. Kiểm tra mép tóc và quần áo trước khi in.</p>
  </section>
</template>
<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import CutoutReview from './CutoutReview.vue'
import TemplateLibrary from './TemplateLibrary.vue'
import PrintGroups from './PrintGroups.vue'
import { useWidgetStore, useCanvasStore } from '@/store'
import { ElMessage } from 'element-plus'
import { collageTemplates, getCollageTemplate, getSubjectBox, extractCollageSubject, prepareEditedSubject, uploadCollagePhoto, saveCustomerDesign } from '@/utils/tinix/collage'
import { reloadPhotos, photoState, toStripItems } from '@/utils/tinix/photo-strip'
import type { StripItem } from '@/utils/tinix/photo-strip'
import type { CutoutEngine } from '@/utils/tinix/collage'
const engine=ref<CutoutEngine>('birefnet')
const main=ref<File|null>(null),extras=ref<File[]>([]),mainPreview=ref(''),transparent=ref(false),busy=ref(false),status=ref('')
const templateId=ref(collageTemplates[0].id),template=computed(()=>getCollageTemplate(templateId.value))
const customer=ref(''),createdUrl=ref(''),createdName=ref('')
const title=ref(template.value.defaultTitle),body=ref(template.value.defaultBody)
watch(templateId,()=>{title.value=template.value.defaultTitle;body.value=template.value.defaultBody;createdUrl.value=''})
const libraryOpen=ref(false),libraryRole=ref<'main'|'extra'|'replace'>('main'),search=ref('')
const libraryMain=ref<StripItem|null>(null),libraryExtras=ref<StripItem[]>([])
const library=computed(()=>toStripItems().filter(p=>(p.name||('Ảnh '+p.id)).toLowerCase().includes(search.value.toLowerCase())))
let replacementId:string|null=null
async function openLibrary(role:'main'|'extra'|'replace'){replacementId=role==='replace'?selectedImage.value?.uuid:null;libraryRole.value=role;libraryOpen.value=true;await reloadPhotos()}
async function selectLibrary(photo:StripItem){
 if(libraryRole.value==='replace'){
  const w=store.dWidgets.find((w:any)=>w.uuid===replacementId) as any;if(!w)return
  libraryOpen.value=false
  if(!w.cutoutEdit){w.imgUrl=photo.hq||photo.web;delete w.origin;store.updateDWidgets();return}
  busy.value=true
  try{const file=await getLibraryFile(photo);original=file;editingId=w.uuid;replacing=true;const blob=await extractCollageSubject(file,s=>status.value=s,false,engine.value);await review.value?.show(file,blob,w.cutoutEdit.mm,undefined,useCanvasStore().dPage.dpi||300,{width:w.width,height:w.height})}catch(e:any){ElMessage.error(e.message)}finally{busy.value=false}
  return
 }

 if(libraryRole.value==='main'){main.value=null;libraryMain.value=photo;if(mainPreview.value.startsWith('blob:'))URL.revokeObjectURL(mainPreview.value);mainPreview.value=photo.thumb;libraryOpen.value=false}
 else {if(libraryExtras.value.some(p=>p.key===photo.key))return;if(extras.value.length+libraryExtras.value.length>=template.value.maxPhotos){ElMessage.warning('Mẫu nhận tối đa '+template.value.maxPhotos+' ảnh phụ');return}libraryExtras.value.push(photo)}
}
const sourceFiles=new Map<string,File>()
async function getLibraryFile(photo:StripItem){const url=photo.hq||photo.web;if(sourceFiles.has(url))return sourceFiles.get(url)!;const response=await fetch(url);if(!response.ok)throw new Error('Không tải được ảnh thư viện');const blob=await response.blob();const file=new File([blob],photo.name||'library-photo',{type:blob.type});sourceFiles.set(url,file);if(sourceFiles.size>3)sourceFiles.delete(sourceFiles.keys().next().value!);return file}
const extracted=new WeakMap<File,{mode:boolean;engine:CutoutEngine;blob:Blob}>()
const review=ref<InstanceType<typeof CutoutReview>>()
const store=useWidgetStore()
const pageSubject=computed(()=>store.dWidgets.find((w:any)=>w.cutoutEdit) as any)
const selectedImage=computed(()=>{const w=store.dActiveElement as any;return w?.type==='w-image'&&!w.lock?w:null})
const hasEditableSubject=computed(()=>!!pageSubject.value)
let editingId:string|null=null,original:Blob|null=null,replacing=false
async function editPageSubject(){
 if(!pageSubject.value)return
 busy.value=true
 try{replacing=false;const w=pageSubject.value;editingId=w.uuid;const [a,b]=await Promise.all([fetch(w.cutoutEdit.sourceUrl),fetch(w.cutoutEdit.cutoutUrl)]);if(!a.ok||!b.ok)throw new Error('Không tải được ảnh gốc');original=await a.blob();await review.value?.show(original,await b.blob(),w.cutoutEdit.mm,w.width/w.cutoutEdit.frame.width,useCanvasStore().dPage.dpi||300)}catch(e:any){ElMessage.error(e.message)}finally{busy.value=false}
}
async function acceptReview(value:{blob:Blob;mm:number}){
 if(!original)return
 busy.value=true
 try{
  const subject=await prepareEditedSubject(original,value.blob,value.mm,editingId&&!replacing?pageSubject.value.width/pageSubject.value.cutoutEdit.frame.width:undefined,editingId?(useCanvasStore().dPage.dpi||300):template.value.dpi,replacing?{width:pageSubject.value.width,height:pageSubject.value.height}:getSubjectBox(templateId.value))
  if(editingId){const w=store.dWidgets.find((w:any)=>w.uuid===editingId) as any;if(!w)throw new Error('Chủ thể đã bị xóa');const old=w.cutoutEdit.frame,next=subject.edit!.frame,sx=w.width/old.width,sy=w.height/old.height;if(replacing){const width=next.width*subject.documentScale!,height=next.height*subject.documentScale!;w.left+=(w.width-width)/2;w.top+=w.height-height;w.width=width;w.height=height}else{w.left+=(next.left-old.left)*sx;w.top+=(next.top-old.top)*sy;w.width=next.width*sx;w.height=next.height*sy}w.imgUrl=subject.url;w.cutoutBorderUrl=subject.borderUrl;w.cutoutEdit=subject.edit;delete w.origin;store.updateDWidgets();status.value='Đã cập nhật mặt nạ và viền, không chạy lại model.'}
  else {const photos=[];for(const file of extras.value)photos.push(await uploadCollagePhoto(file,file.name));for(const photo of libraryExtras.value)photos.push({url:photo.hq||photo.web,width:photo.width,height:photo.height});const id=await saveCustomerDesign(subject,photos,title.value.trim(),body.value.trim(),customer.value,templateId.value);createdUrl.value='/home?id='+id;createdName.value=customer.value;status.value='Đã lưu thiết kế riêng. Bấm Mở thiết kế của khách.';ElMessage.success('Đã tạo thiết kế cho khách mới')}
 }catch(e:any){status.value=e.message;ElMessage.error(e.message)}finally{busy.value=false}
}
function pickMain(e:Event){libraryMain.value=null;main.value=(e.target as HTMLInputElement).files?.[0]||null;if(mainPreview.value.startsWith('blob:'))URL.revokeObjectURL(mainPreview.value);mainPreview.value=main.value?URL.createObjectURL(main.value):''}
function pickExtras(e:Event){const files=Array.from((e.target as HTMLInputElement).files||[]);if(files.length+libraryExtras.value.length>template.value.maxPhotos){ElMessage.warning('Mẫu này nhận tối đa hai ảnh kỷ niệm');(e.target as HTMLInputElement).value='';return}extras.value=files}
async function create(){
  if((!main.value&&!libraryMain.value)||!customer.value.trim()||busy.value)return
  busy.value=true;createdUrl.value='';status.value='Đang chuẩn bị ảnh…'
  try{
    editingId=null;replacing=false;const file=main.value||await getLibraryFile(libraryMain.value!);original=file
    const cached=extracted.get(file)
    const blob=cached?.mode===transparent.value&&cached.engine===engine.value?cached.blob:await extractCollageSubject(file,s=>status.value=s,transparent.value,engine.value)
    extracted.set(file,{mode:transparent.value,engine:engine.value,blob})
    await review.value?.show(original,blob,1.5,undefined,template.value.dpi,getSubjectBox(templateId.value));status.value='Kiểm tra mép ảnh rồi bấm Dùng kết quả này.'
  }catch(e:any){status.value=e?.message||'Không tạo được thiết kế';ElMessage.error(status.value)}finally{busy.value=false}
}
onBeforeUnmount(()=>{if(mainPreview.value)URL.revokeObjectURL(mainPreview.value)})
</script>
<style scoped>
.collage-panel{padding:20px;overflow:auto;height:100%;box-sizing:border-box;font-weight:400;color:#483d38}.collage-panel h2{font-size:20px}.preview{width:100%;border-radius:8px}.collage-panel p{font-size:13px;line-height:1.6}.collage-panel fieldset{border:0;padding:0;margin:0}.collage-panel label{display:block;margin:16px 0;font-size:13px}.collage-panel input:not([type=checkbox]),textarea{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:9px;border:1px solid #cbbba8;border-radius:6px}.check{display:flex!important;gap:6px;align-items:center}.primary{width:100%;padding:12px;background:#733e43;color:white;border:0;border-radius:6px;cursor:pointer}.primary:disabled{opacity:.5;cursor:default}.subject-preview{max-height:130px;max-width:100%}.library-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;max-height:480px;overflow:auto}.library-grid button{min-width:0;background:white;border:1px solid #ddd;padding:6px;cursor:pointer}.library-grid img{width:100%;height:120px;object-fit:contain}.library-grid span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selected-photo{display:flex;gap:8px;align-items:center;margin:8px 0}.selected-photo img{width:40px;height:50px;object-fit:cover}.selected-photo span{flex:1;overflow:hidden;text-overflow:ellipsis}.created-result{padding:12px;background:#e9f4e7;margin:12px 0}.created-result a{display:block;font-weight:bold;margin-top:10px;color:#246b36}
</style>
