#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ExcelJS from "exceljs";
import {
  ARCH_BASELINE,
  BASE_INPUTS,
  COHORTS,
  SCENARIOS,
  computeAllScenarios,
  fetchAzurePriceSnapshot,
  loadPriceSnapshot,
  savePriceSnapshot,
  roundCurrency
} from "./model-lib.mjs";

const repoRoot = resolve(process.cwd());
const outPath = resolve(repoRoot, "exports/costs/azure-cost-model.xlsx");
const cachePath = resolve(repoRoot, "exports/costs/azure-prices.snapshot.json");

function currency(v) {
  return roundCurrency(v);
}

function percent(v) {
  return Number((v * 100).toFixed(2));
}

async function getSnapshot() {
  let snapshot = await loadPriceSnapshot(cachePath);
  if (!snapshot) {
    snapshot = await fetchAzurePriceSnapshot();
    await savePriceSnapshot(cachePath, snapshot);
  }
  return snapshot;
}

function styleHeader(row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" }
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
}

function styleInput(cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F0D9" } };
}

function styleCalculated(cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDEEAF6" } };
}

async function main() {
  const snapshot = await getSnapshot();
  const scenarios = computeAllScenarios(BASE_INPUTS, snapshot);
  const byName = Object.fromEntries(scenarios.map((entry) => [entry.scenarioName, entry]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ArticlePod";
  workbook.created = new Date();

  const wsReadme = workbook.addWorksheet("README");
  wsReadme.columns = [{ width: 36 }, { width: 120 }];
  wsReadme.addRow(["Workbook", "Azure Cost Model - ArticlePod"]);
  wsReadme.addRow(["Generated", snapshot.generatedAt]);
  wsReadme.addRow(["Region", ARCH_BASELINE.region]);
  wsReadme.addRow(["Currency", snapshot.currency]);
  wsReadme.addRow(["How to use", "Go to Inputs tab, change green cells, pick scenario in B3, and review Finance_Summary."]);
  wsReadme.addRow(["Legend Input", "Green cells are editable assumptions"]);
  wsReadme.addRow(["Legend Calculated", "Blue cells are formulas or computed outputs"]);
  wsReadme.addRow(["Pricing source", "https://prices.azure.com/api/retail/prices"]);
  styleHeader(wsReadme.getRow(1));

  const wsInputs = workbook.addWorksheet("Inputs");
  wsInputs.columns = [{ width: 34 }, { width: 20 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  wsInputs.addRow(["Section", "Parameter", "Value", "Unit", "Low", "High"]);
  styleHeader(wsInputs.getRow(1));
  wsInputs.addRow(["Scenario", "Selected Scenario", "Base", "(Low/Base/High)"]);
  wsInputs.getCell("C2").dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: ['"Low,Base,High"']
  };
  styleInput(wsInputs.getCell("C2"));

  wsInputs.addRow(["Global", "Days per month", BASE_INPUTS.global.daysPerMonth, "days"]);
  wsInputs.addRow(["Global", "Hours per month", BASE_INPUTS.global.hoursPerMonth, "hours"]);
  wsInputs.addRow(["Global", "Headroom factor", BASE_INPUTS.global.headroomFactor, "x"]);
  wsInputs.addRow(["Global", "VM count", BASE_INPUTS.global.vmCount, "count"]);
  wsInputs.addRow(["Global", "TTS success rate", BASE_INPUTS.global.ttsSuccessRate, "fraction"]);
  wsInputs.addRow(["Global", "Retry rate", BASE_INPUTS.global.retryRate, "fraction"]);
  wsInputs.addRow(["Global", "DB backup multiplier", BASE_INPUTS.global.backupMultiplierDb, "x"]);

  for (let row = 3; row <= 9; row += 1) {
    styleInput(wsInputs.getCell(`C${row}`));
  }

  wsInputs.addRow([]);
  wsInputs.addRow(["Infra sizing knobs", "Knob", "Value", "Unit"]);
  styleHeader(wsInputs.getRow(wsInputs.rowCount));
  const pgVCoresRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Infra sizing knobs", "Postgres vCores", BASE_INPUTS.global.postgresVCores, "count"]);
  const pgStorageRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Infra sizing knobs", "Postgres storage GB", BASE_INPUTS.global.postgresStorageGb, "GB"]);
  const blobFloorRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Infra sizing knobs", "Blob storage floor GB", BASE_INPUTS.global.blobStorageFloorGb, "GB"]);
  const blobRetentionMultRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Infra sizing knobs", "Blob audio retention multiplier", BASE_INPUTS.global.blobAudioRetentionMultiplier, "x"]);
  const tableMinGbRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Infra sizing knobs", "Table storage minimum GB", BASE_INPUTS.global.tableStorageMinGb, "GB"]);
  const tableDbGrowthMultRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Infra sizing knobs", "Table DB growth multiplier", BASE_INPUTS.global.tableStorageDbGrowthMultiplier, "x"]);
  for (const row of [pgVCoresRow, pgStorageRow, blobFloorRow, blobRetentionMultRow, tableMinGbRow, tableDbGrowthMultRow]) {
    styleInput(wsInputs.getCell(`C${row}`));
  }

  wsInputs.addRow([]);
  wsInputs.addRow(["Cohort", "Knob", "Free", "Pro", "Team", "Unit"]);
  styleHeader(wsInputs.getRow(wsInputs.rowCount));

  const knobRows = [
    ["Users", "Active users", "activeUsers", "count"],
    ["Usage", "Articles per user per day", "articlesPerUserPerDay", "count/day"],
    ["Usage", "Peak submissions per hour /1000 users", "peakSubmissionsPerHourPer1000Users", "count/hour"],
    ["Content", "Average article minutes", "avgArticleMinutes", "minutes"],
    ["Content", "Average words per article", "avgWordsPerArticle", "words"],
    ["Mix", "% URL", "pctUrl", "fraction"],
    ["Mix", "% PDF", "pctPdf", "fraction"],
    ["Mix", "% HTML snapshot", "pctHtmlSnapshot", "fraction"],
    ["Media", "Output audio MB per minute", "avgOutputAudioMbPerMin", "MB/min"],
    ["Media", "Blob reads per episode per month", "avgBlobReadsPerEpisodePerMonth", "count"],
    ["Network", "Egress GB per user per month", "avgEgressGbPerUserPerMonth", "GB/month"],
    ["DB", "DB rows per article", "avgDbRowsPerArticle", "rows"],
    ["DB", "DB storage KB per article", "avgDbStorageKbPerArticle", "KB"],
    ["Table", "Table ops per article", "avgTableOpsPerArticle", "ops"]
  ];

  let rowCursor = wsInputs.rowCount + 1;
  for (const [section, label, key, unit] of knobRows) {
    wsInputs.addRow([section, label, BASE_INPUTS.cohorts.Free[key], BASE_INPUTS.cohorts.Pro[key], BASE_INPUTS.cohorts.Team[key], unit]);
    styleInput(wsInputs.getCell(`C${rowCursor}`));
    styleInput(wsInputs.getCell(`D${rowCursor}`));
    styleInput(wsInputs.getCell(`E${rowCursor}`));
    rowCursor += 1;
  }

  wsInputs.addRow([]);
  wsInputs.addRow(["Scenario Multipliers", "Scenario", "User multiplier", "Usage multiplier", "Egress multiplier"]);
  styleHeader(wsInputs.getRow(rowCursor + 1));
  const lowRow = rowCursor + 2;
  const baseRow = rowCursor + 3;
  const highRow = rowCursor + 4;
  wsInputs.addRow(["Scenario Multipliers", "Low", SCENARIOS.Low.userMultiplier, SCENARIOS.Low.usageMultiplier, SCENARIOS.Low.egressMultiplier]);
  wsInputs.addRow(["Scenario Multipliers", "Base", SCENARIOS.Base.userMultiplier, SCENARIOS.Base.usageMultiplier, SCENARIOS.Base.egressMultiplier]);
  wsInputs.addRow(["Scenario Multipliers", "High", SCENARIOS.High.userMultiplier, SCENARIOS.High.usageMultiplier, SCENARIOS.High.egressMultiplier]);
  for (const r of [lowRow, baseRow, highRow]) {
    styleInput(wsInputs.getCell(`C${r}`));
    styleInput(wsInputs.getCell(`D${r}`));
    styleInput(wsInputs.getCell(`E${r}`));
  }

  wsInputs.addRow([]);
  wsInputs.addRow(["Prices", "Meter", "Value", "Unit"]);
  styleHeader(wsInputs.getRow(highRow + 2));
  const priceStart = highRow + 3;
  const priceRows = [
    ["Prices", "VM hourly PAYG", snapshot.prices.vmHourlyPayg, "USD/hour"],
    ["Prices", "VM reservation 1Y", snapshot.prices.vmReservation1Year, "USD upfront"],
    ["Prices", "VM reservation 3Y", snapshot.prices.vmReservation3Year, "USD upfront"],
    ["Prices", "Postgres vCore hourly PAYG", snapshot.prices.postgresVcoreHourlyPayg, "USD/hour"],
    ["Prices", "Postgres vCore reservation 1Y", snapshot.prices.postgresVcoreReservation1Year, "USD upfront"],
    ["Prices", "Postgres vCore reservation 3Y", snapshot.prices.postgresVcoreReservation3Year, "USD upfront"],
    ["Prices", "Postgres storage", snapshot.prices.postgresStorageGbMonth, "USD/GB-month"],
    ["Prices", "Postgres backup storage", snapshot.prices.postgresBackupGbMonth, "USD/GB-month"],
    ["Prices", "Blob hot LRS storage", snapshot.prices.blobHotLrsGbMonth, "USD/GB-month"],
    ["Prices", "Blob write ops", snapshot.prices.blobWriteOpsPer10k, "USD/10k ops"],
    ["Prices", "Blob read ops", snapshot.prices.blobReadOpsPer10k, "USD/10k ops"],
    ["Prices", "Table LRS storage", snapshot.prices.tableLrsGbMonth, "USD/GB-month"],
    ["Prices", "Table ops", snapshot.prices.tableOpsPer10k, "USD/10k ops"],
    ["Prices", "Bandwidth egress", snapshot.prices.bandwidthEgressGb, "USD/GB"],
    ["Prices", "Public IP hourly", snapshot.prices.publicIpHourly, "USD/hour"],
    ["Prices", "OS disk monthly", snapshot.prices.osDiskMonth, "USD/month"]
  ];

  for (const row of priceRows) {
    wsInputs.addRow(row);
    styleCalculated(wsInputs.getCell(`C${wsInputs.rowCount}`));
  }

  wsInputs.addRow([]);
  wsInputs.addRow(["Capacity knobs", "Knob", "Value", "Unit"]);
  styleHeader(wsInputs.getRow(wsInputs.rowCount));
  const ttsRealtimeRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Capacity knobs", "Kokoro real-time factor per VM", BASE_INPUTS.global.ttsRealtimeFactorPerVm, "x realtime"]);
  const vmUtilRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Capacity knobs", "Target VM utilization", BASE_INPUTS.global.vmUtilizationTarget, "fraction"]);
  const vmOverheadRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Capacity knobs", "Web/API overhead fraction", BASE_INPUTS.global.vmWebApiOverheadFraction, "fraction"]);
  const apiCapRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Capacity knobs", "API submissions capacity per VM hour", BASE_INPUTS.global.apiSubmissionsCapacityPerVmHour, "submissions/hour"]);
  for (const row of [ttsRealtimeRow, vmUtilRow, vmOverheadRow, apiCapRow]) {
    styleInput(wsInputs.getCell(`C${row}`));
  }

  wsInputs.addRow([]);
  wsInputs.addRow(["Pricing knobs", "Knob", "Value", "Unit"]);
  styleHeader(wsInputs.getRow(wsInputs.rowCount));
  const margin90Row = wsInputs.rowCount + 1;
  wsInputs.addRow(["Pricing knobs", "Target gross margin (floor)", BASE_INPUTS.global.targetGrossMargin90, "fraction"]);
  const margin95Row = wsInputs.rowCount + 1;
  wsInputs.addRow(["Pricing knobs", "Target gross margin (comfort)", BASE_INPUTS.global.targetGrossMargin95, "fraction"]);
  const teamMultiplierRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Pricing knobs", "Team price multiplier vs Pro", BASE_INPUTS.global.teamPriceMultiplierVsPro, "x"]);
  const pricingModeRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Pricing knobs", "Pricing mode", BASE_INPUTS.global.pricingMode, "(tier_counts/conversion_based)"]);
  wsInputs.getCell(`C${pricingModeRow}`).dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: ['"tier_counts,conversion_based"']
  };
  const conversionProRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Pricing knobs", "Conversion to Pro rate", BASE_INPUTS.global.conversionToProRate, "fraction of total active users"]);
  const conversionTeamRow = wsInputs.rowCount + 1;
  wsInputs.addRow(["Pricing knobs", "Conversion to Team rate", BASE_INPUTS.global.conversionToTeamRate, "fraction of total active users"]);
  for (const row of [margin90Row, margin95Row, teamMultiplierRow, pricingModeRow, conversionProRow, conversionTeamRow]) {
    styleInput(wsInputs.getCell(`C${row}`));
  }

  const wsFormulas = workbook.addWorksheet("Formulas");
  wsFormulas.columns = [{ width: 34 }, { width: 24 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 16 }];
  wsFormulas.addRow(["Metric", "Formula (per cohort)", "Free", "Pro", "Team", "Total"]);
  styleHeader(wsFormulas.getRow(1));

  const selectedUserMult = `IF(Inputs!C2="Low",Inputs!C${lowRow},IF(Inputs!C2="High",Inputs!C${highRow},Inputs!C${baseRow}))`;
  const selectedUsageMult = `IF(Inputs!C2="Low",Inputs!D${lowRow},IF(Inputs!C2="High",Inputs!D${highRow},Inputs!D${baseRow}))`;
  const selectedEgressMult = `IF(Inputs!C2="Low",Inputs!E${lowRow},IF(Inputs!C2="High",Inputs!E${highRow},Inputs!E${baseRow}))`;

  const cohortCol = { Free: "C", Pro: "D", Team: "E" };
  const metricRows = [];

  function addMetric(name, formulaText, freeFormula, proFormula, teamFormula) {
    wsFormulas.addRow([name, formulaText, { formula: freeFormula }, { formula: proFormula }, { formula: teamFormula }, { formula: `SUM(C${wsFormulas.rowCount + 1}:E${wsFormulas.rowCount + 1})` }]);
    metricRows.push({ name, row: wsFormulas.rowCount });
    styleCalculated(wsFormulas.getCell(`C${wsFormulas.rowCount}`));
    styleCalculated(wsFormulas.getCell(`D${wsFormulas.rowCount}`));
    styleCalculated(wsFormulas.getCell(`E${wsFormulas.rowCount}`));
    styleCalculated(wsFormulas.getCell(`F${wsFormulas.rowCount}`));
  }

  addMetric(
    "Submissions / month",
    "users * articles/day * days/month * multipliers",
    `Inputs!C12*${selectedUserMult}*Inputs!C13*${selectedUsageMult}*Inputs!C3`,
    `Inputs!D12*${selectedUserMult}*Inputs!D13*${selectedUsageMult}*Inputs!C3`,
    `Inputs!E12*${selectedUserMult}*Inputs!E13*${selectedUsageMult}*Inputs!C3`
  );
  addMetric("Effective jobs / month", "submissions * (1+retry)", `C2*(1+Inputs!C8)`, `D2*(1+Inputs!C8)`, `E2*(1+Inputs!C8)`);
  addMetric("Ready episodes / month", "effective jobs * success rate", `C3*Inputs!C7`, `D3*Inputs!C7`, `E3*Inputs!C7`);
  addMetric("Audio minutes / month", "ready episodes * avg article minutes", `C4*Inputs!C15*${selectedUsageMult}`, `D4*Inputs!D15*${selectedUsageMult}`, `E4*Inputs!E15*${selectedUsageMult}`);
  addMetric("Audio GB / month", "audio minutes * mb/min / 1024", `(C5*Inputs!C20)/1024`, `(D5*Inputs!D20)/1024`, `(E5*Inputs!E20)/1024`);
  addMetric("Blob reads / month", "ready episodes * reads/episode", `C4*Inputs!C21`, `D4*Inputs!D21`, `E4*Inputs!E21`);
  addMetric("Egress GB / month", "users * egress/user * multiplier", `Inputs!C12*${selectedUserMult}*Inputs!C22*${selectedEgressMult}`, `Inputs!D12*${selectedUserMult}*Inputs!D22*${selectedEgressMult}`, `Inputs!E12*${selectedUserMult}*Inputs!E22*${selectedEgressMult}`);
  addMetric("DB growth GB / month", "effective jobs * KB/article / (1024*1024)", `(C3*Inputs!C24)/(1024*1024)`, `(D3*Inputs!D24)/(1024*1024)`, `(E3*Inputs!E24)/(1024*1024)`);
  addMetric("Table ops / month", "effective jobs * ops/article", `C3*Inputs!C25`, `D3*Inputs!D25`, `E3*Inputs!E25`);
  addMetric(
    "Peak submissions / hour",
    "(users/1000) * peak_submissions_per_1000 * scenario usage multiplier",
    `(Inputs!C12/1000)*Inputs!C14*${selectedUsageMult}`,
    `(Inputs!D12/1000)*Inputs!D14*${selectedUsageMult}`,
    `(Inputs!E12/1000)*Inputs!E14*${selectedUsageMult}`
  );

  wsFormulas.addRow([
    "TTS capacity minutes / VM / month",
    "hours * 60 * realtime_factor * utilization * (1-overhead)",
    "",
    "",
    "",
    { formula: `Inputs!C4*60*Inputs!C${ttsRealtimeRow}*Inputs!C${vmUtilRow}*(1-Inputs!C${vmOverheadRow})` }
  ]);
  const ttsCapacityRow = wsFormulas.rowCount;
  styleCalculated(wsFormulas.getCell(`F${ttsCapacityRow}`));

  wsFormulas.addRow([
    "Required VMs (TTS)",
    "ceil(audio_minutes / tts_capacity_per_vm)",
    "",
    "",
    "",
    { formula: `MAX(1,ROUNDUP(F5/F${ttsCapacityRow},0))` }
  ]);
  const reqVmTtsRow = wsFormulas.rowCount;
  styleCalculated(wsFormulas.getCell(`F${reqVmTtsRow}`));

  wsFormulas.addRow([
    "Required VMs (API peak)",
    "ceil((peak_submissions_hour * headroom)/api_capacity_per_vm_hour)",
    "",
    "",
    "",
    { formula: `MAX(1,ROUNDUP((F11*Inputs!C5)/Inputs!C${apiCapRow},0))` }
  ]);
  const reqVmApiRow = wsFormulas.rowCount;
  styleCalculated(wsFormulas.getCell(`F${reqVmApiRow}`));

  wsFormulas.addRow([
    "Required VMs (total)",
    "max(base_vm_count, vm_tts, vm_api)",
    "",
    "",
    "",
    { formula: `MAX(Inputs!C6,F${reqVmTtsRow},F${reqVmApiRow})` }
  ]);
  const reqVmTotalRow = wsFormulas.rowCount;
  styleCalculated(wsFormulas.getCell(`F${reqVmTotalRow}`));

  const wsPrices = workbook.addWorksheet("Prices");
  wsPrices.columns = [{ width: 30 }, { width: 26 }, { width: 16 }, { width: 14 }, { width: 24 }];
  wsPrices.addRow(["Category", "Meter", "Price", "Unit", "Snapshot generated"]);
  styleHeader(wsPrices.getRow(1));

  const priceList = [
    ["VM", "VM hourly PAYG", snapshot.prices.vmHourlyPayg, "USD/hour"],
    ["VM", "VM RI 1Y", snapshot.prices.vmReservation1Year, "USD upfront"],
    ["VM", "VM RI 3Y", snapshot.prices.vmReservation3Year, "USD upfront"],
    ["Postgres", "vCore hourly PAYG", snapshot.prices.postgresVcoreHourlyPayg, "USD/hour"],
    ["Postgres", "vCore RI 1Y", snapshot.prices.postgresVcoreReservation1Year, "USD upfront"],
    ["Postgres", "vCore RI 3Y", snapshot.prices.postgresVcoreReservation3Year, "USD upfront"],
    ["Postgres", "Storage", snapshot.prices.postgresStorageGbMonth, "USD/GB-month"],
    ["Postgres", "Backup", snapshot.prices.postgresBackupGbMonth, "USD/GB-month"],
    ["Blob", "Hot LRS storage", snapshot.prices.blobHotLrsGbMonth, "USD/GB-month"],
    ["Blob", "Write ops", snapshot.prices.blobWriteOpsPer10k, "USD/10k"],
    ["Blob", "Read ops", snapshot.prices.blobReadOpsPer10k, "USD/10k"],
    ["Table", "LRS storage", snapshot.prices.tableLrsGbMonth, "USD/GB-month"],
    ["Table", "Ops", snapshot.prices.tableOpsPer10k, "USD/10k"],
    ["Network", "Bandwidth egress", snapshot.prices.bandwidthEgressGb, "USD/GB"],
    ["Network", "Public IP", snapshot.prices.publicIpHourly, "USD/hour"],
    ["VM", "OS disk", snapshot.prices.osDiskMonth, "USD/month"]
  ];

  for (const row of priceList) {
    wsPrices.addRow([...row, snapshot.generatedAt]);
  }

  const wsBreakdown = workbook.addWorksheet("Cost_Breakdown");
  wsBreakdown.columns = [{ width: 34 }, { width: 24 }, { width: 20 }, { width: 20 }, { width: 14 }];
  wsBreakdown.addRow(["Component", "Formula", "Monthly USD", "Annual USD", "% of monthly"]);
  styleHeader(wsBreakdown.getRow(1));

  const breakdownRows = [
    ["VM compute", "vm_hourly * hours * required_vm_count", `Inputs!C${priceStart}*Inputs!C4*Formulas!F${reqVmTotalRow}`],
    ["VM public IP", "public_ip_hourly * hours", `Inputs!C${priceStart + 14}*Inputs!C4`],
    ["VM OS disk", "os_disk_month", `Inputs!C${priceStart + 15}`],
    ["Postgres compute", "pg_vcore_3yr_reserved * vcores / 36", `(Inputs!C${priceStart + 5}/36)*Inputs!C${pgVCoresRow}`],
    ["Postgres storage", "pg_storage_rate * configured_pg_gb", `Inputs!C${priceStart + 6}*Inputs!C${pgStorageRow}`],
    ["Postgres backup", "pg_backup_rate * configured_pg_gb * backup_multiplier", `Inputs!C${priceStart + 7}*Inputs!C${pgStorageRow}*Inputs!C9`],
    ["Blob storage", "blob_rate * MAX(blob_floor_gb, audio_gb*retention_mult)", `Inputs!C${priceStart + 8}*MAX(Inputs!C${blobFloorRow},Formulas!F6*Inputs!C${blobRetentionMultRow})`],
    ["Blob write ops", "write_rate * episodes/10k", `Inputs!C${priceStart + 9}*(Formulas!F4/10000)`],
    ["Blob read ops", "read_rate * blob_reads/10k", `Inputs!C${priceStart + 10}*(Formulas!F7/10000)`],
    ["Table storage", "table_rate * MAX(table_min_gb, db_growth*table_mult)", `Inputs!C${priceStart + 11}*MAX(Inputs!C${tableMinGbRow},Formulas!F9*Inputs!C${tableDbGrowthMultRow})`],
    ["Table ops", "table_ops_rate * table_ops/10k", `Inputs!C${priceStart + 12}*(Formulas!F10/10000)`],
    ["Network egress", "egress_rate * egress_gb", `Inputs!C${priceStart + 13}*Formulas!F8`]
  ];

  for (const [name, formulaText, monthlyFormula] of breakdownRows) {
    wsBreakdown.addRow([
      name,
      formulaText,
      { formula: monthlyFormula },
      { formula: `${monthlyFormula}*12` },
      { formula: "" }
    ]);
    const r = wsBreakdown.rowCount;
    wsBreakdown.getCell(`E${r}`).value = { formula: `C${r}/SUM(C2:C13)` };
    styleCalculated(wsBreakdown.getCell(`C${r}`));
    styleCalculated(wsBreakdown.getCell(`D${r}`));
    styleCalculated(wsBreakdown.getCell(`E${r}`));
  }
  wsBreakdown.addRow(["Total", "sum", { formula: "SUM(C2:C13)" }, { formula: "SUM(D2:D13)" }, "100%"]);
  styleHeader(wsBreakdown.getRow(wsBreakdown.rowCount));

  const wsCommit = workbook.addWorksheet("Commitment_Compare");
  wsCommit.columns = [{ width: 34 }, { width: 24 }, { width: 20 }, { width: 20 }, { width: 20 }];
  wsCommit.addRow(["Strategy", "Monthly USD", "Annual USD", "Savings vs PAYG (USD/mo)", "Savings %"]);
  styleHeader(wsCommit.getRow(1));

  const commitRows = [
    ["PAYG baseline", "Cost_Breakdown!C14"],
    ["VM only - 1Y RI", "Cost_Breakdown!C14 - Cost_Breakdown!C2 + (Inputs!C" + (priceStart + 1) + "/12)*Formulas!F" + reqVmTotalRow],
    ["VM only - 3Y RI", "Cost_Breakdown!C14 - Cost_Breakdown!C2 + (Inputs!C" + (priceStart + 2) + "/36)*Formulas!F" + reqVmTotalRow],
    ["Postgres only - 1Y RI", "Cost_Breakdown!C14 - Cost_Breakdown!C5 + (Inputs!C" + (priceStart + 4) + "/12)*Inputs!C" + pgVCoresRow],
    ["Postgres only - 3Y RI", "Cost_Breakdown!C14 - Cost_Breakdown!C5 + (Inputs!C" + (priceStart + 5) + "/36)*Inputs!C" + pgVCoresRow],
    ["VM + Postgres - 1Y RI", "Cost_Breakdown!C14 - Cost_Breakdown!C2 - Cost_Breakdown!C5 + (Inputs!C" + (priceStart + 1) + "/12)*Formulas!F" + reqVmTotalRow + " + (Inputs!C" + (priceStart + 4) + "/12)*Inputs!C" + pgVCoresRow],
    ["VM + Postgres - 3Y RI", "Cost_Breakdown!C14 - Cost_Breakdown!C2 - Cost_Breakdown!C5 + (Inputs!C" + (priceStart + 2) + "/36)*Formulas!F" + reqVmTotalRow + " + (Inputs!C" + (priceStart + 5) + "/36)*Inputs!C" + pgVCoresRow]
  ];

  for (const [name, monthlyExpr] of commitRows) {
    wsCommit.addRow([
      name,
      { formula: monthlyExpr },
      { formula: `${monthlyExpr}*12` },
      { formula: `B2-(${monthlyExpr})` },
      { formula: `IF(B2=0,0,(B2-(${monthlyExpr}))/B2)` }
    ]);
    const r = wsCommit.rowCount;
    styleCalculated(wsCommit.getCell(`B${r}`));
    styleCalculated(wsCommit.getCell(`C${r}`));
    styleCalculated(wsCommit.getCell(`D${r}`));
    styleCalculated(wsCommit.getCell(`E${r}`));
  }

  const wsPricing = workbook.addWorksheet("Pricing_Strategy");
  wsPricing.columns = [{ width: 44 }, { width: 24 }, { width: 44 }];
  wsPricing.addRow(["Metric", "Value", "Formula / notes"]);
  styleHeader(wsPricing.getRow(1));
  wsPricing.addRow(["Modeled monthly cost (selected scenario)", { formula: "Cost_Breakdown!C14" }, "from Cost_Breakdown"]);
  wsPricing.addRow(["Required monthly revenue for 90% margin", { formula: `B2/(1-Inputs!C${margin90Row})` }, "revenue = cost/(1-margin)"]);
  wsPricing.addRow(["Required monthly revenue for 95% margin", { formula: `B2/(1-Inputs!C${margin95Row})` }, "revenue = cost/(1-margin)"]);
  wsPricing.addRow([]);
  wsPricing.addRow(["Scenario-adjusted Pro users", { formula: `Inputs!D12*${selectedUserMult}` }, "Pro active users in selected scenario"]);
  wsPricing.addRow(["Scenario-adjusted Team users", { formula: `Inputs!E12*${selectedUserMult}` }, "Team active users in selected scenario"]);
  wsPricing.addRow(["Total active users (all cohorts)", { formula: `((Inputs!C12+Inputs!D12+Inputs!E12)*${selectedUserMult})` }, "used by conversion mode"]);
  wsPricing.addRow(["Conversion-mode Pro users", { formula: `B8*Inputs!C${conversionProRow}` }, "from conversion rate"]);
  wsPricing.addRow(["Conversion-mode Team users", { formula: `B8*Inputs!C${conversionTeamRow}` }, "from conversion rate"]);
  wsPricing.addRow(["Tier-count mode paying users (Pro+Team)", { formula: "B6+B7" }, "free tier excluded"]);
  wsPricing.addRow(["Active pricing mode", { formula: `Inputs!C${pricingModeRow}` }, "tier_counts or conversion_based"]);
  wsPricing.addRow(["Selected Pro users", { formula: `IF(B12=\"conversion_based\",B9,B6)` }, "users used for pricing solve"]);
  wsPricing.addRow(["Selected Team users", { formula: `IF(B12=\"conversion_based\",B10,B7)` }, "users used for pricing solve"]);
  wsPricing.addRow(["Total paying users (selected mode)", { formula: "B13+B14" }, "for blended ARPU"]);
  wsPricing.addRow(["Team price multiplier vs Pro", { formula: `Inputs!C${teamMultiplierRow}` }, "editable in Inputs"]);
  wsPricing.addRow(["Price denominator (Pro + Team*multiplier)", { formula: "B13 + (B14*B16)" }, "for solving two-tier pricing"]);
  wsPricing.addRow([]);
  wsPricing.addRow(["Recommended Pro price @90% margin", { formula: "IF(B17=0,0,B3/B17)" }, "monthly price per Pro user"]);
  wsPricing.addRow(["Recommended Team price @90% margin", { formula: "B19*B16" }, "monthly price per Team user"]);
  wsPricing.addRow(["Blended ARPU needed @90% margin", { formula: "IF(B15=0,0,B3/B15)" }, "monthly revenue / paying user"]);
  wsPricing.addRow([]);
  wsPricing.addRow(["Recommended Pro price @95% margin", { formula: "IF(B17=0,0,B4/B17)" }, "monthly price per Pro user"]);
  wsPricing.addRow(["Recommended Team price @95% margin", { formula: "B23*B16" }, "monthly price per Team user"]);
  wsPricing.addRow(["Blended ARPU needed @95% margin", { formula: "IF(B15=0,0,B4/B15)" }, "monthly revenue / paying user"]);
  wsPricing.addRow([]);
  wsPricing.addRow(["Margin check @95 pricing", { formula: "IF((B23*B13+B24*B14)=0,0,1-(B2/(B23*B13+B24*B14)))" }, "should approximate target margin"]);
  for (let r = 2; r <= wsPricing.rowCount; r += 1) {
    styleCalculated(wsPricing.getCell(`B${r}`));
  }

  const wsSensitivity = workbook.addWorksheet("Sensitivity");
  wsSensitivity.columns = [{ width: 28 }, { width: 16 }, { width: 18 }, { width: 18 }];
  wsSensitivity.addRow(["Case", "Load multiplier", "Monthly USD", "Delta vs base"]);
  styleHeader(wsSensitivity.getRow(1));
  wsSensitivity.addRow(["Base", 1, { formula: "Cost_Breakdown!C14" }, 0]);
  wsSensitivity.addRow(["Low (-25%)", 0.75, { formula: "Cost_Breakdown!C14*0.75" }, { formula: "C3-C2" }]);
  wsSensitivity.addRow(["High (+25%)", 1.25, { formula: "Cost_Breakdown!C14*1.25" }, { formula: "C4-C2" }]);
  wsSensitivity.addRow(["Stress (+50%)", 1.5, { formula: "Cost_Breakdown!C14*1.5" }, { formula: "C5-C2" }]);
  for (let r = 2; r <= 5; r += 1) {
    styleCalculated(wsSensitivity.getCell(`C${r}`));
    styleCalculated(wsSensitivity.getCell(`D${r}`));
  }

  const wsSummary = workbook.addWorksheet("Finance_Summary");
  wsSummary.columns = [{ width: 40 }, { width: 30 }, { width: 30 }];
  wsSummary.addRow(["Metric", "Value", "Notes"]);
  styleHeader(wsSummary.getRow(1));
  wsSummary.addRow(["Selected scenario", { formula: "Inputs!C2" }, "Low/Base/High toggle on Inputs tab"]);
  wsSummary.addRow(["Monthly total cost", { formula: "Cost_Breakdown!C14" }, "USD/month"]);
  wsSummary.addRow(["Annual total cost", { formula: "Cost_Breakdown!D14" }, "USD/year"]);
  wsSummary.addRow(["Estimated required VM count", { formula: `Formulas!F${reqVmTotalRow}` }, "Computed from TTS + API peak"]);
  wsSummary.addRow(["Required VMs for TTS only", { formula: `Formulas!F${reqVmTtsRow}` }, "Capacity from Kokoro realtime factor"]);
  wsSummary.addRow(["Required VMs for API peak only", { formula: `Formulas!F${reqVmApiRow}` }, "Headroom-adjusted request peak"]);
  wsSummary.addRow(["Best commitment monthly", { formula: "MIN(Commitment_Compare!B2:B8)" }, "Lowest modeled monthly cost"]);
  wsSummary.addRow(["Required revenue @90% margin", { formula: "Pricing_Strategy!B3" }, "monthly"]);
  wsSummary.addRow(["Required revenue @95% margin", { formula: "Pricing_Strategy!B4" }, "monthly"]);
  wsSummary.addRow(["Recommended Pro price @95%", { formula: "Pricing_Strategy!B23" }, "monthly"]);
  wsSummary.addRow(["Recommended Team price @95%", { formula: "Pricing_Strategy!B24" }, "monthly"]);
  wsSummary.addRow(["Best commitment strategy", "VM + Postgres - 3Y RI", "From Commitment_Compare table"]);
  wsSummary.addRow(["Top cost driver", "VM + Postgres compute", "Review Cost_Breakdown % column"]);
  wsSummary.addRow(["Architecture baseline", `${ARCH_BASELINE.vmSku}, ${ARCH_BASELINE.postgresSku}, Blob Hot LRS`, "from infra/main.bicep"]);
  wsSummary.addRow(["Pricing snapshot timestamp", snapshot.generatedAt, "Azure Retail Prices API"]);
  for (let r = 2; r <= wsSummary.rowCount; r += 1) {
    styleCalculated(wsSummary.getCell(`B${r}`));
  }

  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  await mkdir(dirname(outPath), { recursive: true });
  await workbook.xlsx.writeFile(outPath);

  console.log(`Workbook generated: ${outPath}`);

  console.log("Scenario monthly totals (USD):");
  for (const scenario of scenarios) {
    console.log(`- ${scenario.scenarioName}: ${currency(scenario.monthlyTotal)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
