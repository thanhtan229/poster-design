#!/usr/bin/env node
// [TINIX] Acceptance test on the host that owns the real saved job.
// No customer files are committed, uploaded or added to the template library.
// Usage:
// node scripts/tinix-mcp/material-export-live-smoke.mjs JOB_ID SOURCE_KIT.zip [MCP_RUNTIME_ROOT]
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runMaterialExport } from './material-export.mjs'
import { readMaterialJob } from './subject-edit.mjs'
import { instantiate } from '../tinix-instantiate.mjs'
import { renderMaterialLayout } from './draft-render.mjs'
import { prepareMaterialDraft } from '../lib/material-archive-cli.mjs'

const require = createRequire(import.meta.url)
const sharp = require('../../service/node_modules/sharp')
const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const FILE = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(FILE), '../..')
const [jobId, sourceZip, runtime] = process.argv.slice(2)
const cropFields = ['fit', 'zoom', 'cropX', 'cropY', 'transform'] // [TINIX]

function fromData(url) {
  if (typeof url !== 'string' || !url.startsWith('data:image/png;base64,')) {
    throw new Error('SAVED_JOB_MISSING_PNG_INPUT')
  }
  return Buffer.from(url.slice('data:image/png;base64,'.length), 'base64')
}

async function compare(a, b) {
  const A = await sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const B = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(A.info.width, B.info.width, 'WIDTH_CHANGED_AFTER_REIMPORT')
  assert.equal(A.info.height, B.info.height, 'HEIGHT_CHANGED_AFTER_REIMPORT')
  let sum = 0, bad = 0
  const length = A.info.width * A.info.height
  for (let i = 0; i < length; i++) {
    const j = 3 * i
    const err = (Math.abs(A.data[j] - B.data[j])
      + Math.abs(A.data[j+1] - B.data[j+1])
      + Math.abs(A.data[j+2] - B.data[j+2])) / 3
    sum += err
    if (err > 30) bad++
  }
  return {
    width: A.info.width, height: A.info.height,
    imageMae255: Number((sum / length).toFixed(4)),
    badFractionAbove30: Number((bad / length).toFixed(5)),
  }
}

async function main() {
  if (!ID.test(jobId || '') || !sourceZip) throw new Error('Usage: node material-export-live-smoke.mjs JOB_ID SOURCE_KIT.zip [RUNTIME_ROOT]')
  const root = runtime ? path.resolve(runtime) : path.join(repoRoot, '.runtime', 'mcp-material')
  // [TINIX] Fail before creating any export state when the required original ZIP is absent.
  await access(path.resolve(sourceZip)).catch(error => {
    if (error.code === 'ENOENT') throw new Error('SOURCE_KIT_NOT_FOUND: ' + path.basename(sourceZip))
    throw error
  })
  const original = await readMaterialJob(root, jobId)
  assert.equal(original.report.status, 'rendered')
  assert.equal(original.report.photoSlots?.length, 6)
  assert.ok(original.subject?.cutoutEdit?.sourceUrl)
  assert.ok(original.subject?.cutoutEdit?.cutoutUrl)
  const exportResult = await runMaterialExport(root, jobId, path.resolve(sourceZip), AbortSignal.timeout(240000))
  assert.equal(exportResult.structuredContent.qa.importer, 'passed')
  assert.equal(exportResult.structuredContent.qa.sourceReconstruction, 'static_regions_passed')
  const kit = path.join(root, jobId, 'material-export', 'material.zip')
  const opened = await prepareMaterialDraft(kit)
  assert.equal(opened.report?.status, 'ready', 'MATERIAL_REIMPORT_FAILED')
  assert.equal(opened.report.photoSlots?.length, 6)
  const originalPhotos = new Map()
  for (const slot of original.report.photoSlots) {
    const layer = original.layout.layers.find(layer => layer.uuid === slot.id && layer.templateRole === 'photo')
    if (!layer?.imgUrl) throw new Error('PHOTO_SLOT_MISSING:' + slot.code)
    originalPhotos.set(slot.code, layer)
  }
  const temporary = await mkdtemp(path.join(tmpdir(), 'tinix-material-live-'))
  try {
    const frameBindings = {}
    for (let i = 1; i <= 6; i++) {
      const code = 'F' + String(i).padStart(2,'0')
      const dest = path.join(temporary, code + '.png')
      await writeFile(dest, fromData(originalPhotos.get(code).imgUrl))
      const slot = opened.report.photoSlots.find(slot => slot.code === code)
      assert.ok(slot?.id, 'REIMPORTED_SLOT_MISSING:' + code)
      frameBindings[slot.id] = { file: dest }
    }
    const source = path.join(temporary, 'subject-source.png')
    const alpha = path.join(temporary, 'subject-cutout.png')
    await writeFile(source, fromData(original.subject.cutoutEdit.sourceUrl))
    await writeFile(alpha, fromData(original.subject.cutoutEdit.cutoutUrl))
    const id = opened.draft.layers.find(layer => layer.templateRole === 'subject' && layer.slot)?.uuid
    assert.ok(id, 'REIMPORTED_SUBJECT_MISSING')
    frameBindings[id] = { source, cutout: alpha, mm: original.subject.templateBorderMm ?? .9 }
    const instantiated = await instantiate(opened.draft,
      { customer: 'TinixPoster local QA only', slots: frameBindings }, temporary)
    // [TINIX] The v1 archive declares placeholder geometry. Rebind the saved crop
    // settings with the saved images, and verify the edited cutout before rendering.
    const crop = {}
    for (const slot of opened.report.photoSlots) {
      const assigned = instantiated.layout.layers.find(layer => layer.uuid === instantiated.idMap[slot.id])
      assert.ok(assigned, 'REBOUND_PHOTO_SLOT_MISSING:' + slot.code)
      const saved = originalPhotos.get(slot.code)
      for (const field of cropFields) {
        if (Object.hasOwn(saved, field)) assigned[field] = saved[field]
        else delete assigned[field]
      }
      crop[slot.code] = Object.fromEntries(cropFields.map(field => [field, assigned[field] ?? null]))
    }
    const reboundSubject = instantiated.layout.layers.find(layer => layer.uuid === instantiated.idMap[id])
    assert.ok(reboundSubject?.cutoutEdit, 'REBOUND_SUBJECT_MASK_MISSING')
    // Compare decoded alpha pixels because placeCutout re-encodes the PNG.
    const alphaMask = value => sharp(fromData(value)).ensureAlpha().extractChannel('alpha').raw()
      .toBuffer({ resolveWithObject: true })
    const [savedMask, reboundMask] = await Promise.all([
      alphaMask(original.subject.cutoutEdit.cutoutUrl),
      alphaMask(reboundSubject.cutoutEdit.cutoutUrl),
    ])
    assert.equal(reboundMask.info.width, savedMask.info.width, 'SUBJECT_MASK_WIDTH_CHANGED')
    assert.equal(reboundMask.info.height, savedMask.info.height, 'SUBJECT_MASK_HEIGHT_CHANGED')
    assert.deepEqual(reboundMask.data, savedMask.data, 'EDITED_SUBJECT_ALPHA_CHANGED')
    // [TINIX] Keep the rebound draft in the private QA runtime for editor verification.
    const evidenceDir = path.join(root, jobId, 'material-export')
    await writeFile(path.join(evidenceDir, 'host-live-reimport.draft.json'), JSON.stringify(instantiated.layout))
    const newRender = await renderMaterialLayout(instantiated.layout, AbortSignal.timeout(150000))
    await writeFile(path.join(root, jobId, 'material-export', 'host-live-reimport.png'), newRender)
    const similarity = await compare(original.png, newRender)
    const fullPass = similarity.imageMae255 <= 5 && similarity.badFractionAbove30 <= .05
    const report = {
      jobId, status: fullPass ? 'pass' : 'blocked',
      note: 'Real host service, importer, six-photo replacement, stored SUBJECT alpha and render comparison.',
      zipSha256: exportResult.structuredContent.sha256,
      staticQa: exportResult.structuredContent.qa.staticReconstruction,
      ...similarity,
      reboundPhotoCrop: crop,
      editedSubjectAlphaPixelIdentical: true,
      editedSubjectAlphaSize: [savedMask.info.width, savedMask.info.height],
      guiInteraction: 'not_verified',
      persistedCustomerTemplate: false,
    }
    const reportPath = path.join(root, jobId, 'material-export', 'host-live-qa.json')
    await writeFile(reportPath, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    if (!fullPass) process.exitCode = 2
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(JSON.stringify({ status: 'blocked', reason: String(error?.message || error) }))
  process.exitCode = 2
})
