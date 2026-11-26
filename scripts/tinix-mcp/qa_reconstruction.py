#!/usr/bin/env python3
"""[TINIX] Fail-closed static reverse-composition QA for a filled material ZIP.

Recompose the immutable layers from 02 + 04 + layout.json and compare against
01 outside the photo windows and SUBJECT. This DOES NOT validate customer crop,
SUBJECT contour, printing, or actual GUI import.
"""
import argparse
import io
import json
from pathlib import Path
import zipfile

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

EXPECTED = {"01_anh_mau.png", "02_nen_sach.png", "03_so_do_bo_cuc.png", "04_tam_manh_RGBA.png", "layout.json"}
Image.MAX_IMAGE_PIXELS = 50_000_000


class StaticMismatch(ValueError):
    pass


def place(canvas, image, target):
    w, h = (int(round(target[key])) for key in ("width", "height"))
    if w <= 0 or h <= 0:
        raise StaticMismatch("INVALID_TARGET_SIZE")
    sprite = image.resize((w, h), Image.Resampling.LANCZOS)
    if target["angle"]:
        sprite = sprite.rotate(-float(target["angle"]), Image.Resampling.BICUBIC, expand=True)
    x, y = round(target["x"] - sprite.width / 2), round(target["y"] - sprite.height / 2)
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(canvas.width, x + sprite.width), min(canvas.height, y + sprite.height)
    if x0 < x1 and y0 < y1:
        canvas.alpha_composite(sprite.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


def read_kit(source):
    with zipfile.ZipFile(source) as z:
        infos = z.infolist()
        if len(infos) != 5 or {item.filename for item in infos} != EXPECTED:
            raise StaticMismatch("WRONG_FILE_INVENTORY")
        if any(item.file_size > 100 * 1024 * 1024 for item in infos):
            raise StaticMismatch("OVERSIZED_ENTRY")
        content = {name: z.read(name) for name in EXPECTED}
    layout = json.loads(content["layout.json"])
    def png(name):
        image = Image.open(io.BytesIO(content[name]))
        if image.format != "PNG":
            raise StaticMismatch("NOT_PNG:" + name)
        image.load()
        return image.convert("RGBA")
    return layout, *(png(name) for name in ("01_anh_mau.png", "02_nen_sach.png", "03_so_do_bo_cuc.png", "04_tam_manh_RGBA.png"))


def verify(source, evidence_dir=None, max_mae=4.0, max_bad_fraction=.05):
    layout, rendered, background, diagram, sheet = read_kit(source)
    if rendered.size != background.size or rendered.size != diagram.size:
        raise StaticMismatch("PAGE_DIMENSIONS_DIFFER")
    if (layout["reference"]["width"], layout["reference"]["height"]) != rendered.size:
        raise StaticMismatch("REFERENCE_SIZE_MISMATCH")
    if (layout["sheet"]["width"], layout["sheet"]["height"]) != sheet.size:
        raise StaticMismatch("SHEET_SIZE_MISMATCH")
    if [item["code"] for item in layout["frames"]] != [f"F{i:02d}" for i in range(1, 7)]:
        raise StaticMismatch("FRAME_CODES_MISSING")
    pieces = layout["frames"] + layout["decorations"]
    zs = [item["z"] for item in pieces] + [layout["subjectZ"]]
    if len(set(zs)) != len(zs):
        raise StaticMismatch("DUPLICATE_Z")
    # [TINIX] The browser normalizes reference images over white before compositing.
    static = Image.new("RGBA", background.size, "white")
    static.alpha_composite(background)
    unknown = Image.new("RGBA", background.size, (0, 0, 0, 0))
    for part in sorted(pieces, key=lambda item: item["z"]):
        r = part["source"]
        if any(int(r[key]) != r[key] for key in ("x", "y", "width", "height")):
            raise StaticMismatch("FRACTIONAL_SOURCE")
        box = (r["x"], r["y"], r["x"] + r["width"], r["y"] + r["height"])
        if box[0] < 0 or box[1] < 0 or box[2] > sheet.width or box[3] > sheet.height:
            raise StaticMismatch("SOURCE_OUT_OF_BOUNDS")
        sprite = sheet.crop(box)
        place(static, sprite, part["target"])
        if part["code"].startswith("F"):
            alpha = np.asarray(sprite.getchannel("A")) > 0
            holes = ndi.binary_fill_holes(alpha) & ~alpha
            labels, n = ndi.label(holes, structure=np.ones((3, 3), bool))
            large = [i for i in range(1, n+1) if np.count_nonzero(labels == i) > max(500, .055 * alpha.size)]
            if len(large) != 1:
                raise StaticMismatch("FRAME_WINDOW_INVALID:" + part["code"])
            mask = ndi.binary_dilation(labels == large[0], iterations=4)
            cover = Image.new("RGBA", sprite.size, (255, 255, 255, 0))
            cover.putalpha(Image.fromarray(np.uint8(mask) * 255))
            place(unknown, cover, part["target"])
    subject = layout["subject"]["target"]
    w, h = int(round(subject["width"])), int(round(subject["height"]))
    if w <= 0 or h <= 0:
        raise StaticMismatch("INVALID_SUBJECT")
    place(unknown, Image.new("RGBA", (w + 16, h + 16), (255,255,255,255)),
          {**subject, "width": w + 16, "height": h + 16})
    valid = np.asarray(unknown.getchannel("A")) == 0
    coverage = float(np.mean(valid))
    if coverage < .12:
        raise StaticMismatch("INSUFFICIENT_STATIC_COVERAGE")
    lhs = np.asarray(rendered.convert("RGB"), dtype=np.float32)
    rhs = np.asarray(static.convert("RGB"), dtype=np.float32)
    delta = np.abs(lhs - rhs).mean(axis=2)
    samples = delta[valid]
    mae = float(samples.mean())
    bad_fraction = float(np.mean(samples > 30))
    report = {
        "status": "pass" if mae <= max_mae and bad_fraction <= max_bad_fraction else "fail",
        "testedPixels": int(valid.sum()), "staticCoverage": round(coverage,5),
        "staticMae255": round(mae,4), "staticP95": round(float(np.percentile(samples,95)),4),
        "staticP99": round(float(np.percentile(samples,99)),4),
        "badFractionAbove30": round(bad_fraction,5),
        "thresholds": {"maxStaticMae255": max_mae, "maxBadFractionAbove30": max_bad_fraction},
        "scope": "background, frame borders and decorations outside photo windows and SUBJECT",
        "photoCropPixelsChecked": False, "subjectEdgeChecked": False, "guiImportVerified": False,
    }
    if evidence_dir is not None:
        folder = Path(evidence_dir)
        folder.mkdir(parents=True, exist_ok=True)
        static.save(folder / "static_reconstructed.png")
        Image.fromarray(np.uint8(valid) * 255, "L").save(folder / "known_static_mask.png")
        intensity = np.uint8(np.clip(delta * 6,0,255))
        Image.fromarray(np.where(valid,intensity,0).astype("uint8"), "L").save(folder / "static_diff.png")
        (folder / "reconstruction_qa.json").write_text(json.dumps(report,indent=2),encoding="utf8")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kit", required=True)
    parser.add_argument("--qa-out", required=True)
    parser.add_argument("--max-mae", type=float, default=4.0)
    parser.add_argument("--max-bad-fraction", type=float, default=.05)
    args = parser.parse_args()
    try:
        report = verify(args.kit,args.qa_out,args.max_mae,args.max_bad_fraction)
        print(json.dumps(report))
        if report["status"] != "pass":
            raise SystemExit(2)
    except (StaticMismatch, OSError, ValueError, KeyError, zipfile.BadZipFile) as exc:
        print(json.dumps({"status": "fail", "reason": str(exc)}))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
