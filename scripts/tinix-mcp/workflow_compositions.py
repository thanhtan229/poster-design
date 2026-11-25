"""[TINIX] Prepare three layered candidates using the Studio v1.2.13 exporter."""
import json
import math
import sys
from pathlib import Path, PurePosixPath, PureWindowsPath
from zipfile import ZipFile

from PIL import Image
from tinixposter_v1 import export, require

Image.MAX_IMAGE_PIXELS = 32_000_000
MAX_UNPACKED = 192 * 1024**2
DEMO_IDS = ("A", "B", "C")


def unpack(archive, directory):
    with ZipFile(archive) as source:
        entries = [entry for entry in source.infolist() if not entry.is_dir()]
        require(3 <= len(entries) <= 240 and sum(e.file_size for e in entries) <= MAX_UNPACKED,
                "Composition ZIP is too large or has too many files")
        names = set()
        for entry in entries:
            original = entry.orig_filename
            name = PurePosixPath(original)
            require(not name.is_absolute() and not any(p in ("", ".", "..") for p in name.parts)
                    and "\\" not in original and ":" not in original and original.isprintable()
                    and not any(p.rstrip(". ") != p or PureWindowsPath(p).is_reserved() for p in name.parts)
                    and name.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".json")
                    and name.as_posix().casefold() not in names, "Invalid composition ZIP entry")
            names.add(name.as_posix().casefold())
            target = directory.joinpath(*name.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as file:
                file.write(source.read(entry))


def check_asset(directory, name):
    require(isinstance(name, str), "Invalid asset reference")
    asset = (directory / name).resolve()
    require(asset.is_relative_to(directory) and asset.is_file(), "Asset must be in the composition ZIP")
    with Image.open(asset) as image:
        require(image.format in ("PNG", "JPEG", "WEBP") and image.width * image.height <= Image.MAX_IMAGE_PIXELS
                and getattr(image, "n_frames", 1) == 1, "Invalid asset image")
    return str(asset.relative_to(directory))


def prepare(archive, directory, demo_count=None, aspect=None):
    directory = directory.resolve()
    unpack(archive, directory)
    template = demo_count is not None
    require(not template or 2 <= demo_count <= 6, "Choose 2 to 6 demos")
    for demo in ("ABCDEF"[:demo_count] if template else DEMO_IDS):
        manifest_file = directory / f"{demo}.json"
        manifest = json.loads(manifest_file.read_text(encoding="utf-8-sig"))
        page = manifest["page"]
        require(all(type(page[key]) is int and 128 <= page[key] <= 4500 for key in ("width", "height"))
                and page["width"] * page["height"] <= 16_000_000, "Invalid composition canvas")
        if aspect:
            aw, ah = map(int, aspect.split(":"))
            require(abs((page["width"] / page["height"]) / (aw / ah) - 1) <= .003, "Composition aspect ratio differs from request")
        require([it["code"] for it in manifest["frames"]] == [f"F{i:02d}" for i in range(1, 7)],
                "Exactly six ordered frames F01–F06 are required")
        require(len(manifest.get("decorations", [])) <= 80, "Too many decorations")
        manifest["background"] = check_asset(directory, manifest["background"])
        for layer in manifest["frames"] + manifest.get("decorations", []):
            layer["asset"] = check_asset(directory, layer["asset"])
        for i, frame in enumerate(manifest["frames"], 1):
            frame["photo"] = check_asset(directory, frame["photo"]) if template else f"../photo-{i}"
        subject = manifest["subject"]
        subject["asset"] = check_asset(directory, subject["asset"]) if template else "../subject.png"
        # Packing repair is confined to the source sheet. The visible layout is unchanged.
        sheet = manifest.setdefault("sheet", {})
        for key, default in (("gap", 22), ("margin", 24)):
            sheet[key] = max(12, int(sheet.get(key, default)))
        if "width" in sheet:
            require(type(sheet["width"]) is int and 128 <= sheet["width"] <= 6000, "Invalid sheet width")
        for layer in manifest["frames"] + manifest.get("decorations", []) + [manifest["subject"]]:
            for key, n in layer["target"].items():
                require(type(n) in (int, float) and math.isfinite(n) and abs(n) <= 9000, f"Invalid target {key}")
            require(layer["target"]["width"] * layer["target"]["height"] <= 16_000_000, "Target is too large")
        locked = directory / f"{demo}.source.json"
        with locked.open("x", encoding="utf-8") as file:
            json.dump(manifest, file, ensure_ascii=False)
        if template:
            export(locked, directory / demo, preview_only=True)
        else:
            export(locked, directory / demo / "material", directory / demo / "qa")


def revise(directory, demo, variant, repairs_file, placeholders=False):
    original = json.loads((directory / f"{demo}.source.json").read_text(encoding="utf-8"))
    repairs = json.loads(repairs_file.read_text(encoding="utf-8"))
    layers = {it["code"]: it for it in original["frames"] + original.get("decorations", [])}
    require(0 < len(repairs) <= 4 and len({it["code"] for it in repairs}) == len(repairs), "Invalid layer repairs")
    for repair in repairs:
        layer = layers[repair["code"]]
        require(set(repair) == {"code", "dx", "dy"}, "Only local position repairs are allowed")
        for key, offset in (("x", repair["dx"]), ("y", repair["dy"])):
            require(type(offset) in (int, float) and math.isfinite(offset) and abs(offset) <= 12,
                    "Layer repair movement must be within 12 px")
            layer["target"][key] += offset
    manifest = directory / f"{variant}.source.json"
    with manifest.open("x", encoding="utf-8") as file:
        json.dump(original, file, ensure_ascii=False)
    if placeholders:
        export(manifest, directory / variant / "material", directory / variant / "qa", placeholders=True)
    else:
        export(manifest, directory / variant / "material", directory / variant / "qa")


if __name__ == "__main__":
    if sys.argv[1] == "prepare":
        prepare(Path(sys.argv[2]), Path(sys.argv[3]))
    elif sys.argv[1] == "prepare-template":
        prepare(Path(sys.argv[2]), Path(sys.argv[3]), int(sys.argv[4]), sys.argv[5] if len(sys.argv) > 5 else None)
    elif sys.argv[1] == "export-template":
        directory, demo = Path(sys.argv[2]), sys.argv[3]
        export(directory / f"{demo}.source.json", directory / demo / "material",
               directory / demo / "qa", placeholders=True)
    elif sys.argv[1] == "revise":
        revise(Path(sys.argv[2]), sys.argv[3], sys.argv[4], Path(sys.argv[5]), len(sys.argv) > 6)
    else:
        raise ValueError("Invalid workflow command")
