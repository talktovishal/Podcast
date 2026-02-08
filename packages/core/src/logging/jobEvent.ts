export type JobEventPayload = {
  jobId: string;
  itemId: string;
  stage: string;
  eventType: "start" | "success" | "error";
  message: string;
  errorCode?: string;
};

export function sanitizeLogPayload(payload: JobEventPayload): JobEventPayload {
  return {
    ...payload,
    message: payload.message.slice(0, 400)
  };
}
