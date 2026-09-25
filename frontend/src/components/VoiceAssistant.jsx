import { useState, useRef, useCallback, useEffect } from 'react'
import { useExperiment } from '../context/ExperimentContext'
import { buildAnswer } from './voiceKnowledgeBase'

/**
 * A real, working voice assistant — built entirely on the browser's
 * native Web Speech API (SpeechRecognition + SpeechSynthesis). No
 * installs, no API keys, no external service.
 *
 * IMPORTANT HONESTY NOTE: this is a rule-based command/query matcher,
 * not a general-purpose AI that can answer "any question." Building
 * a fake one would mean either hallucinating answers or silently
 * calling out to an LLM API this project was never given credentials
 * for — both would break the honesty principle every other part of
 * this project follows (remember AI_MODEL_NOT_TRAINED?).
 *
 * What it CAN do thoroughly: answer almost anything about THIS
 * software specifically — see voiceKnowledgeBase.js, which covers
 * live experiment status, every major feature, and troubleshooting
 * for common problems encountered while building and running this
 * project. That knowledge base is deliberately kept in its own file
 * so it's easy to keep growing without this component getting messy.
 */

const SpeechRecognitionAPI =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

export default function VoiceAssistant() {
  const ctx = useExperiment()
  const { runDemo, haltDemo, reset, alerts, hasLoaded } = ctx
  const [supported] = useState(() => Boolean(SpeechRecognitionAPI))
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(null)
  const [log, setLog] = useState([]) // {who: 'you'|'assistant'|'alert', text}
  const [autoSpeakAlerts, setAutoSpeakAlerts] = useState(() => {
    const saved = localStorage.getItem('spaceassist_auto_speak_alerts')
    return saved === null ? true : saved === 'true'
  })
  const recognitionRef = useRef(null)
  const alertBaselineRef = useRef(null) // how many alerts existed when we started watching
  const voicesRef = useRef([])

  // Browsers load available voices asynchronously — getVoices() often
  // returns an empty list on the very first call, only becoming
  // populated once the 'voiceschanged' event fires. Cache whatever is
  // available and keep it updated so speak() always has the latest list.
  useEffect(() => {
    if (!window.speechSynthesis) return
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices()
    }
    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [])

  /**
   * Picks a female-sounding voice by name, since browsers don't
   * expose a reliable gender field on SpeechSynthesisVoice. This is a
   * best-effort heuristic against common female voice names shipped
   * by Chrome, Edge, and major operating systems — not guaranteed on
   * every machine, since available voices vary by OS and browser.
   * Falls back to whatever the browser's default voice is if no
   * obvious female match is found, rather than erroring.
   */
  const pickFemaleVoice = useCallback(() => {
    const voices = voicesRef.current
    if (!voices || voices.length === 0) return null

    const femaleNameHints = [
      'female', 'zira', 'samantha', 'susan', 'karen', 'victoria', 'moira',
      'tessa', 'fiona', 'kate', 'serena', 'ava', 'allison', 'hazel',
      'google us english', 'google uk english female', 'aria', 'jenny',
    ]

    const englishVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
    const searchPool = englishVoices.length > 0 ? englishVoices : voices

    const match = searchPool.find((v) => femaleNameHints.some((hint) => v.name.toLowerCase().includes(hint)))
    return match ?? null
  }, [])

  const speak = useCallback(
    (text) => {
      if (!window.speechSynthesis) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.pitch = 1.05 // slightly higher pitch reads more naturally with most female voice models
      const femaleVoice = pickFemaleVoice()
      if (femaleVoice) utterance.voice = femaleVoice
      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(utterance)
    },
    [pickFemaleVoice]
  )

  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeakAlerts((prev) => {
      const next = !prev
      localStorage.setItem('spaceassist_auto_speak_alerts', String(next))
      return next
    })
  }, [])

  // Automatically announce new ERROR / WARNING alerts the instant
  // they happen — e.g. the moment a wrong step is detected — instead
  // of waiting for someone to ask. This is why the assistant is
  // useful hands-free: an astronaut mid-procedure doesn't need to
  // stop and ask "any alerts?" out loud, it just gets spoken as it
  // happens. Only genuinely NEW alerts get spoken — the pre-existing
  // history from before this component mounted is never read aloud.
  useEffect(() => {
    if (!hasLoaded) return
    if (alertBaselineRef.current === null) {
      alertBaselineRef.current = alerts.length
      return
    }
    if (alerts.length > alertBaselineRef.current) {
      const newAlerts = alerts.slice(alertBaselineRef.current)
      alertBaselineRef.current = alerts.length
      if (!autoSpeakAlerts) return

      for (const alert of newAlerts) {
        if (alert.level === 'ERROR') {
          const text = `Alert: ${alert.message}`
          setLog((prev) => [...prev, { who: 'alert', text }])
          speak(text)
        } else if (alert.level === 'WARNING') {
          const text = `Caution: ${alert.message}`
          setLog((prev) => [...prev, { who: 'alert', text }])
          speak(text)
        }
      }
    }
  }, [alerts, hasLoaded, autoSpeakAlerts, speak])

  const handleTranscript = useCallback(
    (transcript) => {
      setLog((prev) => [...prev, { who: 'you', text: transcript }])
      const { text, action } = buildAnswer(transcript, ctx)
      setLog((prev) => [...prev, { who: 'assistant', text }])
      speak(text)

      if (action === 'runDemo') runDemo()
      else if (action === 'haltDemo') haltDemo()
      else if (action === 'reset') reset()
    },
    [ctx, speak, runDemo, haltDemo, reset]
  )

  const startListening = useCallback(() => {
    if (!supported) {
      setError('Voice recognition is not supported in this browser. Try Chrome or Edge.')
      return
    }
    setError(null)
    window.speechSynthesis?.cancel()

    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onerror = (event) => {
      setListening(false)
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        setError("Microphone permission was denied. Allow it in your browser's address bar and try again.")
      } else if (event.error === 'no-speech') {
        setError('No speech was detected. Try again.')
      } else {
        setError(`Voice recognition error: ${event.error}`)
      }
    }
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      handleTranscript(transcript)
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [supported, handleTranscript])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  return (
    <div className={`voice-assistant ${open ? 'voice-assistant--open' : ''}`}>
      {open && (
        <div className="voice-assistant__panel">
          <div className="voice-assistant__header">
            <span className="eyebrow">Voice Assistant</span>
            <button className="voice-assistant__close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          {!supported && (
            <div className="live-controls__error" style={{ margin: 12 }}>
              ⚠ Voice recognition isn't supported in this browser. Try Chrome or Edge.
            </div>
          )}
          {error && (
            <div className="live-controls__error" style={{ margin: 12 }}>
              ⚠ {error}
            </div>
          )}

          <div className="voice-assistant__log scrollbar-thin">
            {log.length === 0 ? (
              <div className="empty-state">
                Ask about the current step, status, confidence, alerts, or say "start demo".
              </div>
            ) : (
              log.map((entry, i) => (
                <div key={i} className={`voice-assistant__line voice-assistant__line--${entry.who}`}>
                  <span className="eyebrow">
                    {entry.who === 'you' ? 'You said' : entry.who === 'alert' ? 'Auto-announced' : 'Assistant'}
                  </span>
                  <p>{entry.text}</p>
                </div>
              ))
            )}
          </div>

          <div className="voice-assistant__controls">
            {!listening ? (
              <button className="btn btn--primary" onClick={startListening} disabled={!supported || speaking}>
                🎤 {speaking ? 'Speaking…' : 'Ask a question'}
              </button>
            ) : (
              <button className="btn btn--danger" onClick={stopListening}>
                ● Listening… (click to stop)
              </button>
            )}
            <label className="voice-assistant__toggle">
              <input type="checkbox" checked={autoSpeakAlerts} onChange={toggleAutoSpeak} />
              <span>Auto-announce wrong-step alerts out loud</span>
            </label>
          </div>
        </div>
      )}

      <button
        className="voice-assistant__fab"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle voice assistant"
        title="Voice Assistant"
      >
        {listening ? '●' : '🎤'}
      </button>
    </div>
  )
}
