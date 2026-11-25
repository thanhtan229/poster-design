"""[TINIX] Offline B1 validation of A3's D04 textile with a paler pastel palette."""
import argparse
from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
from shutil import copy2
from zipfile import ZipFile

import numpy as np
from PIL import Image

from mixed_handcut_qa import inspect_geometry
from refine_demo_a import diff, digest, read_json, require, verify_zip_preview
from refine_demo_a2 import small_jpeg
from refine_demo_a3 import board, textile_rgb
from source_qa import inspect as inspect_source
from tinixposter_v1 import DELIVERY, export, validate


def run(workflow, a2_root, a3_root, output):
    require(all(not output.is_relative_to(root) for root in (workflow,a2_root,a3_root)), "B1 needs a separate output")
    fingerprints={p:digest(p) for root in (workflow,a2_root,a3_root) for p in root.rglob("*") if p.is_file()}
    original=workflow/"compositions"
    locks={row["demoId"]:row for row in read_json(workflow/"locks.json")}
    require(set(locks)==set("ABCD") and all(digest(original/key/"material.zip")==row["materialSha256"]
               for key,row in locks.items()),"Four locked kits required")
    b0=original/"B"
    base_spec=original/"B.source.json"
    require(locks["B"]["manifestSha256"]==digest(base_spec) and locks["B"]["demoSha256"]==digest(b0/"demo.png"),
            "Locked B0 source or preview differs")
    spec=read_json(base_spec)
    a3_spec=read_json(a3_root/"A3.source.json")
    d04,a3_d04=(next(layer for layer in source["decorations"] if layer["code"]=="D04")
                 for source in (spec,a3_spec))
    name=d04["asset"]
    base_lace=Image.open(original/name).convert("RGBA")
    a3_lace=Image.open(a3_root/a3_d04["asset"]).convert("RGBA")
    a0_d04=next(layer for layer in read_json(original/"A.source.json")["decorations"] if layer["code"]=="D04")
    require(digest(original/name)==digest(original/a0_d04["asset"]),"A0 and B0 use different lace geometry")
    require(all(d04["target"][key]==a3_d04["target"][key] for key in ("width","height")),
            "A3 texture scale is incompatible with B")
    require(base_lace.size==a3_lace.size and np.array_equal(base_lace.getchannel("A"),a3_lace.getchannel("A")),
            "A3 and B0 lace alpha or dimensions differ")
    a2_lace=Image.open(a2_root/a3_d04["asset"]).convert("RGBA")
    require(np.array_equal(a2_lace.getchannel("A"),base_lace.getchannel("A")),
            "A2 and B0 protected geometry differs")
    reproduced,protected=textile_rgb(a2_lace)
    require(np.array_equal(reproduced,a3_lace),"A3 procedural texture or protected region did not reproduce")
    lace,matched_protection=textile_rgb(base_lace,ivory_mix=.30)
    require(matched_protection==protected,"White Cutline protection changed")
    spectrum=diff(base_lace,lace)
    require(spectrum["alphaChangedPixels"]==0 and spectrum["rgbChangedPixelsOutsideAlpha"]==0,
            "B1 texture crosses the locked alpha")
    output.mkdir(parents=True)
    manifest=output/"B1.source.json"
    copy2(base_spec,manifest)
    images={layer["photo"] for layer in spec["frames"]}|{spec["subject"]["asset"]}
    layers=spec["frames"]+spec["decorations"]
    files={spec["background"]}|images|{layer["asset"] for layer in layers}
    require(name not in images,"D04 cannot be an illustration")
    for asset in files:
        source=(original/asset).resolve()
        require(source.is_relative_to(original),"Unexpected source path")
        destination=output/asset
        destination.parent.mkdir(parents=True,exist_ok=True)
        copy2(source,destination)
    lace.save(output/name)
    require({asset for asset in files if digest(output/asset)!=digest(original/asset)}=={name},
            "B1 changed a non-D04 source")
    trust=set(locks["B"]["proceduralStaticSha256"])|{digest(output/name)}
    b1=output/"B1"
    with redirect_stdout(StringIO()):
        export(manifest,b1/"material",b1/"qa",placeholders=True,review_dir=b1)
    kit=b1/"material.zip"
    require(digest(kit) not in {row["materialSha256"] for row in locks.values()},"B1 ZIP is not independent")
    with ZipFile(kit) as archive:
        require(sorted(archive.namelist())==sorted(DELIVERY) and archive.testzip() is None,"B1 ZIP invalid")
    layout=(b0/"material"/"layout.json").read_bytes()
    require(layout==(b1/"material"/"layout.json").read_bytes(),"B1 layout changed")
    sheets=[Image.open(folder/"material"/DELIVERY[3]).convert("RGBA") for folder in (b0,b1)]
    packed=diff(*sheets)
    require(packed["alphaChangedPixels"]==0 and packed["rgbChangedPixelsOutsideAlpha"]==0,
            "Atlas alpha or RGB outside alpha changed")
    d04_box=next(layer["source"] for layer in json.loads(layout)["decorations"] if layer["code"]=="D04")
    x,y,w,h=(d04_box[key] for key in ("x","y","width","height"))
    changed=np.any(np.asarray(sheets[0])!=np.asarray(sheets[1]),axis=2)
    require(packed["rgbChangedPixels"]>0 and int(changed.sum())==int(changed[y:y+h,x:x+w].sum()),
            "Atlas changes are not confined to D04")
    audit=inspect_source(manifest,kit,b1/"source-qa",trust,trust)
    geometry=audit["mixedHandcutGeometry"]
    require(geometry==inspect_geometry(json.loads(layout),sheets[0]),"B1 changed B0's geometry classification")
    require(audit["status"]=="pass" and geometry["status"]=="pass" and geometry["allSixWindows"]
            and geometry["notebooks"]==["F05"] and geometry["polaroids"]==["F01"]
            and any(pair["distinct"] for pair in geometry["silhouettePairs"])
            and bool(geometry["stampsOrTickets"]),"B1 Mixed Handcut geometry failed")
    qa=validate(b1/"material")
    require(qa["pieces"]==17 and qa["min_bounding_box_gap_px"]>=12
            and list(qa["components_by_alpha"].values())==[17]*4,"B1 cut sheet failed")
    require(len(audit["sentinels"])==7 and all(row["outsideMaskPx"]==0 and row["changedPx"]>0
            for row in audit["sentinels"].values()),"B1 sentinel failed")
    require(read_json(b1/"qa"/"tinixposter_qa.json")["render_pixel_identical_from_json"],"B1 round trip failed")
    verify_zip_preview(b0,original,spec)
    verify_zip_preview(b1,output,spec)
    evidence=output/"review"
    evidence.mkdir()
    sizes={}
    def compare(panes, region=None, zoom=1):
        return board(panes,region,zoom,labels=("B0","B1"))
    for kind in ("demo","blank","checker"):
        panes=[Image.open(folder/(kind+".png")).convert("RGB") for folder in (b0,b1)]
        filename=f"compare-{kind}.jpg"
        sizes[filename]=small_jpeg(compare(panes),evidence/filename)
        if kind=="demo":
            previews=panes
            for index,page in enumerate(panes):
                filename=f"B{index}.jpg"
                sizes[filename]=small_jpeg(page,evidence/filename)
    region=(206,963,430,1054)
    for zoom in (1,2):
        compare(previews,region,zoom).save(evidence/f"lace-{zoom*100}pct.png")
    for label,color in (("light","#faf7f0"),("dark","#2a3039")):
        plates=[]
        for sheet in sheets:
            plate=Image.new("RGBA",sheet.size,color)
            plate.alpha_composite(sheet)
            plates.append(plate)
        compare(plates).save(evidence/f"rgba-{label}.png")
    require({p:digest(p) for root in (workflow,a2_root,a3_root) for p in root.rglob("*") if p.is_file()}==fingerprints,
            "A3 or an original workflow file changed")
    report={"variant":"B1","onlyChangedSourceAsset":name,"laceOriginalSize":list(base_lace.size),
            "A3ProceduralPixelsReproduced":True,"D04ProtectedPixels":protected,
            "D04Placement":d04["target"],"layoutByteIdentical":True,"onlyD04AtlasRgbChanged":True,
            "D04Diff":spectrum,"packedAtlasDiff":packed,"laceCropDiff":diff(*(p.crop(region) for p in previews)),
            "previewDiff":diff(*previews),"sourceQa":audit["status"],"geometry":geometry,"sheetQa":qa,
            "sentinels":audit["sentinels"],"jsonRoundTrip":{"B0":True,"B1":True},
            "zipSha256":{"B0":digest(b0/"material.zip"),"B1":digest(kit)},
            "originalFilesVerified":len(fingerprints),"jpegBytes":sizes}
    (evidence/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    sums="".join(f"{digest(path)}  {path.name}\n" for path in sorted(evidence.iterdir()))
    (evidence/"SHA256SUMS.txt").write_text(sums,encoding="utf-8")


if __name__=="__main__":
    cli=argparse.ArgumentParser(description=__doc__)
    for arg in ("workflow","a2","a3","output"):
        cli.add_argument(arg,type=Path)
    run(*(value.resolve() for value in vars(cli.parse_args()).values()))
