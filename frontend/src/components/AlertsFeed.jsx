import { formatClock } from './statusMeta'

const LEVEL_META = {
  INFO: { tone: 'active', glyph: 'i' },
  WARNING: { tone: 'caution', glyph: '!' },
  ERROR: { tone: 'error', glyph: '×' },
}

function AlertRow({ alert }) {
  const meta = LEVEL_META[alert.level] ?? LEVEL_META.INFO
  return (
    <div className={`alert-row alert-row--${meta.tone}`}>
      <div className={`alert-row__glyph alert-row__glyph--${meta.tone} mono`}>{meta.glyph}</div>
      <div className="alert-row__body">
        <div className="alert-row__top">
          <span className="eyebrow" style={{ color: `var(--status-${meta.tone})` }}>
            {alert.level}
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {formatClock(alert.timestamp)}
          </span>
        </div>
        <div className="alert-row__message">{alert.message}</div>
      </div>
    </div>
  )
}

export default function AlertsFeed({ alerts, emptyMessage = 'No alerts recorded yet.' }) {
  if (!alerts || alerts.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>
  }
  return (
    <div className="alerts-feed scrollbar-thin">
      {alerts.map((a, i) => (
        <AlertRow key={`${a.timestamp}-${i}`} alert={a} />
      ))}
    </div>
  )
}
