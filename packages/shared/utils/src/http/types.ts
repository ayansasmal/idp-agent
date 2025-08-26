import type { AxiosInstance, AxiosResponse } from 'axios';
import type { Logger } from 'pino';

export interface HttpClientConfig {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  baseURL?: string;
  headers?: Record<string, string>;
  userAgent?: string;
}

export interface RetryOptions {
  maxRetries: number;
  retryDelay: number;
  retryableErrors: string[];
  retryableStatusCodes: number[];
}

export interface HttpClientFactory {
  create(config: HttpClientConfig, logger: Logger): AxiosInstance;
  createWithRetry<T>(
    operation: () => Promise<T>,
    options?: Partial<RetryOptions>
  ): Promise<T>;
}

export interface RequestMetadata {
  startTime: number;
  requestId?: string;
}

export interface HttpResponse<T = any> extends AxiosResponse<T> {
  config: AxiosResponse<T>['config'] & { metadata?: RequestMetadata };
}