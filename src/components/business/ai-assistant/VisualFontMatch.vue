<template>
<div class="visual-font-match" data-visual-font-match>
 <details :open="editing"><summary @click.prevent="editing=!editing">{{$t('tinix.ui.visualFont.editCrop')}}</summary><FontCropEditor v-if="editing" :reference="reference" :crop="region.fontCrop||region.bbox" :text="region.fontReferenceText||''" :disabled="loading||disabled||region.fontLocked" @update:crop="updateCrop" @update:text="updateText" @reset="resetCrop"/></details>
 <div class="tx-row"><el-button size="small" :loading="loading" :disabled="disabled||region.fontLocked" @click="match">{{$t('tinix.ui.visualFont.match')}}</el-button><el-checkbox v-model="region.fontLocked" size="small" :disabled="loading">{{$t('tinix.ui.visualFont.lock')}}</el-checkbox></div>
 <p v-if="error" class="tx-hint" role="alert">{{error}}</p>
 <template v-if="region.visualFontMatch">
 <p class="tx-hint">{{$t('tinix.ui.visualFont.caution')}}</p>
 <button type="button" data-open-font-review :disabled="loading||disabled" @click="reviewDialog?.open()">{{$t('tinix.ui.visualFont.reviewTitle')}}</button>
 <p v-if="region.fontReview" data-font-reviewed role="status">{{$t('tinix.ui.visualFont.reviewSaved')}} · {{region.fontReview.family}}</p>
 <FontReviewDialog ref="reviewDialog" :reference="reference" :region="region" :disabled="loading||disabled||region.fontLocked" @confirmed="confirmReview" @feedback="recordFeedback"/>
 <details v-if="region.visualFontMatch.processedPreview"><summary>Xem chữ sau xử lý tương phản</summary><p>Kiểm tra dấu và nét mảnh; ảnh này chỉ để tham khảo.</p><img class="reference-crop" :src="region.visualFontMatch.processedPreview" alt="Chữ sau xử lý tương phản"></details>
 <img class="reference-crop" :src="region.visualFontMatch.referenceCrop" :alt="$t('tinix.ui.visualFont.crop')">
 <p class="tx-hint">{{$t('tinix.ui.visualFont.confidence')}}: {{Math.round(region.visualFontMatch.confidence*100)}}% · {{region.visualFontMatch.reason}}</p>
 <p v-if="region.visualFontMatch.needsReview" class="tx-hint" role="status">{{$t('tinix.ui.visualFont.review')}}</p>
 <details v-if="region.visualFontMatch.detailPreview" class="font-detail"><summary>{{$t('tinix.ui.visualFont.detail')}}</summary><p v-if="region.visualFontMatch.detailLabels" class="tx-hint">{{region.visualFontMatch.detailLabels.map((c:any)=>c.label+': '+c.name).join(' · ')}}</p><img :src="region.visualFontMatch.detailPreview" :alt="$t('tinix.ui.visualFont.detail')"></details>
 <p v-if="region.visualFontMatch.confidence<.65" class="tx-hint" role="status">{{$t('tinix.ui.visualFont.low')}}</p>
 <div class="font-options"><button v-for="candidate in region.visualFontMatch.candidates" :key="candidate.fontClass.id+'-'+candidate.weight+'-'+candidate.italic" type="button" :disabled="region.fontLocked||loading||disabled" :aria-label="$t('tinix.ui.visualFont.choose')+' '+candidate.fontClass.alias" :aria-pressed="region.fontClass?.id===candidate.fontClass.id&&((region.fontReview?.rating!=='poor'&&region.fontReview?.fontId===candidate.fontClass.id)||(region.weight===candidate.weight&&region.italic===candidate.italic))" @click="choose(candidate)"><img :src="candidate.preview" :alt="candidate.fontClass.alias"><span>{{candidate.comparisonLabel?candidate.comparisonLabel+' · ':''}}{{candidate.fontClass.alias}} · {{candidate.weight}}{{candidate.italic?' italic':''}}</span><small v-if="candidate.shapeRank">{{$t('tinix.ui.visualFont.rank',{shape:candidate.shapeRank,ai:candidate.aiRank||'–',detail:candidate.detailRank||'–'})}}</small></button></div>
 </template>
</div>
</template>
<script setup lang="ts">
import {ref,watch,onBeforeUnmount} from 'vue'
import {ElButton,ElCheckbox} from 'element-plus'
import {matchFontImage,isErr,TVisualFontCandidate} from '@/api/tinix-ai'
import FontCropEditor from './FontCropEditor.vue'
import FontReviewDialog from './FontReviewDialog.vue'
import {FontReviewRecord} from '@/utils/tinix/font-review'
import {loadLibraryFont} from '@/utils/tinix/font-loader'
import i18n from '@/languages'
const props=defineProps<{reference:string;region:any;disabled?:boolean}>()
const reviewDialog=ref<InstanceType<typeof FontReviewDialog>>()
const loading=ref(false); const error=ref(''); const editing=ref(false);let sequence=0; let disposed=false
function invalidate(){sequence++;delete props.region.visualFontMatch;delete props.region.fontReview;error.value=i18n.global.t('tinix.ui.visualFont.edited')}
function updateCrop(crop:any){if(props.region.fontLocked)return;props.region.fontCrop=crop;invalidate()}
function updateText(text:string){if(props.region.fontLocked)return;props.region.fontReferenceText=text;invalidate()}
function resetCrop(){if(props.region.fontLocked)return;delete props.region.fontCrop;delete props.region.fontReferenceText;invalidate()}
function confirmReview(candidate:TVisualFontCandidate,record:FontReviewRecord){choose(candidate);props.region.fontReview=record}
function recordFeedback(record:FontReviewRecord){props.region.fontReview=record}
function choose(candidate:TVisualFontCandidate){if(props.region.fontLocked)return;delete props.region.fontReview;Object.assign(props.region,{fontClass:candidate.fontClass,fontFamily:candidate.fontClass.value,weight:candidate.weight,italic:candidate.italic,...(candidate.letterSpacing!==undefined?{letterSpacing:candidate.letterSpacing}:{})});loadLibraryFont(candidate.fontClass).catch(()=>{})}
async function match(){if(disposed||loading.value||props.region.fontLocked)return;const current=++sequence; const region=props.region; const reference=props.reference;loading.value=true;error.value='';try{const result=await matchFontImage({reference,text:region.uppercase?region.text.toUpperCase():region.text,bbox:region.fontCrop||region.bbox,referenceText:region.fontReferenceText||undefined,fontFamily:region.fontFamily,weight:region.weight,italic:region.italic});if(disposed||current!==sequence||reference!==props.reference||region!==props.region)return;if(isErr(result))throw Error(result.msg);delete region.fontReview;region.visualFontMatch=result;if(!region.fontReferenceText)region.fontReferenceText=result.observedText;if(result.confidence>=.65&&result.canAutoApply!==false&&!result.needsReview&&!region.fontLocked)choose(result.candidates[0])}catch(e:any){if(current===sequence&&!disposed)error.value=i18n.global.t('tinix.ui.visualFont.failed')+' '+(e?.message||'')}finally{if(current===sequence&&!disposed)loading.value=false}}
watch(()=>props.reference,()=>{sequence++;loading.value=false;error.value=''});onBeforeUnmount(()=>{disposed=true;sequence++})
defineExpose({match})
</script>
<style scoped>.font-detail img{display:block;width:100%;height:auto}.font-options small{display:block;color:#475569;margin-top:4px}.visual-font-match{padding:8px 0;border-top:1px solid #e2e8f0}.reference-crop{max-width:100%;max-height:100px;object-fit:contain;background:#eee}.font-options{display:grid;grid-template-columns:1fr;gap:5px}.font-options button{border:1px solid #cbd5e1;border-radius:5px;background:white;text-align:left;padding:5px;font-size:12px}.font-options button[aria-pressed=true]{border-color:#0284c7;background:#f0f9ff}.font-options img{display:block;width:100%;max-height:70px;object-fit:contain}.font-options button:disabled{opacity:.7}</style>
