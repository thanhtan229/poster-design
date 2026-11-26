# P1 integration evidence

The three leftmost panels in [previews.jpg](previews.jpg) are the three generated synthetic demos. The rightmost panel is the stored TinixPoster render of Demo B with six photo slots and an independent SUBJECT.

[test-results.json](test-results.json) records both batches, seven shared illustration hashes, complete kit and manifest hashes, asset reuse, bytes and separate demo/export timings. The samples include one brief-only batch and one batch supplied with seven synthetic images through the MCP attachment interface, using a mocked download response. No AI or customer images were used.

Local MCP integration opened the real server with the SDK and compared all 14 original tool schemas with the [P0 snapshot](../p0/mcp-local-tools.json). It confirmed only one selected job was built, the delivered ZIP bytes match the pre-approval ZIP, and tampering blocks source QA. The existing template workflow passed separately. The existing customer workflow imported, filled six photo slots and SUBJECT, and returned six crop rows with synthetic images and a stub for BiRefNet only.

TinixPoster suite passed 38/38 on the feature branch. ChatGPT web publication and downloads are **not verified**. Do not treat the synthetic artistic previews or structural pass as production visual QA.

Run locally with TinixPoster on port 7001 and Python 3.11+ with the dependencies in the [workflow documentation](../../SCRAPBOOK-WORKFLOW.md).

```sh
node scripts/tinix-mcp/generated-workflow.test.mjs .runtime/scrapbook-p1-test
python -B scripts/tinix-mcp/workflow_compositions_test.py
npm run tinix:test
```
