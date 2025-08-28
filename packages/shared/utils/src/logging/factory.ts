import pino, { type Logger, type LoggerOptions } from 'pino';
import type { ServiceLoggerConfig, LogContext } from './types.js';

/**
 * Default logger configuration applied across all AI-IDP services
 * 
 * Ensures consistent logging behavior with security-first defaults,
 * including automatic redaction of sensitive fields and appropriate
 * log levels for different environments.
 */
const DEFAULT_CONFIG: Required<Omit<ServiceLoggerConfig, 'service'>> = {
  /** Default log level - info for production visibility */
  level: 'info',
  /** Default environment - development enables pretty printing */
  environment: 'development',
  /** Sensitive fields automatically redacted from all log output */
  redact: ['password', 'token', 'key', 'secret', 'authorization', 'cookie'],
  /** Custom formatters for timestamps and log levels */
  formatters: {}
};

/**
 * Create a production-ready Pino logger with consistent configuration across AI-IDP services
 * 
 * Creates structured loggers with service context, automatic redaction of sensitive data,
 * performance tracking, and environment-appropriate formatting. All loggers include
 * service identification, version info, and process metadata for distributed tracing.
 * 
 * **Features:**
 * - Automatic sensitive data redaction (passwords, tokens, keys)
 * - Service context in every log entry (service name, version, environment)
 * - Pretty printing for development, structured JSON for production
 * - ISO timestamp formatting for consistent log parsing
 * - Process and hostname identification for distributed systems
 * 
 * @param config - Logger configuration with service identification and options
 * @returns Configured Pino logger instance ready for production use
 * 
 * @example Basic Service Logger
 * ```typescript
 * import { createLogger } from '@ai-idp/utils';
 * 
 * const logger = createLogger({
 *   service: 'infrastructure-agent',
 *   level: 'info',
 *   environment: 'production'
 * });
 * 
 * logger.info({ deploymentId: 'nginx-123' }, 'Starting deployment');
 * logger.error(err, 'Deployment failed');
 * ```
 * 
 * @example Development Logger with Pretty Printing
 * ```typescript
 * const logger = createLogger({
 *   service: 'meta-agent',
 *   level: 'debug',
 *   environment: 'development'
 * });
 * 
 * // Outputs colorized, human-readable logs in development
 * logger.debug({ requestId: 'req-123' }, 'Processing user request');
 * ```
 * 
 * @example Custom Redaction and Formatters
 * ```typescript
 * const logger = createLogger({
 *   service: 'security-agent',
 *   level: 'warn',
 *   environment: 'production',
 *   redact: ['password', 'apiKey', 'sensitiveData'],
 *   formatters: {
 *     level: (label, number) => ({ severity: label.toUpperCase() })
 *   }
 * });
 * ```
 * 
 * @since 1.0.0
 */
export function createLogger(config: ServiceLoggerConfig): Logger {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const pinoOptions: LoggerOptions = {
    level: finalConfig.level,

    // Base context that appears in every log
    base: {
      service: finalConfig.service,
      environment: finalConfig.environment,
      version: process.env.npm_package_version || '1.0.0',
      pid: process.pid,
      hostname: process.env.HOSTNAME || require('os').hostname()
    },

    // Redact sensitive fields
    redact: {
      paths: finalConfig.redact,
      censor: '[REDACTED]'
    },

    // Timestamp formatting
    timestamp: finalConfig.formatters?.time ? () => finalConfig.formatters!.time!(Date.now()) : pino.stdTimeFunctions.isoTime,

    // Pretty printing for development
    transport: finalConfig.environment === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'hostname,pid'
      }
    } : undefined,

    // Custom formatters
    formatters: {
      level: finalConfig.formatters?.level || ((label: string, number: number) => ({ level: label })),
    }
  };

  return pino(pinoOptions);
}

/**
 * Create a child logger with additional context while inheriting parent configuration
 * 
 * Creates a new logger instance that inherits all settings from the parent logger
 * but adds additional context fields to every log entry. Useful for adding request-specific
 * or operation-specific context without creating entirely new logger configurations.
 * 
 * @param parentLogger - Parent Pino logger instance to inherit from
 * @param context - Additional context fields to include in all child log entries
 * @returns Child logger with merged context
 * 
 * @example Adding Request Context
 * ```typescript
 * const childLogger = createChildLogger(logger, {
 *   requestId: 'req-123',
 *   userId: 'user-456',
 *   operation: 'deployApplication'
 * });
 * 
 * childLogger.info('Processing deployment'); // Includes all context automatically
 * ```
 * 
 * @since 1.0.0
 */
export function createChildLogger(parentLogger: Logger, context: Partial<LogContext>): Logger {
  return parentLogger.child(context);
}

/**
 * Add request ID context to logger for request tracing
 * 
 * Creates a child logger with request ID context for tracking requests
 * across service boundaries and async operations.
 * 
 * @param logger - Base logger instance
 * @param requestId - Unique request identifier
 * @returns Logger with request ID context
 * 
 * @example
 * ```typescript
 * const reqLogger = withRequestId(logger, 'req-abc123');
 * reqLogger.info('Request started'); // Includes requestId automatically
 * ```
 * 
 * @since 1.0.0
 */
export function withRequestId(logger: Logger, requestId: string): Logger {
  return logger.child({ requestId });
}

/**
 * Add user ID context to logger for user-specific operations
 * 
 * Creates a child logger with user context for tracking user-specific
 * operations and audit trails.
 * 
 * @param logger - Base logger instance
 * @param userId - User identifier
 * @returns Logger with user ID context
 * 
 * @example
 * ```typescript
 * const userLogger = withUserId(logger, 'user-123');
 * userLogger.info('User action completed'); // Includes userId automatically
 * ```
 * 
 * @since 1.0.0
 */
export function withUserId(logger: Logger, userId: string): Logger {
  return logger.child({ userId });
}

/**
 * Add distributed tracing context to logger
 * 
 * Creates a child logger with trace and optional span IDs for distributed
 * tracing across microservices and agent communications.
 * 
 * @param logger - Base logger instance
 * @param traceId - Distributed trace identifier
 * @param spanId - Optional span identifier within the trace
 * @returns Logger with tracing context
 * 
 * @example
 * ```typescript
 * const traceLogger = withTrace(logger, 'trace-xyz789', 'span-abc123');
 * traceLogger.info('Service operation'); // Includes trace context
 * ```
 * 
 * @since 1.0.0
 */
export function withTrace(logger: Logger, traceId: string, spanId?: string): Logger {
  const context: any = { traceId };
  if (spanId) context.spanId = spanId;
  return logger.child(context);
}

/**
 * Performance logging utilities for tracking operation execution times
 * 
 * These utilities provide automatic timing and logging for operations,
 * helping track performance across all AI-IDP services and identify bottlenecks.
 */

/**
 * Log execution time for synchronous or asynchronous operations
 * 
 * Wraps any operation with automatic timing and logging, recording both
 * successful completions and failures with their execution durations.
 * 
 * @param logger - Logger instance for recording timing information
 * @param operation - Human-readable operation name for log identification
 * @param fn - Operation function to execute and time (sync or async)
 * @returns Promise resolving to operation result
 * 
 * @example Timing Async Operations
 * ```typescript
 * const result = await logExecutionTime(
 *   logger,
 *   'kubernetes-deploy',
 *   async () => {
 *     return await k8sApi.createDeployment(deployment);
 *   }
 * );
 * ```
 * 
 * @example Timing Sync Operations
 * ```typescript
 * const result = await logExecutionTime(
 *   logger,
 *   'validate-config',
 *   () => configValidator.validate(config)
 * );
 * ```
 * 
 * @template T - Return type of the operation
 * @since 1.0.0
 */
export function logExecutionTime<T>(
  logger: Logger,
  operation: string,
  fn: () => T | Promise<T>
): Promise<T> {
  return logExecutionTimeAsync(logger, operation, async () => fn());
}

/**
 * Log execution time for explicitly asynchronous operations
 * 
 * Specialized version for async operations with detailed timing and error tracking.
 * Provides comprehensive logging including operation start, completion/failure,
 * and total execution time for performance monitoring.
 * 
 * @param logger - Logger instance for recording timing and status information
 * @param operation - Human-readable operation name for log identification  
 * @param fn - Async operation function to execute and time
 * @returns Promise resolving to operation result or rejecting with original error
 * 
 * @example Timing Database Operations
 * ```typescript
 * const users = await logExecutionTimeAsync(
 *   logger,
 *   'database-query-users',
 *   async () => {
 *     return await db.user.findMany({ where: { active: true } });
 *   }
 * );
 * ```
 * 
 * @example Timing External API Calls
 * ```typescript
 * const response = await logExecutionTimeAsync(
 *   logger,
 *   'external-api-call',
 *   async () => {
 *     return await httpClient.post('/api/external', payload);
 *   }
 * );
 * ```
 * 
 * @template T - Return type of the async operation
 * @since 1.0.0
 */
export async function logExecutionTimeAsync<T>(
  logger: Logger,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  logger.debug({ operation }, 'Operation started');

  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    logger.info({
      operation,
      duration,
      success: true
    }, 'Operation completed');

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error({
      operation,
      duration,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, 'Operation failed');

    throw error;
  }
}