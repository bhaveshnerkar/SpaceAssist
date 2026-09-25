"""Extract 48 pose features from collected images using MediaPipe Tasks API."""
import os,csv,cv2,urllib.request,mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); DATASET_DIR=os.path.join(ROOT,'dataset'); OUTPUT_CSV=os.path.join(DATASET_DIR,'features.csv')
ACTIVITIES=["Stand","Walk","Reach","Pick","Open","Pour","Close","Place","Sit","Idle","Mix","Bend","Stretch"]
JOINTS=["left_shoulder","right_shoulder","left_elbow","right_elbow","left_wrist","right_wrist","left_hip","right_hip","left_knee","right_knee","left_ankle","right_ankle"]
IDX={"left_shoulder":11,"right_shoulder":12,"left_elbow":13,"right_elbow":14,"left_wrist":15,"right_wrist":16,"left_hip":23,"right_hip":24,"left_knee":25,"right_knee":26,"left_ankle":27,"right_ankle":28}
MODEL_DIR=os.path.join(ROOT,'models'); MODEL=os.path.join(MODEL_DIR,'pose_landmarker_full.task'); URL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'

def main():
 os.makedirs(MODEL_DIR,exist_ok=True)
 if not os.path.exists(MODEL): urllib.request.urlretrieve(URL,MODEL)
 opts=vision.PoseLandmarkerOptions(base_options=python.BaseOptions(model_asset_path=MODEL),running_mode=vision.RunningMode.IMAGE,num_poses=1,min_pose_detection_confidence=.5,min_pose_presence_confidence=.5)
 detector=vision.PoseLandmarker.create_from_options(opts); rows=[]; header=['label']+[f'{j}_{a}' for j in JOINTS for a in ('x','y','z','v')]
 for activity in ACTIVITIES:
  folder=os.path.join(DATASET_DIR,activity); used=skipped=0
  if not os.path.isdir(folder): continue
  for fn in os.listdir(folder):
   if not fn.lower().endswith(('.jpg','.jpeg','.png')): continue
   image=cv2.imread(os.path.join(folder,fn))
   if image is None: skipped+=1; continue
   rgb=cv2.cvtColor(image,cv2.COLOR_BGR2RGB); result=detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb))
   if not result.pose_landmarks: skipped+=1; continue
   p=result.pose_landmarks[0]; row=[activity]
   for j in JOINTS:
    lm=p[IDX[j]]; row += [lm.x,lm.y,getattr(lm,'z',0.0),getattr(lm,'visibility',1.0)]
   rows.append(row); used+=1
  print(f'{activity:<10} used={used:4} skipped={skipped:4}')
 detector.close()
 if not rows: print('No usable pose samples found.'); return
 with open(OUTPUT_CSV,'w',newline='') as f: csv.writer(f).writerows([header,*rows])
 print(f'Saved {len(rows)} rows to {OUTPUT_CSV}')
if __name__=='__main__': main()
