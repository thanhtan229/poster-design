<template>
<div class="visual-font-match" data-visual-font-match>
 <div class="tx-row"><el-button size="small" :loading="loading" :disabled="disabled||region.fontLocked" @click="match">{{$t('tinix.ui.visualFont.match')}}</el-button><el-checkbox v-model="region.fontLocked" size="small" :disabled="loading">{{$t('tinix.ui.visualFont.lock')}}</el-checkbox></div>
 <p v-if="error" class="tx-hint" role="alert">{{error}}</p>
 <template v-if="region.visualFontMatch">
 <img class="reference-crop" :src="region.visualFontMatch.referenceCrop" :alt="$t('tinix.ui.visualFont.crop')">
 <p class="tx-hint">{{$t('tinix.ui.visualFont.confidence')}}: {{Math.round(region.visualFontMatch.confidence*100)}}% · {{region.visualFontMatch.reason}}</p>
 <p v-if="region.visualFontMatch.confidence<.65" class="tx-hint" role="status">{{$t('tinix.ui.visualFont.low')}}</p>
 <div class="font-options"><button v-for="candidate in region.visualFontMatch.candidates" :key="candidate.fontClass.id+'-'+candidate.weight+'-'+candidate.italic" type="button" :disabled="region.fontLocked||loading||disabled" :aria-label="$t('tinix.ui.visualFont.choose')+' '+candidate.fontClass.alias" :aria-pressed="region.fontClass?.id===candidate.fontClass.id&&region.weight===candidate.weight&&region.italic===candidate.italic" @click="choose(candidate)"><img :src="candidate.preview" :alt="candidate.fontClass.alias"><span>{{candidate.fontClass.alias}} · {{candidate.weight}}{{candidate.italic?' italic':''}}</span></button></div>
 </template>
</div>
</template>
<script setup lang="ts">
import {ref,watch,onBeforeUnmount} from 'vue'
import {ElButton,ElCheckbox} from 'element-plus'
import {matchFontImage,isErr,TVisualFontCandidate} from '@/api/tinix-ai'
import {loadLibraryFont} from '@/utils/tinix/font-loader'
import i18n from '@/languages'
const props=defineProps<{reference:string;region:any;disabled?:boolean}>()
const loading=ref(false),error=ref('');let sequence=0,disposed=false
function choose(candidate:TVisualFontCandidate){if(props.region.fontLocked)return;Object.assign(props.region,{fontClass:candidate.fontClass,fontFamily:candidate.fontClass.value,weight:candidate.weight,italic:candidate.italic});loadLibraryFont(candidate.fontClass).catch(()=>{})}
async function match(){if(disposed||loading.value||props.region.fontLocked)return;const current=++sequence,region=props.region,reference=props.reference;loading.value=true;error.value='';try{const result=await matchFontImage({reference,text:region.uppercase?region.text.toUpperCase():region.text,bbox:region.bbox,fontFamily:region.fontFamily,weight:region.weight,italic:region.italic});if(disposed||current!==sequence||reference!==props.reference||region!==props.region)return;if(isErr(result))throw Error(result.msg);region.visualFontMatch=result;if(result.confidence>=.65&&!region.fontLocked)choose(result.candidates[0])}catch(e:any){if(current===sequence&&!disposed)error.value=i18n.global.t('tinix.ui.visualFont.failed')+' '+(e?.message||'')}finally{if(current===sequence&&!disposed)loading.value=false}}
watch(()=>props.reference,()=>{sequence++;loading.value=false;error.value=''});onBeforeUnmount(()=>{disposed=true;sequence++})
defineExpose({match})
</script>
<style scoped>.visual-font-match{padding:8px 0;border-top:1px solid #e2e8f0}.reference-crop{max-width:100%;max-height:100px;object-fit:contain;background:#eee}.font-options{display:grid;grid-template-columns:1fr;gap:5px}.font-options button{border:1px solid #cbd5e1;border-radius:5px;background:white;text-align:left;padding:5px;font-size:12px}.font-options button[aria-pressed=true]{border-color:#0284c7;background:#f0f9ff}.font-options img{display:block;width:100%;max-height:70px;object-fit:contain}.font-options button:disabled{opacity:.7}</style>
