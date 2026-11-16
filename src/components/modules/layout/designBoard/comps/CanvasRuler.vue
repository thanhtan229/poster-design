<template>
  <Teleport v-if="toolbarReady" to="#tinix-ruler-toolbar"><div data-photo-history class="ruler-tools"><strong>Thước &amp; đường căn</strong><button @click.stop="unit = unit === 'px' ? 'cm' : 'px'">Đơn vị: {{ unit }}</button><button @click.stop="shown = !shown">{{ shown ? 'Ẩn thước' : 'Mở thước' }}</button><button @click.stop="locked = !locked">{{ locked ? 'Mở khóa' : 'Khóa' }}</button><button @click.stop="addGuide('y')">+ Ngang</button><button @click.stop="addGuide('x')">+ Dọc</button><span>{{ guides.x.length + guides.y.length }} đường</span><button @click.stop="clearGuides">Xóa đường</button><button @click.stop="snap = !snap">{{ snap ? 'Hít ✓' : 'Hít' }}</button></div></Teleport>
  <template v-if="shown">
    <button type="button" aria-label="Tạo đường ngang từ thước" data-photo-history class="ruler horizontal" :style="horizontalStyle" @mousedown.stop.prevent="startNew('y', $event)" @click.stop="clickNew('y')"><span v-for="tick in ticksX" :key="tick.p" :style="{left: tick.p * scale + 'px'}">{{ tick.label }}</span></button>
    <button type="button" aria-label="Tạo đường dọc từ thước" data-photo-history class="ruler vertical" :style="verticalStyle" @mousedown.stop.prevent="startNew('x', $event)" @click.stop="clickNew('x')"><span v-for="tick in ticksY" :key="tick.p" :style="{top: tick.p * scale + 'px'}">{{ tick.label }}</span></button>
    <div v-for="(p,i) in guides.x" :key="'x'+i" data-photo-history class="guide gx" :style="{left:p+'px',width: 5/scale+'px'}" @mousedown.stop.prevent="moveGuide('x',i,$event)" @dblclick.stop="remove('x',i)" />
    <div v-for="(p,i) in guides.y" :key="'y'+i" data-photo-history class="guide gy" :style="{top:p+'px',height: 5/scale+'px'}" @mousedown.stop.prevent="moveGuide('y',i,$event)" @dblclick.stop="remove('y',i)" />
  </template>
</template>
<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useCanvasStore, useHistoryStore } from '@/store'
import type { TPageState } from '@/store/design/canvas/d'
const props=defineProps<{page:TPageState;zoom:number}>()
const store=useCanvasStore()
const unit=ref<'px'|'cm'>('px'); const shown=ref(true); const snap=ref(true); const locked=ref(false)
const toolbarReady=ref(false)
onMounted(()=>{toolbarReady.value=true})
const toggleRuler=()=>{shown.value=!shown.value}
onMounted(()=>window.addEventListener('tinix-toggle-ruler',toggleRuler))
onBeforeUnmount(()=>window.removeEventListener('tinix-toggle-ruler',toggleRuler))
const scale=computed(()=>Math.max(.01,props.zoom/100))
const inverse=computed(()=>({transform:`scale(${1/scale.value})`}))
const horizontalStyle=computed(()=>({top:-24/scale.value+'px',width:props.page.width*scale.value+'px',transform:`scale(${1/scale.value})`}))
const verticalStyle=computed(()=>({left:-24/scale.value+'px',height:props.page.height*scale.value+'px',transform:`scale(${1/scale.value})`}))
const guides=computed(()=>props.page.tinixGuides || {x:[],y:[]})
function ticks(max:number) { const factor=unit.value==='cm'?(Number(props.page.dpi)||300)/2.54:1; const raw=70/(scale.value*factor); const power=Math.pow(10,Math.floor(Math.log10(raw))); const step=[1,2,5,10].map(n=>n*power).find(n=>n>=raw)||power*10; const result=[]; for(let n=0;n*factor<=max && result.length<300;n+=step) result.push({p:n*factor,label:Number(n.toPrecision(5))}); return result }
const ticksX=computed(()=>ticks(props.page.width)); const ticksY=computed(()=>ticks(props.page.height))
function update() { store.updateGuidelines({verticalGuidelines:snap.value?[0,props.page.width/2,props.page.width,...guides.value.x] as any:[],horizontalGuidelines:snap.value?[0,props.page.height/2,props.page.height,...guides.value.y] as any:[]}) }
watch(()=>[props.page,props.zoom,snap.value,JSON.stringify(guides.value)],update,{immediate:true,deep:true})
function set(axis:'x'|'y', arr:number[]) { store.updatePageData({key:'tinixGuides',value:{x:[...guides.value.x],y:[...guides.value.y],[axis]:arr}}); store.updateDPage() }
function addGuide(axis:'x'|'y') { if(locked.value)return;const before=JSON.parse(JSON.stringify(guides.value));set(axis,[...guides.value[axis],(axis==='x'?props.page.width:props.page.height)/2]);record(before) }
function position(axis:'x'|'y',e:MouseEvent,canvas:HTMLElement) { const r=canvas.getBoundingClientRect(); return Math.round(((axis==='x'?e.clientX-r.left:e.clientY-r.top)/scale.value)*100)/100 }
function record(before:any) { const after=JSON.parse(JSON.stringify(props.page.tinixGuides || {x:[],y:[]})); if(JSON.stringify(before)===JSON.stringify(after)) return; const path=[store.dCurrentPage,'global','tinixGuides']; useHistoryStore().changeHistory({patches:[{op:'add',path,value:after}],inversePatches:[{op:'add',path,value:before}]}) }
function drag(axis:'x'|'y',index:number,e:MouseEvent,before:any) {
 const canvas=(e.currentTarget as HTMLElement).closest('.design-canvas') as HTMLElement
 const page=props.page
 const move=(ev:MouseEvent)=>{if(props.page!==page)return;const arr=[...guides.value[axis]];arr[index]=Math.max(0,Math.min(axis==='x'?page.width:page.height,position(axis,ev,canvas)));set(axis,arr)}
 const end=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',end);if(props.page===page)record(before)}
 window.addEventListener('mousemove',move);window.addEventListener('mouseup',end,{once:true})
}
let createdOnMouseDown=false
function clickNew(axis:'x'|'y') { if(createdOnMouseDown){createdOnMouseDown=false;return} if(locked.value)return;const before=JSON.parse(JSON.stringify(guides.value));set(axis,[...guides.value[axis],(axis==='x'?props.page.width:props.page.height)/2]);record(before) }
function startNew(axis:'x'|'y',e:MouseEvent) {if(locked.value || e.button!==0)return; createdOnMouseDown=true; const before=JSON.parse(JSON.stringify(guides.value)); const arr=[...guides.value[axis],(axis==='x'?props.page.width:props.page.height)/2];set(axis,arr);drag(axis,arr.length-1,e,before)}
function moveGuide(axis:'x'|'y',i:number,e:MouseEvent) {if(locked.value || e.button!==0)return;drag(axis,i,e,JSON.parse(JSON.stringify(guides.value)))}
async function remove(axis:'x'|'y',i:number) {
  if(locked.value)return
  const factor=unit.value==='cm'?(Number(props.page.dpi)||300)/2.54:1
  const page=props.page
  try {
    const result=await ElMessageBox.prompt(`Vị trí (${unit.value}); nhập -1 để xóa đường`, 'Đường căn chỉnh', {inputValue:String(Number((guides.value[axis][i]/factor).toFixed(3))),inputValidator:(v:string)=>Number.isFinite(Number(v)) && v.trim()!=='' && (Number(v)===-1 || (Number(v)>=0 && Number(v)*factor<=(axis==='x'?page.width:page.height))) || 'Vị trí phải nằm trong trang',confirmButtonText:'Áp dụng',cancelButtonText:'Hủy'})
    if(props.page!==page)return
    const before=JSON.parse(JSON.stringify(guides.value)); const arr=[...guides.value[axis]]
    if(Number(result.value)===-1)arr.splice(i,1); else arr[i]=Number(result.value)*factor
    set(axis,arr);record(before)
  } catch { /* canceled */ }
}
function clearGuides(){if(locked.value)return;const before=JSON.parse(JSON.stringify(guides.value));props.page.tinixGuides={x:[],y:[]};store.updateDPage();record(before)}
</script>
<style scoped>
.ruler-tools{position:relative;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 10px;background:white;font:12px sans-serif}.ruler-tools button{font-size:12px;padding:5px 8px;background:#fff;border:1px solid #bbb;border-radius:4px;cursor:pointer}.ruler{border:0;padding:0;text-align:left;cursor:crosshair;position:absolute;z-index:999;background:#f8f8f8;color:#555;font:10px sans-serif;transform-origin:top left;overflow:hidden;user-select:none;touch-action:none}.horizontal{height:24px;left:0;top:-18px;transform-origin:left top}.vertical{width:24px;top:0;left:-18px;transform-origin:left top}.ruler span{position:absolute;border-left:1px solid #888;padding-left:2px}.horizontal span{height:20px;top:2px}.vertical span{border-left:0;border-top:1px solid #888;left:2px;writing-mode:vertical-rl}.guide{position:absolute;background:#04bddd;z-index:998;touch-action:none}.gx{top:0;height:100%;cursor:ew-resize}.gy{left:0;width:100%;cursor:ns-resize}
</style>
