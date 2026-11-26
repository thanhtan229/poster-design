"""[TINIX] Exercise invalid kit members without the approved Skill archive."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import warnings
from zipfile import ZipFile

from staging_preflight_zip import verify
from tinixposter_v1 import DELIVERY


class PreflightZipTest(unittest.TestCase):
    def test_rejects_missing_extra_and_duplicate_members(self):
        for names in (DELIVERY[:-1], (*DELIVERY, "../extra.png"), (*DELIVERY, DELIVERY[0])):
            with self.subTest(names=names), TemporaryDirectory() as temp:
                root = Path(temp)
                archive = root / "bad.zip"
                with warnings.catch_warnings(), ZipFile(archive, "w") as result:
                    warnings.simplefilter("ignore", UserWarning)
                    for name in names:
                        result.writestr(name, b"fixture")
                with self.assertRaisesRegex(Exception, "Unexpected or duplicate ZIP members"):
                    verify(archive)
                self.assertEqual(list(root.iterdir()), [archive])

    def test_rejects_fake_png_and_cleans_extraction(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            archive = root / "bad.zip"
            with ZipFile(archive, "w") as result:
                for name in DELIVERY:
                    result.writestr(name, b"fixture")
            with self.assertRaisesRegex(Exception, "cannot identify image file"):
                verify(archive)
            self.assertEqual(list(root.iterdir()), [archive])


if __name__ == "__main__":
    unittest.main()
