"""
collect_data.py — Step 1 of the training pipeline.

Opens your webcam and lets you record training images for each of the
6 experiment activities. Press a number key to select which activity
you're about to perform, press 'r' to start/stop saving frames for
that activity, and 'q' to quit.

USAGE (from the training/ folder, with your venv activated):
    python collect_data.py

CONTROLS:
    1  = Pick_Container
    2  = Open_Container
    3  = Add_Sample
    4  = Close_Container
    5  = Place_Analyzer
    6  = Record_Result
    r  = start / stop recording frames for the currently selected activity
    q  = quit

Frames are saved as JPEGs into ../dataset/<Activity>/, one file per
saved frame, named with a timestamp so nothing gets overwritten.
"""

import os
import time
import cv2

ACTIVITIES = {
    ord('1'): "Stand", ord('2'): "Walk", ord('3'): "Reach",
    ord('4'): "Pick", ord('5'): "Open", ord('6'): "Pour",
    ord('7'): "Close", ord('8'): "Place", ord('9'): "Sit",
    ord('0'): "Idle", ord('a'): "Mix", ord('b'): "Bend", ord('c'): "Stretch",
}

DATASET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset")

# Save every Nth frame while recording, so you don't end up with
# hundreds of nearly-identical images from a few seconds of video.
SAVE_EVERY_N_FRAMES = 3


def count_samples(activity: str) -> int:
    folder = os.path.join(DATASET_DIR, activity)
    if not os.path.isdir(folder):
        return 0
    return len([f for f in os.listdir(folder) if f.lower().endswith(".jpg")])


def main():
    for activity in ACTIVITIES.values():
        os.makedirs(os.path.join(DATASET_DIR, activity), exist_ok=True)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Could not open the webcam.")
        print("Check that a camera is connected, not in use by another app,")
        print("and that camera permission is granted to this program.")
        return

    current_activity = "Stand"
    recording = False
    frame_counter = 0

    print("=" * 60)
    print(" SpaceAssist AI - Training Data Collector")
    print("=" * 60)
    print("Press 1-9/0/a/b/c to select a motion, 'r' to record, 'q' to quit.")
    print()

    while True:
        ok, frame = cap.read()
        if not ok:
            print("WARNING: Failed to read a frame from the webcam. Stopping.")
            break

        display = frame.copy()
        sample_count = count_samples(current_activity)

        cv2.putText(display, f"Activity: {current_activity}", (12, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        cv2.putText(display, f"Samples collected: {sample_count}", (12, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        status_text = "RECORDING" if recording else "PAUSED"
        status_color = (0, 0, 255) if recording else (200, 200, 200)
        cv2.putText(display, status_text, (12, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)
        cv2.putText(display, "1-9/0/a/b/c: motion | r: record | q: quit", (12, display.shape[0] - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

        cv2.imshow("SpaceAssist AI - Data Collector", display)

        if recording:
            frame_counter += 1
            if frame_counter % SAVE_EVERY_N_FRAMES == 0:
                folder = os.path.join(DATASET_DIR, current_activity)
                filename = f"{current_activity}_{int(time.time() * 1000)}.jpg"
                cv2.imwrite(os.path.join(folder, filename), frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('r'):
            recording = not recording
            frame_counter = 0
            print(f"Recording {'started' if recording else 'stopped'} for {current_activity}")
        elif key in ACTIVITIES:
            current_activity = ACTIVITIES[key]
            recording = False
            print(f"Selected activity: {current_activity}")

    cap.release()
    cv2.destroyAllWindows()

    print()
    print("=" * 60)
    print(" Final sample counts:")
    for activity in ACTIVITIES.values():
        print(f"   {activity}: {count_samples(activity)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
