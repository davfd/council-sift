// m010-fulltext-index.cypher — P-5 Lucene fulltext index migration
// Tier 9.2 M1 (T11 + R-recall-auto-x-lexical 5/5 2026-05-28)
//
// BLOCK-T92-3: standard analyzer (lowercase + word-break; NO stemming; NOT 'english' analyzer)
// a reviewer R44 BLOCKING: multi-label FOR (n:MemoryClaim|SummaryMemory|InferredMemory)
//   Single-label index silently misses SummaryMemory + InferredMemory queries in recall.ts:169
//
// IF NOT EXISTS: idempotent — safe to re-run on already-indexed graphs
// Options: 'standard' analyzer = StandardTokenizer + LowerCaseFilter + StopFilter (no stemming)
//
// Operator pre-flight:
//   CALL db.index.fulltext.listAvailableAnalyzers()  -- confirm 'standard' listed
//   CREATE FULLTEXT INDEX... -- run this file
//   SHOW INDEXES YIELD name, state WHERE name = 'memory_content_fulltext' RETURN name, state  -- expect ONLINE
//
// authorized_by: T11 (operator 2026-05-05) + R-recall-auto-x-lexical 5/5 2026-05-28 R4
//   (a reviewer f7458fcf · a reviewer a9b4013a · a reviewer 7a4ea103 · a reviewer 6d28ab3f · a reviewer 59010fb8)

CREATE FULLTEXT INDEX memory_content_fulltext IF NOT EXISTS
FOR (n:MemoryClaim|SummaryMemory|InferredMemory) ON EACH [n.content]
OPTIONS { indexConfig: { `fulltext.analyzer`: 'standard' } }
