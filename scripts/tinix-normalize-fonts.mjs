// Normalize derived font metadata only. Names, categories, tags and their provenance stay intact.
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import {spawnSync} from 'node:child_process'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const require=createRequire(path.join(root,'service/package.json')),Database=require('better-sqlite3'),puppeteer=require('puppeteer')
const work=path.join(root,'.runtime/font-normalize');fs.mkdirSync(work,{recursive:true})
const db=new Database(path.join(root,'service/data/poster.db'));db.pragma('busy_timeout = 15000')
const stamp=new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid;const backup=path.join(work,`before-${stamp}.db`)
await db.backup(backup)
const input=path.join(work,`input-${stamp}.json`),output=path.join(work,`profiles-${stamp}.json`)
const rows=db.prepare('SELECT * FROM fonts ORDER BY id').all();fs.writeFileSync(input,JSON.stringify(rows))
const result=spawnSync(process.env.TINIX_PYTHON||'python',[path.join(root,'scripts/tinix-font-profile.py'),input,output],{stdio:'inherit'})
if(result.status!==0){db.close();throw Error('Font extraction failed; database unchanged. Install Python fontTools/brotli if missing.')}
const profiles=JSON.parse(fs.readFileSync(output,'utf8')),browser=await puppeteer.launch({headless:true});const base=process.env.TINIX_SERVICE_URL||'http://127.0.0.1:7001'
try{for(let offset=0;offset<profiles.length;offset+=75){const page=await browser.newPage();await page.goto(base+'/',{waitUntil:'domcontentloaded'});const batch=await page.evaluate(async list=>{const out=[];for(let n=0;n<list.length;n+=5)await Promise.all(list.slice(n,n+5).map(async item=>{let timer;try{const p=item.profile;const font=new FontFace('normalize-'+item.id,`url(${JSON.stringify(p.local_url||p.source_url)})`);await Promise.race([font.load(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Font load timeout')),12000)})]);out.push({id:item.id,loaded:true})}catch(e){out.push({id:item.id,loaded:false,error:String(e)})}finally{clearTimeout(timer)}}));return out},profiles.slice(offset,offset+75));for(const item of batch){const p=profiles.find(p=>p.id===item.id).profile;p.browser_loaded=item.loaded;if(!item.loaded)p.error=item.error;p.status=item.loaded&&p.parsed?'verified':item.loaded?'partial':'failed'}await page.close();console.log('Browser verified',Math.min(offset+75,profiles.length))}}finally{await browser.close()}
const cols=db.prepare('PRAGMA table_info(fonts)').all();if(!cols.some(c=>c.name==='technical'))db.exec("ALTER TABLE fonts ADD COLUMN technical TEXT NOT NULL DEFAULT '{}'")
let updated=0,flags=0
const update=db.prepare('UPDATE fonts SET technical=@technical, supports_vietnamese=CASE WHEN @verified=1 THEN @vn ELSE supports_vietnamese END WHERE id=@id AND woff=@url')
db.transaction(()=>{for(const {id,profile:p} of profiles){const old=rows.find(r=>r.id===id);const r=update.run({id,url:p.source_url,technical:JSON.stringify(p),verified:p.status==='verified'?1:0,vn:p.supports_vietnamese?1:0});updated+=r.changes;if(r.changes&&p.status==='verified'&&Boolean(old.supports_vietnamese)!==p.supports_vietnamese)flags++}})()
const summary={total:rows.length,updated,verified:profiles.filter(p=>p.profile.status==='verified').length,partial:profiles.filter(p=>p.profile.status==='partial').length,failed:profiles.filter(p=>p.profile.status==='failed').length,vietnameseFlagsCorrected:flags,backup}
fs.writeFileSync(path.join(work,`report-${stamp}.json`),JSON.stringify({summary,profiles},null,2));fs.writeFileSync(path.join(work,'report.json'),JSON.stringify({summary,profiles},null,2));db.close();console.log(JSON.stringify(summary,null,2))
