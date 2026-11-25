"""[TINIX] Regress Mixed Handcut on real packed geometry without creating a TinixPoster job."""

from contextlib import redirect_stdout
from io import StringIO
import json
import os
from pathlib import Path
from shutil import copyfile
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

import numpy as np
from PIL import Image

from generate_compositions import MIXED_FRAME_STYLES, SKILL_SHA256, build, digest
from handcut_assets import make_frame
from mixed_handcut_qa import inspect_geometry
from seed_handcut_catalog import clean_alpha
from source_qa import inspect as inspect_source
from tinixposter_v1 import DELIVERY, detect_window, make_photo_layer, pack_assets, trim_nonzero, validate


def frame_sprites():
    return [(f"F{i+1:02}", clean_alpha(make_frame(style, 256, 320, seed=20+i, mixed_handcut=True)))
            for i, style in enumerate(MIXED_FRAME_STYLES)]


def packed_geometry(sprites, **options):
    sprites = [(code, trim_nonzero(image, code)) for code, image in sprites]
    sheet, boxes = pack_assets(sprites, None, 22, 24)
    return inspect_geometry({"frames":[{"code":code, "source":box} for code, box in boxes.items()]}, sheet, **options)


def read_json(file):
    return json.loads(file.read_text(encoding="utf-8"))


class MixedHandcutTest(unittest.TestCase):
    def test_transformed_duplicate_is_not_a_second_silhouette(self):
        sprites = frame_sprites()
        arch = sprites[0][1]
        variant = arch.resize((325, 282), Image.Resampling.BOX).rotate(31, expand=True)
        sprites[2] = ("F03", clean_alpha(variant))
        geometry = packed_geometry(sprites)
        self.assertTrue(geometry["allSixWindows"])
        self.assertTrue(geometry["frames"]["F03"]["asymmetricSilhouette"])
        self.assertFalse(geometry["silhouettePairs"][0]["distinct"])
        self.assertEqual(geometry["status"], "fail")

    def test_minor_jitter_does_not_qualify_and_a_second_hole_blocks_the_gate(self):
        sprites = frame_sprites()
        rect = clean_alpha(make_frame("torn", 256, 320, mixed_handcut=True))
        sprites[2] = ("F03", rect)
        geometry = packed_geometry(sprites)
        self.assertTrue(geometry["allSixWindows"])
        self.assertFalse(geometry["frames"]["F03"]["asymmetricSilhouette"])
        self.assertEqual(geometry["status"], "fail")

        sprites = frame_sprites()
        polaroid = sprites[1][1]
        polaroid.putpixel((128, 287), (0, 0, 0, 0))
        geometry = packed_geometry(sprites)
        self.assertEqual(geometry["frames"]["F02"]["closedAlphaZeroHoles"], 2)
        self.assertFalse(geometry["allSixWindows"])
        self.assertEqual(geometry["status"], "fail")

    def test_missing_polaroid_or_real_notches_blocks_the_gate(self):
        sprites = frame_sprites()
        sprites[1] = ("F02", sprites[5][1])
        geometry = packed_geometry(sprites)
        self.assertEqual(geometry["polaroids"], [])
        self.assertEqual(geometry["status"], "fail")

        sprites = frame_sprites()
        unnotched = clean_alpha(make_frame("torn", 256, 320, seed=41, mixed_handcut=True))
        sprites[3:5] = [("F04", unnotched), ("F05", unnotched)]
        geometry = packed_geometry(sprites)
        self.assertEqual(geometry["stampsOrTickets"], [])
        self.assertEqual(geometry["status"], "fail")

    def test_notebook_uses_relative_contrast_after_recoloring(self):
        sprites = frame_sprites()
        image = sprites[5][1]
        pixels = np.array(image)
        # Replace the original ink color and vary paper/ink brightness across the width.
        tone = pixels[:,:,:3].astype(np.int16)
        ink = np.all(tone == (190,159,137), axis=2)
        tone[ink] = (163,131,118)
        tone += np.rint(np.linspace(-7,8,image.width))[None,:,None].astype(np.int16)
        pixels[:,:,:3] = np.clip(tone,0,255)
        sprites[5] = ("F06", Image.fromarray(pixels,"RGBA"))
        report = packed_geometry(sprites)
        self.assertTrue(report["notebookRequired"])
        self.assertEqual(report["notebooks"], ["F06"])
        self.assertEqual(report["polaroids"], ["F02"])
        self.assertEqual(report["status"], "pass")

    def test_erasing_notebook_rules_blocks_required_style(self):
        sprites = frame_sprites()
        image = sprites[5][1]
        pixels = np.array(image)
        start, end = round(.14*image.width), round(.86*image.width)+1
        for fraction in (.85,.90):
            row = int(fraction*image.height)
            # Cover each real printed rule with adjacent paper, leaving alpha untouched.
            pixels[row,start:end,:3] = pixels[row-2,start:end,:3]
        np.testing.assert_array_equal(pixels[:,:,3],np.asarray(image.getchannel("A")))
        sprites[5] = ("F06", Image.fromarray(pixels,"RGBA"))
        report = packed_geometry(sprites)
        self.assertTrue(report["allSixWindows"])
        self.assertTrue(report["silhouettePairs"][0]["distinct"])
        self.assertTrue(report["stampsOrTickets"])
        self.assertEqual(report["notebooks"], [])
        self.assertEqual(report["frames"]["F06"]["notebookRuleRows"], [])
        self.assertIn("F02",report["polaroids"])
        self.assertEqual(report["status"], "fail")
        self.assertEqual(packed_geometry(sprites,require_notebook=False)["status"], "pass")

    def test_pastel_lace_catalog_preserves_every_other_layer(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            config = {"brief":"Sinh nhật", "demoCount":2, "aspectRatio":"1:1", "theme":"pastel",
                      "skillVersion":"1.2.13", "skillSourceSha256":SKILL_SHA256}
            with redirect_stdout(StringIO()):
                default = build(root/"base", config)
                embroidered = build(root/"embroidery", {**config, "laceStyle":"embroidered_pastel"})
            for original, revised in zip(default["kits"],embroidered["kits"]):
                demo = original["demoId"]
                self.assertNotEqual(original["kitSha256"],revised["kitSha256"])
                self.assertEqual(original["mixedHandcutGeometry"],revised["mixedHandcutGeometry"])
                base = root/"base"/demo/"material"
                option = root/"embroidery"/demo/"material"
                self.assertEqual((base/"layout.json").read_bytes(),(option/"layout.json").read_bytes())
                self.assertEqual((base/DELIVERY[1]).read_bytes(),(option/DELIVERY[1]).read_bytes())
                with Image.open(base/DELIVERY[3]) as old, Image.open(option/DELIVERY[3]) as new:
                    old,new = np.array(old),np.array(new)
                np.testing.assert_array_equal(old[:,:,3],new[:,:,3])
                rect = next(d["source"] for d in read_json(base/"layout.json")["decorations"] if d["code"]=="D04")
                difference = np.any(old!=new,axis=2)
                self.assertTrue(difference.any())
                y,x,w,h = (rect[k] for k in ("y","x","width","height"))
                difference[y:y+h,x:x+w] = False
                self.assertFalse(difference.any())
            with self.assertRaisesRegex(ValueError,"requires the pastel theme"):
                build(root/"wrong-theme",{**config,"theme":"vintage","laceStyle":"embroidered_pastel"})

    def test_four_exported_demos_and_sentinels(self):
        evidence = os.environ.get("TINIX_MIXED_HANDCUT_EVIDENCE")
        with TemporaryDirectory() as temp:
            root = Path(temp)
            with redirect_stdout(StringIO()):
                batch = build(root/"compositions", {"brief":"Sinh nhật", "demoCount":4, "aspectRatio":"1:1",
                              "skillVersion":"1.2.13", "skillSourceSha256":SKILL_SHA256})
            self.assertEqual([kit["demoId"] for kit in batch["kits"]], list("ABCD"))
            self.assertEqual(len({kit["kitSha256"] for kit in batch["kits"]}), 4)
            reports = []
            for kit in batch["kits"]:
                code = kit["demoId"]
                with self.subTest(demo=code):
                    reports.append(self.verify_demo(root/"compositions", kit, batch))
            self.assertEqual(len(reports), 4)
            if evidence:
                publish_evidence(root/"compositions", Path(evidence), reports)

    def verify_demo(self, root, kit, batch):
        code = kit["demoId"]
        demo = root/code
        source = root/(code+".source.json")
        archive = demo/"material.zip"
        self.assertEqual(digest(archive), kit["kitSha256"])
        self.assertEqual(digest(source), kit["manifestSha256"])
        with ZipFile(archive) as material:
            self.assertCountEqual(material.namelist(), DELIVERY)
            self.assertIsNone(material.testzip())
        qa = read_json(demo/"qa"/"tinixposter_qa.json")
        geometry = qa["mixed_handcut_geometry"]
        self.assertEqual(geometry, kit["mixedHandcutGeometry"])
        self.assertEqual(geometry["status"], "pass")
        self.assertTrue(geometry["visualReviewRequired"])
        self.assertEqual(len(geometry["frames"]), 6)
        self.assertTrue(all(frame["closedAlphaZeroHoles"] == 1 for frame in geometry["frames"].values()))
        self.assertEqual(len([pair for pair in geometry["silhouettePairs"] if pair["distinct"]]), 1)
        self.assertTrue(geometry["polaroids"] and geometry["stampsOrTickets"] and geometry["notebooks"])
        self.assertTrue(qa["render_pixel_identical_from_json"])
        self.assertEqual(qa["subject_count"], 1)
        self.assertEqual(len(set(read_json(source)["illustrationHashes"].values())), 7)
        result = validate(demo/"material")
        self.assertEqual(result["components_by_alpha"], {threshold:qa["pieces"] for threshold in (1,8,16,24)})
        self.assertGreaterEqual(result["min_bounding_box_gap_px"], 12)
        layout = read_json(demo/"material"/"layout.json")
        with Image.open(demo/"material"/DELIVERY[3]) as sheet:
            for frame in layout["frames"]:
                x,y,w,h = (frame["source"][key] for key in ("x","y","width","height"))
                sprite = sheet.crop((x,y,x+w,y+h))
                window = detect_window(sprite, frame["code"])
                fill = make_photo_layer(sprite, Image.new("RGB",(64,64),"#0899ab"), frame["code"])
                self.assertTrue(np.all(np.asarray(fill.getchannel("A"))[window] == 255))
        trusted = set(batch["proceduralStaticSha256"])
        audit = inspect_source(source, archive, demo/"source-qa", trusted, trusted)
        self.assertEqual(audit["status"], "pass", audit["issues"])
        self.assertEqual(audit["mixedHandcutGeometry"], geometry)
        self.assertEqual(len(audit["sentinels"]), 7)
        self.assertTrue(all(slot["outsideMaskPx"] == 0 and slot["changedPx"] > 0
                            for slot in audit["sentinels"].values()))
        # The fixture's subject and accents should never hide over a quarter of an opening.
        self.assertTrue(all(slot["visibleMaskPx"] >= .75*slot["onPageMaskPx"]
                            for slot in audit["sentinels"].values()), audit["sentinels"])
        return {"demoId":code, "styleQa":geometry, "sourceQa":audit["status"], "sentinels":audit["sentinels"],
                "pieces":qa["pieces"], "componentsByAlpha":qa["components_by_alpha"],
                "minGapPx":qa["min_bounding_box_gap_px"], "jsonPixelMatch":qa["render_pixel_identical_from_json"],
                "sourceManifestSha256":kit["manifestSha256"]}


def publish_evidence(root, destination, reports):
    destination.mkdir(parents=True, exist_ok=False)
    sheet = Image.new("RGB",(960,1280),"white")
    for row, report in enumerate(reports):
        code = report["demoId"]
        demo = root/code
        folder = destination/code
        folder.mkdir()
        files = ["demo.png", "blank.png", "checker.png", "material.zip",
                 "material/04_tam_manh_RGBA.png", "material/layout.json",
                 "qa/tinixposter_qa.json", "qa/alpha_on_light_dark.jpg", "source-qa/source-qa.json"]
        for file in files:
            copyfile(demo/file, folder/Path(file).name)
        report["sha256"] = {file.name:digest(file) for file in sorted(folder.iterdir())}
        for column, name in enumerate(("demo.png","blank.png","checker.png")):
            with Image.open(folder/name) as image:
                sheet.paste(image.resize((320,320), Image.Resampling.LANCZOS),(320*column,320*row))
    sheet.save(destination/"qa-contact.png")
    (destination/"result.json").write_text(json.dumps(reports, indent=2)+"\n", encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
