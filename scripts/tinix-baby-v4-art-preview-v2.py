from PIL import Image,ImageDraw,ImageFont,ImageOps,ImageFilter
import glob,os,random
random.seed(2); S=2400; out='.runtime/baby-v4-art-v2';os.makedirs(out,exist_ok=True)
font=lambda size,bold=False:ImageFont.truetype('C:/Windows/Fonts/'+('arialbd.ttf' if bold else 'arial.ttf'),size)
script=lambda size:ImageFont.truetype('C:/Windows/Fonts/segoesc.ttf',size)
canvas=Image.new('RGBA',(S,S),'#aed2c4');d=ImageDraw.Draw(canvas)
d.rectangle((0,0,1050,S),fill='#eee0b7')
for y in range(50,2400,150):
 for x in range(25,1040,150):
  d.arc((x,y,x+75,y+60),0,300,fill='#9a896d',width=4);d.line((x+15,y+90,x+95,y+90),fill='#9a896d',width=4);d.ellipse((x+90,y+10,x+110,y+30),outline='#9a896d',width=3)
for i in range(120):
 x=random.randrange(1070,2400);y=random.randrange(20,2400);d.ellipse((x,y,x+35,y+54),fill='#e8c667');d.line((x+8,y,x+17,y-14,x+27,y),fill='#708c6f',width=4)
def photo(prefix,box,angle=0):
 x,y,w,h=box;p=glob.glob('service/static/photos/'+prefix+'*.jpg')[0];im=Image.open(p).convert('RGB');im=ImageOps.fit(im,(w-32,h-32),method=Image.Resampling.LANCZOS,centering=(.5,.38));tile=Image.new('RGBA',(w,h),'#faf5e9');tile.paste(im,(16,16));tile=tile.rotate(angle,expand=True,resample=Image.Resampling.BICUBIC);canvas.alpha_composite(tile,(x,y))
photo('2801f8',(760,190,780,830),3)
photo('2c3291',(1610,410,525,490),-1)
paper=Image.open('service/static/collage/baby-v4-draft/newspaper.png').convert('RGBA').resize((650,790));canvas.alpha_composite(paper,(1450,230));photo('2c3291',(1500,370,550,470),0)
photo('b0aa0e',(310,630,430,430),-4)
photo('199982',(230,1100,760,920),5)
photo('e21324',(1530,1130,570,750),-3)
# subject cropped from the original local BiRefNet mask, showing upper body
im=Image.open('.runtime/baby-v4-baby.png').convert('RGBA');bbox=im.getchannel('A').getbbox();im=im.crop(bbox);im=im.crop((0,0,im.width,int(im.height*.73)));im.thumbnail((920,1170),Image.Resampling.LANCZOS);canvas.alpha_composite(im,(800,800))
d=ImageDraw.Draw(canvas)
# cut-shaped labels and lettering
pink='#dc7896';cream='#fff8e9';dark='#4f3c36'
d.rounded_rectangle((85,230,680,425),35,fill='#efe7d0',outline='#c9b290',width=5)
d.text((125,230),'1 · 10',font=font(170,True),fill=pink,stroke_width=3,stroke_fill='#fff4e8')
d.polygon([(120,435),(720,435),(750,500),(155,550)],fill='#c56c7e');d.text((145,455),'LIFE IS FULL OF HAPPINESS',font=font(41,True),fill=cream)
# Layered paper sticker, hand-cut silhouette with scripted writing.
d.polygon([(550,960),(620,925),(935,935),(1010,995),(995,1075),(1020,1130),(960,1195),(600,1170),(535,1120),(550,1055)],fill='#fff9ee',outline='#dcaeb3',width=7)
d.text((590,965),'I think',font=script(69),fill='#c96981')
d.text((590,1035),'of you',font=script(69),fill='#c96981')
d.text((585,1100),'and smile',font=script(62),fill='#c96981')
# A small paper tag and ampersand connect the photo clusters.
d.polygon([(2150,840),(2250,860),(2260,1020),(2180,1070),(2140,1030)],fill='#acd0ca',outline='#f8efdf',width=9)
d.text((2150,860),'&',font=font(110,True),fill='#c56d7a')
d.polygon([(1450,190),(1550,190),(1550,470),(1500,440),(1450,470)],fill='#f7efe1')
d.multiline_text((1470,205),'B\nE\nS\nT',font=font(44,True),fill=dark,spacing=-5)
# small tags
d.polygon([(1250,1710),(1580,1720),(1575,1800),(1240,1790)],fill=cream);d.text((1270,1710),'JUST SMILE',font=font(55,True),fill=dark)
d.polygon([(115,2190),(735,2190),(685,2260),(120,2260)],fill='#bd6a72');d.text((180,2195),'HAPPY DAYS',font=font(55,True),fill='#f7ddae')
# individual colored letters, no card backgrounds
for i,(letter,color) in enumerate(zip('LUNA',['#d26488','#e8ae4b','#da7894','#d66289'])):
 x=810+i*225;y=1900+([0,14,-4,10][i]);d.text((x,y),letter,font=font(290,True),fill=color,stroke_width=11,stroke_fill='#f8eadb')
# camera and flower recycled from template
for file,xy,size in [('camera.png',(1710,1870),(430,285)),('flower.png',(2000,170),(200,200)),('heart.png',(445,1880),(250,250))]:
 sticker=Image.open('service/static/collage/baby-luna-v1/'+file).convert('RGBA').resize(size);canvas.alpha_composite(sticker,xy)
canvas.convert('RGB').save(out+'/be-yeu-v4-my-thuat-v2.jpg',quality=94,dpi=(300,300));print(out+'/be-yeu-v4-my-thuat-v2.jpg')
