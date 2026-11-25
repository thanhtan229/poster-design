// [TINIX] Headless ZIP import uses the same PNG, placement and layer builders as the editor.
import { openMaterialArchive } from './material-archive'
import { checkMaterialArchive, hasMaterialArchiveWarnings } from './material-archive-check'
import { matchMaterialLayout } from './material-layout'
import { buildMaterialLayers, buildMaterialSubject, materialSubjectPosition, type MaterialImport } from './material-layers'
import { materialPoseScale } from './material-placement'
import { pieceBounds, pieceImage, previewMaterialPiece, sheetPieces, suggestSheetThreshold } from './material-sheet'
import { DEFAULT_DPI } from './units'

export async function runMaterialArchive(file: File) {
  const opened = await openMaterialArchive(file)
  const reportBase = { version: 1, archive: file.name }
  if (opened.kind === 'missing') {
    return { report: { ...reportBase, status: 'blocked', check: { fields: opened.fields }, reason: 'missing-fields' } }
  }
  const { image, manifest, guide, background, size } = opened
  const threshold = suggestSheetThreshold(image)
  const components = sheetPieces(image, threshold)
  const check = checkMaterialArchive(image, manifest.placements, components)
  const scanned = { ...reportBase, check, threshold }
  if (hasMaterialArchiveWarnings(check)) return { report: { ...scanned, status: 'blocked', reason: 'archive-warnings' } }

  const cards = components.map(piece => ({
    opening: previewMaterialPiece(image, piece, threshold, true).detectedOpening,
    bounds: pieceBounds(piece, image.width),
  }))
  const matches = matchMaterialLayout(manifest.placements,
    cards.map(card => ({ bounds: card.bounds, frame: Boolean(card.opening), edited: false })), size)
  const matchedCodes = new Set(matches.map(match => match.code))
  const mapped = {
    ...scanned, matched: matches.length,
    unmatchedCodes: manifest.placements.filter(item => !matchedCodes.has(item.code)).map(item => item.code),
    unassignedComponents: components.length - matches.length,
  }
  if (matches.length !== manifest.placements.length || matches.length !== components.length) {
    return { report: { ...mapped, status: 'blocked', reason: 'unmatched-pieces' } }
  }
  const pieces: MaterialImport['pieces'] = matches.map(({ index, pose }) => {
    const { opening } = cards[index]
    const role = opening ? 'frame' : 'sticker'
    const piece = pieceImage(image, components[index], threshold, role, opening, opening ? 'preserve' : undefined)
    const scale = materialPoseScale(pose, piece, guide, size.width)
    return { ...piece, index, role, pose: { ...pose, scale }, cutOuterOnly: pose.cutOuterOnly }
  })
  pieces.sort((a, b) => (a.pose?.layoutOrder ?? -1) - (b.pose?.layoutOrder ?? -1) ||
    Number(a.role === 'sticker') - Number(b.role === 'sticker') || a.index - b.index)

  const printSize = manifest.printSize ?? { width: guide.width, height: guide.height, dpi: DEFAULT_DPI }
  const pageId = '-1'
  const payload = { guide, background, width: image.width, height: image.height, pieces }
  const { layers, photoSlots } = buildMaterialLayers(payload, printSize, pageId)
  const { subject, subjectZ } = manifest
  if (subject && subjectZ !== undefined) {
    layers.splice(materialSubjectPosition(pieces, subjectZ), 0, buildMaterialSubject(subject, guide, printSize, pageId))
  }
  const draft = {
    global: { ...printSize, name: file.name.replace(/\.zip$/i, ''), type: 'page', uuid: pageId, left: 0, top: 0,
      backgroundColor: '#ffffffff', backgroundGradient: '', backgroundImage: background,
      backgroundTransform: {}, opacity: 1, record: {}, referenceGuide: guide },
    layers,
  }
  return { draft, report: { ...mapped, status: 'ready', printSize, printSizeFromLayout: Boolean(manifest.printSize),
    photos: pieces.filter(piece => piece.role === 'frame').length, subject: Boolean(subject),
    decorations: pieces.filter(piece => piece.role === 'sticker').length, photoSlots } } // [TINIX] MCP photo bindings.
}
