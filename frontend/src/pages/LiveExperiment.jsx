import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import ConfidenceGauge from '../components/ConfidenceGauge'
import StepTimeline from '../components/StepTimeline'
import StatusPill from '../components/StatusPill'
import BrowserCamera from '../components/BrowserCamera'
import PrototypeMediaPipeCamera from '../components/PrototypeMediaPipeCamera'
import { useExperiment, getLatestActivity } from '../context/ExperimentContext'
import { CONFIDENCE_THRESHOLDS } from '../constants'
import {
  CAMERA_STREAM_URL,
  getCameraPose,
  RECORDING_DOWNLOAD_URL,
  getCameraObservations,
  clearCameraObservations,
  OBSERVATIONS_DOWNLOAD_URL,
  getActivityReportStatus,
  resetActivityReport,
  REPORT_DOWNLOAD_TXT_URL,
  REPORT_DOWNLOAD_JSON_URL,
  REPORT_DOWNLOAD_PDF_URL,
  EXPERIMENT_REPORT_DOWNLOAD_URL,
} from '../services/api'

const OBSERVATION_POLL_MS = 2000

function downloadLocalPrototypeReport(experiment, history) {
  const lines = [
    'SpaceAssist AI — Experiment Report',
    '='.repeat(64),
    `Experiment: ${experiment.name}`,
    `Mode: ${experiment.mode}`,
    `Generated: ${new Date().toLocaleString()}`,
    `Total steps: ${experiment.total_steps}`,
    `Progress: ${experiment.progress}`,
    '',
    'STEP TIMELINE',
    '-'.repeat(64),
  ]
  ;(experiment.steps || []).forEach((step, i) => {
    const events = (history || []).filter(e => e.expected === step.motion || e.expected_step === step.step_name)
    const last = events[events.length - 1]
    lines.push(`${i + 1}. ${step.step_name}`)
    lines.push(`   Expected motion: ${step.motion || 'Manual'}`)
    lines.push(`   Status: ${step.status}`)
    if (last) {
      lines.push(`   Detected motion: ${last.detected}`)
      lines.push(`   Confidence: ${Number(last.confidence || 0).toFixed(1)}%`)
      lines.push(`   Result: ${last.status}`)
      lines.push(`   Feedback: ${last.message}`)
    } else {
      lines.push('   Detected motion: —')
    }
    lines.push('')
  })
  lines.push('EVENT LOG', '-'.repeat(64))
  ;(history || []).forEach((event, i) => {
    lines.push(`${i + 1}. ${event.timestamp || ''} | Expected: ${event.expected || '—'} | Detected: ${event.detected || '—'} | Confidence: ${Number(event.confidence || 0).toFixed(1)}% | ${event.status}`)
    lines.push(`   ${event.message || ''}`)
  })
  lines.push('', 'OVERALL SUMMARY', '-'.repeat(64), `Final status: ${experiment.status}`, `Completed steps: ${experiment.status === 'COMPLETED' ? experiment.total_steps : experiment.current_step_index}`, `Total events: ${(history || []).length}`, `Last feedback: ${experiment.last_feedback || '—'}`)
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `spaceassist-${Date.now()}-experiment-report.txt`; a.click(); URL.revokeObjectURL(url)
}

export default function LiveExperiment() {
  const {
    experiment,
    history,
    demoRunning,
    cameraStatus,
    recordingStatus,
    actionError,
    refresh,
    start,
    reset,
    runDemo,
    beginCamera,
    endCamera,
    advanceStep,
    beginRecording,
    endRecording,
    wipeRecording,
    prototypeCamera,
  } = useExperiment()
  const latest = getLatestActivity(history, experiment)
  const [pending, setPending] = useState(null)
  const [streamKey, setStreamKey] = useState(0) // bump to force <img> to reconnect the MJPEG stream
  const [observations, setObservations] = useState([])
  const [reportStatus, setReportStatus] = useState({ total_activity_events: 0, recent_events: [] })
  const [livePose, setLivePose] = useState(null)
  const [liveResult, setLiveResult] = useState(null)
  const [liveMetrics, setLiveMetrics] = useState({ activity: '—', confidence: 0, source: 'offline', landmarks: 0, status: 'OFFLINE' })
  const [selectedTemplate, setSelectedTemplate] = useState(() => localStorage.getItem('spaceassist.selectedTemplate') || 'object-picking')
  const handleAdvanceRef = useRef(null)

  // Simple presentation control: Enter advances exactly one experiment step.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Enter') return
      const tag = event.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable) return
      if (experiment.status !== 'IN_PROGRESS' || pending || demoRunning) return
      event.preventDefault()
      handleAdvanceRef.current?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [experiment.status, pending, demoRunning])

  // Only poll the observation log + activity report while the camera
  // is actually streaming — no point hitting these endpoints elsewhere.
  useEffect(() => {
    if (!cameraStatus.streaming || prototypeCamera) return
    let cancelled = false
    const poll = async () => {
      try {
        const [obsData, reportData] = await Promise.all([getCameraObservations(), getActivityReportStatus()])
        if (!cancelled) {
          setObservations(obsData.entries)
          setReportStatus(reportData)
        }
      } catch {
        // camera page still works fine without this; just skip a beat
      }
    }
    poll()
    const id = setInterval(poll, OBSERVATION_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [cameraStatus.streaming])

  const handleClearObservations = async () => {
    await clearCameraObservations()
    setObservations([])
  }

  const handleResetReport = async () => {
    await resetActivityReport()
    setReportStatus({ total_activity_events: 0, recent_events: [] })
  }

  const isRunning = experiment.status === 'IN_PROGRESS'
  const isCompleted = experiment.status === 'COMPLETED'
  const stepConfidence = (isRunning || isCompleted) ? Math.min(100, 15 + Math.max(0, experiment.current_step_index) * 7) : 0
  const anyBusy = pending !== null || demoRunning

  // The backend camera stream performs recognition and updates the
  // experiment state machine itself. The browser polls the latest pose
  // snapshot only to make the UI feel live (motion name/confidence and
  // the immediate step result), so camera recognition does not depend on
  // a React timing loop.
  useEffect(() => {
    if (!cameraStatus.streaming || prototypeCamera) {
      setLivePose(null)
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const pose = await getCameraPose()
        if (!cancelled) {
          setLivePose(pose)
          if (pose?.experiment_result?.status) setLiveResult(pose.experiment_result)
        }
      } catch {
        // Keep the last good pose snapshot visible.
      }
    }
    tick()
    const id = setInterval(tick, 300)
    return () => { cancelled = true; clearInterval(id) }
  }, [cameraStatus.streaming])


  const run = (key, fn) => async () => {
    setPending(key)
    await fn()
    setPending(null)
  }

  const handleStart = run('start', () => start('CAMERA', selectedTemplate))
  const handleReset = run('reset', reset)
  const handleDemo = run('demo', runDemo)
  const handleAdvance = run('advance', advanceStep)
  handleAdvanceRef.current = handleAdvance
  const handleCameraStart = run('camera-start', async () => {
    if (!isRunning && !isCompleted) {
      setPending(null)
      return
    }
    await beginCamera()
    setStreamKey((k) => k + 1)
  })
  const handleCameraStop = run('camera-stop', async () => { await endCamera(); setLiveMetrics({ activity: '—', confidence: 0, source: 'offline', landmarks: 0, status: 'OFFLINE' }); setLivePose(null); })
  const handleRecordStart = run('record-start', beginRecording)
  const handleRecordStop = run('record-stop', endRecording)
  const handleRecordClear = run('record-clear', wipeRecording)

  return (
    <div className="live-page">
      <section className="panel live-controls">
        <div className="panel-header">
          <span className="panel-title">Demo Control</span>
          {demoRunning ? (
            <span className="pill pill--active">
              <span className="pill-dot" />
              Demo Running
            </span>
          ) : (
            <Link to="/design" className="dashboard-link">
              + Design a new science experiment
            </Link>
          )}
        </div>
        <div className="live-controls__buttons">
          <button className="btn btn--primary" onClick={handleStart} disabled={anyBusy || isRunning}>
            {pending === 'start' ? 'Starting…' : 'Start Experiment'}
          </button>
          <button className="btn btn--primary" onClick={handleDemo} disabled={anyBusy}>
            {pending === 'demo' || demoRunning ? 'Running Demo…' : 'Start Demo'}
          </button>
          <button
            className="btn"
            onClick={handleCameraStart}
            disabled={pending !== null || cameraStatus.streaming}
            title={!cameraStatus.available ? cameraStatus.message : undefined}
          >
            {pending === 'camera-start' ? 'Starting AI…' : 'Start Camera + AI'}
          </button>
          <button className="btn" onClick={handleCameraStop} disabled={pending !== null || !cameraStatus.streaming}>
            {pending === 'camera-stop' ? 'Stopping…' : 'Stop Camera'}
          </button>
          <button className="btn btn--danger" onClick={handleReset} disabled={pending !== null}>
            {pending === 'reset' ? 'Resetting…' : 'Reset Experiment'}
          </button>
        </div>
        {actionError && <div className="live-controls__error">⚠ {actionError}</div>}
        {demoRunning && (
          <div className="live-controls__hint">
            Demo Mode is feeding a scripted sequence of predictions automatically — including one
            intentional wrong action, so you can see the sequence-error warning fire live.
          </div>
        )}
        {!demoRunning && isRunning && experiment.is_custom && (
          <div className="live-controls__advance">
            <button className="btn btn--primary" onClick={handleAdvance} disabled={pending !== null}>
              {pending === 'advance' ? 'Marking…' : `✓ Mark "${experiment.steps[experiment.current_step_index]?.step_name ?? 'Step'}" Complete`}
            </button>
            <span className="eyebrow">Guiding: {experiment.name}</span>
          </div>
        )}
        {!demoRunning && isRunning && (
          <div className="live-controls__hint">
            <strong>Presentation mode.</strong> MediaPipe only draws the live body skeleton. Press Enter to complete the current step and move to the next step.
          </div>
        )}
        {!demoRunning && isCompleted && <div className="live-controls__hint">✓ Experiment completed. Reset to run again.</div>}
      </section>

      <div className="dashboard-grid" style={{ marginTop: 20 }}>
        <section className="panel motion-command-panel">
          <div className="panel-header"><span className="panel-title">Motion Command Center</span><span className={`pill ${cameraStatus.model_trained ? 'pill--nominal' : 'pill--caution'}`}><span className="pill-dot" />{cameraStatus.model_trained ? 'ML NETWORK ONLINE' : 'AI BASELINE ONLINE'}</span></div>
          <div className="motion-command">
            <div className="motion-command__visual"><div className="motion-person"><span className="head"/><span className="body"/><span className="arm left"/><span className="arm right"/><span className="leg left"/><span className="leg right"/></div></div>
            <div className="motion-command__info"><span className="eyebrow">EXPECTED MOTION</span><strong>{experiment.steps?.[experiment.current_step_index]?.motion || 'Manual confirmation'}</strong><span className="eyebrow">DETECTED</span><strong>{cameraStatus.streaming && prototypeCamera ? liveMetrics.activity : 'Waiting for camera'}</strong><p>{cameraStatus.streaming && prototypeCamera ? (liveMetrics.status === 'NO_PERSON' ? 'No person detected. Keep your full body visible.' : `Live ${liveMetrics.source === 'mediapipe-geometry' ? 'MediaPipe landmark' : 'camera'} tracking active.`) : 'Start the camera and keep your full body visible.'}</p></div>
          </div>
        </section>

        <section className="panel dashboard-hud">
          <div className="panel-header">
            <span className="panel-title">Live Readout</span>
            <StatusPill status={latest.status} />
          </div>
          <div className="dashboard-hud__body">
            <div className="dashboard-hud__readout">
              <div className="dashboard-hud__row">
                <span className="eyebrow">Detected</span>
                <span className="dashboard-hud__value">{cameraStatus.streaming && prototypeCamera ? liveMetrics.activity : '—'}</span>
              </div>
              <div className="dashboard-hud__row">
                <span className="eyebrow">Expected</span>
                <span className="dashboard-hud__value dashboard-hud__value--muted">{latest.expected ?? '—'}</span>
              </div>
              <p className="dashboard-hud__message">{cameraStatus.streaming && prototypeCamera ? (liveMetrics.status === 'NO_PERSON' ? 'No person detected.' : `Step confidence is ${stepConfidence}%. MediaPipe skeleton is visual-only.`) : `Camera is OFF — step confidence is ${stepConfidence}%. Start the camera to show the MediaPipe skeleton.`}</p>
            </div>
            <ConfidenceGauge confidence={stepConfidence} thresholds={CONFIDENCE_THRESHOLDS} />
          </div>
        </section>

        <section className="panel dashboard-steps">
          <div className="panel-header">
            <span className="panel-title">Experiment Timeline</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {experiment.progress}
            </span>
          </div>
          <div className="dashboard-steps__body">
            <StepTimeline steps={experiment.steps} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <span className="panel-title">Camera Feed</span>
            {cameraStatus.streaming && (
              <span className="pill pill--nominal">
                <span className="pill-dot" />
                Live
              </span>
            )}
          </div>
          {cameraStatus.streaming ? (
            <PrototypeMediaPipeCamera
              expectedMotion={experiment.steps?.[experiment.current_step_index]?.motion}
              onMotion={() => {}}
              onFrameState={setLiveMetrics}
              onStop={endCamera}
            />
          ) : (
            <div className="camera-placeholder">
              <BrowserCamera />
              <div className="camera-placeholder__backend-note">
                <span className="eyebrow">Camera is ready when you start the experiment</span>
                <p className="camera-placeholder__message">Choose an experiment, press Start Experiment, then Start Camera + AI. Demo Mode is separate and never starts automatically.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
