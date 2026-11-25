# [TINIX] Detect face rectangles locally. The input image is never saved.
import json
import sys

import cv2
import numpy as np


cv2.setNumThreads(2)
image = cv2.imdecode(np.frombuffer(sys.stdin.buffer.read(), dtype=np.uint8), cv2.IMREAD_COLOR)
if image is None:
    raise ValueError("Invalid image")
height, width = image.shape[:2]
detector = cv2.FaceDetectorYN.create(sys.argv[1], "", (width, height), 0.65, 0.3, 100)
_, faces = detector.detect(image)
boxes = []
for x, y, w, h, *_ in ([] if faces is None else faces):
    left, top = max(0, x), max(0, y)
    right, bottom = min(width, x + w), min(height, y + h)
    if right > left and bottom > top:
        boxes.append([float(left / width), float(top / height), float(right / width), float(bottom / height)])
print(json.dumps(boxes))
