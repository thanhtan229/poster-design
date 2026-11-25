"""[TINIX] Unit checks for archive handling and a targeted composition revision."""
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo

from workflow_compositions import revise, unpack


class CompositionTest(unittest.TestCase):
    def test_unzip_rejects_escaping_and_duplicate_entries(self):
        for invalid in ("../outside.png", "folder\\outside.png", "a.JSON"):
            with self.subTest(invalid=invalid), TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive = root / "compositions.zip"
                with ZipFile(archive, "w") as target:
                    target.writestr("A.json", "{}")
                    target.writestr("B.json", "{}")
                    # ZipInfo otherwise normalizes backslashes on Windows when writing.
                    item = ZipInfo("invalid.png")
                    item.filename = invalid
                    target.writestr(item, "{}")
                with self.assertRaisesRegex(ValueError, "Invalid composition ZIP entry"):
                    unpack(archive, root / "unpacked")
                self.assertFalse((root / "outside.png").exists())

    def test_revision_changes_only_targeted_layer_and_keeps_source(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = {
                "frames": [{"code": "F01", "target": {"x": 30, "y": 50}}],
                "decorations": [{"code": "D01", "target": {"x": 10, "y": 20}}],
            }
            source = root / "A.source.json"
            source.write_text(json.dumps(manifest), encoding="utf-8")
            operations = root / "repair.json"
            operations.write_text('[{"code":"D01","dx":2,"dy":-1}]', encoding="utf-8")
            with patch("workflow_compositions.export") as export:
                revise(root, "A", "revision-1", operations)
            self.assertEqual(json.loads(source.read_text(encoding="utf-8")), manifest)
            actual = json.loads((root / "revision-1.source.json").read_text(encoding="utf-8"))
            manifest["decorations"][0]["target"] = {"x": 12, "y": 19}
            self.assertEqual(actual, manifest)
            export.assert_called_once_with(root / "revision-1.source.json", root / "revision-1/material",
                                           root / "revision-1/qa")
            operations.write_text('[{"code":"D01","dx":13,"dy":0}]', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "within 12 px"):
                revise(root, "A", "revision-2", operations)
            self.assertFalse((root / "revision-2.source.json").exists())


if __name__ == "__main__":
    unittest.main()
