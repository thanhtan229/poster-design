"""[TINIX] Build an offline RGB-only Demo A comparison from a locked P4 batch."""

import argparse
from contextlib import redirect_stdout
from io import BytesIO, StringIO
import json
from pathlib import Path
from shutil import copy2
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

from generate_compositions import PALETTES, background, digest
from handcut_assets import grain_fill, points_mask, torn_rect
from source_qa import inspect as inspect_source
from tinixposter_v1 import DELIVERY, export, prep_subject, render_scene, require, validate


def read_json(file):
    return json.loads(file.read_text(encoding="utf-8"))


def rgb_shaded(image, shade, tint):
    colors = np.asarray(image, dtype=np.int16)
    output = colors.copy()
    corrected = np.rint(colors[:,:,:3] + shade[:,:,None]*tint)
    present = colors[:,:,3] != 0
    output[present,:3] = np.clip(corrected[present],0,255)
    return Image.fromarray(output.astype(np.uint8),"RGBA")


def paper_relief(image, seed, lace=False):
    alpha = np.asarray(image.getchannel("A"))
    solid = alpha >= 128
    distance = ndimage.distance_transform_edt(solid)
    softness = ndimage.gaussian_filter(solid.astype(float), 1.8 if lace else 2.5)
    vertical, horizontal = np.gradient(softness)
    rng = np.random.default_rng(seed)
    grain = ndimage.gaussian_filter(rng.normal(size=alpha.shape), (.55,2.8)) * 4
    edge = np.exp(-distance/(4.0 if lace else 6.0))
    shade = (28 if lace else 20)*(vertical+.45*horizontal) + grain*(.35+1.35*edge)
    if lace:
        y,x = np.indices(alpha.shape)
        threads = np.sin(x*.92+y*1.35) + np.sin(x*.67-y*1.18)
        shade += 2.3*threads + 2.1*np.cos(y*.52) - 2.8
    tinted = rgb_shaded(image, shade, np.array([1.,.88,.7]))
    # Tone down only the existing, almost neutral, bright paper pixels.
    pixels = np.array(tinted)
    original = np.asarray(image)
    white = (original[:,:,:3].min(axis=2) >= 242) & (np.ptp(original[:,:,:3], axis=2) <= 14) & (alpha > 0)
    pixels[white,:3] = np.maximum(pixels[white,:3].astype(int) - (1,2,3),0)
    return Image.fromarray(pixels,"RGBA")


def refined_background(original, palette):
    width,height = original.size
    require(np.array_equal(original,background(width,height,palette,0)),
            "Locked background does not match the fixed Demo A paper geometry")
    canvas = grain_fill(width,height,19,palette[0],3.5)
    patches = ((-.06,.12,.58,.43),(.63,-.03,1.07,.53),(.47,.71,1.08,1.04),(-.08,.72,.38,1.06))
    for index,coords in enumerate(patches):
        bounds = (v*(width if i%2==0 else height) for i,v in enumerate(coords))
        mask = points_mask((width,height),torn_rect(*bounds,index,7,29),2)
        # Both shadows belong only to the four already-flattened sheets.
        for blur, density, shift in ((5.2,.11,(2,6)),(1.7,.11,(1,2))):
            shadow = Image.new("RGBA",canvas.size,(100,72,70))
            shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: round(v*density)))
            canvas.alpha_composite(shadow,shift)
        paper = grain_fill(width,height,index+45,palette[(index+1)%4],4)
        paper.putalpha(mask)
        canvas.alpha_composite(paper_relief(paper,310+index))
    return canvas.convert("RGB")


def pair(left, right, file, region=None):
    if region:
        left,right = left.crop(region),right.crop(region)
    width,height = left.size
    combined = Image.new("RGB",(width*2+12,height+22),"#ece9e5")
    draw = ImageDraw.Draw(combined)
    for column,(title,image) in enumerate((("A0",left),("A1",right))):
        x = column*(width+12)
        draw.text((x+4,4),title,fill="#302629")
        combined.paste(image.convert("RGB"),(x,22))
    combined.save(file)


def diff(before, after):
    left,right = np.asarray(before),np.asarray(after)
    require(left.shape==right.shape,"Image dimensions changed")
    rgb = np.abs(left[:,:,:3].astype(int)-right[:,:,:3])
    active = left[:,:,3]>0 if left.shape[2]==4 else np.ones(left.shape[:2],dtype=bool)
    return {"alphaChangedPixels":int(np.count_nonzero(left[:,:,3]!=right[:,:,3])) if left.shape[2]==4 else None,
            "rgbChangedPixels":int(np.count_nonzero(np.any(rgb!=0,axis=2))),
            "rgbChangedPixelsOutsideAlpha":int(np.count_nonzero(np.any(rgb!=0,axis=2) & ~active)),
            "meanRgbAbsoluteDeltaOnVisiblePixels":round(float(rgb[active].mean()),4),
            "maxRgbDelta":int(rgb.max())}


def verify_zip_preview(folder, inputs, spec):
    with ZipFile(folder/"material.zip") as archive:
        require(all(archive.read(name)==(folder/"material"/name).read_bytes() for name in DELIVERY),
                "Exported files differ from the ZIP")
        layout = json.loads(archive.read(DELIVERY[4]))
        bg = Image.open(BytesIO(archive.read(DELIVERY[1]))).convert("RGB")
        sheet = Image.open(BytesIO(archive.read(DELIVERY[3]))).convert("RGBA")
        neutral = dict.fromkeys(frame["code"] for frame in layout["frames"])
        proof = render_scene(layout,sheet,bg,neutral,None).convert("RGB")
        reference = Image.open(BytesIO(archive.read(DELIVERY[0]))).convert("RGB")
        require(np.array_equal(proof,reference),"Neutral preview did not rebuild from archived JSON")
        subject = Image.open(inputs/spec["subject"]["asset"]).convert("RGBA")
        prepared = prep_subject(subject,layout["subject"]["target"],layout["subject"]["borderMm"],layout["print"]["dpi"])
        demo = render_scene(layout,sheet,bg,{frame["code"]:inputs/frame["photo"] for frame in spec["frames"]},prepared)
        require(np.array_equal(demo.convert("RGB"),Image.open(folder/"demo.png").convert("RGB")),
                "Illustrated preview did not rebuild from archived JSON and locked photos")


def main(workflow, output):
    old = workflow/"compositions"
    state = read_json(workflow/"workflow.json")
    snapshots = {path:digest(path) for path in workflow.rglob("*") if path.is_file()}
    spec = read_json(old/"A.source.json")
    lock = next(row for row in read_json(workflow/"locks.json") if row["demoId"]=="A")
    a0 = old/"A"
    require(lock["manifestSha256"]==digest(old/"A.source.json") and lock["materialSha256"]==digest(a0/"material.zip")
            and lock["demoSha256"]==digest(a0/"demo.png"),"A0 differs from the locked artifacts")
    require(spec["mixedHandcutGeometryVersion"]==1 and len(spec["frames"])==6,"Expected Mixed Handcut Demo A")
    require(not output.is_relative_to(workflow),"A1 output must be outside the locked workflow")
    output.mkdir(parents=True)
    source = output/"A1.source.json"
    copy2(old/"A.source.json",source)
    layers = spec["frames"]+spec["decorations"]
    photos = {layer["photo"] for layer in spec["frames"]}|{spec["subject"]["asset"]}
    files = {el["asset"] for el in layers}|photos|{spec["background"]}
    for name in sorted(files):
        path = (old/name).resolve()
        require(path.is_relative_to(old),"Unexpected source path")
        (output/name).parent.mkdir(parents=True,exist_ok=True)
        copy2(path,output/name)
    audit_trust = set(lock["proceduralStaticSha256"])
    atlas_diffs = {}
    for i, part in enumerate(layers):
        code, name = part["code"],part["asset"]
        require(name not in photos,"Photo used as a static source")
        if not (code.startswith("F") or code in ("D01","D02","D03","D04")):
            continue
        sprite = Image.open(old/name).convert("RGBA")
        refined = paper_relief(sprite,110+i,lace=code=="D04")
        atlas_diffs[code] = diff(sprite,refined)
        require(atlas_diffs[code]["alphaChangedPixels"]==0 and atlas_diffs[code]["rgbChangedPixelsOutsideAlpha"]==0,
                f"{code}: RGB refinement escaped the source alpha")
        refined.save(output/name)
        audit_trust.add(digest(output/name))
    name = spec["background"]
    base = Image.open(old/name).convert("RGB")
    new_base = refined_background(base,PALETTES[read_json(workflow/"generation.json")["theme"]])
    new_base.save(output/name)
    audit_trust.add(digest(output/name))
    assert all(digest(output/name)==digest(old/name) for name in photos)
    a1 = output/"A1"
    with redirect_stdout(StringIO()):
        export(source,a1/"material",a1/"qa",placeholders=True,review_dir=a1)
    material = a1/"material.zip"
    qa = validate(a1/"material")
    export_qa = read_json(a1/"qa"/"tinixposter_qa.json")
    layout0 = (a0/"material"/DELIVERY[4]).read_bytes()
    require(layout0==(a1/"material"/DELIVERY[4]).read_bytes(),"layout.json differs")
    sheet0,sheet1 = (Image.open(d/"material"/DELIVERY[3]).convert("RGBA") for d in (a0,a1))
    alpha_diff = diff(sheet0,sheet1)
    require(alpha_diff["alphaChangedPixels"]==0 and alpha_diff["rgbChangedPixelsOutsideAlpha"]==0,"Atlas masks changed")
    require(qa["pieces"]==17 and len(qa["enclosed_windows_alpha_zero"])==6 and qa["min_bounding_box_gap_px"]>=12,
            "Sheet topology failed")
    require(export_qa["render_pixel_identical_from_json"],"JSON round trip failed")
    with ZipFile(material) as archive:
        require(sorted(archive.namelist())==sorted(DELIVERY) and archive.testzip() is None,"Invalid ZIP")
    verify_zip_preview(a0,old,spec)
    verify_zip_preview(a1,output,spec)
    audit = inspect_source(source,material,a1/"source-qa",audit_trust,audit_trust)
    require(audit["status"]=="pass" and audit["mixedHandcutGeometry"]["status"]=="pass","Source or geometry QA failed")
    require(len(audit["sentinels"])==7 and all(row["outsideMaskPx"]==0 for row in audit["sentinels"].values()),
            "Sentinel exceeded mask")
    require(digest(material)!=lock["materialSha256"],"A1 ZIP SHA must differ")

    for file in ("demo.png","blank.png","checker.png"):
        pair(Image.open(a0/file),Image.open(a1/file),output/("compare-"+file))
    demo0,demo1 = (Image.open(d/"demo.png").convert("RGB") for d in (a0,a1))
    detail = {"paper-edge":(307,305,488,555),"fixed-paper-shadow":(608,307,746,562),"lace":(326,925,491,1069),
              "polaroid":(756,353,1002,483),"ticket":(98,845,374,1030),
              "subject":(426,311,676,573),"subject-shoes":(472,710,633,885)}
    for name,region in detail.items():
        pair(demo0,demo1,output/f"100pct-{name}.png",region)
    for label,color in (("light","#faf7f0"),("dark","#2a3039")):
        plates=[]
        for sheet in (sheet0,sheet1):
            plate=Image.new("RGBA",sheet.size,color)
            plate.alpha_composite(sheet)
            plates.append(plate)
        pair(*plates,output/f"rgba-{label}.png")

    require({path:digest(path) for path in workflow.rglob("*") if path.is_file()}==snapshots,
            "An original workflow file changed")
    report = {"sourceWorkflowId":workflow.name,"variant":"A1","layoutByteIdentical":True,
              "sevenIllustrationAssetsByteIdentical":True,"originalWorkflowFilesVerified":len(snapshots),
              "zipSha256":{"A0":lock["materialSha256"],"A1":digest(material)},
              "atlasDiff":alpha_diff,"spriteDiff":atlas_diffs,"backgroundDiff":diff(base,new_base),
              "previewDiff":diff(demo0,demo1),"sheetQa":qa,"jsonRoundTrip":{"A0":True,"A1":True},"sourceQa":audit["status"],
              "geometry":audit["mixedHandcutGeometry"],"sentinels":audit["sentinels"],"visualReviewRequired":True}
    (output/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("workflow",type=Path)
    cli.add_argument("output",type=Path)
    args=cli.parse_args()
    main(args.workflow.resolve(),args.output.resolve())
