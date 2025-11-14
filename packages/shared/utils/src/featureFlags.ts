/**
 * Feature Flag Configuration for AI-IDP Communication Architecture Migration
 * 
 * This module provides centralized feature flag management for the migration
 * from WebSocket to SSE + HTTP communication architecture.
 */

export enum MigrationPhase {
  CURRENT = 'current',      // WebSocket only (stable)
  TESTING = 'testing',      // SSE + HTTP testing (development)
  PRODUCTION = 'production' // SSE + HTTP production (new default)
}

export enum CommunicationMethod {
  WEBSOCKET = 'websocket',
  SSE_HTTP = 'sse-http'
}

/**
 * Feature flag configuration for communication architecture
 */
export interface CommunicationFeatureFlags {
  useWebSocket: boolean;
  enableSseHttp: boolean;
  migrationPhase: MigrationPhase;
  primaryMethod: CommunicationMethod;
  fallbackMethod?: CommunicationMethod;
}

/**
 * Load feature flags from environment variables
 */
export function loadCommunicationFeatureFlags(): CommunicationFeatureFlags {
  const useWebSocket = process.env.USE_WEBSOCKET === 'true';
  const enableSseHttp = process.env.ENABLE_SSE_HTTP === 'true';
  const migrationPhase = (process.env.MIGRATION_PHASE as MigrationPhase) || MigrationPhase.CURRENT;

  // Determine primary communication method based on flags
  let primaryMethod: CommunicationMethod;
  let fallbackMethod: CommunicationMethod | undefined;

  switch (migrationPhase) {
    case MigrationPhase.CURRENT:
      primaryMethod = CommunicationMethod.WEBSOCKET;
      break;
    case MigrationPhase.TESTING:
      primaryMethod = enableSseHttp ? CommunicationMethod.SSE_HTTP : CommunicationMethod.WEBSOCKET;
      fallbackMethod = enableSseHttp ? CommunicationMethod.WEBSOCKET : undefined;
      break;
    case MigrationPhase.PRODUCTION:
      primaryMethod = CommunicationMethod.SSE_HTTP;
      fallbackMethod = useWebSocket ? CommunicationMethod.WEBSOCKET : undefined;
      break;
    default:
      primaryMethod = CommunicationMethod.WEBSOCKET;
  }

  return {
    useWebSocket,
    enableSseHttp,
    migrationPhase,
    primaryMethod,
    fallbackMethod
  };
}

/**
 * Check if WebSocket communication should be used
 */
export function shouldUseWebSocket(): boolean {
  const flags = loadCommunicationFeatureFlags();
  return flags.primaryMethod === CommunicationMethod.WEBSOCKET;
}

/**
 * Check if SSE + HTTP communication should be used
 */
export function shouldUseSseHttp(): boolean {
  const flags = loadCommunicationFeatureFlags();
  return flags.primaryMethod === CommunicationMethod.SSE_HTTP;
}

/**
 * Check if we're in migration phase (both methods enabled)
 */
export function isInMigrationPhase(): boolean {
  const flags = loadCommunicationFeatureFlags();
  return flags.migrationPhase === MigrationPhase.TESTING &&
    flags.useWebSocket && flags.enableSseHttp;
}

/**
 * Get fallback communication method if primary fails
 */
export function getFallbackMethod(): CommunicationMethod | undefined {
  const flags = loadCommunicationFeatureFlags();
  return flags.fallbackMethod;
}

/**
 * Migration phase transition helpers
 */
export const MigrationHelpers = {
  /**
   * Get environment variables for specific migration phase
   */
  getEnvForPhase(phase: MigrationPhase): Record<string, string> {
    switch (phase) {
      case MigrationPhase.CURRENT:
        return {
          USE_WEBSOCKET: 'true',
          ENABLE_SSE_HTTP: 'false',
          MIGRATION_PHASE: 'current'
        };
      case MigrationPhase.TESTING:
        return {
          USE_WEBSOCKET: 'true',
          ENABLE_SSE_HTTP: 'true',
          MIGRATION_PHASE: 'testing'
        };
      case MigrationPhase.PRODUCTION:
        return {
          USE_WEBSOCKET: 'false',
          ENABLE_SSE_HTTP: 'true',
          MIGRATION_PHASE: 'production'
        };
    }
  },

  /**
   * Get rollback configuration (always returns to CURRENT phase)
   */
  getRollbackEnv(): Record<string, string> {
    return this.getEnvForPhase(MigrationPhase.CURRENT);
  }
};