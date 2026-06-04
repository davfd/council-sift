"""DFIR-configured Council-SIFT identity gateway.

Encodes the architectural envelope for a forensic investigation:
  - the analyst agent may run read-only forensic tools and draft findings;
  - it may NOT approve/verify its own findings or unlock evidence (high authority → bilateral);
  - destructive tools are forbidden outright;
  - capabilities are HMAC-signed, tool-scoped, and expiring.
"""
import os

from kernel import Gateway, CapabilityIssuer

# Capability-signing secret. In a real deployment this comes from a secret store / env, never source.
# A test-only default is provided so the bypass suite and local demos run without setup; override with
# COUNCIL_SIFT_CAP_SECRET in any real use.
SECRET = os.environ.get("COUNCIL_SIFT_CAP_SECRET", "test-only-local-capability-secret")

ANALYST_RELATION = "analyst-of-record"
EXAMINER_RELATION = "examiner-of-record"

READ_TOOLS = {"fls", "mmls", "fsstat", "icat", "vol3", "yara", "hashdeep", "record_finding", "recall", "trace"}
HIGH_AUTHORITY_TOOLS = {"approve_finding", "council_verify", "unlock_evidence"}
FORBIDDEN_TOOLS = {"dd", "mkfs", "mkfs.ext4", "fdisk", "rm", "shutdown", "mount-rw", "wipefs", "mkfs.xfs"}


def build_gateway(now):
    issuer = CapabilityIssuer(SECRET, now)
    gw = Gateway(
        agent_id="council-sift",
        public_name="council-sift",
        recognized_relations={
            "agent:analyst": ANALYST_RELATION,
            "operator:examiner": EXAMINER_RELATION,
        },
        allowed_read_tools=READ_TOOLS,
        high_authority_tools=HIGH_AUTHORITY_TOOLS,
        forbidden_tools=FORBIDDEN_TOOLS,
        issuer=issuer,
        now=now,
    )
    return gw, issuer
