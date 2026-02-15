# Azure Cost Model (Finance Draft)

## 1. Architecture baseline (from IaC)
- Region: `eastus`
- VM: `Standard_D4as_v5` (count: 1)
- PostgreSQL: `General Purpose Ddsv4 (2 vCore equivalent)` (2 vCore modeled), storage 128 GB
- Blob Storage: `Standard_LRS Hot`
- Optional queue alternative modeled: Azure Table Storage (LRS)
- Public IP: `Standard IPv4 Static`
- OS Disk: `Premium SSD P4 LRS`

## 2. Pricing source
- Source: [Azure Retail Prices API](https://prices.azure.com/api/retail/prices)
- Snapshot generated: **2026-02-15T00:29:43.234Z**
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
| Low | 27,451 | 28,758 | 84.2 | 436.24 | 4 | $615.61 | $7,387.37 |
| Base | 52,288 | 54,777 | 213.85 | 779 | 8 | $1,139.84 | $13,678.07 |
| High | 117,125 | 122,700 | 670.63 | 1,869.6 | 25 | $3,346.97 | $40,163.62 |

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
| PAYG | $1,139.84 | $13,678.07 | $0.00 | 0.00% |
| VM only - 1Y RI | $728.03 | $8,736.31 | $411.81 | 36.13% |
| VM only - 3Y RI | $517.14 | $6,205.65 | $622.70 | 54.63% |
| Postgres only - 1Y RI | $1,165.84 | $13,990.07 | $-26.00 | -2.28% |
| Postgres only - 3Y RI | $1,139.84 | $13,678.07 | $0.00 | 0.00% |
| VM + Postgres - 1Y RI | $754.03 | $9,048.31 | $385.81 | 33.85% |
| VM + Postgres - 3Y RI | $517.14 | $6,205.65 | $622.70 | 54.63% |

## 5.1 Margin pricing targets (base scenario)
Team priced at 4x Pro.

| Metric | Value |
|---|---:|
| Modeled monthly cost | $1,139.84 |
| Pricing mode default | tier_counts |
| Revenue needed @90% margin | $11,398.39 |
| Revenue needed @95% margin | $22,796.79 |

Tier-count mode (uses modeled Pro+Team users):
- Paying users = 580
- Blended ARPU needed @90% = $19.65
- Blended ARPU needed @95% = $39.30
- Suggested Pro/Team @90% = $13.90 / $55.60
- Suggested Pro/Team @95% = $27.80 / $111.20

Conversion-based mode (uses total users and conversion rates):
- Total users = 2,580
- Conversion to Pro = 8.00%
- Conversion to Team = 1.50%
- Paying users from conversion = 245
- Blended ARPU needed @90% = $46.51
- Blended ARPU needed @95% = $93.01
- Suggested Pro/Team @90% = $31.56 / $126.23
- Suggested Pro/Team @95% = $63.11 / $252.46

## 6. Key price points used in model
- VM hourly PAYG: $0.17 per hour
- VM reservation 1Y: $889.00 upfront
- VM reservation 3Y: $1,718.00 upfront
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
