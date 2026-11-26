"""[TINIX] Validate and reconstruct the exact placeholder kit returned by preflight MCP."""
import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from PIL import Image, ImageChops

from tinixposter_v1 import DELIVERY, render_scene, require, validate


def verify(file: Path):
    with ZipFile(file) as archive:
        require(sorted(archive.namelist()) == sorted(DELIVERY), "Unexpected or duplicate ZIP members")
        require(sum(entry.file_size for entry in archive.infolist()) <= 64 * 1024**2, "Oversized synthetic kit")
        with TemporaryDirectory(prefix="kit-", dir=file.parent) as workspace:
            folder = Path(workspace)
            members = {}
            for name in sorted(DELIVERY):
                data = archive.read(name)  # Also verifies CRC before use.
                (folder / name).write_bytes(data)
                members[name] = hashlib.sha256(data).hexdigest()
                if name.endswith(".png"):
                    with Image.open(folder / name) as image:
                        require(image.format == "PNG", "ZIP entry is not a PNG")
                        image.verify()

            checked = validate(folder)
            layout = json.loads((folder / "layout.json").read_text(encoding="utf-8"))
            photos = {f"F{i:02d}": None for i in range(1, 7)}
            require([frame["code"] for frame in layout["frames"]] == list(photos), "Six ordered placeholders required")
            with (Image.open(folder / DELIVERY[3]) as sheet,
                  Image.open(folder / DELIVERY[1]) as background,
                  Image.open(folder / DELIVERY[0]) as reference):
                rebuilt = render_scene(layout, sheet, background, photos, None).convert("RGB")
                require(ImageChops.difference(rebuilt, reference.convert("RGB")).getbbox() is None,
                        "ZIP placeholder preview differs from layout reconstruction")
            return {"members": members, "pixelIdentical": True, "frames": checked["frame_count"], "subject": True}


if __name__ == "__main__":
    print(json.dumps(verify(Path(sys.argv[1]))))
