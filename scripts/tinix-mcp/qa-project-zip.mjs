// [TINIX] Minimal ZIP store writer for synthetic local-project GUI QA.
// No customer data or image assets are embedded by this module.
const TABLE = Array.from({length:256},(_,i)=>{
  let c=i
  for(let k=0;k<8;k++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1)
  return c>>>0
})

export function crc32(buffer) {
  let crc=0xffffffff
  for(const byte of buffer)crc=(TABLE[(crc^byte)&255]^(crc>>>8))>>>0
  return (crc^0xffffffff)>>>0
}

export function makeStoredZip(entries) {
  if(!Array.isArray(entries)||entries.length===0||entries.length>100) throw Error('QA_ZIP_BAD_ENTRY_COUNT')
  const body=[],directory=[],names=new Set()
  let offset=0,centralSize=0
  for(const entry of entries) {
    const name=entry?.name
    if(typeof name!=='string'||!name||name.startsWith('/')||name.includes('\\')||
      name.split('/').some(segment=>!segment||segment==='.'||segment==='..'))throw Error('QA_ZIP_UNSAFE_NAME')
    if(names.has(name))throw Error('QA_ZIP_DUPLICATE_NAME')
    names.add(name)
    if(!Buffer.isBuffer(entry.bytes))throw Error('QA_ZIP_BYTES_REQUIRED')
    const path=Buffer.from(name,'utf8'),data=entry.bytes
    if(path.length>65535||data.length>128*1024*1024||offset+30+path.length+data.length>0xffffffff)
      throw Error('QA_ZIP_TOO_LARGE')
    const crc=crc32(data),local=Buffer.alloc(30),header=Buffer.alloc(46)
    local.writeUInt32LE(0x04034b50,0)
    local.writeUInt16LE(20,4)
    local.writeUInt16LE(0x800,6) // UTF-8
    local.writeUInt32LE(crc,14)
    local.writeUInt32LE(data.length,18)
    local.writeUInt32LE(data.length,22)
    local.writeUInt16LE(path.length,26)
    header.writeUInt32LE(0x02014b50,0)
    header.writeUInt16LE(20,4)
    header.writeUInt16LE(20,6)
    header.writeUInt16LE(0x800,8)
    header.writeUInt32LE(crc,16)
    header.writeUInt32LE(data.length,20)
    header.writeUInt32LE(data.length,24)
    header.writeUInt16LE(path.length,28)
    header.writeUInt32LE(offset,42)
    body.push(local,path,data)
    directory.push(header,path)
    offset+=local.length+path.length+data.length
    centralSize+=header.length+path.length
  }
  if(offset+centralSize+22>0xffffffff)throw Error('QA_ZIP_TOO_LARGE')
  const end=Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50,0)
  end.writeUInt16LE(entries.length,8)
  end.writeUInt16LE(entries.length,10)
  end.writeUInt32LE(centralSize,12)
  end.writeUInt32LE(offset,16)
  return Buffer.concat([...body,...directory,end])
}
