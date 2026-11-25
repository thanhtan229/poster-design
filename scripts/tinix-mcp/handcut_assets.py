"""Deterministic irregular scrapbook cutline sprites with genuine closed alpha photo windows.
This is also used by Scrapbook Story Studio v1.2.13 as a reusable sprite generator.
"""
from __future__ import annotations
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import math, random
import numpy as np
import cv2

CREAM=(247,229,197)
INK=(96,58,42)
SCRIPT='/usr/share/fonts/opentype/urw-base35/Z003-MediumItalic.otf'
SERIF='/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'


def torn_rect(x0,y0,x1,y1,seed=1,jitter=3,step=13,stamp=False):
    rng=random.Random(seed)
    points=[]
    top=[x0+i*(x1-x0)/max(1,round((x1-x0)/step)) for i in range(round((x1-x0)/step)+1)]
    side=[y0+i*(y1-y0)/max(1,round((y1-y0)/step)) for i in range(round((y1-y0)/step)+1)]
    for k,x in enumerate(top):
        delta=(jitter*0.85 if stamp and k%2 else 0)+rng.uniform(-jitter,jitter)
        points.append((x,y0+delta))
    for k,y in enumerate(side[1:]):
        delta=(-jitter*0.7 if stamp and k%2 else 0)+rng.uniform(-jitter,jitter)
        points.append((x1+delta,y))
    for k,x in enumerate(reversed(top[:-1])):
        delta=(-jitter*0.85 if stamp and k%2 else 0)+rng.uniform(-jitter,jitter)
        points.append((x,y1+delta))
    for k,y in enumerate(reversed(side[1:-1])):
        delta=(jitter*0.8 if stamp and k%2 else 0)+rng.uniform(-jitter,jitter)
        points.append((x0+delta,y))
    return points


def points_mask(size,pts,smooth=3):
    w,h=size; sf=smooth
    mask=Image.new('L',(w*sf,h*sf))
    ImageDraw.Draw(mask).polygon([(int(round(x*sf)),int(round(y*sf))) for x,y in pts],fill=255)
    return mask.resize(size,Image.Resampling.LANCZOS)


def grain_fill(w,h,seed=2,base=(247,232,205),amp=10):
    rng=np.random.default_rng(seed)
    r=rng.normal(0,amp,(h,w,1)).astype(np.int16)
    a=np.array(base,dtype=np.int16).reshape(1,1,3)
    out=np.clip(a+r,0,255).astype(np.uint8)
    return Image.fromarray(out,'RGB').convert('RGBA')


def alpha_from_masks(outer,inner,base,white='paper',seed=3):
    w,h=outer.size
    if white=='paper':
        paper=grain_fill(w,h,seed,base)
    else: paper=Image.new('RGBA',(w,h),tuple(base)+(255,))
    # thin outer white cutline, cream body and transparent hole
    image=Image.new('RGBA',(w,h),(255,253,247,0)); image.putalpha(outer)
    tinted=paper.copy(); tinted.putalpha(inner)
    image.alpha_composite(tinted)
    return image


def make_frame(kind,w,h,seed=11,note='',photo_ratio=None):
    # 3:4 irregular photo frame sprites. Source sprites have no sample images, only a closed alpha=0 window.
    rng=random.Random(seed)
    if kind=='torn':
        outer=torn_rect(8,8,w-8,h-8,seed,4,12)
        paper=torn_rect(13,13,w-13,h-13,seed+1,2.0,14)
        hole=torn_rect(17,17,w-17,h-18,seed+2,2.4,15)
        base=(250,238,218)
    elif kind=='polaroid':
        outer=torn_rect(6,7,w-7,h-8,seed,2.9,11)
        paper=torn_rect(11,11,w-12,h-14,seed+1,1.7,15)
        hole=torn_rect(23,23,w-23,h-70,seed+2,1.1,18)
        base=(252,241,221)
    elif kind=='stamp':
        outer=torn_rect(7,8,w-8,h-9,seed,6,11,stamp=True)
        paper=torn_rect(15,16,w-16,h-18,seed+1,3.2,10,stamp=True)
        hole=torn_rect(32,32,w-32,h-47,seed+2,1.8,12)
        base=(242,221,187)
    elif kind=='notebook':
        outer=torn_rect(6,7,w-8,h-8,seed,3.5,14)
        paper=torn_rect(12,11,w-13,h-14,seed+1,1.7,13)
        hole=torn_rect(25,24,w-25,h-69,seed+2,2.2,16)
        base=(254,236,199)
    elif kind=='ticket':
        outer=torn_rect(9,8,w-10,h-9,seed,4.5,10,stamp=True)
        paper=torn_rect(17,15,w-18,h-18,seed+1,2.0,14)
        hole=torn_rect(28,27,w-28,h-51,seed+2,1.5,16)
        base=(251,229,189)
    else: raise ValueError(kind)
    m_out=points_mask((w,h),outer)
    m_paper=points_mask((w,h),paper)
    m_hole=points_mask((w,h),hole)
    frame=alpha_from_masks(m_out,m_paper,base,seed=seed)
    arr=np.array(frame)
    arr[:,:,3]=np.minimum(arr[:,:,3],255-np.array(m_hole))
    frame=Image.fromarray(arr,'RGBA')
    if kind in ('polaroid','notebook','ticket') and note:
        txt=Image.new('RGBA',(w,h))
        d=ImageDraw.Draw(txt)
        f=ImageFont.truetype(SCRIPT,min(27,max(16,int(w*.085))))
        bbox=d.textbbox((0,0),note,font=f)
        tw=bbox[2]-bbox[0]
        if tw>w-45: f=ImageFont.truetype(SCRIPT,int(f.size*(w-45)/tw))
        d.text((w/2,h-51),note,fill=(109,59,47,255),font=f,anchor='mt',stroke_width=0)
        frame.alpha_composite(txt)
        # trim text touching the window is avoided by Y>h-70
    return frame


def make_paper_label(w,h,text,seed=51,size=46,fill=(253,230,188),textcolor=(120,70,54),two_lines=False):
    outer=torn_rect(8,8,w-9,h-9,seed,6,9)
    inner=torn_rect(16,15,w-16,h-17,seed+1,3,11)
    m_out=points_mask((w,h),outer)
    m_inner=points_mask((w,h),inner)
    image=alpha_from_masks(m_out,m_inner,fill,seed=seed+100)
    d=ImageDraw.Draw(image)
    f=ImageFont.truetype(SCRIPT,size)
    lines=text.split('\n')
    if len(lines)==1:
        d.text((w/2,h/2+4),text,font=f,anchor='mm',fill=textcolor)
    else:
        for i,l in enumerate(lines):
            d.text((w/2,h*.48+(i-(len(lines)-1)/2)*size*.73),l,font=f,anchor='mm',fill=textcolor,stroke_width=0)
    return image


def make_title(w=715,h=235):
    image=make_paper_label(w,h,'',seed=703,fill=(255,231,192))
    d=ImageDraw.Draw(image)
    f1=ImageFont.truetype(SCRIPT,121)
    f2=ImageFont.truetype(SCRIPT,119)
    d.text((w/2,78),'Sweet',font=f1,anchor='mm',fill=(82,51,33,255))
    d.text((w/2,169),'Memories',font=f2,anchor='mm',fill=(143,49,45,255))
    d.arc((w*.25,h*.72,w*.78,h*.99),0,173,fill=(156,76,54,230),width=3)
    # tiny doodle in heart on title
    hx,hy=w*.83,73
    d.line([(hx-18,hy-4),(hx,hy+20),(hx+19,hy-5)],fill=(147,65,67,220),width=5,joint='curve')
    return image


def with_cutline(raw:Image.Image,weight=4):
    r=raw.convert('RGBA')
    ar=np.array(r)
    a=ar[:,:,3]
    # prevent blur shadows from retaining weak detached islands
    a[a<6]=0
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(weight*2+1,weight*2+1))
    dil=cv2.dilate(a,kernel)
    border=Image.new('RGBA',r.size,(255,252,242,0)); border.putalpha(Image.fromarray(dil,'L'))
    ar[:,:,3]=a
    border.alpha_composite(Image.fromarray(ar,'RGBA'))
    return border


def flower_cluster(w=180,h=150,seed=12,petals=7,kind='daisies'):
    rng=random.Random(seed)
    im=Image.new('RGBA',(w,h))
    d=ImageDraw.Draw(im)
    stems=[(int(w*(.26+i*.25)),int(h*(.30+(.1 if i%2 else 0))),int(w*.57),int(h*.91)) for i in range(3)]
    for i,(sx,sy,tx,ty) in enumerate(stems):
        d.line((sx,sy,tx,ty),fill=(96,120,68,255),width=5)
        d.ellipse((sx-21,sy+12,sx+4,sy+34),fill=(118,146,91,255))
    flowerpos=[(.34,.41,.22),(.62,.40,.22),(.46,.69,.19)]
    for j,(fx,fy,rr) in enumerate(flowerpos):
        cx,cy,R=w*fx,h*fy,min(w,h)*rr
        color=(248,244,222,255) if j<2 else (242,167,151,255)
        for k in range(petals):
            ang=math.radians(360*k/petals+rng.uniform(-5,5))
            pcx,pcy=cx+R*.47*math.cos(ang),cy+R*.47*math.sin(ang)
            radx=R*.52
            d.ellipse((pcx-radx*.65,pcy-radx*.65,pcx+radx*.65,pcy+radx*.65),fill=color,outline=(227,192,164,170),width=1)
        r=R*.24
        d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(225,175,60,255),outline=(146,101,55,220),width=2)
    return with_cutline(im,3)


def bow(w=195,h=99,seed=80):
    im=Image.new('RGBA',(w,h)); d=ImageDraw.Draw(im)
    pink=(190,99,78,255); rose=(225,143,121,255)
    pts=[(w*.48,h*.48),(w*.04,h*.18),(w*.12,h*.81),(w*.50,h*.60)]
    d.polygon(pts,fill=pink); d.line(pts+[pts[0]],fill=(121,58,55,255),width=3)
    pts=[(w*.51,h*.48),(w*.96,h*.14),(w*.87,h*.84),(w*.50,h*.59)]
    d.polygon(pts,fill=rose); d.line(pts+[pts[0]],fill=(121,58,55,255),width=3)
    d.polygon([(w*.47,h*.56),(w*.30,h*.97),(w*.58,h*.75)],fill=rose)
    d.polygon([(w*.54,h*.56),(w*.72,h*.95),(w*.47,h*.77)],fill=pink)
    d.ellipse((w*.44,h*.37,w*.57,h*.66),fill=(222,158,132,255),outline=(129,75,67,255),width=3)
    # patterned fabric dashed line drawn on each lobe
    for j in range(3):
        y=h*(.29+j*.13)
        d.line((w*.15,y,w*.35,y),fill=(254,213,195,220),width=3)
        d.line((w*.64,y,w*.84,y),fill=(254,213,195,220),width=3)
    return with_cutline(im,4)


def tape(w=160,h=44,seed=95,green=False):
    points=torn_rect(5,5,w-5,h-5,seed,3,9)
    m=points_mask((w,h),points)
    im=Image.new('RGBA',(w,h),(149,169,119,0) if green else (223,141,127,0))
    Image.Image.putalpha(im,m)
    d=ImageDraw.Draw(im)
    for x in range(14,w-12,20):
        if green:
            d.ellipse((x,h*.38,x+5,h*.38+5),fill=(249,238,216,210))
        else:
            d.line((x+8,5,x-8,h-6),fill=(255,234,217,200),width=7)
    im.putalpha(m)
    return with_cutline(im,2)


def tag(w=215,h=145,seed=101,text='Travel\nCoffee\nTogether'):
    label=make_paper_label(w,h,'',seed=seed,fill=(247,216,160))
    d=ImageDraw.Draw(label)
    f=ImageFont.truetype(SCRIPT,32)
    for i,s in enumerate(text.split('\n')):
        d.text((w*.54,42+27*i),s,fill=(84,62,44,255),font=f,anchor='mm')
    d.ellipse((30,24,45,39),fill=(139,85,48,255),outline=(255,245,214,255),width=3)
    return label


def ink_stamp(w=157,h=123,seed=135):
    im=Image.new('RGBA',(w,h));d=ImageDraw.Draw(im)
    d.ellipse((12,6,w-14,h-9),outline=(133,82,63,255),width=5)
    d.ellipse((20,14,w-22,h-17),outline=(165,101,72,230),width=2)
    f=ImageFont.truetype(SERIF,15)
    d.text((w/2,h*.26),'MEMORIES',font=f,fill=(136,79,54,250),anchor='mm')
    d.text((w/2,h*.66),'EST. 2026',font=f,fill=(136,79,54,250),anchor='mm')
    for t in (20,40): d.line((w-3,t,w+0,t+8),fill=(106,68,49,255),width=4)
    return with_cutline(im,2)


def embellishment(kind='heart',w=70,h=70):
    im=Image.new('RGBA',(w,h));d=ImageDraw.Draw(im)
    if kind=='heart':
        p=[(w*.5,h*.76),(w*.23,h*.42),(w*.24,h*.25),(w*.42,h*.23),(w*.52,h*.37),(w*.66,h*.19),(w*.83,h*.26),(w*.79,h*.47)]
        d.line(p+[p[0]],fill=(156,77,72,255),width=5,joint='curve')
    elif kind=='spark':
        for a in range(0,360,60):
            t=math.radians(a);cx=w/2;cy=h/2
            d.line((cx+math.cos(t)*h*.18,cy+math.sin(t)*h*.18,cx+math.cos(t)*h*.43,cy+math.sin(t)*h*.43),fill=(201,144,66,255),width=5)
    return with_cutline(im,3)
