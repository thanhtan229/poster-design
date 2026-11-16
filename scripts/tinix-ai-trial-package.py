import os,glob,shutil,zipfile
from PIL import Image,ImageDraw,ImageFont
base='.runtime/production-pilot';out='.runtime/ai-variant-trial/so-sanh';os.makedirs(out,exist_ok=True)
ids=[[189,190,191,198,199,200],[192,193,194,201,202,203]]
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',21)
for name,row in zip(['be-yeu','smile-darling'],ids):
 canvas=Image.new('RGB',(3*500,2*540),'white');d=ImageDraw.Draw(canvas)
 for i,id in enumerate(row):
  folder=glob.glob(f'{base}/{id}-*')[-1];target=f'{out}/{name}/{"khong-ai" if i<3 else "ai"}-{i%3+1}';os.makedirs(target,exist_ok=True)
  for jpg in glob.glob(folder+'/*.jpg'):shutil.copy2(jpg,target)
  img=Image.open(folder+'/03_thanh_pham.jpg');img.thumbnail((480,480));x=(i%3)*500+10;y=(i//3)*540+40;canvas.paste(img,(x,y));d.text((x,y-28),f'{"Khong AI" if i<3 else "AI"} {i%3+1}  |  #{id}',fill='black',font=font)
 canvas.save(f'{out}/{name}-so-sanh.jpg',quality=90)
with zipfile.ZipFile('.runtime/ai-variant-trial/bo-jpg-so-sanh.zip','w',zipfile.ZIP_DEFLATED) as z:
 for root,_,files in os.walk(out):
  for f in files:z.write(os.path.join(root,f),os.path.relpath(os.path.join(root,f),out))
 z.write('.runtime/ai-variant-trial/checks.json','kiem-tra-khuon-mat.json')
print('Done')
