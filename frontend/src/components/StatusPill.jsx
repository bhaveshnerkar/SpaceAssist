import { statusTone, statusLabel } from './statusMeta'

export default function StatusPill({ status, customLabel }) {
  const tone = statusTone(status)
  return (
    <span className={`pill pill--${tone}`}>
      <span className="pill-dot" />
      {customLabel ?? statusLabel(status)}
    </span>
  )
}
