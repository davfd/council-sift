# claw-memory

Semantic memory subsystem for claw — extracted as a standalone package (iter9 Tier 9.0).

Provides 10 MCP tools: `remember`, `recall`, `forget`, `what_do_you_know_about`, `supersede`,
`mark-wrong`, `list-sources`, `recall_at_time`, `list_memories`, `corroborate`, `ingest_bulk`.

---

## Quick start

```bash
# 1. Install dependencies
npm install --no-optional

# 2. Configure environment
cp .env.example .env
# Edit .env: set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# 3. Start the intended Neo4j database and set NEO4J_URI explicitly
#    (Council memory production currently uses bolt://localhost:7688; do not rely on defaults)

# 4. Run the MCP server
npm run build:mcp
node dist/mcp/index.js
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NEO4J_URI` | **required** | Neo4j Bolt endpoint; no code fallback is allowed |
| `NEO4J_USER` | **required** | Neo4j username |
| `NEO4J_PASSWORD` | **required** | Neo4j password |
| `OPENAI_API_KEY` | *(absent)* | Enables semantic (vector) recall. Absent = text-pattern only. |
| `CLAW_RECALL_LIMIT_DEFAULT` | `50` | Default recall result limit |
| `CLAW_LLM_CLASSIFIER_TIMEOUT_MS` | `15000` | LLM classifier circuit-breaker timeout (ms) |
| `TRANSFORMERS_CACHE` | *(system default)* | Cache dir for Xenova/transformers models (see below) |

---

## Cross-encoder reranking and TRANSFORMERS_CACHE

When `rerank: true` is passed to the `recall` tool, claw-memory downloads and runs a local
cross-encoder model (`Xenova/ms-marco-MiniLM-L-6-v2`) via `@xenova/transformers` for ONNX
inference. This improves recall precision by scoring all candidate memories against the topic
query and returning the top-15.

### First-load model download

On first use, `@xenova/transformers` downloads the ONNX model from HuggingFace (~22MB).
The download happens silently during the first reranked recall call.

Default cache location:
- Linux/macOS: `~/.cache/huggingface/hub/`
- Windows: `%USERPROFILE%\.cache\huggingface\hub\`

### Persisting the cache with TRANSFORMERS_CACHE

Set `TRANSFORMERS_CACHE` to a custom directory to control where models are cached:

```bash
export TRANSFORMERS_CACHE=/path/to/persistent/cache
```

Example `.env` entry:
```
TRANSFORMERS_CACHE=/data/ml-cache/transformers
```

This is useful for:
- **Shared environments**: point multiple processes at the same cache directory
- **Constrained home dirs**: redirect cache to a larger volume
- **Container deployments**: pre-download and mount a model cache volume

### Air-gapped / CI deployment

To deploy without internet access:

1. **Pre-download** the model on a connected machine:
   ```bash
   TRANSFORMERS_CACHE=/my/cache node -e "
     const { pipeline } = require('@xenova/transformers');
     pipeline('text-classification', 'Xenova/ms-marco-MiniLM-L-6-v2').then(() => console.log('done'));
   "
   ```

2. **Copy** the cache directory to the air-gapped environment.

3. **Set** `TRANSFORMERS_CACHE` to point at the pre-downloaded cache.

4. If the model is unavailable (cache miss, download failure), `rerankResults()` is wrapped
   in a `try/catch` — reranking silently falls back to unreranked results. Recall still works;
   only the reranking step is skipped.

---

## Admin scripts

### orphan-sweep

Cleans up orphaned MemoryClaim nodes from crashed benchmark runs or stale tenant data.

```bash
# Dry run — see candidate count without deleting
npm run orphan-sweep -- --dry-run --prefix=iter9-bench-

# Wet run — DETACH DELETE matching nodes
npm run orphan-sweep -- --prefix=iter9-bench-
```

Options:
- `--dry-run`: Count candidates without deleting. Always run this first.
- `--prefix=<string>`: Filter by `project_root STARTS WITH <string>`. Required for wet runs.

---

## Running tests

```bash
# Unit + integration tests (requires running Neo4j)
npm test

# Targeted test file
npx vitest run tests/lexical-recall.test.ts
```

Tests require the repo-local `.env` to point at the intended test Neo4j instance. The Vitest setup loads `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD` explicitly and blocks accidental API spend unless `CLAW_MEMORY_TEST_KEEP_OPENAI=true`.
Per `feedback_parallel_test_contention`: run single-runner only — do NOT run vitest with
concurrent workers against a shared Neo4j instance.

---

*iter9 Tier 9.3 — claw-memory standalone package*
