"""[TINIX] Inspect packed source art and verify per-slot masks before library delivery."""

from collections import defaultdict
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import json
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from mixed_handcut_qa import inspect_geometry  # [TINIX]
from tinixposter_v1 import (DELIVERY, check_layout_schema, checkerboard, export,
                            load_asset, make_photo_layer, place, prep_subject,
                            render_scene, validate_sheet)

CODES = [f"F{i:02d}" for i in range(1, 7)]
COLORS = ("#ea326e", "#3056e4", "#00aa79", "#f0b511", "#7829b8", "#f36814", "#06a6ca")
MAX_MATCH_EDGE = 1800  # [TINIX] Bound matching cost without silently passing unscanned large layers.
Image.MAX_IMAGE_PIXELS = 32_000_000


def local_asset(root, name):
    file = (root / name).resolve()
    if not file.is_relative_to(root) or not file.is_file():
        raise ValueError("Source asset must be inside the composition")
    return file


def digest(data):
    return sha256(data).hexdigest()


def alpha_at(sprite, target, size):
    page = Image.new("RGBA", size)
    place(page, sprite, target)
    return np.asarray(page.getchannel("A"))


def sentinel_check(background, sheet, layout, subject, destination):
    """Project the true alpha in z order and verify the region affected by each sentinel."""
    size = background.size
    stages = []
    for group in ("frames", "decorations"):
        for layer in layout[group]:
            s = layer["source"]
            tile = sheet.crop((s["x"], s["y"], s["x"]+s["width"], s["y"]+s["height"]))
            if group == "frames":
                stages.append((layer["z"], layer["code"], tile, layer["target"]))
            stages.append((layer["z"], None, tile, layer["target"]))
    stages.append((layout["subjectZ"], "SUBJECT", subject, layout["subject"]["target"]))
    stages.sort(key=lambda row: row[0])
    blank = render_scene(layout, sheet, background, None, None)
    blank.convert("RGB").save(destination / "blank.png")
    signal = dict(zip((*CODES, "SUBJECT"), COLORS))
    commands = []
    for _, code, tile, target in stages:
        if code == "SUBJECT":
            shape = Image.new("RGBA", tile.size, signal[code])
            shape.putalpha(tile.getchannel("A"))
        elif code:
            shape = make_photo_layer(tile, Image.new("RGB",(30,30),signal[code]), code)
        else:
            shape = tile
        commands.append((code, shape, target))

    def render(skip=None):
        output = background.convert("RGBA")
        for code, sprite, target in commands:
            if skip is None or code != skip:
                place(output, sprite, target)
        return output

    all_sentinels = render()
    all_sentinels.convert("RGB").save(destination / "sentinel.png")
    full = np.asarray(all_sentinels)
    overlay = Image.new("RGBA", size)
    results = {}
    # Topmost opaque layers remove influence below them. Fractional alpha retains influence.
    coverage = np.ones(size[::-1], dtype=bool)
    for code, sprite, target in reversed(commands):
        opacity = alpha_at(sprite, target, size)
        if code:
            permitted = (opacity != 0) & coverage
            changed = np.any(full != np.asarray(render(code)), axis=2)
            invalid = changed & ~permitted
            results[code] = {"onPageMaskPx": int(np.count_nonzero(opacity)),
                             "visibleMaskPx": int(np.sum(permitted)),
                             "changedPx": int(np.sum(changed)), "outsideMaskPx": int(np.sum(invalid))}
            if np.any(invalid):
                red = Image.new("RGBA", size, "#f22130")
                red.putalpha(Image.fromarray(invalid.astype(np.uint8)*210))
                overlay.alpha_composite(red)
        coverage &= opacity < 255
    return results, overlay


def reference_tiles(illustrations):
    """Use distinctive exact RGB snippets as positive evidence, never as proof of absence."""
    tiles = []
    for code, photo in illustrations.items():
        rgb = np.asarray(photo.convert("RGB"))
        for y in (.25,.50,.70):
            for x in (.28,.52,.74):
                top, left = int(rgb.shape[0]*y)-12, int(rgb.shape[1]*x)-12
                block = rgb[max(0,top):top+24, max(0,left):left+24]
                if block.shape != (24,24,3):
                    continue
                colors = np.unique(block.reshape(-1,3), axis=0)
                if len(colors) >= 35:
                    tiles.append((code, np.ascontiguousarray(block)))
    return tiles


def locate_reference(sprite, tiles):
    if sprite.width < 24 or sprite.height < 24 or max(sprite.size) > MAX_MATCH_EDGE:
        return None
    rgba = np.asarray(sprite.convert("RGBA"))
    rgb = np.ascontiguousarray(rgba[:,:,:3])
    small = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    for code, template in tiles:
        mono = cv2.cvtColor(template, cv2.COLOR_RGB2GRAY)
        _, score, _, xy = cv2.minMaxLoc(cv2.matchTemplate(small,mono,cv2.TM_CCOEFF_NORMED))
        x,y = xy
        if score >= .99999 and np.array_equal(template,rgb[y:y+24,x:x+24]) and np.all(rgba[y:y+24,x:x+24,3] > 0):
            return {"illustration":code, "x":x, "y":y, "width":24, "height":24}
    return None


def inspect(source, kit, destination, trusted, procedural=frozenset()):  # [TINIX]
    source = source.resolve()
    manifest = json.loads(source.read_text(encoding="utf-8"))
    destination.mkdir(parents=True, exist_ok=False)
    root = source.parent
    issues = []
    layers = []

    def issue(code, status, reason, **details):
        issues.append({"layer":code, "status":status, "reason":reason, **details})

    sources = {"BACKGROUND": {"asset":manifest["background"]},
               **{it["code"]:it for it in manifest["frames"]+manifest.get("decorations",[])}}
    photo_paths = {f["code"]:local_asset(root,f["photo"]) for f in manifest["frames"]}
    photo_paths["SUBJECT"] = local_asset(root,manifest["subject"]["asset"])
    photo_hashes = {digest(f.read_bytes()) for f in photo_paths.values()}
    photos = {code: Image.open(p).convert("RGBA") for code,p in photo_paths.items()}
    tiles = reference_tiles(photos)
    inspected = {}
    suspects = []
    for code, layer in sources.items():
        file = local_asset(root, layer["asset"])
        fingerprint = digest(file.read_bytes())
        known_source = fingerprint in trusted  # [TINIX] Provenance is independent of visible content.
        clean_generation = known_source and fingerprint in procedural
        scan = "not_run"
        status = "pass"
        if fingerprint in photo_hashes:
            status = "fail"
            issue(code,status,"illustration_used_as_static_source")
        else:
            cache_key = (fingerprint, code == "BACKGROUND", json.dumps(layer.get("crop"), sort_keys=True))
            try:
                if cache_key not in inspected:
                    # [TINIX] The exporter drops background alpha. Scan the RGB it actually puts on the page.
                    sprite = (Image.open(file).convert("RGB") if code == "BACKGROUND" else load_asset(layer,root,code))
                    coverage = ("size_limit" if max(sprite.size) > MAX_MATCH_EDGE else
                                "insufficient_reference_tiles" if not tiles else
                                "below_tile_size" if min(sprite.size) < 24 else "scanned")
                    match = locate_reference(sprite, tiles) if coverage == "scanned" else None
                    inspected[cache_key] = (sprite.size, coverage, match)
                sprite_size, scan, match = inspected[cache_key]
            except (ValueError, OSError):
                issue(code,"fail","invalid_static_alpha_or_image")
                layers.append({"layer":code,"sha256":fingerprint,"status":"fail",
                               "provenanceVerified":known_source,"referenceScan":scan})
                continue
            if match:
                status = "fail"
                issue(code,status,"exact_illustration_fragment", match=match, provenanceVerified=known_source)
                suspects.append((sprite_size, layer.get("target"), match))
            elif not known_source:
                status = "uncertain"
                issue(code,status,"static_asset_without_verified_provenance")
            elif scan == "size_limit":
                status = "uncertain"
                issue(code,status,"static_reference_scan_size_limit")
            elif scan != "scanned" and not clean_generation:  # [TINIX] A lock alone never substitutes for a missing scan.
                status = "uncertain"
                issue(code,status,"static_reference_scan_incomplete",coverage=scan)
        layers.append({"layer":code,"sha256":fingerprint,"status":status,
                       "provenanceVerified":known_source,"referenceScan":scan,
                       "proceduralGenerationVerified":clean_generation})

    subject = photos["SUBJECT"]
    low, high = subject.getchannel("A").getextrema()
    if low != 0 or high == 0:
        issue("SUBJECT","fail","subject_alpha_missing")
    else:
        body = subject.getchannel("A").getbbox()
        occupancy = np.count_nonzero(np.asarray(subject.getchannel("A")) >= 128) / ((body[2]-body[0])*(body[3]-body[1]))
        if occupancy >= .95:
            issue("SUBJECT","uncertain","subject_alpha_nearly_rectangular")
        if manifest["subject"].get("borderMm", 0) <= 0:
            issue("SUBJECT","uncertain","subject_white_cutline_missing")
    if str(manifest.get("guide",{}).get("sourceType","")).casefold() == "ai_flat_image":
        issue("BACKGROUND","uncertain","flattened_ai_source_cannot_prove_clean")

    geometry = None
    try:
        if kit is None:
            export(source,destination/"material",destination/"export-qa",placeholders=True,review_dir=destination)
            kit = destination / "material.zip"
        with ZipFile(kit) as archive:
            if sorted(archive.namelist()) != sorted(DELIVERY) or archive.testzip() is not None:
                raise ValueError("Invalid five-file material ZIP")
            layout = json.loads(archive.read("layout.json"))
            check_layout_schema(layout)
            background = Image.open(BytesIO(archive.read(DELIVERY[1]))).convert("RGB")
            sheet = Image.open(BytesIO(archive.read(DELIVERY[3]))).copy()
        if not np.array_equal(background,np.asarray(Image.open(local_asset(root,manifest["background"])).convert("RGB"))):
            issue("BACKGROUND","fail","kit_background_differs_from_source")
        structural = validate_sheet(layout,sheet)
        if manifest.get("mixedHandcutGeometryVersion") == 1:  # [TINIX] Separate geometry from contamination QA.
            geometry = inspect_geometry(
                layout, sheet, require_notebook=manifest.get("mixedHandcutRequireNotebook", True))  # [TINIX]
        if [x["code"] for x in layout["frames"]] != CODES:
            issue("FRAMES","fail","expected_six_frames")
        declared = manifest["frames"]+manifest.get("decorations",[])
        if [x["code"] for x in declared] != [x["code"] for x in layout["frames"]+layout["decorations"]]:
            issue("KIT","fail","kit_layer_inventory_differs_from_source")
        for entry in layout["frames"]+layout["decorations"]:
            code, box = entry["code"], entry["source"]
            tile = sheet.crop((box["x"],box["y"],box["x"]+box["width"],box["y"]+box["height"]))
            original = sources.get(code)
            if (original is None or original["target"] != entry["target"] or original["z"] != entry["z"]
                    or not np.array_equal(tile,load_asset(original,root,code))):
                issue(code,"fail","kit_sprite_or_placement_differs_from_source")
                continue
            alpha = np.asarray(tile.getchannel("A"))
            edge = (alpha > 160) & ~ndimage.binary_erosion(alpha > 160)
            rgb = np.asarray(tile)[:,:,:3]
            near_white = (rgb.min(axis=2) >= 232) & ((rgb.max(axis=2)-rgb.min(axis=2)) <= 25)
            if not np.any(edge & near_white):
                issue(code,"uncertain","white_cutline_not_confirmed")
        if (layout["subject"]["target"] != manifest["subject"]["target"]
            or layout["subjectZ"] != manifest["subject"]["z"]
            or layout["subject"].get("borderMm",0) != manifest["subject"].get("borderMm",.9)):
            issue("SUBJECT","fail","kit_subject_placement_differs_from_source")
        fitted = prep_subject(subject,layout["subject"]["target"],layout["subject"].get("borderMm",0),layout["print"]["dpi"])
        sentinel, overlay = sentinel_check(background,sheet,layout,fitted,destination)
        check_subject = checkerboard(*fitted.size).convert("RGBA")
        check_subject.putalpha(fitted.getchannel("A"))
        check = checkerboard(180, 180)
        render_scene(layout,sheet,background,dict.fromkeys(CODES,check),check_subject).convert("RGB").save(destination/"checker.png")
        for code, marks in sentinel.items():
            if marks["outsideMaskPx"]:
                issue(code,"fail","sentinel_outside_visible_mask")
            elif not marks["changedPx"]:
                issue(code,"uncertain","slot_not_visible")
            elif code == "SUBJECT" and marks["visibleMaskPx"] < .45 * marks["onPageMaskPx"]:
                issue(code,"uncertain","subject_mostly_occluded")
        for size,target,box in suspects:
            mark = Image.new("RGBA",size)
            draw = ImageDraw.Draw(mark)
            x,y,w,h = [box[k] for k in ("x","y","width","height")]
            draw.rectangle((x,y,x+w,y+h),outline="#f22130",width=4)
            if target:
                place(overlay,mark,target)
            else:
                overlay.alpha_composite(mark)
        view = Image.open(destination / "blank.png").convert("RGBA")
        view.alpha_composite(overlay)
        view.convert("RGB").save(destination/"suspects.png")
    except (ValueError, KeyError, OSError) as error:
        structural = sentinel = {}
        issue("KIT","fail","structural_validation_failed",detail=str(error).split(":")[0][:120])
    statuses = {i["status"] for i in issues}
    report = {"version":1,"status":"fail" if "fail" in statuses else "uncertain" if statuses else "pass",
              "manifestSha256":digest(source.read_bytes()),"kitSha256":digest(kit.read_bytes()) if kit else None,
              "layers":layers,"issues":issues,"sentinels":sentinel,"structural":structural,
              "visualReviewRequired":["text", "lace", "shadows", "subject_edges_and_occlusion", "stored_render"]}
    if manifest.get("mixedHandcutGeometryVersion") == 1:  # [TINIX]
        report["mixedHandcutGeometry"] = geometry or {"status":"fail", "visualReviewRequired":True}
    (destination/"source-qa.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    return report


if __name__ == "__main__":
    if sys.argv[1] == "export":
        source, folder = map(Path,sys.argv[2:])
        export(source,folder/"material",folder/"qa",placeholders=True,review_dir=folder)
        sys.exit(0)
    source, kit, destination, trust_file = sys.argv[1:]
    proof = json.loads(Path(trust_file).read_text(encoding="utf-8"))  # [TINIX]
    trusted = set(proof if isinstance(proof,list) else proof["trusted"])
    procedural = set() if isinstance(proof,list) else set(proof["procedural"])
    inspect(Path(source),Path(kit) if kit else None,Path(destination),trusted,procedural)
