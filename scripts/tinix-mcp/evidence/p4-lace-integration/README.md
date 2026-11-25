# P4 embroidered pastel integration gate

The generator accepts the explicit `lace_style: "embroidered_pastel"` preset from the existing orchestrator with `theme: "pastel"`. It uses the B1 procedural threads and colour profile. Omit the field for the original material and catalog identity in every theme. An explicit request for the preset with a different theme is rejected. No renderer, layer, cutting alpha or ZIP layout schema changes.

## Fixture

[C comparison](C-compare.jpg) · [C crop at 100%](C-lace-100pct.png) · [D comparison](D-compare.jpg) · [D crop at 100%](D-lace-100pct.png) · [QA and SHA-256 evidence](report.json) · [Evidence hashes](SHA256SUMS.txt)

On the full page the embroidered stitches remain visible on C against the mint/pink base and are quieter on D, where frames cover more of the strip. The ivory mix avoids a heavy brown band. Both passed this synthetic fixture visual gate. The solid backing stays visible. These are procedural illustrations, so final photos and overlap still require review.

The local MCP SDK prepared two four-demo batches from one shared procedural set of seven illustrations. New kits had four distinct SHA-256 values. All four candidates passed source/geometry QA and notebook classification. Atlas alpha was unchanged, RGB changes were confined to D04, layout JSON was byte-identical, and 17 cut pieces, a 22 px minimum gap plus 28 sentinels passed. Both sets were rendered and re-rendered from the actual archived JSON with exact pixels. All 12 images and four ZIPs returned by MCP matched their locked bytes. A legacy B ZIP SHA and a substituted on-disk ZIP were rejected before approval/job allocation. A repair using a legacy D04 donor is also rejected for the preset.

## Prepare a real P4 batch after approval

1. Run the accepted branch in the **test MCP**. Ask ChatGPT web to check it sees the new action and fields. This PR does not update the running connector.
2. Use a fresh `workflow_id` and `operation_id`, `action: "prepare"`, `theme: "pastel"`, `lace_style: "embroidered_pastel"`, `demo_count: 4`, `aspect_ratio: "1:1"`, and the same seven AI attachments in F01–F06, SUBJECT order. Use the neutral F06. Reuse the earlier brief and title as needed.
3. Verify four candidates pass both QA gates. Use `action: "preview_artifact"` with the workflow, a fresh operation ID, `demo_id`, and `preview_kind: "demo"`, `"blank"`, `"checker"` or `"materials_zip"`. Verify the returned SHA-256 against that candidate's prepared metadata. The ZIP comes back as an MCP embedded resource. The ChatGPT web display/download path has not been exercised on this branch.
4. Stop and let the user choose. For a separately authorized production-like test, `advance` requires the chosen `approved_demo_id` and exact `expected_material_sha256`. An older ZIP cannot stand in for the chosen candidate. The test server was not advanced successfully and no job was created. In-app import/render remains a separate approval step.
