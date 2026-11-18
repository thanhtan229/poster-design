const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'.runtime/selftest-real-font-quality');fs.mkdirSync(out,{recursive:true});
async function main(){
 const image=path.join(out,'reference.png');fs.writeFileSync(image,'offline fixture');
 const manifest=path.join(out,'cases.json');fs.writeFileSync(manifest,JSON.stringify([
  {name:'unknown',image,text:'UNKNOWN',bbox:{x:0,y:0,w:1,h:1},groundTruth:{kind:'unknown'}},
  {name:'known',image,text:'KNOWN',bbox:{x:0,y:0,w:1,h:1},groundTruth:{kind:'verified',fontId:5}},
  {name:'failed',image,text:'ERROR',bbox:{x:0,y:0,w:1,h:1},groundTruth:{kind:'unknown'}},
 ]));
 const file=path.join(out,'results.json');if(fs.existsSync(file))fs.unlinkSync(file);
 const server=http.createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{const input=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(input.text==='ERROR'?{code:500,msg:'Expected unreadable crop'}:{code:200,result:{candidates:[{fontClass:{id:5,value:'Fixture'},weight:400,italic:false,preview:'data:image/png;base64,'}],referenceCrop:'data:image/png;base64,',needsReview:true,jobIds:[1]}}))})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'scripts/tinix-font-real-quality.cjs'),...args],{cwd:root,env:{...process.env,TINIX_REAL_QUALITY_OUT:out,TINIX_APP_URL:'http://127.0.0.1:'+server.address().port},stdio:'pipe'});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('exit',code=>resolve({code,output}))});
 try{const result=await run(['--live','--manifest',manifest]);assert.equal(result.code,1,'Failures produce nonzero exit');let summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json')));assert.equal(summary.successful,2);assert.equal(summary.failed,1);assert.equal(summary.verifiedOriginalFontCases,1);assert.equal(summary.exactTop1,1);assert.equal(summary.pendingHumanReview,2);
  const rows=JSON.parse(fs.readFileSync(file));assert.equal(rows.find(r=>r.name==='unknown').exactTop1,null);
  const reviewFile=path.join(out,'reviews.json');fs.writeFileSync(reviewFile,JSON.stringify({reviews:[{caseName:'unknown',signature:rows[0].signature,fontId:5,rating:'acceptable',note:'Manual review'}]}));await run(['--report-only','--manifest',manifest,'--reviews',reviewFile]);summary=JSON.parse(fs.readFileSync(path.join(out,'summary.json')));assert.equal(summary.humanReviewed,1);assert.equal(summary.exactTop1,1,'Similarity cannot increase exact accuracy');
  const c=JSON.parse(fs.readFileSync(manifest))[0],key=crypto.createHash('sha256').update(JSON.stringify(['data:image/png;base64,'+fs.readFileSync(image).toString('base64'),c.bbox,c.text,c.text])).digest('hex');
  fs.writeFileSync(reviewFile,JSON.stringify({reviews:[{version:1,key,fontId:5,rating:'poor',note:'App export',confirmedAt:'2026-11-16T00:00:00Z'}]}));await run(['--report-only','--manifest',manifest,'--reviews',reviewFile]);assert.equal(JSON.parse(fs.readFileSync(file))[0].humanReview.rating,'poor','App review imports only with identical image/crop/content key');
  const changed=JSON.parse(fs.readFileSync(manifest));changed[0].text='CHANGED';fs.writeFileSync(manifest,JSON.stringify(changed));assert((await run(['--report-only','--manifest',manifest])).output.includes('Frozen case changed'));
  console.log('PASS real benchmark unknown/verified separation, visible failures, human ratings and frozen-case guards; no provider calls');
 }finally{server.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
