import { confidenceTone } from './statusMeta'

const CX = 110
const CY = 100
const R = 80
const START_ANGLE = -140
const END_ANGLE = 140

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  }
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const p1 = polarToCartesian(cx, cy, r, startAngle)
  const p2 = polarToCartesian(cx, cy, r, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`
}

function angleForValue(value) {
  return START_ANGLE + (Math.max(0, Math.min(100, value)) / 100) * (END_ANGLE - START_ANGLE)
}

const TONE_COLOR = {
  nominal: 'var(--status-nominal)',
  caution: 'var(--status-caution)',
  error: 'var(--status-error)',
}

/**
 * A radial instrument dial for AI confidence — modeled on analog
 * mission gauges rather than a generic circular progress bar.
 * Tick marks at the high/low confidence thresholds show exactly
 * where the state machine's decision boundaries sit.
 */
export default function ConfidenceGauge({ confidence, thresholds = { high: 80, low: 50 }, size = 220 }) {
  const tone = confidenceTone(confidence, thresholds)
  const color = TONE_COLOR[tone]
  const valueAngle = angleForValue(confidence)

  const trackPath = describeArc(CX, CY, R, START_ANGLE, END_ANGLE)
  const valuePath = describeArc(CX, CY, R, START_ANGLE, valueAngle)

  const lowTickAngle = angleForValue(thresholds.low)
  const highTickAngle = angleForValue(thresholds.high)

  const tick = (angle) => {
    const outer = polarToCartesian(CX, CY, R + 7, angle)
    const inner = polarToCartesian(CX, CY, R - 7, angle)
    return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y }
  }
  const lowTick = tick(lowTickAngle)
  const highTick = tick(highTickAngle)

  return (
    <div style={{ width: size, maxWidth: '100%', margin: '0 auto', position: 'relative' }}>
      <svg viewBox="0 0 220 190" style={{ width: '100%', display: 'block' }}>
        <path d={trackPath} fill="none" stroke="var(--border-hairline)" strokeWidth="10" strokeLinecap="round" />
        <line {...lowTick} stroke="var(--status-error)" strokeWidth="2" opacity="0.6" />
        <line {...highTick} stroke="var(--status-nominal)" strokeWidth="2" opacity="0.6" />
        <path
          d={valuePath}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'all 0.3s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -12%)',
          textAlign: 'center',
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 40, fontWeight: 600, color, lineHeight: 1, transition: 'color 0.3s ease' }}
        >
          {Math.round(confidence)}
          <span style={{ fontSize: 18, opacity: 0.7 }}>%</span>
        </div>
        <div className="eyebrow" style={{ marginTop: 6 }}>
          Confidence
        </div>
      </div>
    </div>
  )
}
