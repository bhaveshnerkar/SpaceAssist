import { getLatestActivity } from '../context/ExperimentContext'

/**
 * The voice assistant's knowledge base.
 *
 * This is a rule-based matcher, not a general AI — it can't answer
 * truly arbitrary questions ("what's the capital of France") because
 * doing that honestly requires a real AI service with an API key,
 * which this project doesn't have. Faking that would mean making up
 * answers, which is worse than not answering.
 *
 * What it CAN do, thoroughly: answer almost anything about THIS
 * software — every feature, every status field, every error message,
 * every troubleshooting step covered in this project's own README and
 * JUDGE_DEMO.md files — because all of that is real, known, factual
 * information this file can be honest about.
 *
 * Organized into topics so it's easy to keep extending:
 *   - live experiment status (grounded in real current app state)
 *   - commands (start demo, reset, etc.)
 *   - feature explanations (what is X)
 *   - troubleshooting (why isn't X working)
 *   - project meta info (what is this, what's it built with)
 */

// Common filler words stripped out before the keyword-overlap
// fallback below — without this, "what step are we on" would reduce
// to a single generic word ("step") that could over-match unrelated
// questions. Keeping only the meaningful words makes the fallback
// both more tolerant of rephrasing AND safer against false positives.
const STOPWORDS = new Set([
  'what', 'whats', "what's", 'is', 'are', 'the', 'a', 'an', 'to', 'on', 'in', 'of', 'for',
  'do', 'does', 'did', 'how', 'can', 'you', 'i', 'me', 'my', 'we', 'our', 'it', 'its', "it's",
  'this', 'that', 'with', 'about', 'tell', 'please', 'would', 'could', 'should', 'and', 'or',
  'be', 'was', 'were', 'there', 'here', 'right', 'now', 'currently', 'going', 'give', 'am',
])

function keywordsOf(phrase) {
  return phrase.split(' ').filter((w) => w.length > 0 && !STOPWORDS.has(w))
}

/**
 * A question is considered a match if it either contains the exact
 * stored phrase (fast path, unchanged from before), OR contains every
 * meaningful keyword from that phrase somewhere in the transcript,
 * in any order — so "which step comes next" still matches a phrase
 * stored as "next step", and "can you tell me the current status"
 * still matches "status", without needing to hand-write every
 * possible rephrasing in every phrase list.
 *
 * The fallback requires at least 2 real keywords to fire, so a phrase
 * that reduces to one generic word (like "step" alone) never
 * over-matches unrelated questions — it just relies on the exact
 * substring check instead, same as before this change.
 */
function matches(t, ...phrases) {
  return phrases.some((p) => {
    if (t.includes(p)) return true
    const keywords = keywordsOf(p)
    if (keywords.length < 2) return false
    return keywords.every((w) => t.includes(w))
  })
}

// ---- Live status answers (grounded in real, current app state) ----

function answerLiveStatus(t, ctx) {
  const { experiment, history, alerts, demoRunning, cameraStatus } = ctx
  const latest = getLatestActivity(history, experiment)

  if (matches(t, 'current step', 'what step', 'what are we on', 'next step')) {
    const step = experiment.steps[experiment.current_step_index]
    if (experiment.status === 'NOT_STARTED') return 'The experiment has not been started yet.'
    if (experiment.status === 'COMPLETED') return 'The experiment is already complete. All steps are done.'
    return `The current step is: ${step?.step_name ?? 'unknown'}.`
  }

  if (matches(t, 'progress', 'how far', 'how many steps')) {
    return `Progress is ${experiment.progress}. ${experiment.current_step_index} of ${experiment.total_steps} steps confirmed.`
  }

  if (matches(t, 'status', 'how is it going', "what's happening", 'what is happening')) {
    return `The experiment status is: ${experiment.status.replace(/_/g, ' ').toLowerCase()}.`
  }

  if (matches(t, 'confidence', 'confident')) {
    if (!history.length) return 'No confidence reading yet. Start the experiment first.'
    return `The latest confidence reading is ${Math.round(latest.confidence)} percent.`
  }

  if (matches(t, 'alert', 'warning', 'error count', 'any errors', 'any warnings')) {
    const errorCount = alerts.filter((a) => a.level === 'ERROR').length
    const warningCount = alerts.filter((a) => a.level === 'WARNING').length
    if (alerts.length === 0) return 'There are no alerts recorded yet.'
    return `There are ${alerts.length} total alerts: ${errorCount} error and ${warningCount} warning.`
  }

  if (matches(t, 'history', 'how many events', 'activity log')) {
    return `There are ${history.length} events recorded in the activity history.`
  }

  if (/\bmode\b/.test(t) && !matches(t, 'demo mode', 'camera mode', 'custom mode', 'model')) {
    return `The current mode is ${experiment.mode}.`
  }

  if (matches(t, 'is the ai trained', 'model trained', 'ai status')) {
    return experiment.ai_status === 'ONLINE'
      ? 'The activity recognition model is trained and online.'
      : 'The AI model has not been trained yet. It is honestly reporting that instead of guessing.'
  }

  if (matches(t, 'is the demo running', 'demo running')) {
    return demoRunning ? 'Yes, the demo is currently running.' : 'No, the demo is not running.'
  }

  if (matches(t, 'camera status', 'is the camera working', 'is the camera on')) {
    return cameraStatus.message ?? 'Camera status is unknown.'
  }

  return null
}

// ---- Commands (trigger real actions) ----

function matchCommand(t) {
  if (matches(t, 'start demo', 'run demo', 'begin demo', 'launch demo')) return 'runDemo'
  if (matches(t, 'stop demo', 'halt demo', 'cancel demo')) return 'haltDemo'
  if (matches(t, 'reset')) return 'reset'
  return null
}

// ---- Feature explanations & troubleshooting (static project knowledge) ----

const KNOWLEDGE_BASE = [
  {
    when: ['sequence error', 'what is a sequence error'],
    answer:
      'A sequence error means the system detected the wrong action for the current step — for example, placing the container in the analyzer before closing it. The experiment does not advance until the correct action is performed.',
  },
  {
    when: ['low confidence', 'what is low confidence'],
    answer:
      'Low confidence means a prediction came in below 50 percent certainty, so the system ignores it rather than risk acting on a bad guess.',
  },
  {
    when: ['what is demo mode', 'about demo mode'],
    answer:
      'Demo Mode automatically feeds a realistic, scripted sequence of predictions through the real experiment tracker, including one intentional wrong action, so you can see the whole system work end to end without a camera.',
  },
  {
    when: ['what is camera mode', 'about camera mode'],
    answer:
      'Camera Mode uses your real webcam with OpenCV and MediaPipe to detect body and hand landmarks live. It needs those Python packages installed and a working webcam.',
  },
  {
    when: ['custom experiment', 'design experiment', 'design a science experiment'],
    answer:
      'On the Design Experiment page you can type in any science procedure as a name and a list of steps, and the app will guide you through it with a Mark Step Complete button, the same way the built-in experiment works.',
  },
  {
    when: ['ai model not trained', 'why is the ai not trained', 'model not trained'],
    answer:
      'No one has collected and labeled real training data yet, so there is honestly no trained recognition model. The app says so plainly instead of faking a result. You can train one yourself using the training folder.',
  },
  {
    when: ['train the model', 'how do i train', 'training pipeline'],
    answer:
      'There is a full training pipeline in the training folder: collect_data dot p y records webcam footage, extract_features dot p y processes it, train_model dot p y trains a real neural network, and predict dot p y runs it live. See training slash README for full instructions.',
  },
  {
    when: [
      'backend offline', 'backend not working', 'backend is offline', 'backend down',
      'failed to fetch', "backend isn't running", 'backend is not running',
      'server offline', "can't connect", 'cant connect', 'connection failed',
    ],
    answer:
      'If the dashboard shows Backend Offline, the backend server most likely is not running. Start it with start underscore backend dot bat, or use START underscore HERE dot bat to start both servers at once, then refresh the page.',
  },
  {
    when: [
      'camera not working', 'camera error', 'camera unavailable', 'camera is not working',
      "camera isn't working", 'camera doesnt work', "camera doesn't work", 'webcam not working',
      'camera wont start', "camera won't start", 'camera not starting',
    ],
    answer:
      'Camera Mode needs OpenCV and MediaPipe installed in the backend, plus a real webcam not being used by another app. If those are not available, you can still use the browser camera option, which needs no installation at all, or just use Demo Mode.',
  },
  {
    when: ['how do i start this', 'how do i run this', 'how do i run the app'],
    answer:
      'The simplest way is to double-click START underscore HERE dot bat. It starts both the backend and frontend automatically and opens your browser.',
  },
  {
    when: ['what is spaceassist', 'what is this project', 'what is this app', 'what does this do'],
    answer:
      'SpaceAssist AI is a prototype for A I powered human activity recognition during on board space station experiments. It tracks whether an astronaut is performing a lab procedure in the correct order, using computer vision.',
  },
  {
    when: ['what is this built with', 'what technology', 'what tech stack'],
    answer:
      'The backend is Python with FastAPI and SQLite. The frontend is React with Vite. Camera Mode uses OpenCV and MediaPipe, and the activity recognition interface is built with PyTorch.',
  },
  {
    when: ['what are the six steps', 'what are the steps', 'list the steps', 'what activities'],
    answer:
      'The six tracked steps are: Pick Container, Open Container, Add Sample, Close Container, Place Container in Analyzer, and Record Result.',
  },
  {
    when: ['who made this', 'who built this', 'who created this'],
    answer: 'This is a hackathon prototype built for an ISRO problem statement on space technology.',
  },
]

function answerFromKnowledgeBase(t) {
  for (const entry of KNOWLEDGE_BASE) {
    if (matches(t, ...entry.when)) return entry.answer
  }
  return null
}

// ---- General space & astronaut knowledge ----
// These are stable, well-established facts, not live data — safe to
// state directly, unlike arbitrary open-ended questions where a
// wrong guess would be worse than no answer.
const SPACE_KNOWLEDGE_BASE = [
  {
    when: ['what is microgravity', 'what is zero gravity', 'what is weightlessness', 'what causes weightlessness'],
    answer:
      'Microgravity is the condition of continuous free fall around Earth. Gravity is still nearly as strong in low Earth orbit as on the ground, but the spacecraft and everything inside it fall together, so objects and astronauts appear to float, weightless.',
  },
  {
    when: ['what is the international space station', 'what is the iss', 'about the iss'],
    answer:
      'The International Space Station is a large research station orbiting about four hundred kilometers above Earth, jointly operated by the United States, Russia, Europe, Japan, and Canada. It has been continuously inhabited since November 2000.',
  },
  {
    when: ['how fast does the iss travel', 'how fast is the iss', 'iss speed', 'how fast does the space station go'],
    answer: 'The International Space Station travels at about twenty eight thousand kilometers per hour, completing an orbit of Earth roughly every ninety minutes.',
  },
  {
    when: ['what is bas', 'bharatiya antariksh station', 'india space station', "india's space station"],
    answer:
      'Bharatiya Antariksh Station is the space station India, through ISRO, plans to build, targeted for the twenty thirties, starting with its first module.',
  },
  {
    when: ['what is gaganyaan', 'about gaganyaan'],
    answer: "Gaganyaan is ISRO's human spaceflight program to send Indian astronauts into low Earth orbit aboard an Indian-built spacecraft.",
  },
  {
    when: ['what is isro'],
    answer: 'ISRO is the Indian Space Research Organisation, the national space agency of India.',
  },
  {
    when: ['first indian in space', 'who was the first indian in space', 'who is the first indian astronaut'],
    answer: 'Rakesh Sharma was the first Indian in space, flying aboard Soyuz T eleven in nineteen eighty four.',
  },
  {
    when: ['how do astronauts sleep', 'sleeping in space', 'how do astronauts sleep in space'],
    answer:
      'Astronauts sleep in small sleeping bags attached to the wall of their crew cabin, so they do not float around the spacecraft while asleep.',
  },
  {
    when: ['how do astronauts eat', 'eating in space', 'food in space', 'astronaut food'],
    answer:
      'Food in space is specially prepared, often dehydrated or packaged in pouches, to prevent crumbs and liquids from floating loose. Trays are sometimes held down with magnets or velcro.',
  },
  {
    when: ['muscle loss', 'bone loss', 'what happens to muscles in space', 'why do astronauts exercise'],
    answer:
      'Without gravity working against them, astronauts lose muscle mass and bone density over time in space. That is why they exercise roughly two hours a day on the space station to slow that loss.',
  },
  {
    when: ['what is a spacesuit', 'about spacesuits', 'how do spacesuits work'],
    answer:
      'A spacesuit is a pressurized suit that protects an astronaut during a spacewalk from vacuum, extreme temperatures, and radiation, while supplying oxygen and removing carbon dioxide.',
  },
  {
    when: ['how do astronauts breathe', 'breathing in space'],
    answer:
      'Inside the spacecraft, life support systems supply oxygen and remove carbon dioxide from the air. During a spacewalk, a spacesuit backpack called the primary life support system supplies oxygen directly.',
  },
  {
    when: ['why do experiments need microgravity', 'why microgravity experiments', 'why do this experiment in space'],
    answer:
      'Without gravity causing convection and sedimentation, scientists can study material and biological processes differently in microgravity — things like protein crystal growth, combustion, and fluid behavior often work in ways that reveal science hidden by gravity on Earth.',
  },
  {
    when: ['what is a bas experiment', 'what does bas mean', 'bas experiment'],
    answer:
      'In this project, BAS refers to on board experiments performed on a space station, similar to how astronauts run science procedures on the International Space Station or India\'s planned Bharatiya Antariksh Station.',
  },
]

function answerFromSpaceKnowledgeBase(t) {
  for (const entry of SPACE_KNOWLEDGE_BASE) {
    if (matches(t, ...entry.when)) return entry.answer
  }
  return null
}

function answerGreetingOrHelp(t) {
  if (matches(t, 'help', 'what can you do', 'what can you ask', 'what can i ask')) {
    return (
      'I can tell you about the current step, status, confidence, alerts, and history. I can start, stop, or reset the experiment. ' +
      'I can also explain any feature of this software — sequence errors, demo mode, camera mode, custom experiments, or training the AI model — ' +
      'and help troubleshoot common problems like the backend being offline or the camera not working. I can also answer general questions about ' +
      "space and astronaut life, like the space station, microgravity, or spacesuits. I can't answer questions completely unrelated to those topics, " +
      'since that would need a real AI service this project does not have.'
    )
  }
  if (matches(t, 'hello', 'hi there', 'hey there')) {
    return 'Hello. Ask me about the experiment, or say help to hear what I can do.'
  }
  if (matches(t, 'thank you', 'thanks')) {
    return "You're welcome."
  }
  return null
}

// Trailing words that suggest the person's sentence got cut off mid-
// thought — either by a microphone that stopped listening during a
// brief pause, or by genuinely stopping partway through. Rather than
// dead-ending on "I don't have an answer," these ask what was meant,
// which is a much more useful response to an incomplete question.
const DANGLING_ENDINGS = [
  'about', 'regarding', 'on', 'for', 'the', 'a', 'is', 'to', 'with', 'like', 'such as',
]

function soundsCutOff(t) {
  const trimmed = t.trim().replace(/[.?!]+$/, '')
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0) return false
  // Very short overall (e.g. "tell me about") or ends on a word that
  // is clearly expecting more to follow.
  const endsWithDangler = DANGLING_ENDINGS.includes(words[words.length - 1])
  const isVeryShort = words.length <= 3
  return endsWithDangler || (isVeryShort && matches(t, 'tell me', 'what about', 'how about'))
}

function answerClarification() {
  return (
    "It sounds like your question got cut off — I only caught part of it. Could you ask again with a bit more detail? " +
    'For example: the current step, alerts, demo mode, camera mode, training the model, or something about the ISS or microgravity.'
  )
}

/**
 * Main entry point: tries each knowledge area in order and returns
 * the first match. Falls back to an honest, specific "I don't know
 * that" that still tells the person what IS answerable, rather than
 * a bare refusal.
 */
export function buildAnswer(transcript, ctx) {
  const t = transcript.toLowerCase()

  const command = matchCommand(t)
  if (command === 'runDemo') return { text: 'Starting the automatic demo sequence now.', action: command }
  if (command === 'haltDemo') return { text: 'Stopping the demo.', action: command }
  if (command === 'reset') return { text: 'Resetting the experiment.', action: command }

  const liveAnswer = answerLiveStatus(t, ctx)
  if (liveAnswer) return { text: liveAnswer, action: null }

  const kbAnswer = answerFromKnowledgeBase(t)
  if (kbAnswer) return { text: kbAnswer, action: null }

  const spaceAnswer = answerFromSpaceKnowledgeBase(t)
  if (spaceAnswer) return { text: spaceAnswer, action: null }

  const greeting = answerGreetingOrHelp(t)
  if (greeting) return { text: greeting, action: null }

  if (soundsCutOff(t)) return { text: answerClarification(), action: null }

  return {
    text:
      "I don't have an answer for that one. I can help with the experiment status, sequence errors, demo mode, camera mode, custom experiments, " +
      'training the AI model, troubleshooting the backend or camera, or general space and astronaut life questions. Say help to hear the full list. ' +
      "I can't answer questions outside those topics honestly, since that needs a real AI service this project doesn't have.",
    action: null,
  }
}
