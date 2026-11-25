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


def notebook_rules(sprite, aperture_bottom):
    """Find long, thin dark rules against their local paper, inside the foot."""
    height, width = sprite.shape[:2]
    x0, x1 = round(.11*width), round(.89*width)
    offset = max(2, round(.009*height))
    first = aperture_bottom + max(offset + 2, round(.023*height))
    last = height - max(offset + 3, round(.045*height))
    if last <= first or x1 <= x0:
        return []

    # [TINIX] Compare both sides of each stroke in luminance. A monotone shade or edge cannot become a rule.
    section = sprite[first-offset:last+offset,x0:x1]
    tone = section[:,:,:3] @ np.array([.2126,.7152,.0722])
    above, middle, below = tone[:-2*offset], tone[offset:-offset], tone[2*offset:]
    opaque = section[:,:,3] >= 248
    support = ((np.minimum(above,below) - middle) >= 12) & (
        opaque[:-2*offset] & opaque[offset:-offset] & opaque[2*offset:])
    # A tiny break in a printed line may be due to grain. Isolated marks remain too short.
    support = ndimage.binary_closing(support, structure=np.ones((1,5), dtype=bool))
    spans = []
    for row in support:
        edges = np.flatnonzero(np.diff(np.r_[False,row,False]))
        spans.append((edges[1::2]-edges[::2]).max(initial=0))
    runs = np.asarray(spans,dtype=float)
    peaks, _ = find_peaks(np.r_[0,runs,0], height=.50*width, distance=max(4,round(.025*height)))
    return [int(first + peak - 1) for peak in peaks]


def inspect_geometry(layout, sheet, *, require_notebook=True):
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
        ruled_rows = notebook_rules(sprite,int(hy.max())) if fill >= .92 and bottom >= .14 and notches < 6 else []
        notebook = len(ruled_rows) >= 2
        mask = normalized_mask(holes) if fill <= .86 else None
        reflection = distance(mask, np.fliplr(mask)) if mask is not None else 0.
        if mask is not None and reflection >= ASYMMETRY_MIN:
            silhouettes[code] = mask
        report.update(validWindow=True, openingFillRatio=round(fill, 4),
                      reflectionMismatch=round(reflection, 4),
                      asymmetricSilhouette=code in silhouettes,
                      polaroidFoot=bool(fill >= .92 and bottom >= .14 and bottom >= 1.8*top
                                        and not notebook and notches < 6),
                      notebookRuling=notebook, notebookRuleRows=ruled_rows,
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
    passed = (all_windows and bool(polaroids) and bool(stamps) and any(pair["distinct"] for pair in pairs)
              and (bool(notebooks) or not require_notebook))
    return {"status":"pass" if passed else "fail", "allSixWindows":all_windows, "frames":result,
            "silhouettePairs":pairs, "polaroids":polaroids, "stampsOrTickets":stamps,
            "notebooks":notebooks, "notebookRequired":bool(require_notebook), "visualReviewRequired":True}
