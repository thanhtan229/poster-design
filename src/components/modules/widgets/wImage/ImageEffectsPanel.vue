<template>
<section data-photo-history class="image-effects" @keydown="onKey" @keyup="stopAdjustKey">
 <strong>Hiệu ứng ảnh</strong>
 <label>Kiểu có sẵn<select aria-label="Kiểu hiệu ứng" @change="preset(($event.target as HTMLSelectElement).value)"><option value="">Chọn kiểu…</option><option value="original">Gốc</option><option value="mono">Trắng đen</option><option value="blur">Nền mờ</option><option value="monoBlur">Nền trắng đen mờ</option></select></label>
 <label><span>Trắng đen</span><input aria-label="Trắng đen" type="checkbox" :checked="effects.grayscale" @change="set('grayscale',($event.target as HTMLInputElement).checked);commit()"></label>
 <label v-for="item in sliders" :key="item.key"><span>{{item.label}} <small>{{effects[item.key]}}</small></span><input :aria-label="item.label" type="range" :min="item.min" :max="item.max" :value="effects[item.key]" @input="set(item.key,Number(($event.target as HTMLInputElement).value))" @change="commit" @blur="commit"></label>
 <label>Màu viền<input aria-label="Màu viền" type="color" :value="effects.borderColor" @input="set('borderColor',($event.target as HTMLInputElement).value)" @change="commit" @blur="commit"></label>
 <button type="button" @click="reset">Đặt lại hiệu ứng</button><button type="button" @click="applyAll">Áp dụng cho tất cả ảnh trên trang</button>
 <button v-if="!image.linkedPhotoId" type="button" @click="createBackground">Tạo nền từ ảnh</button>

</section>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useCanvasStore,useWidgetStore,useHistoryStore } from '@/store'
import { defaultImageEffects,imageEffects, type ImageEffects } from '@/utils/tinix/image-effects'

const props=defineProps<{image:any}>();const ws=useWidgetStore(); const cs=useCanvasStore()
const effects=computed(()=>imageEffects(props.image))
const sliders:Array<{key:keyof Pick<ImageEffects,'blur'|'brightness'|'contrast'|'saturation'|'warmth'|'border'|'shadow'|'grain'|'paper'>;label:string;min:number;max:number}>=[{key:'blur',label:'Làm mờ',min:0,max:100},{key:'brightness',label:'Độ sáng',min:0,max:200},{key:'contrast',label:'Tương phản',min:0,max:200},{key:'saturation',label:'Bão hòa',min:0,max:200},{key:'warmth',label:'Tông ấm',min:0,max:100},{key:'border',label:'Độ dày viền',min:0,max:100},{key:'shadow',label:'Bóng',min:0,max:100},{key:'grain',label:'Hạt ảnh',min:0,max:100},{key:'paper',label:'Vân giấy',min:0,max:100}]
let before=''; let page=-1
function stopAdjustKey(e:KeyboardEvent){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))e.stopPropagation()}
function onKey(e:KeyboardEvent){if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();commit();useHistoryStore().handleHistory(e.shiftKey?'redo':'undo');return}stopAdjustKey(e)}
function begin(){if(before)return;before=JSON.stringify(ws.dWidgets);page=cs.dCurrentPage}
function commit(){if(!before)return;const previous=before;before='';if(page!==cs.dCurrentPage)return;ws.updateDWidgets();const after=JSON.stringify(ws.dWidgets);if(previous!==after)useHistoryStore().changeHistory({patches:[{op:'replace',path:[page,'layers'],value:JSON.parse(after)}],inversePatches:[{op:'replace',path:[page,'layers'],value:JSON.parse(previous)}]})}
function set(key:keyof ImageEffects,value:any){begin();props.image.effects={...effects.value,[key]:value}}
function reset(){begin();props.image.effects={...defaultImageEffects};commit()}
function preset(value:string){if(!value)return;begin();props.image.effects={...defaultImageEffects,grayscale:value==='mono'||value==='monoBlur',blur:value==='blur'||value==='monoBlur'?Math.round(Math.min(cs.dPage.width,cs.dPage.height)*.015):0};commit()}
function applyAll(){begin();for(const w of ws.dWidgets)if(w.type==='w-image'&&!w.hidden)w.effects={...effects.value};commit()}
function createBackground(){begin();const main=props.image;main.slot=true;const bg=JSON.parse(JSON.stringify(main));Object.assign(bg,{uuid:crypto.randomUUID(),name:'Nền liên kết — '+(main.name||'Ảnh'),linkedPhotoId:main.uuid,frameDragMode:'pan',slot:false,parent:'-1',left:0,top:0,width:cs.dPage.width,height:cs.dPage.height,fit:'cover',keepCover:false,cropX:50,cropY:50,zoom:1,rotate:0,transform:'',flip:'',mask:'',radius:0,opacity:1,lock:false,effects:{...defaultImageEffects,blur:Math.round(Math.min(cs.dPage.width,cs.dPage.height)*.015)}});ws.dWidgets.unshift(bg);commit()}

</script>
<style scoped>.image-effects{display:flex;flex-direction:column;gap:10px;padding:12px 0;border-top:1px solid #ddd;font-size:12px}.image-effects label{display:flex;justify-content:space-between;align-items:center;gap:8px}.image-effects input[type=range]{width:125px}.image-effects small{color:#64748b}.image-effects button,.image-effects select{padding:6px;border:1px solid #cbd5e1;border-radius:4px;background:white;font:inherit}.image-effects p{color:#64748b;line-height:1.5;margin:0}</style>
