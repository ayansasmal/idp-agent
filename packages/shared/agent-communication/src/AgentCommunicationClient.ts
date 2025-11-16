/**
 * Agent Communication Client - Migrated from WebSocket to HTTP Transport
 * Using MCP SDK StreamableHTTPClientTransport for reliable agent communication
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  createLogger,
  withRetry,
  ServiceError,
  ErrorCode,
  type ServiceLoggerConfig,
  type Logger
} from '@ai-idp/utils';
import type {
  AgentCapabilities,
  ToolDefinition,
  ConversationContext
} from '@ai-idp/types';

/**
 * Configuration for Agent Communication Client
 */
export interface AgentCommunicationConfig {
  /** Client timeout in milliseconds */
  clientTimeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Retry delay in milliseconds */
  retryDelay: number;
  /** Health check interval in milliseconds */
  healthCheckInterval?: number;
  /** Connection health check timeout */
  healthCheckTimeout?: number;
  /** Heartbeat interval for WebSocket connections */
  heartbeatInterval?: number;
}

/**
 * Default configuration for agent communication
 */
export const DEFAULT_AGENT_COMMUNICATION_CONFIG: AgentCommunicationConfig = {
  clientTimeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  healthCheckInterval: 60000,
  healthCheckTimeout: 90000,
  heartbeatInterval: 30000
};

/**
 * Registry entry for connected agents
 */
interface AgentRegistryEntry {
  capabilities: AgentCapabilities;
  client: Client;
  transport: StreamableHTTPClientTransport;
  lastHealthCheck: Date;
  healthy: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  failureCount: number;
  lastError?: Error;
  retryTimeout?: NodeJS.Timeout;
  healthCheckInterval?: NodeJS.Timeout;
  url: string;
}

/**
 * Agent Communication Client using HTTP Transport
 * Provides reliable communication with agents via MCP over HTTP
 * 
 * Migrated from WebSocket to HTTP transport for better reliability and compatibility
 * 
 * @class AgentCommunicationClient
 * @since 2.0.0 (HTTP Transport)
 * 
 * @example Basic Usage
 * ```typescript
 * const client = new AgentCommunicationClient(config);
 * 
 * // Register and connect to an agent
 * await client.connect('infrastructure', 'http://localhost:3003/mcp');
 * 
 * // Call a tool on the agent
 * const result = await client.callTool(
 *   'infrastructure',
 *   'deployApplication',
 *   { containerImage: 'nginx:latest' },
 *   context
 * );
 * 
 * // Cleanup
 * await client.disconnect('infrastructure');
 * ```
 */
export class AgentCommunicationClient {
  private agentRegistry: Map<string, AgentRegistryEntry> = new Map();
  private config: AgentCommunicationConfig;
  private logger: Logger;

  constructor(
    config: Partial<AgentCommunicationConfig> = {},
    loggerConfig?: Partial<ServiceLoggerConfig>
  ) {
    this.config = { ...DEFAULT_AGENT_COMMUNICATION_CONFIG, ...config };
    this.logger = createLogger({
      service: 'agent-communication-client',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development',
      ...loggerConfig
    });

    this.logger.info({ config: this.config }, 'Agent Communication Client initialized with HTTP transport');
  }

  /**
   * Connect to an agent using HTTP transport
   */
  async connect(agentId: string, httpUrl: string): Promise<void> {
    try {
      this.logger.info({ agentId, httpUrl }, 'Connecting to agent via HTTP transport');

      // Initialize registry entry
      const registryEntry: AgentRegistryEntry = {
        capabilities: null as any, // Will be fetched after connection
        client: null as any,
        transport: null as any,
        lastHealthCheck: new Date(),
        healthy: false,
        connectionState: 'connecting',
        failureCount: 0,
        url: httpUrl
      };
      this.agentRegistry.set(agentId, registryEntry);

      // Connect with retry logic
      await withRetry(
        async () => {
          await this.establishConnection(agentId, httpUrl, registryEntry);
        },
        {
          config: {
            maxAttempts: this.config.maxRetries,
            baseDelayMs: this.config.retryDelay
          },
          logger: this.logger,
          operationName: `connect-${agentId}`
        }
      );

      // Fetch agent capabilities after successful connection
      await this.fetchAgentCapabilities(agentId, registryEntry);

      // Setup health monitoring
      this.setupHealthMonitoring(agentId, registryEntry);

      this.logger.info({ agentId }, 'Successfully connected to agent via HTTP transport');
    } catch (error) {
      const entry = this.agentRegistry.get(agentId);
      if (entry) {
        entry.connectionState = 'error';
        entry.healthy = false;
        entry.failureCount += 1;
        entry.lastError = error as Error;
      }

      const serviceError = new ServiceError(
        `Failed to connect to agent: ${agentId}`,
        ErrorCode.DEPENDENCY_FAILED,
        { service: 'agent-communication', operation: 'connect' },
        { cause: error as Error }
      );
      this.logger.error(serviceError, serviceError.message);
      throw serviceError;
    }
  }

  /**
   * Establish HTTP connection to agent
   * @private
   */
  private async establishConnection(
    agentId: string,
    httpUrl: string,
    entry: AgentRegistryEntry
  ): Promise<void> {
    try {
      // Create HTTP transport
      const transport = new StreamableHTTPClientTransport(
        new URL(httpUrl)
      );

      // Create MCP client
      const client = new Client({
        name: 'agent-communication-client',
        version: '2.0.0'
      }, {
        capabilities: {
          sampling: {}
        }
      });

      // Connect client to transport
      await client.connect(transport);

      // Update registry entry
      entry.client = client;
      entry.transport = transport;
      entry.connectionState = 'connected';
      entry.healthy = true;
      entry.failureCount = 0;
      entry.lastError = undefined;

      this.logger.info({ agentId }, 'HTTP transport connection established');
    } catch (error) {
      this.logger.error({ agentId, error }, 'Failed to establish HTTP connection');
      throw error;
    }
  }

  /**
   * Fetch agent capabilities
   * @private
   */
  private async fetchAgentCapabilities(agentId: string, entry: AgentRegistryEntry): Promise<void> {
    try {
      const toolsResponse = await entry.client.listTools();

      // Convert MCP tools to AgentCapabilities format
      const tools: ToolDefinition[] = toolsResponse.tools?.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        parameters: {
          type: 'object' as const,
          properties: (tool.inputSchema as any)?.properties || {},
          required: (tool.inputSchema as any)?.required || []
        }
      })) || [];

      entry.capabilities = {
        agentId,
        name: agentId,
        description: `Agent ${agentId} via HTTP transport`,
        tools,
        specializations: ['http-transport', 'mcp'],
        endpoints: {
          mcp: entry.url,
          health: entry.url.replace('/mcp', '/health')
        }
      };

      this.logger.info({
        agentId,
        toolCount: tools.length
      }, 'Agent capabilities fetched via HTTP');
    } catch (error) {
      this.logger.warn({
        agentId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Could not fetch agent capabilities, using defaults');

      entry.capabilities = {
        agentId,
        name: agentId,
        description: `Agent ${agentId} via HTTP transport`,
        tools: [],
        specializations: ['http-transport', 'mcp'],
        endpoints: {
          mcp: entry.url,
          health: entry.url.replace('/mcp', '/health')
        }
      };
    }
  }

  /**
   * Setup health monitoring for an agent
   * @private
   */
  private setupHealthMonitoring(agentId: string, entry: AgentRegistryEntry): void {
    if (this.config.healthCheckInterval && this.config.healthCheckInterval > 0) {
      entry.healthCheckInterval = setInterval(async () => {
        try {
          const healthResult = await this.performHealthCheck(agentId);
          if (!healthResult.healthy) {
            this.logger.warn({
              agentId,
              details: healthResult.details
            }, 'Health check failed for agent');
          }
        } catch (error) {
          this.logger.error({
            agentId,
            error: error instanceof Error ? error.message : String(error)
          }, 'Health check error for agent');
          entry.healthy = false;
          entry.lastError = error as Error;
        }
      }, this.config.healthCheckInterval);
    }
  }


  /**
   * Call a tool on a specific agent
   */
  async callTool(
    agentId: string,
    toolName: string,
    parameters: Record<string, any>,
    context: ConversationContext
  ): Promise<any> {
    const entry = this.agentRegistry.get(agentId);
    if (!entry) {
      throw new ServiceError(
        `Agent not connected: ${agentId}`,
        ErrorCode.NOT_FOUND,
        { service: 'agent-communication', operation: 'callTool' }
      );
    }

    if (!entry.healthy || entry.connectionState !== 'connected') {
      throw new ServiceError(
        `Agent is unhealthy or disconnected: ${agentId}`,
        ErrorCode.SERVICE_UNAVAILABLE,
        { service: 'agent-communication', operation: 'callTool' }
      );
    }

    try {
      this.logger.info({
        toolName,
        agentId,
        parameters: Object.keys(parameters),
        contextId: context.conversationId
      }, 'Calling tool via HTTP transport');

      const mcpResponse = await withRetry(
        async () => {
          return await entry.client.callTool({
            name: toolName,
            arguments: parameters
          });
        },
        {
          config: {
            maxAttempts: this.config.maxRetries,
            baseDelayMs: this.config.retryDelay
          },
          logger: this.logger,
          operationName: `callTool-${toolName}`
        }
      );

      // Handle proper MCP format with metadata at top level
      // New format has metadata directly accessible, with fallback to old JSON parsing approach
      let result: any;

      if (mcpResponse.metadata && typeof mcpResponse.metadata === 'object') {
        // New proper MCP format - metadata is at top level
        result = {
          result: {
            success: !mcpResponse.isError,
            message: Array.isArray(mcpResponse.content) && mcpResponse.content[0] && 'text' in mcpResponse.content[0]
              ? mcpResponse.content[0].text : 'Operation completed',
            data: mcpResponse.content || []
          },
          metadata: mcpResponse.metadata,
          error: mcpResponse.isError ? { message: 'Tool execution failed' } : null
        };
      } else {
        // Fallback to old format (JSON parsing) for backward compatibility
        let parsedResult: any;
        try {
          if (mcpResponse.content && Array.isArray(mcpResponse.content) &&
              mcpResponse.content[0] && 'text' in mcpResponse.content[0]) {
            parsedResult = JSON.parse(mcpResponse.content[0].text as string);
          } else {
            parsedResult = mcpResponse;
          }
        } catch (parseError) {
          this.logger.warn({
            toolName,
            agentId,
            parseError: parseError instanceof Error ? parseError.message : String(parseError)
          }, 'Failed to parse legacy JSON response, using raw response');
          parsedResult = mcpResponse;
        }

        result = {
          result: parsedResult,
          metadata: parsedResult.metadata || {
            executionTime: 0,
            contextUsed: []
          },
          error: parsedResult.success === false ? { message: parsedResult.message } : null
        };
      }

      this.logger.info({
        toolName,
        agentId,
        success: true,
        hasMetadata: !!result.metadata,
        executionTime: result.metadata.executionTime
      }, 'Tool call completed via HTTP transport');

      return result;
    } catch (error) {
      this.logger.error({
        toolName,
        agentId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Tool call failed via HTTP transport');

      // Update agent state if connection error
      if (this.isConnectionError(error)) {
        entry.connectionState = 'error';
        entry.healthy = false;
        entry.failureCount += 1;
        entry.lastError = error as Error;
        this.scheduleReconnection(agentId);
      }

      throw error;
    }
  }

  /**
   * Get list of available tools from an agent
   */
  async getAgentTools(agentId: string): Promise<ToolDefinition[]> {
    const entry = this.agentRegistry.get(agentId);
    if (!entry) {
      throw new ServiceError(
        `Agent not found: ${agentId}`,
        ErrorCode.NOT_FOUND,
        { service: 'agent-communication', operation: 'getAgentTools' }
      );
    }

    try {
      const response = await entry.client.listTools();
      return response.tools?.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        parameters: {
          type: 'object' as const,
          properties: (tool.inputSchema as any)?.properties || {},
          required: (tool.inputSchema as any)?.required || []
        }
      })) || [];
    } catch (error) {
      // Fallback to cached capabilities
      return entry.capabilities?.tools || [];
    }
  }

  /**
   * Perform health check on an agent
   */
  async performHealthCheck(agentId: string): Promise<{ healthy: boolean; details?: any }> {
    const entry = this.agentRegistry.get(agentId);
    if (!entry || !entry.client) {
      return { healthy: false, details: { error: 'Agent not connected' } };
    }

    try {
      // Use tool listing as a health check
      await entry.client.listTools();
      entry.lastHealthCheck = new Date();
      entry.healthy = true;

      return {
        healthy: true,
        details: {
          transport: 'http',
          agentId,
          timestamp: entry.lastHealthCheck.toISOString()
        }
      };
    } catch (error) {
      entry.healthy = false;
      entry.lastError = error as Error;

      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : String(error),
          transport: 'http',
          agentId
        }
      };
    }
  }

  /**
   * Get all connected agents
   */
  getConnectedAgents(): string[] {
    return Array.from(this.agentRegistry.entries())
      .filter(([, entry]) => entry.healthy && entry.connectionState === 'connected')
      .map(([agentId]) => agentId);
  }

  /**
   * Get agent capabilities
   */
  getAgentCapabilities(agentId: string): AgentCapabilities | null {
    const entry = this.agentRegistry.get(agentId);
    return entry?.capabilities || null;
  }

  /**
   * Check if error indicates connection failure
   * @private
   */
  private isConnectionError(error: any): boolean {
    if (!error) return false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const connectionErrorPatterns = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'fetch failed',
      'Connection timeout',
      'HTTP 500',
      'HTTP 502',
      'HTTP 503'
    ];
    return connectionErrorPatterns.some(pattern =>
      errorMessage.includes(pattern)
    );
  }

  /**
   * Schedule reconnection for disconnected agent
   * @private
   */
  private scheduleReconnection(agentId: string): void {
    const entry = this.agentRegistry.get(agentId);
    if (!entry || entry.failureCount >= 5) {
      return;
    }

    const retryDelayMs = this.config.retryDelay * Math.pow(2, entry.failureCount);

    entry.retryTimeout = setTimeout(async () => {
      this.logger.info({ agentId, attempt: entry.failureCount + 1 }, 'Attempting reconnection via HTTP');
      try {
        await this.establishConnection(agentId, entry.url, entry);
        await this.fetchAgentCapabilities(agentId, entry);
      } catch (error) {
        this.logger.error({ agentId, error }, 'Reconnection failed');
        entry.failureCount += 1;
        if (entry.failureCount < 5) {
          this.scheduleReconnection(agentId);
        }
      }
    }, retryDelayMs);

    this.logger.info({ agentId, retryDelayMs }, 'Scheduled HTTP reconnection');
  }

  /**
   * Clean up agent resources
   * @private
   */
  private cleanupAgent(agentId: string, entry: AgentRegistryEntry): void {
    this.logger.debug({ agentId }, 'Cleaning up agent resources');
    
    if (entry.healthCheckInterval) {
      clearInterval(entry.healthCheckInterval);
      entry.healthCheckInterval = undefined;
    }

    if (entry.retryTimeout) {
      clearTimeout(entry.retryTimeout);
      entry.retryTimeout = undefined;
    }
  }

  /**
   * Disconnect from an agent
   */
  async disconnect(agentId: string): Promise<void> {
    const entry = this.agentRegistry.get(agentId);
    if (!entry) return;

    this.logger.info({ agentId }, 'Disconnecting from agent via HTTP transport');

    this.cleanupAgent(agentId, entry);

    if (entry.client) {
      try {
        await entry.client.close();
      } catch (error) {
        this.logger.warn({
          agentId,
          error: error instanceof Error ? error.message : String(error)
        }, 'Error closing HTTP client');
      }
    }

    this.agentRegistry.delete(agentId);
    this.logger.info({ agentId }, 'Agent disconnected via HTTP transport');
  }

  /**
   * Disconnect from all agents and cleanup
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up agent communication client (HTTP transport)');
    const cleanupPromises = Array.from(this.agentRegistry.keys()).map(
      agentId => this.disconnect(agentId)
    );
    await Promise.all(cleanupPromises);
    this.logger.info('Agent communication client cleanup completed');
  }
}