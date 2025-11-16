import type { Logger } from 'pino';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  jitter: boolean;
}

export interface RetryContext {
  attempt: number;
  lastError?: Error;
  totalElapsedMs: number;
}

export type RetryPredicate = (error: Error, context: RetryContext) => boolean;

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  jitter: true
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    config?: Partial<RetryConfig>;
    shouldRetry?: RetryPredicate;
    logger?: Logger;
    operationName?: string;
  } = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options.config };
  const shouldRetry = options.shouldRetry || defaultShouldRetry;
  const logger = options.logger;
  const operationName = options.operationName || 'operation';
  
  const startTime = Date.now();
  let lastError: Error;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      logger?.debug({ 
        attempt, 
        maxAttempts: config.maxAttempts,
        operationName 
      }, 'Attempting operation');
      
      const result = await operation();
      
      if (attempt > 1) {
        const totalElapsed = Date.now() - startTime;
        logger?.info({
          attempt,
          totalElapsedMs: totalElapsed,
          operationName
        }, 'Operation succeeded after retries');
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      const totalElapsed = Date.now() - startTime;
      
      const context: RetryContext = {
        attempt,
        lastError,
        totalElapsedMs: totalElapsed
      };

      if (attempt === config.maxAttempts) {
        logger?.error({
          attempt,
          maxAttempts: config.maxAttempts,
          totalElapsedMs: totalElapsed,
          error: lastError.message,
          operationName
        }, 'Operation failed after all retry attempts');
        
        throw lastError;
      }

      if (!shouldRetry(lastError, context)) {
        logger?.warn({
          attempt,
          error: lastError.message,
          operationName
        }, 'Operation failed with non-retryable error');
        
        throw lastError;
      }

      const delay = calculateDelay(attempt, config);
      
      logger?.warn({
        attempt,
        nextAttemptIn: delay,
        error: lastError.message,
        operationName
      }, 'Operation failed, retrying');

      await sleep(delay);
    }
  }

  throw lastError!;
}

export function defaultShouldRetry(error: Error, context: RetryContext): boolean {
  // Network errors are typically retryable
  const networkErrors = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EPROTO'];
  if ('code' in error && networkErrors.includes(error.code as string)) {
    return true;
  }

  // HTTP errors (if axios error structure)
  if ('response' in error && typeof error.response === 'object' && error.response !== null) {
    const response = error.response as any;
    if ('status' in response && typeof response.status === 'number') {
      const status = response.status;
      // Retry on server errors and rate limiting
      return status === 408 || status === 429 || (status >= 500 && status <= 599);
    }
  }

  // Don't retry by default
  return false;
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * (exponentialBase ^ (attempt - 1))
  const exponentialDelay = config.baseDelayMs * Math.pow(config.exponentialBase, attempt - 1);
  
  // Cap at maxDelay
  let delay = Math.min(exponentialDelay, config.maxDelayMs);
  
  // Add jitter to prevent thundering herd
  if (config.jitter) {
    // Add random jitter of ±25%
    const jitterFactor = 0.25;
    const jitter = (Math.random() - 0.5) * 2 * jitterFactor;
    delay = delay * (1 + jitter);
  }
  
  return Math.floor(Math.max(delay, 0));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Specialized retry predicates
export const retryPredicates = {
  // Network errors only
  networkOnly: (error: Error): boolean => {
    const networkErrors = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'];
    return 'code' in error && networkErrors.includes(error.code as string);
  },

  // HTTP server errors only
  httpServerErrors: (error: Error): boolean => {
    if ('response' in error && typeof error.response === 'object' && error.response !== null) {
      const response = error.response as any;
      if ('status' in response && typeof response.status === 'number') {
        return response.status >= 500 && response.status <= 599;
      }
    }
    return false;
  },

  // HTTP retryable errors (408, 429, 5xx)
  httpRetryable: (error: Error): boolean => {
    if ('response' in error && typeof error.response === 'object' && error.response !== null) {
      const response = error.response as any;
      if ('status' in response && typeof response.status === 'number') {
        const status = response.status;
        return status === 408 || status === 429 || (status >= 500 && status <= 599);
      }
    }
    return false;
  },

  // Never retry
  never: (): boolean => false,

  // Always retry (use with caution)
  always: (): boolean => true
};