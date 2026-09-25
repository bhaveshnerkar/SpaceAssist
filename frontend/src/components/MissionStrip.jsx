const CONNECTION_META = {
  connecting: { tone: 'pending', label: 'Connecting…' },
  live: { tone: 'nominal', label: 'Live' },
  polling: { tone: 'caution', label: 'Polling' },
  offline: { tone: 'error', label: 'Backend Offline' },
}

export default function MissionStrip({ experiment, connectionStatus = 'connecting' }) {
  const aiOnline = experiment.ai_status === 'ONLINE'
  const conn = CONNECTION_META[connectionStatus] ?? CONNECTION_META.connecting

  return (
    <div className="mission-strip">
      <div className="mission-strip__item">
        <span className="eyebrow">Mission</span>
        <span className="mission-strip__value">BAS Experiment Simulation</span>
      </div>
      <div className="mission-strip__divider" />
      <div className="mission-strip__item">
        <span className="eyebrow">Connection</span>
        <span className={`pill pill--${conn.tone}`}>
          <span className="pill-dot" />
          {conn.label}
        </span>
      </div>
      <div className="mission-strip__divider" />
      <div className="mission-strip__item">
        <span className="eyebrow">Experiment</span>
        <span className="mission-strip__value">{experiment.name}</span>
      </div>
      <div className="mission-strip__divider" />
      <div className="mission-strip__item">
        <span className="eyebrow">Mode</span>
        <span className={`pill ${experiment.mode === 'DEMO' ? 'pill--pending' : 'pill--active'}`}>
          <span className="pill-dot" />
          {experiment.mode}
        </span>
      </div>
      <div className="mission-strip__divider" />
      <div className="mission-strip__item">
        <span className="eyebrow">AI Status</span>
        <span className={`pill ${aiOnline ? 'pill--nominal' : 'pill--caution'}`}>
          <span className="pill-dot" />
          {aiOnline ? 'Online' : 'Model Not Trained'}
        </span>
      </div>
    </div>
  )
}
