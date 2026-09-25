import AlertsFeed from '../components/AlertsFeed'
import { useExperiment } from '../context/ExperimentContext'

export default function Alerts() {
  const { alerts } = useExperiment()

  const counts = alerts.reduce(
    (acc, a) => ({ ...acc, [a.level]: (acc[a.level] ?? 0) + 1 }),
    { INFO: 0, WARNING: 0, ERROR: 0 }
  )

  return (
    <div className="page-single">
      <div className="alerts-summary">
        <div className="alerts-summary__card">
          <span className="pill pill--active">
            <span className="pill-dot" />
            Info
          </span>
          <span className="mono alerts-summary__count">{counts.INFO}</span>
        </div>
        <div className="alerts-summary__card">
          <span className="pill pill--caution">
            <span className="pill-dot" />
            Warning
          </span>
          <span className="mono alerts-summary__count">{counts.WARNING}</span>
        </div>
        <div className="alerts-summary__card">
          <span className="pill pill--error">
            <span className="pill-dot" />
            Error
          </span>
          <span className="mono alerts-summary__count">{counts.ERROR}</span>
        </div>
      </div>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header">
          <span className="panel-title">All Alerts</span>
        </div>
        <AlertsFeed alerts={alerts} emptyMessage="No alerts yet — start an experiment from the Live Experiment page." />
      </section>
    </div>
  )
}
