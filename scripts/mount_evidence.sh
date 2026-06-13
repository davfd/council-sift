#!/usr/bin/env bash
# Mount/probe the read-only evidence share inside SIFT (zero-copy; nothing is copied).
# No-SSH local SIFT: set SIFT_WRAPPER="$PWD/bin/sift-local" and run inside the SIFT workstation/container.
# VM bridge: set SIFT_WRAPPER to your SSH/QEMU wrapper; launch with:
#   -virtfs local,path=<EVIDENCE_DIR>,mount_tag=evidence,security_model=none,readonly=on
# This is environment prep, not analyst finding execution, so it uses the raw SIFT executor directly.
SIFT="${SIFT_WRAPPER:-$HOME/sift-workstation/sift}"
"$SIFT" 'sudo mkdir -p /mnt/evidence; mountpoint -q /mnt/evidence && { echo already mounted; ls /mnt/evidence; exit 0; }; echo forensics | sudo -S mount -t 9p -o trans=virtio,version=9p2000.L,ro evidence /mnt/evidence 2>&1 || echo forensics | sudo -S mount -t 9p -o trans=virtio,ro evidence /mnt/evidence 2>&1; ls /mnt/evidence'
