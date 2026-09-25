/**
 * Shared mapping from backend status strings to display treatment.
 * Kept in one place so every component (gauge, timeline, table, pills)
 * agrees on what "CORRECT" vs "SEQUENCE_ERROR" looks like.
 */

export const STATUS_META = {
  CORRECT: { label: 'Correct', tone: 'nominal' },
  COMPLETED: { label: 'Completed', tone: 'nominal' },
  IN_PROGRESS: { label: 'In Progress', tone: 'active' },
  PENDING: { label: 'Confirming', tone: 'active' },
  LOW_CONFIDENCE: { label: 'Low Confidence', tone: 'caution' },
  UNKNOWN_ACTION: { label: 'Unknown Action', tone: 'caution' },
  SEQUENCE_ERROR: { label: 'Sequence Error', tone: 'error' },
  NOT_STARTED: { label: 'Not Started', tone: 'pending' },
}

export function statusTone(status) {
  return STATUS_META[status]?.tone ?? 'pending'
}

export function statusLabel(status) {
  return STATUS_META[status]?.label ?? status ?? 'Unknown'
}

export function confidenceTone(confidence, thresholds = { high: 80, low: 50 }) {
  if (confidence >= thresholds.high) return 'nominal'
  if (confidence >= thresholds.low) return 'caution'
  return 'error'
}

export function formatTime(isoString) {
  if (!isoString) return '--:--:--'
  const d = new Date(isoString)
  return d.toLocaleTimeString('en-US', { hour12: false })
}

export function formatClock(isoString) {
  if (!isoString) return '--:--:--.---'
  const d = new Date(isoString)
  const time = d.toLocaleTimeString('en-US', { hour12: false })
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${time}.${ms}`
}
