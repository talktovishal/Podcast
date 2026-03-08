# Azure Cost Model (Finance Draft)

## 1. Architecture baseline (from IaC)
- Region: `eastus`
- VM: `Standard_B2s` (count: 1)
- PostgreSQL: `General Purpose Ddsv4 (2 vCore equivalent)` (2 vCore modeled), storage 128 GB
- Blob Storage: `Standard_LRS Hot`
- Optional queue alternative modeled: Azure Table Storage (LRS)
- Public IP: `Standard IPv4 Static`
- OS Disk: `Premium SSD P4 LRS`

## 2. Pricing source
- Source: [Azure Retail Prices API](https://prices.azure.com/api/retail/prices)
- Snapshot generated: **2026-03-08T01:36:34.718Z**
- Currency: **USD**
- Region pricing basis: **eastus**

## 3. User workload assumptions (base)
| Cohort | Active users | Articles/user/day | Avg article minutes | Audio MB/min | Egress GB/user/month |
|---|---:|---:|---:|---:|---:|
| Free | 2000 | 0.4 | 6 | 0.45 | 0.18 |
| Pro | 500 | 1.2 | 10 | 0.45 | 0.55 |
| Team | 80 | 4 | 14 | 0.45 | 1.8 |

Global assumptions:
- Days/month: 30.4
- Hours/month: 730
- TTS success rate: 97.0%
- Retry rate: 8.0%
- DB backup multiplier: 1.2x

Infrastructure sizing assumptions (editable in Excel `Inputs`):
- PostgreSQL vCores: 2
- PostgreSQL storage: 128 GB
- Blob storage floor: 128 GB
- Blob audio retention multiplier: 3x
- Table storage minimum: 5 GB
- Table DB-growth multiplier: 2x

## 4. Scenario summary
| Scenario | Submissions/month | Ready episodes/month | Audio GB/month | Egress GB/month | Estimated VMs required | Monthly cost | Annual cost |
|---|---:|---:|---:|---:|---:|---:|
| Low | 27,451 | 28,758 | 84.2 | 436.24 | 4 | $259.08 | $3,108.99 |
| Base | 52,288 | 54,777 | 213.85 | 779 | 8 | $426.78 | $5,121.31 |
| High | 117,125 | 122,700 | 670.63 | 1,869.6 | 25 | $1,118.64 | $13,423.72 |

VM estimation method:
- required_vm_tts = ceil(audio_minutes_month / (hours*60*tts_realtime_factor*utilization*(1-overhead)))
- required_vm_api = ceil((peak_submissions_hour*headroom)/api_submissions_capacity_per_vm_hour)
- required_vm_total = max(base_vm_count, required_vm_tts, required_vm_api)

Default capacity assumptions currently in model:
- Kokoro real-time factor per VM: **2.4x**
- VM utilization target: **75%**
- Web/API overhead: **20%**
- API submissions capacity per VM hour: **120**

Kokoro throughput references used for theoretical sizing:
- [hexgrad/kokoro README](https://github.com/hexgrad/kokoro) (model and project baseline)
- [remsky/Kokoro-FastAPI README](https://github.com/remsky/Kokoro-FastAPI) (community benchmark guidance, incl. ~2.4x realtime on CPU ONNX paths)

## 5. Commitment comparison (base scenario)
| Strategy | Monthly cost | Annual cost | Monthly savings vs PAYG | Savings % |
|---|---:|---:|---:|---:|
| PAYG | $426.78 | $5,121.31 | $0.00 | 0.00% |
| VM only - 1Y RI | $277.36 | $3,328.31 | $149.42 | 35.01% |
| VM only - 3Y RI | $246.47 | $2,957.65 | $180.30 | 42.25% |
| Postgres only - 1Y RI | $452.78 | $5,433.31 | $-26.00 | -6.09% |
| Postgres only - 3Y RI | $426.78 | $5,121.31 | $0.00 | 0.00% |
| VM + Postgres - 1Y RI | $303.36 | $3,640.31 | $123.42 | 28.92% |
| VM + Postgres - 3Y RI | $246.47 | $2,957.65 | $180.30 | 42.25% |

## 5.1 Margin pricing targets (base scenario)
Team priced at 4x Pro.

| Metric | Value |
|---|---:|
| Modeled monthly cost | $426.78 |
| Pricing mode default | tier_counts |
| Revenue needed @90% margin | $4,267.75 |
| Revenue needed @95% margin | $8,535.51 |

Tier-count mode (uses modeled Pro+Team users):
- Paying users = 580
- Blended ARPU needed @90% = $7.36
- Blended ARPU needed @95% = $14.72
- Suggested Pro/Team @90% = $5.20 / $20.82
- Suggested Pro/Team @95% = $10.41 / $41.64

Conversion-based mode (uses total users and conversion rates):
- Total users = 2,580
- Conversion to Pro = 8.00%
- Conversion to Team = 1.50%
- Paying users from conversion = 245
- Blended ARPU needed @90% = $17.41
- Blended ARPU needed @95% = $34.82
- Suggested Pro/Team @90% = $11.82 / $47.26
- Suggested Pro/Team @95% = $23.63 / $94.52

## 6. Key price points used in model
- VM hourly PAYG: $0.05 per hour
- VM reservation 1Y: $213.00 upfront
- VM reservation 3Y: $500.00 upfront
- PostgreSQL vCore hourly PAYG: $0.09 per hour
- PostgreSQL vCore reservation 1Y: $468.00 upfront
- PostgreSQL vCore reservation 3Y: $936.00 upfront
- PostgreSQL storage: $0.12 per GB-month
- Blob hot LRS storage: $0.02 per GB-month
- Blob write ops: $0.05 per 10K
- Blob read ops: $0.00 per 10K
- Table storage LRS: $0.04 per GB-month
- Bandwidth egress: $0.04 per GB

## 7. How to tune in Excel
Open: `exports/costs/azure-cost-model.xlsx`

Tabs:
1. `Inputs`: change green cells (users, articles/day, minutes/article, mix, egress, rates) and pick scenario in `C2`.
2. `Formulas`: inspect derived workloads from your input knobs.
3. `Cost_Breakdown`: component-level monthly/annual costs and cost shares.
4. `Commitment_Compare`: PAYG vs 1Y/3Y RI strategies and savings.
5. `Pricing_Strategy`: 90%/95% margin targets and suggested Pro/Team monthly prices.
6. `Sensitivity`: +/− workload stress tests.
7. `Finance_Summary`: executive snapshot for finance review.

Every key assumption is now exposed in `Inputs` (workload, conversion, margins, TTS capacity, API capacity, and infra sizing constants).

## 8. Caveats for finance review
- Retail API prices can change; rerun `npm run costs:refresh-prices` before final procurement.
- Enterprise discounts, Azure credits, support-plan charges, tax, and monitoring/log ingestion are not included unless added as separate line items.
- Reservation figures are modeled using listed upfront terms annualized for monthly comparison.
- PostgreSQL compute is modeled using **3-year reservation by default** in cost breakdown.
