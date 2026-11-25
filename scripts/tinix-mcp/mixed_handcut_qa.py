"""[TINIX] Measure Mixed Handcut geometry from the exported RGBA atlas."""

from itertools import combinations

import cv2
import numpy as np
from scipy import ndimage
from scipy.signal import find_peaks

SIZE = 112
CENTER = (SIZE - 1) / 2
ASYMMETRY_MIN = .045
DISTINCTNESS_MIN = .12
ADJACENT = np.ones((3,3), dtype=bool)


def normalized_mask(mask):
    """Center and whiten the mask so resizing leaves only rotation/reflection to align."""
    y, x = np.nonzero(mask)
    xy = np.column_stack((x, y)).astype(float)
    mean = xy.mean(axis=0)
    values, axes = np.linalg.eigh(np.cov(xy, rowvar=False))
    linear = (axes * (13 / np.sqrt(np.maximum(values, 1)))) @ axes.T
    affine = np.column_stack((linear, CENTER - linear @ mean))
    return cv2.warpAffine(mask.astype(np.uint8), affine, (SIZE, SIZE),
                          flags=cv2.INTER_NEAREST).astype(bool)


def distance(left, right):
    """Smallest symmetric difference over rotations, as a fraction of the union."""
    best = 1.
    source = right.astype(np.uint8)
    for degrees in range(0, 360, 5):
        rotation = cv2.getRotationMatrix2D((CENTER, CENTER), degrees, 1)
        aligned = cv2.warpAffine(source, rotation, (SIZE, SIZE), flags=cv2.INTER_NEAREST).astype(bool)
        delta = (left ^ aligned).sum() / (left | aligned).sum()
        best = min(best, delta)
    return float(best)


def stamp_notches(solid):
    """Measure repeating inward cuts down the top edge, away from the corners."""
    height, width = solid.shape
    top = np.argmax(solid, axis=0)[round(.10*width):round(.90*width)]
    peaks, _ = find_peaks(top, prominence=max(3, .012*height), distance=max(4, .044*width))
    return int(len(peaks))


def inspect_geometry(layout, sheet):
    rgba = np.asarray(sheet)
    result = {}
    silhouettes = {}
    for part in layout["frames"]:
        code = part["code"]
        box = part["source"]
        x, y, w, h = (box[key] for key in ("x", "y", "width", "height"))
        sprite = rgba[y:y+h,x:x+w]
        alpha = sprite[:,:,3]
        solid = alpha > 0
        holes = ndimage.binary_fill_holes(solid, structure=ADJACENT) & ~solid
        _, count = ndimage.label(holes, structure=ADJACENT)
        report = result[code] = {"closedAlphaZeroHoles": count, "validWindow": False}
        if count != 1 or holes.sum() < max(500, .055*alpha.size):
            continue
        hy, hx = np.nonzero(holes)
        fill = int(holes.sum()) / ((int(hx.max()-hx.min())+1) * (int(hy.max()-hy.min())+1))
        bottom = (h-1-int(hy.max())) / h
        top = int(hy.min()) / h
        notches = stamp_notches(alpha >= 128)
        # A notebook foot has printed rules; classify it separately from plain Polaroid paper.
        ruled = np.all(sprite[int(hy.max())+1:,:,:3] == (190,159,137), axis=2)
        notebook = bool(np.count_nonzero(ruled.sum(axis=1) >= .5*w) >= 2)
        mask = normalized_mask(holes) if fill <= .86 else None
        reflection = distance(mask, np.fliplr(mask)) if mask is not None else 0.
        if mask is not None and reflection >= ASYMMETRY_MIN:
            silhouettes[code] = mask
        report.update(validWindow=True, openingFillRatio=round(fill, 4),
                      reflectionMismatch=round(reflection, 4),
                      asymmetricSilhouette=code in silhouettes,
                      polaroidFoot=bool(fill >= .92 and bottom >= .14 and bottom >= 1.8*top
                                        and not notebook and notches < 6),
                      notebookRuling=notebook,
                      bottomPaperRatio=round(bottom, 4),
                      stampNotches=notches, stampOrTicket=bool(fill >= .90 and notches >= 6))

    pairs = []
    for (first, a), (second, b) in combinations(silhouettes.items(), 2):
        gap = min(distance(a,b), distance(a,np.fliplr(b)))
        pairs.append({"frames":[first,second], "mismatch":round(gap,4), "distinct":gap >= DISTINCTNESS_MIN})
    polaroids = [code for code, frame in result.items() if frame.get("polaroidFoot")]
    notebooks = [code for code, frame in result.items() if frame.get("notebookRuling")]
    stamps = [code for code, frame in result.items() if frame.get("stampOrTicket")]
    all_windows = len(result) == 6 and all(frame["validWindow"] for frame in result.values())
    passed = all_windows and bool(polaroids) and bool(stamps) and any(pair["distinct"] for pair in pairs)
    return {"status":"pass" if passed else "fail", "allSixWindows":all_windows, "frames":result,
            "silhouettePairs":pairs, "polaroids":polaroids, "stampsOrTickets":stamps,
            "notebooks":notebooks, "visualReviewRequired":True}
