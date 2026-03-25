---
created: 2026-03-25T08:31:07.102Z
title: Add graceful deploy drain for in-flight jobs
area: tooling
files:
  - .github/workflows/deploy-azure.yml:16
  - scripts/azure/deploy-vm-runtime.sh:347
  - infra/systemd/articlepod-worker.service:7
  - apps/worker/src/index.ts:189
  - apps/worker/src/jobs/processItemJob.ts:649
  - apps/worker/src/lib/env.ts:142
---

## Problem

Production deploys currently build on the VM and then restart `articlepod-python-tts`, `articlepod-web`, and `articlepod-worker` directly with `systemctl restart`.
If the worker is in the middle of URL extraction or TTS generation, that work is interrupted immediately.

The current safety net is durable but not graceful:
- the item/job state stays in durable storage
- the worker heartbeats `lockedAt` during long TTS runs
- a replacement worker reclaims stale `PROCESSING` jobs after the stale timeout and requeues them once

That means users should not lose the queued item, but they can lose in-progress compute, wait through the stale timeout window, and then potentially re-run extraction/TTS work from scratch.

## Solution

Add an optional graceful deploy path for production VM rollouts:
- stop claiming new jobs before restart
- allow the active item job to finish or checkpoint cleanly within a bounded window
- restart worker/python-tts/web only after the drain window or timeout
- preserve the current stale-job reclaim behavior as the fallback when a drain cannot complete

Keep this as future ops hardening, not a prerequisite for the current release train.
