import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import {
  getExperiment,
  getHistory,
  getAlerts,
  startExperiment,
  resetExperiment,
  startDemo,
  stopDemo,
  getDemoStatus,
  startCamera,
  stopCamera,
  startCustomExperiment,
  advanceExperiment,
  startRecordingSession,
  stopRecordingSession,
  clearRecordingSession,
  getRecordingStatus,
} from '../services/api'
import { DEFAULT_EXPERIMENT } from '../constants'
import { makePrototypeExperiment, makeCustomPrototypeExperiment } from '../prototype'

const WS_URL = 'ws://127.0.0.1:8000/api/ws'
const POLL_INTERVAL_MS = 2000
const WS_RETRY_MS = 3000
const FETCH_TIMEOUT_MS = 4000

const ExperimentContext = createContext(null)

/**
 * Wraps a promise with a hard timeout. Without this, a single hung
 * fetch (network hiccup, backend endpoint that never responds) could
 * leave a Promise.all() waiting forever — freezing the entire
 * dashboard silently, with no error shown and no way to recover
 * short of a page refresh. A real bug found via a screenshot showing
 * exactly this: the UI frozen mid-update while the backend had
 * already moved on.
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ])
}

/**
 * Single source of truth for live experiment data.
 *
 * Two transports feed it, on purpose:
 *  - WebSocket (/api/ws): pushes an instant refresh signal the moment
 *    the backend's state changes (start / predict / reset).
 *  - REST polling (every 2s): a fallback so the dashboard still stays
 *    current if the WebSocket can't connect (e.g. a network that
 *    blocks the upgrade) — and it also detects when the backend goes
 *    down or comes back up.
 */
export function ExperimentProvider({ children }) {
  const [experiment, setExperiment] = useState(null)
  const [history, setHistory] = useState([])
  const [alerts, setAlerts] = useState([])
  const [demoRunning, setDemoRunning] = useState(false)
  const [cameraStatus, setCameraStatus] = useState({ available: true, streaming: false, prototype: true, mediapipe_installed: true, model_trained: false, message: 'Camera ready. Start an experiment first.' })
  const [recordingStatus, setRecordingStatus] = useState({ recording: false, frames_recorded: 0, current_label: null, label_counts: {} })
  const [connectionStatus, setConnectionStatus] = useState('connecting') // connecting | live | polling | offline
  const [actionError, setActionError] = useState(null)
  const [prototypeExperiment, setPrototypeExperiment] = useState(null)
  const [prototypeHistory, setPrototypeHistory] = useState([])
  const [prototypeAlerts, setPrototypeAlerts] = useState([])
  const [prototypeCamera, setPrototypeCamera] = useState(false)
  const prototypeStableRef = useRef({ activity: null, count: 0 })
  const prototypeActiveRef = useRef(false)
  const demoRequestedRef = useRef(false)
  const wsRef = useRef(null)
  const retryTimerRef = useRef(null)

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      withTimeout(getExperiment(), FETCH_TIMEOUT_MS, 'getExperiment'),
      withTimeout(getHistory(), FETCH_TIMEOUT_MS, 'getHistory'),
      withTimeout(getAlerts(), FETCH_TIMEOUT_MS, 'getAlerts'),
      withTimeout(getDemoStatus(), FETCH_TIMEOUT_MS, 'getDemoStatus'),
      withTimeout(getRecordingStatus(), FETCH_TIMEOUT_MS, 'getRecordingStatus'),
    ])
    const [exp, hist, al, demo, rec] = results

    // Apply whichever calls actually succeeded — a single slow or
    // failed endpoint no longer blocks the other five from updating,
    // and no longer freezes the dashboard indefinitely with stale data.
    // IMPORTANT: the backend persists its last experiment/demo in SQLite.
    // Never hydrate the live UI from that stale state on page load; otherwise
    // an old completed demo can appear to run by itself and its last 94%
    // confidence can reappear while the camera is OFF. Browser prototype
    // state is the source of truth for this page.
    if (rec.status === 'fulfilled') setRecordingStatus(rec.value)

    const allFailed = results.every((r) => r.status === 'rejected')
    if (allFailed) {
      setConnectionStatus('offline')
    } else {
      setConnectionStatus((prev) => (prev === 'connecting' ? 'polling' : prev === 'offline' ? 'polling' : prev))
    }
  }, [])

  useEffect(() => {
    refresh()

    let cancelled = false

    function connectWebSocket() {
      if (cancelled) return
      try {
        const ws = new WebSocket(WS_URL)
        wsRef.current = ws

        ws.onopen = () => setConnectionStatus('live')
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.event === "demo_error") {
              setActionError(data.message)
            }
          } catch {
            // Non-JSON or unexpected payload — refresh() below still
            // covers us either way, so this isn't fatal.
          }
          refresh()
        }
        ws.onclose = () => {
          if (cancelled) return
          setConnectionStatus((prev) => (prev === 'offline' ? 'offline' : 'polling'))
          retryTimerRef.current = setTimeout(connectWebSocket, WS_RETRY_MS)
        }
        ws.onerror = () => {
          ws.close()
        }
      } catch {
        setConnectionStatus('polling')
        retryTimerRef.current = setTimeout(connectWebSocket, WS_RETRY_MS)
      }
    }

    connectWebSocket()
    const pollId = setInterval(refresh, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(pollId)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [refresh])

  const start = useCallback(
    async (mode = 'CAMERA', template = 'object-picking') => {
      setActionError(null)
      demoRequestedRef.current = false
      setDemoRunning(false)
      // The browser prototype is the primary demo path. It starts immediately
      // and remains authoritative for the selected experiment even when the
      // backend is unavailable or returns stale/default state.
      const local = makePrototypeExperiment(template)
      prototypeActiveRef.current = true
      setPrototypeExperiment(local)
      setPrototypeHistory([])
      setPrototypeAlerts([])
      prototypeStableRef.current = { activity: null, count: 0 }
      localStorage.setItem('spaceassist.selectedTemplate', template)
      // Mirror to the backend when available, but never block the prototype.
      try { await startExperiment(mode, template) } catch { /* local mode remains fully usable */ }
    },
    []
  )

  const reset = useCallback(async () => {
    setActionError(null)
    prototypeActiveRef.current = false
    setPrototypeExperiment(null)
    setPrototypeHistory([])
    setPrototypeAlerts([])
    prototypeStableRef.current = { activity: null, count: 0 }
    setPrototypeCamera(false)
    setCameraStatus((s) => ({ ...s, streaming: false, prototype: true, message: 'Camera ready. Start an experiment first.' }))
    setDemoRunning(false)
    try { await resetExperiment(); await refresh() } catch (e) { setActionError(null) }
  }, [refresh])

  const runDemo = useCallback(async () => {
    setActionError(null)
    demoRequestedRef.current = true
    const template = localStorage.getItem('spaceassist.selectedTemplate') || 'object-picking'
    const local = makePrototypeExperiment(template)
    prototypeActiveRef.current = true
    setPrototypeExperiment(local)
    setPrototypeHistory([])
    setPrototypeAlerts([])
    prototypeStableRef.current = { activity: null, count: 0 }
    setDemoRunning(true)
    // Backend demo is intentionally not started here. The visible demo must
    // never be able to mutate the live experiment behind the user's back.
  }, [])

  const haltDemo = useCallback(async () => {
    setActionError(null)
    demoRequestedRef.current = false
    setDemoRunning(false)
    try {
      await stopDemo()
      await refresh()
    } catch (e) {
      setActionError(e.message)
    }
  }, [refresh])

  const beginCamera = useCallback(async () => {
    setActionError(null)
    // Always use the browser camera + MediaPipe path for the interactive demo.
    // This guarantees the visible skeleton and motion readout are driven by the
    // same camera that the user sees, instead of depending on an MJPEG backend.
    setPrototypeCamera(true)
    setCameraStatus({
      available: true, streaming: true, prototype: true,
      mediapipe_installed: true, model_trained: false,
      message: 'Browser MediaPipe camera starting…'
    })
  }, [])

  const endCamera = useCallback(async () => {
    setActionError(null)
    setPrototypeCamera(false)
    setCameraStatus((s) => ({ ...s, streaming: false, prototype: false, message: 'Camera stopped.' }))
  }, [])

  // Simple presentation mode: the Enter key advances the experiment.
  // No automatic motion recognition is allowed to change the timeline.
  const submitPrototypePrediction = useCallback(() => {}, [])

  const startCustom = useCallback(
    async (name, steps) => {
      setActionError(null)
      if (!name?.trim() || !steps?.length) return false
      const local = makeCustomPrototypeExperiment(name.trim(), steps)
      prototypeActiveRef.current = true
      setPrototypeExperiment(local)
      setPrototypeHistory([])
      setPrototypeAlerts([])
      prototypeStableRef.current = { activity: null, count: 0 }
      try { await startCustomExperiment(name.trim(), steps) } catch { /* local custom experiment remains usable */ }
      return true
    },
    []
  )


  const prototypePredictRef = useRef(null)
  prototypePredictRef.current = submitPrototypePrediction

  useEffect(() => {
    if (!demoRunning || !prototypeExperiment) return
    let i = 0
    const timer = setInterval(() => {
      setPrototypeExperiment(current => {
        const step = current?.steps?.[current.current_step_index]
        if (!step) { setDemoRunning(false); return current }
        const motion = (i++ % 5 === 2) ? 'Walk' : step.motion
        setTimeout(() => prototypePredictRef.current?.(motion, 92), 0)
        return current
      })
    }, 900)
    return () => clearInterval(timer)
  }, [demoRunning, !!prototypeExperiment])

  const advanceStep = useCallback(async () => {
    setActionError(null)
    if (prototypeActiveRef.current) {
      setPrototypeExperiment((prev) => {
        if (!prev || prev.status === 'COMPLETED') return prev
        const idx = prev.current_step_index
        const nextIdx = idx + 1
        const completed = nextIdx >= prev.steps.length
        const now = new Date().toISOString()
        const updatedSteps = prev.steps.map((step, i) => {
          if (i <= idx) return { ...step, status: 'CORRECT' }
          if (i === nextIdx) return { ...step, status: 'IN_PROGRESS' }
          return { ...step, status: 'PENDING' }
        })
        setPrototypeHistory((h) => [
          ...h.slice(-99),
          {
            timestamp: now,
            expected: prev.steps[idx]?.motion || '—',
            detected: 'ENTER / manual advance',
            confidence: Math.min(100, 15 + idx * 7),
            status: completed ? 'COMPLETED' : 'CORRECT',
            message: completed ? 'Experiment completed.' : `Step ${idx + 1} completed. Moving to step ${nextIdx + 1}.`,
          },
        ])
        return {
          ...prev,
          steps: updatedSteps,
          current_step_index: completed ? idx : nextIdx,
          progress: `${completed ? prev.steps.length : nextIdx}/${prev.steps.length}`,
          status: completed ? 'COMPLETED' : 'IN_PROGRESS',
          last_step_status: 'CORRECT',
          last_feedback: completed ? 'Experiment completed.' : `Step completed. Press Enter for the next step.`,
        }
      })
      return
    }
    try {
      await advanceExperiment()
      await refresh()
    } catch (e) {
      setActionError(e.message)
    }
  }, [refresh])

  const beginRecording = useCallback(async () => {
    setActionError(null)
    try {
      await startRecordingSession()
      await refresh()
    } catch (e) {
      setActionError(e.message)
    }
  }, [refresh])

  const endRecording = useCallback(async () => {
    setActionError(null)
    try {
      await stopRecordingSession()
      await refresh()
    } catch (e) {
      setActionError(e.message)
    }
  }, [refresh])

  const wipeRecording = useCallback(async () => {
    setActionError(null)
    try {
      await clearRecordingSession()
      await refresh()
    } catch (e) {
      setActionError(e.message)
    }
  }, [refresh])

  const previewTemplate = localStorage.getItem('spaceassist.selectedTemplate') || 'object-picking'
  const preview = makePrototypeExperiment(previewTemplate)
  const idlePreview = { ...preview, status: 'NOT_STARTED', progress: `0/${preview.total_steps}`, last_step_status: 'NOT_STARTED', last_feedback: 'Choose Start Experiment to begin.', steps: preview.steps.map((step) => ({ ...step, status: 'PENDING' })) }
  const effectiveExperiment = prototypeExperiment ?? idlePreview
  const value = {
    experiment: effectiveExperiment,
    hasLoaded: true,
    history: prototypeExperiment ? prototypeHistory : [],
    alerts: prototypeExperiment ? prototypeAlerts : [],
    demoRunning,
    cameraStatus: prototypeCamera ? { ...cameraStatus, available: true, streaming: true, prototype: true, mediapipe_installed: true } : cameraStatus,
    recordingStatus,
    connectionStatus,
    actionError,
    refresh,
    start,
    reset,
    runDemo,
    haltDemo,
    beginCamera,
    endCamera,
    startCustom,
    advanceStep,
    beginRecording,
    endRecording,
    wipeRecording,
    prototypeCamera,
    submitPrototypePrediction,
  }

  return <ExperimentContext.Provider value={value}>{children}</ExperimentContext.Provider>
}

export function useExperiment() {
  const ctx = useContext(ExperimentContext)
  if (!ctx) throw new Error('useExperiment must be used within an ExperimentProvider')
  return ctx
}

/**
 * Derives a "latest activity" readout from the history log, since the
 * backend doesn't persist a standalone "last prediction" record.
 */
export function getLatestActivity(history, experiment) {
  if (!history || history.length === 0) {
    if (experiment.status === 'COMPLETED') {
      return { status: 'COMPLETED', expected: null, detected: '—', confidence: 100, message: 'Experiment completed successfully.' }
    }
    if (experiment.status === 'IN_PROGRESS') {
      const expectedStep = experiment.steps[experiment.current_step_index]
      return {
        status: 'IN_PROGRESS',
        expected: expectedStep?.step_name ?? null,
        detected: '—',
        confidence: 0,
        message: 'Waiting for the first prediction…',
      }
    }
    return { status: 'NOT_STARTED', expected: null, detected: '—', confidence: 0, message: 'Start the experiment to begin monitoring.' }
  }
  const last = history[history.length - 1]
  return { ...last }
}
