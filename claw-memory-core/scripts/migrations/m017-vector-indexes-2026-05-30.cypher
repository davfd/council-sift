// m017-vector-indexes-2026-05-30.cypher
//
// Create the three VECTOR indexes that semantic_recall.ts:44 (VECTOR_INDEXES constant)
// queries via `db.index.vector.queryNodes(...)`. Without these indexes, every
// semantic recall call throws and the handler falls through to text-pattern
// (semantic_recall.ts catch block at line 254).
//
// On operator's dev instance these indexes were created out-of-band early in
// iter8. Fresh installs (post-iter9 Tier 9.0 standalone refactor) need them
// applied as a migration step. Surfaced empirically during the brother-instance
// internal-review 2026-05-30 deployment.
//
// Dimensions: 3072 (text-embedding-3-large default)
// Similarity: cosine
//
// authorized_by: internal-review 2026-05-30
//   (5/5 operator council deliberation; no canonical install-procedure change
//    required beyond adding this tracking migration so future fresh installs
//    are self-sufficient)

CREATE VECTOR INDEX idx_mem_claim_embedding IF NOT EXISTS
FOR (n:MemoryClaim) ON (n.embedding)
OPTIONS { indexConfig: { `vector.dimensions`: 3072, `vector.similarity_function`: 'cosine' } };

CREATE VECTOR INDEX idx_summary_mem_embedding IF NOT EXISTS
FOR (n:SummaryMemory) ON (n.embedding)
OPTIONS { indexConfig: { `vector.dimensions`: 3072, `vector.similarity_function`: 'cosine' } };

CREATE VECTOR INDEX idx_inferred_mem_embedding IF NOT EXISTS
FOR (n:InferredMemory) ON (n.embedding)
OPTIONS { indexConfig: { `vector.dimensions`: 3072, `vector.similarity_function`: 'cosine' } };
