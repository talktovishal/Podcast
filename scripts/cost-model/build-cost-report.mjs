#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ARCH_BASELINE,
  BASE_INPUTS,
  COHORTS,
  computeAllScenarios,
  fetchAzurePriceSnapshot,
  loadPriceSnapshot,
  roundCurrency,
  savePriceSnapshot
} from "./model-lib.mjs";

const repoRoot = resolve(process.cwd());
const outPath = resolve(repoRoot, "docs/azure-cost-model.md");
const cachePath = resolve(repoRoot, "exports/costs/azure-prices.snapshot.json");

function usd(value) {
  return `$${roundCurrency(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function getSnapshot() {
  let snapshot = await loadPriceSnapshot(cachePath);
  if (!snapshot) {
    snapshot = await fetchAzurePriceSnapshot();
    await savePriceSnapshot(cachePath, snapshot);
  }
  return snapshot;
}

function buildAssumptionRows() {
  const lines = [];
  for (const cohort of COHORTS) {
    const c = BASE_INPUTS.cohorts[cohort];
    lines.push(`| ${cohort} | ${c.activeUsers} | ${c.articlesPerUserPerDay} | ${c.avgArticleMinutes} | ${c.avgOutputAudioMbPerMin} | ${c.avgEgressGbPerUserPerMonth} |`);
  }
  return lines.join("\n");
}

function buildScenarioRows(results) {
  return results
    .map(
      (entry) =>
        `| ${entry.scenarioName} | ${Math.round(entry.totals.submissionsMonth).toLocaleString()} | ${Math.round(entry.totals.readyEpisodesMonth).toLocaleString()} | ${roundCurrency(entry.totals.audioGbMonth).toLocaleString()} | ${roundCurrency(entry.totals.egressGbMonth).toLocaleString()} | ${entry.capacity.requiredVmCount} | ${usd(entry.monthlyTotal)} | ${usd(entry.annualTotal)} |`
    )
    .join("\n");
}

function buildCommitmentRows(baseResult) {
  const c = baseResult.commitment;
  const payg = c.paygMonthly;
  const rows = [
    ["PAYG", c.paygMonthly],
    ["VM only - 1Y RI", c.vmOnly1YMonthly],
    ["VM only - 3Y RI", c.vmOnly3YMonthly],
    ["Postgres only - 1Y RI", c.pgOnly1YMonthly],
    ["Postgres only - 3Y RI", c.pgOnly3YMonthly],
    ["VM + Postgres - 1Y RI", c.vmAndPg1YMonthly],
    ["VM + Postgres - 3Y RI", c.vmAndPg3YMonthly]
  ];

  return rows
    .map(([label, monthly]) => {
      const savings = payg - monthly;
      const savingsPct = payg === 0 ? 0 : (savings / payg) * 100;
      return `| ${label} | ${usd(monthly)} | ${usd(monthly * 12)} | ${usd(savings)} | ${savingsPct.toFixed(2)}% |`;
    })
    .join("\n");
}

async function main() {
  const snapshot = await getSnapshot();
  const results = computeAllScenarios(BASE_INPUTS, snapshot);
  const base = results.find((entry) => entry.scenarioName === "Base") || results[0];
  const payingUsersBase = BASE_INPUTS.cohorts.Pro.activeUsers + BASE_INPUTS.cohorts.Team.activeUsers;
  const denominator = BASE_INPUTS.cohorts.Pro.activeUsers + (BASE_INPUTS.cohorts.Team.activeUsers * BASE_INPUTS.global.teamPriceMultiplierVsPro);
  const totalUsersBase =
    BASE_INPUTS.cohorts.Free.activeUsers + BASE_INPUTS.cohorts.Pro.activeUsers + BASE_INPUTS.cohorts.Team.activeUsers;
  const convProUsers = totalUsersBase * BASE_INPUTS.global.conversionToProRate;
  const convTeamUsers = totalUsersBase * BASE_INPUTS.global.conversionToTeamRate;
  const convPayingUsers = convProUsers + convTeamUsers;
  const convDenominator = convProUsers + (convTeamUsers * BASE_INPUTS.global.teamPriceMultiplierVsPro);
  const requiredRevenue90 = base.monthlyTotal / (1 - BASE_INPUTS.global.targetGrossMargin90);
  const requiredRevenue95 = base.monthlyTotal / (1 - BASE_INPUTS.global.targetGrossMargin95);
  const proPrice90 = requiredRevenue90 / denominator;
  const teamPrice90 = proPrice90 * BASE_INPUTS.global.teamPriceMultiplierVsPro;
  const proPrice95 = requiredRevenue95 / denominator;
  const teamPrice95 = proPrice95 * BASE_INPUTS.global.teamPriceMultiplierVsPro;
  const arpu90 = requiredRevenue90 / payingUsersBase;
  const arpu95 = requiredRevenue95 / payingUsersBase;
  const convProPrice90 = requiredRevenue90 / convDenominator;
  const convTeamPrice90 = convProPrice90 * BASE_INPUTS.global.teamPriceMultiplierVsPro;
  const convProPrice95 = requiredRevenue95 / convDenominator;
  const convTeamPrice95 = convProPrice95 * BASE_INPUTS.global.teamPriceMultiplierVsPro;
  const convArpu90 = requiredRevenue90 / convPayingUsers;
  const convArpu95 = requiredRevenue95 / convPayingUsers;

  const md = `# Azure Cost Model (Finance Draft)

## 1. Architecture baseline (from IaC)
- Region: \`${ARCH_BASELINE.region}\`
- VM: \`${ARCH_BASELINE.vmSku}\` (count: ${ARCH_BASELINE.vmCount})
- PostgreSQL: \`${ARCH_BASELINE.postgresSku}\` (${ARCH_BASELINE.postgresVCores} vCore modeled), storage ${ARCH_BASELINE.postgresStorageGb} GB
- Blob Storage: \`${ARCH_BASELINE.blobSku}\`
- Optional queue alternative modeled: Azure Table Storage (LRS)
- Public IP: \`${ARCH_BASELINE.publicIpSku}\`
- OS Disk: \`${ARCH_BASELINE.osDiskSku}\`

## 2. Pricing source
- Source: [Azure Retail Prices API](https://prices.azure.com/api/retail/prices)
- Snapshot generated: **${snapshot.generatedAt}**
- Currency: **${snapshot.currency}**
- Region pricing basis: **${snapshot.region}**

## 3. User workload assumptions (base)
| Cohort | Active users | Articles/user/day | Avg article minutes | Audio MB/min | Egress GB/user/month |
|---|---:|---:|---:|---:|---:|
${buildAssumptionRows()}

Global assumptions:
- Days/month: ${BASE_INPUTS.global.daysPerMonth}
- Hours/month: ${BASE_INPUTS.global.hoursPerMonth}
- TTS success rate: ${(BASE_INPUTS.global.ttsSuccessRate * 100).toFixed(1)}%
- Retry rate: ${(BASE_INPUTS.global.retryRate * 100).toFixed(1)}%
- DB backup multiplier: ${BASE_INPUTS.global.backupMultiplierDb}x

Infrastructure sizing assumptions (editable in Excel \`Inputs\`):
- PostgreSQL vCores: ${BASE_INPUTS.global.postgresVCores}
- PostgreSQL storage: ${BASE_INPUTS.global.postgresStorageGb} GB
- Blob storage floor: ${BASE_INPUTS.global.blobStorageFloorGb} GB
- Blob audio retention multiplier: ${BASE_INPUTS.global.blobAudioRetentionMultiplier}x
- Table storage minimum: ${BASE_INPUTS.global.tableStorageMinGb} GB
- Table DB-growth multiplier: ${BASE_INPUTS.global.tableStorageDbGrowthMultiplier}x

## 4. Scenario summary
| Scenario | Submissions/month | Ready episodes/month | Audio GB/month | Egress GB/month | Estimated VMs required | Monthly cost | Annual cost |
|---|---:|---:|---:|---:|---:|---:|
${buildScenarioRows(results)}

VM estimation method:
- required_vm_tts = ceil(audio_minutes_month / (hours*60*tts_realtime_factor*utilization*(1-overhead)))
- required_vm_api = ceil((peak_submissions_hour*headroom)/api_submissions_capacity_per_vm_hour)
- required_vm_total = max(base_vm_count, required_vm_tts, required_vm_api)

Default capacity assumptions currently in model:
- Kokoro real-time factor per VM: **${BASE_INPUTS.global.ttsRealtimeFactorPerVm}x**
- VM utilization target: **${(BASE_INPUTS.global.vmUtilizationTarget * 100).toFixed(0)}%**
- Web/API overhead: **${(BASE_INPUTS.global.vmWebApiOverheadFraction * 100).toFixed(0)}%**
- API submissions capacity per VM hour: **${BASE_INPUTS.global.apiSubmissionsCapacityPerVmHour}**

Kokoro throughput references used for theoretical sizing:
- [hexgrad/kokoro README](https://github.com/hexgrad/kokoro) (model and project baseline)
- [remsky/Kokoro-FastAPI README](https://github.com/remsky/Kokoro-FastAPI) (community benchmark guidance, incl. ~2.4x realtime on CPU ONNX paths)

## 5. Commitment comparison (base scenario)
| Strategy | Monthly cost | Annual cost | Monthly savings vs PAYG | Savings % |
|---|---:|---:|---:|---:|
${buildCommitmentRows(base)}

## 5.1 Margin pricing targets (base scenario)
Team priced at ${BASE_INPUTS.global.teamPriceMultiplierVsPro}x Pro.

| Metric | Value |
|---|---:|
| Modeled monthly cost | ${usd(base.monthlyTotal)} |
| Pricing mode default | ${BASE_INPUTS.global.pricingMode} |
| Revenue needed @90% margin | ${usd(requiredRevenue90)} |
| Revenue needed @95% margin | ${usd(requiredRevenue95)} |

Tier-count mode (uses modeled Pro+Team users):
- Paying users = ${payingUsersBase.toLocaleString()}
- Blended ARPU needed @90% = ${usd(arpu90)}
- Blended ARPU needed @95% = ${usd(arpu95)}
- Suggested Pro/Team @90% = ${usd(proPrice90)} / ${usd(teamPrice90)}
- Suggested Pro/Team @95% = ${usd(proPrice95)} / ${usd(teamPrice95)}

Conversion-based mode (uses total users and conversion rates):
- Total users = ${totalUsersBase.toLocaleString()}
- Conversion to Pro = ${(BASE_INPUTS.global.conversionToProRate * 100).toFixed(2)}%
- Conversion to Team = ${(BASE_INPUTS.global.conversionToTeamRate * 100).toFixed(2)}%
- Paying users from conversion = ${Math.round(convPayingUsers).toLocaleString()}
- Blended ARPU needed @90% = ${usd(convArpu90)}
- Blended ARPU needed @95% = ${usd(convArpu95)}
- Suggested Pro/Team @90% = ${usd(convProPrice90)} / ${usd(convTeamPrice90)}
- Suggested Pro/Team @95% = ${usd(convProPrice95)} / ${usd(convTeamPrice95)}

## 6. Key price points used in model
- VM hourly PAYG: ${usd(snapshot.prices.vmHourlyPayg)} per hour
- VM reservation 1Y: ${usd(snapshot.prices.vmReservation1Year)} upfront
- VM reservation 3Y: ${usd(snapshot.prices.vmReservation3Year)} upfront
- PostgreSQL vCore hourly PAYG: ${usd(snapshot.prices.postgresVcoreHourlyPayg)} per hour
- PostgreSQL vCore reservation 1Y: ${usd(snapshot.prices.postgresVcoreReservation1Year)} upfront
- PostgreSQL vCore reservation 3Y: ${usd(snapshot.prices.postgresVcoreReservation3Year)} upfront
- PostgreSQL storage: ${usd(snapshot.prices.postgresStorageGbMonth)} per GB-month
- Blob hot LRS storage: ${usd(snapshot.prices.blobHotLrsGbMonth)} per GB-month
- Blob write ops: ${usd(snapshot.prices.blobWriteOpsPer10k)} per 10K
- Blob read ops: ${usd(snapshot.prices.blobReadOpsPer10k)} per 10K
- Table storage LRS: ${usd(snapshot.prices.tableLrsGbMonth)} per GB-month
- Bandwidth egress: ${usd(snapshot.prices.bandwidthEgressGb)} per GB

## 7. How to tune in Excel
Open: \`exports/costs/azure-cost-model.xlsx\`

Tabs:
1. \`Inputs\`: change green cells (users, articles/day, minutes/article, mix, egress, rates) and pick scenario in \`C2\`.
2. \`Formulas\`: inspect derived workloads from your input knobs.
3. \`Cost_Breakdown\`: component-level monthly/annual costs and cost shares.
4. \`Commitment_Compare\`: PAYG vs 1Y/3Y RI strategies and savings.
5. \`Pricing_Strategy\`: 90%/95% margin targets and suggested Pro/Team monthly prices.
6. \`Sensitivity\`: +/− workload stress tests.
7. \`Finance_Summary\`: executive snapshot for finance review.

Every key assumption is now exposed in \`Inputs\` (workload, conversion, margins, TTS capacity, API capacity, and infra sizing constants).

## 8. Caveats for finance review
- Retail API prices can change; rerun \`npm run costs:refresh-prices\` before final procurement.
- Enterprise discounts, Azure credits, support-plan charges, tax, and monitoring/log ingestion are not included unless added as separate line items.
- Reservation figures are modeled using listed upfront terms annualized for monthly comparison.
- PostgreSQL compute is modeled using **3-year reservation by default** in cost breakdown.
`;

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, md, "utf8");
  console.log(`Markdown report generated: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
