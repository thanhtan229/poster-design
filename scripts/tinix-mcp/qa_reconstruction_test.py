"""Regression fixtures for reverse-composition QA, using no customer photos."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from PIL import Image, ImageDraw

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('static_qa', HERE / 'qa_reconstruction.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


def bytes_png(img):
    stream = io.BytesIO()
    img.save(stream, format='PNG')
    return stream.getvalue()


def fixture(path):
    width, height = 640, 480
    background = Image.new('RGBA', (width, height), '#efe4d1')
    sheet = Image.new('RGBA', (700, 220), (0, 0, 0, 0))
    draw = ImageDraw.Draw(sheet)
    layout = {'version': 1,
        'sheet': {'file': '04_tam_manh_RGBA.png', 'width': 700, 'height': 220},
        'reference': {'file': '01_anh_mau.png', 'width': width, 'height': height},
        'print': {'widthMm': 200, 'heightMm': 150, 'dpi': 81},
        'frames': [], 'subjectZ': 7,
        'subject': {'target': {'x': 320, 'y': 270, 'width': 160, 'height': 170, 'angle': 0},
                    'borderMm': .9},
        'decorations': []}
    for i in range(6):
        x = 10 + i * 96
        draw.rectangle((x, 10, x + 79, 89), fill='#fffcf2')
        draw.rectangle((x + 13, 23, x + 66, 76), fill=(0, 0, 0, 0))
        tx = [95, 310, 525][i % 3]
        ty = 130 if i < 3 else 375
        layout['frames'].append({'code': f'F{i+1:02d}',
            'source': {'x': x, 'y': 10, 'width': 80, 'height': 80},
            'target': {'x': tx, 'y': ty, 'width': 80, 'height': 80, 'angle': 0},
            'z': i+1})
    draw.rounded_rectangle((10, 120, 170, 170), radius=10, fill='#c29067')
    layout['decorations'].append({'code': 'D01',
        'source': {'x': 10, 'y': 120, 'width': 161, 'height': 51},
        'target': {'x': 320, 'y': 40, 'width': 161, 'height': 51, 'angle': 0}, 'z': 8})
    rendered = background.copy()
    for item in sorted(layout['frames'] + layout['decorations'], key=lambda item: item['z']):
        src = item['source']
        sprite = sheet.crop((src['x'],src['y'],src['x']+src['width'],src['y']+src['height']))
        qa.place(rendered, sprite, item['target'])
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('01_anh_mau.png', bytes_png(rendered))
        z.writestr('02_nen_sach.png', bytes_png(background))
        z.writestr('03_so_do_bo_cuc.png', bytes_png(background))
        z.writestr('04_tam_manh_RGBA.png', bytes_png(sheet))
        z.writestr('layout.json', json.dumps(layout).encode())


class ReverseCompositionTest(unittest.TestCase):
    def test_static_round_trip_matches_pixel_for_pixel(self):
        with tempfile.TemporaryDirectory() as directory:
            kit = Path(directory) / 'material.zip'
            fixture(kit)
            result = qa.verify(kit, Path(directory) / 'evidence')
            self.assertEqual(result['status'], 'pass')
            self.assertEqual(result['staticMae255'], 0)
            self.assertGreater(result['testedPixels'], 10000)
            self.assertTrue((Path(directory) / 'evidence' / 'static_diff.png').exists())

    def test_corrupted_background_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            kit = Path(directory) / 'material.zip'
            fixture(kit)
            with zipfile.ZipFile(kit) as z:
                files = {name: z.read(name) for name in z.namelist()}
            bg = Image.open(io.BytesIO(files['02_nen_sach.png'])).convert('RGBA')
            ImageDraw.Draw(bg).rectangle((0, 0, 400, 240), fill='#ff0000')
            files['02_nen_sach.png'] = bytes_png(bg)
            with zipfile.ZipFile(kit, 'w') as z:
                for name, content in files.items():
                    z.writestr(name, content)
            result = qa.verify(kit, Path(directory) / 'evidence')
            self.assertEqual(result['status'], 'fail')
            self.assertGreater(result['staticMae255'], 4)


if __name__ == '__main__':
    unittest.main()
