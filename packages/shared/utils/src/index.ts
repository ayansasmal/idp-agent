/**
 * @ai-idp/utils - Comprehensive utility library for AI-IDP multi-agent platform
 * 
 * This library provides consistent, production-ready utilities across all agents
 * and services in the AI-IDP ecosystem. It eliminates code duplication and
 * ensures standardized behavior for common operations.
 * 
 * **Key Features:**
 * - **HTTP Client Factory**: Pre-configured axios with interceptors, retry logic, and request tracking
 * - **Logging Utilities**: Consistent Pino configuration with service context and performance tracking  
 * - **Error Handling**: Structured error classes with proper classification and retry detection
 * - **Validation Helpers**: Zod integration with common schemas and environment variable handling
 * - **Retry Logic**: Configurable strategies with exponential backoff, jitter, and predicate functions
 * - **Configuration Management**: Type-safe environment variable loading with schema validation
 * 
 * @package @ai-idp/utils
 * @version 1.0.0
 * @since 1.0.0
 * 
 * @example Basic Usage
 * ```typescript
 * import { 
 *   createHttpClient, 
 *   createLogger, 
 *   withRetry, 
 *   ServiceError,
 *   validateData 
 * } from '@ai-idp/utils';
 * 
 * // Create pre-configured HTTP client
 * const httpClient = createHttpClient({
 *   timeout: 30000,
 *   maxRetries: 3
 * });
 * 
 * // Create structured logger  
 * const logger = createLogger({
 *   service: 'my-agent',
 *   level: 'info'
 * });
 * 
 * // Use retry logic
 * const result = await withRetry(
 *   () => httpClient.get('/api/data'),
 *   { maxAttempts: 3, baseDelayMs: 1000 }
 * );
 * ```
 * 
 * @example Error Handling
 * ```typescript
 * import { ServiceError, ErrorCode } from '@ai-idp/utils';
 * 
 * try {
 *   // Some operation
 * } catch (error) {
 *   throw new ServiceError(
 *     'Operation failed',
 *     ErrorCode.DEPENDENCY_FAILED,
 *     { service: 'my-agent', operation: 'doSomething' },
 *     { cause: error as Error }
 *   );
 * }
 * ```
 */

/**
 * HTTP utilities for creating pre-configured axios clients with retry logic,
 * request tracking, and consistent error handling across all AI-IDP services.
 * 
 * @example
 * ```typescript
 * const client = createHttpClient({ timeout: 30000, maxRetries: 3 });
 * const response = await client.get('/api/status');
 * ```
 */
export { createHttpClient, withRetry as withHttpRetry, type HttpClientConfig, type HttpResponse } from './http/index.js';

/**
 * Logging utilities providing consistent Pino logger configuration with
 * service context, performance tracking, and structured logging.
 * 
 * @example
 * ```typescript
 * const logger = createLogger({ service: 'meta-agent', level: 'info' });
 * logger.info({ requestId: '123' }, 'Processing request');
 * ```
 */
export * from './logging/index.js';

/**
 * Error handling utilities with structured error classes, proper classification,
 * and retry detection for consistent error management across all services.
 * 
 * @example
 * ```typescript
 * throw new ServiceError('Operation failed', ErrorCode.DEPENDENCY_FAILED, {
 *   service: 'infrastructure-agent',
 *   operation: 'deployApplication'
 * });
 * ```
 */
export * from './errors/index.js';

/**
 * Validation utilities with Zod integration, common schemas, and
 * environment variable handling for type-safe configuration.
 * 
 * @example
 * ```typescript
 * const config = validateData(rawConfig, configSchemas.agent);
 * const envVars = loadEnvironmentVariables(envSchema);
 * ```
 */
export * from './validation/index.js';

/**
 * Retry utilities with configurable strategies, exponential backoff, jitter,
 * and predicate functions for intelligent retry logic across all operations.
 * 
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => someOperation(),
 *   { config: { maxAttempts: 3, baseDelayMs: 1000 } }
 * );
 * ```
 */
export { withRetry, retryPredicates, type RetryConfig, type RetryContext } from './retry/index.js';

/**
 * Configuration utilities for type-safe environment variable loading,
 * schema validation, and configuration management across all services.
 * 
 * @example
 * ```typescript
 * const config = loadConfig(configSchema, 'infrastructure-agent');
 * const dbUrl = getRequiredEnvVar('DATABASE_URL');
 * ```
 */
export * from './config/index.js';

/**
 * Feature flag utilities for communication architecture migration management.
 * Provides centralized control over WebSocket to SSE+HTTP migration phases.
 * 
 * @example
 * ```typescript
 * import { shouldUseSseHttp, loadCommunicationFeatureFlags } from '@ai-idp/utils';
 * 
 * if (shouldUseSseHttp()) {
 *   // Use new SSE + HTTP communication
 * } else {
 *   // Use current WebSocket communication  
 * }
 * ```
 */
export * from './featureFlags.js';

/**
 * Monitoring and metrics utilities for tracking communication architecture
 * performance during the WebSocket to SSE+HTTP migration.
 * 
 * @example
 * ```typescript
 * import { globalMetricsCollector, createMetricsLogger } from '@ai-idp/utils';
 * 
 * const collector = globalMetricsCollector.getWebSocketCollector();
 * collector.recordConnection(latency);
 * ```
 */
export * from './monitoring.js';