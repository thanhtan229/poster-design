# P4 A3.1 — Procedural lace on Demo A

This offline prototype starts from A2. Only the RGB interior of the existing D04 sprite changes. It uses original procedural artwork with no external texture, model call or customer source. Crossed strands, offset highlights and alternating radial stitch clusters are painted into the same sprite. Its alpha, four-pixel cutline region, eyelet edges and placement stay fixed. The backing does not contain any mock shadows from moveable elements.

- [Full page A0/A1/A2/A3 JPEG](compare-demo.jpg), [A3 individually](A3.jpg)
- [Lace at 100%](lace-100pct.png), [lace at 200%](lace-200pct.png)
- [Blank comparison](compare-blank.jpg), [checker comparison](compare-checker.jpg)
- [RGBA atlas on light](rgba-light.png), [RGBA atlas on dark](rgba-dark.png)
- [QA, pixel-diff and four ZIP hashes](report.json), [evidence checksums](SHA256SUMS.txt)

At page scale the stitch bundles and weave are materially clearer than A2. The unchanged solid backing still reads as a dense embroidered trim, rather than true open lace. Review the finished page before deciding whether to reuse this material. Only A3.1 was implemented.

The test compared 227 files from the original workflow, A1 and A2. All retained their SHA-256. A3 passes the notebook QA from PR #79 with F02 Polaroid, F06 notebook, F04/F05 stamp-ticket, six enclosed windows and two distinct asymmetric silhouettes. It preserves 17 pieces with 22 px minimum clearance, all seven mask sentinels and pixel-exact JSON reconstruction. Delta outside D04 is zero in the atlas. Material ZIPs and individual AI source images remain local.

```text
python -B scripts/tinix-mcp/refine_demo_a3.py <locked-workflow> <A1-root> <A2-root> <new-output-directory>
```
