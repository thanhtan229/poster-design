import assert from 'node:assert/strict'
import { test } from 'node:test'
import { crc32, makeStoredZip } from './qa-project-zip.mjs'

function unpackStore(archive) {
  const count=archive.readUInt16LE(archive.length-12)
  const offset=archive.readUInt32LE(archive.length-6)
  let p=offset
  const files=new Map()
  for(let i=0;i<count;i++) {
    assert.equal(archive.readUInt32LE(p),0x02014b50)
    assert.equal(archive.readUInt16LE(p+10),0)
    const size=archive.readUInt32LE(p+24)
    const len=archive.readUInt16LE(p+28)
    const extra=archive.readUInt16LE(p+30)
    const comment=archive.readUInt16LE(p+32)
    const name=archive.subarray(p+46,p+46+len).toString('utf8')
    const local=archive.readUInt32LE(p+42)
    assert.equal(archive.readUInt32LE(local),0x04034b50)
    assert.equal(archive.readUInt32LE(local+18),size)
    const start=local+30+archive.readUInt16LE(local+26)+archive.readUInt16LE(local+28)
    const bytes=archive.subarray(start,start+size)
    assert.equal(crc32(bytes),archive.readUInt32LE(p+16))
    files.set(name,Buffer.from(bytes))
    p+=46+len+extra+comment
  }
  assert.equal(p,archive.length-22)
  return files
}

test('synthetic local project ZIP has exact names, uncompressed payload and CRC',()=>{
  const design=Buffer.from('{"format":"tinix-design","version":2,"layouts":[]}')
  const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0])
  const zip=makeStoredZip([
    {name:'design.json',bytes:design},
    {name:'assets/static/photos/qa-missing-001.png',bytes:png},
  ])
  assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50)
  assert.equal(zip.readUInt16LE(zip.length-12),2)
  const entries=unpackStore(zip)
  assert.deepEqual([...entries.keys()],['design.json','assets/static/photos/qa-missing-001.png'])
  assert.deepEqual(entries.get('design.json'),design)
  assert.deepEqual(entries.get('assets/static/photos/qa-missing-001.png'),png)
})

test('unsafe, duplicate and ambiguous ZIP paths are blocked',()=>{
  for(const name of ['','/static/photos/x.png','assets\\static\\x.png','assets/../design.json',
    'assets//x.png','assets/./x.png']) {
    assert.throws(()=>makeStoredZip([{name,bytes:Buffer.from('a')}]),/QA_ZIP_UNSAFE_NAME/)
  }
  assert.throws(()=>makeStoredZip([
    {name:'design.json',bytes:Buffer.from('a')},
    {name:'design.json',bytes:Buffer.from('b')},
  ]),/QA_ZIP_DUPLICATE_NAME/)
  assert.throws(()=>makeStoredZip([]),/QA_ZIP_BAD_ENTRY_COUNT/)
  assert.throws(()=>makeStoredZip([{name:'a',bytes:'text'}]),/QA_ZIP_BYTES_REQUIRED/)
})
