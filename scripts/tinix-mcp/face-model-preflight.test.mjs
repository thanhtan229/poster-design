import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkYuNetPreflight, resolveYuNetSettings } from './face-model-preflight.mjs'

async function fixture(run) {
  const root=await mkdtemp(path.join(tmpdir(),'tinix-yunet-preflight-'))
  try { await run(root) } finally { await rm(root,{recursive:true,force:true}) }
}
const dummyProbe = async () => {}

test('fallback path matches production runtime without altering process.env',async()=>{
  await fixture(async root=>{
    const model=path.join(root,'.runtime','face-crop','yunet.onnx')
    assert.equal(resolveYuNetSettings({env:{},repoRoot:root,cwd:root}).modelPath,model)
    await mkdir(path.dirname(model),{recursive:true})
    await writeFile(model,Buffer.from('unit-only synthetic bytes'))
    const before=process.env.TINIX_FACE_MODEL
    const actual=await checkYuNetPreflight({env:{},repoRoot:root,cwd:root,pythonProbe:dummyProbe})
    assert.equal(actual.status,'pass')
    assert.equal(actual.modelPath,model)
    assert.equal(actual.bytes,25)
    assert.equal(process.env.TINIX_FACE_MODEL,before)
  })
})

test('explicit TINIX_FACE_MODEL override wins over a missing default path',async()=>{
  await fixture(async root=>{
    const file=path.join(root,'known-yunet.onnx')
    await writeFile(file,'fake bytes for unit test only')
    let called=false
    const result=await checkYuNetPreflight({
      env:{TINIX_FACE_MODEL:file,TINIX_FACE_PYTHON:'my-python'},
      cwd:root,repoRoot:path.join(root,'missing-repo'),
      pythonProbe:async (model,python)=>{called=true;assert.equal(model,file);assert.equal(python,'my-python')},
    })
    assert(called)
    assert.equal(result.python,'my-python')
    assert.equal(result.modelPath,file)
  })
})

test('relative model path resolves from cwd, matching runtime existsSync',async()=>{
  await fixture(async root=>{
    await mkdir(path.join(root,'models'))
    const file=path.join(root,'models','yunet.onnx')
    await writeFile(file,'a')
    const result=await checkYuNetPreflight({env:{TINIX_FACE_MODEL:'models/yunet.onnx'},
      cwd:root,repoRoot:path.join(root,'ignored'),pythonProbe:dummyProbe})
    assert.equal(result.modelPath,file)
  })
})

test('missing model fails early with a descriptive environment hint',async()=>{
  await fixture(async root=>{
    const file=path.join(root,'absent.onnx')
    await assert.rejects(checkYuNetPreflight({
      env:{TINIX_FACE_MODEL:file},repoRoot:root,cwd:root,pythonProbe:dummyProbe,
    }),error=>error.code==='YUNET_MODEL_MISSING'&&error.message.includes('TINIX_FACE_MODEL=')&&
      error.message.includes('TINIX_FACE_PYTHON='))
  })
})

test('empty file is rejected before Python is started',async()=>{
  await fixture(async root=>{
    const file=path.join(root,'empty.onnx')
    await writeFile(file,Buffer.alloc(0))
    await assert.rejects(checkYuNetPreflight({env:{TINIX_FACE_MODEL:file},
      repoRoot:root,cwd:root,pythonProbe:()=>{throw Error('MUST_NOT_RUN')}}),
    {code:'YUNET_MODEL_EMPTY'})
  })
})

test('directory masquerading as .onnx is rejected',async()=>{
  await fixture(async root=>{
    const file=path.join(root,'directory.onnx')
    await mkdir(file)
    await assert.rejects(checkYuNetPreflight({
      env:{TINIX_FACE_MODEL:file},repoRoot:root,cwd:root,pythonProbe:dummyProbe,
    }),{code:'YUNET_MODEL_NOT_A_FILE'})
  })
})

test('missing Python path is rejected after verifying the model file',async()=>{
  await fixture(async root=>{
    const file=path.join(root,'exists.onnx')
    await writeFile(file,'only a fake model for preflight availability')
    await assert.rejects(checkYuNetPreflight({env:{
      ...process.env,TINIX_FACE_MODEL:file,TINIX_FACE_PYTHON:path.join(root,'python-missing'),
    },repoRoot:root,cwd:root}),{code:'YUNET_PYTHON_MISSING'})
  })
})

test('unusable Python executable is rejected (never mistaken for a pass)',async()=>{
  await fixture(async root=>{
    const file=path.join(root,'exists.onnx')
    await writeFile(file,'fake model for validating fail-closed probe')
    await assert.rejects(checkYuNetPreflight({env:{
      ...process.env,TINIX_FACE_MODEL:file,TINIX_FACE_PYTHON:process.execPath,
    },repoRoot:root,cwd:root}),{code:'YUNET_PYTHON_PROBE_FAILED'})
  })
})
