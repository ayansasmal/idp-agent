/**
 * AI-IDP Core Package
 * Main entry point for the modular AI-powered platform agent
 */

// ============================================================================
// Main Agent Exports
// ============================================================================
export { PrimaryAgent } from './agent/PrimaryAgent';

// ============================================================================
// AI Core Exports
// ============================================================================
export { AICore } from './ai/AICore';
export { AnthropicProvider } from './ai/providers/AnthropicProvider';

// ============================================================================
// Module System Exports
// ============================================================================
export { BaseModule } from './modules/base/BaseModule';
export { ModuleCommunicationLayer, moduleRegistry } from './modules/base/ModuleCommunication';

// ============================================================================
// Shared Utilities Exports
// ============================================================================
export { config, ConfigManager } from './shared/config/ConfigManager';
export { 
  Logger, 
  CorrelationLogger, 
  createLogger, 
  createContextLogger,
  defaultLogger 
} from './shared/logger/Logger';

// ============================================================================
// Type Exports
// ============================================================================
export type {
  RequestContext,
  ModuleRequest,
  ModuleResponse,
  ValidationResult,
  PlatformAction,
  IntentAnalysis,
  AgentResponse,
  HealthStatus,
  ModuleConfig,
} from './types';

// ============================================================================
// Schema Exports (for validation)
// ============================================================================
export {
  RequestContextSchema,
  ModuleRequestSchema,
  ModuleResponseSchema,
  ValidationResultSchema,
  PlatformActionSchema,
  IntentAnalysisSchema,
  AgentResponseSchema,
  HealthStatusSchema,
} from './types';

// ============================================================================
// Error Exports
// ============================================================================
export { ModuleError, ValidationError, AIError } from './types';

// ============================================================================
// Quick Start Function
// ============================================================================

import { PrimaryAgent } from './agent/PrimaryAgent';
import { config } from './shared/config/ConfigManager';
import { defaultLogger } from './shared/logger/Logger';

/**
 * Quick start function to initialize the AI agent
 * For development and testing purposes
 */
export async function createAgent(): Promise<PrimaryAgent> {
  const logger = defaultLogger.child({ component: 'AgentFactory' });
  
  try {
    logger.info('Creating new Primary Agent instance');
    
    const agent = new PrimaryAgent();
    await agent.initialize();
    
    logger.info('Primary Agent created and initialized successfully');
    return agent;
    
  } catch (error) {
    logger.error('Failed to create Primary Agent', error);
    throw error;
  }
}

/**
 * Development helper - create agent with test context
 */
export async function createTestAgent(userId: string = 'test-user'): Promise<{
  agent: PrimaryAgent;
  createContext: (overrides?: Partial<RequestContext>) => RequestContext;
}> {
  const agent = await createAgent();
  
  const createContext = (overrides: Partial<RequestContext> = {}) => ({
    userId,
    sessionId: `session-${Date.now()}`,
    originalRequest: '',
    environment: 'development' as const,
    permissions: ['read', 'write', 'deploy'],
    auditTrail: [],
    timestamp: new Date().toISOString(),
    ...overrides,
  });
  
  return { agent, createContext };
}

// ============================================================================
// Environment Check
// ============================================================================

/**
 * Validate environment for agent operation
 */
export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 20) {
    errors.push(`Node.js 20+ required, found ${nodeVersion}`);
  }
  
  // Check required environment variables
  if (!process.env.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY environment variable is required');
  }
  
  // Validate configuration
  try {
    const configValidation = config.validate();
    if (!configValidation.valid) {
      errors.push(...configValidation.errors);
    }
  } catch (error) {
    errors.push(`Configuration error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Version Information
// ============================================================================

export const VERSION = '1.0.0';
export const BUILD_DATE = new Date().toISOString();

// ============================================================================
// Default Export
// ============================================================================

export default {
  PrimaryAgent,
  createAgent,
  createTestAgent,
  validateEnvironment,
  config,
  defaultLogger,
  VERSION,
  BUILD_DATE,
};