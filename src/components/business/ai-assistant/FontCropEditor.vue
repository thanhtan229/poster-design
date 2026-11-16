<template>
<fieldset class="font-crop-editor" :disabled="disabled">
 <legend>{{$t('tinix.ui.visualFont.editCrop')}}</legend>
 <p>{{$t('tinix.ui.visualFont.cropHint')}}</p>
 <div ref="surface" class="crop-surface" @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="cancel">
  <img :src="reference" draggable="false" :alt="$t('tinix.ui.visualFont.crop')">
  <div class="crop-box" :style="{left:box.x*100+'%',top:box.y*100+'%',width:box.w*100+'%',height:box.h*100+'%'}"/>
 </div>
 <div class="crop-numbers"><label v-for="key in keys" :key="key">{{key.toUpperCase()}} %<input type="number" :aria-label="'Crop '+key" min="0" max="100" step="0.1" :value="Math.round(box[key]*1000)/10" @change="setNumber(key,($event.target as HTMLInputElement).value)"></label></div>
 <label>{{$t('tinix.ui.visualFont.sourceText')}}<textarea :value="text" :aria-label="$t('tinix.ui.visualFont.sourceText')" rows="3" maxlength="500" @input="emit('update:text',($event.target as HTMLTextAreaElement).value)"/></label>
 <p>{{$t('tinix.ui.visualFont.sourceHint')}}</p>
 <button type="button" @click="emit('reset')">{{$t('tinix.ui.visualFont.resetCrop')}}</button>
</fieldset>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import {clampTextCrop,cropFromPoints,TextCrop} from '@/utils/tinix/font-crop'
const props=defineProps<{reference:string;crop:TextCrop;text:string;disabled?:boolean}>()
const emit=defineEmits<{'update:crop':[value:TextCrop];'update:text':[value:string];reset:[]}>()
const surface=ref<HTMLElement|null>(null); const box=computed(()=>clampTextCrop(props.crop)); const keys:Array<keyof TextCrop>=['x','y','w','h']
let anchor:{x:number;y:number}|null=null; let original:TextCrop|null=null; let dragId:number|null=null
function point(e:PointerEvent){const r=surface.value!.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
function start(e:PointerEvent){if(props.disabled||e.button!==0)return;e.preventDefault();anchor=point(e);original={...box.value};dragId=e.pointerId;surface.value!.setPointerCapture(e.pointerId)}
function move(e:PointerEvent){if(!anchor||e.pointerId!==dragId)return;emit('update:crop',cropFromPoints(anchor,point(e)))}
function end(e:PointerEvent){if(!anchor||e.pointerId!==dragId)return;move(e);if(surface.value?.hasPointerCapture(e.pointerId))surface.value.releasePointerCapture(e.pointerId);anchor=null;dragId=null}
function cancel(){if(original)emit('update:crop',original);anchor=null;dragId=null}
function setNumber(key:keyof TextCrop,value:string){emit('update:crop',clampTextCrop({...box.value,[key]:Number(value)/100}))}
</script>
<style scoped>.font-crop-editor{margin:8px 0;padding:10px;border:1px solid #cbd5e1;border-radius:5px;display:flex;flex-direction:column;gap:8px;font-size:12px;min-width:0}.font-crop-editor p{margin:0;color:#64748b}.crop-surface{position:relative;align-self:flex-start;max-width:100%;touch-action:none;cursor:crosshair;user-select:none;overflow:hidden}.crop-surface img{display:block;max-width:100%;max-height:300px;pointer-events:none}.crop-box{position:absolute;border:2px solid #0284c7;background:#0284c726;box-sizing:border-box;pointer-events:none}.crop-numbers{display:flex;gap:6px}.crop-numbers label{flex:1;min-width:0}.crop-numbers input{width:100%;box-sizing:border-box}.font-crop-editor textarea{display:block;width:100%;box-sizing:border-box;resize:vertical}.font-crop-editor button{padding:6px;background:white;border:1px solid #cbd5e1;border-radius:4px}</style>
