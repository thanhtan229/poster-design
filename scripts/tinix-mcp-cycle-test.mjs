import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import assert from 'node:assert/strict'
const sharp = createRequire(import.meta.url)('../service/node_modules/sharp')
const base = process.env.TINIX_APP_URL || 'http://127.0.0.1:7001', dir = path.resolve('.runtime', 'mcp-cycle-' + Date.now())
await mkdir(dir, { recursive: true })
const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('scripts/tinix-mcp.mjs')], cwd: process.cwd(), env: { ...process.env, TINIX_APP_URL: base }, stderr: 'pipe' })
const client = new Client({ name: 'tinix-cycle-test', version: '1.0.0' }), report = { pass: false, artifacts: dir, comparisons: [], designs: [] }
async function invoke(mode, command, tool, args) {
  if (mode === 'mcp') {
    const response = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 300000 })
    if (response.isError) throw new Error(JSON.stringify(response))
    return JSON.parse(response.content[0].text)
  }
  return await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['scripts/tinix-cli.mjs', ...command.split(' '), ...Object.entries(args).flatMap(([k,v]) => ['--' + k, v]), '--url', base])
    let out = '', err = ''; p.stdout.on('data', b => out += b); p.stderr.on('data', b => err += b)
    p.on('error', reject); p.on('close', code => { try { code ? reject(new Error(err)) : resolve(JSON.parse(out)) } catch (e) { reject(e) } })
  })
}
async function pixelEqual(a,b) {
  const x = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject:true }), y = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject:true })
  assert.equal(x.info.width,y.info.width); assert.equal(x.info.height,y.info.height); assert(x.data.equals(y.data), `${a} and ${b} differ`)
}
try {
  await client.connect(transport)
  const source = path.join(dir, 'source.png')
  await sharp('service/static/photos/a0e4c310d56fc1fb5b472f1b3b12287a7a64ba32.jpg').rotate().resize({ width: 638 }).png().toFile(source)
  const initial = {}
  for (const mode of ['mcp','cli']) {
    initial[mode] = path.join(dir, mode + '-cutout.png')
    const r = await invoke(mode, 'cutout run', 'cutout_run', { input:source, output:initial[mode] }); report[mode+'Birefnet'] = r
  }
  await pixelEqual(initial.mcp, initial.cli); report.comparisons.push('BiRefNet PNG pixels')
  const rgba = await sharp(initial.mcp).ensureAlpha().raw().toBuffer({resolveWithObject:true}); let patch
  for(let y=10;y<rgba.info.height-5&&!patch;y++) for(let x=10;x<rgba.info.width-5&&!patch;x++) {
    let solid=true; for(let dy=0;dy<5;dy++) for(let dx=0;dx<5;dx++) if(rgba.data[((y+dy)*rgba.info.width+x+dx)*4+3]!==255) solid=false
    if(solid) patch={x,y,width:5,height:5}
  }
  assert(patch)
  const erase = path.join(dir,'erase.json'), restore = path.join(dir,'restore.json')
  await writeFile(erase,JSON.stringify([{shape:'rect',mode:'erase',...patch}])); await writeFile(restore,JSON.stringify([{shape:'rect',mode:'restore',...patch}]))
  const outputs = {}
  for (const mode of ['mcp','cli']) {
    const damaged=path.join(dir,mode+'-damaged.png'), edited=path.join(dir,mode+'-edited.png'), draft=path.join(dir,mode+'-template.json'), placed=path.join(dir,mode+'-placed.json'), preview=path.join(dir,mode+'-preview.png')
    await invoke(mode,'cutout edit','cutout_edit',{source,input:initial[mode],operations:erase,output:damaged})
    await invoke(mode,'cutout edit','cutout_edit',{source,input:damaged,operations:restore,output:edited})
    await invoke(mode,'drafts create','draft_create',{width:'1200',height:'900',output:draft})
    const layout=JSON.parse(await readFile(draft,'utf8'));layout.global.backgroundColor='#d8e4f0ff'
    layout.layers.push({uuid:'subject',name:'subject',type:'w-image',left:350,top:90,width:500,height:720,parent:'-1',templateRole:'subject',templateAnchor:'bottom',printRole:'raised',slot:true,imgUrl:'',opacity:1,zoom:1,rotate:0,radius:0,transform:'',mask:'',flip:'',isNinePatch:false,setting:[],record:{width:500,height:720,minWidth:10,minHeight:10,dir:'all'}})
    await writeFile(draft,JSON.stringify(layout))
    await invoke(mode,'cutout place','cutout_place',{input:draft,id:'subject',source,cutout:edited,mm:'1.5',output:placed})
    await invoke(mode,'drafts render','draft_render',{input:placed,output:preview})
    const design = await invoke(mode,'designs create','design_create',{input:placed,title:'MCP CLI temporary comparison'}); report.designs.push(design.id)
    const exported=await invoke(mode,'collage export','collage_export',{id:String(design.id),directory:path.join(dir,mode+'-export')})
    assert.equal(exported.files.length,3); outputs[mode]={edited,placed,preview,exported}
  }
  await pixelEqual(outputs.mcp.edited,outputs.cli.edited); report.comparisons.push('edited mask pixels')
  assert.deepEqual(JSON.parse(await readFile(outputs.mcp.placed,'utf8')),JSON.parse(await readFile(outputs.cli.placed,'utf8'))); report.comparisons.push('layout, frame, image and border')
  await pixelEqual(outputs.mcp.preview,outputs.cli.preview); report.comparisons.push('preview pixels')
  for(let i=0;i<3;i++) await pixelEqual(outputs.mcp.exported.files[i],outputs.cli.exported.files[i])
  report.comparisons.push('base, cut sheet and finished image pixels')
  const view=await client.callTool({name:'view_image',arguments:{file:outputs.mcp.preview}});assert.equal(view.content[1].type,'image')
  report.comparisons.push('MCP image content returned'); report.pass=true
} catch(error) { report.error=String(error.stack||error); process.exitCode=1 }
finally {
  for(const id of report.designs) try { const r=await fetch(base+'/design/poster/del',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})}); assert.equal((await r.json()).code,200) } catch(e) { report.cleanupError=String(e); report.pass=false; process.exitCode=1 }
  await client.close(); await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}
