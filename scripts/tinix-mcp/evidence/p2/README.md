# P2 source QA evidence

The [full QA report](test-results.json) records the structural checks, seven sentinels and findings per layer. The [comparison](before-after.png) contains two actual TinixPoster renders and a crop of the 34×34 px region affected by the background replacement. The images use synthetic artwork. The original Demo D assets remain local.

| Case | Outcome |
| --- | --- |
| Generated clean source | Pass. All seven sentinels change pixels inside their visible masks. |
| Original Demo D | Uncertain. The flat AI source has no verified chain of clean static assets. Production delivery must be blocked. |
| Exact fragment on the background, behind SUBJECT | Fail on BACKGROUND. |
| Exact fragment in a rotated frame sprite | Fail on F02. |
| Exact fragment in a decoration | Fail on D01. |
| The fragment already resampled in the asset | Uncertain. No exact match and the layer lacked verified provenance. |
| Revision using the clean donor background | Pass after replacement. Original manifest, demo and ZIP bytes remained equal. Revision required fresh approval before build. |

The separate legacy-template regression still imported and rendered, then blocked final artifacts for unverified source. P1 regression created batches of three and four demos, verified the selected ZIP hash and passed customer mode with synthetic images and a stub for BiRefNet. The repository suite passed 38/38 groups locally. The P2 CI runs the Python source and ghost fixtures. The local MCP tests use the SDK and the real TinixPoster renderer. ChatGPT web verification remains pending.

The detector treats distinctive exact RGB fragments as positive evidence. Resampling, color edits and unknown reference images can defeat that match. Those cases require provenance or review and are blocked if uncertain. Pixel geometry and a valid ZIP do not certify typography, shadows, artwork quality or production readiness.

See [commands and schema](../../SCRAPBOOK-WORKFLOW.md).
