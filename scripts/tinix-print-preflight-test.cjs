require('../service/node_modules/ts-node').register({transpileOnly:true,compilerOptions:{module:'commonjs',esModuleInterop:true}})
const assert=require('node:assert/strict'),path=require('path'),DB=require('../service/node_modules/better-sqlite3')
const root=process.cwd();process.chdir(path.join(root,'service'))
process.env.NODE_ENV='development'
const {preflightPrint}=require('../service/src/tinix/printPreflight.ts')
;(async()=>{
 const db=new DB(path.join(root,'service/data/poster.db'),{readonly:true}),saved=JSON.parse(db.prepare('select data from designs where id=41').get().data)[0];db.close()
 const copy=()=>JSON.parse(JSON.stringify(saved)),original=JSON.stringify(saved)
 const issues=await preflightPrint(saved);assert(!issues.some(i=>i.severity==='error'),JSON.stringify(issues));assert.equal(JSON.stringify(saved),original)
 let bad=copy();bad.layers.find(w=>w.type==='w-image').imgUrl='/static/does-not-exist.png';assert((await preflightPrint(bad)).some(i=>i.severity==='error'&&i.message.includes('tài nguyên')))
 bad=copy();const text=bad.layers.find(w=>w.type==='w-text');text.fontClass.url='/static/fonts/missing.woff2';assert((await preflightPrint(bad)).some(i=>i.severity==='error'&&i.message.includes('font')))
 bad=copy();const image=bad.layers.find(w=>w.type==='w-image'&&w.slot);image.width=10000;image.height=10000;assert((await preflightPrint(bad)).some(i=>i.severity==='warning'&&i.message.includes('DPI')))
 console.log('PASS missing image/font blocks output; low resolution warns; existing design valid and unchanged')
})().catch(e=>{console.error(e);process.exitCode=1})
