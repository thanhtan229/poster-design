# Scheduled TinixPoster backup: archive reliability gate

The latest `TinixPoster Backup` task on TINIWIN01 was reported failing during static compression, but the exact Windows tar stderr and last Task Scheduler exit code have not been provided to this repository review. **Do not claim a proven root cause until the host log is inspected.**

This PR changes only backup archive tooling and tests:
- Prefer Windows system `%SystemRoot%\System32\tar.exe` over ambient PATH; allow `TINIX_TAR_BIN` override for explicit QA
- Capture diagnostic status and stderr when tar fails; don't silently accept nonexistent or zero-byte archives
- Verify `tar -tzf` can read the generated archive and that excluded `fonts/`, `font-previews/` and unused uploads are not included
- Fail the run if the source static directory is absent, while retaining all prior good backups; the existing backup cleanup only removes the new incomplete attempt
- Verify behavior with synthetic non-customer fixtures in GitHub Actions

**Windows validation before enabling in the actual schedule:** inspect existing `backups/schedule.log` and Scheduled Task `LastTaskResult`; run a backup against a copied synthetic DB + static root with `TINIX_DB`, `TINIX_STATIC_DIR`, `TINIX_BACKUP_DIR` and only then test the scheduled task with production roots. Validate `poster.db integrity_check`, `tar -tzf`, the static file manifest/hash and last 10 backups kept. Do not remove valid old backups or replace the existing schedule without owner approval. Record backup summary and root cause with stderr sanitized.

This PR does **not** modify application, tunnel, MCP, Skill, or any customer files. It does not fix unknown environment-specific tar failures until the host rerun passes.

## Windows filenames with Unicode

[TINIX] ASCII-only snapshots retain the Windows System32 tar path. If an eligible file or directory has a non-ASCII name, Windows backup uses the Python 3.11+ standard library to pack UTF-8 PAX and verify an isolated restore against the original path set and SHA-256 inventory. System32 tar can exit 0 while decoding legacy GNU names as CP437, and may fail while creating an archive with Unicode filenames.

The backup account must resolve Python 3.11+ as `python`, or set `TINIX_BACKUP_PYTHON` to the absolute interpreter path in its process environment. No pip packages or code-page changes are required. Verify runtime availability under the scheduled account before rollout. Missing Python fails closed and preserves older snapshots. Linux retains the existing tar dependency.

To verify a Unicode or legacy GNU/UTF-8 archive offline, extract into a fresh directory outside live and backup roots.

```powershell
python -B scripts/tinix-backup-unicode.py restore <static.tar.gz> <new-offline-directory>
```

The helper validates members and paths before creating the restore directory. Validate the database-to-static references separately. Treat a failed restore directory as incomplete.

## R1A revised gate — disposable experimental baseline (owner approved 2026-11-27)

The owner confirmed the repo and currently stored TinixPoster data are **experimental**, and recovering the 36 missing historic collage assets is **not required**. Stop the proposed R1A-A.2 historical forensic search. Do not classify the 19-Nov restore as a success: it remains **INCOMPLETE**, with 34 active test references and 2 historical references absent from the original archive and 0/36 original byte payloads independently identified in the approved QA copy. This is an accepted limitation of the **historical test data**, not a reason to waive archive-integrity checks.

The new, separately evaluated R1A target is **a fresh disposable test dataset** with intentionally complete references. Do not use the 19-Nov dataset as this acceptance fixture.

- Build an isolated SQLite DB + collage/static test tree + approved print(s). Include realistic non-ASCII file names; only synthetic bytes and names.
- Take a backup with dedicated `TINIX_DB`, `TINIX_STATIC_DIR`, `TINIX_BACKUP_DIR` and a distinct `--copy-to` mirror location. Do **not** point these to live roots or historical retention.
- Independently restore the DB/static and prints; require SQLite full `integrity_check`, exactly the expected relative names, SHA-256 for **every included file**, DB-to-static references, declared font/unused-upload exclusions, and byte-identical mirror files.
- Require error-on-unsafe-path and error-on-corrupt-archive behavior; preserve prior valid snapshots on any failure.
- The repeatable code/CI gate is `node --test scripts/tinix-backup-archive.test.mjs scripts/tinix-backup-process.test.mjs scripts/tinix-backup-fresh-baseline.test.mjs`. Run on Linux and Windows. A CI PASS applies **only to synthetic test data**, not to any real Scheduled Task identity or host rollout.
- Publish evidence with exact commit SHA, test count, OS, archive/restore/hash verification result and any failures. If successful, label **R1A-SYNTHETIC PASS**; never retroactively mark **R1A-19NOV PASS**.
- Host-level separate rehearsal, Python 3.11+ availability under the actual Scheduled Task account, and any Scheduled Task edit/run or data snapshot remain distinct, later approval/verification gates. Do not merge a PR automatically, deploy app 7001, restart the MCP tunnel, refresh connector, update Skill, or modify any existing customer/design data.

The prior R1A-A -> R1A-B dependency for recovering the **historical 19-Nov snapshot** is superseded for experimental test-baseline development. This **does not** authorize a new live-data R1A-B production-root snapshot, overwrite of the old snapshot/checkpoint, or release of R1B app rollback.
