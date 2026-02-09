export const logLevels = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"] as const;

export type LogLevel = (typeof logLevels)[number];

export type LogEvent = {
  ts: string;
  level: LogLevel;
  service: string;
  env: string;
  msg: string;
  error_code?: string;
  trace_id?: string;
  span_id?: string;
  request_id?: string;
  job_id?: string;
  item_id?: string;
  user_id_hash?: string;
  attrs?: Record<string, unknown>;
  support_id?: string;
};

export type LogContext = {
  trace_id?: string;
  span_id?: string;
  request_id?: string;
  job_id?: string;
  item_id?: string;
  user_id_hash?: string;
};

export type ErrorPayload = {
  error_code: string;
  error_message: string;
  retry_recommended?: boolean;
  support_id?: string;
};
