// [TINIX] Fail-fast YuNet prerequisite check for isolated Windows E2E harnesses.
// Mirrors scripts/lib/photo-faces.cjs; does not alter production face inference.
import { execFile } from 'node:child_process'
import { access, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))

// Check the exact OpenCV API used by scripts/tinix-detect-faces.py.
// Never download, copy, or modify models.
const pythonCheck = [
  'import sys',
  'try:',
  ' import cv2',
  'except Exception:',
  ' sys.exit(20)',
  'if not hasattr(cv2, "FaceDetectorYN"):',
  ' sys.exit(21)',
  'try:',
  ' detector = cv2.FaceDetectorYN.create(sys.argv[1], "", (320, 320), 0.65, 0.3, 100)',
  ' if detector is None:',
  '  sys.exit(22)',
  'except Exception:',
  ' sys.exit(22)',
  'print("YUNET_PREFLIGHT_OK")',
].join('\n')

function fail(code, detail, modelPath, python) {
  const suffix = 'TINIX_FACE_MODEL=' + modelPath + '; TINIX_FACE_PYTHON=' + python + '. ' +
    'Set TINIX_FACE_MODEL to a readable YuNet .onnx file and ' +
    'TINIX_FACE_PYTHON to Python with OpenCV (cv2.FaceDetectorYN).'
  const error = new Error(code + ': ' + detail + '. ' + suffix)
  error.code = code
  return error
}

export function resolveYuNetSettings({
  env = process.env, cwd = process.cwd(), repoRoot = root,
} = {}) {
  // Match runtime: process.env.TINIX_FACE_MODEL || repository default.
  const model = env.TINIX_FACE_MODEL || path.join(repoRoot, '.runtime', 'face-crop', 'yunet.onnx')
  const python = env.TINIX_FACE_PYTHON || 'python'
  return { modelPath: path.resolve(cwd, model), python }
}

export async function probeYuNetPython(modelPath, python, env = process.env) {
  try {
    const result = await execute(python, ['-c', pythonCheck, modelPath], {
      env, timeout: 15000, maxBuffer: 8192, windowsHide: true,
    })
    if (!result.stdout.includes('YUNET_PREFLIGHT_OK')) {
      throw Object.assign(new Error('Missing positive Python probe response'), { code: 'INVALID_PROBE_OUTPUT' })
    }
  } catch (error) {
    if (error.code === 'ENOENT') throw fail('YUNET_PYTHON_MISSING', 'Python executable not found', modelPath, python)
    if (error.code === 20) throw fail('YUNET_OPENCV_MISSING', 'Python cannot import cv2', modelPath, python)
    if (error.code === 21) throw fail('YUNET_FACEDETECTORYN_MISSING', 'OpenCV lacks FaceDetectorYN', modelPath, python)
    if (error.code === 22) throw fail('YUNET_MODEL_LOAD_FAILED', 'OpenCV cannot initialize YuNet', modelPath, python)
    if (error.killed || error.signal) throw fail('YUNET_PYTHON_TIMEOUT', 'YuNet probe timed out', modelPath, python)
    throw fail('YUNET_PYTHON_PROBE_FAILED', 'YuNet Python probe failed', modelPath, python)
  }
}

export async function checkYuNetPreflight({
  env = process.env, cwd = process.cwd(), repoRoot = root, pythonProbe = probeYuNetPython,
} = {}) {
  const { modelPath, python } = resolveYuNetSettings({ env, cwd, repoRoot })
  let modelStat
  try {
    modelStat = await stat(modelPath)
  } catch (error) {
    if (error?.code === 'ENOENT') throw fail('YUNET_MODEL_MISSING', 'YuNet model not found', modelPath, python)
    if (error?.code === 'EACCES' || error?.code === 'EPERM') {
      throw fail('YUNET_MODEL_UNREADABLE', 'YuNet model is inaccessible', modelPath, python)
    }
    throw fail('YUNET_MODEL_STAT_FAILED', 'Cannot inspect YuNet model', modelPath, python)
  }
  if (!modelStat.isFile()) throw fail('YUNET_MODEL_NOT_A_FILE', 'YuNet path is not a regular file', modelPath, python)
  if (modelStat.size <= 0) throw fail('YUNET_MODEL_EMPTY', 'YuNet model is empty', modelPath, python)
  try {
    await access(modelPath, constants.R_OK)
  } catch {
    throw fail('YUNET_MODEL_UNREADABLE', 'YuNet model cannot be read', modelPath, python)
  }
  let canonical
  try { canonical = await realpath(modelPath) }
  catch { throw fail('YUNET_MODEL_UNREADABLE', 'YuNet path cannot be resolved', modelPath, python) }
  // Probe the same bytes the runtime accesses; never alter the environment.
  await pythonProbe(canonical, python, env)
  return { status: 'pass', modelPath: canonical, bytes: modelStat.size, python }
}

export async function assertYuNetPreflight(options) {
  const result = await checkYuNetPreflight(options)
  console.log('[TINIX] YuNet preflight PASS: ' + result.modelPath +
    ' (' + result.bytes + ' bytes); Python: ' + result.python)
  return result
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await assertYuNetPreflight() }
  catch (error) { console.error(error.message); process.exitCode = 2 }
}
