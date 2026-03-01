import { feedbackFeatureAreaLabel, feedbackTypeLabel, type FeedbackFeatureArea, type FeedbackStatus, type FeedbackType } from "./feedback";
import { env } from "./env";
import { logger } from "./logger";

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;

export type FeedbackMirrorInput = {
  id: string;
  message: string;
  feedbackType: FeedbackType | null;
  featureArea: FeedbackFeatureArea | null;
  allowEmailContact: boolean;
  status: FeedbackStatus;
  sourcePath: string | null;
  createdAt: Date;
};

export type FeedbackMirrorResult =
  | {
      mirrorStatus: "MIRRORED";
      attemptedAt: Date;
      issueNumber: number;
      issueUrl: string;
      errorCode: null;
      errorMessage: null;
    }
  | {
      mirrorStatus: "FAILED";
      attemptedAt: Date;
      issueNumber: null;
      issueUrl: null;
      errorCode: string;
      errorMessage: string;
    }
  | {
      mirrorStatus: "SKIPPED";
      attemptedAt: Date;
      issueNumber: null;
      issueUrl: null;
      errorCode: null;
      errorMessage: null;
    };

function summarizeMessage(message: string): string {
  const singleLine = message.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 72) {
    return singleLine;
  }
  return `${singleLine.slice(0, 69)}...`;
}

function buildIssueTitle(input: FeedbackMirrorInput): string {
  const typeLabel = feedbackTypeLabel(input.feedbackType);
  const areaLabel = feedbackFeatureAreaLabel(input.featureArea);
  const summary = summarizeMessage(input.message);
  return `[Feedback][${typeLabel}][${areaLabel}] ${summary}`;
}

function buildIssueBody(input: FeedbackMirrorInput): string {
  const lines = [
    "## User Feedback",
    "",
    `- Feedback ID: \`${input.id}\``,
    `- Status: \`${input.status}\``,
    `- Type: ${feedbackTypeLabel(input.feedbackType)}`,
    `- Feature area: ${feedbackFeatureAreaLabel(input.featureArea)}`,
    `- Contact allowed: ${input.allowEmailContact ? "yes" : "no"}`,
    `- Source path: ${input.sourcePath || "unknown"}`,
    `- Submitted at (UTC): ${input.createdAt.toISOString()}`,
    "",
    "## Message",
    "",
    input.message
  ];
  return lines.join("\n");
}

export async function mirrorFeedback(input: FeedbackMirrorInput): Promise<FeedbackMirrorResult> {
  const attemptedAt = new Date();

  if (!env.feedbackMirrorEnabled) {
    return {
      mirrorStatus: "SKIPPED",
      attemptedAt,
      issueNumber: null,
      issueUrl: null,
      errorCode: null,
      errorMessage: null
    };
  }

  if (!env.feedbackMirrorOwner || !env.feedbackMirrorRepo || !env.feedbackMirrorToken) {
    await logger.warn("Feedback mirror is enabled but missing GitHub configuration.", {
      feedbackId: input.id
    });
    return {
      mirrorStatus: "FAILED",
      attemptedAt,
      issueNumber: null,
      issueUrl: null,
      errorCode: "MIRROR_CONFIG_INVALID",
      errorMessage: "Feedback mirror configuration is incomplete."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const endpoint = `${GITHUB_API_BASE}/repos/${encodeURIComponent(env.feedbackMirrorOwner)}/${encodeURIComponent(env.feedbackMirrorRepo)}/issues`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.feedbackMirrorToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        title: buildIssueTitle(input),
        body: buildIssueBody(input),
        labels: env.feedbackMirrorLabels.length > 0 ? env.feedbackMirrorLabels : undefined
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      const errorMessage = payload.message || `GitHub mirror request failed with status ${response.status}.`;
      await logger.warn("Feedback mirror request failed.", {
        feedbackId: input.id,
        status: response.status
      });
      return {
        mirrorStatus: "FAILED",
        attemptedAt,
        issueNumber: null,
        issueUrl: null,
        errorCode: "MIRROR_REQUEST_FAILED",
        errorMessage
      };
    }

    const payload = (await response.json()) as { number?: number; html_url?: string };
    if (typeof payload.number !== "number" || typeof payload.html_url !== "string" || payload.html_url.length === 0) {
      return {
        mirrorStatus: "FAILED",
        attemptedAt,
        issueNumber: null,
        issueUrl: null,
        errorCode: "MIRROR_RESPONSE_INVALID",
        errorMessage: "GitHub mirror response was missing issue metadata."
      };
    }

    return {
      mirrorStatus: "MIRRORED",
      attemptedAt,
      issueNumber: payload.number,
      issueUrl: payload.html_url,
      errorCode: null,
      errorMessage: null
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      mirrorStatus: "FAILED",
      attemptedAt,
      issueNumber: null,
      issueUrl: null,
      errorCode: isAbort ? "MIRROR_TIMEOUT" : "MIRROR_REQUEST_FAILED",
      errorMessage: isAbort
        ? "Timed out while creating GitHub issue mirror."
        : error instanceof Error
          ? error.message
          : "Unknown mirror failure."
    };
  } finally {
    clearTimeout(timeout);
  }
}
