"""[TINIX] Make an offline RGB-only D04 lace prototype on the locked Demo A."""
import argparse
from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
from shutil import copy2, copytree
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

from refine_demo_a import diff, digest, read_json, require, verify_zip_preview
from refine_demo_a2 import small_jpeg
from source_qa import inspect as inspect_source
from tinixposter_v1 import DELIVERY, export, validate


def textile_rgb(sprite):
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


def board(images, region=None, zoom=1):
    panes=[image.crop(region) if region else image for image in images]
    if zoom != 1:
        panes=[pane.resize((pane.width*zoom,pane.height*zoom),Image.Resampling.NEAREST) for pane in panes]
    w,h=panes[0].size
    result=Image.new("RGB",(4*w+42,h+35),"#efe9e4")
    draw=ImageDraw.Draw(result)
    font=ImageFont.load_default(size=19)
    for index,pane in enumerate(panes):
        x=index*(w+14)
        draw.text((x+8,7),f"A{index}",font=font,fill="#302629")
        result.paste(pane.convert("RGB"),(x,35))
    return result


def run(workflow, a1, a2, output):
    roots=[workflow,a1,a2]
    require(all(not output.is_relative_to(root) for root in roots),"A3 output must be separate")
    originals={p:digest(p) for root in roots for p in root.rglob("*") if p.is_file()}
    old=workflow/"compositions"
    a0=old/"A"
    baseline=a2/"A2"
    prior=read_json(a2/"review"/"report.json")
    versions=[a0,a1/"A1",baseline,output/"A3"]
    zips=[version/"material.zip" for version in versions]
    locked=read_json(workflow/"locks.json")
    require(all(digest(old/live["demoId"]/"material.zip")==live["materialSha256"] for live in locked),
            "A0 workflow ZIP lock mismatch")
    require(all(digest(path)==prior["zipSha256"][f"A{i}"] for i,path in enumerate(zips[:3])),
            "A0/A1/A2 archive hash mismatch")
    audit=read_json(baseline/"source-qa"/"source-qa.json")
    require(audit["status"]=="pass" and audit["kitSha256"]==digest(zips[2]),"A2 source proof is missing")
    output.mkdir(parents=True)
    source=output/"A3.source.json"
    copy2(a2/"A2.source.json",source)
    spec=read_json(source)
    require(audit["manifestSha256"]==digest(source) and source.read_bytes()==(old/"A.source.json").read_bytes(),
            "Geometry manifest changed")
    copytree(a2/"assets",output/"assets")
    decor=next(item for item in spec["decorations"] if item["code"]=="D04")
    target=decor["asset"]
    actual=Image.open(a2/target).convert("RGBA")
    lace,protected=textile_rgb(actual)
    lace.save(output/target)
    sprites_changed=[p.relative_to(output).as_posix() for p in (output/"assets").glob("*.png")
                     if digest(p)!=digest(a2/p.relative_to(output))]
    require(sprites_changed==[target],"A2 to A3 changed more than the D04 sprite")
    trust={row["sha256"] for row in audit["layers"] if row["status"]=="pass" and row["proceduralGenerationVerified"]}
    trust.add(digest(output/target))
    end=versions[3]
    with redirect_stdout(StringIO()):
        export(source,end/"material",end/"qa",placeholders=True,review_dir=end)
    qa=validate(end/"material")
    result=inspect_source(source,zips[3],end/"source-qa",trust,trust)
    geometry=result["mixedHandcutGeometry"]
    require(result["status"]=="pass" and geometry["status"]=="pass","A3 QA failed")
    require(geometry["notebooks"]==["F06"] and geometry["polaroids"]==["F02"]
            and geometry["allSixWindows"] and any(pair["distinct"] for pair in geometry["silhouettePairs"])
            and bool(geometry["stampsOrTickets"]),"Required Mixed Handcut roles missing")
    require(qa["pieces"]==17 and all(count==17 for count in qa["components_by_alpha"].values())
            and qa["min_bounding_box_gap_px"]>=12,"Packed atlas changed topology")
    require(len(result["sentinels"])==7 and all(row["outsideMaskPx"]==0 and row["changedPx"]>0
              for row in result["sentinels"].values()),"Sentinel failed")
    require(read_json(end/"qa"/"tinixposter_qa.json")["render_pixel_identical_from_json"],"JSON reconstruction failed")
    verify_zip_preview(end,output,spec)
    sheets=[Image.open(folder/"material"/DELIVERY[3]).convert("RGBA") for folder in versions]
    for folder in versions:
        require((folder/"material"/"layout.json").read_bytes()==(baseline/"material"/"layout.json").read_bytes(),
                "Layout is not byte-identical")
    packed=diff(sheets[2],sheets[3])
    require(packed["alphaChangedPixels"]==0 and packed["rgbChangedPixelsOutsideAlpha"]==0,
            "Atlas alpha or exterior pixels changed")
    for i in (0,1):
        require(diff(sheets[i],sheets[3])["alphaChangedPixels"]==0,"Prior atlas alpha differs")
    with ZipFile(zips[3]) as archive:
        require(sorted(archive.namelist())==sorted(DELIVERY) and archive.testzip() is None,"Invalid A3 ZIP")
    evidence=output/"review"
    evidence.mkdir()
    sizes={}
    for name in ("demo","blank","checker"):
        pages=[Image.open(folder/(name+".png")).convert("RGB") for folder in versions]
        filename=f"compare-{name}.jpg"
        sizes[filename]=small_jpeg(board(pages),evidence/filename)
        if name=="demo":
            demos=pages
            for i,page in enumerate(demos):
                filename=f"A{i}.jpg"
                sizes[filename]=small_jpeg(page,evidence/filename)
    region=(315,933,468,1070)
    for scale in (1,2):
        board(demos,region,scale).save(evidence/f"lace-{scale*100}pct.png")
    for label,color in (("light","#faf7f0"),("dark","#2a3039")):
        plates=[]
        for sheet in sheets:
            plate=Image.new("RGBA",sheet.size,color)
            plate.alpha_composite(sheet)
            plates.append(plate)
        board(plates).save(evidence/f"rgba-{label}.png")
    hashes={f"A{i}":digest(path) for i,path in enumerate(zips)}
    require(len(set(hashes.values()))==4,"Expected a distinct A3 ZIP")
    require({p:digest(p) for root in roots for p in root.rglob("*") if p.is_file()}==originals,"A previous artifact changed")
    report={"variant":"A3","proceduralD04":True,"onlyChangedSourceAsset":target,"packedAtlasA2ToA3":packed,
            "D04A2ToA3":diff(actual,lace),"D04ProtectedPixels":protected,"globalPreviewA2ToA3":diff(demos[2],demos[3]),
            "laceCropA2ToA3":diff(demos[2].crop(region),demos[3].crop(region)),"layoutByteIdentical":True,
            "jsonRoundTrip":True,"sourceQa":result["status"],"geometry":geometry,
            "sheetQa":qa,"sentinels":result["sentinels"],"zipSha256":hashes,
            "originalFilesVerified":len(originals),"jpegBytes":sizes}
    (evidence/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    sums="".join(f"{digest(path)}  {path.name}\n" for path in sorted(evidence.iterdir()))
    (evidence/"SHA256SUMS.txt").write_text(sums,encoding="utf-8")


if __name__=="__main__":
    cli=argparse.ArgumentParser(description=__doc__)
    for arg in ("workflow","a1","a2","output"):
        cli.add_argument(arg,type=Path)
    run(*(value.resolve() for value in vars(cli.parse_args()).values()))
