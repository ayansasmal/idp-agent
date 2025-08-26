export interface ServiceErrorContext {
  service: string;
  operation?: string;
  requestId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: any;
  code?: string;
}

export interface HttpErrorDetail {
  status: number;
  statusText?: string;
  method?: string;
  url?: string;
  requestId?: string;
}

export enum ErrorCode {
  // Generic
  UNKNOWN = 'UNKNOWN',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  
  // Validation
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  
  // HTTP/Network
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  
  // Service specific
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  DEPENDENCY_FAILED = 'DEPENDENCY_FAILED'
}