# Chat Log

## 2026-03-21
- Summary:
  - Implemented Summary Studio as a separate signed-in workflow for manual summary generation with last-7-days defaults, manual article selection, length presets, markdown output, and optional podcast creation.
  - Added Azure OpenAI summary generation with nano-first routing, mini fallback, structured output parsing, and deploy/runtime automation for provisioning Azure OpenAI resources in the production resource group.
  - Extended the existing digest RSS/media pipeline so manual summary episodes publish into the same private digest feed with the same `HEAD` and byte-range playback contract.
- Exact user prompt(s):
  - "how about we use the cheaper nano models?"
  - "actually actually let's just discuss this a little bit. I also have the OpenAI Pro subscription, the$200 one. So which one do you think I should really connect with? The Azure credits, or is there a way for me to also use the OpenAI Pro subscription? Because I want to use one the one that is easily available and easily that I can do."
  - "Yes, please do the readiness check whether the Azure subscription is enabled, whether in my subscription Azure OpenAI access is available. I don't really care about what region I need to go to. I can go to any region. I just want to keep the costs very low and part of my subscription so I can use the existing credits."
  - "Great. Uh yes, turn it into an Azure first integration plan. And what I also want you to do is, you have to account for creating all the resources, etc., so that everything just works. You have to do this end-to-end and keep things simple that yeah, let's have a GPT-5 nano and mini as an optional fallback. That sounds really good, but you have to do everything for me so that everything just works. Since you have access to the CLI, I'm logged in and you have access to everything. So do whatever you need to do. And the way I want it to be implemented is that from the uh app UX, there needs to be an explicit trigger. Let's make this explicit that I can go ahead and trigger and say create the summary and it will use all the uh it can ask, it can select everything by default, all those articles that have been saved, but can also allow me to select specific articles that I can save for a summary. Um we should also think about some options about how long this summary could be. And then the default summary, we should make sure that it is possible in some nice markdown so that I can easily even post it on LinkedIn or something like that and then create a podcast out of it."
  - "PLEASE IMPLEMENT THIS PLAN:
# Azure-First Summary Studio with Azure OpenAI Nano + Mini Fallback"

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
