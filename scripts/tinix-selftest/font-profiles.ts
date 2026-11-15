import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import {initDB,getDB} from '../../service/src/db'
import {verifiedFontProfile} from '../../service/src/tinix/fontProfiles'
import {libraryFonts} from '../../service/src/tinix/ai/fonts'
import {readFontProfile,supportsText,fontDescriptors,actualFontStyle} from '../../shared/font-profile'
initDB();const db=getDB();db.prepare('DELETE FROM fonts').run()
const file=path.resolve('static/fonts/example.woff');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'font fixture');const stat=fs.statSync(file)
const p:any={version:1,status:'verified',source_url:'/static/fonts/example.woff',browser_loaded:true,weight:700,width:3,italic:true,axes:[],coverage:[[32,126],[0x1ea0,0x1ef9]],bytes:stat.size,mtime_ms:stat.mtimeMs,checked_at:new Date().toISOString()}
assert(readFontProfile(p));assert(supportsText(p,'HELLO'));assert(supportsText(p,'hạnh'));assert(!supportsText(p,'你好'));assert(!supportsText(null,'Hello'))
assert.deepEqual(actualFontStyle(p,400,false),{weight:700,italic:true});assert.equal(fontDescriptors(p)[0].stretch,'75%')
const variable={...p,italic:false,axes:[{tag:'wght',min:100,max:900,default:400},{tag:'ital',min:0,max:1,default:0}]};assert.equal(fontDescriptors(variable).length,2);assert.equal(fontDescriptors(variable)[0].weight,'100 900');assert.deepEqual(actualFontStyle(variable,950,true),{weight:900,italic:true})
assert.equal(readFontProfile({...p,status:'partial'}),null);assert.equal(readFontProfile(p,'changed'),null)
const row:any={woff:p.source_url,technical:JSON.stringify(p)};assert(verifiedFontProfile(row));fs.appendFileSync(file,'changed');assert.equal(verifiedFontProfile(row),null);fs.writeFileSync(file,'font fixture');const current=fs.statSync(file);p.mtime_ms=current.mtimeMs
const insert=db.prepare("INSERT INTO fonts(alias,value,woff,technical,category,tags) VALUES (?,?,?,?,?,?)")
insert.run('Verified','verified',p.source_url,JSON.stringify(p),'sans','["manual tag"]');insert.run('Unknown','unknown',p.source_url,'{}','sans','[]');insert.run('Partial','partial',p.source_url,JSON.stringify({...p,status:'partial'}),'sans','[]')
assert.deepEqual(libraryFonts().map(f=>f.value),['verified']);assert.equal(db.prepare('SELECT tags FROM fonts WHERE value=?').get('verified').tags,'["manual tag"]')
console.log('PASS verified catalog, glyph coverage, exact content, real variants, stale files and unknown/partial exclusion')
