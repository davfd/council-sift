# VANKO-DEEP — Security Logon Window Operator Update

## Bottom line

Continued with another source-read + Council-SIFT round, this time on target-window `Security.evtx` payloads rather than the broader EVTX count layer.

Current `VANKO-DEEP`: **25 Council-verified findings**, **4 self-corrected disputed drafts**.

New verified finding:

- `F-analyst-VANKO-DEEP-029` — redacted Security logon/session timing summary for `2018-05-13T10:05Z..10:15Z`. `COUNCIL_VERIFIED/HIGH`.

Council result this round: **1 submitted, 1 verified, 0 bounces**.

## What we learned

The target-window Security payload summary records:

- selected Security rows: `14`
- Event ID counts: `4624:6`, `4672:4`, `4648:2`, `4634:2`
- source: `security.evtx:14`
- 4624 time range: `2018-05-13T10:05:36Z..2018-05-13T10:08:55Z`
- 4624 logon types: `11:2`, `7:2`, `5:2`
- 4624 IP classes: `NO_IP:4`, `LOOPBACK:2`
- 4648 explicit-credential target server class: `LOCALHOST:2`
- no raw user/domain/IP values emitted.

Interpretation:

- This supports an account/session timing layer inside the same target window as the Prefetch/registry/RecentDocs/UserAssist cluster.
- The observed logon types are cached-interactive/unlock/service shaped (`11`, `7`, `5`), not a direct human-identity proof.
- The selected target-window Security rows do not show remote IP-class evidence; that is scoped only to these selected rows and does **not** prove no remote access elsewhere.

## What this changes

The case posture is now sharper on attribution:

- Stronger: target-window local account/session timing.
- Still not proven: the human at the keyboard.
- Still not proven: file transfer, browser upload, completed cloud sync, or provider-side receipt.

This is the same river seen from another bank: registry says the profile stirred; Prefetch says programs ran; Security says sessions/logons existed. None of those alone names the hand.

## Still not proven

Still not proven:

- human operator identity;
- intent;
- malware;
- transfer direction;
- completed upload/download;
- browser upload;
- cloud sync completion;
- provider-side event absence.

## Artifacts and hashes

Updated Council report:

- `reports/VANKO-DEEP.md`  
  SHA256 `ff3ebc4acdd17da2cafd415f08d6625df6ea125ef4543eadb61c3054565d2091`

Execution logs:

- `execution-logs/VANKO-DEEP.md`  
  SHA256 `1019ad46d971f2d48a59c0d968b90896c0d353d254ab0a89147e493c2d58bae4`
- `execution-logs/VANKO-DEEP.jsonl`  
  SHA256 `043175390a9aeb1048dbdb7610d76575af46e71c5e704b47fd700d1071ed53a8`

Security logon summary:

- SIFT `/tmp/vanko_logon_window_out/security_logon_window_summary.txt`  
  SHA256 `0d1eec897908d85712d151e71def15f676cf6db89e40bf25dbaa005b45618aba`

Run/Council logs:

- `/tmp/vanko_logon_window_v2_run.log`  
  SHA256 `f74aebafb6e6d10f0bcbacc6d4be817419f33976e2c70e304e6f4fab09d1c7d8`
- `/tmp/vanko_logon_window_v2_sift_hashes.log`  
  SHA256 `6f4595e8d9d146efcf2ae832fa2d199f36af685f4dff3a1d9f5e4858901d492a`
- `/tmp/csift_vanko_logon_window_finding.log`  
  SHA256 `cea04e66e6a4785f9dcb64d41c6cc8e285651fb9c3bb7ee843ce2ebbf921af02`
- `/tmp/csift_vanko_logon_window_trace.log`  
  SHA256 `81b7b7de6958f6cc60cb345f3f72eda55f03a3d1a352a02a85caea594ff31d8e`
- `/tmp/csift_vanko_deep_process_run_v14.log`  
  SHA256 `b003642551d7651d78e86d11b69fc534118d99c80776ab4a0bff9aa66bf1e42e`

Receipt:

- `council/receipts/F-analyst-VANKO-DEEP-029-3d7b21e257d0.json`  
  SHA256 `3a2b5ddf8866088dac126595363fedee8072d673776a29bf287445abc1248d15`
