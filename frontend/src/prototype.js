export const PROTOTYPE_EXPERIMENTS = {
  'simple-motion': {
    name: 'Simple Motion Experiment',
    steps: [
      ['Stand still', 'Stand'], ['Walk forward', 'Walk'], ['Reach forward', 'Reach'],
      ['Return to standing', 'Stand'], ['Sit down', 'Sit'],
    ],
  },
  'object-picking': {
    name: 'Object Picking Experiment',
    steps: [
      ['Stand beside the object', 'Stand'], ['Reach toward the object', 'Reach'],
      ['Pick up the object', 'Pick'], ['Walk to the target area', 'Walk'], ['Place the object down', 'Place'],
    ],
  },
  'yoga-monitoring': {
    name: 'Simple Yoga Monitoring',
    steps: [
      ['Stand in starting position', 'Stand'], ['Stretch both arms', 'Stretch'],
      ['Bend down slowly', 'Bend'], ['Return to standing', 'Stand'], ['Sit for recovery', 'Sit'],
    ],
  },
}

export function makePrototypeExperiment(template = 'object-picking') {
  const def = PROTOTYPE_EXPERIMENTS[template] || PROTOTYPE_EXPERIMENTS['object-picking']
  return {
    experiment_id: `prototype-${Date.now()}`,
    name: def.name,
    mode: 'CAMERA_PROTOTYPE',
    ai_status: 'MEDIAPIPE_BROWSER_ONLINE',
    status: 'IN_PROGRESS',
    current_step_index: 0,
    total_steps: def.steps.length,
    progress: `0/${def.steps.length}`,
    steps: def.steps.map(([step_name, motion], i) => ({ step_index: i, step_name, motion, ai_trackable: true, status: i === 0 ? 'IN_PROGRESS' : 'PENDING' })),
    last_step_status: 'IN_PROGRESS',
    last_feedback: 'Camera prototype ready. Perform the expected motion.',
    prototype: true,
  }
}


export function makeCustomPrototypeExperiment(name, steps = []) {
  const normalized = steps.map((s, i) => ({
    step_name: s.name || s.step_name || `Step ${i + 1}`,
    motion: s.motion || null,
    ai_trackable: Boolean(s.motion),
    status: i === 0 ? 'IN_PROGRESS' : 'PENDING',
    step_index: i,
  }))
  return {
    experiment_id: `prototype-custom-${Date.now()}`,
    name: name || 'Custom Experiment',
    mode: 'CAMERA_PROTOTYPE',
    ai_status: 'MEDIAPIPE_BROWSER_ONLINE',
    status: normalized.length ? 'IN_PROGRESS' : 'NOT_STARTED',
    current_step_index: 0,
    total_steps: normalized.length,
    progress: `0/${normalized.length}`,
    steps: normalized,
    last_step_status: 'IN_PROGRESS',
    last_feedback: 'Camera prototype ready. Perform the expected motion.',
    prototype: true,
    is_custom: true,
  }
}
