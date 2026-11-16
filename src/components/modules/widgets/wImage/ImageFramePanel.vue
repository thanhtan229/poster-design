<template>
<section data-photo-history class="frame-panel" @keydown="onKey" @keyup="stopArrow">
 <strong>Căn ảnh và khung</strong>
 <div v-if="image.fit==='cover'" class="mode-buttons" role="group" aria-label="Chế độ kéo ảnh">
  <button :aria-pressed="image.frameDragMode!=='frame'" @click="mode('pan')">Căn ảnh</button>
  <button :aria-pressed="image.frameDragMode==='frame'" @click="mode('frame')">Di chuyển khung</button>
 </div>
 <p v-if="image.fit==='cover'">{{image.frameDragMode==='frame'?'Đang di chuyển cả khung.':'Đang căn ảnh bên trong khung; vị trí khung giữ nguyên.'}}</p>
 <template v-if="image.fit==='cover'">
 <label>Phóng ảnh {{Number(image.zoom||1).toFixed(2)}}×<input aria-label="Phóng ảnh trong khung" type="range" min="1" max="3" step="0.01" :value="image.zoom||1" @input="zoom(Number(($event.target as HTMLInputElement).value))" @change="commit" @blur="commit"></label>
 <button @click="center">Căn giữa ảnh</button><button @click="fit">Vừa khung</button>
 <p>Chỉ chiều có phần ảnh dư mới kéo được. Tăng phóng ảnh để có thêm khoảng căn chỉnh.</p>
 </template>
 <label v-if="editing">Vai trò ảnh<select aria-label="Vai trò ảnh" :value="role" @change="roleEvent"><option value="main">Ảnh chính — nhận ảnh thay thế</option><option value="linked">Nền liên kết</option><option value="decoration">Ảnh trang trí</option></select></label>
 <p v-else>Vai trò: {{role==='main'?'Ảnh chính':role==='linked'?'Nền liên kết':'Ảnh trang trí'}}</p>
 <label v-if="role==='linked'||choosingLink">Khung chính<select aria-label="Khung ảnh liên kết" :value="image.linkedPhotoId||''" @change="link(($event.target as HTMLSelectElement).value)"><option value="" disabled>Chọn khung ảnh chính…</option><option v-for="w in sources" :key="w.uuid" :value="w.uuid">{{w.layerName||w.name||'Ảnh chính'}}</option></select></label>
 <p v-if="role==='linked'">Dùng ảnh của khung chính; giữ cách căn và hiệu ứng riêng.</p>
 <button v-if="role==='linked'" @click="detach">Tách liên kết ảnh</button>
 <p v-if="message" role="alert">{{message}}</p>
</section>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import {useCanvasStore,useWidgetStore,useHistoryStore,useUserStore} from '@/store'
import {resolveLinkedImage} from '@/utils/tinix/image-effects'
import {photoRole} from '@/utils/tinix/template-photo'
const props=defineProps<{image:any}>(); const ws=useWidgetStore(); const cs=useCanvasStore()
const editing=computed(()=>useUserStore().tempEditing)
const role=computed(()=>photoRole(props.image)); const choosingLink=ref(false); const message=ref('')
const sources=computed(()=>ws.dWidgets.filter(w=>w.type==='w-image'&&w.slot&&!w.linkedPhotoId&&!w.hidden&&w.uuid!==props.image.uuid))
let before=''; let page=-1
function begin(){if(!before){before=JSON.stringify(ws.dWidgets);page=cs.dCurrentPage}}
function commit(){if(!before)return;const old=before;before='';if(page!==cs.dCurrentPage)return;ws.updateDWidgets();const after=JSON.stringify(ws.dWidgets);if(old!==after)useHistoryStore().changeHistory({patches:[{op:'replace',path:[page,'layers'],value:JSON.parse(after)}],inversePatches:[{op:'replace',path:[page,'layers'],value:JSON.parse(old)}]})}
function stopArrow(e:KeyboardEvent){if(e.key.startsWith('Arrow')||['Home','End','PageUp','PageDown'].includes(e.key))e.stopPropagation()}
function onKey(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();commit();useHistoryStore().handleHistory(e.shiftKey?'redo':'undo');return}stopArrow(e)}
function mode(value:string){begin();props.image.frameDragMode=value;commit()}
function zoom(value:number){begin();props.image.zoom=value;props.image.transform=`scale(${value})`}
function center(){begin();props.image.cropX=50;props.image.cropY=50;commit()}
function fit(){zoom(1);props.image.cropX=50;props.image.cropY=50;commit()}
function freeze(){const source=resolveLinkedImage(props.image,ws.dWidgets);props.image.imgUrl=source.imgUrl;props.image.origin=source.origin?{...source.origin}:undefined;delete props.image.linkedPhotoId}
function roleEvent(e:Event){const input=e.target as HTMLSelectElement;changeRole(input.value);input.value=role.value}
function changeRole(value:string){message.value='';choosingLink.value=false;if(value===role.value)return
 if(ws.dWidgets.some(w=>w.linkedPhotoId===props.image.uuid)&&value!=='main'){message.value='Ảnh này đang cấp ảnh cho nền. Hãy đổi khung chính của nền hoặc tách liên kết trước.';return}
 if(value==='linked'){choosingLink.value=true;message.value=sources.value.length?'Chọn khung chính để hoàn tất gán nền.':'Chưa có ảnh chính khác. Hãy đánh dấu một ảnh làm ảnh chính trước.';return}
 begin();freeze();props.image.slot=value==='main';if(value==='main')props.image.fit='cover';commit()
}
function link(id:string){if(!sources.value.some(w=>w.uuid===id))return;begin();props.image.linkedPhotoId=id;props.image.slot=false;props.image.fit='cover';choosingLink.value=false;message.value='';commit()}
function detach(){begin();freeze();props.image.slot=false;commit()}
</script>
<style scoped>.frame-panel{display:flex;flex-direction:column;gap:9px;padding:12px 0;font-size:12px}.frame-panel p{margin:0;color:#64748b;line-height:1.5}.frame-panel label{display:flex;flex-direction:column;gap:5px}.frame-panel button,.frame-panel select{padding:7px;border:1px solid #cbd5e1;border-radius:4px;background:white;font:inherit}.mode-buttons{display:flex;gap:5px}.mode-buttons button[aria-pressed=true]{background:#e0f2fe;border-color:#0284c7;color:#075985}.frame-panel [role=alert]{color:#b45309}</style>
