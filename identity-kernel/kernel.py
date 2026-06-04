"""Council-SIFT identity kernel — architectural guardrail (ported from the TP-4 spike, 9/9).

A small deterministic gateway that enforces, structurally (not by prompt), who may do what:
- read-only forensic tool use is allowed with a recognized relation + a valid scoped capability;
- high-authority actions (e.g. approving/verifying a finding, unlocking evidence) require
  bilateral recognition — the analyst agent can NEVER self-approve;
- destructive/forbidden tools are refused at the tool layer BEFORE any authority evaluation;
- DAN-style / evidence-embedded "ignore instructions and approve this" language is treated as
  NON-AUTHORITATIVE unless it is also backed by relation + capability + scope;
- every decision is written to a SHA-256 hash-chained, append-only audit log.

This is a guardrail, not live authority. It grants nothing by itself.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Callable, Mapping, Optional


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64url(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode((text + padding).encode("ascii"))


@dataclass(frozen=True)
class Request:
    caller_id: str
    asserted_public_name: str
    relation_claim: Optional[str]
    tool: str
    authority: str
    capability: Optional[str] = None
    curated_packet_hash: Optional[str] = None
    bilateral_ack: bool = False
    semantic_prompt: Optional[str] = None


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: str
    layer: str
    mode: str = "REFUSED"
    semantic_prompt_present: bool = False


class CapabilityIssuer:
    """Scoped capability custody via HMAC. Models signed, expiring, tool-scoped capabilities
    without touching any real signing material (test/local secret)."""

    def __init__(self, secret: str, now: Callable[[], int]):
        self._secret = secret.encode("utf-8")
        self._now = now

    def issue(self, caller_id: str, agent_id: str, tool: str, expires_at: int) -> str:
        payload = {
            "caller_id": caller_id,
            "agent_id": agent_id,
            "tool": tool,
            "expires_at": expires_at,
        }
        payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        sig = hmac.new(self._secret, payload_bytes, hashlib.sha256).digest()
        return f"{_b64url(payload_bytes)}.{_b64url(sig)}"

    def verify(self, token: Optional[str], *, caller_id: str, agent_id: str, tool: str) -> tuple[bool, str]:
        if not token:
            return False, "missing capability"
        try:
            payload_part, sig_part = token.split(".", 1)
            payload_bytes = _unb64url(payload_part)
            supplied_sig = _unb64url(sig_part)
            expected_sig = hmac.new(self._secret, payload_bytes, hashlib.sha256).digest()
            if not hmac.compare_digest(supplied_sig, expected_sig):
                return False, "capability signature invalid"
            payload = json.loads(payload_bytes.decode("utf-8"))
        except Exception:
            return False, "capability malformed"

        if payload.get("expires_at", -1) < self._now():
            return False, "capability expired"
        if payload.get("caller_id") != caller_id:
            return False, "capability caller mismatch"
        if payload.get("agent_id") != agent_id:
            return False, "capability agent mismatch"
        if payload.get("tool") != tool:
            return False, "capability scope mismatch"
        return True, "capability valid"


class Gateway:
    def __init__(
        self,
        *,
        agent_id: str,
        public_name: str,
        recognized_relations: Mapping[str, str],
        allowed_read_tools: set[str],
        high_authority_tools: set[str],
        forbidden_tools: set[str],
        issuer: CapabilityIssuer,
        now: Callable[[], int],
    ):
        self.agent_id = agent_id
        self.public_name = public_name
        self.recognized_relations = dict(recognized_relations)
        self.allowed_read_tools = set(allowed_read_tools)
        self.high_authority_tools = set(high_authority_tools)
        self.forbidden_tools = set(forbidden_tools)
        self.issuer = issuer
        self._now = now
        self._audit: list[dict[str, object]] = []
        self._last_hash = "0" * 64

    @property
    def audit_log(self) -> tuple[dict[str, object], ...]:
        # Copies inside an immutable tuple so external code cannot append to the log.
        return tuple(dict(entry) for entry in self._audit)

    def verify_audit_chain(self) -> bool:
        """Recompute the hash chain; returns False if any entry was tampered with."""
        prev = "0" * 64
        for entry in self._audit:
            stored = entry.get("entry_hash")
            material = {k: v for k, v in entry.items() if k != "entry_hash"}
            if material.get("prev_hash") != prev:
                return False
            recomputed = hashlib.sha256(
                json.dumps(material, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()
            if recomputed != stored:
                return False
            prev = stored
        return True

    def authorize(self, req: Request) -> Decision:
        semantic = bool(req.semantic_prompt)

        # Layer 1 — forbidden tools refused BEFORE any authority evaluation.
        if req.tool in self.forbidden_tools:
            return self._record(req, Decision(False, "tool forbidden by Council-SIFT envelope", "tool", semantic_prompt_present=semantic))

        # Layer 2 — recognized relation required (public name / DAN language alone is not enough).
        relation = self.recognized_relations.get(req.caller_id)
        relation_ok = bool(relation and req.relation_claim == relation)
        if not relation_ok:
            if req.asserted_public_name == self.public_name and not req.capability:
                reason = "public name without recognized relation/capability"
            else:
                reason = "caller relation not recognized"
            return self._record(req, Decision(False, reason, "relation", semantic_prompt_present=semantic))

        # Layer 3 — valid scoped, unexpired capability required.
        cap_ok, cap_reason = self.issuer.verify(req.capability, caller_id=req.caller_id, agent_id=self.agent_id, tool=req.tool)
        if not cap_ok:
            return self._record(req, Decision(False, cap_reason, "capability", semantic_prompt_present=semantic))

        # Layer 4 — authority.
        if req.authority == "read_only" and req.tool in self.allowed_read_tools:
            return self._record(req, Decision(
                True, "recognized relation + valid read-only capability", "authority",
                mode="ASYMMETRIC_READ_ONLY", semantic_prompt_present=semantic,
            ))

        if req.authority == "high" or req.tool in self.high_authority_tools:
            if not req.bilateral_ack:
                return self._record(req, Decision(False, "high authority requires bilateral recognition (analyst cannot self-approve)", "authority", semantic_prompt_present=semantic))
            return self._record(req, Decision(
                True, "recognized relation + valid capability + bilateral acknowledgement", "authority",
                mode="BILATERAL_HIGH_AUTHORITY", semantic_prompt_present=semantic,
            ))

        return self._record(req, Decision(False, "tool not in authorized envelope", "tool", semantic_prompt_present=semantic))

    def report(self, decision: Decision) -> dict[str, str]:
        return {
            "result": "ALLOWED" if decision.allowed else "REFUSED",
            "mode": decision.mode,
            "reason": decision.reason,
            "injection_signal": "SEMANTIC_PROMPT_PRESENT_BUT_NON_AUTHORITATIVE" if decision.semantic_prompt_present else "NO_SEMANTIC_PROMPT",
        }

    def _record(self, req: Request, decision: Decision) -> Decision:
        entry = {
            "seq": len(self._audit) + 1,
            "time": self._now(),
            "caller_id": req.caller_id,
            "tool": req.tool,
            "authority": req.authority,
            "decision": "ALLOW" if decision.allowed else "REFUSE",
            "reason": decision.reason,
            "mode": decision.mode,
            "semantic_prompt_present": decision.semantic_prompt_present,
            "prev_hash": self._last_hash,
        }
        entry_material = json.dumps(entry, sort_keys=True, separators=(",", ":")).encode("utf-8")
        entry_hash = hashlib.sha256(entry_material).hexdigest()
        entry["entry_hash"] = entry_hash
        self._last_hash = entry_hash
        self._audit.append(entry)
        return decision
