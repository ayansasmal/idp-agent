import type { Logger, LoggerOptions } from 'pino';

export interface ServiceLoggerConfig {
  service: string;
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  environment?: 'development' | 'staging' | 'production';
  redact?: string[];
  formatters?: {
    time?: (timestamp: number) => string;
    level?: (label: string, number: number) => Record<string, any>;
  };
}

export interface LogContext {
  service: string;
  version?: string;
  environment?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
}

export type { Logger, LoggerOptions } from 'pino';