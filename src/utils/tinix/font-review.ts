import {actualFontStyle,readFontProfile} from '../../../shared/font-profile'
export type FontReviewRecord={version:1;key:string;confirmedAt:string;fontId:number;family:string;weight:number;italic:boolean;letterSpacing:number;rating:'close'|'acceptable'|'poor';note:string;sourceText:string;designText:string;crop:{x:number;y:number;w:number;h:number}}
const storageKey='tinix.fontReviews.v1'
export async function fontReviewKey(reference:string,crop:any,sourceText:string,designText:string){
 const value=JSON.stringify([reference,crop,sourceText,designText]);
 const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest('SHA-256',bytes)
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')
}
export function reviewStyle(font:any,weight:number,italic:boolean,letterSpacing:number){
 const profile=readFontProfile(font.technical),style=actualFontStyle(profile,Number.isFinite(weight)?weight:400,italic)
 return {...style,letterSpacing:Math.max(-10,Math.min(30,Number.isFinite(letterSpacing)?letterSpacing:0))}
}
export function readFontReviews():FontReviewRecord[]{
 try{const data=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(data)?data.filter(r=>r.version===1&&typeof r.key==='string'&&Number.isInteger(r.fontId)&&['close','acceptable','poor'].includes(r.rating)).slice(-100):[]}catch{return []}
}
export function saveFontReview(record:FontReviewRecord){
 // Throw on storage failure: the caller must never report a confirmation that was not saved.
 localStorage.setItem(storageKey,JSON.stringify([...readFontReviews().filter(r=>r.key!==record.key),record].slice(-100)))
}
export function downloadFontReviews(){
 const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,reviews:readFontReviews()},null,2)],{type:'application/json'})),link=document.createElement('a')
 link.href=url;link.download='tinix-font-reviews.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
