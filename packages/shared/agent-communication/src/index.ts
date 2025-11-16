/**
 * Standardized Agent Communication Library
 * 
 * Provides consistent WebSocket + JSON-RPC 2.0 communication patterns
 * for AI-IDP multi-agent systems.
 * 
 * @module @ai-idp/agent-communication
 * @version 1.0.0
 */

// Export main classes
export { AgentCommunicationClient } from './AgentCommunicationClient';
export {
  AgentCommunicationServer,
  type AgentImplementation,
  type ToolHandler,
  type EnhancedToolHandler,
  type DefaultsGenerator,
  type ConfirmationMessageGenerator,
  type PendingConfirmationResponse,
  type SuccessfulToolResponse,
  type ErrorToolResponse,
  type ToolCallResponse
} from './AgentCommunicationServer';

// Export configuration and types
export {
  AgentCommunicationConfig,
  DEFAULT_AGENT_COMMUNICATION_CONFIG
} from './AgentCommunicationClient';

// Re-export common types from other packages
export type {
  AgentCapabilities,
  ToolDefinition,
  ConversationContext,
  MCPRequest,
  MCPResponse
} from '@ai-idp/types';

/**
 * Utility function to create a standardized agent communication client
 * with default configuration and environment-based overrides.
 * 
 * @param overrides - Configuration overrides
 * @returns Configured AgentCommunicationClient
 * 
 * @example
 * ```typescript
 * const client = createAgentCommunicationClient({
 *   clientTimeout: 45000,
 *   maxRetries: 5
 * });
 * 
 * await client.connect('infrastructure', 'ws://localhost:3003/mcp');
 * ```
 */
export function createAgentCommunicationClient(
  overrides?: Partial<import('./AgentCommunicationClient').AgentCommunicationConfig>
) {
  const { AgentCommunicationClient, DEFAULT_AGENT_COMMUNICATION_CONFIG } = require('./AgentCommunicationClient');
  
  // Environment-based configuration
  const envConfig = {
    clientTimeout: parseInt(process.env.AGENT_CLIENT_TIMEOUT || '30000', 10),
    maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.AGENT_RETRY_DELAY || '1000', 10),
    heartbeatInterval: parseInt(process.env.AGENT_HEARTBEAT_INTERVAL || '30000', 10),
    healthCheckTimeout: parseInt(process.env.AGENT_HEALTH_CHECK_TIMEOUT || '90000', 10)
  };

  const config = { ...DEFAULT_AGENT_COMMUNICATION_CONFIG, ...envConfig, ...overrides };
  return new AgentCommunicationClient(config);
}

/**
 * Utility function to create a standardized agent communication server
 * with default configuration and environment-based overrides.
 * 
 * @param agentImplementation - Agent implementation with capabilities and tool handlers
 * @param overrides - Configuration overrides
 * @returns Configured AgentCommunicationServer
 * 
 * @example
 * ```typescript
 * class MyAgent implements AgentImplementation {
 *   // ... implementation
 * }
 * 
 * const agent = new MyAgent();
 * const server = createAgentCommunicationServer(agent, {
 *   heartbeatInterval: 60000
 * });
 * 
 * await server.start(3003);
 * ```
 */
export function createAgentCommunicationServer(
  agentImplementation: import('./AgentCommunicationServer').AgentImplementation,
  overrides?: Partial<import('./AgentCommunicationClient').AgentCommunicationConfig>
) {
  const { AgentCommunicationServer } = require('./AgentCommunicationServer');
  const { DEFAULT_AGENT_COMMUNICATION_CONFIG } = require('./AgentCommunicationClient');
  
  // Environment-based configuration
  const envConfig = {
    clientTimeout: parseInt(process.env.AGENT_CLIENT_TIMEOUT || '30000', 10),
    maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.AGENT_RETRY_DELAY || '1000', 10),
    heartbeatInterval: parseInt(process.env.AGENT_HEARTBEAT_INTERVAL || '30000', 10),
    healthCheckTimeout: parseInt(process.env.AGENT_HEALTH_CHECK_TIMEOUT || '90000', 10)
  };

  const config = { ...DEFAULT_AGENT_COMMUNICATION_CONFIG, ...envConfig, ...overrides };
  return new AgentCommunicationServer(agentImplementation, config);
}

/**
 * Helper function to create a context object for tool calls
 * 
 * @param options - Context creation options
 * @returns ConversationContext object
 */
export function createContext(options: {
  conversationId?: string;
  userId?: string;
  sessionId?: string;
  source?: string;
  metadata?: Record<string, any>;
}): import('@ai-idp/types').ConversationContext {
  const timestamp = Date.now();
  
  return {
    conversationId: options.conversationId || `ctx-${timestamp}`,
    userId: options.userId || 'agent-communication-user',
    sessionId: options.sessionId || `session-${timestamp}`,
    history: [],
    metadata: {
      source: options.source || 'agent-communication',
      createdAt: new Date().toISOString(),
      ...options.metadata
    }
  };
}