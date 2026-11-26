# P4 contract integration on TinixPoster main — DEVELOPMENT ONLY

This integration branch starts at main 0b7cfeca888c9ecf27e940ef4611a19543a3c576 and selectively ports runtime code from stacked P4 PR #82 (7741dc924690143f165f68d8d21e5c77b392e070); **it does not merge the old stacked P4 branches**, nor copy their experimental image/evidence directories. Preserve 19 MCP tools, including `export_material_draft`, the P1/P2/P3 orchestration retry guarantees, 4-PNG + `layout.json` delivery ZIP, and the approved GUI harness safeguards.

## Included contracts

- Mixed Handcut asymmetric aperture generation plus geometry QA and notebook ruling detection (synthetic A–D demo tests)
- Explicit `lace_style: "embroidered_pastel"` option for pastel-only theme; default material bytes and behavior remain unchanged
- `preview_artifact` read-only before approval: candidate demo/blank/checker/materials_zip via existing orchestrator
- `expected_material_sha256` binding on approval; refuse mismatched/substituted ZIP and invalid D04 donor
- MCP contract tests retain **19** unique tools and exporter schema while asserting both P4 review/approval guards

## Gates before ANY deployment/tunnel change

1. GitHub Actions full TinixPoster CI, Scrapbook source QA (including new Mixed Handcut A–D test), and Material Export QA all PASS on the exact integration branch SHA.
2. Codex TINIWIN01 independently compare running tunnel's **local** checkout `2da8c1a` with this branch; that checkout SHA was not resolvable through GitHub. Do not assume the two are identical. Preserve its preapproval behavior, request schemas and any unpushed changes.
3. On isolated staging: verify 19 tools, P1–P3 408 idempotency and 4 delivery artifact hashes, P4 geometry/lace/preview/approval hash protections, both 30-/38-layer synthetic GUI replacement/reimport/cleanup fixtures, unmodified customer hashes, backups, and staging renderer shutdown.
4. Separate owner approval for PR merge, host rollout, live tunnel switch, ChatGPT connector refresh, web discovery/download, and Skill changes. No P4 illustration should be saved as a template without separate approval.

**Known scope limitation:** repo CI uses synthetic test fixtures; it does not independently verify the Windows local tunnel checkout or real BiRefNet cutout.
