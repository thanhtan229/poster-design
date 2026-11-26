#!/usr/bin/env python3
"""[TINIX] Repackage an existing layered material kit with the actual stored filled render.

This is a compatibility export. It does NOT claim pixel-exact regeneration of
the browser's hidden layers. The static source kit must have passed import QA.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import zipfile
from PIL import Image

REQUIRED = (
    "01_anh_mau.png", "02_nen_sach.png", "03_so_do_bo_cuc.png",
    "04_tam_manh_RGBA.png", "layout.json",
)
CODES = {f"F{i:02d}" for i in range(1, 7)}


class ExportBlocked(Exception):
    pass


def png(blob):
    im = Image.open(io.BytesIO(blob))
    im.load()
    if im.format != "PNG":
        raise ExportBlocked("NOT_PNG")
    return im


def encode(im):
    out = io.BytesIO()
    im.save(out, format="PNG", optimize=True)
    return out.getvalue()


def validate_structure(kit, reference_size):
    if kit.get("version") != 1 or not isinstance(kit.get("frames"), list):
        raise ExportBlocked("INVALID_LAYOUT_VERSION")
    frames = kit["frames"]
    if {f.get("code") for f in frames} != CODES or len(frames) != 6:
        raise ExportBlocked("FRAME_CODES_INCOMPLETE")
    decors = kit.get("decorations")
    if not isinstance(decors, list):
        raise ExportBlocked("DECORATIONS_MISSING")
    zvals = [f.get("z") for f in frames] + [d.get("z") for d in decors] + [kit.get("subjectZ")]
    if not all(isinstance(z, int) and not isinstance(z, bool) for z in zvals) or len(zvals) != len(set(zvals)):
        raise ExportBlocked("DUPLICATE_OR_INVALID_Z")
    for group in (frames, decors):
        for piece in group:
            source, target = piece.get("source", {}), piece.get("target", {})
            if not all(isinstance(source.get(k), (float, int)) and source[k] >= 0 for k in ("x", "y", "width", "height")):
                raise ExportBlocked("INVALID_SOURCE_BOX")
            if source["width"] <= 0 or source["height"] <= 0:
                raise ExportBlocked("INVALID_SOURCE_BOX")
            if not all(isinstance(target.get(k), (float, int)) for k in ("x", "y", "width", "height", "angle")):
                raise ExportBlocked("INVALID_TARGET")
    subject = kit.get("subject", {}).get("target", {})
    if not all(isinstance(subject.get(k), (float, int)) for k in ("x", "y", "width", "height", "angle")):
        raise ExportBlocked("INVALID_SUBJECT")
    ref = kit.get("reference", {})
    if (ref.get("width"), ref.get("height")) != tuple(reference_size):
        raise ExportBlocked("SOURCE_REFERENCE_SIZE_MISMATCH")


def convert(source_zip, filled_png, dest_zip, report_path):
    source_zip, filled_png, dest_zip = map(Path, (source_zip, filled_png, dest_zip))
    with zipfile.ZipFile(source_zip, "r") as src:
        names = src.namelist()
        if sorted(names) != sorted(REQUIRED) or len(names) != 5:
            raise ExportBlocked("SOURCE_KIT_MUST_HAVE_EXACTLY_FIVE_ROOT_FILES")
        parts = {name: src.read(name) for name in REQUIRED}
    layout = json.loads(parts["layout.json"])
    base_ref = png(parts["01_anh_mau.png"])
    base_size = base_ref.size
    validate_structure(layout, base_size)
    background = png(parts["02_nen_sach.png"])
    diagram = png(parts["03_so_do_bo_cuc.png"])
    sheet = png(parts["04_tam_manh_RGBA.png"])
    actual = png(filled_png.read_bytes())
    if background.size != base_size or diagram.size != base_size:
        raise ExportBlocked("STATIC_LAYER_CANVAS_MISMATCH")
    if actual.mode not in ("RGB", "RGBA"):
        raise ExportBlocked("INVALID_RENDER_MODE")
    w0, h0 = base_size
    w, h = actual.size
    sx, sy = w / w0, h / h0
    if not (0.95 <= sx <= 1.05 and 0.95 <= sy <= 1.05):
        raise ExportBlocked("CANVAS_SCALE_TOO_LARGE")
    if abs(sx / sy - 1) > 0.001:
        raise ExportBlocked("CANVAS_ASPECT_CHANGED")
    if layout.get("sheet", {}).get("width") != sheet.width or layout.get("sheet", {}).get("height") != sheet.height:
        raise ExportBlocked("SHEET_SIZE_MISMATCH")
    for piece in layout["frames"] + layout["decorations"]:
        box = piece["source"]
        if box["x"] + box["width"] > sheet.width or box["y"] + box["height"] > sheet.height:
            raise ExportBlocked("SOURCE_BOX_OUT_OF_BOUNDS")
    outputs = dict(parts)
    outputs["01_anh_mau.png"] = filled_png.read_bytes()
    if actual.size != base_size:
        outputs["02_nen_sach.png"] = encode(background.resize(actual.size, Image.Resampling.LANCZOS))
        outputs["03_so_do_bo_cuc.png"] = encode(diagram.resize(actual.size, Image.Resampling.LANCZOS))
        for piece in layout["frames"] + layout["decorations"]:
            target = piece["target"]
            for key, scale in (("x", sx), ("width", sx), ("y", sy), ("height", sy)):
                target[key] = round(target[key] * scale, 4)
        target = layout["subject"]["target"]
        for key, scale in (("x", sx), ("width", sx), ("y", sy), ("height", sy)):
            target[key] = round(target[key] * scale, 4)
    layout["reference"]["width"], layout["reference"]["height"] = w, h
    print_data = layout.get("print", {})
    mmx, mmy = print_data.get("widthMm"), print_data.get("heightMm")
    if not all(isinstance(k, (int, float)) and k > 0 for k in (mmx, mmy)):
        raise ExportBlocked("PRINT_MM_MISSING")
    ppi_x, ppi_y = w * 25.4 / mmx, h * 25.4 / mmy
    if abs(ppi_x - ppi_y) / max(ppi_x, ppi_y) > .01:
        raise ExportBlocked("PRINT_RATIO_MISMATCH")
    print_data["dpi"] = round((ppi_x + ppi_y) / 2)
    outputs["layout.json"] = (json.dumps(layout, ensure_ascii=False, indent=2) + "\n").encode("utf8")
    # The source sprite sheet and its alpha are unchanged byte for byte.
    assert outputs["04_tam_manh_RGBA.png"] == parts["04_tam_manh_RGBA.png"]
    for name in REQUIRED[:3]:
        if png(outputs[name]).size != actual.size:
            raise ExportBlocked("OUTPUT_PAGE_SIZE_MISMATCH")
    dest_zip.parent.mkdir(parents=True, exist_ok=True)
    # Atomic, deterministic, retry-safe artifact. A rerun cannot leave a partial ZIP.
    temporary = dest_zip.with_suffix(".part.zip")
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3) as dst:
            for name in REQUIRED:
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                dst.writestr(info, outputs[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=3)
        os.replace(temporary, dest_zip)
    finally:
        if temporary.exists():
            temporary.unlink()
    checksums = {name: hashlib.sha256(outputs[name]).hexdigest() for name in REQUIRED}
    report = {
        "status": "exported_requires_import_qa",
        "sourceSize": {"width": w0, "height": h0},
        "renderSize": {"width": w, "height": h},
        "scale": {"x": sx, "y": sy},
        "frames": len(layout["frames"]), "decorations": len(layout["decorations"]),
        "sheetAlphaBytePreserved": True,
        "qa": {
            "structure": "passed", "dimension": "passed",
            "alpha": "preserved_from_source_not_revalidated",
            "sourceReconstruction": "not_verified",
            "guiImport": "not_verified",
        },
        "files": checksums,
        "zipSha256": hashlib.sha256(dest_zip.read_bytes()).hexdigest(),
    }
    Path(report_path).write_text(json.dumps(report, indent=2), encoding="utf8")
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--render", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--report", required=True)
    args = ap.parse_args()
    try:
        report = convert(args.source, args.render, args.output, args.report)
        print(json.dumps(report))
    except (ExportBlocked, ValueError, KeyError, OSError, zipfile.BadZipFile) as exc:
        print(json.dumps({"status": "blocked", "reason": str(exc)}))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
