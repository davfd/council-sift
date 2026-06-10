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

# READ_TOOLS is the ALLOWLIST: the gate is DEFAULT-DENY, so a binary in command position must appear here
# or it is refused. Only read-only forensic tools + safe text/shell utilities + a few argument-guarded
# dual-use tools (sed, find, mount, chmod, mkdir, python) are permitted. Anything not listed — shred,
# truncate, parted, blkdiscard, sgdisk, tune2fs, cp, mv, tee, an unknown binary — is refused by default.
READ_TOOLS = {
    # Sleuth Kit + filesystem forensics (read-only)
    "fls", "mmls", "mmstat", "fsstat", "icat", "istat", "ils", "ifind", "ffind", "blkcat", "blkls",
    "blkstat", "blkcalc", "jcat", "jls", "fcat", "tsk_recover", "tsk_gettimes", "img_stat", "img_cat",
    "mactime", "sigfind", "srch_strings", "hfind",
    # memory forensics
    "vol", "vol3", "volatility", "volatility3",
    # hashing / IR / carving (read-only)
    "yara", "hashdeep", "md5sum", "sha1sum", "sha256sum", "sha512sum", "b2sum", "cksum",
    "bulk_extractor", "foremost", "photorec", "scalpel", "binwalk", "exiftool", "regripper", "rip",
    "reglookup", "evtxexport", "EvtxECmd", "evtxecmd", "evtx_dump.py", "log2timeline.py", "psort.py", "pffexport",
    # Windows artifact parsers (read-only; EZ Tools wrappers run inside SIFT and write reports under /tmp)
    "LECmd", "lecmd", "MFTECmd", "mftecmd", "RECmd", "recmd", "SBECmd", "sbecmd", "PECmd", "pecmd",
    "AppCompatCacheParser", "appcompatcacheparser", "AmcacheParser", "amcacheparser", "sqlite3",
    # read-only archive / extract (evidence is read-only; extraction targets /tmp)
    "7z", "7za", "7zr", "unzip", "gunzip", "zcat", "bzcat", "xzcat", "unxz", "bunzip2", "tar",
    # read-only text / shell utilities
    "grep", "egrep", "fgrep", "zgrep", "awk", "gawk", "sed", "head", "tail", "cat", "tac", "less",
    "more", "cut", "tr", "sort", "uniq", "nl", "wc", "xxd", "hexdump", "od", "strings", "file", "stat",
    "ls", "find", "readlink", "realpath", "basename", "dirname", "echo", "printf", "date", "seq", "jq",
    "column", "comm", "join", "cmp", "diff", "which", "command", "true", "false", "test",
    # system prep the agent needs (argument-guarded in authorize.py)
    "sudo", "mount", "chmod", "mkdir", "python", "python3",
    # csift / council internal verbs (when invoked as tools)
    "record_finding", "recall", "trace",
}
HIGH_AUTHORITY_TOOLS = {"approve_finding", "council_verify", "unlock_evidence"}
# Destructive/evidence-mutating binaries refused if they appear ANYWHERE in a command (e.g. `xargs rm`,
# `find -exec dd`) — defence-in-depth on top of the default-deny allowlist above.
FORBIDDEN_TOOLS = {
    "dd", "ddrescue", "dd_rescue", "rm", "rmdir", "shred", "wipe", "wipefs", "scrub", "nwipe",
    "blkdiscard", "badblocks", "hdparm",
    "mkfs", "mkfs.ext2", "mkfs.ext3", "mkfs.ext4", "mkfs.xfs", "mkfs.vfat", "mkfs.ntfs", "mke2fs", "mkswap",
    "fdisk", "sfdisk", "cfdisk", "gdisk", "sgdisk", "parted", "partprobe",
    "cryptsetup", "losetup", "dmsetup", "lvremove", "vgremove", "pvremove",
    "tune2fs", "resize2fs", "debugfs", "truncate", "fallocate",
    "cp", "mv", "ln", "install", "rsync", "tee",
    "shutdown", "reboot", "halt", "poweroff", "init", "systemctl", "kill", "killall", "pkill",
    "chown", "chgrp", "mkfifo", "mknod",
    "curl", "wget", "nc", "ncat", "socat", "scp", "ftp", "tftp",
}


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
