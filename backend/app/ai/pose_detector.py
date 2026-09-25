"""MediaPipe Tasks API pose + hand landmark detector.

Uses the current MediaPipe Tasks API so it works with Python 3.13. The first
run downloads the official on-device pose/hand task models into backend/models.
Frames stay local; the Tasks runtime performs inference on the device.
"""
import os, urllib.request
try:
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    MEDIAPIPE_AVAILABLE = True
except Exception:
    cv2 = None; mp = None; python = None; vision = None; MEDIAPIPE_AVAILABLE = False

_TRACKED_JOINTS = ["left_shoulder","right_shoulder","left_elbow","right_elbow","left_wrist","right_wrist","left_hip","right_hip","left_knee","right_knee","left_ankle","right_ankle"]
POSE_INDEX = {"left_shoulder":11,"right_shoulder":12,"left_elbow":13,"right_elbow":14,"left_wrist":15,"right_wrist":16,"left_hip":23,"right_hip":24,"left_knee":25,"right_knee":26,"left_ankle":27,"right_ankle":28}
POSE_CONNECTIONS = [(11,12),(11,13),(13,15),(12,14),(14,16),(11,23),(12,24),(23,24),(23,25),(25,27),(24,26),(26,28)]
HAND_CONNECTIONS = [(0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),(0,9),(9,10),(10,11),(11,12),(0,13),(13,14),(14,15),(15,16),(0,17),(17,18),(18,19),(19,20),(5,9),(9,13),(13,17)]
MODEL_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "models"))
POSE_MODEL = os.path.join(MODEL_DIR, "pose_landmarker_full.task")
HAND_MODEL = os.path.join(MODEL_DIR, "hand_landmarker.task")
POSE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
HAND_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"

class PoseDetector:
    def __init__(self):
        self._pose = None; self._hands = None
        self.pose_error = None; self.hand_error = None
        if MEDIAPIPE_AVAILABLE:
            self._create_best_effort()
    def _ensure_model(self, path, url):
        os.makedirs(MODEL_DIR, exist_ok=True)
        if not os.path.exists(path):
            urllib.request.urlretrieve(url, path)

    def _create_best_effort(self):
        # Pose is the critical capability. Hand tracking is optional; a failed
        # hand model must never disable the 33-point body skeleton.
        try:
            self._ensure_model(POSE_MODEL, POSE_URL)
            pose_opts = vision.PoseLandmarkerOptions(
                base_options=python.BaseOptions(model_asset_path=POSE_MODEL),
                running_mode=vision.RunningMode.IMAGE, num_poses=1,
                min_pose_detection_confidence=0.5, min_pose_presence_confidence=0.5,
                min_tracking_confidence=0.5
            )
            self._pose = vision.PoseLandmarker.create_from_options(pose_opts)
        except Exception as exc:
            self.pose_error = str(exc)
            self._pose = None
        try:
            self._ensure_model(HAND_MODEL, HAND_URL)
            hand_opts = vision.HandLandmarkerOptions(
                base_options=python.BaseOptions(model_asset_path=HAND_MODEL),
                running_mode=vision.RunningMode.IMAGE, num_hands=2,
                min_hand_detection_confidence=0.5, min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5
            )
            self._hands = vision.HandLandmarker.create_from_options(hand_opts)
        except Exception as exc:
            self.hand_error = str(exc)
            self._hands = None

    def is_available(self): return self._pose is not None
    def process(self, frame_bgr):
        if not self.is_available():
            return frame_bgr,{"available":False,"person_detected":False,"hands_detected":0,"landmarks":{},"error":self.pose_error}
        rgb=cv2.cvtColor(frame_bgr,cv2.COLOR_BGR2RGB)
        image=mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb)
        pose_result=self._pose.detect(image)
        hand_result=self._hands.detect(image) if self._hands is not None else None
        landmarks={}; person=bool(pose_result.pose_landmarks)
        h,w=frame_bgr.shape[:2]
        if person:
            p=pose_result.pose_landmarks[0]
            # Draw the complete 33-point BlazePose skeleton, with the point
            # numbers visible so the user gets the same landmark effect as
            # the reference image.
            for a,b in POSE_CONNECTIONS: self._line(frame_bgr,p[a],p[b],(0,210,255))
            for idx,lm in enumerate(p):
                self._dot(frame_bgr,lm,(0,255,170),4)
                cv2.putText(frame_bgr, str(idx), (int(lm.x*w)+4,int(lm.y*h)-4),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.34, (255,255,255), 1, cv2.LINE_AA)
            for name,idx in POSE_INDEX.items():
                lm=p[idx]; landmarks[name]={"x":float(lm.x),"y":float(lm.y),"z":float(getattr(lm,'z',0.0)),"visibility":float(getattr(lm,'visibility',1.0))}
        hands=0; hand_points=[]
        for hand in ((hand_result.hand_landmarks if hand_result is not None else []) or []):
            hands += 1
            hand_dict=[]
            for a,b in HAND_CONNECTIONS: self._line(frame_bgr,hand[a],hand[b],(255,170,50))
            for idx,lm in enumerate(hand):
                self._dot(frame_bgr,lm,(255,220,80),2)
                hand_dict.append({"x":float(lm.x),"y":float(lm.y),"z":float(getattr(lm,'z',0.0)),"visibility":1.0})
            hand_points.append(hand_dict)
        return frame_bgr,{"available":True,"person_detected":person,"hands_detected":hands,"landmarks":landmarks,"hands":hand_points}
    def _dot(self,frame,lm,color,r): cv2.circle(frame,(int(lm.x*frame.shape[1]),int(lm.y*frame.shape[0])),r,color,-1)
    def _line(self,frame,a,b,color): cv2.line(frame,(int(a.x*frame.shape[1]),int(a.y*frame.shape[0])),(int(b.x*frame.shape[1]),int(b.y*frame.shape[0])),color,2)
    def close(self):
        for obj in (self._pose,self._hands):
            try:
                if obj: obj.close()
            except Exception: pass

pose_detector=PoseDetector()
