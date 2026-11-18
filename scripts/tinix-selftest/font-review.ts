import assert from 'node:assert/strict'
import {webcrypto} from 'node:crypto'
import {fontReviewKey,reviewStyle,readFontReviews,saveFontReview,FontReviewRecord} from '../../src/utils/tinix/font-review'
const memory=new Map<string,string>();Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>memory.get(k)||null,setItem:(k:string,v:string)=>memory.set(k,v)},configurable:true})
async function main(){
 const p:any={version:1,status:'verified',browser_loaded:true,weight:400,italic:false,coverage:[[32,126]],axes:[]},font={technical:JSON.stringify(p)}
 assert.deepEqual(reviewStyle(font,900,true,100),{weight:400,italic:false,letterSpacing:30},'Static files never synthesize unsupported weight/style')
 assert.deepEqual(reviewStyle({technical:JSON.stringify({...p,axes:[{tag:'wght',min:100,max:800},{tag:'ital',min:0,max:1}]})},900,true,-50),{weight:800,italic:true,letterSpacing:-10})
 const bbox={x:0,y:0,w:1,h:1},key=await fontReviewKey('image',bbox,'SOURCE','NEW')
 assert.equal(key,await fontReviewKey('image',bbox,'SOURCE','NEW'))
 for(const args of [['different',bbox,'SOURCE','NEW'],['image',{...bbox,w:.5},'SOURCE','NEW'],['image',bbox,'DIFFERENT','NEW'],['image',bbox,'SOURCE','OTHER']] as any[])assert.notEqual(key,await fontReviewKey(args[0],args[1],args[2],args[3]))
 const record:FontReviewRecord={version:1,key,confirmedAt:new Date().toISOString(),fontId:1,family:'Fixture',weight:400,italic:false,letterSpacing:1,rating:'close',note:'Human similarity only',sourceText:'SOURCE',designText:'NEW',crop:bbox}
 saveFontReview(record);saveFontReview({...record,rating:'poor'});assert.equal(readFontReviews().length,1);assert.equal(readFontReviews()[0].rating,'poor')
 for(let i=0;i<110;i++)saveFontReview({...record,key:'test'+i});assert.equal(readFontReviews().length,100)
 memory.set('tinix.fontReviews.v1','bad json');assert.deepEqual(readFontReviews(),[])
 console.log('PASS truthful style constraints, crop/content-sensitive identity, review replacement, history cap and corrupt storage recovery')
}
main().catch(e=>{console.error(e);process.exitCode=1})
