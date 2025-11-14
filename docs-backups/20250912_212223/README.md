# @ai-idp/utils

Comprehensive shared utility library for the AI-IDP multi-agent system. This library eliminates code duplication across agents while ensuring consistent behavior for HTTP communication, logging, error handling, validation, retry logic, and configuration management.

## 🎯 Purpose

The `@ai-idp/utils` library provides battle-tested utilities that all AI-IDP agents and services can use to:

- **Maintain Consistency**: Identical HTTP, logging, and error patterns across all services
- **Reduce Duplication**: Write common patterns once, use everywhere
- **Improve Maintainability**: Update core logic in one place, affects entire system
- **Enhance Observability**: Structured logging, request tracking, and performance metrics
- **Ensure Type Safety**: Full TypeScript support with schema-based validation

## 📦 Installation

```bash
npm install @ai-idp/utils
```

## 🏗️ Architecture

The library is organized into 6 core modules:

```
src/
├── http/          # HTTP client factory with axios, interceptors, retry
├── logging/       # Consistent Pino logging with context and performance
├── errors/        # Structured error classes with proper classification
├── validation/    # Zod integration with common schemas
├── retry/         # Configurable retry strategies with backoff
└── config/        # Type-safe configuration loading from environment
```

## 🚀 Quick Start

```typescript
import {
  createHttpClient,
  createLogger,
  withRetry,
  validateData,
  ServiceError,
  ErrorCode,
  configSchemas
} from '@ai-idp/utils';

// Create logger with consistent configuration
const logger = createLogger({
  service: 'my-agent',
  level: 'info',
  environment: 'development'
});

// Create HTTP client with pre-configured axios
const httpClient = createHttpClient({
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  userAgent: 'MyAgent/1.0.0'
}, logger);

// Make HTTP requests with automatic retry and logging
const response = await withRetry(
  () => httpClient.get('/api/health'),
  {
    config: { maxAttempts: 3, baseDelayMs: 1000 },
    logger,
    operationName: 'healthCheck'
  }
);

// Validate configuration with type safety
const config = validateData(
  process.env,
  configSchemas.httpClient,
  { service: 'my-agent', operation: 'config-validation' }
);
```

## 📚 Module Documentation

### 🌐 HTTP Module

Pre-configured axios client with interceptors, retry logic, and comprehensive logging.

#### Features
- **Request/Response Interceptors**: Automatic logging with request IDs and timing
- **Retry Logic**: Exponential backoff for network errors and retryable HTTP status codes
- **Header Sanitization**: Removes sensitive auth tokens from logs
- **Request Tracking**: Unique request IDs for correlation across logs

#### Usage

```typescript
import { createHttpClient, type HttpClientConfig } from '@ai-idp/utils';

const config: HttpClientConfig = {
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  baseURL: 'https://api.example.com',
  headers: { 'X-API-Version': 'v1' },
  userAgent: 'MyService/1.0.0'
};

const httpClient = createHttpClient(config, logger);

// All requests automatically include logging, retry, and error handling
const response = await httpClient.get('/users/123');
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | number | 30000 | Request timeout in milliseconds |
| `maxRetries` | number | 3 | Maximum retry attempts |
| `retryDelay` | number | 1000 | Base retry delay in milliseconds |
| `baseURL` | string | '' | Base URL for all requests |
| `headers` | object | {} | Default headers for all requests |
| `userAgent` | string | 'AI-IDP/1.0.0' | User-Agent header |

### 📝 Logging Module

Consistent Pino logging configuration with service context, performance tracking, and environment-specific formatting.

#### Features
- **Structured Logging**: JSON format with consistent fields
- **Service Context**: Service name, version, environment in every log
- **Performance Tracking**: Execution time logging for operations
- **Security**: Automatic redaction of sensitive fields
- **Environment-Aware**: Pretty printing in development, JSON in production

#### Usage

```typescript
import { 
  createLogger, 
  createChildLogger, 
  withRequestId,
  logExecutionTime,
  type ServiceLoggerConfig 
} from '@ai-idp/utils';

const logger = createLogger({
  service: 'my-agent',
  level: 'info',
  environment: 'development',
  redact: ['password', 'apiKey']
});

// Create child loggers with additional context
const requestLogger = withRequestId(logger, 'req_123');
const userLogger = createChildLogger(logger, { userId: 'user_456' });

// Log operation execution time
const result = await logExecutionTime(
  logger,
  'databaseQuery',
  () => database.findUser('123')
);
```

#### Logger Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `service` | string | **required** | Service name for log context |
| `level` | string | 'info' | Log level (trace, debug, info, warn, error, fatal) |
| `environment` | string | 'development' | Environment (development, staging, production) |
| `redact` | string[] | Common secrets | Fields to redact from logs |

### 🚨 Error Module

Structured error classes with proper classification, retry detection, and rich context.

#### Features
- **Error Hierarchy**: ServiceError, ValidationError, HttpError, NetworkError, etc.
- **Error Codes**: Standardized classification system
- **Retry Detection**: Automatic identification of retryable vs non-retryable errors
- **Rich Context**: Service, operation, and metadata tracking
- **JSON Serialization**: Proper serialization for logging and API responses

#### Usage

```typescript
import { 
  ServiceError, 
  ValidationError, 
  HttpError,
  ErrorCode,
  type ServiceErrorContext 
} from '@ai-idp/utils';

const context: ServiceErrorContext = {
  service: 'my-agent',
  operation: 'processRequest',
  requestId: 'req_123'
};

// Create structured errors
throw new ServiceError(
  'Operation failed',
  ErrorCode.DEPENDENCY_FAILED,
  context,
  { cause: originalError, isRetryable: true }
);

// Validation errors with detailed field information
throw new ValidationError(
  'Invalid input data',
  [
    { field: 'email', message: 'Must be valid email', value: 'invalid' },
    { field: 'age', message: 'Must be positive number', value: -5 }
  ],
  context
);

// HTTP errors with status information
throw new HttpError(
  'API request failed',
  { status: 503, statusText: 'Service Unavailable', method: 'GET', url: '/api/data' },
  context
);
```

#### Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `UNKNOWN` | Unknown error | No |
| `INTERNAL_ERROR` | Internal system error | No |
| `VALIDATION_FAILED` | Input validation failed | No |
| `NETWORK_ERROR` | Network connectivity error | Yes |
| `TIMEOUT` | Request timeout | Yes |
| `RATE_LIMITED` | Rate limit exceeded | Yes |
| `SERVICE_UNAVAILABLE` | Service unavailable | Yes |

### ✅ Validation Module

Zod integration with common schemas, environment variable handling, and detailed error formatting.

#### Features
- **Type-Safe Validation**: Zod schema integration with TypeScript types
- **Common Schemas**: Pre-built schemas for emails, URLs, ports, etc.
- **Environment Variables**: Helpers for loading and validating env vars
- **Detailed Errors**: Clear validation error messages with field-level details
- **Configuration Loading**: Schema-based config validation

#### Usage

```typescript
import { 
  validateData,
  validateDataSafe,
  commonSchemas,
  getRequiredEnv,
  getOptionalEnv,
  type ValidationErrorDetail
} from '@ai-idp/utils';
import { z } from 'zod';

// Define schema
const userSchema = z.object({
  email: commonSchemas.email,
  age: z.number().positive(),
  role: z.enum(['admin', 'user'])
});

// Validate data (throws ValidationError on failure)
const validUser = validateData(
  userData,
  userSchema,
  { service: 'user-service', operation: 'createUser' }
);

// Safe validation (returns result object)
const result = validateDataSafe(userData, userSchema);
if (result.success) {
  console.log('Valid data:', result.data);
} else {
  console.log('Validation errors:', result.errors);
}

// Environment variable validation
const apiKey = getRequiredEnv('API_KEY', context);
const port = getNumberEnv('PORT', 3000, context);
const debug = getBooleanEnv('DEBUG', false);
```

#### Common Schemas

| Schema | Description | Validation |
|--------|-------------|------------|
| `email` | Email address | RFC 5322 compliant |
| `url` | URL | Valid HTTP/HTTPS URL |
| `uuid` | UUID | Valid UUID v4 |
| `port` | Port number | 1-65535 |
| `nonEmptyString` | Non-empty string | Min length 1 |
| `resourceName` | Kubernetes resource | Lowercase alphanumeric with hyphens |
| `environment` | Environment | development, staging, production |

### 🔄 Retry Module

Configurable retry strategies with exponential backoff, jitter, and predicate functions.

#### Features
- **Exponential Backoff**: Configurable base delay and multiplier
- **Jitter**: Random variation to prevent thundering herd
- **Max Delay Cap**: Prevents excessive wait times
- **Retry Predicates**: Custom functions to determine if errors are retryable
- **Operation Logging**: Detailed retry attempt tracking

#### Usage

```typescript
import { 
  withRetry,
  retryPredicates,
  type RetryConfig,
  type RetryPredicate 
} from '@ai-idp/utils';

// Basic retry with default configuration
const result = await withRetry(
  () => unstableOperation(),
  {
    logger,
    operationName: 'unstableOperation'
  }
);

// Custom retry configuration
const customConfig: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  exponentialBase: 2,
  jitter: true
};

const result = await withRetry(
  () => apiCall(),
  {
    config: customConfig,
    shouldRetry: retryPredicates.httpRetryable,
    logger,
    operationName: 'apiCall'
  }
);

// Custom retry predicate
const customPredicate: RetryPredicate = (error, context) => {
  return error.message.includes('temporary') && context.attempt < 3;
};
```

#### Retry Predicates

| Predicate | Description |
|-----------|-------------|
| `networkOnly` | Only network errors (ECONNREFUSED, ETIMEDOUT, etc.) |
| `httpServerErrors` | Only HTTP 5xx errors |
| `httpRetryable` | HTTP 408, 429, 5xx errors |
| `never` | Never retry |
| `always` | Always retry (use with caution) |

### ⚙️ Configuration Module

Type-safe environment variable loading with schema validation and common configuration patterns.

#### Features
- **Schema-Based Loading**: Validate entire configuration objects
- **Type Safety**: Full TypeScript support with inferred types
- **Environment Prefixes**: Namespace variables by service
- **Default Values**: Flexible fallback handling
- **Common Schemas**: Pre-built schemas for databases, HTTP clients, etc.

#### Usage

```typescript
import { 
  loadConfig,
  getConfigValue,
  configSchemas,
  type ConfigOptions 
} from '@ai-idp/utils';
import { z } from 'zod';

// Load entire configuration
const appConfigSchema = z.object({
  port: z.number().default(3000),
  apiKey: z.string(),
  database: configSchemas.database,
  httpClient: configSchemas.httpClient
});

const config = loadConfig(
  appConfigSchema,
  { service: 'my-app', operation: 'load-config' },
  { prefix: 'APP', required: true }
);

// Load individual values
const logLevel = getConfigValue(
  'LOG_LEVEL',
  configSchemas.logLevel,
  { service: 'my-app', operation: 'config' },
  { defaultValue: 'info' }
);
```

#### Pre-built Configuration Schemas

| Schema | Environment Variables | Description |
|--------|----------------------|-------------|
| `httpClient` | TIMEOUT, MAX_RETRIES, etc. | HTTP client configuration |
| `logging` | LOG_LEVEL, LOG_SERVICE, etc. | Logging configuration |
| `database` | DB_HOST, DB_PORT, etc. | Database connection |
| `mcp` | MCP_SERVER_PORT, etc. | MCP client configuration |

## 🧪 Testing

The utils library includes comprehensive TypeScript type checking:

```bash
# Type checking
npm run type-check

# Build
npm run build

# Development watch mode
npm run dev
```

## 🔧 Integration Examples

### Creating a New Agent

```typescript
import {
  createLogger,
  createHttpClient,
  withRetry,
  ServiceError,
  ErrorCode,
  configSchemas,
  validateData
} from '@ai-idp/utils';

class MyAgent {
  private logger;
  private httpClient;
  private config;

  constructor(config: any) {
    // Validate configuration
    this.config = validateData(
      config,
      configSchemas.httpClient,
      { service: 'my-agent', operation: 'constructor' }
    );

    // Create logger
    this.logger = createLogger({
      service: 'my-agent',
      level: 'info',
      environment: process.env.NODE_ENV as any || 'development'
    });

    // Create HTTP client
    this.httpClient = createHttpClient({
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      userAgent: 'MyAgent/1.0.0'
    }, this.logger);
  }

  async performOperation(data: any) {
    try {
      return await withRetry(
        () => this.httpClient.post('/api/operation', data),
        {
          config: { maxAttempts: 3 },
          logger: this.logger,
          operationName: 'performOperation'
        }
      );
    } catch (error) {
      throw new ServiceError(
        'Operation failed',
        ErrorCode.DEPENDENCY_FAILED,
        { service: 'my-agent', operation: 'performOperation' },
        { cause: error as Error }
      );
    }
  }
}
```

### Migrating Existing Code

Before (with manual axios setup):
```typescript
import axios from 'axios';
import pino from 'pino';

const logger = pino({ level: 'info' });
const client = axios.create({ timeout: 30000 });

// Manual retry logic, error handling, logging...
```

After (with utils library):
```typescript
import { createLogger, createHttpClient } from '@ai-idp/utils';

const logger = createLogger({ service: 'my-service' });
const client = createHttpClient({ timeout: 30000 }, logger);

// Automatic retry, error handling, logging included
```

## 📈 Benefits

### For Development
- **Faster Development**: No need to implement HTTP clients, logging, error handling
- **Consistent Patterns**: All agents follow the same architectural patterns
- **Type Safety**: Full TypeScript support prevents runtime errors
- **Testing**: Mock utilities once, works across all tests

### For Operations
- **Observability**: Consistent logging formats and request tracking
- **Debugging**: Structured errors with proper context and correlation IDs
- **Performance**: Built-in performance monitoring and timing
- **Reliability**: Battle-tested retry logic and error handling

### for Maintenance
- **Single Source of Truth**: Update behavior once, affects all agents
- **Backwards Compatibility**: Semantic versioning and careful API design
- **Documentation**: Comprehensive examples and usage patterns
- **Testing**: Utilities are thoroughly tested and validated

## 🗂️ Version History

- **v1.0.0**: Initial release with HTTP, logging, errors, validation, retry, and config modules
- Full TypeScript support
- Comprehensive documentation
- Production-ready implementation

## 🤝 Contributing

This library is part of the AI-IDP project. When adding new utilities:

1. **Follow TypeScript Best Practices**: Strict typing, proper exports
2. **Add Comprehensive Tests**: Unit tests for all functionality
3. **Document Thoroughly**: JSDoc comments and README updates
4. **Maintain Backwards Compatibility**: Semantic versioning
5. **Consider Performance**: Utilities should be fast and memory-efficient

The `@ai-idp/utils` library is the foundation for all AI-IDP agents and services, ensuring consistency, maintainability, and developer productivity across the entire multi-agent ecosystem.