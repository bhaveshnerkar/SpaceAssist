import { useExperiment } from '../context/ExperimentContext'
import { CONFIDENCE_THRESHOLDS } from '../constants'

function SettingRow({ label, description, children }) {
  return (
    <div className="setting-row">
      <div>
        <div className="setting-row__label">{label}</div>
        <div className="setting-row__description">{description}</div>
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  )
}

export default function Settings() {
  const { experiment } = useExperiment()

  return (
    <div className="page-single">
      <section className="panel">
        <div className="panel-header">
          <span className="panel-title">AI Confidence Thresholds</span>
          <span className="eyebrow">Read-only — live values from the state machine</span>
        </div>
        <div className="settings-body">
          <SettingRow
            label="High Confidence Threshold"
            description="Predictions at or above this value are treated as high confidence."
          >
            <input className="settings-input mono" value={`${CONFIDENCE_THRESHOLDS.high}%`} readOnly />
          </SettingRow>
          <SettingRow
            label="Low Confidence Threshold"
            description="Predictions below this value are ignored entirely."
          >
            <input className="settings-input mono" value={`${CONFIDENCE_THRESHOLDS.low}%`} readOnly />
          </SettingRow>
          <SettingRow
            label="Stability Frames"
            description="Consecutive matching frames required before a step is confirmed."
          >
            <input className="settings-input mono" value={CONFIDENCE_THRESHOLDS.stabilityFrames} readOnly />
          </SettingRow>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-header">
          <span className="panel-title">Experiment Mode</span>
        </div>
        <div className="settings-body">
          <SettingRow label="Active Mode" description="Switch between simulated predictions and live webcam input.">
            <div className="mode-toggle">
              <button
                className={`mode-toggle__option${experiment.mode === 'DEMO' ? ' mode-toggle__option--active' : ''}`}
                disabled
              >
                Demo Mode
              </button>
              <button
                className={`mode-toggle__option${experiment.mode === 'CAMERA' ? ' mode-toggle__option--active' : ''}`}
                disabled
                title="Camera Mode arrives in Phase 5"
              >
                Camera Mode
              </button>
            </div>
          </SettingRow>
        </div>
      </section>
    </div>
  )
}
