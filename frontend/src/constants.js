/**
 * Constants shared across the live app. These mirror the backend
 * defaults in app/experiment/state_machine.py so the UI displays
 * the same thresholds the state machine actually enforces.
 */

export const CONFIDENCE_THRESHOLDS = {
  high: 80,
  low: 50,
  stabilityFrames: 3,
}

export const DEFAULT_STEPS = [
  { step_index: 0, step_name: 'Pick Container', status: 'PENDING' },
  { step_index: 1, step_name: 'Open Container', status: 'PENDING' },
  { step_index: 2, step_name: 'Add Sample', status: 'PENDING' },
  { step_index: 3, step_name: 'Close Container', status: 'PENDING' },
  { step_index: 4, step_name: 'Place Container in Analyzer', status: 'PENDING' },
  { step_index: 5, step_name: 'Record Result', status: 'PENDING' },
]

// Shown before the first successful fetch, or if the experiment has
// never been started on the backend.
export const DEFAULT_EXPERIMENT = {
  experiment_id: null,
  name: 'Sample Processing Experiment',
  mode: 'DEMO',
  ai_status: 'AI_MODEL_NOT_TRAINED',
  status: 'NOT_STARTED',
  current_step_index: 0,
  total_steps: 6,
  progress: '0/6',
  steps: DEFAULT_STEPS,
}
