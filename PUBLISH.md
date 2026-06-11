# Public-repo hygiene checklist

The current submission lineage is published and clean of `eval/corpus/` (`HEAD`, `origin/main`, and
`origin/tier3-pristine-2026-06-05` all verify clean after `git fetch --all --prune`). A **local archive ref**
(`main-dev-archive`) still contains 36 historical `eval/corpus/` paths. Do **not** push with `--all`,
`--mirror`, or by copying `.git`; publish only the verified clean branch or a clean orphan snapshot.

## 1. Keep the derived official-evidence corpus out of the public history

The corpus is derived from the organizer's evidence and must not be redistributed. Pick ONE:

**Option 0 — push the current clean lineage only (fastest if `HEAD` is the final state):**
```bash
cd ~/council-sift
git fetch --all --prune
git log HEAD --name-only --pretty=format: -- eval/corpus | grep eval/corpus && exit 1 || echo "HEAD clean"
git log origin/main --name-only --pretty=format: -- eval/corpus | grep eval/corpus && exit 1 || echo "origin/main clean"
# if any later video-URL/docs edits are committed:
git push origin HEAD:main
```
**Option A — purge from all local refs (keeps full commit history, only needed if you must publish every ref):**
```bash
pip install git-filter-repo
cd ~/council-sift
git filter-repo --path eval/corpus --invert-paths --force
# re-add the remote afterwards (filter-repo drops it)
```

**Option B — publish a clean squashed snapshot (simplest):**
```bash
cd ~/council-sift
git checkout --orphan public-main
git rm -r --cached .                    # start the root commit from the public .gitignore, not the old index
git add -A                              # eval/corpus/ and local scratch are git-ignored → NOT staged
# Receipt scope for this submission: operator-approved all public proof receipts.
# Force-add ignored ROCBA-DISK/MEM receipts when they are part of the intended public proof set:
# git add -f council/receipts/F-analyst-ROCBA-DISK-*.json council/receipts/F-analyst-ROCBA-MEM-*.json
# Exclude local publication-scaffold audit reports; they are ignored in .gitignore.
git commit -m "Council-SIFT — FIND EVIL! submission (public snapshot)"
# confirm receipts made it: git ls-files council/receipts | wc -l
# push public-main to the public repo main branch only; never --all or --mirror
```

Verify nothing leaks on the branch you will push (in this development clone, `--all` still includes old private/dev refs):
```bash
git log public-main --name-only --pretty=format: | sort -u | grep -E 'eval/corpus|\.env$|/evidence/' || echo "clean"
# After push, also verify from a fresh clone of the public repo/branch.
```

## 2. Secrets review (none are real, but confirm)

- `claw-memory-core/.env` — git-ignored (verify: `git check-ignore claw-memory-core/.env`).
- Neo4j password `councilsiftpw` in README/migrate — a **local-only default** for the isolated 7690
  container; fine to ship, but you may parameterize it.
- Identity-kernel capability secret — now read from `COUNCIL_SIFT_CAP_SECRET` (test-only default in
  source). Set a real value in any real deployment.
- The SIFT sudo string `forensics` in the demo scripts is the **public default SIFT Workstation
  credential** (documented by SANS), not a secret.

## 3. Repo metadata

- Confirm the MIT `LICENSE` shows in the GitHub "About".
- Set the repo description + topics (dfir, forensics, sans, agentic, claude).
- Confirm the README public-repo row and clone command point at the live public URL.

## 4. Demo video (mandatory, < 5 min, terminal + audio)

Follow [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — it now uses **official SRL-2018 evidence** for the
self-correction sequence (`analyst/srl_memory_demo.sh`), `csift trace --rerun`, the autonomous log, a
live `bin/sift` destructive-tool refusal, and the at-scale + external benchmark headlines. Link it in the
README and on Devpost.

## 5. Final coherence pass

```bash
set -a; source claw-memory-core/.env; set +a
(cd claw-memory-core && npm run build)
node eval/smoke_lifecycle.mjs && node eval/ablation.mjs && node eval/bench_real.mjs && python3 tests/test_bypass.py
git status   # working tree clean; accuracy-report/ committed
```
Note: `eval/vigia_score.mjs` makes **live LLM** calls and is **nondeterministic** — the committed
`accuracy-report/vigia_external_report.*` is one canonical run; a re-run will vary slightly. That is
expected and documented in the report's honesty section.
