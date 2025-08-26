import axios from 'axios';
import type { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { Logger } from 'pino';
import type { HttpClientConfig, RetryOptions, RequestMetadata } from './types.js';

const DEFAULT_CONFIG: Required<HttpClientConfig> = {
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  baseURL: '',
  headers: {},
  userAgent: 'AI-IDP/1.0.0'
};

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  retryDelay: 1000,
  retryableErrors: ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'],
  retryableStatusCodes: [408, 429, 500, 502, 503, 504]
};

export function createHttpClient(config: HttpClientConfig, logger: Logger): AxiosInstance {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  const client = axios.create({
    timeout: finalConfig.timeout,
    baseURL: finalConfig.baseURL,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': finalConfig.userAgent,
      ...finalConfig.headers
    },
    validateStatus: (status: number) => status >= 200 && status < 300
  });

  // Request interceptor for logging and metadata
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig & { metadata?: RequestMetadata }) => {
      const startTime = Date.now();
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      config.metadata = { startTime, requestId };
      
      logger.debug({
        requestId,
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        headers: sanitizeHeaders(config.headers),
        timeout: config.timeout
      }, 'HTTP Request');
      
      return config;
    },
    (error: any) => {
      logger.error({ error: error.message }, 'HTTP Request Error');
      return Promise.reject(error);
    }
  );

  // Response interceptor for logging and timing
  client.interceptors.response.use(
    (response: AxiosResponse & { config: InternalAxiosRequestConfig & { metadata?: RequestMetadata } }) => {
      const duration = Date.now() - response.config.metadata!.startTime;
      
      logger.info({
        requestId: response.config.metadata?.requestId,
        method: response.config.method?.toUpperCase(),
        url: response.config.url,
        status: response.status,
        duration,
        responseSize: JSON.stringify(response.data).length
      }, 'HTTP Response');
      
      return response;
    },
    (error: AxiosError & { config?: InternalAxiosRequestConfig & { metadata?: RequestMetadata } }) => {
      const duration = error.config?.metadata?.startTime 
        ? Date.now() - error.config.metadata.startTime 
        : 0;
      
      logger.error({
        requestId: error.config?.metadata?.requestId,
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
        status: error.response?.status,
        duration,
        error: error.message,
        code: error.code
      }, 'HTTP Error');
      
      return Promise.reject(error);
    }
  );

  return client;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  logger?: Logger
): Promise<T> {
  const finalOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;
  
  for (let attempt = 0; attempt <= finalOptions.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === finalOptions.maxRetries) {
        throw error;
      }

      const isRetryable = isRetryableError(error as AxiosError, finalOptions);
      if (!isRetryable) {
        throw error;
      }

      const delay = finalOptions.retryDelay * Math.pow(2, attempt);
      
      logger?.warn({
        attempt: attempt + 1,
        maxRetries: finalOptions.maxRetries,
        delay,
        error: (error as Error).message
      }, 'Retrying HTTP request');
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

function isRetryableError(error: AxiosError, options: RetryOptions): boolean {
  // Network errors
  if (error.code && options.retryableErrors.includes(error.code)) {
    return true;
  }

  // HTTP status codes
  if (error.response?.status && options.retryableStatusCodes.includes(error.response.status)) {
    return true;
  }

  return false;
}

function sanitizeHeaders(headers: any): any {
  if (!headers) return {};
  
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'api-key', 'x-auth-token'];
  
  sensitiveHeaders.forEach(header => {
    const lowerHeader = header.toLowerCase();
    Object.keys(sanitized).forEach(key => {
      if (key.toLowerCase() === lowerHeader) {
        sanitized[key] = '[REDACTED]';
      }
    });
  });
  
  return sanitized;
}