<template>
<section data-photo-history class="frame-panel" @keydown="onKey" @keyup="stopArrow">
 <strong>Căn ảnh và khung</strong>
 <button v-if="canEditPhoto(image)" class="edit-photo" :aria-pressed="editingPhoto" @click="toggleEdit">{{editingPhoto?$t('tinix.ui.photoFrame.editing'):$t('tinix.ui.photoFrame.edit')}}</button>
 <p v-if="image.fit==='cover'">{{$t('tinix.ui.photoFrame.edit_hint')}}</p>
 <template v-if="image.fit==='cover'">
 <label>Phóng ảnh {{Number(image.zoom||1).toFixed(2)}}×<input aria-label="Phóng ảnh trong khung" type="range" min="1" :max="MAX_FRAME_ZOOM" step="0.01" :value="image.zoom||1" @input="zoom(Number(($event.target as HTMLInputElement).value))" @change="commit" @blur="commit"></label>
 <label>{{$t('tinix.ui.photoFrame.rotate')}} {{Number(image.imgRotate||0).toFixed(1)}}°<input :aria-label="$t('tinix.ui.photoFrame.rotate')" type="range" min="-180" max="180" step="0.5" :value="image.imgRotate||0" @input="rotate(Number(($event.target as HTMLInputElement).value))" @change="commit" @blur="commit"></label>
 <div class="mode-buttons"><button @click="turn(-90)">{{$t('tinix.ui.photoFrame.turn_left')}}</button><button @click="turn(90)">{{$t('tinix.ui.photoFrame.turn_right')}}</button></div>
 <button @click="center">Căn giữa ảnh</button><button @click="fit">Vừa khung</button>
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
import {useWidgetStore,useHistoryStore,useUserStore} from '@/store'
import {createFrameHistory,setFrameZoom,setFrameRotation,MAX_FRAME_ZOOM,photoEdit,canEditPhoto,enterPhotoEdit,exitPhotoEdit} from '@/utils/tinix/photo-frame'
import {resolveLinkedImage} from '@/utils/tinix/image-effects'
import {photoRole} from '@/utils/tinix/template-photo'
const props=defineProps<{image:any}>(); const ws=useWidgetStore()
const editing=computed(()=>useUserStore().tempEditing)
const role=computed(()=>photoRole(props.image)); const choosingLink=ref(false); const message=ref('')
const sources=computed(()=>ws.dWidgets.filter(w=>w.type==='w-image'&&w.slot&&!w.linkedPhotoId&&!w.hidden&&w.uuid!==props.image.uuid))
const {begin,commit}=createFrameHistory()
function stopArrow(e:KeyboardEvent){if(e.key.startsWith('Arrow')||['Home','End','PageUp','PageDown'].includes(e.key))e.stopPropagation()}
function onKey(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();commit();useHistoryStore().handleHistory(e.shiftKey?'redo':'undo');return}stopArrow(e)}
const editingPhoto=computed(()=>photoEdit.uuid===props.image.uuid)
function toggleEdit(){if(editingPhoto.value)exitPhotoEdit();else enterPhotoEdit(props.image.uuid)}
function zoom(value:number){begin();setFrameZoom(props.image,value)}
function rotate(value:number){begin();setFrameRotation(props.image,value)}
function turn(step:number){begin();setFrameRotation(props.image,(Number(props.image.imgRotate)||0)+step);commit()}
function center(){begin();props.image.cropX=50;props.image.cropY=50;commit()}
function fit(){begin();props.image.imgRotate=0;setFrameZoom(props.image,1);props.image.cropX=50;props.image.cropY=50;commit()}
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
<style scoped>.frame-panel{display:flex;flex-direction:column;gap:9px;padding:12px 0;font-size:12px}.frame-panel p{margin:0;color:#64748b;line-height:1.5}.frame-panel label{display:flex;flex-direction:column;gap:5px}.frame-panel button,.frame-panel select{padding:7px;border:1px solid #cbd5e1;border-radius:4px;background:white;font:inherit}.mode-buttons{display:flex;gap:5px}.frame-panel .edit-photo{background:#f97316;border-color:#ea580c;color:white;font-weight:600}.frame-panel .edit-photo[aria-pressed=true]{background:#fff7ed;color:#c2410c}.mode-buttons button[aria-pressed=true]{background:#e0f2fe;border-color:#0284c7;color:#075985}.frame-panel [role=alert]{color:#b45309}</style>
