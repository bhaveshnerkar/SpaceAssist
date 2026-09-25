import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExperiment } from '../context/ExperimentContext'
import { parseExperimentTxt } from '../services/api'

const BUILT_INS = [
  { id: 'simple-motion', name: 'Simple Motion Experiment', description: 'Stand, walk, reach and sit calibration.', steps: [['Stand still','Stand'],['Walk forward','Walk'],['Reach forward','Reach'],['Return to standing','Stand'],['Sit down','Sit']] },
  { id: 'object-picking', name: 'Object Picking Experiment', description: 'Reach, pick, walk and place an object.', steps: [['Stand beside the object','Stand'],['Reach toward the object','Reach'],['Pick up the object','Pick'],['Walk to the target area','Walk'],['Place the object down','Place']] },
  { id: 'yoga-monitoring', name: 'Simple Yoga Monitoring', description: 'Stretch, bend and posture monitoring.', steps: [['Stand in starting position','Stand'],['Stretch both arms','Stretch'],['Bend down slowly','Bend'],['Return to standing','Stand'],['Sit for recovery','Sit']] },
]

export default function DesignExperiment() {
  const { start, startCustom, actionError } = useExperiment()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [steps, setSteps] = useState([])
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedBuiltIn, setSelectedBuiltIn] = useState(null)

  const parseText = (value) => value.split('\n').map((name) => name.trim()).filter(Boolean).map((name) => ({ name, motion: guess(name) }))
  const guess = (name) => {
    const t = name.toLowerCase()
    const rules = [['pick','Pick'],['grab','Pick'],['reach','Reach'],['walk','Walk'],['open','Open'],['pour','Pour'],['close','Close'],['place','Place'],['put down','Place'],['sit','Sit'],['stand','Stand'],['wait','Idle'],['idle','Idle'],['mix','Mix'],['stir','Mix'],['bend','Bend'],['stretch','Stretch']]
    return rules.find(([k]) => t.includes(k))?.[1] ?? null
  }
  const setStepText = (value) => { setText(value); setSteps(parseText(value)) }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setMessage('Parsing experiment…')
    try {
      const data = await parseExperimentTxt(file)
      setFileName(file.name); setName(data.name); setSteps(data.steps); setText(data.steps.map((s) => s.name).join('\n')); setMessage(`${data.total_steps} steps imported. Review the motion mapping below.`)
    } catch (err) { setMessage(err.message) } finally { setBusy(false) }
  }

  const handleStart = async () => {
    if (!name.trim() || !steps.length) return
    setBusy(true)
    const ok = await startCustom(name.trim(), steps.map((s) => ({ name: s.name, motion: s.motion, needs_manual_confirmation: !s.motion })))
    setBusy(false)
    if (ok) navigate('/live')
  }

  return <div className="page-single">
    <section className="panel">
      <div className="panel-header"><span className="panel-title">Experiment Builder</span><span className="eyebrow">TXT → MOTION → LIVE VALIDATION</span></div>
      <div className="designer-intro"><p>Choose a built-in experiment or upload your own TXT procedure. SpaceAssist extracts each step and maps recognizable language to a motion class.</p></div>
      <div className="designer-cards">
        {BUILT_INS.map((x) => { const mapped = x.steps.map(([stepName,motion]) => ({name: stepName,motion})); return (
          <button key={x.id} className={`experiment-card ${selectedBuiltIn === x.id ? 'experiment-card--selected' : ''}`} onClick={() => { setSelectedBuiltIn(x.id); setName(x.name); setMessage(x.description); setSteps(mapped); setText(mapped.map(s => s.name).join('\n')); localStorage.setItem('spaceassist.selectedTemplate', x.id) }}>
            <strong>{x.name}</strong><span>{x.description}</span><small>{mapped.length} guided AI steps</small>
          </button>
        )})}
      </div>
      <div className="upload-zone"><label className="btn btn--primary">Upload Experiment .txt<input type="file" accept=".txt,text/plain" onChange={handleFile} hidden /></label>{fileName && <span className="eyebrow">{fileName}</span>}</div>
      <label className="designer-form__label">Experiment name</label>
      <input className="settings-input designer-form__name-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Container Handling" maxLength={120}/>
      <label className="designer-form__label">Steps — one per line</label>
      <textarea className="designer-form__textarea mono" rows={9} value={text} onChange={e => setStepText(e.target.value)} placeholder={'Stand beside the table\nReach toward the container\nPick up the container\nWalk to the analyzer\nPlace the container'} />
      {steps.length > 0 && <div className="motion-map"><div className="eyebrow">AI MOTION MAPPING</div>{steps.map((s,i) => <div className="motion-map__row" key={i}><span>{i+1}. {s.name}</span><strong className={s.motion ? 'mapped' : 'unmapped'}>{s.motion ?? 'MANUAL CONFIRMATION'}</strong></div>)}</div>}
      {message && <div className="live-controls__hint">{message}</div>}
      {actionError && <div className="live-controls__error">⚠ {actionError}</div>}
      {selectedBuiltIn && (
        <button className="btn btn--primary designer-form__submit" disabled={busy} onClick={async () => { setBusy(true); localStorage.setItem('spaceassist.selectedTemplate', selectedBuiltIn); await start('CAMERA', selectedBuiltIn); setBusy(false); navigate('/live') }}>
          {busy ? 'Starting AI Experiment…' : 'Start Selected Experiment → Live AI'}
        </button>
      )}
      {!selectedBuiltIn && <button className="btn btn--primary designer-form__submit" disabled={busy || !name.trim() || !steps.length} onClick={handleStart}>{busy ? 'Processing…' : 'Start Custom TXT Experiment'}</button>}
    </section>
  </div>
}
