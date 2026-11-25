#!/usr/bin/env python3
"""Export and validate TinixPoster v1 scrapbook kits from one layered composition.

Usage:
  python tinixposter_v1.py export manifest.json --out out_dir --qa-out qa_dir
  python tinixposter_v1.py validate out_dir --qa-out qa_dir

Requires Pillow, numpy, scipy and opencv-python.  The composition manifest is an
internal source: only 4 PNG + layout.json go inside the delivery ZIP.  Layers
may refer to distinct PNGs or tight crops of a shared RGBA source sheet.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import zipfile
from pathlib import Path
from time import perf_counter  # [TINIX]
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps
from scipy import ndimage as ndi
from mixed_handcut_qa import inspect_geometry  # [TINIX]

DELIVERY = ("01_anh_mau.png", "02_nen_sach.png", "03_so_do_bo_cuc.png", "04_tam_manh_RGBA.png", "layout.json")
REQUIRED_LAYOUT = ("version", "sheet", "reference", "print", "frames", "subjectZ", "subject", "decorations")


def require(cond: bool, msg: str):
    if not cond:
        raise ValueError(msg)


def check_target(t: dict, code: str):
    require(set(t) == {"x", "y", "width", "height", "angle"}, f"{code}: target must have exactly x,y,width,height,angle")
    for k in ("x", "y", "width", "height", "angle"):
        require(type(t[k]) in (int, float) and math.isfinite(t[k]), f"{code}: invalid {k}")
    require(t["width"] >= 1 and t["height"] >= 1, f"{code}: invalid target dimensions")
    require(int(t["width"]) == t["width"] and int(t["height"]) == t["height"], f"{code}: target dimensions should be integer pixels")


def check_layout_schema(layout: dict, strict: bool = True):
    require(isinstance(layout, dict), "layout.json must be an object")
    if strict:
        require(set(layout) == set(REQUIRED_LAYOUT), f"Only these top-level keys are allowed: {REQUIRED_LAYOUT}")
    require(type(layout.get("version")) is int and layout["version"] == 1, "TinixPoster version must be 1")
    for k, fname in (("sheet", "04_tam_manh_RGBA.png"), ("reference", "01_anh_mau.png")):
        item = layout[k]
        require(set(item) == {"file", "width", "height"}, f"{k}: invalid keys")
        require(item["file"] == fname, f"{k}: wrong file")
        require(all(type(item[a]) is int and item[a] >= 1 for a in ("width", "height")), f"{k}: invalid dimensions")
    pr = layout["print"]
    require(set(pr) == {"widthMm", "heightMm", "dpi"}, "print keys must be widthMm,heightMm,dpi")
    require(all(type(pr[k]) in (int, float) and pr[k] > 0 for k in pr), "print values must be positive numbers")
    w, h = layout["reference"]["width"], layout["reference"]["height"]
    ratio_mm = pr["widthMm"] / pr["heightMm"]
    ratio_px = w / h
    require(abs(ratio_mm - ratio_px) / ratio_mm < 0.003, "Print aspect ratio differs from reference image")
    ppi_w, ppi_h = w * 25.4 / pr["widthMm"], h * 25.4 / pr["heightMm"]
    require(abs(ppi_w - pr["dpi"]) / pr["dpi"] <= 0.035 and abs(ppi_h - pr["dpi"]) / pr["dpi"] <= 0.035,
            f"Declared DPI {pr['dpi']} differs from effective PPI ({ppi_w:.2f}, {ppi_h:.2f})")
    fs = layout["frames"]
    ds = layout["decorations"]
    require(isinstance(fs, list) and len(fs) > 0, "Missing frames")
    require(isinstance(ds, list), "decorations must be array")
    codes = [x["code"] for x in fs]
    require(codes == [f"F{i:02d}" for i in range(1, len(fs)+1)], "Frames must be ordered F01..F0N")
    deco_codes = [x["code"] for x in ds]
    require(deco_codes == [f"D{i:02d}" for i in range(1, len(ds)+1)], "Every decoration, even a repeated motif, needs unique Dxx code")
    all_z = []
    for kind, objs in (("frame", fs), ("decoration", ds)):
        for entry in objs:
            require(set(entry) == {"code", "source", "target", "z"}, f"{kind} {entry.get('code')}: wrong keys")
            code = entry["code"]
            s = entry["source"]
            require(set(s) == {"x", "y", "width", "height"}, f"{code}: wrong source fields")
            require(all(type(s[k]) is int for k in s), f"{code}: source requires integers")
            require(s["x"] >= 0 and s["y"] >= 0 and s["width"] > 0 and s["height"] > 0, f"{code}: invalid source rectangle")
            require(s["x"] + s["width"] <= layout["sheet"]["width"] and s["y"] + s["height"] <= layout["sheet"]["height"], f"{code}: source out of sheet")
            check_target(entry["target"], code)
            require(type(entry["z"]) is int, f"{code}: z must be integer")
            all_z.append(entry["z"])
    require(type(layout["subjectZ"]) is int, "subjectZ must be integer")
    all_z.append(layout["subjectZ"])
    require(len(set(all_z)) == len(all_z), "All frame, subject and decoration z values must be unique")
    require(set(layout["subject"]) in ({"target"}, {"target", "borderMm"}), "subject keys invalid")
    check_target(layout["subject"]["target"], "SUBJECT")
    if "borderMm" in layout["subject"]:
        require(type(layout["subject"]["borderMm"]) in (int, float) and layout["subject"]["borderMm"] >= 0, "borderMm invalid")


def trim_nonzero(image: Image.Image, name: str) -> Image.Image:
    im = image.convert("RGBA")
    a = np.asarray(im.getchannel("A"))
    yy, xx = np.where(a > 0)
    require(len(xx) > 0, f"{name}: sprite has no alpha")
    cropped = im.crop((int(xx.min()), int(yy.min()), int(xx.max())+1, int(yy.max())+1))
    # Internal pixels at alpha zero never contain colors; ensure reproducible PNG sheets.
    arr = np.array(cropped)
    arr[arr[:, :, 3] == 0, :3] = 0
    return Image.fromarray(arr, "RGBA")


def load_asset(item: dict, base: Path, code: str) -> Image.Image:
    path = (base / item["asset"]).resolve()
    require(path.is_file(), f"{code}: missing sprite: {path}")
    img = Image.open(path).convert("RGBA")
    if "crop" in item:
        c = item["crop"]
        require(all(k in c for k in ("x", "y", "width", "height")), f"{code}: crop invalid")
        img = img.crop((int(c["x"]), int(c["y"]), int(c["x"]+c["width"]), int(c["y"]+c["height"])))
    cropped = trim_nonzero(img, code)
    aa = np.asarray(cropped.getchannel("A"))
    _, n = ndi.label(aa > 0, structure=np.ones((3, 3), dtype=bool))
    require(n == 1, f"{code}: sprite contains {n} disjoint alpha islands; split/remove stray alpha first")
    return cropped


def detect_window(sprite: Image.Image, code: str) -> np.ndarray:
    a = np.array(sprite.getchannel("A"))
    solid = a > 0
    holes = ndi.binary_fill_holes(solid) & (~solid)
    labels, n = ndi.label(holes, structure=np.ones((3, 3), dtype=bool))
    areas = [(int((labels == i).sum()), i) for i in range(1, n+1)]
    major = [it for it in areas if it[0] >= max(500, int(a.size * 0.055))]
    require(len(major) == 1, f"{code}: need ONE fully enclosed alpha=0 photo window, found {len(major)}")
    _, lid = major[0]
    window = (labels == lid)
    require(int(a[window].max(initial=0)) == 0, f"{code}: photo window not alpha=0")
    return window


def pack_assets(assets: list[tuple[str, Image.Image]], width: int | None, gap: int, margin: int):
    require(gap >= 12, "Sheet gutter gap must be >= 12 alpha-zero pixels")
    require(margin >= 12, "Sheet outside margin must be >= 12")
    areas = sum((im.width + gap) * (im.height + gap) for _, im in assets)
    w = width or max(max(im.width for _, im in assets) + 2*margin, int(math.sqrt(areas) * 1.30))
    require(w >= max(im.width for _, im in assets) + 2*margin, "Configured sheet width too small for largest piece")
    x, y, row_h = margin, margin, 0
    placements = {}
    for code, im in assets:
        if x + im.width + margin > w:
            y += row_h + gap
            x, row_h = margin, 0
        placements[code] = {"x": x, "y": y, "width": im.width, "height": im.height}
        x += im.width + gap
        row_h = max(row_h, im.height)
    h = y + row_h + margin
    sheet = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for code, im in assets:
        r = placements[code]
        sheet.alpha_composite(im, (r["x"], r["y"]))
    return sheet, placements


def transformed(sprite: Image.Image, target: dict) -> Image.Image:
    scaled = sprite.resize((int(target["width"]), int(target["height"])), Image.Resampling.LANCZOS)
    angle = target["angle"]
    if abs(angle) < 1e-10:
        return scaled
    return scaled.rotate(-angle, Image.Resampling.BICUBIC, expand=True)


def place(canvas: Image.Image, sprite: Image.Image, t: dict) -> None:
    obj = transformed(sprite, t)
    left = int(round(t["x"] - obj.width / 2))
    top = int(round(t["y"] - obj.height / 2))
    x0, y0 = max(left, 0), max(top, 0)
    x1, y1 = min(canvas.width, left + obj.width), min(canvas.height, top + obj.height)
    if x1 > x0 and y1 > y0:
        canvas.alpha_composite(obj.crop((x0-left, y0-top, x1-left, y1-top)), (x0, y0))


def make_photo_layer(sprite: Image.Image, path: Path | Image.Image | None, code: str) -> Image.Image:  # [TINIX]
    # [TINIX] The template branch uses neutral fills in the same frame openings.
    if path is not None and not isinstance(path, Image.Image):
        require(path.is_file(), f"{code}: missing example photo {path}")
    window = detect_window(sprite, code)
    yy, xx = np.where(window)
    x0, x1, y0, y1 = int(xx.min()), int(xx.max()+1), int(yy.min()), int(yy.max()+1)
    photo = path if isinstance(path, Image.Image) else Image.open(path).convert("RGB") if path is not None else None
    fitted = (Image.new("RGB", (x1-x0, y1-y0), "#e8ecf1") if photo is None else
              ImageOps.fit(photo, (x1-x0, y1-y0), Image.Resampling.LANCZOS))
    layer = Image.new("RGBA", sprite.size)
    layer.paste(fitted, (x0, y0))
    mat = ndi.binary_dilation(window, iterations=1).astype(np.uint8) * 255
    rgba = np.array(layer)
    rgba[:, :, 3] = np.minimum(rgba[:, :, 3], mat)
    return Image.fromarray(rgba, "RGBA")


def prep_subject(img: Image.Image, target: dict, border_mm: float, dpi: float) -> Image.Image:
    original = trim_nonzero(img, "SUBJECT")
    W, H = int(target["width"]), int(target["height"])
    br = max(0, int(round(border_mm * dpi / 25.4)))
    require(W > 2*br + 8 and H > 2*br + 8, "SUBJECT target too small for borderMm")
    fitted = ImageOps.contain(original, (W-2*br-6, H-2*br-6), Image.Resampling.LANCZOS)
    subject = Image.new("RGBA", (W, H))
    sx, sy = (W-fitted.width)//2, (H-fitted.height)//2
    subject.alpha_composite(fitted, (sx,sy))
    if br:
        mask = subject.getchannel("A")
        dilation = mask.filter(ImageFilter.MaxFilter(br*2+1))
        cutline = Image.new("RGBA", (W,H), (255,255,255,0))
        cutline.putalpha(dilation)
        cutline.alpha_composite(subject)
        subject = cutline
    return subject


def font_bold(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for file in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"):
        if Path(file).is_file():
            return ImageFont.truetype(file, size)
    return ImageFont.load_default()


def label(draw: ImageDraw.ImageDraw, center: tuple[float,float], name: str, fs: int=25):
    cx, cy = center
    font = font_bold(fs)
    box = draw.textbbox((0,0), name, font=font)
    tw, th = box[2]-box[0], box[3]-box[1]
    x0, y0 = int(round(cx - tw/2 - 11)), int(round(cy - th/2 - 10))
    draw.rounded_rectangle((x0,y0,x0+tw+22,y0+th+20),radius=8,fill=(255,251,235,247),outline=(104,71,58,255),width=2)
    draw.text((cx,cy+1),name,anchor="mm",font=font,fill=(68,45,43,255))


def frame_window_center(sprite: Image.Image, t: dict, code: str) -> tuple[float,float]:
    wmask = detect_window(sprite,code)
    ys, xs = np.where(wmask)
    localx, localy = float(xs.mean()), float(ys.mean())
    dx = (localx-sprite.width/2) * (t["width"]/sprite.width)
    dy = (localy-sprite.height/2) * (t["height"]/sprite.height)
    th = math.radians(t["angle"])
    return t["x"] + dx*math.cos(th)-dy*math.sin(th), t["y"]+dx*math.sin(th)+dy*math.cos(th)


def validate_sheet(layout: dict, sheet: Image.Image) -> dict:
    require(sheet.mode == "RGBA", "Cut sheet must be true RGBA")
    a = np.array(sheet.getchannel("A"))
    # Enforce no weak 1-7 alpha garbage or disconnected islands in a single source bbox.
    all_items = layout["frames"] + layout["decorations"]
    sources = []
    for el in all_items:
        s = el["source"]
        sub = a[s["y"]:s["y"]+s["height"], s["x"]:s["x"]+s["width"]]
        require(np.any(sub>0), f"{el['code']}: empty source")
        require(np.any(sub[0]>0) and np.any(sub[-1]>0) and np.any(sub[:,0]>0) and np.any(sub[:,-1]>0), f"{el['code']}: source not a tight alpha bounding rectangle")
        _, n = ndi.label(sub>0, structure=np.ones((3,3),dtype=bool))
        require(n==1, f"{el['code']}: {n} disconnected alpha islands")
        sources.append((el["code"],(s["x"],s["y"],s["x"]+s["width"],s["y"]+s["height"])))
    min_gap = float('inf')
    for i,(c1,b1) in enumerate(sources):
        for c2,b2 in sources[i+1:]:
            dx = max(b1[0]-b2[2],b2[0]-b1[2],0)
            dy = max(b1[1]-b2[3],b2[1]-b1[3],0)
            gap = math.hypot(dx,dy)
            require(gap >= 12, f"Cut sheet sprites {c1} and {c2} have only {gap:.2f}px bbox gap")
            min_gap = min(min_gap,gap)
    comps = {}
    for th in (1,8,16,24):
        _, n = ndi.label(a>=th,structure=np.ones((3,3),dtype=bool))
        comps[th] = n
        require(n == len(sources), f"At alpha {th}: {n} components but expected {len(sources)}")
    windows = {}
    for frame in layout["frames"]:
        s = frame["source"]
        crop = sheet.crop((s["x"],s["y"],s["x"]+s["width"],s["y"]+s["height"]))
        wmask = detect_window(crop, frame["code"])
        windows[frame["code"]] = int(wmask.sum())
    require(a[:12].max(initial=0)==0 and a[-12:].max(initial=0)==0 and a[:,:12].max(initial=0)==0 and a[:,-12:].max(initial=0)==0,
            "Cut sheet edge must have >=12px transparent margin")
    return {"pieces": len(sources), "components_by_alpha":comps, "min_bounding_box_gap_px":min_gap, "enclosed_windows_alpha_zero":windows}


def render_scene(layout: dict, sheet: Image.Image, background: Image.Image, photo_paths: dict[str, Path | Image.Image | None] | None,  # [TINIX]
                 subject_asset: Image.Image | None, *, preview: bool = True) -> Image.Image:
    scene = background.convert("RGBA")
    commands = [(it["z"], "frame",it) for it in layout["frames"]] + [(it["z"],"decor",it) for it in layout["decorations"]]
    commands.append((layout["subjectZ"],"subject",layout["subject"]))
    commands.sort(key=lambda e:e[0])
    for z, kind, it in commands:
        if kind == "subject":
            if preview and subject_asset is not None:
                place(scene, subject_asset, it["target"])
            continue
        s,t = it["source"],it["target"]
        sprite = sheet.crop((s["x"],s["y"],s["x"]+s["width"],s["y"]+s["height"]))
        if kind=="frame" and preview and photo_paths is not None:
            require(it["code"] in photo_paths, f"Missing image for {it['code']}")
            place(scene, make_photo_layer(sprite, photo_paths[it["code"]], it["code"]),t)
        place(scene,sprite,t)
    return scene


def checkerboard(width, height, step=16):  # [TINIX]
    result = Image.new("RGB", (width, height), "#edf4fd")
    draw = ImageDraw.Draw(result)
    for y in range(0, height, step):
        for x in range(0, width, step):
            if (x // step + y // step) % 2:
                draw.rectangle((x, y, x + step - 1, y + step - 1), fill="#95b5dd")
    return result


def render_guide(layout: dict, sheet: Image.Image, bg: Image.Image, subject_asset: Image.Image, notes: list) -> Image.Image:
    page = render_scene(layout,sheet,bg,None,None,preview=False)
    W,H = page.size
    d = ImageDraw.Draw(page,"RGBA")
    # Dotted SUBJECT region is a geometric canvas slot, not a person silhouette.
    st = layout["subject"]["target"]
    cx,cy = st["x"],st["y"]
    tw,th = st["width"],st["height"]
    x0,y0,x1,y1 = int(cx-tw/2),int(cy-th/2),int(cx+tw/2),int(cy+th/2)
    for x in range(x0,x1,19):
        d.line((x,y0,min(x+9,x1),y0), fill=(53,116,95,244),width=3)
        d.line((x,y1,min(x+9,x1),y1), fill=(53,116,95,244),width=3)
    for y in range(y0,y1,19):
        d.line((x0,y,x0,min(y+9,y1)), fill=(53,116,95,244),width=3)
        d.line((x1,y,x1,min(y+9,y1)), fill=(53,116,95,244),width=3)
    # Hidden frame edges are projected from actual source frame alpha, and drawn
    # dashed only where a later (higher z) layer occludes them on the preview.
    later_layers = [(obj["z"],obj) for obj in layout["frames"]+layout["decorations"]]
    for fr in layout["frames"]:
        s,t=fr["source"],fr["target"]
        crop=sheet.crop((s["x"],s["y"],s["x"]+s["width"],s["y"]+s["height"]))
        layer=Image.new("RGBA",(W,H))
        place(layer,crop,t)
        alpha=np.array(layer.getchannel("A"))>25
        edge=cv2.morphologyEx(alpha.astype(np.uint8),cv2.MORPH_GRADIENT,np.ones((3,3),np.uint8))>0
        hidden=np.zeros((H,W),dtype=bool)
        if layout["subjectZ"]>fr["z"]:
            subject_page=Image.new("RGBA",(W,H))
            place(subject_page,subject_asset,st)
            hidden |= np.array(subject_page.getchannel("A"))>20
        for z,obj in later_layers:
            if z<=fr["z"]:
                continue
            r=obj["source"]
            c=sheet.crop((r["x"],r["y"],r["x"]+r["width"],r["y"]+r["height"]))
            projected=Image.new("RGBA",(W,H))
            place(projected,c,obj["target"])
            hidden |= np.asarray(projected.getchannel("A"))>20
        ys,xs=np.where(edge & hidden)
        for px,py in zip(xs[::2],ys[::2]):
            if ((int(px)+int(py))//9)%2==0:
                d.point((int(px),int(py)),fill=(98,78,76,255))
        label(d,frame_window_center(crop,t,fr["code"]),fr["code"])
    label(d,(cx,cy),"SUBJECT",fs=24)
    for note in notes:
        x,y = int(note["x"]),int(note["y"])
        label(d,(x,y),str(note["text"]),fs=13)
    return page


def export(manifest_file: Path, out_dir: Path, qa_out: Path | None = None, *, preview_only=False, placeholders=False, review_dir: Path | None = None):  # [TINIX]
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    basedir = manifest_file.parent
    page = manifest["page"]
    width, height = int(page["width"]), int(page["height"])
    background_path = (basedir / manifest["background"]).resolve()
    bg = Image.open(background_path).convert("RGB")
    require(bg.size == (width,height), f"Background dimensions {bg.size} != {(width,height)}")
    fs = manifest["frames"]
    ds = manifest.get("decorations",[])
    require([q["code"] for q in fs] == [f"F{i:02d}" for i in range(1,len(fs)+1)], "Input frames must be F01... ordered")
    require([q["code"] for q in ds] == [f"D{i:02d}" for i in range(1,len(ds)+1)], "Every decoration placement needs unique Dxx code")
    pieces = []
    for item in fs+ds:
        pieces.append((item["code"],load_asset(item,basedir,item["code"])))
    for code,im in pieces[:len(fs)]:
        detect_window(im,code)
    sheet_specs = manifest.get("sheet",{})
    sheet, source_rects = pack_assets(pieces,sheet_specs.get("width"),int(sheet_specs.get("gap",22)),int(sheet_specs.get("margin",24)))
    layout = {
       "version":1,
       "sheet":{"file":"04_tam_manh_RGBA.png","width":sheet.width,"height":sheet.height},
       "reference":{"file":"01_anh_mau.png","width":width,"height":height},
       "print":manifest["print"],
       "frames":[{"code":it["code"],"source":source_rects[it["code"]],"target":it["target"],"z":it["z"]} for it in fs],
       "subjectZ":manifest["subject"]["z"],
       "subject":{"target":manifest["subject"]["target"],"borderMm":manifest["subject"].get("borderMm",0.9)},
       "decorations":[{"code":it["code"],"source":source_rects[it["code"]],"target":it["target"],"z":it["z"]} for it in ds]
    }
    check_layout_schema(layout)
    qa = validate_sheet(layout,sheet)
    mixed_handcut = manifest.get("mixedHandcutGeometryVersion") == 1  # [TINIX]
    if mixed_handcut:
        qa["mixed_handcut_geometry"] = inspect_geometry(layout, sheet)
    subject_img = Image.open((basedir/manifest["subject"]["asset"]).resolve()).convert("RGBA")
    require(np.any(np.array(subject_img.getchannel("A"))==0), "SUBJECT needs a true cutout with alpha")
    subject_prepped=prep_subject(subject_img,layout["subject"]["target"],layout["subject"].get("borderMm",0),layout["print"]["dpi"])
    photo_paths={it["code"]:(basedir/it["photo"]).resolve() for it in fs}
    # [TINIX] Render the approval image with the same atlas and placement code as export.
    demo_ms = None
    if preview_only or review_dir is not None:  # [TINIX] Same packed layers generate the demo and the kit.
        preview_started = perf_counter()
        evidence = out_dir if preview_only else review_dir
        evidence.mkdir(parents=True, exist_ok=True)
        render_scene(layout,sheet,bg,photo_paths,subject_prepped).convert("RGB").save(evidence/"demo.png")
        demo_ms = round((perf_counter() - preview_started) * 1000)
        # [TINIX] Reuse the same layer order and transforms with all seven illustrations removed.
        render_scene(layout,sheet,bg,None,None).convert("RGB").save(evidence/"blank.png")
        check = checkerboard(192, 192)
        target = layout["subject"]["target"]
        subject_check = checkerboard(int(target["width"]), int(target["height"])).convert("RGBA")
        if mixed_handcut:  # [TINIX] The checker stands in for the fitted cutout, including its irregular edge.
            subject_check = checkerboard(*subject_prepped.size).convert("RGBA")
            subject_check.putalpha(subject_prepped.getchannel("A"))
        render_scene(layout,sheet,bg,dict.fromkeys(photo_paths, check),subject_check).convert("RGB").save(evidence/"checker.png")
        if preview_only:
            return
    kit_started = perf_counter()  # [TINIX] Measure the package separately from demo and evidence previews.
    if placeholders:
        photo_paths = dict.fromkeys(photo_paths)
    placed_subject = None if placeholders else subject_prepped
    out_dir.mkdir(parents=True,exist_ok=True)
    sheet.save(out_dir/DELIVERY[3])
    bg.save(out_dir/DELIVERY[1])
    (out_dir/DELIVERY[4]).write_text(json.dumps(layout,ensure_ascii=False,indent=2),encoding="utf-8")
    # Render from the actual exported, read-back sheet and layout, not independent AI images.
    sheet_read=Image.open(out_dir/DELIVERY[3]).convert("RGBA")
    layout_read=json.loads((out_dir/DELIVERY[4]).read_text(encoding="utf-8"))
    preview=render_scene(layout_read,sheet_read,bg,photo_paths,placed_subject)
    preview.convert("RGB").save(out_dir/DELIVERY[0])
    guide=render_guide(layout_read,sheet_read,bg,subject_prepped,manifest.get("guide",{}).get("notes",[]))
    guide.convert("RGB").save(out_dir/DELIVERY[2])
    # Independent path uses original un-packed layers and exactly the declared targets.
    source_render=bg.convert("RGBA")
    original={code:im for code,im in pieces}
    commands = sorted([(it["z"],"frame",it) for it in fs]+[(it["z"],"decor",it) for it in ds]+[(manifest["subject"]["z"],"subject",manifest["subject"])],key=lambda v:v[0])
    for _,kind,it in commands:
        if kind=="subject":
            if placed_subject is not None:
                place(source_render,placed_subject,it["target"])
            continue
        sprite=original[it["code"]]
        if kind=="frame":
            place(source_render,make_photo_layer(sprite,photo_paths[it["code"]],it["code"]),it["target"])
        place(source_render,sprite,it["target"])
    require(np.array_equal(np.asarray(preview.convert("RGB")),np.asarray(source_render.convert("RGB"))),"Rebuilt preview from final layout.json differs from source layered composition")
    qa["render_pixel_identical_from_json"] = True
    qa["frame_count"] = len(fs)
    qa["decoration_placements"] = len(ds)
    qa["subject_count"] = 1
    qa["reference_px"] = [width,height]
    qa["sheet_px"] = [sheet.width,sheet.height]
    qa["print"] = layout["print"]
    validate(out_dir)
    if qa_out:
        qa_out.mkdir(parents=True,exist_ok=True)
        (qa_out/"tinixposter_qa.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding="utf-8")
        ImageOps.contain(preview.convert("RGB"),(800,1100)).save(qa_out/"preview.jpg",quality=92)
        light=Image.new("RGBA",sheet.size,(252,252,252,255)); light.alpha_composite(sheet)
        dark=Image.new("RGBA",sheet.size,(42,48,57,255)); dark.alpha_composite(sheet)
        qa_strip=Image.new("RGB",(sheet.width*2,sheet.height),(255,255,255))
        qa_strip.paste(light.convert("RGB"),(0,0));qa_strip.paste(dark.convert("RGB"),(sheet.width,0))
        qa_strip.thumbnail((1600,1300));qa_strip.save(qa_out/"alpha_on_light_dark.jpg",quality=90)
    zip_file=out_dir.parent/(out_dir.name+".zip")
    with zipfile.ZipFile(zip_file,"w",zipfile.ZIP_DEFLATED) as z:
        for f in DELIVERY:
            z.write(out_dir/f,arcname=f)
    with zipfile.ZipFile(zip_file) as z:
        require(sorted(z.namelist())==sorted(DELIVERY) and z.testzip() is None, "Invalid export ZIP")
    print(json.dumps({"status":"PASS","zip":str(zip_file),**qa},ensure_ascii=False,indent=2))
    if review_dir is not None:  # [TINIX]
        timings = {"demoPreviewMs": demo_ms, "kitExportMs": round((perf_counter() - kit_started) * 1000)}
        if mixed_handcut:
            timings["mixedHandcutGeometry"] = qa["mixed_handcut_geometry"]
        return timings


def validate(folder: Path, qa_out: Path | None=None):
    require(folder.is_dir(),f"Kit folder does not exist: {folder}")
    for f in DELIVERY:
        require((folder/f).is_file(),f"Missing required delivery file {f}")
    layout=json.loads((folder/"layout.json").read_text(encoding="utf-8"))
    check_layout_schema(layout)
    size=(layout["reference"]["width"],layout["reference"]["height"])
    # [TINIX] Close each input immediately so repeated fixture validation releases every handle.
    for f in DELIVERY[:3]:
        with Image.open(folder/f) as image:
            require(image.size==size,f"Wrong page dimension: {f}")
    with Image.open(folder/DELIVERY[3]) as sheet:
        require(sheet.size==(layout["sheet"]["width"],layout["sheet"]["height"]),"Cut sheet size differs from layout.json")
        qa=validate_sheet(layout,sheet)
        qa.update({"frame_count":len(layout["frames"]),"decorations":len(layout["decorations"]),"page_px":size,"sheet_px":sheet.size})
    if qa_out:
        qa_out.mkdir(parents=True,exist_ok=True)
        (qa_out/"validate_qa.json").write_text(json.dumps(qa,ensure_ascii=False,indent=2),encoding="utf-8")
    return qa


def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest="command",required=True)
    ex=sub.add_parser("export",help="Render 4 PNG and TinixPoster v1 JSON from layered manifest")
    ex.add_argument("manifest",type=Path)
    ex.add_argument("--out",required=True,type=Path)
    ex.add_argument("--qa-out",type=Path)
    va=sub.add_parser("validate",help="Validate existing 4 PNG + JSON export")
    va.add_argument("kit_dir",type=Path)
    va.add_argument("--qa-out",type=Path)
    opts=p.parse_args()
    try:
        if opts.command=="export":
            export(opts.manifest,opts.out,opts.qa_out)
        else:
            print(json.dumps({"status":"PASS",**validate(opts.kit_dir,opts.qa_out)},ensure_ascii=False,indent=2))
    except (ValueError,OSError,KeyError,TypeError,AssertionError) as e:
        print(f"TinixPoster QA FAILED: {e}",file=sys.stderr)
        raise SystemExit(1)

if __name__=="__main__":
    main()
