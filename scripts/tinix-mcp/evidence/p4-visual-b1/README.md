# P4 Demo B1 — A3 lace reuse validation

B1 starts from the original B0 lock. D04 shares the exact 280 × 70 px source sprite with A0, retains a 734 × 79 px placement, and keeps Demo B's -3° angle. The A3 textile was reproduced from its own A2 source as a provenance check. B1 then applied the same procedural stitch geometry directly to B0 with a 30% ivory mix. It preserves every pixel in the protected cutline band and makes no changes to the paper background, shadows or the seven AI illustration assets.

- [Full-page B0/B1 JPEG](compare-demo.jpg) · [B0](B0.jpg) · [B1](B1.jpg)
- [Lace at 100%](lace-100pct.png) · [200%](lace-200pct.png)
- [Blank](compare-blank.jpg) · [Checker](compare-checker.jpg) · [Atlas light](rgba-light.png) · [Atlas dark](rgba-dark.png)
- [QA and ZIP SHA-256](report.json) · [Evidence checksums](SHA256SUMS.txt)

The crossed stitches read at page scale and look lighter against the B0 pastel palette than A3's warmer thread. The strip still has the original solid backing. No wider rollout is included.

The atlas changed at 9,511 RGB pixels, all inside D04, with zero alpha change. Layout JSON is byte-identical. QA from PR #79 passes with six enclosed photo windows, asymmetric F02/F06, Polaroid F01, notebook F05, and stamp/ticket F03/F04. It retains 17 pieces at each alpha threshold, 22 px of minimum clearance and seven sentinels with zero outside-mask pixels. B0 and B1 both reconstruct exactly from the archived JSON, and all four original ZIP locks still match. The ZIPs and AI source images remain local.

```text
python -B scripts/tinix-mcp/refine_demo_b1.py <locked-workflow> <A2-root> <A3-root> <new-output-directory>
```
