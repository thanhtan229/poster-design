"""[TINIX] Compose reusable scrapbook assets into locked demo/kit pairs."""

from hashlib import file_digest, sha256
from io import BytesIO
from pathlib import Path
from time import perf_counter
import json
import os
import sys
import unicodedata

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from handcut_assets import (bow, grain_fill, make_frame, points_mask, tape,
                            torn_rect, with_cutline)
from seed_handcut_catalog import clean_alpha
from tinixposter_v1 import detect_window, export, require
from workflow_compositions import check_asset

SKILL_SHA256 = "be9d6da6777fd4789319abe351d1213ee560ebba2c1c27f24a376516e4f0a0fc"
FRAME_STYLES = ("torn", "polaroid", "stamp", "notebook", "ticket")
PHOTO_CODES = tuple(f"F{i:02d}" for i in range(1, 7))
ILLUSTRATIONS = (*PHOTO_CODES, "SUBJECT")
# Normalized centers, widths, heights and angles. Each arrangement reserves an area for the title.
ARRANGEMENTS = (
    ((.19,.30,.27,.28,-10),(.81,.28,.26,.28,8),(.17,.57,.25,.24,-5),(.82,.53,.25,.24,10),(.23,.81,.28,.25,7),(.79,.79,.29,.27,-8)),
    ((.23,.28,.31,.22,-6),(.54,.27,.24,.21,5),(.82,.31,.23,.24,12),(.78,.57,.28,.24,-6),(.79,.81,.29,.22,7),(.48,.79,.24,.22,-12)),
    ((.17,.33,.23,.26,7),(.21,.64,.30,.28,-10),(.43,.80,.24,.23,7),(.81,.30,.28,.23,-7),(.80,.57,.25,.24,11),(.76,.82,.32,.22,-4)),
    ((.26,.27,.33,.23,-9),(.74,.27,.29,.26,9),(.17,.50,.23,.23,5),(.81,.50,.25,.22,-9),(.32,.83,.27,.22,9),(.72,.83,.27,.24,-5)),
    ((.20,.29,.28,.22,8),(.19,.51,.27,.22,-8),(.23,.76,.32,.26,6),(.48,.81,.22,.22,8),(.81,.67,.27,.24,-10),(.80,.35,.28,.27,5)),
    ((.25,.33,.34,.30,-8),(.68,.28,.26,.22,5),(.83,.48,.23,.23,9),(.21,.63,.24,.24,10),(.34,.84,.28,.20,-6),(.78,.79,.32,.26,-8)),
)
SUBJECT_CENTERS = ((.50,.55),(.31,.57),(.50,.52),(.51,.56),(.53,.51),(.51,.59))
PALETTES = {
    "pastel": ((248,219,226),(228,217,241),(218,235,225),(244,227,207)),
    "vintage": ((233,212,182),(213,223,207),(224,203,184),(209,221,222)),
    "coastal": ((199,229,230),(214,230,247),(229,236,211),(247,223,196)),
}


def digest(path):
    with path.open("rb") as stream:
        return file_digest(stream, "sha256").hexdigest()


class Catalog:
    """Batch-scoped cache of immutable assets with explicit source roles."""

    def __init__(self, root, theme, style):
        self.root = root
        self.theme = theme
        self.style = style
        self.by_key = {}
        self.reuses = 0
        self.illustration_hashes = set()
        (root / "assets").mkdir(parents=True)

    def add(self, kind, label, variant, render, *, origin="code", source=None, cutline="none"):
        key = f"p1-v1:{self.theme}:{self.style}:{kind}:{label}:{variant}"
        if key in self.by_key:
            self.reuses += 1
            return self.by_key[key]
        asset_id = f"{kind}-{sha256(key.encode()).hexdigest()[:16]}"
        relative = f"assets/{asset_id}.png"
        image = render()
        file = self.root / relative
        image.save(file)
        fingerprint = digest(file)
        preview_only = kind == "illustration"
        if preview_only:
            self.illustration_hashes.add(fingerprint)
        else:
            require(fingerprint not in self.illustration_hashes, "Illustration cannot be a static asset")
        asset = {
            "assetId": asset_id, "file": relative, "kind": kind, "theme": self.theme,
            "style": label, "styleFamily": self.style, "sha256": fingerprint,
            "provenance": {"origin": origin, "source": source or label,
                           "license": "caller must have rights" if origin == "attachment" else "repository policy"},
            "alpha": ("closed-window" if kind == "frame" else
                      "transparent" if image.mode == "RGBA" and image.getchannel("A").getextrema()[0] == 0 else "opaque"),
            "whiteCutline": cutline, "previewOnly": preview_only,
            "reusable": not preview_only, "cacheKey": key,
        }
        self.by_key[key] = asset
        return asset


def layout_theme(brief):
    text = brief.casefold()
    if any(word in text for word in ("biển", "beach", "coastal")):
        return "coastal", "Kỷ niệm bên biển"
    if any(word in text for word in ("sinh nhật", "birthday")):
        return "pastel", "Chúc mừng sinh nhật"
    if any(word in text for word in ("cưới", "wedding")):
        return "vintage", "Ngày mình chung đôi"
    return "vintage", "Những ngày đáng nhớ"


def background(width, height, palette, index):
    image = grain_fill(width, height, 19 + index, palette[index % 4], 3.5)
    patches = ((-.06,.12,.58,.43),(.63,-.03,1.07,.53),(.47,.71,1.08,1.04),(-.08,.72,.38,1.06))
    for number, coords in enumerate(patches):
        x0, y0, x1, y1 = (v * (width if i % 2 == 0 else height) for i, v in enumerate(coords))
        mask = points_mask((width, height), torn_rect(x0, y0, x1, y1, index * 7 + number, 7, 29), 2)
        shadow = Image.new("RGBA", image.size, (95,65,55))
        shadow.putalpha(mask.point(lambda v: v // 8))
        image.alpha_composite(shadow, (0, 5))
        paper = grain_fill(width, height, number + 45, palette[(index + number + 1) % 4], 4)
        paper.putalpha(mask)
        image.alpha_composite(paper)
    return image.convert("RGB")


def paper_asset(color, seed, title=None, kind="paper"):
    width, height = ((720, 178) if title else (280, 70) if kind == "lace" else (305, 133))
    points = torn_rect(10, 10, width - 10, height - 12, seed, 4, 14)
    image = grain_fill(width, height, seed, color, 4)
    image.putalpha(points_mask(image.size, points))
    draw = ImageDraw.Draw(image)
    if kind == "lace":
        for x in range(22, width - 18, 18):
            draw.ellipse((x, 23, x+9, 37), fill=(0,0,0,0))
            draw.arc((x-7, 33, x+13, 54), 0, 180, fill=(197,160,139,255), width=2)
    if title:
        fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
        paths = ("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
                 str(fonts / "georgia.ttf"), str(fonts / "times.ttf"), str(fonts / "segoeui.ttf"))
        face = None
        for candidate in paths:
            if not Path(candidate).is_file():
                continue
            font = ImageFont.truetype(candidate, 52)
            missing = bytes(font.getmask(chr(0x10ffff)))
            if all(bytes(font.getmask(c)) != missing for c in set(title) if not c.isspace()):
                face = candidate
                break
        require(face is not None, "No available serif or UI font covers this title")
        while draw.textlength(title, font=font) > width - 64 and font.size > 14:
            font = ImageFont.truetype(face, font.size-2)
        require(draw.textlength(title, font=font) <= width - 64, "Title is too wide")
        draw.line((45, 129, width-45, 129), fill=(165,102,109,255), width=2)
        draw.text((width/2, height*.48), title, font=font, anchor="mm", fill=(96,57,71,255))
    return with_cutline(image, 4)


def flower():
    image = Image.new("RGBA", (106, 106))
    draw = ImageDraw.Draw(image)
    for x, y in ((28,12),(54,12),(15,39),(64,39),(37,59)):
        draw.ellipse((x,y,x+29,y+31), fill=(218,140,165,255))
    draw.ellipse((37,37,69,68), fill=(239,190,101,255))
    return with_cutline(image, 4)


def sample(index, colors, subject=False):
    image = Image.new("RGBA" if subject else "RGB", (380, 450), (0,0,0,0) if subject else colors[index % 4])
    draw = ImageDraw.Draw(image)
    if subject:
        draw.rounded_rectangle((90,191,288,416), 52, fill=(167,117,164,255))
        draw.ellipse((104,65,276,238), fill=(228,170,135,255))
        draw.pieslice((96,41,284,226),180,360,fill=(97,68,60,255))
        draw.ellipse((151,148,163,163), fill=(94,67,60,255))
        draw.ellipse((216,148,228,163), fill=(94,67,60,255))
    else:
        draw.ellipse((217-index*13,51+index*7,298-index*13,132+index*7), fill=(253,242,207))
        draw.polygon([(0,319),(134+index*13,167),(318,371),(380,300),(380,450),(0,450)],fill=colors[(index+1) % 4])
        draw.polygon([(0,376),(97,258),(332-index*15,365),(380,337),(380,450),(0,450)], fill=(133,158,150))
    return image


def build(output, config, *, static_only=False):  # [TINIX]
    started = perf_counter()
    require(config["skillVersion"] == "1.2.13" and config["skillSourceSha256"] == SKILL_SHA256,
            "Skill source mismatch; use the approved Studio v1.2.13 bundle")
    theme, fallback_title = layout_theme(config["brief"])
    theme = config.get("theme", theme)
    colors = PALETTES[theme]
    title = unicodedata.normalize("NFC", config.get("title", fallback_title))
    aw, ah = map(int, config["aspectRatio"].split(":"))
    require(max(aw, ah) / min(aw, ah) <= 3, "Supported aspect range is 1:3 to 3:1")
    width, height = (round(1080 * n / max(aw, ah)) for n in (aw, ah))
    count = config["demoCount"]
    require(2 <= count <= 6, "Choose 2 to 6 demos")
    catalog = Catalog(output, theme, "mixed-handcut")
    supplied = config.get("illustrations")
    if supplied:
        for i, name in enumerate(supplied):
            check_asset(output.parent, name)
            with Image.open(output.parent / name) as photo:
                rgba = photo.convert("RGBA")
                if i == 6:
                    low, high = rgba.getchannel("A").getextrema()
                    require(low == 0 and high > 0, "SUBJECT needs a genuine transparent cutout")
                    require(photo.format == "PNG", "SUBJECT illustration must be PNG")
                else:
                    require(rgba.getchannel("A").getextrema() == (255, 255), "F01–F06 illustrations must be opaque")
                photo.thumbnail((1440, 1440), Image.Resampling.LANCZOS)
                rendered = photo.convert("RGBA" if i == 6 else "RGB")
            catalog.add("illustration", ILLUSTRATIONS[i], digest(output.parent / name), lambda: rendered,
                        origin="attachment", source=ILLUSTRATIONS[i])
        require(len(catalog.illustration_hashes) == 7, "The illustration batch requires seven distinct images")
    else:
        for i, code in enumerate(ILLUSTRATIONS):
            catalog.add("illustration", code, theme, lambda: sample(i, colors, i == 6))
    illustrations = {a["style"]: a for a in catalog.by_key.values()}
    illustration_uses = 0
    reports = []

    def target(cx, cy, w, h, angle):
        return {"x": round(width*cx), "y": round(height*cy), "width": round(width*w),
                "height": round(height*h), "angle": angle}

    for index, demo in enumerate("ABCDEF"[:count]):
        prepare_started = perf_counter()
        refs = {}

        def use(asset):
            refs[asset["file"]] = asset["assetId"]
            return asset["file"]

        background_file = use(catalog.add("background", "torn-paper-collage", (width,height,index),
                                          lambda: background(width, height, colors, index)))
        frames = []
        for i, (code, pose) in enumerate(zip(PHOTO_CODES, ARRANGEMENTS[index])):
            style = FRAME_STYLES[(i+index*2) % len(FRAME_STYLES)]
            shape = catalog.add("frame", style, 1,
                                lambda: clean_alpha(make_frame(style, 256, 320, 20+FRAME_STYLES.index(style))),
                                source="Studio v1.2.13 / handcut_assets.make_frame", cutline="white")
            with Image.open(output / shape["file"]) as sprite:
                detect_window(sprite, code)
            frames.append({"code": code, "asset": use(shape), "photo": use(illustrations[code]),
                           "target": target(*pose), "z": 10+2*i})
        sx, sy = SUBJECT_CENTERS[index]
        subject = {"asset": use(illustrations["SUBJECT"]), "target": target(sx,sy,.39,.53,0),
                   "borderMm": .9, "z": 35}
        illustration_uses += 7
        decor = []

        def place_asset(asset, pose, z):
            decor.append({"code": f"D{len(decor)+1:02d}", "asset": use(asset), "target": target(*pose), "z": z})

        for i, pose in enumerate(((.30,.42,.46,.20,-17),(.72,.68,.41,.17,13),(.30,.91,.35,.13,9))):
            paper = catalog.add("paper", "torn", (index+i)%4,
                                lambda: paper_asset(colors[(index+i)%4], 41+(index+i)%4), cutline="white")
            place_asset(paper, pose, 2+i)
        lace = catalog.add("lace", "stitched", 1, lambda: paper_asset((253,239,219), 41, kind="lace"), cutline="white")
        place_asset(lace, (.50,.92,.68,.073,-5+index*2), 6)
        title_asset = catalog.add("title", "paper-label", (title,index%4),
                                  lambda: paper_asset(colors[index%4], 51+index%4, title), cutline="white")
        place_asset(title_asset, (.50,.105,.66,.15,(-3,1,-4,3,-2,2)[index]), 40)
        tape_asset = catalog.add("tape","handcut", index%2, lambda: clean_alpha(tape(green=bool(index%2))),
                                 source="Studio v1.2.13 / handcut_assets.tape", cutline="white")
        for i, (cx,cy,w,h,angle) in enumerate(ARRANGEMENTS[index][::2]):
            place_asset(tape_asset, (cx-w*.13,cy-h*.43,.10,.035,angle+5), 41+i)
        blossom = catalog.add("flower","pastel",1,flower,cutline="white")
        place_asset(blossom,(.15+index*.02,.13,.105,.10,-9+index*5),45)
        place_asset(blossom,(.86,.91,.093,.095,14-index*5),46)
        ribbon = catalog.add("sticker","bow",1,lambda: clean_alpha(bow()),
                             source="Studio v1.2.13 / handcut_assets.bow",cutline="white")
        place_asset(ribbon,(.51,.91,.16,.083,index*3-8),47)
        manifest = {
            "compositionVersion": 1, "catalogVersion": 1,
            "page": {"width":width,"height":height}, "print":{"dpi":254,"widthMm":width/10,"heightMm":height/10},
            "background": background_file, "frames":frames, "subject":subject, "decorations":decor,
            "assetRefs": refs, "illustrationHashes": {code: illustrations[code]["sha256"] for code in ILLUSTRATIONS},
        }
        static_files = {background_file, *(part["asset"] for part in frames+decor)}
        require(not static_files.intersection(i["file"] for i in illustrations.values()), "Illustration used in a static layer")
        if static_only:
            continue
        manifest_file = output / (demo+".source.json")
        manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        export_started = perf_counter()
        destination = output / demo
        timings = export(manifest_file,destination/"material",destination/"qa",placeholders=True,review_dir=destination)
        kit = destination / "material.zip"
        reports.append({"demoId":demo, "compositionMs":round((export_started-prepare_started)*1000),
                        **timings, "renderAndExportMs":round((perf_counter()-export_started)*1000),
                        "kitBytes":kit.stat().st_size, "kitSha256":digest(kit), "manifestSha256":digest(manifest_file)})

    assets = list(catalog.by_key.values())
    (output / "catalog.json").write_text(json.dumps({"version":1,"assets":assets},ensure_ascii=False,indent=2),encoding="utf-8")
    return {"scope":"batch", "aiCallsByTinixPoster":0, "upstreamAiCalls":None if supplied else 0,
            # [TINIX] The generator records proof from its own static render outputs, before MCP publishes the batch.
            "proceduralStaticSha256":sorted({a["sha256"] for a in assets
                                              if not a["previewOnly"] and a["provenance"]["origin"] == "code"}),
            "illustrationMode":"attached-preview" if supplied else "procedural-fixture",
            "newStaticAssets":sum(not a["previewOnly"] for a in assets),
            "newProceduralAssets":sum(a["provenance"]["origin"] == "code" for a in assets),
            "assetCacheHits":catalog.reuses+illustration_uses-7, "sharedIllustrations":7,
            "illustrationHashes":manifest["illustrationHashes"], "kits":reports,
            "batchMs":round((perf_counter()-started)*1000)}


if __name__ == "__main__":
    destination, settings = map(Path, sys.argv[1:3])
    config = json.loads(settings.read_text(encoding="utf-8"))
    static_only = sys.argv[3:] == ["static-proof"]
    if static_only:
        # [TINIX] Replay only code-generated pixels for old locks without a receipt.
        config.pop("illustrations", None)
    result = build(destination, config, static_only=static_only)
    (destination / "batch.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
