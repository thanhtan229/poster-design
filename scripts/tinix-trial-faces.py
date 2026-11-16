import cv2,glob,json,os
model='.runtime/ai-variant-trial/yunet.onnx'; detector=cv2.FaceDetectorYN.create(model,'',(320,320),0.65,0.3,5000);out={}
for p in glob.glob('service/static/photos/*.jpg'):
 im=cv2.imread(p)
 if im is None:continue
 h,w=im.shape[:2]; s=min(1,1200/max(w,h)); small=cv2.resize(im,None,fx=s,fy=s);detector.setInputSize((small.shape[1],small.shape[0])); _,faces=detector.detect(small); out['/static/photos/'+os.path.basename(p)]={'width':w,'height':h,'faces':[[float(x/s/w),float(y/s/h),float(a/s/w),float(b/s/h),float(row[-1])] for row in (faces if faces is not None else []) for x,y,a,b in [row[:4]]]}
os.makedirs('.runtime/ai-variant-trial',exist_ok=True);open('.runtime/ai-variant-trial/faces.json','w',encoding='utf8').write(json.dumps(out,ensure_ascii=False,indent=2));print('Ảnh:',len(out),'Mặt phát hiện:',sum(len(v['faces']) for v in out.values()))
