"""[TINIX] Local Demo A2 material trial. Does not call MCP or import a job."""
import argparse
import json
from pathlib import Path
from shutil import copy2

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

from refine_demo_a import (background, diff, digest, grain_fill, main as build, points_mask,
                           read_json, require, rgb_shaded, torn_rect, verify_zip_preview)
from tinixposter_v1 import DELIVERY


def embroidered_lace(image):
    """Add raised thread and a warm backing inside the existing lace aperture and cutline."""
    alpha = np.asarray(image.getchannel("A"))
    distance = ndimage.distance_transform_edt(alpha >= 128)
    y, x = np.indices(alpha.shape)
    cloth = (x >= 16) & (x <= 263) & (y >= 18) & (y <= 55)
    structure = Image.new("L",image.size)
    draw = ImageDraw.Draw(structure)
    for cx in range(26,255,18):
        draw.ellipse((cx-7,22,cx+7,38),outline=220,width=2)
        draw.arc((cx-10,32,cx+10,52),0,180,fill=255,width=2)
        draw.line((cx-8,42,cx,49,cx+8,42),fill=150,width=1)
    draw.line((23,20,255,20),fill=180,width=1)
    draw.line((23,53,255,53),fill=190,width=2)
    thread = np.asarray(structure.filter(ImageFilter.GaussianBlur(.55)),dtype=float)/255
    cast = ndimage.shift(thread,(1.3,.65),order=1,prefilter=False)
    weave = np.cos(1.6*y+.2*np.sin(x)) + .75*np.cos(.9*x+.2*np.sin(y))
    relief = cloth*(-11 + 21*thread - 20*cast + 2.8*weave)
    relief += cloth*2.7*np.exp(-distance/2.7)
    return rgb_shaded(image,relief,np.array([1.,.92,.83]))


def raised_paper(image, seed, lace=False):
    if lace:
        return embroidered_lace(image)
    alpha = np.asarray(image.getchannel("A"))
    solid = alpha >= 128
    distance = ndimage.distance_transform_edt(solid)
    inner_edge = np.exp(-distance/4.2)
    vertical,horizontal = np.gradient(ndimage.gaussian_filter(solid.astype(float),2.3))
    rng = np.random.default_rng(seed)
    fibres = ndimage.gaussian_filter(rng.standard_normal(alpha.shape),(.58,3.2))
    body = ndimage.gaussian_filter(rng.standard_normal(alpha.shape),(2.1,4.5))
    light = 37*(vertical+.48*horizontal) + (7+24*inner_edge)*fibres + 12*body
    colors = np.asarray(image)
    white_paper = (colors[:,:,:3].min(axis=2)>=244) & (np.ptp(colors[:,:,:3],axis=2)<=13)
    light -= white_paper*2.7
    return rgb_shaded(image,light,np.array([.91,1.,1.12]))


def layered_background(original, palette):
    width,height = original.size
    require(np.array_equal(original,background(width,height,palette,0)),
            "Locked background does not match Demo A fixed paper geometry")
    canvas = grain_fill(width,height,19,palette[0],3.5)
    patches = ((-.06,.12,.58,.43),(.63,-.03,1.07,.53),(.47,.71,1.08,1.04),(-.08,.72,.38,1.06))
    for index,coords in enumerate(patches):
        bounds = (v*(width if i%2==0 else height) for i,v in enumerate(coords))
        mask = points_mask((width,height),torn_rect(*bounds,index,7,29),2)
        # Integrate fixed papers into the background in their original paint order.
        # A short contact shadow provides the dark junction, a low-density falloff prevents a hard rim.
        for blur, density, shift in ((5.0,.16,(3,7)),(1.45,.24,(1,3))):
            shade = Image.new("RGBA",canvas.size,(106,80,78))
            shade.putalpha(mask.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: round(v*density)))
            canvas.alpha_composite(shade,shift)
        paper = grain_fill(width,height,index+45,palette[(index+1)%4],4)
        paper.putalpha(mask)
        canvas.alpha_composite(raised_paper(paper,630+index))
    return canvas.convert("RGB")


def compare(images, region=None):
    panels = [image.crop(region) if region else image for image in images]
    width,height = panels[0].size
    require(all(panel.size==(width,height) for panel in panels),"Panel dimensions differ")
    board = Image.new("RGB",(width*3+28,height+36),"#eee9e4")
    draw = ImageDraw.Draw(board)
    font = ImageFont.load_default(size=19)
    for index,panel in enumerate(panels):
        x = index*(width+14)
        draw.text((x+8,7),f"A{index}",font=font,fill="#302629")
        board.paste(panel.convert("RGB"),(x,36))
    return board


def small_jpeg(image, path):
    for quality in (90,85,80,75,70,62,50):
        image.save(path, quality=quality, optimize=True, subsampling=2)
        if path.stat().st_size<1_000_000:
            return path.stat().st_size
    raise ValueError("Evidence JPEG still exceeds 1 MB")


def run(workflow, previous, output):
    require(not output.is_relative_to(previous),"A2 output must be outside A1")
    earlier = {file:digest(file) for file in previous.rglob("*") if file.is_file()}
    old = workflow/"compositions"
    spec = read_json(old/"A.source.json")
    prior = read_json(previous/"report.json")
    require(digest(previous/"A1"/"material.zip")==prior["zipSha256"]["A1"],"A1 evidence differs from locked SHA")
    build(workflow,output,variant="A2",relief=raised_paper,backdrop=layered_background)
    second = output/"A2"
    folders = [old/"A",previous/"A1",second]
    verify_zip_preview(folders[1],previous,spec)
    proof = output/"review"
    proof.mkdir()
    report = read_json(output/"report.json")
    report["zipSha256"]["A1"] = prior["zipSha256"]["A1"]
    require(len(set(report["zipSha256"].values()))==3,"Expected three distinct ZIP hashes")
    report["jsonRoundTrip"]["A1"] = True
    report["a1FilesVerified"] = len(earlier)
    report["jpegBytes"] = {}
    pages = [Image.open(folder/"demo.png").convert("RGB") for folder in folders]
    for index,folder in enumerate(folders):
        copy2(folder/"demo.png",proof/f"A{index}.png")
        filename = f"A{index}.jpg"
        report["jpegBytes"][filename] = small_jpeg(pages[index],proof/filename)
    for name in ("demo","blank","checker"):
        panel = compare([Image.open(folder/(name+".png")).convert("RGB") for folder in folders])
        panel.save(proof/("compare-"+name+".png"))
        filename = "compare-"+name+".jpg"
        report["jpegBytes"][filename] = small_jpeg(panel,proof/filename)
    regions = {"paper-edge":(307,305,488,555), "fixed-paper-shadow":(590,290,749,570),
               "lace":(318,932,495,1069), "polaroid":(756,353,1002,483),
               "ticket":(98,845,374,1030), "subject":(426,311,676,573),
               "subject-shoes":(472,710,633,885)}
    report["regionalPreviewDiff"] = {}
    crops = {}
    for name,region in regions.items():
        crop = compare(pages,region)
        crop.save(proof/f"100pct-{name}.png")
        crops[name] = crop
        ref0,ref1,test = [image.crop(region) for image in pages]
        report["regionalPreviewDiff"][name] = {"A0_to_A1":diff(ref0,ref1),"A0_to_A2":diff(ref0,test)}
    selected = [("Torn paper edge","paper-edge"),("Fixed paper contact shadow","fixed-paper-shadow"),("Lace stitch relief","lace")]
    width = max(crops[name].width for _,name in selected)+30
    height = sum(crops[name].height+45 for _,name in selected)+55
    detail = Image.new("RGB",(width,height),"#f3ece6")
    draw = ImageDraw.Draw(detail)
    font = ImageFont.load_default(size=19)
    draw.text((15,13),"Demo A · comparison at 100%",font=font,fill="#302629")
    y = 48
    for label,name in selected:
        draw.text((15,y),label,font=font,fill="#302629")
        detail.paste(crops[name],(15,y+27))
        y += crops[name].height+45
    detail.save(proof/"contact-sheet.png")
    report["jpegBytes"]["contact-sheet.jpg"] = small_jpeg(detail,proof/"contact-sheet.jpg")
    rgba = [Image.open(folder/"material"/DELIVERY[3]).convert("RGBA") for folder in folders]
    report["atlasDiffA1ToA2"] = diff(rgba[1],rgba[2])
    require(report["atlasDiffA1ToA2"]["alphaChangedPixels"] == 0,"A2 alpha differs from A1")
    for label,color in (("light","#faf7f0"),("dark","#2a3039")):
        sheets = []
        for atlas in rgba:
            backing = Image.new("RGBA",atlas.size,color)
            backing.alpha_composite(atlas)
            sheets.append(backing)
        compare(sheets).save(proof/f"rgba-{label}.png")
    report["previewDiffA1ToA2"] = diff(pages[1],pages[2])
    require({file:digest(file) for file in previous.rglob("*") if file.is_file()}==earlier,"A1 changed")
    (proof/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    sums = "".join(f"{digest(file)}  {file.name}\n" for file in sorted(proof.iterdir()))
    (proof/"SHA256SUMS.txt").write_text(sums,encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workflow",type=Path)
    parser.add_argument("previous",type=Path)
    parser.add_argument("output",type=Path)
    args = parser.parse_args()
    run(args.workflow.resolve(),args.previous.resolve(),args.output.resolve())
