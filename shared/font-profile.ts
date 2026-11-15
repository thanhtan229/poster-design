/** Versioned, file-derived font properties shared by AI selection and browser rendering. */
export type FontProfile = {
 version:1; status:'verified'|'partial'|'failed'; source_url:string; local_url?:string;
 hash?:string; bytes?:number; mtime_ms?:number; checked_at:string; browser_loaded:boolean;
 family?:string; subfamily?:string; weight?:number; width?:number; italic?:boolean;
 axes?:Array<{tag:string;min:number;max:number;default:number}>;
 coverage?:Array<[number,number]>; units_per_em?:number; cap_height?:number; x_height?:number; error?:string
}
export function readFontProfile(value:any,source?:string):FontProfile|null {
 try {const p=typeof value==='string'?JSON.parse(value):value
 return p&&p.version===1&&p.status==='verified'&&p.browser_loaded&&Array.isArray(p.coverage)&&typeof p.weight==='number'&&p.weight>=1&&p.weight<=1000&&(!source||p.source_url===source)?p:null
 }catch{return null}
}
export function supportsText(profile:FontProfile|null,text:string):boolean {
 if(!profile)return false
 return Array.from(text.normalize('NFC')).every(c=>/\s/.test(c)||profile.coverage!.some(([a,b])=>c.codePointAt(0)!>=a&&c.codePointAt(0)!<=b))
}
export function fontDescriptors(profile:FontProfile|null):Array<{weight:string;style:string;stretch:string}> {
 if(!profile)return [{weight:'normal',style:'normal',stretch:'normal'}]
 const axes=profile.axes||[],weight=axes.find(a=>a.tag==='wght'),width=axes.find(a=>a.tag==='wdth')
 const widths=[50,62.5,75,87.5,100,112.5,125,150,200]
 const stretch=width?`${width.min}% ${width.max}%`:`${widths[(profile.width||5)-1]||100}%`
 const base={weight:weight?`${weight.min} ${weight.max}`:String(profile.weight),stretch}
 const ital=axes.find(a=>a.tag==='ital')
 return ital&&ital.min===0&&ital.max>=1?[{...base,style:'normal'},{...base,style:'italic'}]:[{...base,style:profile.italic?'italic':'normal'}]
}
export function actualFontStyle(profile:FontProfile|null,weight:number,italic:boolean) {
 if(!profile)return {weight,italic}
 const axis=profile.axes?.find(a=>a.tag==='wght'),ital=profile.axes?.find(a=>a.tag==='ital')
 return {weight:axis?Math.max(axis.min,Math.min(axis.max,weight)):profile.weight!,italic:ital?italic:!!profile.italic}
}
