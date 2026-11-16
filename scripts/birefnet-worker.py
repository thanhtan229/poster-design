"""Persistent CUDA worker. JSON lines on stdin/stdout, diagnostics on stderr."""
import contextlib
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
model = None


def extract(source, destination):
    global model
    import torch
    from PIL import Image, ImageOps
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable. Run scripts/setup-birefnet.ps1 first.')
    if model is None:
        with contextlib.redirect_stdout(sys.stderr):
            model = AutoModelForImageSegmentation.from_pretrained(
                str(ROOT / '.runtime/birefnet-model'), trust_remote_code=True,
                local_files_only=True, use_safetensors=True).eval().to('cuda').half()
    start = time.perf_counter()
    image = ImageOps.exif_transpose(Image.open(source)).convert('RGB')
    if image.width * image.height > 80000000:
        raise ValueError('Image exceeds 80 million pixels')
    transform = transforms.Compose([transforms.Resize((1024, 1024)), transforms.ToTensor(),
                                    transforms.Normalize([.485,.456,.406],[.229,.224,.225])])
    with torch.inference_mode():
        tensor = transform(image).unsqueeze(0).to('cuda').half()
        alpha = model(tensor)[-1].sigmoid().float().cpu()[0].squeeze().clamp(0,1)
    mask = transforms.ToPILImage()(alpha).resize(image.size, Image.Resampling.LANCZOS)
    image.putalpha(mask)
    temporary = destination + '.tmp.png'
    image.save(temporary)
    os.replace(temporary, destination)
    return {'gpu': torch.cuda.get_device_name(0), 'seconds': round(time.perf_counter()-start,3),
            'width': image.width, 'height': image.height, 'model': 'BiRefNet',
            'peakVramMB': round(torch.cuda.max_memory_allocated()/1024**2)}


for line in sys.stdin:
    try:
        request = json.loads(line)
        with contextlib.redirect_stdout(sys.stderr):
            result = extract(request['source'], request['destination'])
        print(json.dumps({'ok': True, **result}), flush=True)
    except Exception as exc:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({'ok': False, 'error': str(exc)}), flush=True)
