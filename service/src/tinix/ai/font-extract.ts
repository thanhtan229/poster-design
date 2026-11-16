/** Local background subtraction; preserves small disconnected marks such as Vietnamese accents. */
export function extractText(rgba:ArrayLike<number>,width:number,height:number){
 const gray=new Float64Array(width*height),sum=new Float64Array((width+1)*(height+1));
 let border=0,count=0;const edge:number[]=[];
 for(let y=0;y<height;y++){let row=0;for(let x=0;x<width;x++){const i=y*width+x,a=rgba[i*4+3]/255,v=(.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2])*a+255*(1-a);gray[i]=v;row+=v;sum[(y+1)*(width+1)+x+1]=sum[y*(width+1)+x+1]+row;if(x<2||y<2||x>=width-2||y>=height-2){border+=v;count++;edge.push(v)}}}
 const mean=border/Math.max(1,count),variation=Math.sqrt(edge.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,count));
 const radius=Math.max(4,Math.min(40,Math.round(height/4))),dark=mean>=128,mask=new Uint8Array(width*height*4);let ink=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const x0=Math.max(0,x-radius),x1=Math.min(width,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(height,y+radius+1),stride=width+1;
 const local=(sum[y1*stride+x1]-sum[y0*stride+x1]-sum[y1*stride+x0]+sum[y0*stride+x0])/((x1-x0)*(y1-y0)),v=gray[y*width+x];
 const foreground=dark?local-v>12:v-local>12;const i=(y*width+x)*4;mask[i]=mask[i+1]=mask[i+2]=foreground?0:255;mask[i+3]=255;if(foreground)ink++;
 }
 const fraction=ink/Math.max(1,width*height),usable=fraction>.005&&fraction<.5;
 return {rgba:mask,variation,inkFraction:fraction,usable,quality:!usable?0:variation>25?.3:variation>12?.6:1,method:'local-background-v1'};
}
