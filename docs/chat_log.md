# Chat Log

## 2026-03-07
- Summary:
  - Completed the local implementation pass for the Azure cost-optimization cutover so Azure Table can act as the primary operational metadata store while Blob remains the durable artifact store.
  - Added Azure runtime/deploy defaults for `METADATA_PRIMARY_BACKEND=azure_table`, including automatic fallback to local auxiliary SQLite and low-cost diagnostic defaults.
  - Extended admin quota/metrics/jobs paths and restore verification tooling so they no longer assume PostgreSQL is the source of truth.
- Exact user prompt(s):
  - "I want to fully migrate to the table plus blob storage, so go ahead and do that work, please, and let that be primary, and the PostgreSQL can be a backup, but I really want to bring the cost under control."
  - "If we go with the first path, are there any major changes to the cost? I'm worried that I'll be writing too many things to table that we should not be. So yeah, can you please, let's think about that a little bit. Some of the logs are okay to be kept on the server locally, right? They don't have to be in the table storage. Maybe the thing that we had done earlier was a mistake."
  - "i agree, go for it"
  - "Yes, please go ahead, plan for everything, and go ahead and do all the work."
