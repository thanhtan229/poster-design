"""[TINIX] Test positive evidence, uncertain sources and repair inputs with synthetic art."""

from pathlib import Path
from tempfile import TemporaryDirectory
import json
import shutil
import sys
import unittest

import numpy as np
from PIL import Image
from scipy import ndimage

from generate_compositions import SKILL_SHA256, build
from source_qa import digest, inspect, locate_reference, reference_tiles
from tinixposter_v1 import export


def texture(seed):
    generator = np.random.default_rng(seed)
    return Image.fromarray(generator.integers(20, 230, (155, 120, 3), dtype=np.uint8), "RGB")


def contaminate(parent, candidate, code, layer, *, scaled=False, visible=False, hidden_rgb=False, transformed=None):
    candidate.mkdir()
    shutil.copytree(parent/"assets",candidate/"assets")
    source = candidate/(code+".source.json")
    manifest = json.loads((parent/source.name).read_text(encoding="utf-8"))
    photo = manifest["frames"][0]
    illustration = texture(501)
    illustration.save(candidate/photo["photo"])
    _, patch = reference_tiles({"F01":illustration})[0]
    patch = Image.fromarray(patch).convert("RGBA")
    if scaled:
        patch = patch.resize((18,18),Image.Resampling.BILINEAR)
    if transformed == "rotated":  # [TINIX] Transform already baked into the static asset.
        patch = patch.rotate(21,Image.Resampling.BICUBIC,expand=True)
    if transformed == "cropped":
        patch = patch.crop((0,0,16,20))
    asset = manifest["background"] if layer == "BACKGROUND" else next(
        part["asset"] for part in manifest["frames"]+manifest["decorations"] if part["code"] == layer)
    file = candidate/asset
    image = Image.open(file).convert("RGBA")
    if layer == "BACKGROUND":
        position = (manifest["page"]["width"]//2 - 12, round(manifest["page"]["height"]*(.219 if visible else .5))-12)
    else:
        mask = np.asarray(image.getchannel("A")) == 255
        fit = ndimage.binary_erosion(mask,structure=np.ones((patch.height,patch.width),dtype=bool))
        entries = np.argwhere(fit)
        if len(entries) == 0:
            raise ValueError("Test layer needs room for the reference tile inside opaque pixels")
        y,x = entries[len(entries)//2]
        position = (int(x)-patch.width//2,int(y)-patch.height//2)
    if hidden_rgb and layer == "BACKGROUND":
        # [TINIX] A transparent PNG pixel still contributes its RGB when exported as the clean background.
        patch.putalpha(0)
        image.paste(patch,position)
    else:
        image.alpha_composite(patch,position)
    image.save(file)
    source.write_text(json.dumps(manifest),encoding="utf-8")
    export(source,candidate/code/"material",placeholders=True,review_dir=candidate/code)
    return source


class SourceQaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = TemporaryDirectory()
        cls.addClassCleanup(cls.folder.cleanup)
        cls.root = Path(cls.folder.name)
        cls.clean = cls.root/"clean"
        build(cls.clean,{"brief":"Sinh nhật","skillVersion":"1.2.13","skillSourceSha256":SKILL_SHA256,
                         "demoCount":2,"aspectRatio":"1:1"})
        cls.trust = {a["sha256"] for a in json.loads((cls.clean/"catalog.json").read_text(encoding="utf-8"))["assets"]
                     if not a["previewOnly"]}

    def audit(self, folder, name, trust=None):
        return inspect(folder/"A.source.json",folder/"A/material.zip",self.root/name,
                       self.trust if trust is None else trust,self.trust)

    def audit_with_trusted_layer(self, home, name, code):
        manifest = json.loads((home/"A.source.json").read_text(encoding="utf-8"))
        asset = manifest["background"] if code == "BACKGROUND" else next(
            item["asset"] for item in manifest["frames"]+manifest["decorations"] if item["code"] == code)
        poisoned_hash = digest((home/asset).read_bytes())
        return self.audit(home,name,self.trust | {poisoned_hash})

    def test_clean_and_unknown(self):
        result = self.audit(self.clean,"clean-audit")
        self.assertEqual(result["status"],"pass",result["issues"])
        self.assertEqual(len(result["sentinels"]),7)
        self.assertTrue(all(not s["outsideMaskPx"] and s["changedPx"] for s in result["sentinels"].values()))
        self.assertEqual(self.audit(self.clean,"unknown-audit",set())["status"],"uncertain")

    def test_trusted_without_independent_generation_is_uncertain(self):
        result = inspect(self.clean/"A.source.json",self.clean/"A/material.zip",
                         self.root/"trusted-only-audit",self.trust)
        self.assertEqual(result["status"],"uncertain")
        self.assertTrue(any(x["reason"] == "static_reference_scan_incomplete" for x in result["issues"]))

    def test_background_behind_subject(self):
        home = self.root/"background"
        contaminate(self.clean,home,"A","BACKGROUND")
        result = self.audit(home,"background-audit")
        self.assertIn({"layer":"BACKGROUND","status":"fail","reason":"exact_illustration_fragment"},
                      [{key: issue[key] for key in ("layer","status","reason")} for issue in result["issues"]])
        trusted = self.audit_with_trusted_layer(home,"trusted-background-audit","BACKGROUND")
        self.assertEqual(trusted["status"],"fail",trusted["issues"])
        self.assertTrue(any(issue["layer"] == "BACKGROUND" and issue["reason"] == "exact_illustration_fragment"
                            and issue["provenanceVerified"] for issue in trusted["issues"]))

    def test_frame_under_rotation_and_decoration(self):
        for name, code in (("frame","F02"),("decoration","D01")):
            with self.subTest(layer=name):
                home = self.root/name
                contaminate(self.clean,home,"A",code)
                result = self.audit_with_trusted_layer(home,name+"-audit",code)
                self.assertEqual(result["status"],"fail",result["issues"])
                self.assertTrue(any(row["layer"] == code and row["reason"] == "exact_illustration_fragment"
                                    and row["provenanceVerified"]
                                    for row in result["issues"]), result)

    def test_trusted_transparent_background_rgb_is_visible_after_export(self):
        home = self.root/"hidden-rgb"
        contaminate(self.clean,home,"A","BACKGROUND",hidden_rgb=True)
        result = self.audit_with_trusted_layer(home,"hidden-rgb-audit","BACKGROUND")
        self.assertEqual(result["status"],"fail",result["issues"])
        self.assertTrue(any(issue["reason"] == "exact_illustration_fragment" and issue["provenanceVerified"]
                            for issue in result["issues"]))

    def test_resampled_illustration_is_never_approved_by_absence(self):
        home = self.root/"scaled"
        contaminate(self.clean,home,"A","BACKGROUND",scaled=True)
        result = self.audit(home,"scaled-audit")
        self.assertEqual(result["status"],"uncertain",result["issues"])

    def test_rotated_and_cropped_fragments_without_proof_are_uncertain(self):
        for variant in ("rotated","cropped"):
            with self.subTest(variant=variant):
                home = self.root/variant
                contaminate(self.clean,home,"A","BACKGROUND",transformed=variant)
                result = self.audit(home,variant+"-audit")
                self.assertEqual(result["status"],"uncertain",result["issues"])

    def test_no_match_on_different_image(self):
        self.assertIsNone(locate_reference(texture(1),reference_tiles({"F01":texture(2)})))


if __name__ == "__main__":
    if len(sys.argv) in (5, 6):
        source, copy, demo, layer = sys.argv[1:5]
        contaminate(Path(source),Path(copy),demo,layer,visible=sys.argv[5:] == ["visible"])
    else:
        unittest.main()
