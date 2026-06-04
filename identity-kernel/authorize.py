#!/usr/bin/env python3
"""Live authorization gate — the Council-SIFT identity kernel at the tool wrapper.

`bin/sift` runs this on every command BEFORE execution. It is **default-deny**: a command is allowed only
if EVERY binary in command position is on the kernel's read-only allowlist (`dfir_gateway.READ_TOOLS`), no
destructive binary appears anywhere, and no dual-use / obfuscation / write-to-evidence pattern is present.
Anything not explicitly allowed is refused — so evidence-mutating or unknown tools (shred, truncate, parted,
blkdiscard, sgdisk, tune2fs, `cp`/`mv` over an image, `tee /dev/sda`, `find -delete`, `sed -i`, a
base64-obfuscated `rm`, `python -c 'os.unlink(...)'`, …) are refused, not just a handful of denylisted names.

  authorize.py --scan-command "<full shell command>"   # used by bin/sift; exit 1 = REFUSE
  authorize.py --tool <tool> --authority read_only|high # single-tool kernel decision

Defense-in-depth, not the only guarantee: evidence is ALSO mounted read-only (QEMU `virtfs readonly=on` +
9p `ro`), so the OS itself refuses writes to evidence regardless of the command. This gate is the tool-layer
boundary. A static command scanner cannot defeat arbitrary runtime-decoded payloads — the read-only mount is
the backstop for that, which is why we refuse decode-and-run / sub-shell / command-substitution outright.
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

_SEPS = {"|", "||", "&&", ";", "&", "\n"}  # shell separators (as standalone shlex tokens)
# wrappers that precede the real binary (skip to the next word to find the command)
_WRAPPERS = {"sudo", "time", "env", "nice", "ionice", "timeout", "command", "builtin", "exec",
             "xargs", "then", "do", "else", "elif", "stdbuf", "setsid", "doas"}

# Patterns an allowlisted-but-dual-use tool (or obfuscation) could still use to harm evidence → refuse.
_DANGER = [
    (re.compile(r"\$\(|`"), "command substitution (obfuscation)"),
    (re.compile(r"\b(base64|xxd|uudecode|openssl)\b\s*(--decode|-d|-r|-D)\b"), "decode-and-run obfuscation"),
    (re.compile(r"\beval\b"), "eval"),
    (re.compile(r"(^|[|;&]\s*|sudo\s+)(bash|sh|zsh|dash|ksh|csh|tcsh)\b"), "sub-shell interpreter"),
    (re.compile(r"\bsed\b[^|;&]*\s-[a-zA-Z]*i"), "sed in-place edit (-i)"),
    (re.compile(r"\bfind\b[^|;&]*\s-(delete|exec|execdir|fprint|fprintf|fls|ok|okdir)\b"), "find delete/exec"),
    (re.compile(r"\b(perl|ruby|node|php)\b\s+-[a-zA-Z]*[eiE]"), "interpreter inline-exec (-e/-i)"),
    (re.compile(r"\b(os\.system|os\.unlink|os\.remove|os\.rmdir|os\.truncate|shutil\.rmtree|shutil\.move|subprocess|Popen|__import__)\b"), "destructive script call"),
    (re.compile(r">>?\s*/dev/"), "redirect to a device"),
    (re.compile(r">>?\s*[^\s|;&]*\.(E01|e01|aff|aff4|s01|l01|001|img|dd|raw|mem|vmem|bin)\b"), "redirect over an image/dump"),
    (re.compile(r">>?\s*[^\s|;&]*/(mnt/)?evidence\b"), "redirect into evidence"),
    (re.compile(r"\bsystem\s*\("), "shell-out via system() (awk/perl/tcl)"),
    (re.compile(r"\b(chmod|chown|chgrp|mkdir|rmdir|touch|fallocate)\b[^|;&]*\s/?(dev|mnt/evidence|evidence)\b"), "mutate device/evidence"),
]


# A tool's own write/extract flag whose VALUE is a path (starts with /). Used to refuse writes that
# target evidence or a device via the tool's native flag (vol --output-dir /evidence, tar -C /evidence,
# unzip -d /evidence, -o/evidence). Numeric values (fls -o 0) don't start with / so they never match.
_WRITE_FLAG = re.compile(
    r"(?:--output-dir|--out-dir|--dump-dir|--output|--export-dir|--save-dir|--directory|--exdir"
    r"|-C|-D|-d|-o|-O)\s*=?\s*['\"]?(/\S+)")
# An evidence/device path that is OUTPUT (a dir/device), not an INPUT file being read (archive/image ext).
_EVID_DEV = re.compile(r"^/?(dev/|mnt/evidence|evidence)")
_INPUT_EXT = re.compile(r"\.(zip|7z|gz|bz2|xz|tar|tgz|tbz|e01|aff4?|s01|l01|img|dd|raw|mem|vmem|001|bin)$", re.I)


def _writes_into_evidence(cmd):
    for m in _WRITE_FLAG.finditer(cmd):
        val = m.group(1).strip("'\"")
        if _EVID_DEV.match(val) and not _INPUT_EXT.search(val):
            return m.group(0)[:48]
    return None


def _command_words(cmd):
    """The set of binaries in COMMAND position. shlex tokenizes quote-aware (so a `|` inside a quoted
    regex like grep -E "a|b" is one token, not a separator); we then walk tokens, treat standalone
    separators as 'next token is a command', and skip wrappers (sudo/xargs/...) and leading flags."""
    try:
        toks = shlex.split(cmd, posix=True)
    except ValueError:
        toks = cmd.split()
    words = set()
    expect = True
    for t in toks:
        if t in _SEPS:
            expect = True
            continue
        if not expect:
            continue
        base = os.path.basename(t) if "/" in t else t
        if re.match(r"^[A-Za-z_]\w*=", base):   # VAR=value assignment prefix → still expecting the command
            continue
        if base in _WRAPPERS:                    # sudo/xargs/time/... → the real command is a later token
            continue
        if base.startswith("-"):                 # a flag (e.g. sudo -S) → keep looking for the binary
            continue
        words.add(base)
        expect = False
    return words


def _all_tokens(cmd, _depth=0):
    try:
        toks = shlex.split(cmd, posix=True)
    except ValueError:
        toks = cmd.split()
    out = set()
    for t in toks:
        if (" " in t or "\t" in t) and _depth < 4:   # recurse into quoted sub-commands
            out |= _all_tokens(t, _depth + 1)
            continue
        out.add(os.path.basename(t) if "/" in t else t)
    return out


def scan(cmd, gw, iss, caller):
    # 1) obfuscation / dual-use / write-to-evidence patterns
    for rx, why in _DANGER:
        if rx.search(cmd):
            return False, {"refused": why}
    # tool-native write/extract into evidence or a device (distinguishes an output dir from an input file)
    w = _writes_into_evidence(cmd)
    if w:
        return False, {"refused": f"tool-native write into evidence/device ({w})"}
    # mount must be read-only
    cmds = _command_words(cmd)
    if "mount" in cmds and not re.search(r"\bro\b|--read-only|-[a-zA-Z]*r\b", cmd):
        return False, {"refused": "mount without read-only"}
    if "mount" in cmds and re.search(r"(^|[\s,])rw([\s,]|$)|--rw|-o[^|;&]*\brw\b", cmd):
        return False, {"refused": "read-write mount"}
    # 2) any destructive binary, anywhere (catches `xargs rm`, `find -exec dd`, etc.)
    bad = sorted(_all_tokens(cmd) & set(FORBIDDEN_TOOLS))
    if bad:
        return False, {"refused_tool": bad[0], "reason": "forbidden/destructive tool"}
    # 3) DEFAULT-DENY: every command-position binary must be on the kernel allowlist (READ_TOOLS)
    for w in sorted(cmds):
        cap = iss.issue(caller, "council-sift", w, int(time.time()) + 60)
        d = gw.authorize(Request(caller, "council-sift", ANALYST_RELATION, w, "read_only", capability=cap))
        if not d.allowed:
            return False, {"refused_tool": w, "reason": d.reason}
    return True, {"allowed": True, "command_words": sorted(cmds)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--caller", default="agent:analyst")
    ap.add_argument("--tool")
    ap.add_argument("--authority", default="read_only")
    ap.add_argument("--scan-command")
    a = ap.parse_args()

    now = lambda: int(time.time())  # noqa: E731
    gw, iss = build_gateway(now)

    if a.scan_command is not None:
        ok, info = scan(a.scan_command, gw, iss, a.caller)
        print(json.dumps(info), file=sys.stderr)
        sys.exit(0 if ok else 1)

    if not a.tool:
        print("usage: authorize.py --scan-command \"<cmd>\" | --tool <tool> [--authority read_only|high]", file=sys.stderr)
        sys.exit(2)
    cap = iss.issue(a.caller, "council-sift", a.tool, now() + 60)
    d = gw.authorize(Request(a.caller, "council-sift", ANALYST_RELATION, a.tool, a.authority, capability=cap))
    print(json.dumps({"tool": a.tool, "allowed": d.allowed, "reason": d.reason, "layer": d.layer}), file=sys.stderr)
    sys.exit(0 if d.allowed else 1)


if __name__ == "__main__":
    main()
