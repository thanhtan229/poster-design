import { initDB, getDB } from '../../service/src/db'
import router, { migrateCanvasSizes } from '../../service/src/tinix/canvasSizes'
import { register } from '../../service/src/utils/auth'
import { createToken } from '../../service/src/utils/auth'
const express = require('../../service/node_modules/express')
const assert = require('assert')
async function main() {
  initDB(); const db = getDB(), app = express(); app.use(express.json()); app.use(router)
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r))
  const base = `http://127.0.0.1:${server.address().port}/api/tinix/canvas-sizes`
  const token1 = register('tester-a','test-password')!.token, token2 = register('tester-b','test-password')!.token
  async function request(path='', body?: any, token=token1) { const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}); return r.json() as any }
  try {
    assert.equal((await request('',undefined,'')).code,401)
    let rows=(await request()).result.list; const count=rows.length
    assert(count >= 40); assert.equal(rows.filter((s:any)=>s.category==='TikTok').length,4)
    migrateCanvasSizes(db); assert.equal((await request()).result.list.length,count)
    const payload={name:'TEST shared',category:'Khác',width:5.08,height:15.24,unit:'cm',dpi:300}
    assert.equal((await request('/save',payload)).code,200)
    let row=(await request('',undefined,token2)).result.list.find((s:any)=>s.name===payload.name)
    assert.equal(row.width,5.08); const id=row.id
    assert.equal((await request('/save',{...row,name:'Updated'},token2)).code,200)
    assert.equal((await request('/save',{...row,name:'Stale'})).code,400)
    row=(await request()).result.list.find((s:any)=>s.id===id)
    assert.equal(row.updated_by,'tester-b')
    for (const action of ['hide','show','delete','restore']) {
      assert.equal((await request('/state',{id,version:row.version,action})).code,200)
      row=(await request()).result.list.find((s:any)=>s.id===id)
    }
    await request('/state',{id,action:'favorite'})
    assert.equal((await request()).result.list.find((s:any)=>s.id===id).favorite,1)
    assert.equal((await request('',undefined,token2)).result.list.find((s:any)=>s.id===id).favorite,0)
    await request('/state',{id,action:'unfavorite'})
    assert.equal((await request('/save',{...payload,width:-1})).code,400)
    await request('/state',{id,version:row.version,action:'delete'}); migrateCanvasSizes(db)
    assert.equal((await request()).result.list.find((s:any)=>s.id===id).deleted,1)
    console.log('PASS: authentication, shared CRUD across two accounts, decimals, conflict, hide/show, delete/restore, isolated favorites, seed persistence')
  } finally { server.close() }
}
main().catch(e=>{console.error(e);process.exit(1)})
