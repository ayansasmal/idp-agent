import pino from 'pino';
import { config } from '../config/ConfigManager';

/**
 * Structured logger using Pino for high-performance logging
 * Provides consistent logging across all modules with correlation IDs
 */
export class Logger {
  private logger: pino.Logger;
  private context: Record<string, any>;

  constructor(context: string | Record<string, any> = {}) {
    const baseConfig = {
      level: config.getAppConfig().logLevel,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label: string) => ({ level: label }),
      },
    };

    // Development: pretty print, Production: JSON
    const loggerConfig = config.isDevelopment()
      ? {
          ...baseConfig,
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : baseConfig;

    this.logger = pino(loggerConfig);
    
    // Set context - either string (component name) or object
    this.context = typeof context === 'string' 
      ? { component: context }
      : context;
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext: Record<string, any>): Logger {
    const childLogger = new Logger({
      ...this.context,
      ...additionalContext,
    });
    childLogger.logger = this.logger.child(additionalContext);
    return childLogger;
  }

  /**
   * Log debug message
   */
  debug(message: string, meta: Record<string, any> = {}) {
    this.logger.debug({ ...this.context, ...meta }, message);
  }

  /**
   * Log info message
   */
  info(message: string, meta: Record<string, any> = {}) {
    this.logger.info({ ...this.context, ...meta }, message);
  }

  /**
   * Log warning message
   */
  warn(message: string, meta: Record<string, any> = {}) {
    this.logger.warn({ ...this.context, ...meta }, message);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, meta: Record<string, any> = {}) {
    const errorMeta = error instanceof Error 
      ? { 
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        }
      : error ? { error } : {};

    this.logger.error({ ...this.context, ...errorMeta, ...meta }, message);
  }

  /**
   * Log fatal error (will exit process)
   */
  fatal(message: string, error?: Error | unknown, meta: Record<string, any> = {}) {
    const errorMeta = error instanceof Error 
      ? { 
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        }
      : error ? { error } : {};

    this.logger.fatal({ ...this.context, ...errorMeta, ...meta }, message);
  }

  /**
   * Start timing an operation
   */
  startTimer(operation: string) {
    const start = Date.now();
    
    return {
      end: (meta: Record<string, any> = {}) => {
        const duration = Date.now() - start;
        this.info(`Operation completed: ${operation}`, {
          operation,
          duration: `${duration}ms`,
          ...meta,
        });
      },
    };
  }

  /**
   * Log request/response for API calls
   */
  logRequest(method: string, url: string, meta: Record<string, any> = {}) {
    this.info(`${method} ${url}`, {
      type: 'request',
      method,
      url,
      ...meta,
    });
  }

  /**
   * Log response for API calls
   */
  logResponse(
    method: string, 
    url: string, 
    statusCode: number, 
    duration: number,
    meta: Record<string, any> = {}
  ) {
    const level = statusCode >= 400 ? 'warn' : 'info';
    this[level](`${method} ${url} ${statusCode}`, {
      type: 'response',
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      ...meta,
    });
  }

  /**
   * Log module operation
   */
  logModuleOperation(
    module: string,
    operation: string,
    success: boolean,
    duration?: number,
    meta: Record<string, any> = {}
  ) {
    const level = success ? 'info' : 'error';
    const status = success ? 'completed' : 'failed';
    
    this[level](`Module operation ${status}: ${module}.${operation}`, {
      type: 'module_operation',
      module,
      operation,
      success,
      duration: duration ? `${duration}ms` : undefined,
      ...meta,
    });
  }

  /**
   * Log AI interaction
   */
  logAIInteraction(
    provider: string,
    operation: string,
    success: boolean,
    tokens?: { input: number; output: number },
    meta: Record<string, any> = {}
  ) {
    const level = success ? 'info' : 'error';
    
    this[level](`AI ${operation} with ${provider}`, {
      type: 'ai_interaction',
      provider,
      operation,
      success,
      tokens,
      ...meta,
    });
  }

  /**
   * Log security event
   */
  logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    meta: Record<string, any> = {}
  ) {
    const level = severity === 'critical' ? 'error' : 
                 severity === 'high' ? 'warn' : 'info';
    
    this[level](`Security event: ${event}`, {
      type: 'security_event',
      event,
      severity,
      ...meta,
    });
  }

  /**
   * Log audit event
   */
  logAuditEvent(
    action: string,
    userId: string,
    resource: string,
    success: boolean,
    meta: Record<string, any> = {}
  ) {
    this.info(`Audit: ${userId} ${action} ${resource}`, {
      type: 'audit_event',
      action,
      userId,
      resource,
      success,
      timestamp: new Date().toISOString(),
      ...meta,
    });
  }

  /**
   * Get the underlying Pino logger (for advanced use cases)
   */
  getPinoLogger(): pino.Logger {
    return this.logger;
  }
}

// ============================================================================
// Request Correlation Logger
// ============================================================================

/**
 * Logger with request correlation for tracing requests across modules
 */
export class CorrelationLogger extends Logger {
  constructor(
    correlationId: string,
    context: string | Record<string, any> = {}
  ) {
    const fullContext = typeof context === 'string'
      ? { component: context, correlationId }
      : { ...context, correlationId };
    
    super(fullContext);
  }

  /**
   * Create correlation logger from request
   */
  static fromRequest(
    requestId: string,
    userId: string,
    context: string | Record<string, any> = {}
  ): CorrelationLogger {
    const fullContext = typeof context === 'string'
      ? { component: context, requestId, userId }
      : { ...context, requestId, userId };
    
    return new CorrelationLogger(requestId, fullContext);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string): Logger {
  return new Logger(component);
}

/**
 * Create a logger with custom context
 */
export function createContextLogger(context: Record<string, any>): Logger {
  return new Logger(context);
}

// Export default logger instance
export const defaultLogger = new Logger('app');