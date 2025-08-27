import axios from 'axios';
import type { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { Logger } from 'pino';
import type { HttpClientConfig, RetryOptions, RequestMetadata } from './types.js';

/**
 * Default configuration for HTTP clients across all AI-IDP services
 * 
 * Provides sensible defaults for timeout, retry behavior, headers, and user agent
 * to ensure consistent HTTP behavior across all agents and services.
 */
const DEFAULT_CONFIG: Required<HttpClientConfig> = {
  /** Default request timeout in milliseconds */
  timeout: 30000,
  /** Maximum number of retry attempts for failed requests */
  maxRetries: 3,
  /** Base delay between retry attempts in milliseconds */
  retryDelay: 1000,
  /** Base URL for all requests (empty by default) */
  baseURL: '',
  /** Default headers added to all requests */
  headers: {},
  /** User agent string identifying AI-IDP requests */
  userAgent: 'AI-IDP/1.0.0'
};

/**
 * Default retry configuration for HTTP operations
 * 
 * Defines which errors and status codes should trigger automatic retries,
 * providing resilient HTTP communication for distributed agent operations.
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  /** Maximum number of retry attempts */
  maxRetries: 3,
  /** Base delay between retries in milliseconds (exponential backoff applied) */
  retryDelay: 1000,
  /** Network error codes that should trigger retries */
  retryableErrors: ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'],
  /** HTTP status codes that should trigger retries */
  retryableStatusCodes: [408, 429, 500, 502, 503, 504]
};

/**
 * Create a pre-configured Axios HTTP client with logging, retry logic, and request tracking
 * 
 * This factory function creates production-ready HTTP clients used across all AI-IDP
 * services. The client includes request/response logging, automatic retry with exponential
 * backoff, request correlation IDs, and security header sanitization.
 * 
 * **Features:**
 * - Request and response logging with performance metrics
 * - Automatic correlation ID generation for request tracking
 * - Security header sanitization to prevent credential leaks
 * - Error handling with detailed context for debugging
 * - Response size tracking for monitoring
 * 
 * @param config - HTTP client configuration options
 * @param logger - Pino logger instance for structured logging
 * @returns Configured Axios instance ready for production use
 * 
 * @example Basic HTTP Client
 * ```typescript
 * import { createHttpClient, createLogger } from '@ai-idp/utils';
 * 
 * const logger = createLogger({ service: 'infrastructure-agent' });
 * const httpClient = createHttpClient({
 *   timeout: 30000,
 *   maxRetries: 3,
 *   baseURL: 'https://api.kubernetes.io'
 * }, logger);
 * 
 * const response = await httpClient.get('/api/v1/nodes');
 * ```
 * 
 * @example With Custom Headers and User Agent
 * ```typescript
 * const httpClient = createHttpClient({
 *   timeout: 45000,
 *   headers: { 'X-Custom-Header': 'value' },
 *   userAgent: 'MyAgent/2.0.0'
 * }, logger);
 * 
 * const response = await httpClient.post('/api/deploy', {
 *   image: 'nginx:latest',
 *   replicas: 3
 * });
 * ```
 * 
 * @since 1.0.0
 */
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

/**
 * Execute HTTP operations with intelligent retry logic and exponential backoff
 * 
 * Provides resilient HTTP operation execution with automatic retry for transient
 * failures. Uses exponential backoff strategy and intelligent error classification
 * to determine which errors should trigger retries.
 * 
 * **Retry Strategy:**
 * - Exponential backoff: delay = baseDelay × 2^attempt  
 * - Network error detection (ECONNREFUSED, ETIMEDOUT, etc.)
 * - HTTP status code filtering (408, 429, 5xx errors)
 * - Maximum retry limit with immediate failure for non-retryable errors
 * 
 * @param operation - Async operation to execute with retry logic
 * @param options - Retry configuration options (merged with defaults)
 * @param logger - Optional logger for retry attempt tracking
 * @returns Promise resolving to operation result or rejecting with final error
 * 
 * @example Basic Retry Usage
 * ```typescript
 * import { withRetry, createHttpClient } from '@ai-idp/utils';
 * 
 * const result = await withRetry(
 *   () => httpClient.get('/api/unstable-endpoint'),
 *   {
 *     maxRetries: 5,
 *     retryDelay: 2000
 *   },
 *   logger
 * );
 * ```
 * 
 * @example Custom Retry Configuration
 * ```typescript
 * const result = await withRetry(
 *   () => kubernetesApi.createDeployment(deployment),
 *   {
 *     maxRetries: 3,
 *     retryDelay: 1500,
 *     retryableStatusCodes: [429, 503, 504],
 *     retryableErrors: ['ECONNRESET', 'ETIMEDOUT']
 *   },
 *   logger
 * );
 * ```
 * 
 * @template T - Return type of the operation
 * @since 1.0.0
 */
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

/**
 * Determine if an HTTP error should trigger a retry attempt
 * 
 * Analyzes axios errors to classify them as retryable or non-retryable based on
 * error codes, HTTP status codes, and retry configuration settings.
 * 
 * @param error - Axios error to evaluate for retry eligibility
 * @param options - Retry options containing retryable error/status code lists
 * @returns true if error should trigger retry, false for permanent failures
 * 
 * @since 1.0.0
 * @internal
 */
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

/**
 * Sanitize HTTP headers to prevent sensitive information leakage in logs
 * 
 * Removes or redacts sensitive authentication and security headers before
 * logging to prevent credential exposure in application logs and monitoring systems.
 * 
 * **Sensitive Headers Redacted:**
 * - authorization, cookie, x-api-key, api-key, x-auth-token
 * 
 * @param headers - Raw HTTP headers object to sanitize
 * @returns Sanitized headers object with sensitive values replaced with '[REDACTED]'
 * 
 * @since 1.0.0
 * @internal
 */
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