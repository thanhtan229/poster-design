# TinixPoster: ChatGPT-to-Codex Windows bridge — discovery phase

**Status:** PROPOSAL / READ-ONLY PROBE ONLY. No Windows installation, no daemon, no polling worker, no auto-execution and no production integration.

**Owner approval (2026-11-27):** investigate how Codex is currently running on TINIWIN01 and select the least disruptive bridge to reduce manual prompt/report transfers. This approval does **not** authorize remote shell access or unattended execution.

## Why this exists

ChatGPT can read and write GitHub through the connected repository app. ChatGPT cannot, from this conversation, invoke the already-running Codex Desktop session or issue terminal commands on TINIWIN01. Currently the owner manually carries prompts to Codex and carries Codex reports back. The point of the bridge is to remove repetitive copying while retaining approvals.

The existing repo `thanhtan229/poster-design` is **public**. Never place private execution requests, secrets, local paths, customer media, complete command logs, or credential material in PR comments, files, GitHub Actions artifacts, or other public repository surfaces. A future command queue needs a separately provisioned **private** control plane or equivalently protected channel.

## Candidate integration routes

| Route | What it does | Limits | Recommendation |
|---|---|---|---|
| Native `codex queue` | Adds a text message to an existing CLI session by its ID/name. | Needs the correct Codex CLI version and session accessible to the local daemon. This is **not proof** that an unrelated Desktop GUI thread can be queued. No remote ChatGPT connectivity by itself. | Check first if the goal is continuing the same session. |
| `codex exec` / `@openai/codex-sdk` | Starts, streams and resumes dedicated coding tasks using official CLI/SDK. | Need installed/authenticated Codex, Windows runtime tests, sandbox/worktree isolation. Does not automatically attach to the current desktop GUI. | **Preferred first automation engine** for independent, auditable jobs. |
| `codex app-server` / remote-control | More detailed client protocol / remote TUI, approvals and events. | Protocol/server configuration, authentication, exposure and version/eligibility risks. Not a native ChatGPT connector in this conversation. | Defer unless native CLI/SDK is inadequate. |
| GitHub as transport | ChatGPT posts approved jobs; local Windows worker polls and reports redacted status. | Public repository is unsuitable for confidential jobs. Requires private queue, credentials, replay protection and approval policy. | Future minimal transport after Windows capability probe. |

Official references (check at build time):
- https://learn.chatgpt.com/docs/cli/reference
- https://learn.chatgpt.com/docs/non-interactive-mode
- https://learn.chatgpt.com/docs/codex-sdk
- https://learn.chatgpt.com/docs/app-server

## Stage 0 — read-only Windows discovery (this draft PR)

Run **only when the owner instructs Codex on TINIWIN01** from a clean QA checkout, preferably the draft-PR branch. Does not need administrator privileges:

```powershell
powershell -NoProfile -File scripts/codex-bridge-preflight.ps1
```

The script calls only version/help commands, counts Codex processes and prints a JSON report. It does not inspect login tokens, `auth.json`, environment secrets, credentials, CLI configuration or session content. It does not start/attach/resume/queue Codex, open a listener, install services, register tasks, or change UAC. **Review JSON before publishing** (in case a third-party CLI version embeds private information in its version string). If an executable is not on PATH, record missing rather than searching sensitive directories automatically.

Codex should also **manually inspect, read-only**:
1. Whether Codex Desktop GUI, Codex CLI, and any background app-server are actually installed and running; report installed product/version and whether the processes appear to share a session (don't infer from a CLI command's presence).
2. Whether `codex queue` has access to the **same known existing** coding session, without sending a message yet. If uncertain, mark unknown.
3. How the existing Codex is authenticated **at a high level only** (ChatGPT login vs API key vs unknown), without reading or printing any token or credential file.
4. Whether GitHub notifications/PR comments can be read from the Windows QA environment using **least privilege**, without creating or exposing a personal access token during discovery.
5. Whether the codex worktree is linked to the live `tinix-build` or app 7001 checkout; never interfere with or resume a busy desktop session during probe.

Save no secrets and never expose user-specific paths, usernames, SID, authentication, or media in public GitHub comments. Record only capability booleans and compatibility observations.

### Stage 0 pass gate

An owner-reviewed report identifies:
- Codex Desktop/CLI versions, which of `queue`, `exec`, `remote-control`, and `app-server` are supported;
- feasibility of using the existing session versus creating a dedicated isolated worker thread;
- authentication availability without disclosing credentials;
- whether Windows can run an isolated process with a non-admin, minimum-permission context;
- any blockers, especially TINIWIN01 UAC configuration (`EnableLUA=0`) and existing app/Task Scheduler isolation.

**If CLI is absent, don't install or change PATH automatically; report the limitation.** It may be simpler to use the existing Codex Desktop/remote-control workflow than to deploy a separate agent.

## Stage 1 — private control plane (requires new explicit approval)

Only after Stage 0 review:
- Provision **a private repo or protected API**, not this public repo; minimize token scope to task read/status write.
- Define a JSON task envelope with UUID, requester, created_at, expiry, target repo, immutable base SHA, explicit task class and approval status. No arbitrary raw shell field. Protect against replay and unauthorized authors. Never execute untrusted text just because it is a PR comment.
- Owner-approved task classes: repository inspect, plan, isolated code+tests and draft PR. The first validation task must be harmless read-only.
- Require an allowlist of repositories and workspaces; use clean, detached QA worktrees; one active job per target repo; cap runtime and output. Deny writes to live `tinix-build`, the real backup, Task Scheduler, app 7001, tunnel and credentials.
- Local worker **polls outbound** for approved task envelopes; does not expose a public listener or WebSocket; outputs redacted heartbeats/results and approval requests to the private channel. No automatically accepted escalations.
- Engine is Codex SDK or `codex exec` with explicit workspace sandbox and no automatic high-privilege grant. Use `codex queue` only after confirming the named existing session is suitable.

## Stage 2 — monitored pilot (separately approved)

Run one owner-approved, no-write task from ChatGPT -> protected queue -> Windows QA runner -> status/result -> GitHub. Validate identity, TTL, idempotency, fail-closed behavior, approval gates, and complete audit. A later task may create a draft PR, but **never merge, deploy or alter Windows services automatically**.

**Important limitation:** Connecting the worker to GitHub does not itself make this ChatGPT conversation run continuously. The agent can report to GitHub, and ChatGPT can inspect results on a later turn. Truly automatic ongoing chat follow-up requires a separate supported scheduling/agent mechanism.

## Current project boundaries

Windows `TINIWIN01` has app 7001 and existing backup Task Scheduler; R1A historical 19-Nov snapshot remains INCOMPLETE. R1A synthetic Windows test passed 24/24 before the later Scheduled Task token guard was blocked by `EnableLUA=0`. No bridge development stage overrides those safety gates, triggers real backup, changes UAC or resumes the desktop session.
