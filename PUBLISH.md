# Pre-publish checklist (before pushing the public repo for Devpost)

The working tree is clean of redistributable risks, but **git history still contains the 36
`eval/corpus/` files** (they were tracked before the `.gitignore` was fixed). Do these steps before the
repo goes public.

## 1. Purge the derived official-evidence corpus from history

The corpus is derived from the organizer's evidence and must not be redistributed. Pick ONE:

**Option A — purge from history (keeps full commit history):**
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
git add -A                              # eval/corpus/ is git-ignored → NOT staged
git add -f council/receipts/*.json      # belt-and-suspenders: ensure the proof receipts are in
git commit -m "Council-SIFT — FIND EVIL! submission (public snapshot)"
# confirm receipts made it: git ls-files council/receipts | wc -l   # 41 (demo + genuine-run receipts)
# push public-main to the new public repo as its main branch
```

Verify nothing leaks:
```bash
git log --all --name-only --pretty=format: | sort -u | grep -E 'eval/corpus|\.env$|/evidence/' || echo "clean"
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
- `README.md` line "push public before submitting" → replace with the live public URL.

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
