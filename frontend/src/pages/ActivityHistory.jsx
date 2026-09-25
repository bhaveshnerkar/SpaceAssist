import HistoryTable from '../components/HistoryTable'
import { useExperiment } from '../context/ExperimentContext'
import { CONFIDENCE_THRESHOLDS } from '../constants'

export default function ActivityHistory() {
  const { history } = useExperiment()

  return (
    <div className="page-single">
      <section className="panel">
        <div className="panel-header">
          <span className="panel-title">Full Activity Log</span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {history.length} events
          </span>
        </div>
        <HistoryTable
          events={history}
          thresholds={CONFIDENCE_THRESHOLDS}
          emptyMessage="No activity yet — start an experiment from the Live Experiment page."
        />
      </section>
    </div>
  )
}
