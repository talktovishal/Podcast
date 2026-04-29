import assert from "node:assert/strict";
import test from "node:test";
import type { AdminAnalyticsCoverage, AdminAnalyticsFilters } from "../src/lib/admin-analytics/types";
import {
  buildAzurePrimaryAdminAnalyticsRetention,
  buildAzurePrimaryAdminAnalyticsSummary,
  buildAzurePrimaryAdminAnalyticsTimeseries,
  buildAzurePrimaryAdminAnalyticsUsers,
  type AzurePrimaryAnalyticsPlaybackEvent,
  type AzurePrimaryAnalyticsSnapshot
} from "../src/lib/admin-analytics/azure-primary";

const filters: AdminAnalyticsFilters = {
  from: new Date("2026-03-20T00:00:00.000Z"),
  to: new Date("2026-03-23T23:59:59.999Z"),
  preset: "30d",
  source: "ALL",
  auth: "ALL",
  role: "ALL"
};

function buildSnapshot(): AzurePrimaryAnalyticsSnapshot {
  return {
    users: [
      {
        user: {
          id: "user-a",
          email: "alice@example.com",
          passwordHash: null,
          name: "Alice",
          role: "USER",
          billingLanePreference: "LIVE",
          complimentaryPro: false,
          billingProvider: null,
          billingCustomerId: null,
          billingSubscriptionId: null,
          billingPriceId: null,
          billingPlanCode: "STARTER",
          billingStatus: "NONE",
          billingEntitlementStatus: "INACTIVE",
          billingLastPaymentStatus: "NONE",
          billingLastInvoiceId: null,
          billingCurrentPeriodEnd: null,
          billingCancelAtPeriodEnd: false,
          billingLastStripeEventId: null,
          billingLastStripeEventCreatedAt: null,
          billingLastSubscriptionEventAt: null,
          billingLastInvoiceEventAt: null,
          billingUpdatedAt: null,
          isPaid: false,
          submissionCount: 1,
          extraSubmissionCredits: 0,
          defaultItemProcessingMode: "FULL_EPISODE",
          ttsProvider: "kokoro",
          ttsVoice: "af_heart",
          firstSeenAt: new Date("2026-03-21T08:00:00.000Z"),
          firstSeenCountryCode: "US",
          firstSeenRegionCode: "CA",
          firstSeenCity: "San Francisco",
          lastSeenAt: new Date("2026-03-23T12:00:00.000Z"),
          lastSeenCountryCode: "US",
          lastSeenRegionCode: "CA",
          lastSeenCity: "San Francisco",
          createdAt: new Date("2026-03-21T08:00:00.000Z"),
          updatedAt: new Date("2026-03-23T12:00:00.000Z")
        },
        oauthIdentities: [],
        demographicSurvey: {
          id: "survey-a",
          userId: "user-a",
          status: "COMPLETED",
          ageBand: "AGE_25_34",
          genderIdentity: "WOMAN",
          genderSelfDescribe: null,
          completedAt: new Date("2026-03-21T08:05:00.000Z"),
          skippedAt: null,
          deletedAt: null,
          createdAt: new Date("2026-03-21T08:05:00.000Z"),
          updatedAt: new Date("2026-03-21T08:05:00.000Z")
        },
        sessions: [
          {
            id: "session-a-1",
            userId: "user-a",
            tokenHash: "hash-a-1",
            expiresAt: new Date("2026-04-20T08:00:00.000Z"),
            createdAt: new Date("2026-03-21T08:10:00.000Z")
          },
          {
            id: "session-a-2",
            userId: "user-a",
            tokenHash: "hash-a-2",
            expiresAt: new Date("2026-04-22T09:00:00.000Z"),
            createdAt: new Date("2026-03-22T09:00:00.000Z")
          }
        ],
        items: [
          {
            id: "item-a-1",
            userId: "user-a",
            sourceType: "URL",
            status: "READY",
            createdAt: new Date("2026-03-21T08:15:00.000Z"),
            updatedAt: new Date("2026-03-22T10:00:00.000Z"),
            errorCode: null,
            readyAt: new Date("2026-03-22T10:00:00.000Z")
          }
        ],
        authMethod: "LOCAL",
        segmentAuth: "LOCAL_ONLY",
        userRole: "USER"
      },
      {
        user: {
          id: "user-b",
          email: "bob@example.com",
          passwordHash: null,
          name: "Bob",
          role: "USER",
          billingLanePreference: "LIVE",
          complimentaryPro: false,
          billingProvider: null,
          billingCustomerId: null,
          billingSubscriptionId: null,
          billingPriceId: null,
          billingPlanCode: "STARTER",
          billingStatus: "NONE",
          billingEntitlementStatus: "INACTIVE",
          billingLastPaymentStatus: "NONE",
          billingLastInvoiceId: null,
          billingCurrentPeriodEnd: null,
          billingCancelAtPeriodEnd: false,
          billingLastStripeEventId: null,
          billingLastStripeEventCreatedAt: null,
          billingLastSubscriptionEventAt: null,
          billingLastInvoiceEventAt: null,
          billingUpdatedAt: null,
          isPaid: false,
          submissionCount: 1,
          extraSubmissionCredits: 0,
          defaultItemProcessingMode: "FULL_EPISODE",
          ttsProvider: "kokoro",
          ttsVoice: "af_heart",
          firstSeenAt: new Date("2026-03-22T11:00:00.000Z"),
          firstSeenCountryCode: "US",
          firstSeenRegionCode: "NY",
          firstSeenCity: "New York",
          lastSeenAt: new Date("2026-03-23T11:30:00.000Z"),
          lastSeenCountryCode: "US",
          lastSeenRegionCode: "NY",
          lastSeenCity: "New York",
          createdAt: new Date("2026-03-22T11:00:00.000Z"),
          updatedAt: new Date("2026-03-23T11:30:00.000Z")
        },
        oauthIdentities: [
          {
            id: "oauth-b",
            userId: "user-b",
            provider: "google",
            providerUserId: "google-user-b",
            emailAtLink: "bob@example.com",
            createdAt: new Date("2026-03-22T11:00:00.000Z"),
            updatedAt: new Date("2026-03-22T11:00:00.000Z")
          }
        ],
        demographicSurvey: null,
        sessions: [
          {
            id: "session-b-1",
            userId: "user-b",
            tokenHash: "hash-b-1",
            expiresAt: new Date("2026-04-22T11:00:00.000Z"),
            createdAt: new Date("2026-03-23T11:30:00.000Z")
          }
        ],
        items: [
          {
            id: "item-b-1",
            userId: "user-b",
            sourceType: "PDF",
            status: "FAILED",
            createdAt: new Date("2026-03-22T11:05:00.000Z"),
            updatedAt: new Date("2026-03-23T15:00:00.000Z"),
            errorCode: "FETCH_FAILED",
            readyAt: null
          }
        ],
        authMethod: "GOOGLE",
        segmentAuth: "OAUTH_LINKED",
        userRole: "USER"
      }
    ],
    recentJobs: [
      {
        id: "job-a",
        itemId: "item-a-1",
        userId: "user-a",
        jobKind: "FULL_EPISODE",
        attempt: 1,
        status: "READY",
        lockedAt: null,
        leaseId: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        dispatchMessageId: null,
        scheduledFor: null,
        nextRetryAt: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date("2026-03-21T08:15:00.000Z"),
        updatedAt: new Date("2026-03-22T10:00:00.000Z")
      },
      {
        id: "job-b",
        itemId: "item-b-1",
        userId: "user-b",
        jobKind: "FULL_EPISODE",
        attempt: 1,
        status: "FAILED",
        lockedAt: null,
        leaseId: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        dispatchMessageId: null,
        scheduledFor: null,
        nextRetryAt: new Date("2026-03-23T16:00:00.000Z"),
        errorCode: "FETCH_FAILED",
        errorMessage: "Fetch failed",
        createdAt: new Date("2026-03-22T11:05:00.000Z"),
        updatedAt: new Date("2026-03-23T15:00:00.000Z")
      }
    ],
    queueCounts: {
      queuedJobs: 1,
      processingJobs: 0,
      retryableFailedJobs: 1
    }
  };
}

const playbackEvents: AzurePrimaryAnalyticsPlaybackEvent[] = [
  {
    day: "2026-03-23",
    occurredAt: new Date("2026-03-23T18:00:00.000Z"),
    userId: "user-a"
  }
];

test("azure primary analytics builders derive summary, trend, retention, and users data", () => {
  const snapshot = buildSnapshot();
  const baseCoverage: AdminAnalyticsCoverage[] = [];

  const summary = buildAzurePrimaryAdminAnalyticsSummary({
    filters,
    snapshot,
    playbackEvents,
    baseCoverage
  });
  assert.equal(summary.acquisition.newSignups, 2);
  assert.equal(summary.acquisition.cumulativeUsers, 2);
  assert.equal(summary.activation.activationRate7d, 50);
  assert.equal(summary.activation.firstSubmission24hRate, 100);
  assert.equal(summary.funnel.submittedItems, 2);
  assert.equal(summary.funnel.readyItems, 1);
  assert.equal(summary.funnel.failedItems, 1);
  assert.equal(summary.engagement.playbackStarts, 1);
  assert.equal(summary.funnel.topErrorCodes[0]?.code, "FETCH_FAILED");
  assert.equal(summary.coverage.some((entry) => entry.metricKey === "user_signups"), true);

  const timeseries = buildAzurePrimaryAdminAnalyticsTimeseries({
    filters,
    snapshot,
    playbackEvents,
    baseCoverage
  });
  const march21 = timeseries.points.find((point) => point.day === "2026-03-21");
  const march22 = timeseries.points.find((point) => point.day === "2026-03-22");
  const march23 = timeseries.points.find((point) => point.day === "2026-03-23");
  assert.equal(march21?.signups, 1);
  assert.equal(march21?.submissions, 1);
  assert.equal(march22?.signups, 1);
  assert.equal(march22?.ready, 1);
  assert.equal(march23?.failed, 1);
  assert.equal(march23?.playbackStarts, 1);

  const retention = buildAzurePrimaryAdminAnalyticsRetention({
    filters,
    snapshot,
    playbackEvents,
    baseCoverage
  });
  assert.equal(retention.rows.length, 1);
  assert.equal(retention.rows[0]?.cohortSize, 2);
  assert.equal(retention.rows[0]?.d1, 100);

  const usersMasked = buildAzurePrimaryAdminAnalyticsUsers({
    filters,
    snapshot,
    playbackEvents,
    page: 1,
    pageSize: 25,
    pii: false
  });
  assert.equal(usersMasked.rows.length, 2);
  assert.equal(usersMasked.rows[0]?.email.includes("*"), true);
  const aliceMasked = usersMasked.rows.find((row) => row.userId === "user-a");
  const bobMasked = usersMasked.rows.find((row) => row.userId === "user-b");
  assert.equal(aliceMasked?.ready, 1);
  assert.equal(aliceMasked?.playbackStarts, 1);
  assert.equal(bobMasked?.failed, 1);

  const usersPii = buildAzurePrimaryAdminAnalyticsUsers({
    filters,
    snapshot,
    playbackEvents,
    page: 1,
    pageSize: 25,
    pii: true
  });
  const alicePii = usersPii.rows.find((row) => row.userId === "user-a");
  assert.equal(alicePii?.email, "alice@example.com");
  assert.equal(alicePii?.firstSeenCity, "San Francisco");
  assert.equal(alicePii?.ageBand, "AGE_25_34");
});
