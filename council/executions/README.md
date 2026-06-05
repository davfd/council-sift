# Trusted execution captures

`csift capture` writes hash-addressed trusted execution records here on the local machine.

These records can contain full stdout from official forensic evidence, so `*.json` capture files are intentionally ignored and must not be committed. The public repo commits the capture/verification code and regression tests, not redistributed evidence output.

A finding should reference a local capture via `execution_ref`; `csift record-finding` verifies the record hash, imports the exact captured output, stores only the bounded excerpt for LLM-skeptic context, and refuses ordinary caller-supplied `output` unless the caller explicitly marks legacy material as `STORED_OUTPUT_ONLY`.
