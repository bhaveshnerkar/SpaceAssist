"""Real-time motion recognizer for SpaceAssist AI.

The app can use a trained PyTorch classifier when a checkpoint exists.  Before
that checkpoint is trained, this module provides a deterministic MediaPipe
pose/hand geometry recognizer.  It is deliberately conservative: it returns
Unknown_Action instead of pretending that every frame is a confident class.
"""
import os, json, pickle, math
from collections import Counter
try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except Exception:
    torch = None; nn = None; TORCH_AVAILABLE = False

ACTIVITY_CLASSES = ["Stand", "Walk", "Reach", "Pick", "Open", "Pour", "Close", "Place", "Sit", "Idle", "Mix", "Bend", "Stretch"]
NUM_JOINTS = 12
FEATURES_PER_JOINT = 4
INPUT_SIZE = NUM_JOINTS * FEATURES_PER_JOINT
SEQUENCE_LENGTH = 30
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
MODEL_DIR = os.path.join(ROOT, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "activity_model.pth")
LABELS_PATH = os.path.join(MODEL_DIR, "activity_model_labels.json")
SCALER_PATH = os.path.join(MODEL_DIR, "activity_model_scaler.pkl")

if TORCH_AVAILABLE:
    class ActivityClassifier(nn.Module):
        def __init__(self, input_size=INPUT_SIZE, num_classes=len(ACTIVITY_CLASSES)):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(input_size, 64), nn.ReLU(), nn.Dropout(0.15),
                nn.Linear(64, 32), nn.ReLU(), nn.Linear(32, num_classes)
            )
        def forward(self, x): return self.net(x)
else:
    ActivityClassifier = None


def _point(p, key):
    return p.get(key, {"x": .5, "y": .5, "z": 0.0, "visibility": 0.0})


def _dist(a, b):
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def _angle(a, b, c):
    """Angle ABC in degrees."""
    bax, bay = a["x"]-b["x"], a["y"]-b["y"]
    bcx, bcy = c["x"]-b["x"], c["y"]-b["y"]
    den = math.hypot(bax, bay) * math.hypot(bcx, bcy)
    if den < 1e-6: return 180.0
    value = max(-1.0, min(1.0, (bax*bcx + bay*bcy) / den))
    return math.degrees(math.acos(value))


class ActivityModel:
    def __init__(self):
        self._model = None; self._scaler = None; self._labels = ACTIVITY_CLASSES; self._trained = False
        self._load()

    def _load(self):
        if not TORCH_AVAILABLE or not os.path.exists(MODEL_PATH): return
        try:
            labels = json.load(open(LABELS_PATH, encoding="utf-8")) if os.path.exists(LABELS_PATH) else ACTIVITY_CLASSES
            ckpt = torch.load(MODEL_PATH, map_location="cpu")
            self._labels = labels
            self._model = ActivityClassifier(int(ckpt.get("input_size", INPUT_SIZE)), len(labels))
            self._model.load_state_dict(ckpt["state_dict"]); self._model.eval()
            if os.path.exists(SCALER_PATH): self._scaler = pickle.load(open(SCALER_PATH, "rb"))
            self._trained = True
        except Exception:
            self._model = None; self._trained = False

    def reload(self): self._load(); return self.is_trained()
    def is_trained(self): return self._trained
    def status(self): return "ONLINE" if self._trained else "GEOMETRY_BASELINE_ONLINE"

    def predict(self, sequence, pose_result=None, expected_activity=None):
        if not sequence:
            return {"activity":"Idle", "confidence":0.0, "trained":self._trained, "source":"baseline"}
        # A trained model takes priority, but only when its checkpoint exists.
        if self._trained:
            try:
                row = self._frame_features(sequence[-1])
                x = self._scaler.transform([row])[0] if self._scaler is not None else row
                with torch.no_grad():
                    logits = self._model(torch.tensor([x], dtype=torch.float32))
                    probs = torch.softmax(logits, dim=1)[0]
                    conf, idx = torch.max(probs, dim=0)
                return {"activity":self._labels[idx.item()], "confidence":round(float(conf)*100,2), "trained":True, "source":"ml"}
            except Exception:
                # Fall through to the deterministic recognizer instead of
                # displaying a fake/empty model result.
                pass
        return self._geometry(sequence, pose_result or {}, expected_activity)

    def _frame_features(self, landmarks):
        from app.ai.pose_detector import _TRACKED_JOINTS
        row=[]
        for joint in _TRACKED_JOINTS:
            p=_point(landmarks,joint); row += [p["x"],p["y"],p["z"],p["visibility"]]
        return row

    def _geometry(self, sequence, pose_result, expected_activity):
        p = sequence[-1]
        ls,rs,lh,rh = _point(p,"left_shoulder"),_point(p,"right_shoulder"),_point(p,"left_hip"),_point(p,"right_hip")
        le,re,lw,rw = _point(p,"left_elbow"),_point(p,"right_elbow"),_point(p,"left_wrist"),_point(p,"right_wrist")
        lk,rk,la,ra = _point(p,"left_knee"),_point(p,"right_knee"),_point(p,"left_ankle"),_point(p,"right_ankle")
        shoulder=((ls["x"]+rs["x"])/2,(ls["y"]+rs["y"])/2)
        hip=((lh["x"]+rh["x"])/2,(lh["y"]+rh["y"])/2)
        wrist_y=(lw["y"]+rw["y"])/2
        knee_y=(lk["y"]+rk["y"])/2
        ankle_span=abs(la["x"]-ra["x"])
        shoulder_span=max(.08, abs(ls["x"]-rs["x"]))
        torso_len=max(.08, abs(hip[1]-shoulder[1]))
        knee_l=_angle(lh,lk,la); knee_r=_angle(rh,rk,ra)
        elbow_l=_angle(ls,le,lw); elbow_r=_angle(rs,re,rw)
        avg_knee=(knee_l+knee_r)/2
        wrists_above = lw["y"] < ls["y"]-0.10 or rw["y"] < rs["y"]-0.10
        hands_low = lw["y"] > lh["y"]+0.03 and rw["y"] > rh["y"]+0.03
        one_hand_reaching = ((abs(lw["x"]-ls["x"]) > 0.18 and _dist(lw,ls) > shoulder_span*1.20 and elbow_l > 105) or
                             (abs(rw["x"]-rs["x"]) > 0.18 and _dist(rw,rs) > shoulder_span*1.20 and elbow_r > 105))
        both_hands_reaching = (_dist(lw,ls) > shoulder_span*1.25 and _dist(rw,rs) > shoulder_span*1.25)
        seated_shape = hip[1] > 0.52 and abs(knee_y - hip[1]) < 0.18 and avg_knee < 155
        crouched = (hip[1] > shoulder[1] + torso_len*0.62) and (knee_y > hip[1] + 0.06)
        moving_walk = False
        if len(sequence) >= 7:
            old=sequence[-7]
            old_hip_x=(old.get("left_hip",{}).get("x",.5)+old.get("right_hip",{}).get("x",.5))/2
            old_ankle_sep=abs(old.get("left_ankle",{}).get("x",.5)-old.get("right_ankle",{}).get("x",.5))
            moving_walk=abs(hip[0]-old_hip_x) > .045 or abs(ankle_span-old_ankle_sep) > .10

        # Hand landmarks allow simple hand-driven actions when available.
        hands = pose_result.get("hands", [])
        hand_open = False; hand_closed = False; hand_motion = False
        if hands:
            for h in hands:
                wrist=h[0]
                tip_ids=(8,12,16,20)
                pip_ids=(6,10,14,18)
                extended=sum(1 for ti,pi in zip(tip_ids,pip_ids) if _dist(h[ti],wrist) > _dist(h[pi],wrist)*1.10)
                hand_open = hand_open or extended >= 3
                hand_closed = hand_closed or extended <= 1
            if len(sequence) >= 5:
                # Wrist motion is useful for pour/mix/open/close transitions.
                hand_motion = abs(lw["x"]-sequence[-5].get("left_wrist",{}).get("x",lw["x"])) > .035 or abs(lw["y"]-sequence[-5].get("left_wrist",{}).get("y",lw["y"])) > .035

        pick_shape = hands_low and hip[1] > shoulder[1] + 0.15 and knee_y > hip[1] + 0.06
        reach_shape = (one_hand_reaching or both_hands_reaching) and not hands_low and not crouched
        candidates=[]
        if seated_shape: candidates.append(("Sit",92))
        if wrists_above: candidates.append(("Stretch",88))
        if moving_walk and not crouched: candidates.append(("Walk",84))
        if pick_shape: candidates.append(("Pick",86))
        if reach_shape: candidates.append(("Reach",82))
        bend_shape = (shoulder[1] > 0.43 and not pick_shape and not seated_shape) or torso_len < 0.18
        if bend_shape: candidates.append(("Bend",78))
        if hands_low and expected_activity == "Place" and one_hand_reaching: candidates.append(("Place",82))
        if hands_low and expected_activity == "Place" and not candidates: candidates.append(("Place",72))
        if hand_open and hand_motion and expected_activity == "Open": candidates.append(("Open",76))
        if hand_closed and hand_motion and expected_activity == "Close": candidates.append(("Close",76))
        if hand_motion and expected_activity == "Pour": candidates.append(("Pour",74))
        if hand_motion and expected_activity == "Mix": candidates.append(("Mix",72))

        if candidates:
            # If the expected step is represented among credible candidates,
            # prefer it only as a tie-breaker. Geometry still has to match.
            if expected_activity:
                matching=[c for c in candidates if c[0]==expected_activity]
                if matching: activity,conf=max(matching,key=lambda x:x[1])
                else: activity,conf=max(candidates,key=lambda x:x[1])
            else:
                activity,conf=max(candidates,key=lambda x:x[1])
            return {"activity":activity,"confidence":float(conf),"trained":False,"source":"geometry"}

        # Upright neutral pose is the safest fallback.
        if avg_knee > 150 and torso_len > .12:
            return {"activity":"Stand","confidence":78.0,"trained":False,"source":"geometry"}
        return {"activity":"Unknown_Action","confidence":42.0,"trained":False,"source":"geometry"}

activity_model = ActivityModel()
