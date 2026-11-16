<template>
 <el-dialog v-model="opened" :title="$t('tinix.ui.visualFont.reviewTitle')" width="1100px" top="8vh" :style="{maxWidth:'calc(100vw - 32px)'}" append-to-body class="font-review-dialog" @closed="generation++">
  <div v-if="match" data-font-review @keydown="navigate">
   <p>{{$t('tinix.ui.visualFont.reviewHint')}}</p>
   <div class="review-pair" :style="{'--review-zoom':zoom}">
    <figure><figcaption>{{$t('tinix.ui.visualFont.crop')}}</figcaption><div class="review-viewport"><img :src="match.referenceCrop" :alt="$t('tinix.ui.visualFont.crop')" :style="{width:zoom*100+'%'}"></div></figure>
    <figure><figcaption>{{candidate?.fontClass.alias}} · {{index+1}}/{{match.candidates.length}}</figcaption><div class="review-viewport"><canvas ref="preview" data-review-preview :aria-busy="rendering" :style="{width:zoom*100+'%'}" role="img" :aria-label="$t('tinix.ui.visualFont.livePreview')"/></div></figure>
   </div>
   <p v-if="rendering" role="status">{{$t('tinix.ui.visualFont.previewLoading')}}</p>
   <p v-if="renderError" role="alert">{{renderError}}</p>
   <fieldset :disabled="busy||disabled">
    <div class="review-controls">
     <button type="button" data-review-prev :disabled="index===0" @click="index--">← {{$t('tinix.ui.visualFont.previous')}}</button>
     <select v-model.number="index" :aria-label="$t('tinix.ui.visualFont.alternatives')"><option v-for="(c,i) in match.candidates" :value="i" :key="c.fontClass.id">{{i+1}} · {{c.fontClass.alias}}</option></select>
     <button type="button" data-review-next :disabled="index===match.candidates.length-1" @click="index++">{{$t('tinix.ui.visualFont.next')}} →</button>
     <label>{{$t('tinix.ui.visualFont.zoom')}}<select v-model.number="zoom"><option :value="1">100%</option><option :value="1.5">150%</option><option :value="2">200%</option></select></label>
    </div>
    <div class="review-controls">
     <label>{{$t('tinix.ui.visualFont.weight')}}<input data-review-weight type="number" :min="weightRange.min" :max="weightRange.max" :step="weightRange.step" :disabled="weightRange.min===weightRange.max" v-model.number="weight" @change="normalize"></label>
     <label><input data-review-italic type="checkbox" v-model="italic" :disabled="!variableItalic" @change="normalize">{{$t('tinix.ui.visualFont.italic')}}</label>
     <label>{{$t('tinix.ui.visualFont.tracking')}}<input data-review-tracking type="number" min="-10" max="30" step=".25" v-model.number="spacing" @change="normalize"></label>
     <button type="button" data-review-reset @click="reset">{{$t('tinix.ui.visualFont.resetAdjustments')}}</button>
    </div>
    <p>{{$t('tinix.ui.visualFont.sourceText')}}: {{sourceText}}</p>
    <label>{{$t('tinix.ui.visualFont.rating')}}<select v-model="rating" data-review-rating><option value="">{{$t('tinix.ui.visualFont.unreviewed')}}</option><option value="close">{{$t('tinix.ui.visualFont.close')}}</option><option value="acceptable">{{$t('tinix.ui.visualFont.acceptable')}}</option><option value="poor">{{$t('tinix.ui.visualFont.poor')}}</option></select></label>
    <textarea v-model="note" rows="2" maxlength="500" :aria-label="$t('tinix.ui.visualFont.note')" :placeholder="$t('tinix.ui.visualFont.note')"/>
    <p v-if="prior" class="review-prior">{{$t('tinix.ui.visualFont.previousReview')}}: {{prior.family}} · {{$t('tinix.ui.visualFont.'+prior.rating)}} · {{new Date(prior.confirmedAt).toLocaleString()}}</p>
    <div class="review-actions">
     <button type="button" data-review-cancel @click="opened=false">{{$t('tinix.ui.visualFont.cancel')}}</button>
     <button type="button" data-review-export @click="exportReviews">{{$t('tinix.ui.visualFont.exportReviews')}}</button>
     <button type="button" data-review-confirm :disabled="!rating||!!renderError||rendering" @click="confirm">{{rating==='poor'?$t('tinix.ui.visualFont.saveFeedback'):$t('tinix.ui.visualFont.confirmReview')}}</button>
    </div>
   </fieldset>
   <p v-if="saveError" role="alert">{{saveError}}</p>
  </div>
 </el-dialog>
</template>
<script setup lang="ts">
import {computed,ref,watch,nextTick,onBeforeUnmount} from 'vue'
import {ElDialog} from 'element-plus'
import {TVisualFontMatch,TVisualFontCandidate} from '@/api/tinix-ai'
import {loadLibraryFont,fontRenderInfo} from '@/utils/tinix/font-loader'
import {readFontProfile} from '../../../../shared/font-profile'
import {fontReviewKey,reviewStyle,readFontReviews,saveFontReview,downloadFontReviews,FontReviewRecord} from '@/utils/tinix/font-review'
import i18n from '@/languages'
const props=defineProps<{reference:string;region:any;disabled?:boolean}>(),emit=defineEmits<{'confirmed':[candidate:TVisualFontCandidate,record:FontReviewRecord];feedback:[record:FontReviewRecord]}>()
const opened=ref(false),index=ref(0),zoom=ref(1),weight=ref(400),italic=ref(false),spacing=ref(0),rating=ref<''|'close'|'acceptable'|'poor'>(''),note=ref(''),prior=ref<FontReviewRecord>(),busy=ref(false),rendering=ref(false),renderError=ref(''),saveError=ref(''),preview=ref<HTMLCanvasElement|null>(null)
let generation=0,renderSeq=0
const match=computed<TVisualFontMatch|undefined>(()=>props.region.visualFontMatch),candidate=computed(()=>match.value?.candidates[index.value]),sourceText=computed<string>(()=>props.region.fontReferenceText||match.value?.observedText||'')
const profile=computed(()=>readFontProfile(candidate.value?.fontClass.technical)),weightRange=computed(()=>{const axis=profile.value?.axes?.find(a=>a.tag==='wght');return axis?{min:axis.min,max:axis.max,step:1}:{min:profile.value?.weight||candidate.value?.weight||400,max:profile.value?.weight||candidate.value?.weight||400,step:1}}),variableItalic=computed(()=>!!profile.value?.axes?.some(a=>a.tag==='ital'&&a.min===0&&a.max>=1))
function normalize(){if(!candidate.value)return;const style=reviewStyle(candidate.value.fontClass,weight.value,italic.value,spacing.value);weight.value=style.weight;italic.value=style.italic;spacing.value=style.letterSpacing}
function reset(){const c=candidate.value;if(!c)return;weight.value=c.weight;italic.value=c.italic;spacing.value=c.letterSpacing||0;rating.value='';note.value='';normalize()}
watch(index,reset)
watch([index,weight,italic,spacing,sourceText,opened,preview],()=>{if(opened.value)void render()})
async function render(){const seq=++renderSeq,c=candidate.value;renderError.value='';if(!c)return;rendering.value=true;try{await loadLibraryFont(c.fontClass);if(!fontRenderInfo(c.fontClass).url)throw Error(i18n.global.t('tinix.ui.visualFont.previewFailed'));await nextTick();if(seq!==renderSeq||!opened.value)return;const canvas=preview.value;if(!canvas)return;const ctx=canvas.getContext('2d')!,lines=sourceText.value.split('\n');let size=80;const style=reviewStyle(c.fontClass,weight.value,italic.value,spacing.value);const font=(s:number)=>`${style.italic?'italic':'normal'} ${style.weight} ${s}px ${JSON.stringify(c.fontClass.value)}`;
 ctx.font=font(size);ctx.letterSpacing=style.letterSpacing/100*size+'px';size*=1100/Math.max(1,...lines.map(line=>ctx.measureText(line).width));size=Math.min(size,4000/Math.max(1,lines.length)/1.4);canvas.width=1200;canvas.height=Math.max(160,Math.ceil(lines.length*size*1.4+50));ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#111';ctx.font=font(size);ctx.letterSpacing=style.letterSpacing/100*size+'px';ctx.textBaseline='top';lines.forEach((line,i)=>ctx.fillText(line,30,20+i*size*1.4));
 }catch(e:any){if(seq===renderSeq)renderError.value=i18n.global.t('tinix.ui.visualFont.previewFailed')+' '+(e?.message||'')}finally{if(seq===renderSeq)rendering.value=false}}
async function open(){if(!match.value?.candidates.length)return;generation++;saveError.value='';index.value=Math.max(0,match.value.candidates.findIndex(c=>c.fontClass.id===props.region.fontClass?.id));reset();const selected=candidate.value;if(selected&&selected.fontClass.id===props.region.fontClass?.id){weight.value=Number(props.region.weight)||selected.weight;italic.value=!!props.region.italic;spacing.value=Number(props.region.letterSpacing)||0;normalize()}zoom.value=1;opened.value=true;prior.value=undefined;const current=generation;try{const key=await keyForRegion();if(current!==generation||!opened.value)return;prior.value=readFontReviews().find(r=>r.key===key)}catch(e:any){saveError.value=e.message}await nextTick();void render()}
function keyForRegion(){return fontReviewKey(props.reference,props.region.fontCrop||props.region.bbox,sourceText.value,props.region.text)}
function navigate(e:KeyboardEvent){if(/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)||props.disabled||busy.value)return;if(e.key==='ArrowRight'&&index.value<(match.value?.candidates.length||0)-1){index.value++;e.preventDefault()}if(e.key==='ArrowLeft'&&index.value>0){index.value--;e.preventDefault()}}
function exportReviews(){try{downloadFontReviews()}catch(e:any){saveError.value=e.message}}
async function confirm(){if(!candidate.value||!rating.value||busy.value||props.disabled||rendering.value||renderError.value)return;const current=generation,c=candidate.value;busy.value=true;saveError.value='';try{normalize();await loadLibraryFont(c.fontClass);if(!fontRenderInfo(c.fontClass).url)throw Error(i18n.global.t('tinix.ui.visualFont.previewFailed'));const key=await keyForRegion();if(current!==generation||!opened.value||props.disabled)return;const record:FontReviewRecord={version:1,key,confirmedAt:new Date().toISOString(),fontId:c.fontClass.id,family:c.fontClass.value,weight:weight.value,italic:italic.value,letterSpacing:spacing.value,rating:rating.value as FontReviewRecord['rating'],note:note.value,sourceText:sourceText.value,designText:props.region.text,crop:{...(props.region.fontCrop||props.region.bbox)}};saveFontReview(record);if(record.rating==='poor')emit('feedback',record);else emit('confirmed',{...c,weight:record.weight,italic:record.italic,letterSpacing:record.letterSpacing},record);opened.value=false}catch(e:any){saveError.value=e.message}finally{busy.value=false}}
watch(()=>[props.reference,props.region,props.region.visualFontMatch,props.region.text,props.region.fontCrop,props.region.fontReferenceText],()=>{generation++;renderSeq++;opened.value=false;prior.value=undefined})
onBeforeUnmount(()=>{generation++;renderSeq++;opened.value=false})
defineExpose({open})
</script>
<style scoped>.review-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.review-pair figure{margin:0;min-width:0}.review-pair figcaption{font-weight:600;margin:8px 0}.review-viewport{height:240px;overflow:auto;border:1px solid #cbd5e1;background:#e5e7eb}.review-viewport img,.review-viewport canvas{display:block;max-width:none;height:auto}.review-controls{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;align-items:center}.review-controls label{display:flex;gap:6px;align-items:center}.review-controls input[type=number]{width:80px}fieldset{border:0;padding:10px 0}button,select,input,textarea{font:inherit}button,select{padding:6px;border:1px solid #94a3b8;border-radius:4px;background:white}.review-actions{display:flex;gap:12px;justify-content:flex-end;margin-top:12px}textarea{display:block;box-sizing:border-box;width:100%;margin-top:10px}.review-prior{color:#475569}@media(max-width:750px){.review-pair{grid-template-columns:1fr}.review-viewport{height:170px}}</style>
