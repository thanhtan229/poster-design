export type TextCrop={x:number;y:number;w:number;h:number}
export function clampTextCrop(b:TextCrop):TextCrop {const n=(v:number,fallback:number)=>Number.isFinite(Number(v))?Number(v):fallback;const x=Math.min(.999,Math.max(0,n(b.x,0))); const y=Math.min(.999,Math.max(0,n(b.y,0)));return{x,y,w:Math.max(.001,Math.min(1-x,n(b.w,.1))),h:Math.max(.001,Math.min(1-y,n(b.h,.1)))}}
export function cropFromPoints(a:{x:number;y:number},b:{x:number;y:number}):TextCrop{return clampTextCrop({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)})}
