/**
 * API service layer.
 *
 * In Phase 2, pages import mock data directly from src/mock/mockData.js
 * so the UI can be built and reviewed without a running backend.
 *
 * In Phase 3, these functions become the real implementation
 * (fetch calls to http://127.0.0.1:8000/api/...) and pages switch
 * their imports from mockData to this file — no component markup
 * needs to change, since the shapes already match.
 */


const BASE_URL = 'https://spaceassist.onrender.com/api'

export async function getExperiment() {
  const res = await fetch(`${BASE_URL}/experiment`)
  if (!res.ok) throw new Error('Failed to fetch experiment state')
  return res.json()
}

export async function startExperiment(mode = 'CAMERA', template = 'object-picking') {
  const res = await fetch(`${BASE_URL}/experiment/start?mode=${encodeURIComponent(mode)}&template=${encodeURIComponent(template)}`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to start experiment')
  return res.json()
}

export async function resetExperiment() {
  const res = await fetch(`${BASE_URL}/experiment/reset`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to reset experiment')
  return res.json()
}

export async function predict(activity, confidence) {
  const res = await fetch(`${BASE_URL}/ai/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activity, confidence }),
  })
  if (!res.ok) throw new Error('Failed to submit prediction')
  return res.json()
}

export async function getHistory() {
  const res = await fetch(`${BASE_URL}/experiment/history`)
  if (!res.ok) throw new Error('Failed to fetch history')
  return res.json()
}

export async function getAlerts() {
  const res = await fetch(`${BASE_URL}/alerts`)
  if (!res.ok) throw new Error('Failed to fetch alerts')
  return res.json()
}

export async function getCameraStatus() {
  const res = await fetch(`${BASE_URL}/camera/status`)
  if (!res.ok) throw new Error('Failed to fetch camera status')
  return res.json()
}

export async function startDemo() {
  const res = await fetch(`${BASE_URL}/demo/start`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to start demo')
  return res.json()
}

export async function stopDemo() {
  const res = await fetch(`${BASE_URL}/demo/stop`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to stop demo')
  return res.json()
}

export async function getDemoStatus() {
  const res = await fetch(`${BASE_URL}/demo/status`)
  if (!res.ok) throw new Error('Failed to fetch demo status')
  return res.json()
}

export async function startCustomExperiment(name, steps) {
  const res = await fetch(`${BASE_URL}/experiment/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, steps }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d) => d.msg).join('; ')
      : data.detail ?? 'Failed to start custom experiment'
    throw new Error(detail)
  }
  return data
}

export async function getExperimentCatalog() {
  const res = await fetch(`${BASE_URL}/experiments/catalog`)
  if (!res.ok) throw new Error('Failed to fetch experiment catalog')
  return res.json()
}

export async function parseExperimentTxt(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}/experiments/parse-txt`, { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail ?? 'Failed to parse TXT experiment')
  return data
}

export async function advanceExperiment() {
  const res = await fetch(`${BASE_URL}/experiment/advance`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to advance experiment')
  return res.json()
}

export async function startCamera() {
  const res = await fetch(`${BASE_URL}/camera/start`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail ?? 'Failed to start camera')
  return data
}

export async function stopCamera() {
  const res = await fetch(`${BASE_URL}/camera/stop`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to stop camera')
  return res.json()
}

export const CAMERA_STREAM_URL = `${BASE_URL}/camera/stream`

export async function startRecordingSession() {
  const res = await fetch(`${BASE_URL}/camera/recording/start`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail ?? 'Failed to start recording session')
  return data
}

export async function stopRecordingSession() {
  const res = await fetch(`${BASE_URL}/camera/recording/stop`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to stop recording session')
  return res.json()
}

export async function clearRecordingSession() {
  const res = await fetch(`${BASE_URL}/camera/recording/clear`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to clear recording session')
  return res.json()
}

export async function getRecordingStatus() {
  const res = await fetch(`${BASE_URL}/camera/recording/status`)
  if (!res.ok) throw new Error('Failed to fetch recording status')
  return res.json()
}

export const RECORDING_DOWNLOAD_URL = `${BASE_URL}/camera/recording/download`

export async function getCameraObservations() {
  const res = await fetch(`${BASE_URL}/camera/observations`)
  if (!res.ok) throw new Error('Failed to fetch camera observations')
  return res.json()
}

export async function clearCameraObservations() {
  const res = await fetch(`${BASE_URL}/camera/observations/clear`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to clear camera observations')
  return res.json()
}

export const OBSERVATIONS_DOWNLOAD_URL = `${BASE_URL}/camera/observations/download`

export async function getActivityReportStatus() {
  const res = await fetch(`${BASE_URL}/camera/report/status`)
  if (!res.ok) throw new Error('Failed to fetch activity report status')
  return res.json()
}

export async function resetActivityReport() {
  const res = await fetch(`${BASE_URL}/camera/report/reset`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to reset activity report')
  return res.json()
}

export const REPORT_DOWNLOAD_TXT_URL = `${BASE_URL}/camera/report/download/txt`
export const REPORT_DOWNLOAD_JSON_URL = `${BASE_URL}/camera/report/download/json`
export const REPORT_DOWNLOAD_PDF_URL = `${BASE_URL}/camera/report/download/pdf`


export async function getCameraPose() {
  const res = await fetch(`${BASE_URL}/camera/pose`)
  if (!res.ok) throw new Error('Failed to fetch AI pose')
  return res.json()
}

export async function predictMotion(activity, confidence) {
  const res = await fetch(`${BASE_URL}/ai/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activity, confidence }),
  })
  if (!res.ok) {
    let message = 'Motion prediction failed'
    try { const data = await res.json(); message = data.detail || message } catch {}
    throw new Error(message)
  }
  return res.json()
}

export const EXPERIMENT_REPORT_DOWNLOAD_URL = `${BASE_URL}/experiment/report/download/txt`
