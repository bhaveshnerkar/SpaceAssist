import { useRef, useState, useEffect, useCallback } from 'react'

// How often we sample a frame to check for movement.
const SAMPLE_INTERVAL_MS = 400
// Downscaled size used for comparing frames — small on purpose, this
// only needs to be fast, not pretty. 48x36 keeps the CPU cost tiny.
const SAMPLE_WIDTH = 48
const SAMPLE_HEIGHT = 36
// Average per-pixel brightness change (0-255) needed to count as "movement".
const MOVEMENT_THRESHOLD = 10
// Don't log a new event more than once per this many ms, so a person
// moving continuously doesn't flood the log with hundreds of lines.
const LOG_COOLDOWN_MS = 900
// Cap how many lines we keep on screen / in the exported file.
const MAX_LOG_ENTRIES = 500

function timestamp() {
  const d = new Date()
  const time = d.toLocaleTimeString('en-US', { hour12: false })
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${time}.${ms}`
}

/**
 * A live camera preview with real, from-scratch motion detection —
 * entirely client-side JavaScript, no backend, no Python, no OpenCV.
 *
 * How it works: every SAMPLE_INTERVAL_MS, the current video frame is
 * drawn onto a small hidden canvas and compared pixel-by-pixel
 * (grayscale) against the previous sampled frame. If the average
 * brightness change crosses MOVEMENT_THRESHOLD, that's logged as a
 * "Movement detected" event with a timestamp and a magnitude score.
 *
 * This is genuine motion detection, not a simulation — but it's
 * worth being upfront about what it is NOT: it doesn't know *what*
 * moved or *which experiment step* happened, just that *something*
 * changed in the frame. Recognizing actual activities (Pick
 * Container vs. Close Container) is what the backend's MediaPipe +
 * activity-model pipeline is for.
 */
export default function BrowserCamera() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const prevFrameRef = useRef(null)
  const intervalRef = useRef(null)
  const lastLoggedRef = useRef(0)

  const [active, setActive] = useState(false)
  const [error, setError] = useState(null)
  const [resolution, setResolution] = useState(null)
  const [lastMagnitude, setLastMagnitude] = useState(0)
  const [log, setLog] = useState([])

  const appendLog = useCallback((line) => {
    setLog((prev) => {
      const next = [...prev, line]
      return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next
    })
  }, [])

  const sampleFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
    const frame = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data

    if (prevFrameRef.current) {
      const prev = prevFrameRef.current
      let totalDiff = 0
      const pixelCount = SAMPLE_WIDTH * SAMPLE_HEIGHT
      for (let i = 0; i < frame.length; i += 4) {
        // Cheap grayscale: average of R, G, B.
        const gray = (frame[i] + frame[i + 1] + frame[i + 2]) / 3
        const prevGray = (prev[i] + prev[i + 1] + prev[i + 2]) / 3
        totalDiff += Math.abs(gray - prevGray)
      }
      const avgDiff = totalDiff / pixelCount
      const magnitude = Math.min(100, Math.round((avgDiff / 60) * 100))
      setLastMagnitude(magnitude)

      const now = Date.now()
      if (avgDiff >= MOVEMENT_THRESHOLD && now - lastLoggedRef.current >= LOG_COOLDOWN_MS) {
        lastLoggedRef.current = now
        appendLog(`${timestamp()}  Movement detected  (magnitude ${magnitude}%)`)
      }
    }

    prevFrameRef.current = frame
  }, [appendLog])

  const start = useCallback(async () => {
    setError(null)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('This browser does not support camera access. Try Chrome or Edge.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const track = stream.getVideoTracks()[0]
        const settings = track.getSettings ? track.getSettings() : {}
        if (settings.width && settings.height) {
          setResolution(`${settings.width}x${settings.height}`)
        }
      }
      prevFrameRef.current = null
      appendLog(`${timestamp()}  Camera started — watching for movement…`)
      intervalRef.current = setInterval(sampleFrame, SAMPLE_INTERVAL_MS)
      setActive(true)
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError("Camera permission was denied. Click the camera icon in your browser's address bar and allow access, then try again.")
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No camera device was found on this computer.')
      } else if (err.name === 'NotReadableError') {
        setError('Camera is already in use by another app (Zoom, Teams, another tab). Close it and try again.')
      } else {
        setError(`Could not access camera: ${err.message}`)
      }
      setActive(false)
    }
  }, [appendLog, sampleFrame])

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    prevFrameRef.current = null
    setActive(false)
    setResolution(null)
    setLastMagnitude(0)
  }, [])

  const clearLog = useCallback(() => setLog([]), [])

  const downloadLog = useCallback(() => {
    const header = [
      'SpaceAssist AI — Browser Motion Log',
      `Generated: ${new Date().toLocaleString()}`,
      `Total events: ${log.length}`,
      '='.repeat(50),
      '',
    ].join('\n')
    const content = header + log.join('\n') + '\n'
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `movement-log-${Date.now()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [log])

  // Always release the camera when leaving this page.
  useEffect(() => stop, [stop])

  return (
    <div className="browser-camera">
      <div className="browser-camera__buttons">
        <button className="btn btn--primary" onClick={start} disabled={active}>
          {active ? 'Camera Active' : 'Start Browser Camera'}
        </button>
        <button className="btn" onClick={stop} disabled={!active}>
          Stop
        </button>
      </div>

      {error && <div className="live-controls__error">⚠ {error}</div>}

      <video
        ref={videoRef}
        className="camera-live__frame"
        style={{ display: active ? 'block' : 'none', transform: 'scaleX(-1)' }}
        muted
        playsInline
      />
      {/* Hidden working canvas used only for pixel-diff motion detection — never shown. */}
      <canvas ref={canvasRef} width={SAMPLE_WIDTH} height={SAMPLE_HEIGHT} style={{ display: 'none' }} />

      {active && (
        <div className="camera-live__stats">
          <span className="pill pill--nominal">
            <span className="pill-dot" />
            Live — no installation needed
          </span>
          {resolution && (
            <span className="pill pill--active">
              <span className="pill-dot" />
              {resolution}
            </span>
          )}
          <span className={`pill ${lastMagnitude >= MOVEMENT_THRESHOLD * 1.5 ? 'pill--caution' : 'pill--pending'}`}>
            <span className="pill-dot" />
            Motion: {lastMagnitude}%
          </span>
        </div>
      )}

      {!active && !error && (
        <p className="camera-live__note">
          This runs entirely in your browser — no Python packages required. Click "Start Browser
          Camera" and allow the permission prompt. Movement in front of the camera will be
          detected and logged below in real time.
        </p>
      )}

      {/* Data generated: the movement log */}
      <div className="movement-log">
        <div className="movement-log__header">
          <span className="eyebrow">Data Generated — Movement Log</span>
          <div className="movement-log__actions">
            <button className="btn" onClick={clearLog} disabled={log.length === 0}>
              Clear
            </button>
            <button className="btn btn--primary" onClick={downloadLog} disabled={log.length === 0}>
              Download .txt
            </button>
          </div>
        </div>
        <div className="movement-log__body scrollbar-thin">
          {log.length === 0 ? (
            <div className="empty-state">
              {active ? 'Watching for movement…' : 'Start the camera to begin generating movement data.'}
            </div>
          ) : (
            log
              .slice()
              .reverse()
              .map((line, i) => (
                <div key={i} className="mono movement-log__line">
                  {line}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  )
}
