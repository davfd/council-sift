# Novelty & Provenance (FIND EVIL! Stage-One / IP)

Per the hackathon rules, pre-existing open-source libraries may be used as a foundation provided the
**novel contribution is clearly documented** and the submission is substantially new work created
during the hackathon window.

## Foundation (pre-existing, our own open-source components)

- **`claw-memory-core/`** — a generic Neo4j semantic-memory engine (MemoryClaim / ConflictRecord /
  VerificationRecord, append-only governance strata, `content_sha256`, provenance edges). Extracted
  **seed-free** for this submission: no Leonardo seed/framework, no Discord daemon, no council-seat
  personas. The identity configs were replaced with DFIR identities, and the vendored historical
  migrations were genericized (no prior-project persona names; they no-op on a fresh DFIR graph).
- **Identity kernel** (`identity-kernel/kernel.py`) — ported from our prior "TP-4" capability-gateway
  spike (HMAC scoped capabilities, bilateral recognition, hash-chained audit).

## Novel hackathon work (created for FIND EVIL!)

- The **DFIR claim schema** (4-part finding: observation / interpretation / confidence /
  `evidence_pointer` with `output_sha256`) and the `csift` bridge (`record-finding` / `trace` /
  `refute`) that writes findings through the engine with purpose-built `ToolExecution` provenance.
- The **forensic verifier Council** — the Citation seat (deterministic cited-token-resolution against
  tool output), Synthesis adjudication, and the **self-correction bounce** loop.
- The **Council Receipt** — a hash-chained, machine-re-verifiable certificate per finding.
- The **DFIR identity envelope + bypass suite** (`tests/test_bypass.py`, 12/12): analyst-cannot-self-
  approve, evidence-prompt-injection refusal, forbidden-tool refusal, capability forgery/expiry/scope.
- The **Council-OFF vs Council-ON ablation** + Accuracy Report, and integration with the
  SIFT Workstation toolchain (real `fls`/Sleuth Kit execution in the VM).
- The **two-tier verification design**: a hardened **deterministic precision floor** (token-boundary
  citation that defeats substring-citation exploits; clause-local negation/disclaimer handling that
  defeats the stray-negation and soft-hedge bypasses; broadened tool-semantics/inference
  vocabularies) **plus** an **additive LLM skeptic panel** (`council/llm_skeptic.mjs`) — three
  independent lenses, **≥2/3 majority**, that can only *add* a bounce to a floor-passed finding and
  never rescue a refuted one. The panel is reported as additive recall evidence, with its own
  precision/FP measurements, not as a global FP=0 guarantee. Backed by the regression evasion suite
  (`eval/adversarial_evasions.mjs`), a deterministic gate-logic test (`eval/skeptic_panel_test.mjs`),
  and a live demonstration (`eval/skeptic_live_demo.mjs`).

## Positioning

Council-SIFT adds the **correctness** layer that autonomous DFIR usually leaves to the human: it refutes
unsupported or hallucinated claims **before** human review and proves, per finding, why the claim earned
approval. It is **complementary** to an existing human HMAC-approval step (such as the reference Valhuntir
submission) — findings that pass the Council remain compatible with that sign-off flow.

## Seed-governance boundary

No private seed-governance or framework internals appear anywhere in this repository. The public artifacts
contain only the generic engine, the DFIR layer, and council-safe mechanism. The isolated graph (Neo4j @
7690) is never the Leonardo or live-council graph.

## License

MIT (see [LICENSE](LICENSE)).
