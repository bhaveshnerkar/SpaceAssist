const TONE_STYLES = {
  CORRECT: { border: 'var(--status-nominal)', fill: 'var(--status-nominal)', label: 'Completed' },
  IN_PROGRESS: { border: 'var(--status-active)', fill: 'transparent', label: 'Current step' },
  RETRY: { border: 'var(--status-error)', fill: 'var(--status-error-dim)', label: 'Retry required' },
  PENDING: { border: 'var(--border-hairline)', fill: 'transparent', label: 'Waiting' },
}

function Node({ step }) {
  const style = TONE_STYLES[step.status] ?? TONE_STYLES.PENDING
  const isActive = step.status === 'IN_PROGRESS'
  const isDone = step.status === 'CORRECT'
  const isRetry = step.status === 'RETRY'
  return (
    <div className={`step-node ${isDone ? 'step-node--done' : ''} ${isRetry ? 'step-node--retry' : ''}`}>
      <div className={`step-node__marker${isActive ? ' step-node__marker--active' : ''}${isDone ? ' step-node__marker--done' : ''}${isRetry ? ' step-node__marker--retry' : ''}`} style={{ borderColor: style.border, background: style.fill }}>
        <span className="step-node__icon">{isDone ? '✓' : isRetry ? '!' : step.step_index + 1}</span>
      </div>
      <div className="step-node__label">
        <div className="step-node__name">{step.step_name}</div>
        <div className="step-node__motion">Motion: <strong>{step.motion || 'Manual'}</strong></div>
        <div className="eyebrow step-node__status" style={{ color: style.border }}>{style.label}</div>
      </div>
    </div>
  )
}

export default function StepTimeline({ steps = [] }) {
  return (
    <div className="step-timeline">
      {steps.map((step, i) => (
        <div key={step.step_index} className="step-timeline__row">
          <Node step={step} />
          {i < steps.length - 1 && <div className={`step-timeline__connector ${step.status === 'CORRECT' ? 'step-timeline__connector--done' : ''}`} />}
        </div>
      ))}
    </div>
  )
}
