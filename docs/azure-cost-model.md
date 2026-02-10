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
- Snapshot generated: **2026-02-10T02:32:00.057Z**
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

## 4. Scenario summary
| Scenario | Submissions/month | Ready episodes/month | Audio GB/month | Egress GB/month | Monthly cost | Annual cost |
|---|---:|---:|---:|---:|---:|---:|
| Low | 27,451 | 28,758 | 84.2 | 436.24 | $316.87 | $3,802.49 |
| Base | 52,288 | 54,777 | 213.85 | 779 | $338.86 | $4,066.31 |
| High | 117,125 | 122,700 | 670.63 | 1,869.6 | $411.47 | $4,937.62 |

## 5. Commitment comparison (base scenario)
| Strategy | Monthly cost | Annual cost | Monthly savings vs PAYG | Savings % |
|---|---:|---:|---:|---:|
| PAYG | $338.86 | $4,066.31 | $0.00 | 0.00% |
| VM only - 1Y RI | $287.38 | $3,448.59 | $51.48 | 15.19% |
| VM only - 3Y RI | $261.02 | $3,132.26 | $77.84 | 22.97% |
| Postgres only - 1Y RI | $286.92 | $3,443.03 | $51.94 | 15.33% |
| Postgres only - 3Y RI | $260.92 | $3,131.03 | $77.94 | 23.00% |
| VM + Postgres - 1Y RI | $235.44 | $2,825.31 | $103.42 | 30.52% |
| VM + Postgres - 3Y RI | $183.08 | $2,196.98 | $155.78 | 45.97% |

## 6. Key price points used in model
- VM hourly PAYG: $0.17 per hour
- VM reservation 1Y: $889.00 upfront
- VM reservation 3Y: $1,718.00 upfront
- PostgreSQL vCore hourly PAYG: $0.09 per hour
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
5. `Sensitivity`: +/− workload stress tests.
6. `Finance_Summary`: executive snapshot for finance review.

## 8. Caveats for finance review
- Retail API prices can change; rerun `npm run costs:refresh-prices` before final procurement.
- Enterprise discounts, Azure credits, support-plan charges, tax, and monitoring/log ingestion are not included unless added as separate line items.
- Reservation figures are modeled using listed upfront terms annualized for monthly comparison.
