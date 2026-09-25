# SpaceAssist AI - Reliable Demo Flow

1. Run `START_HERE.bat`.
2. Open http://localhost:5173.
3. Open Experiment Builder.
4. Select exactly one: Simple Motion, Object Picking, or Yoga.
5. Press `Start Selected Experiment -> Live AI`.
6. On Live AI, press `Start Camera + AI`.
7. Allow webcam permission.
8. Wait for `MediaPipe Pose ONLINE` and the 33-point skeleton.
9. Perform the motion shown as EXPECTED MOTION.
10. Hold the pose briefly. Three stable matching detections complete the step.
11. Wrong motion produces RETRY and does not advance the step.
12. `Start Demo` is a separate scripted demo and never starts automatically.

If MediaPipe cannot load, the UI explicitly reports the reason. It never labels frame movement as the expected motion.
