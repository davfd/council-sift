// m021-council-memory-governance-strata-2026-06-01.cypher
//
// Marks the mixed pre-repair Council memory corpus without deleting or rewriting
// historical testimony. This closes the governance ambiguity found during the
// formal-deposit reliability audit: old nodes with null source_identity remain
// available for recall, but they are explicitly non-authoritative for formal
// Council governance unless later reconciled by a separate evidence-backed record.
//
// Forward formal deposits retain their explicit formal stratum. Present-wrong-type
// formal nodes are flagged, not hidden. Null source_identity is never backfilled
// as fact here; it is recorded as legacy missing provenance.
//
// Idempotent and non-clobbering: this migration must stay semantically aligned
// with tools/council-memory-stratify-legacy.mjs and remember.ts forward writes.
// Existing governance fields are preserved with coalesce().

MATCH (n)
WHERE any(l IN labels(n) WHERE l IN ['MemoryClaim','SummaryMemory','InferredMemory'])
WITH n,
     labels(n) AS labels,
     coalesce(n.formal_deposit,false) AS formal,
     CASE
       WHEN n.source_identity STARTS WITH 'council-seat:' THEN substring(n.source_identity, size('council-seat:'))
       ELSE NULL
     END AS sourceSeat,
     CASE
       WHEN n.owner_seat STARTS WITH 'seat:' THEN substring(n.owner_seat, size('seat:'))
       ELSE NULL
     END AS ownerSeatName
WITH n,
     labels,
     formal,
     (sourceSeat IS NOT NULL AND ownerSeatName IS NOT NULL AND sourceSeat = ownerSeatName) AS identityVerified,
     (formal = true
       AND 'MemoryClaim' IN labels
       AND n.memory_type = 'MemoryClaim'
       AND n.writer_path = 'council-cc'
       AND coalesce(n.source_artifact_ref, '') STARTS WITH 'discord://'
       AND sourceSeat IS NOT NULL
       AND ownerSeatName IS NOT NULL
       AND sourceSeat = ownerSeatName) AS verifiedCouncilCcCapture
SET n.governance_stratum = coalesce(n.governance_stratum, CASE
      WHEN formal = true THEN 'formal_deposit'
      WHEN n.source_identity IS NULL THEN 'legacy_pre_source_identity'
      ELSE 'informal_memory'
    END),
    n.source_identity_status = coalesce(n.source_identity_status, CASE
      WHEN n.source_identity IS NULL THEN 'missing_legacy_not_backfilled'
      WHEN identityVerified THEN 'verified'
      ELSE 'present'
    END),
    n.reconciliation_status = coalesce(n.reconciliation_status, CASE
      WHEN formal = true
        AND (NOT 'MemoryClaim' IN labels OR n.memory_type <> 'MemoryClaim')
        THEN 'formal_wrong_type_requires_reconciliation'
      WHEN verifiedCouncilCcCapture
        THEN 'formal_verified_shape_or_runtime_verifiable'
      WHEN formal = true
        THEN 'formal_advisory_not_authoritative_council_cc_capture'
      WHEN n.source_identity IS NULL
        THEN 'legacy_not_authoritative_for_formal_governance'
      ELSE 'not_required'
    END),
    n.governance_stratified_at = coalesce(n.governance_stratified_at, datetime()),
    n.governance_stratification_policy = coalesce(n.governance_stratification_policy, 'council-memory-stratify-legacy-v1');
