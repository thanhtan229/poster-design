// [TINIX] Safe, opt-in cleanup for temporary GUI QA assets.
// The checker only removes exact, job-owned filenames absent in the pre-run
// snapshot, and exact restored asset paths confirmed created by this run.
// It never deletes template library or pre-existing customer assets.
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'

const checksum = b => createHash('sha256').update(b).digest('hex')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const ASSET = /^\/static\/(photos|collage|user|favorites)\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|gif)$/i

export async function staticRootOf(explicitPath) {
  if (typeof explicitPath !== 'string' || !path.isAbsolute(explicitPath)) {
    throw Error('TINIX_QA_STATIC_ROOT_REQUIRED_ABSOLUTE')
  }
  const root = await realpath(explicitPath)
  const comparePath = value => process.platform==='win32' ? value.toLowerCase() : value
  if (comparePath(path.resolve(explicitPath))!==comparePath(root)) {
    throw Error('TINIX_QA_STATIC_ROOT_MUST_BE_CANONICAL')
  }
  if (!['static', 'cache'].includes(path.basename(root).toLowerCase())) {
    throw Error('TINIX_QA_STATIC_ROOT_MUST_END_STATIC_OR_CACHE')
  }
  return root
}

function designIdOf(value) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw Error('INVALID_QA_DESIGN_ID')
  return String(id)
}

export function matchesQaScreenshot(name, id) {
  const prefix = designIdOf(id)
  return name === prefix + '-cover.jpg' ||
    name === prefix + '-screenshot.png' ||
    new RegExp('^' + prefix + '-screenshot-[a-zA-Z0-9_-]+\\.png$').test(name)
}

export async function snapshotStatic(root) {
  const validated = await staticRootOf(root)
  const items = await readdir(validated)
  return new Set(items)
}

async function fileInfo(file) {
  try {
    const stat = await lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('QA_CLEANUP_NOT_PLAIN_FILE:' + path.basename(file))
    return {dev:stat.dev, ino:stat.ino, size:stat.size, mtime:stat.mtimeMs, ctime:stat.ctimeMs}
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

const sameInfo = (a,b) => Boolean(a && b && Object.keys(a).every(key => a[key]===b[key]))

async function fingerprint(file) {
  const before=await fileInfo(file)
  if (!before) return null
  const bytes=await readFile(file)
  if (!sameInfo(before,await fileInfo(file))) throw Error('QA_FILE_CHANGED_WHILE_HASHING:'+path.basename(file))
  return {...before,sha256:checksum(bytes)}
}

export async function resolveRestoredAsset(root, url) {
  const trusted = await staticRootOf(root)
  if (typeof url !== 'string' || !ASSET.test(url) || url.includes('..') ||
      url.includes('\\') || url.includes('\0') || url.includes('//')) {
    throw Error('UNSAFE_QA_ASSET_URL')
  }
  const resolved = path.resolve(trusted, url.slice('/static/'.length))
  if (!resolved.startsWith(trusted + path.sep)) throw Error('ASSET_OUTSIDE_STATIC_ROOT')
  const relative = path.relative(trusted, resolved).split(path.sep)
  if (!['photos', 'collage', 'user', 'favorites'].includes(relative[0])) throw Error('UNSAFE_ASSET_DIRECTORY')
  // Never traverse an existing symlinked parent: even a lexically safe
  // /static/photos/X can point outside the static tree.
  let parent=path.dirname(resolved)
  while (parent!==trusted) {
    try {
      const item=await lstat(parent)
      if (!item.isDirectory() || item.isSymbolicLink()) throw Error('UNSAFE_ASSET_PARENT')
    } catch(e) {
      if (e?.code!=='ENOENT') throw e
    }
    const next=path.dirname(parent)
    if(next===parent) throw Error('ASSET_PARENT_ROOT_MISMATCH')
    parent=next
  }
  return resolved
}

export async function startQaAssetTracking(root, url, bytes) {
  const dest = await resolveRestoredAsset(root, url)
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw Error('ASSET_REQUEST_BYTES_REQUIRED')
  const before = await fileInfo(dest)
  return { url, sha256:checksum(bytes), beforeExisted:Boolean(before) }
}

// Pass only a local-asset write that the backend explicitly acknowledged as {written:true}.
// If the file already existed, it is protected even if the remote says written.
export async function recordRestoredAsset(root, attempt, response) {
  if (!attempt || response?.written !== true || attempt.beforeExisted) return null
  const dest = await resolveRestoredAsset(root, attempt.url)
  const recorded=await fingerprint(dest)
  if (recorded?.sha256 !== attempt.sha256) throw Error('RESTORED_ASSET_HASH_MISMATCH')
  return {url:attempt.url,...recorded}
}

// Avoid racing asynchronous server cover generation: require both ID-specific
// cover and screenshot outputs stable before deleting any generated QA file.
export async function awaitCoverSettled(root, id, {timeoutMs=35000, pollMs=300, stableMs=900, ready,
  ownedScreenshotNames=[]}={}) {
  const trusted = await staticRootOf(root)
  const prefix = designIdOf(id)
  const required=[prefix+'-cover.jpg',prefix+'-screenshot.png']
  if (ownedScreenshotNames.some(name=>!matchesQaScreenshot(name,prefix))) throw Error('UNSAFE_QA_SCREENSHOT_NAME')
  const owned=new Set([...required,...ownedScreenshotNames])
  const started=Date.now()
  let last='', stableSince=0
  let acknowledged=false
  while (Date.now()-started < timeoutMs) {
    // [TINIX] Start measuring stability only after the server acknowledges completion.
    acknowledged ||= ready ? await ready() : true
    const names=acknowledged ? (await readdir(trusted)).filter(name=>owned.has(name)).sort() : []
    const infos=await Promise.all(names.map(name=>fileInfo(path.join(trusted,name))))
    const key=names.length===owned.size && infos.every(Boolean) ? JSON.stringify([names,infos]) : ''
    if (key && key===last && Date.now()-stableSince>=stableMs) {
      const files=await Promise.all(names.map(async(name,i)=>{
        const record=await fingerprint(path.join(trusted,name))
        return sameInfo(infos[i],record) ? {name,...record} : null
      }))
      if (files.every(Boolean)) return {complete:true,files}
    }
    if (key!==last) {last=key;stableSince=Date.now()}
    await pause(pollMs)
  }
  return { complete:false, files:[], reason:'COVER_GENERATION_NOT_SETTLED' }
}

export async function cleanupQaArtifacts({staticRoot, designId, baselineNames, restoredAssets=[], coverReady}) {
  const root=await staticRootOf(staticRoot)
  const id=designIdOf(designId)
  if (!(baselineNames instanceof Set)) throw Error('QA_BASELINE_REQUIRED')
  const names=(await readdir(root)).filter(name=>matchesQaScreenshot(name,id)).sort()
  const before=new Set(names)
  const removed=[], retained=[]
  const fingerprints=new Map(coverReady?.complete ? (coverReady.files ?? []).map(file=>[file.name,file]) : [])
  for (const name of names) {
    if (baselineNames.has(name)) {
      retained.push({name,reason:'PRE_EXISTING'})
      continue
    }
    const file=path.join(root,name)
    const recorded=fingerprints.get(name)
    if (!recorded) {
      retained.push({name,reason:'OWNERSHIP_UNVERIFIED'})
      continue
    }
    const current=await fingerprint(file)
    if (!sameInfo(current,recorded)) {
      retained.push({name,reason:'CONTENT_CHANGED'})
      continue
    }
    await unlink(file)
    removed.push(name)
  }
  for (const entry of restoredAssets) {
    const target=await resolveRestoredAsset(root,entry.url)
    const current=await fingerprint(target)
    if (!current) {retained.push({name:entry.url,reason:'ALREADY_ABSENT'});continue}
    if (!sameInfo(current,entry)) {
      retained.push({name:entry.url,reason:'CONTENT_CHANGED'})
      continue
    }
    await unlink(target)
    removed.push(entry.url)
  }
  await pause(500)
  const remaining=(await readdir(root)).filter(name=>matchesQaScreenshot(name,id)&&!baselineNames.has(name)).sort()
  const stillRestored=[]
  for(const entry of restoredAssets)if(await fileInfo(await resolveRestoredAsset(root,entry.url)))stillRestored.push(entry.url)
  const pass=Boolean(coverReady?.complete) && remaining.length===0 && stillRestored.length===0 &&
    !retained.some(x=>x.reason!=='ALREADY_ABSENT') &&
    removed.some(name=>name===id+'-cover.jpg') && removed.some(name=>name===id+'-screenshot.png')
  return {
    status:pass?'pass':'blocked',
    designId:Number(id),coverReady:coverReady||{complete:false},
    expectedSnapshotCount:baselineNames.size,
    foundArtifacts:[...before],deleted:removed,
    preserved:retained, remaining, remainingRestored:stillRestored,
    scope:'Only files created by this QA run, exact design ID and confirmed restored asset URL/hash',
  }
}
