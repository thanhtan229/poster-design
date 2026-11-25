"""[TINIX] Build a reusable, photo-free frame catalog from Studio v1.2.13."""
import hashlib
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

from handcut_assets import make_frame
from tinixposter_v1 import pack_assets, trim_nonzero, validate_sheet


def clean_alpha(image):
    rgba = np.array(image)
    alpha = rgba[:, :, 3]
    for threshold in (24, 16, 8, 1):
        labels, count = ndimage.label(alpha >= threshold, structure=np.ones((3, 3), dtype=bool))
        if count > 1:
            largest = np.argmax(np.bincount(labels.ravel())[1:]) + 1
            rgba[(labels != 0) & (labels != largest)] = 0
    return Image.fromarray(rgba)


def build_catalog(output):
    kinds = ("torn", "polaroid", "stamp", "notebook", "ticket")
    assets = [(kind, trim_nonzero(clean_alpha(make_frame(kind, 320, 400, seed=11 + index)), kind))
              for index, kind in enumerate(kinds)]
    sheet, sources = pack_assets(assets, None, 22, 24)
    qa = validate_sheet({"frames": [{"code": kind, "source": sources[kind]} for kind in kinds],
                         "decorations": []}, sheet)
    output.mkdir(parents=True, exist_ok=True)
    source_hash = hashlib.sha256(Path(__file__).with_name("handcut_assets.py").read_bytes()).hexdigest()
    records = []
    for kind, image in assets:
        file = output / f"{kind}.png"
        image.save(file)
        records.append({
            "id": f"studio-v1.2.13-{kind}", "file": file.name, "kind": "frame", "style": kind,
            "source": "Scrapbook Story Studio v1.2.13 / handcut_assets.py",
            "generatorSha256": source_hash, "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            "width": image.width, "height": image.height,
            "enclosedWindowPixels": qa["enclosed_windows_alpha_zero"][kind],
        })
    (output / "catalog.json").write_text(json.dumps({"assets": records, "qa": qa}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -B seed_handcut_catalog.py <output-directory>")
    build_catalog(Path(sys.argv[1]))
