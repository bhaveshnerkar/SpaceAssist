import StatusPill from './StatusPill'
import { formatClock, confidenceTone } from './statusMeta'

export default function HistoryTable({ events, thresholds = { high: 80, low: 50 }, emptyMessage = 'No activity events recorded yet.' }) {
  if (!events || events.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>
  }

  return (
    <div className="history-table-wrap scrollbar-thin">
      <table className="history-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Expected</th>
            <th>Detected</th>
            <th>Confidence</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => {
            const tone = confidenceTone(e.confidence, thresholds)
            return (
              <tr key={`${e.timestamp}-${i}`}>
                <td className="mono history-table__time">{formatClock(e.timestamp)}</td>
                <td>{e.expected}</td>
                <td className={e.expected !== e.detected ? 'history-table__mismatch' : ''}>{e.detected}</td>
                <td className={`mono history-table__confidence history-table__confidence--${tone}`}>
                  {e.confidence.toFixed(0)}%
                </td>
                <td>
                  <StatusPill status={e.status} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
