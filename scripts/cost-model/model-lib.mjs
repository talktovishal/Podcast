import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const COST_REGION = "eastus";
export const CURRENCY = "USD";
export const HOURS_PER_MONTH = 730;
export const DAYS_PER_MONTH = 30.4;

export const ARCH_BASELINE = {
  region: COST_REGION,
  vmSku: "Standard_D4as_v5",
  vmCount: 1,
  postgresSku: "General Purpose Ddsv4 (2 vCore equivalent)",
  postgresVCores: 2,
  postgresStorageGb: 128,
  postgresBackupRetentionDays: 14,
  blobSku: "Standard_LRS Hot",
  publicIpSku: "Standard IPv4 Static",
  osDiskSku: "Premium SSD P4 LRS"
};

export const COHORTS = ["Free", "Pro", "Team"];

export const BASE_INPUTS = {
  global: {
    daysPerMonth: DAYS_PER_MONTH,
    hoursPerMonth: HOURS_PER_MONTH,
    headroomFactor: 1.3,
    workerParallelism: 4,
    vmCount: 1,
    vmPricingMode: "payg",
    postgresPricingMode: "ri_3y",
    ttsSuccessRate: 0.97,
    retryRate: 0.08,
    backupMultiplierDb: 1.2,
    retentionMonthsBlob: 12,
    retentionMonthsDb: 24,
    ttsRealtimeFactorPerVm: 2.4,
    vmUtilizationTarget: 0.75,
    vmWebApiOverheadFraction: 0.2,
    apiSubmissionsCapacityPerVmHour: 120,
    targetGrossMargin90: 0.9,
    targetGrossMargin95: 0.95,
    teamPriceMultiplierVsPro: 4,
    pricingMode: "tier_counts",
    conversionToProRate: 0.08,
    conversionToTeamRate: 0.015
  },
  cohorts: {
    Free: {
      activeUsers: 2000,
      articlesPerUserPerDay: 0.4,
      peakSubmissionsPerHourPer1000Users: 35,
      avgArticleMinutes: 6,
      avgWordsPerArticle: 900,
      pctUrl: 0.7,
      pctPdf: 0.2,
      pctHtmlSnapshot: 0.1,
      avgOutputAudioMbPerMin: 0.45,
      avgBlobReadsPerEpisodePerMonth: 2.2,
      avgEgressGbPerUserPerMonth: 0.18,
      avgDbRowsPerArticle: 14,
      avgDbStorageKbPerArticle: 12,
      avgTableOpsPerArticle: 18
    },
    Pro: {
      activeUsers: 500,
      articlesPerUserPerDay: 1.2,
      peakSubmissionsPerHourPer1000Users: 55,
      avgArticleMinutes: 10,
      avgWordsPerArticle: 1700,
      pctUrl: 0.7,
      pctPdf: 0.2,
      pctHtmlSnapshot: 0.1,
      avgOutputAudioMbPerMin: 0.45,
      avgBlobReadsPerEpisodePerMonth: 2.8,
      avgEgressGbPerUserPerMonth: 0.55,
      avgDbRowsPerArticle: 18,
      avgDbStorageKbPerArticle: 16,
      avgTableOpsPerArticle: 28
    },
    Team: {
      activeUsers: 80,
      articlesPerUserPerDay: 4.0,
      peakSubmissionsPerHourPer1000Users: 95,
      avgArticleMinutes: 14,
      avgWordsPerArticle: 2500,
      pctUrl: 0.6,
      pctPdf: 0.25,
      pctHtmlSnapshot: 0.15,
      avgOutputAudioMbPerMin: 0.45,
      avgBlobReadsPerEpisodePerMonth: 4.5,
      avgEgressGbPerUserPerMonth: 1.8,
      avgDbRowsPerArticle: 26,
      avgDbStorageKbPerArticle: 24,
      avgTableOpsPerArticle: 42
    }
  }
};

export const SCENARIOS = {
  Low: { userMultiplier: 0.7, usageMultiplier: 0.75, egressMultiplier: 0.8 },
  Base: { userMultiplier: 1.0, usageMultiplier: 1.0, egressMultiplier: 1.0 },
  High: { userMultiplier: 1.6, usageMultiplier: 1.4, egressMultiplier: 1.5 }
};

const FALLBACK_PRICES = {
  vmHourlyPayg: 0.172,
  vmReservation1Year: 889,
  vmReservation3Year: 1718,
  postgresVcoreHourlyPayg: 0.089,
  postgresVcoreReservation1Year: 468,
  postgresVcoreReservation3Year: 936,
  postgresStorageGbMonth: 0.115,
  postgresBackupGbMonth: 0.095,
  blobHotLrsGbMonth: 0.0208,
  blobWriteOpsPer10k: 0.05,
  blobReadOpsPer10k: 0.004,
  tableLrsGbMonth: 0.045,
  tableOpsPer10k: 0.00036,
  bandwidthEgressGb: 0.08,
  publicIpHourly: 0.005,
  osDiskMonth: 5.2795
};

async function fetchAllPages(url) {
  const out = [];
  let next = url;
  while (next) {
    const response = await fetch(next);
    if (!response.ok) {
      throw new Error(`Price API request failed: ${response.status}`);
    }
    const data = await response.json();
    out.push(...(data.Items || []));
    next = data.NextPageLink || null;
  }
  return out;
}

function pickMinPrice(items, predicate) {
  const matched = items.filter(predicate).map((item) => Number(item.unitPrice)).filter((v) => Number.isFinite(v) && v > 0);
  if (matched.length === 0) {
    return null;
  }
  return Math.min(...matched);
}

function pickSingle(items, predicate, fallback) {
  const value = pickMinPrice(items, predicate);
  return value ?? fallback;
}

export async function fetchAzurePriceSnapshot() {
  const vmUrl = `https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20'Virtual%20Machines'%20and%20armRegionName%20eq%20'${COST_REGION}'%20and%20armSkuName%20eq%20'Standard_D4as_v5'`;
  const vmItems = await fetchAllPages(vmUrl);

  const pgUrl = `https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20'Azure%20Database%20for%20PostgreSQL'%20and%20armRegionName%20eq%20'${COST_REGION}'`;
  const pgItems = await fetchAllPages(pgUrl);

  const storageUrl = `https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20'Storage'%20and%20armRegionName%20eq%20'${COST_REGION}'`;
  const storageItems = await fetchAllPages(storageUrl);

  const networkUrl = `https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20'Virtual%20Network'%20and%20armRegionName%20eq%20'${COST_REGION}'`;
  const networkItems = await fetchAllPages(networkUrl);

  const bandwidthUrl = `https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20'Bandwidth'%20and%20armRegionName%20eq%20'${COST_REGION}'`;
  const bandwidthItems = await fetchAllPages(bandwidthUrl);

  const prices = {
    vmHourlyPayg: pickSingle(
      vmItems,
      (item) => item.type === "Consumption" && item.skuName === "Standard_D4as_v5" && !String(item.productName || "").includes("Windows") && !String(item.skuName || "").includes("Spot") && !String(item.skuName || "").includes("Low Priority"),
      FALLBACK_PRICES.vmHourlyPayg
    ),
    vmReservation1Year: pickSingle(
      vmItems,
      (item) => item.type === "Reservation" && item.reservationTerm === "1 Year" && !String(item.productName || "").includes("Windows"),
      FALLBACK_PRICES.vmReservation1Year
    ),
    vmReservation3Year: pickSingle(
      vmItems,
      (item) => item.type === "Reservation" && item.reservationTerm === "3 Years" && !String(item.productName || "").includes("Windows"),
      FALLBACK_PRICES.vmReservation3Year
    ),
    postgresVcoreHourlyPayg: pickSingle(
      pgItems,
      (item) => String(item.productName || "").includes("Flexible Server General Purpose Ddsv4") && String(item.meterName || "").includes("vCore") && item.type === "Consumption",
      FALLBACK_PRICES.postgresVcoreHourlyPayg
    ),
    postgresVcoreReservation1Year: pickSingle(
      pgItems,
      (item) => String(item.productName || "").includes("Flexible Server General Purpose Ddsv4") && String(item.meterName || "").includes("vCore") && item.type === "Reservation" && item.reservationTerm === "1 Year",
      FALLBACK_PRICES.postgresVcoreReservation1Year
    ),
    postgresVcoreReservation3Year: pickSingle(
      pgItems,
      (item) => String(item.productName || "").includes("Flexible Server General Purpose Ddsv4") && String(item.meterName || "").includes("vCore") && item.type === "Reservation" && item.reservationTerm === "3 Years",
      FALLBACK_PRICES.postgresVcoreReservation3Year
    ),
    postgresStorageGbMonth: pickSingle(
      pgItems,
      (item) => String(item.productName || "").includes("Flexible Server Storage") && String(item.meterName || "").includes("Storage Data Stored"),
      FALLBACK_PRICES.postgresStorageGbMonth
    ),
    postgresBackupGbMonth: pickSingle(
      pgItems,
      (item) => String(item.productName || "").includes("Backup Storage") && String(item.meterName || "").includes("Data Stored"),
      FALLBACK_PRICES.postgresBackupGbMonth
    ),
    blobHotLrsGbMonth: pickSingle(
      storageItems,
      (item) => item.productName === "General Block Blob v2" && item.skuName === "Hot LRS" && item.meterName === "Hot LRS Data Stored" && Number(item.tierMinimumUnits || 0) === 0,
      FALLBACK_PRICES.blobHotLrsGbMonth
    ),
    blobWriteOpsPer10k: pickSingle(
      storageItems,
      (item) => item.productName === "General Block Blob v2" && item.skuName === "Hot LRS" && item.meterName === "Hot LRS Write Operations",
      FALLBACK_PRICES.blobWriteOpsPer10k
    ),
    blobReadOpsPer10k: pickSingle(
      storageItems,
      (item) => item.productName === "General Block Blob v2" && item.skuName === "Hot LRS" && item.meterName === "Hot LRS Read Operations",
      FALLBACK_PRICES.blobReadOpsPer10k
    ),
    tableLrsGbMonth: pickSingle(
      storageItems,
      (item) => item.productName === "Tables" && item.skuName === "Standard LRS" && item.meterName === "LRS Data Stored",
      FALLBACK_PRICES.tableLrsGbMonth
    ),
    tableOpsPer10k: pickSingle(
      storageItems,
      (item) => item.productName === "Tables" && item.skuName === "Standard LRS" && String(item.meterName || "").includes("Operations"),
      FALLBACK_PRICES.tableOpsPer10k
    ),
    bandwidthEgressGb: pickSingle(
      bandwidthItems,
      (item) => String(item.productName || "").includes("Bandwidth - Routing Preference: Internet") && String(item.meterName || "").includes("Data Transfer Out") && Number(item.unitPrice) > 0,
      FALLBACK_PRICES.bandwidthEgressGb
    ),
    publicIpHourly: pickSingle(
      networkItems,
      (item) => item.productName === "IP Addresses" && item.skuName === "Standard" && String(item.meterName || "").includes("Static Public IP"),
      FALLBACK_PRICES.publicIpHourly
    ),
    osDiskMonth: pickSingle(
      storageItems,
      (item) => item.productName === "Premium SSD Managed Disks" && item.skuName === "P4 LRS" && item.meterName === "P4 LRS Disk",
      FALLBACK_PRICES.osDiskMonth
    )
  };

  return {
    generatedAt: new Date().toISOString(),
    region: COST_REGION,
    currency: CURRENCY,
    prices,
    rawSamples: {
      vm: vmItems.slice(0, 30),
      postgres: pgItems.slice(0, 80),
      storage: storageItems.slice(0, 120),
      network: networkItems.slice(0, 30),
      bandwidth: bandwidthItems.slice(0, 40)
    }
  };
}

function scenarioCohortInputs(cohortBase, scenario) {
  return {
    activeUsers: cohortBase.activeUsers * scenario.userMultiplier,
    articlesPerUserPerDay: cohortBase.articlesPerUserPerDay * scenario.usageMultiplier,
    avgArticleMinutes: cohortBase.avgArticleMinutes * scenario.usageMultiplier,
    avgOutputAudioMbPerMin: cohortBase.avgOutputAudioMbPerMin,
    avgBlobReadsPerEpisodePerMonth: cohortBase.avgBlobReadsPerEpisodePerMonth,
    avgEgressGbPerUserPerMonth: cohortBase.avgEgressGbPerUserPerMonth * scenario.egressMultiplier,
    avgDbStorageKbPerArticle: cohortBase.avgDbStorageKbPerArticle,
    avgTableOpsPerArticle: cohortBase.avgTableOpsPerArticle
  };
}

export function computeScenarioTotals(inputs, prices, scenarioName) {
  const scenario = SCENARIOS[scenarioName];
  const totals = {
    submissionsMonth: 0,
    effectiveJobsMonth: 0,
    readyEpisodesMonth: 0,
    audioMinutesMonth: 0,
    audioGbMonth: 0,
    blobReadsMonth: 0,
    egressGbMonth: 0,
    dbGrowthGbMonth: 0,
    tableOpsMonth: 0,
    peakSubmissionsPerHour: 0
  };

  for (const cohortName of COHORTS) {
    const base = inputs.cohorts[cohortName];
    const cohort = scenarioCohortInputs(base, scenario);
    const submissionsMonth = cohort.activeUsers * cohort.articlesPerUserPerDay * inputs.global.daysPerMonth;
    const effectiveJobsMonth = submissionsMonth * (1 + inputs.global.retryRate);
    const readyEpisodesMonth = effectiveJobsMonth * inputs.global.ttsSuccessRate;
    const audioMinutesMonth = readyEpisodesMonth * cohort.avgArticleMinutes;
    const audioGbMonth = (audioMinutesMonth * cohort.avgOutputAudioMbPerMin) / 1024;
    const blobReadsMonth = readyEpisodesMonth * cohort.avgBlobReadsPerEpisodePerMonth;
    const egressGbMonth = cohort.activeUsers * cohort.avgEgressGbPerUserPerMonth;
    const dbGrowthGbMonth = (effectiveJobsMonth * cohort.avgDbStorageKbPerArticle) / (1024 * 1024);
    const tableOpsMonth = effectiveJobsMonth * cohort.avgTableOpsPerArticle;
    const peakSubmissionsPerHour =
      (cohort.activeUsers / 1000) * base.peakSubmissionsPerHourPer1000Users * scenario.usageMultiplier;

    totals.submissionsMonth += submissionsMonth;
    totals.effectiveJobsMonth += effectiveJobsMonth;
    totals.readyEpisodesMonth += readyEpisodesMonth;
    totals.audioMinutesMonth += audioMinutesMonth;
    totals.audioGbMonth += audioGbMonth;
    totals.blobReadsMonth += blobReadsMonth;
    totals.egressGbMonth += egressGbMonth;
    totals.dbGrowthGbMonth += dbGrowthGbMonth;
    totals.tableOpsMonth += tableOpsMonth;
    totals.peakSubmissionsPerHour += peakSubmissionsPerHour;
  }

  const ttsCapacityMinutesPerVmMonth =
    inputs.global.hoursPerMonth *
    60 *
    inputs.global.ttsRealtimeFactorPerVm *
    inputs.global.vmUtilizationTarget *
    (1 - inputs.global.vmWebApiOverheadFraction);
  const requiredVmForTts = Math.max(1, Math.ceil(totals.audioMinutesMonth / Math.max(ttsCapacityMinutesPerVmMonth, 1)));
  const requiredVmForApi = Math.max(
    1,
    Math.ceil(
      (totals.peakSubmissionsPerHour * inputs.global.headroomFactor) /
        Math.max(inputs.global.apiSubmissionsCapacityPerVmHour, 1)
    )
  );
  const requiredVmCount = Math.max(inputs.global.vmCount, requiredVmForTts, requiredVmForApi);

  const vmHourly =
    inputs.global.vmPricingMode === "ri_3y"
      ? prices.vmReservation3Year / 36
      : inputs.global.vmPricingMode === "ri_1y"
        ? prices.vmReservation1Year / 12
        : prices.vmHourlyPayg * inputs.global.hoursPerMonth;

  const postgresVcoreMonthly =
    inputs.global.postgresPricingMode === "ri_3y"
      ? prices.postgresVcoreReservation3Year / 36
      : inputs.global.postgresPricingMode === "ri_1y"
        ? prices.postgresVcoreReservation1Year / 12
        : prices.postgresVcoreHourlyPayg * inputs.global.hoursPerMonth;

  const monthly = {
    vmCompute: vmHourly * requiredVmCount,
    vmPublicIp: prices.publicIpHourly * inputs.global.hoursPerMonth,
    vmOsDisk: prices.osDiskMonth,
    postgresCompute: postgresVcoreMonthly * ARCH_BASELINE.postgresVCores,
    postgresStorage: prices.postgresStorageGbMonth * ARCH_BASELINE.postgresStorageGb,
    postgresBackup: prices.postgresBackupGbMonth * ARCH_BASELINE.postgresStorageGb * inputs.global.backupMultiplierDb,
    blobStorage: prices.blobHotLrsGbMonth * Math.max(ARCH_BASELINE.postgresStorageGb, totals.audioGbMonth * inputs.global.retentionMonthsBlob * 0.25),
    blobWriteOps: prices.blobWriteOpsPer10k * (totals.readyEpisodesMonth / 10000),
    blobReadOps: prices.blobReadOpsPer10k * (totals.blobReadsMonth / 10000),
    tableStorage: prices.tableLrsGbMonth * Math.max(5, totals.dbGrowthGbMonth * 0.25),
    tableOps: prices.tableOpsPer10k * (totals.tableOpsMonth / 10000),
    egress: prices.bandwidthEgressGb * totals.egressGbMonth
  };

  const monthlyTotal = Object.values(monthly).reduce((sum, value) => sum + value, 0);
  const annualTotal = monthlyTotal * 12;

  const vmRi1YMonthly = (prices.vmReservation1Year / 12) * requiredVmCount;
  const vmRi3YMonthly = (prices.vmReservation3Year / 36) * requiredVmCount;
  const pgRi1YMonthly = (prices.postgresVcoreReservation1Year / 12) * ARCH_BASELINE.postgresVCores;
  const pgRi3YMonthly = (prices.postgresVcoreReservation3Year / 36) * ARCH_BASELINE.postgresVCores;

  const commitment = {
    paygMonthly: monthlyTotal,
    vmOnly1YMonthly: monthlyTotal - monthly.vmCompute + vmRi1YMonthly,
    vmOnly3YMonthly: monthlyTotal - monthly.vmCompute + vmRi3YMonthly,
    pgOnly1YMonthly: monthlyTotal - monthly.postgresCompute + pgRi1YMonthly,
    pgOnly3YMonthly: monthlyTotal - monthly.postgresCompute + pgRi3YMonthly,
    vmAndPg1YMonthly: monthlyTotal - monthly.vmCompute - monthly.postgresCompute + vmRi1YMonthly + pgRi1YMonthly,
    vmAndPg3YMonthly: monthlyTotal - monthly.vmCompute - monthly.postgresCompute + vmRi3YMonthly + pgRi3YMonthly
  };

  return {
    scenarioName,
    totals,
    capacity: {
      ttsCapacityMinutesPerVmMonth,
      requiredVmForTts,
      requiredVmForApi,
      requiredVmCount
    },
    monthly,
    monthlyTotal,
    annualTotal,
    commitment
  };
}

export function computeAllScenarios(inputs, priceSnapshot) {
  const prices = priceSnapshot.prices;
  return Object.keys(SCENARIOS).map((name) => computeScenarioTotals(inputs, prices, name));
}

export async function loadPriceSnapshot(cachePath) {
  try {
    const raw = await readFile(cachePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function savePriceSnapshot(cachePath, snapshot) {
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

export function roundCurrency(value) {
  return Number(value.toFixed(2));
}
