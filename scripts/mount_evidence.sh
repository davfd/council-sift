#!/usr/bin/env bash
# Mount the read-only 9p evidence share inside the SIFT guest (zero-copy; nothing is copied).
# The VM must have been launched with: -virtfs local,path=<EVIDENCE_DIR>,mount_tag=evidence,security_model=none,readonly=on
SIFT="$HOME/sift-workstation/sift"
"$SIFT" 'sudo mkdir -p /mnt/evidence; mountpoint -q /mnt/evidence && { echo already mounted; ls /mnt/evidence; exit 0; }; echo forensics | sudo -S mount -t 9p -o trans=virtio,version=9p2000.L,ro evidence /mnt/evidence 2>&1 || echo forensics | sudo -S mount -t 9p -o trans=virtio,ro evidence /mnt/evidence 2>&1; ls /mnt/evidence'
