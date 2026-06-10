/**
 * rater-corpus-validator.ts — FC7 Gate Code Deliverable (Wave B)
 * Thread: H (Wave B execution)
 * Plan: SEMANTIC_MEMORY_V4_WAVE_B.md
 * Gate evidence: spec:S8:1, spec:IG8
 *
 * Raziel pre-execution validation gate (Call WB-2: code deliverable form elected).
 * Validates rater corpus YAML files before executeA1Harness() is invoked.
 *
 * fc7-resolution.md §5.1 gate check (VERBATIM):
 *   Array.isArray(rl.labels) && rl.labels.length > 0 MUST hold for every YAML
 *   at the rater corpus path before executeA1Harness() is invoked.
 *
 * fc7-resolution.md §5.2 race condition closure:
 *   Fail output is a structured ValidationResult, NOT a thrown TypeError.
 *   Static gate catches missing schema before harness invocation.
 *
 * Anti-race ordering (dep-map edge e09): spec:S8:1 → spec:S4:1
 *   validateRaterCorpus() MUST be called before executeA1Harness().
 *
 * BLOCK-1: corpus-rater.ts is a FROZEN iter5 Phase 1 production module.
 *   This gate lives here, NOT in corpus-rater.ts.
 *
 * PN-8: Wave B corpus path is iter7/ratings/ NOT iter5/ratings/.
 *   corpusPath parameter is required — no hardcoded default.
 *
 * authorized_by: T4 (Jonathan 2026-04-26T00:36:59Z — Wave B charter, deliverable #14)
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as yamlParse } from 'yaml';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A single violation: identifies the YAML file, missing field, and routing instruction.
 * fc7-resolution.md §5.2: structured error (NOT TypeError) on validation failure.
 */
export interface ValidationViolation {
  /** Absolute or relative path to the failing YAML file */
  file: string;
  /** The field that is missing or invalid */
  missingField: string;
  /** Routing instruction for the operator to resolve the violation */
  routingInstruction: string;
}

/**
 * Structured result returned by validateRaterCorpus().
 * fc7-resolution.md §5.1: pass → { passed: true }; fail → { passed: false, violations[] }
 */
export interface ValidationResult {
  /** true if all YAML files at corpusPath pass the labels[] check */
  passed: boolean;
  /** Present only when passed === false; describes each file that failed */
  violations?: ValidationViolation[];
}

// ── Validator ────────────────────────────────────────────────────────────────

/**
 * Validate rater corpus YAML files at corpusPath.
 *
 * fc7-resolution.md §5.1 gate check (VERBATIM):
 *   Array.isArray(rl.labels) && rl.labels.length > 0 MUST hold for every YAML.
 *
 * @param corpusPath - Path to the directory containing rater YAML files.
 *                     PN-8: Wave B uses iter7/ratings/; do NOT hardcode iter5/ratings/.
 * @param raterIds   - Optional list of rater IDs to validate. If provided, only files
 *                     matching {raterId}.yaml are validated. If absent, all *.yaml files
 *                     in corpusPath are validated.
 * @returns ValidationResult — { passed: true } or { passed: false, violations[] }
 *          NEVER throws (fc7-resolution.md §5.2 TypeError race condition closure).
 */
export function validateRaterCorpus(
  corpusPath: string,
  raterIds?: string[],
): ValidationResult {
  const violations: ValidationViolation[] = [];

  // Determine which files to validate
  let filesToCheck: string[];
  try {
    if (!existsSync(corpusPath)) {
      return {
        passed: false,
        violations: [
          {
            file: corpusPath,
            missingField: 'directory',
            routingInstruction:
              `Corpus directory does not exist at '${corpusPath}'. ` +
              `Create the directory and populate it with rater YAML files before invoking executeA1Harness().`,
          },
        ],
      };
    }

    const allFiles = readdirSync(corpusPath).filter((f) => f.endsWith('.yaml'));

    if (raterIds && raterIds.length > 0) {
      // Validate only the requested rater files
      filesToCheck = raterIds.map((id) => `${id}.yaml`);
    } else {
      filesToCheck = allFiles;
    }

    if (filesToCheck.length === 0) {
      return {
        passed: false,
        violations: [
          {
            file: corpusPath,
            missingField: 'labels',
            routingInstruction:
              `No YAML files found at '${corpusPath}'. ` +
              `Author and finalize at least one rater YAML (e.g., jonathan.yaml) before invoking executeA1Harness().`,
          },
        ],
      };
    }
  } catch (err) {
    // readdir failure — structured error, not thrown
    return {
      passed: false,
      violations: [
        {
          file: corpusPath,
          missingField: 'directory',
          routingInstruction:
            `Failed to read corpus directory '${corpusPath}': ${String(err)}. ` +
            `Ensure the directory exists and is readable.`,
        },
      ],
    };
  }

  // Validate each file: fc7-resolution.md §5.1 verbatim check
  for (const filename of filesToCheck) {
    const filePath = join(corpusPath, filename);

    // File existence check
    if (!existsSync(filePath)) {
      violations.push({
        file: filePath,
        missingField: 'file',
        routingInstruction:
          `Rater YAML file not found at '${filePath}'. ` +
          `Complete the rating session and write the file before invoking executeA1Harness().`,
      });
      continue;
    }

    // Parse YAML — structured error on parse failure, not thrown
    let rl: unknown;
    try {
      const raw = readFileSync(filePath, 'utf-8');
      rl = yamlParse(raw);
    } catch (err) {
      violations.push({
        file: filePath,
        missingField: 'yaml',
        routingInstruction:
          `Failed to parse '${filePath}': ${String(err)}. ` +
          `Ensure the file is valid YAML before invoking executeA1Harness().`,
      });
      continue;
    }

    if (!rl || typeof rl !== 'object') {
      violations.push({
        file: filePath,
        missingField: 'root',
        routingInstruction:
          `YAML root is null or not an object in '${filePath}'. ` +
          `Expected an object with raterId, finalized, and labels[] fields.`,
      });
      continue;
    }

    const raterLabels = rl as Record<string, unknown>;

    // fc7-resolution.md §5.1 VERBATIM gate check:
    //   Array.isArray(rl.labels) && rl.labels.length > 0 MUST hold
    if (!Array.isArray(raterLabels.labels)) {
      violations.push({
        file: filePath,
        missingField: 'labels',
        routingInstruction:
          `'labels' field is absent or not an array in '${filePath}'. ` +
          `FC7 forward standard requires labels[] to be a non-empty array. ` +
          `Add labels[] entries per rater-model-spec.md and re-run validateRaterCorpus().`,
      });
      continue;
    }

    if ((raterLabels.labels as unknown[]).length === 0) {
      violations.push({
        file: filePath,
        missingField: 'labels',
        routingInstruction:
          `'labels' array is empty in '${filePath}'. ` +
          `FC7 forward standard requires labels.length > 0 (at least 30 entries for kappa stability). ` +
          `Complete the rating session before invoking executeA1Harness().`,
      });
      continue;
    }

    // Additional required fields per spec:S4:0
    if (!raterLabels.raterId) {
      violations.push({
        file: filePath,
        missingField: 'raterId',
        routingInstruction:
          `'raterId' field absent in '${filePath}'. ` +
          `Set raterId to the rater's identifier (e.g., 'jonathan').`,
      });
    }

    if (raterLabels.finalized !== true) {
      violations.push({
        file: filePath,
        missingField: 'finalized',
        routingInstruction:
          `'finalized' is not true in '${filePath}'. ` +
          `Set finalized: true when the rating session is complete and locked.`,
      });
    }
  }

  if (violations.length > 0) {
    return { passed: false, violations };
  }

  return { passed: true };
}
