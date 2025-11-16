import { 
  type ServiceErrorContext, 
  type ValidationErrorDetail, 
  type HttpErrorDetail, 
  ErrorCode 
} from './types.js';

/**
 * Base service error class for structured error handling across AI-IDP services
 * 
 * Provides consistent error structure with contextual information, retry detection,
 * and JSON serialization for distributed logging and debugging. All service errors
 * inherit from this base class to ensure uniform error handling patterns.
 * 
 * **Features:**
 * - Structured error codes for programmatic error handling
 * - Service and operation context for debugging
 * - Automatic retry detection based on error type
 * - JSON serialization for logging and network transmission
 * - Stack trace preservation for debugging
 * 
 * @class ServiceError
 * @extends Error
 * @since 1.0.0
 * 
 * @example Basic Service Error
 * ```typescript
 * throw new ServiceError(
 *   'Database connection failed',
 *   ErrorCode.DEPENDENCY_FAILED,
 *   {
 *     service: 'user-service',
 *     operation: 'getUserById',
 *     requestId: 'req-123'
 *   },
 *   {
 *     cause: originalError,
 *     isRetryable: true
 *   }
 * );
 * ```
 * 
 * @example Error with Context
 * ```typescript
 * throw new ServiceError(
 *   'Kubernetes deployment failed',
 *   ErrorCode.EXTERNAL_SERVICE_ERROR,
 *   {
 *     service: 'infrastructure-agent',
 *     operation: 'deployApplication',
 *     metadata: {
 *       namespace: 'production',
 *       deploymentName: 'nginx-app',
 *       userId: 'user-456'
 *     }
 *   }
 * );
 * ```
 */
export class ServiceError extends Error {
  public readonly code: ErrorCode;
  public readonly context: ServiceErrorContext;
  public readonly timestamp: Date;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    context: ServiceErrorContext,
    options?: {
      cause?: Error;
      isRetryable?: boolean;
    }
  ) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.isRetryable = options?.isRetryable ?? false;

    if (options?.cause) {
      this.cause = options.cause;
    }

    Error.captureStackTrace(this, ServiceError);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      isRetryable: this.isRetryable,
      stack: this.stack
    };
  }
}

export class ValidationError extends ServiceError {
  public readonly details: ValidationErrorDetail[];

  constructor(
    message: string,
    details: ValidationErrorDetail[],
    context: ServiceErrorContext
  ) {
    super(message, ErrorCode.VALIDATION_FAILED, context);
    this.name = 'ValidationError';
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details
    };
  }
}

export class HttpError extends ServiceError {
  public readonly httpDetails: HttpErrorDetail;

  constructor(
    message: string,
    httpDetails: HttpErrorDetail,
    context: ServiceErrorContext,
    options?: {
      cause?: Error;
      isRetryable?: boolean;
    }
  ) {
    const code = getHttpErrorCode(httpDetails.status);
    const isRetryable = options?.isRetryable ?? isHttpRetryable(httpDetails.status);
    
    super(message, code, context, { ...options, isRetryable });
    this.name = 'HttpError';
    this.httpDetails = httpDetails;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      httpDetails: this.httpDetails
    };
  }
}

export class NetworkError extends ServiceError {
  constructor(
    message: string,
    context: ServiceErrorContext,
    cause?: Error
  ) {
    super(message, ErrorCode.NETWORK_ERROR, context, { 
      cause, 
      isRetryable: true 
    });
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends ServiceError {
  public readonly timeoutMs: number;

  constructor(
    message: string,
    timeoutMs: number,
    context: ServiceErrorContext
  ) {
    super(message, ErrorCode.TIMEOUT, context, { isRetryable: true });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      timeoutMs: this.timeoutMs
    };
  }
}

export class ConfigurationError extends ServiceError {
  public readonly configKey?: string;

  constructor(
    message: string,
    context: ServiceErrorContext,
    configKey?: string
  ) {
    super(message, ErrorCode.CONFIGURATION_ERROR, context);
    this.name = 'ConfigurationError';
    this.configKey = configKey;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      configKey: this.configKey
    };
  }
}

function getHttpErrorCode(status: number): ErrorCode {
  switch (status) {
    case 401: return ErrorCode.UNAUTHORIZED;
    case 403: return ErrorCode.FORBIDDEN;
    case 404: return ErrorCode.NOT_FOUND;
    case 408: return ErrorCode.TIMEOUT;
    case 429: return ErrorCode.RATE_LIMITED;
    case 503: return ErrorCode.SERVICE_UNAVAILABLE;
    default:
      if (status >= 400 && status < 500) return ErrorCode.VALIDATION_FAILED;
      if (status >= 500) return ErrorCode.INTERNAL_ERROR;
      return ErrorCode.UNKNOWN;
  }
}

function isHttpRetryable(status: number): boolean {
  return status === 408 || // Request Timeout
         status === 429 || // Too Many Requests
         (status >= 500 && status <= 599); // Server errors
}