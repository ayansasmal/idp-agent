import pino, { type Logger, type LoggerOptions } from 'pino';
import type { ServiceLoggerConfig, LogContext } from './types.js';

const DEFAULT_CONFIG: Required<Omit<ServiceLoggerConfig, 'service'>> = {
  level: 'info',
  environment: 'development',
  redact: ['password', 'token', 'key', 'secret', 'authorization', 'cookie'],
  formatters: {}
};

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

export function createChildLogger(parentLogger: Logger, context: Partial<LogContext>): Logger {
  return parentLogger.child(context);
}

export function withRequestId(logger: Logger, requestId: string): Logger {
  return logger.child({ requestId });
}

export function withUserId(logger: Logger, userId: string): Logger {
  return logger.child({ userId });
}

export function withTrace(logger: Logger, traceId: string, spanId?: string): Logger {
  const context: any = { traceId };
  if (spanId) context.spanId = spanId;
  return logger.child(context);
}

// Performance logging utilities
export function logExecutionTime<T>(
  logger: Logger,
  operation: string,
  fn: () => T | Promise<T>
): Promise<T> {
  return logExecutionTimeAsync(logger, operation, async () => fn());
}

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