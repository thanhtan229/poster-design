# P4 Visual Refinement A0/A1/A2

A2 is an offline experiment on Demo A only. The three columns keep the same seven AI illustrations, layer placements, cutline and masks. A2 shades the fixed background papers in paint order and adds fibre and stitch contrast inside editable sprites. Shadows from replaceable photos and SUBJECT are excluded from the background.

## Review

- Full page at 1080 × 1080 · [A0](A0.jpg) · [A1](A1.jpg) · [A2](A2.jpg) · [Side by side](compare-demo.jpg)
- [Blank](compare-blank.jpg) · [Checker](compare-checker.jpg) · [Contact sheet at 100%](contact-sheet.jpg)
- 100% lossless · [Torn edge](100pct-paper-edge.png) · [Fixed paper shadow](100pct-fixed-paper-shadow.png) · [Lace](100pct-lace.png) · [Polaroid](100pct-polaroid.png) · [Ticket](100pct-ticket.png) · [SUBJECT](100pct-subject.png) · [Shoes](100pct-subject-shoes.png)
- [Atlas on light](rgba-light.png) · [Atlas on dark](rgba-dark.png) · [QA and kit SHA-256](report.json) · [Evidence SHA-256](SHA256SUMS.txt)

The average absolute RGB change across the entire preview, relative to A0, increased from 0.2739 for A1 to 0.9686 for A2 on a 255-point scale. The lace crop moved from 1.43 to 3.42. The contact shadow is clearer around the fixed paper edges, and the eyelets have visible thread relief. At page scale the trim still reads as embossed paper more than open fabric. Achieving deeper textile relief or a cast shadow that follows editable pieces would require a different material or render approach, subject to approval.

A2 kept the packed alpha and layout byte-for-byte. Source and geometry QA passed, all seven sentinels stayed inside their masks, and the three kits rebuilt their original placeholder and illustrated previews. No job was created. The original workflow and A1 files were checked against their recorded hashes. The four original ZIPs remain locked.

## Reproduce

```text
python -B scripts/tinix-mcp/refine_demo_a2.py <locked-workflow-directory> <A1-evidence-directory> <new-output-directory>
```

The individual source illustrations and material ZIPs remain local.
