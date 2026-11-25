"""Regression tests for compatibility export. No customer images or live server."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from PIL import Image

ROOT = Path(__file__).parent
spec = importlib.util.spec_from_file_location("tinix_export", ROOT / "export_filled_material.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def img(size, color, mode="RGBA"):
    image = Image.new(mode, size, color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def kit_manifest():
    def piece(code, z, x=10):
        return {"code": code,
            "source": {"x": x, "y": 10, "width": 20, "height": 20},
            "target": {"x": 100, "y": 100, "width": 20, "height": 20, "angle": 0}, "z": z}
    return {
        "version": 1, "sheet": {"file": "04_tam_manh_RGBA.png", "width": 800, "height": 800},
        "reference": {"file": "01_anh_mau.png", "width": 1500, "height": 1500},
        "print": {"widthMm": 200, "heightMm": 200, "dpi": 191},
        "frames": [piece(f"F{i:02}", i, x=10+i*25) for i in range(1, 7)],
        "subjectZ": 7,
        "subject": {"target": {"x": 500, "y": 800, "width": 300, "height": 500, "angle": 0}, "borderMm": 0.9},
        "decorations": [piece("D01", 8, x=240)],
    }


class ExportTest(unittest.TestCase):
    def make_fixture(self, folder, manifest=None, render_size=(1504, 1504)):
        source = folder / "source.zip"
        manifest = manifest or kit_manifest()
        entries = {
            "01_anh_mau.png": img((1500, 1500), "#eeeeee"),
            "02_nen_sach.png": img((1500, 1500), "#dddddd"),
            "03_so_do_bo_cuc.png": img((1500, 1500), "#cccccc"),
            "04_tam_manh_RGBA.png": img((800, 800), (0, 0, 0, 0)),
            "layout.json": json.dumps(manifest).encode(),
        }
        with zipfile.ZipFile(source, "w") as z:
            for name, value in entries.items():
                z.writestr(name, value)
        render = folder / "render.png"
        render.write_bytes(img(render_size, "#abcdef"))
        return source, render, entries

    def test_scaling_preserves_sheet_and_updates_targets_and_ppi(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            source, render, original = self.make_fixture(folder)
            output, report = folder / "export.zip", folder / "qa.json"
            result = mod.convert(source, render, output, report)
            self.assertEqual(result["status"], "exported_requires_import_qa")
            self.assertEqual(result["frames"], 6)
            self.assertEqual(result["qa"]["guiImport"], "not_verified")
            with zipfile.ZipFile(output) as z:
                self.assertEqual(sorted(z.namelist()), sorted(mod.REQUIRED))
                self.assertEqual(z.read("04_tam_manh_RGBA.png"), original["04_tam_manh_RGBA.png"])
                layout = json.loads(z.read("layout.json"))
                self.assertEqual((layout["reference"]["width"], layout["reference"]["height"]), (1504, 1504))
                self.assertAlmostEqual(layout["frames"][0]["target"]["x"], 100 * 1504 / 1500, places=3)
                self.assertEqual(layout["print"]["dpi"], 191)
                for name in mod.REQUIRED[:3]:
                    self.assertEqual(mod.png(z.read(name)).size, (1504, 1504))

    def test_repeat_is_idempotent_and_same_checksum(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            source, render, _ = self.make_fixture(folder)
            output, report = folder / "export.zip", folder / "qa.json"
            first = mod.convert(source, render, output, report)
            second = mod.convert(source, render, output, report)
            self.assertEqual(first["zipSha256"], second["zipSha256"])
            self.assertEqual(first["files"], second["files"])

    def test_mismatched_aspect_is_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            source, render, _ = self.make_fixture(folder, render_size=(1504, 1400))
            with self.assertRaisesRegex(mod.ExportBlocked, "CANVAS_SCALE_TOO_LARGE|CANVAS_ASPECT_CHANGED"):
                mod.convert(source, render, folder/"export.zip", folder/"qa.json")

    def test_duplicate_z_is_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            layout = kit_manifest()
            layout["decorations"][0]["z"] = layout["frames"][0]["z"]
            source, render, _ = self.make_fixture(folder, layout)
            with self.assertRaisesRegex(mod.ExportBlocked, "DUPLICATE_OR_INVALID_Z"):
                mod.convert(source, render, folder/"export.zip", folder/"qa.json")

    def test_source_archive_with_extra_file_is_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            source, render, _ = self.make_fixture(folder)
            with zipfile.ZipFile(source, "a") as z:
                z.writestr("fake.png", b"x")
            with self.assertRaisesRegex(mod.ExportBlocked, "EXACTLY_FIVE"):
                mod.convert(source, render, folder/"export.zip", folder/"qa.json")


if __name__ == "__main__":
    unittest.main()
