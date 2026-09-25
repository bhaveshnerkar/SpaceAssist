import { Link } from 'react-router-dom'
import ConfidenceGauge from '../components/ConfidenceGauge'
import StepTimeline from '../components/StepTimeline'
import AlertsFeed from '../components/AlertsFeed'
import HistoryTable from '../components/HistoryTable'
import StatusPill from '../components/StatusPill'
import { useExperiment, getLatestActivity } from '../context/ExperimentContext'
import { CONFIDENCE_THRESHOLDS } from '../constants'

export default function Dashboard() {
  const { experiment, history, alerts } = useExperiment()
  const latest = getLatestActivity(history, experiment)
  const recentHistory = history.slice(-5).reverse()
  const recentAlerts = alerts.slice(0, 4)

  return (
    <div className="dashboard">
      <div className="dashboard-grid">
        {/* Current Activity HUD */}
        <section className="panel dashboard-hud">
          <div className="panel-header">
            <span className="panel-title">Current Activity</span>
            <StatusPill status={latest.status} />
          </div>
          <div className="dashboard-hud__body">
            <div className="dashboard-hud__readout">
              <div className="dashboard-hud__row">
                <span className="eyebrow">Detected</span>
                <span className="dashboard-hud__value">{latest.detected ?? '—'}</span>
              </div>
              <div className="dashboard-hud__row">
                <span className="eyebrow">Expected</span>
                <span className="dashboard-hud__value dashboard-hud__value--muted">{latest.expected ?? '—'}</span>
              </div>
              <div className="dashboard-hud__row">
                <span className="eyebrow">Progress</span>
                <span className="mono dashboard-hud__value">{experiment.progress}</span>
              </div>
              <p className="dashboard-hud__message">{latest.message}</p>
            </div>
            <ConfidenceGauge confidence={latest.confidence ?? 0} thresholds={CONFIDENCE_THRESHOLDS} />
          </div>
        </section>

        {/* Step Trace */}
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

        {/* Alerts */}
        <section className="panel dashboard-alerts">
          <div className="panel-header">
            <span className="panel-title">Alerts</span>
            <Link to="/alerts" className="dashboard-link">
              View all →
            </Link>
          </div>
          <AlertsFeed alerts={recentAlerts} />
        </section>
      </div>

      {/* Activity History */}
      <section className="panel dashboard-history">
        <div className="panel-header">
          <span className="panel-title">Activity History</span>
          <Link to="/history" className="dashboard-link">
            View full log →
          </Link>
        </div>
        <HistoryTable events={recentHistory} thresholds={CONFIDENCE_THRESHOLDS} />
      </section>
    </div>
  )
}
