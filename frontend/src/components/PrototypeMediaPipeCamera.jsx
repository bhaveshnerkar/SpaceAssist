import { useEffect, useRef, useState } from 'react'

// Browser-side MediaPipe
const WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'

const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'

const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12], [11, 13], [13, 15],
  [15, 17], [15, 19], [15, 21],
  [12, 14], [14, 16],
  [16, 18], [16, 20], [16, 22],
  [11, 23], [12, 24],
  [23, 24],
  [23, 25], [25, 27],
  [27, 29], [27, 31],
  [24, 26], [26, 28],
  [28, 30], [28, 32]
]

const FALLBACK_W = 64
const FALLBACK_H = 36
const FALLBACK_THRESHOLD = 7

function avg(a, b) {
  return (a + b) / 2
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function angle(a, b, c) {
  const bax = a.x - b.x
  const bay = a.y - b.y
  const bcx = c.x - b.x
  const bcy = c.y - b.y

  const den =
    Math.hypot(bax, bay) *
    Math.hypot(bcx, bcy)

  if (!den) return 180

  const value = Math.max(
    -1,
    Math.min(
      1,
      (bax * bcx + bay * bcy) / den
    )
  )

  return Math.acos(value) * 180 / Math.PI
}

function classifyPose(pose, previousPose) {
  if (!pose || pose.length < 33) {
    return ['No Person', 0, 'none']
  }

  const p = i => pose[i]

  const shoulder = {
    x: avg(p(11).x, p(12).x),
    y: avg(p(11).y, p(12).y)
  }

  const hip = {
    x: avg(p(23).x, p(24).x),
    y: avg(p(23).y, p(24).y)
  }

  const knee = {
    x: avg(p(25).x, p(26).x),
    y: avg(p(25).y, p(26).y)
  }

  const wrist = {
    x: avg(p(15).x, p(16).x),
    y: avg(p(15).y, p(16).y)
  }

  const shoulderWidth = Math.max(
    0.08,
    Math.abs(p(11).x - p(12).x)
  )

  const torso = Math.max(
    0.12,
    Math.abs(hip.y - shoulder.y)
  )

  const kneeAngle = avg(
    angle(p(23), p(25), p(27)),
    angle(p(24), p(26), p(28))
  )

  const armsUp =
    p(15).y < p(11).y - 0.10 ||
    p(16).y < p(12).y - 0.10

  const reach =
    dist(p(15), p(11)) > shoulderWidth * 1.55 ||
    dist(p(16), p(12)) > shoulderWidth * 1.55

  const crouched =
    hip.y > shoulder.y + torso * 0.55 &&
    knee.y > hip.y + 0.04

  const seated =
    hip.y > 0.52 &&
    knee.y > 0.48 &&
    kneeAngle < 150

  const bent =
    hip.y > shoulder.y + 0.20 &&
    !seated &&
    kneeAngle > 135

  const lowHands =
    wrist.y > hip.y + 0.02

  const armDownExtended =
    (
      dist(p(15), p(11)) > shoulderWidth * 1.35 &&
      p(15).y > shoulder.y
    ) ||
    (
      dist(p(16), p(12)) > shoulderWidth * 1.35 &&
      p(16).y > shoulder.y
    )

  let walking = false

  if (previousPose?.length >= 33) {
    const oldHipX =
      avg(previousPose[23].x, previousPose[24].x)

    const ankleChange = Math.abs(
      Math.abs(p(27).x - p(28).x) -
      Math.abs(
        previousPose[27].x -
        previousPose[28].x
      )
    )

    walking =
      Math.abs(hip.x - oldHipX) > 0.018 ||
      ankleChange > 0.035
  }

  const candidates = []

  if (armsUp) {
    candidates.push(['Stretch', 92])
  }

  if (seated) {
    candidates.push(['Sit', 90])
  }

  if (bent) {
    candidates.push(['Bend', 87])
  }

  if (lowHands && crouched) {
    candidates.push(['Pick', 86])
  }

  if (
    armDownExtended &&
    !crouched &&
    !seated &&
    !bent
  ) {
    candidates.push(['Place', 83])
  }

  if (walking && !crouched) {
    candidates.push(['Walk', 84])
  }

  if (
    reach &&
    !armsUp &&
    !crouched
  ) {
    candidates.push(['Reach', 84])
  }

  if (
    !armsUp &&
    !seated &&
    !bent &&
    !crouched &&
    !walking &&
    !reach
  ) {
    candidates.push(['Stand', 82])
  }

  if (!candidates.length) {
    return ['Idle', 0, 'mediapipe-geometry']
  }

  candidates.sort((a, b) => b[1] - a[1])

  const [label, geometryScore] = candidates[0]

  const visible =
    pose.reduce(
      (n, lm) =>
        n +
        ((lm.visibility ?? 1) >= 0.5 ? 1 : 0),
      0
    ) / pose.length

  const confidence = Math.round(
    Math.max(
      0,
      Math.min(
        99,
        geometryScore *
        (0.55 + 0.45 * visible)
      )
    )
  )

  return [
    label,
    confidence,
    'mediapipe-geometry'
  ]
}

function frameDifference(video, canvas, previous) {
  if (
    !video ||
    !canvas ||
    video.readyState < 2
  ) {
    return {
      frame: null,
      diff: 0
    }
  }

  const ctx = canvas.getContext(
    '2d',
    { willReadFrequently: true }
  )

  ctx.drawImage(
    video,
    0,
    0,
    FALLBACK_W,
    FALLBACK_H
  )

  const data = ctx.getImageData(
    0,
    0,
    FALLBACK_W,
    FALLBACK_H
  ).data

  if (!previous) {
    return {
      frame: data,
      diff: 0
    }
  }

  let total = 0

  for (let i = 0; i < data.length; i += 4) {
    const a =
      (
        data[i] +
        data[i + 1] +
        data[i + 2]
      ) / 3

    const b =
      (
        previous[i] +
        previous[i + 1] +
        previous[i + 2]
      ) / 3

    total += Math.abs(a - b)
  }

  return {
    frame: data,
    diff:
      total /
      (FALLBACK_W * FALLBACK_H)
  }
}

export default function PrototypeMediaPipeCamera({
  expectedMotion,
  onMotion,
  onFrameState,
  onStop
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const landmarkerRef = useRef(null)
  const rafRef = useRef(null)

  const onMotionRef = useRef(onMotion)
  const onFrameStateRef = useRef(onFrameState)

  const expectedRef =
    useRef(expectedMotion)

  const previousPoseRef =
    useRef(null)

  const previousFrameRef =
    useRef(null)

  const lastEmitRef =
    useRef(0)

  const lastUiEmitRef =
    useRef(0)

  const [status, setStatus] =
    useState('Starting camera…')

  const [motion, setMotion] =
    useState('Waiting…')

  const [confidence, setConfidence] =
    useState(0)

  const [source, setSource] =
    useState('waiting')

  const [landmarkCount, setLandmarkCount] =
    useState(0)

  const [error, setError] =
    useState('')

  useEffect(() => {
    onMotionRef.current = onMotion
  }, [onMotion])

  useEffect(() => {
    onFrameStateRef.current = onFrameState
  }, [onFrameState])

  useEffect(() => {
    expectedRef.current = expectedMotion
  }, [expectedMotion])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        if (
          !navigator.mediaDevices?.getUserMedia
        ) {
          throw new Error(
            'This browser does not support camera access.'
          )
        }

        setStatus(
          'Requesting camera permission…'
        )

        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 960 },
              height: { ideal: 540 },
              facingMode: 'user'
            },
            audio: false
          })

        if (cancelled) {
          stream
            .getTracks()
            .forEach(track => track.stop())
          return
        }

        streamRef.current = stream

        videoRef.current.srcObject = stream

        await videoRef.current.play()

        setStatus(
          'Camera ONLINE • loading MediaPipe pose model…'
        )

        // =====================================================
        // MEDIAPIPE INITIALIZATION
        // =====================================================

        let landmarker = null

        try {
          const {
            FilesetResolver,
            PoseLandmarker
          } = await import(
            '@mediapipe/tasks-vision'
          )

          console.log(
            'MediaPipe package loaded'
          )

          const vision =
            await FilesetResolver.forVisionTasks(
              WASM
            )

          console.log(
            'MediaPipe WASM loaded'
          )

          landmarker =
            await PoseLandmarker.createFromOptions(
              vision,
              {
                baseOptions: {
                  modelAssetPath: MODEL
                },

                runningMode: 'VIDEO',

                numPoses: 1,

                minPoseDetectionConfidence:
                  0.35,

                minPosePresenceConfidence:
                  0.35,

                minTrackingConfidence:
                  0.35
              }
            )

          console.log(
            'MediaPipe PoseLandmarker created'
          )

          if (!cancelled) {
            landmarkerRef.current =
              landmarker

            setSource(
              'mediapipe-geometry'
            )

            setStatus(
              'MediaPipe ONLINE • 33 landmarks tracking'
            )

            setError('')
          }

        } catch (mediaPipeError) {
          console.error(
            'MEDIAPIPE FAILED:',
            mediaPipeError
          )

          setSource(
            'camera-motion-fallback'
          )

          setStatus(
            'Camera ONLINE • MediaPipe failed'
          )

          setError(
            `MediaPipe failed: ${
              mediaPipeError?.message ||
              'Unknown MediaPipe error'
            }`
          )
        }

        // =====================================================
        // CAMERA PROCESSING LOOP
        // =====================================================

        const loop = () => {
          if (
            cancelled ||
            !videoRef.current
          ) {
            return
          }

          const video =
            videoRef.current

          const canvas =
            canvasRef.current

          if (video.readyState >= 2) {
            const now =
              performance.now()

            // =================================================
            // MEDIAPIPE MODE
            // =================================================

            if (landmarkerRef.current) {
              try {
                const result =
                  landmarkerRef.current
                    .detectForVideo(
                      video,
                      now
                    )

                const pose =
                  result.landmarks?.[0]

                if (pose) {
                  setLandmarkCount(
                    pose.length
                  )

                  const [
                    detectedMotion,
                    detectedConfidence,
                    detectedSource
                  ] = classifyPose(
                    pose,
                    previousPoseRef.current
                  )

                  previousPoseRef.current =
                    pose

                  setMotion(
                    detectedMotion
                  )

                  setConfidence(
                    detectedConfidence
                  )

                  setSource(
                    detectedSource
                  )

                  if (
                    now -
                    lastUiEmitRef.current >
                    100
                  ) {
                    lastUiEmitRef.current =
                      now

                    onFrameStateRef.current?.({
                      activity:
                        detectedMotion,

                      confidence:
                        detectedConfidence,

                      source:
                        detectedSource,

                      landmarks:
                        pose.length,

                      status:
                        'TRACKING'
                    })
                  }

                  if (
                    now -
                    lastEmitRef.current >
                    350
                  ) {
                    lastEmitRef.current =
                      now

                    onMotionRef.current?.(
                      detectedMotion
                    )
                  }

                  drawSkeleton(
                    canvas,
                    pose
                  )

                } else {
                  setLandmarkCount(0)

                  setMotion(
                    'No Person'
                  )

                  setConfidence(0)

                  clearCanvas(canvas)

                  if (
                    now -
                    lastUiEmitRef.current >
                    100
                  ) {
                    lastUiEmitRef.current =
                      now

                    onFrameStateRef.current?.({
                      activity:
                        'No Person',

                      confidence: 0,

                      source:
                        'mediapipe-geometry',

                      landmarks: 0,

                      status:
                        'NO_PERSON'
                    })
                  }
                }

              } catch (inferenceError) {
                console.error(
                  'MediaPipe inference error:',
                  inferenceError
                )

                setError(
                  `MediaPipe inference error: ${
                    inferenceError?.message ||
                    'Unknown error'
                  }`
                )

                setSource(
                  'camera-motion-fallback'
                )

                try {
                  landmarkerRef.current?.close?.()
                } catch {}

                landmarkerRef.current =
                  null
              }

            // =================================================
            // FALLBACK MODE
            // =================================================

            } else {
              const result =
                frameDifference(
                  video,
                  canvas,
                  previousFrameRef.current
                )

              previousFrameRef.current =
                result.frame

              if (
                result.diff >=
                FALLBACK_THRESHOLD
              ) {
                setMotion(
                  'Movement detected'
                )

                const fallbackConfidence =
                  Math.min(
                    70,
                    40 +
                    Math.round(
                      result.diff
                    )
                  )

                setConfidence(
                  fallbackConfidence
                )

                if (
                  now -
                  lastUiEmitRef.current >
                  100
                ) {
                  lastUiEmitRef.current =
                    now

                  onFrameStateRef.current?.({
                    activity:
                      'Unknown movement',

                    confidence:
                      fallbackConfidence,

                    source:
                      'camera-motion-fallback',

                    landmarks: 0,

                    status:
                      'FALLBACK'
                  })
                }

              } else {
                setMotion(
                  'Waiting for person'
                )

                setConfidence(0)

                if (
                  now -
                  lastUiEmitRef.current >
                  100
                ) {
                  lastUiEmitRef.current =
                    now

                  onFrameStateRef.current?.({
                    activity:
                      'No Person',

                    confidence: 0,

                    source:
                      'camera-motion-fallback',

                    landmarks: 0,

                    status:
                      'NO_PERSON'
                  })
                }
              }
            }
          }

          rafRef.current =
            requestAnimationFrame(loop)
        }

        rafRef.current =
          requestAnimationFrame(loop)

      } catch (cameraError) {
        if (!cancelled) {
          setError(
            cameraError?.message ||
            'Could not access the camera.'
          )

          setStatus(
            'Camera OFFLINE'
          )
        }
      }
    }

    boot()

    return () => {
      cancelled = true

      if (rafRef.current) {
        cancelAnimationFrame(
          rafRef.current
        )
      }

      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach(track =>
            track.stop()
          )
      }

      try {
        landmarkerRef.current?.close?.()
      } catch {}

      landmarkerRef.current = null
    }
  }, [])

  function drawSkeleton(
    canvas,
    pose
  ) {
    if (!canvas) return

    canvas.width =
      videoRef.current?.videoWidth ||
      960

    canvas.height =
      videoRef.current?.videoHeight ||
      540

    const ctx =
      canvas.getContext('2d')

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    )

    ctx.lineWidth = 3
    ctx.strokeStyle = '#19d3ff'

    for (
      const [a, b]
      of POSE_CONNECTIONS
    ) {
      if (
        !pose[a] ||
        !pose[b]
      ) {
        continue
      }

      ctx.beginPath()

      ctx.moveTo(
        pose[a].x *
          canvas.width,
        pose[a].y *
          canvas.height
      )

      ctx.lineTo(
        pose[b].x *
          canvas.width,
        pose[b].y *
          canvas.height
      )

      ctx.stroke()
    }

    ctx.font =
      '12px monospace'

    pose.forEach(
      (lm, i) => {
        const x =
          lm.x *
          canvas.width

        const y =
          lm.y *
          canvas.height

        ctx.fillStyle =
          '#16f2b0'

        ctx.beginPath()

        ctx.arc(
          x,
          y,
          4,
          0,
          Math.PI * 2
        )

        ctx.fill()

        ctx.fillStyle =
          '#fff'

        ctx.fillText(
          String(i),
          x + 5,
          y - 5
        )
      }
    )
  }

  function clearCanvas(canvas) {
    if (!canvas) return

    const ctx =
      canvas.getContext('2d')

    ctx.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    )
  }

  const stop = () => {
    if (rafRef.current) {
      cancelAnimationFrame(
        rafRef.current
      )
    }

    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach(track =>
          track.stop()
        )
    }

    onFrameStateRef.current?.({
      activity: '—',
      confidence: 0,
      source: 'offline',
      landmarks: 0,
      status: 'OFFLINE'
    })

    onStop?.()
  }

  return (
    <div className="prototype-camera">

      <div className="prototype-camera__stage">

        <video
          ref={videoRef}
          muted
          playsInline
          className="prototype-camera__video"
        />

        <canvas
          ref={canvasRef}
          className="prototype-camera__overlay"
        />

        <div className="prototype-camera__hud">

          <span>
            ● {status}
          </span>

          <span>
            MEDIAPIPE:{' '}
            {landmarkCount
              ? 'SKELETON TRACKING'
              : 'SEARCHING FOR PERSON'}
          </span>

          <span>
            LANDMARKS: {landmarkCount}
          </span>

        </div>

        <div className="prototype-camera__badge">

          {landmarkCount
            ? `${landmarkCount} LANDMARKS`
            : source ===
              'camera-motion-fallback'
              ? 'MOTION FALLBACK'
              : 'NO POSE YET'}

        </div>

      </div>

      {error && (
        <div className="live-controls__error">
          ⚠ {error}
        </div>
      )}

      {source ===
        'camera-motion-fallback' && (
        <div className="live-controls__hint">

          <strong>
            Prototype fallback active.
          </strong>{' '}

          The camera is detecting real
          frame movement, but named pose
          recognition is unavailable until
          MediaPipe finishes loading.

        </div>
      )}

      <div className="camera-live__stats">

        <span
          className={`pill ${
            source ===
            'mediapipe-geometry'
              ? 'pill--nominal'
              : 'pill--caution'
          }`}
        >
          <span className="pill-dot" />

          {source ===
          'mediapipe-geometry'
            ? 'MediaPipe Pose ONLINE'
            : 'Prototype Fallback'}
        </span>

        <span className="pill pill--active">

          <span className="pill-dot" />

          Skeleton:{' '}

          {landmarkCount
            ? '33 LANDMARKS'
            : 'WAITING'}

        </span>

        <span className="pill pill--pending">

          <span className="pill-dot" />

          Camera:{' '}

          {status.includes('ONLINE')
            ? 'ONLINE'
            : 'LOADING'}

        </span>

        <button
          className="btn"
          onClick={stop}
        >
          Stop Camera
        </button>

      </div>
    </div>
  )
}
