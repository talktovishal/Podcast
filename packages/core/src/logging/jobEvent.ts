export type JobEventPayload = {
  jobId: string;
  itemId: string;
  stage: string;
  eventType: "start" | "success" | "error";
  message: string;
  errorCode?: string;
  diagnostic?: string;
  retryRecommended?: boolean;
};

export function sanitizeLogPayload(payload: JobEventPayload): JobEventPayload {
  return {
    ...payload,
    message: payload.message.slice(0, 400),
    diagnostic: payload.diagnostic?.slice(0, 400)
  };
}
