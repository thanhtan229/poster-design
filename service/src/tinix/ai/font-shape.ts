/** Self-contained pixel descriptor: shared unchanged with Chromium candidate rendering.
 * Keep helpers inside this function: its transpiled source is injected into Chromium.
 * Otsu separates ink from the background; a tight box removes crop padding before
 * comparing occupancy, proportions and density. No font/category names are used.
 */
export function fontShape(rgba:ArrayLike<number>,width:number,height:number){
 const gray=new Uint8Array(width*height),hist=new Array(256).fill(0);let border=0,borderCount=0
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,a=rgba[i*4+3]/255;const v=Math.round((.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2])*a+255*(1-a));gray[i]=v;hist[v]++;if(y<2||x<2||y>=height-2||x>=width-2){border+=v;borderCount++}}
 // Find a foreground threshold without assuming the reference is pure black/white.
 let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i]
 let leftCount=0,leftSum=0,best=0,threshold=128
 for(let i=0;i<255;i++){leftCount+=hist[i];leftSum+=i*hist[i];const right=gray.length-leftCount;if(!leftCount||!right)continue;const variance=leftCount*right*Math.pow(leftSum/leftCount-(sum-leftSum)/right,2);if(variance>best){best=variance;threshold=i}}
 // Border polarity handles both dark-on-light and light-on-dark text.
 const dark=border/Math.max(1,borderCount)>128,mask=new Uint8Array(gray.length)
 let x0=width,y0=height,x1=-1,y1=-1,ink=0
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(dark?gray[i]<=threshold:gray[i]>threshold){mask[i]=1;ink++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}}
 if(x1<x0||y1<y0||ink<4)return null
 // Average coverage per grid cell tolerates modest rasterization differences.
 const w=x1-x0+1,h=y1-y0+1,cols=96,rows=32,grid=new Array(cols*rows).fill(0),counts=new Array(cols*rows).fill(0)
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const index=Math.min(rows-1,Math.floor((y-y0)*rows/h))*cols+Math.min(cols-1,Math.floor((x-x0)*cols/w));grid[index]+=mask[y*width+x];counts[index]++}
 for(let i=0;i<grid.length;i++)grid[i]/=Math.max(1,counts[i])
 return {grid,aspect:w/h,density:ink/(w*h)}
}
export function shapeDistance(a:ReturnType<typeof fontShape>,b:ReturnType<typeof fontShape>){
 if(!a||!b)return 10
 let error=0;for(let i=0;i<a.grid.length;i++)error+=Math.abs(a.grid[i]-b.grid[i])
 return error/a.grid.length+Math.abs(Math.log(a.aspect/b.aspect))*.12+Math.abs(a.density-b.density)*.15
}
