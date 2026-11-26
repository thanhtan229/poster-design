"""[TINIX] Procedural lace RGB material with protected alpha, cutline and eyelets."""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from tinixposter_v1 import require

LACE_STYLE = "embroidered_pastel"


def textile_rgb(sprite, *, ivory_mix=0.):  # [TINIX]
    """Procedural laid threads and openwork-like weave, clipped to the existing RGB interior."""
    width, height = sprite.size
    require((width,height)==(280,70),"D04 prototype expects the locked lace sprite")
    scale = 4
    field = Image.new("RGB",(width*scale,height*scale),"#d7c2ac")
    pen = ImageDraw.Draw(field)
    rng = np.random.default_rng(217)

    def cord(points, width, base="#a68a73", face="#f5e7cf"):
        # Thread edge, raised lit core and fine fibre highlights painted in the material.
        coords = [(round(x*scale),round(y*scale)) for x,y in points]
        pen.line(coords,fill=base,width=max(1,round(width*scale)),joint="curve")
        light = [(x,y-1) for x,y in coords]
        pen.line(light,fill=face,width=max(1,round(width*scale*.57)),joint="curve")
        pen.line([(x,y-2) for x,y in coords],fill="#fff4da",width=1,joint="curve")

    # Two crossed laid-thread families. Their uneven spacing distinguishes the ground from embroidery.
    for direction in (-1,1):
        for x in range(-24,310,5):
            drift = rng.uniform(-1.15,1.15)
            points = [(x+direction*(y-35)*.35+drift+.65*np.sin(y*.17+x),y)
                      for y in range(10,62)]
            cord(points, rng.uniform(.75,1.35),"#b49b87","#e8d2b8")

    # Staggered sprigs around the original eyelets. X is precompensated for the wide placement.
    for index,cx in enumerate(range(26,255,18)):
        bias = 1 if index%2 else -1
        center = 30+rng.uniform(-.65,.65)
        theta = np.linspace(0,2*np.pi,48)
        cord([(cx+(4.8+.25*np.cos(5*t))*np.cos(t),center+10*np.sin(t)) for t in theta],2.8)
        for side in (-1,1):
            for lower in (-1,1):
                delta = side*(4.3+.45*rng.random())
                ys = 9.5+lower*bias
                petal = [(cx+side*3.2+delta*np.sin(t)*np.cos(t)+delta*.88*(1-np.cos(t)),
                          center+lower*(7+ys*np.sin(t))) for t in np.linspace(0,np.pi,32)]
                cord(petal,1.9,"#a78b71","#f0dfc3")
        for y in (17.2,44.2):
            pen.ellipse(((cx-1.15)*scale,(y-1.05)*scale,(cx+1.15)*scale,(y+1.05)*scale),
                        fill="#f4e4cc",outline="#9d846e",width=2)

    for row in (15,48):
        cord([(x,row+1.25*np.sin(x*np.pi/16)+.45*np.sin(x*.37)) for x in range(15,264)],
             2.9,"#a88c75","#f8e7cc")
    cord([(x,52+2.9*np.cos((x-25)*np.pi/9)+.4*np.sin(x*.17)) for x in range(17,263)],2.5)

    source = np.array(sprite)
    yarn = np.asarray(field.resize(sprite.size,Image.Resampling.LANCZOS),dtype=float)
    require(0 <= ivory_mix <= 1, "Invalid ivory mix")
    yarn = yarn*(1-ivory_mix) + np.array([249,239,230])*ivory_mix
    y,x = np.indices(source.shape[:2])
    distance = ndimage.distance_transform_edt(source[:,:,3]>=248)
    # Never recolor the four-pixel cutline or weak-alpha pixels. Preserve the existing aperture edge.
    region = np.minimum.reduce([x-12,267-x,y-12,57-y])
    protected = distance<=4.25
    weight = np.clip(region/4,0,1)*np.clip((distance-4.25)/2,0,1)
    yarn += (.9*np.sin(x*2.7)+.6*np.cos(y*2.2))[:,:,None]
    result = source.copy()
    result[:,:,:3] = np.rint(np.clip(source[:,:,:3]*(1-weight[:,:,None])+yarn*weight[:,:,None],0,255)).astype(np.uint8)
    require(np.array_equal(result[protected],source[protected]),"Protected cutline RGB changed")
    return Image.fromarray(result,"RGBA"), int(protected.sum())


def pastel_embroidery(sprite):
    return textile_rgb(sprite, ivory_mix=.30)[0]
