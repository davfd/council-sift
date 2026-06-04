#!/usr/bin/env python3
"""Live authorization gate — the Council-SIFT identity kernel running at the tool wrapper.

This makes the kernel *live*, not just a tested envelope: a command is scanned BEFORE it runs and
any destructive/forbidden tool (dd, mkfs, rm, wipefs, fdisk, shutdown, mount-rw, ...) is refused at
the kernel's Layer-1 (forbidden) decision, before it can reach the SIFT VM. Read/shell tooling passes
through unchanged, so this enforces the envelope without breaking ordinary forensic commands.

  authorize.py --scan-command "<full shell command>"   # used by bin/sift; exit 1 if a forbidden tool appears
  authorize.py --tool <tool> --authority read_only|high # single-tool decision (exit 0 allow / 1 refuse)

Exit 0 = ALLOW, non-zero = REFUSE. Decision JSON is printed to stderr.
"""
import argparse
import json
import os
import re
import shlex
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dfir_gateway import build_gateway, ANALYST_RELATION, FORBIDDEN_TOOLS  # noqa: E402
from kernel import Request  # noqa: E402

_SHELL_OPS = {"|", "||", "&&", ";", "&", "(", ")", "{", "}", "<", ">", ">>", "2>", "2>&1"}


def _candidate_tools(command, _depth=0):
    """Bareword tokens that could name a binary (plus basenames of pathful tokens). Recurses into
    quoted sub-commands (e.g. the string after `bash -lc`/`sh -c`) so nested destructive calls are seen."""
    try:
        toks = shlex.split(command, posix=True)
    except ValueError:
        toks = command.split()
    cands = set()
    for t in toks:
        if t in _SHELL_OPS:
            continue
        if (" " in t or "\t" in t) and _depth < 4:  # a quoted sub-command — scan inside it too
            cands |= _candidate_tools(t, _depth + 1)
            continue
        base = os.path.basename(t) if "/" in t else t
        if re.fullmatch(r"[A-Za-z][A-Za-z0-9._-]*", base):
            cands.add(base)
    return cands


def _forbidden_in_command(command, forbidden):
    """Defense-in-depth: a forbidden binary name appearing as a standalone word anywhere in the command
    (catches interpreter payloads like `python3 -c 'os.system(\"rm -rf /\")'` that tokenizing misses)."""
    hits = set()
    for name in forbidden:
        if re.search(r"(?<![\w.-])" + re.escape(name) + r"(?![\w-])", command):
            hits.add(name)
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--caller", default="agent:analyst")
    ap.add_argument("--tool")
    ap.add_argument("--authority", default="read_only")
    ap.add_argument("--scan-command")
    a = ap.parse_args()

    now = lambda: int(time.time())  # noqa: E731
    gw, iss = build_gateway(now)

    def decide(tool, authority):
        cap = iss.issue(a.caller, "council-sift", tool, now() + 60)
        return gw.authorize(Request(a.caller, "council-sift", ANALYST_RELATION, tool, authority, capability=cap))

    if a.scan_command is not None:
        candidates = _candidate_tools(a.scan_command) | _forbidden_in_command(a.scan_command, FORBIDDEN_TOOLS)
        for tool in sorted(candidates):
            d = decide(tool, "read_only")
            if (not d.allowed) and d.layer == "tool" and "forbidden" in d.reason:
                print(json.dumps({"refused_tool": tool, "reason": d.reason, "layer": d.layer}), file=sys.stderr)
                sys.exit(1)
        print(json.dumps({"allowed": True, "scanned": a.scan_command[:80]}), file=sys.stderr)
        sys.exit(0)

    if not a.tool:
        print("usage: authorize.py --scan-command \"<cmd>\" | --tool <tool> [--authority read_only|high]", file=sys.stderr)
        sys.exit(2)
    d = decide(a.tool, a.authority)
    print(json.dumps({"tool": a.tool, "allowed": d.allowed, "reason": d.reason, "layer": d.layer}), file=sys.stderr)
    sys.exit(0 if d.allowed else 1)


if __name__ == "__main__":
    main()
