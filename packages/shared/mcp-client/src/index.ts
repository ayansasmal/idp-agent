import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  createHttpClient,
  createLogger,
  withRetry,
  validateData,
  configSchemas,
  ServiceError,
  ErrorCode,
  type HttpClientConfig,
  type ServiceLoggerConfig
} from '@ai-idp/utils';
import type { Logger } from 'pino';
import type {
  MCPRequest,
  MCPResponse,
  AgentCapabilities,
  ToolDefinition,
  MCPConfig,
  ConversationContext
} from '@ai-idp/types';

/**
 * Internal registry entry for managing focused agent connections and metadata
 * 
 * Stores all information needed to manage communication with a registered
 * focused agent, including capabilities, MCP client connection, health status,
 * and transport layer details.
 * 
 * @interface AgentRegistryEntry
 * @internal
 */
interface AgentRegistryEntry {
  /** Agent capabilities and tool definitions */
  capabilities: AgentCapabilities;
  /** Active MCP client connection to the agent */
  client: Client;
  /** MCP transport layer (SSE or stdio) */
  transport: SSEClientTransport | StdioClientTransport;
  /** Timestamp of last health check */
  lastHealthCheck: Date;
  /** Current health status of the agent */
  healthy: boolean;
  /** Connection state tracking */
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  /** Number of consecutive connection failures */
  failureCount: number;
  /** Last connection error */
  lastError?: Error;
  /** Connection retry timeout */
  retryTimeout?: NodeJS.Timeout;
}

/**
 * MCP Agent Client for Multi-Agent Communication
 * 
 * The MCPAgentClient manages communication between the Meta-Agent and focused agents
 * using the Model Context Protocol (MCP). It handles:
 * 
 * - **Agent Registration**: Registers focused agents and maintains their capabilities
 * - **Tool Execution**: Routes tool calls to appropriate agents via MCP protocol
 * - **Health Monitoring**: Continuously monitors agent health and connectivity
 * - **Error Handling**: Provides robust error handling with automatic retries
 * - **Connection Management**: Manages MCP connections and transport layers
 * 
 * The client abstracts the complexity of multi-agent communication, providing
 * a simple interface for the Meta-Agent to interact with any number of focused agents.
 * 
 * @class MCPAgentClient
 * @since 1.0.0
 * @version 1.1.0
 * 
 * @example Basic Usage
 * ```typescript
 * const config: MCPConfig = {
 *   serverPort: 3001,
 *   clientTimeout: 30000,
 *   maxRetries: 3,
 *   retryDelay: 1000
 * };
 * 
 * const mcpClient = new MCPAgentClient(config);
 * 
 * // Register an Infrastructure Agent
 * await mcpClient.registerAgent(infrastructureCapabilities);
 * 
 * // Execute a tool on the agent
 * const response = await mcpClient.callTool(
 *   "infrastructure",
 *   "deployApplication",
 *   { containerImage: "nginx:latest", replicas: 3 },
 *   context
 * );
 * ```
 * 
 * @example Health Monitoring
 * ```typescript
 * // Check health of all registered agents
 * const healthStatus = await mcpClient.healthCheckAll();
 * console.log(healthStatus); // { "infrastructure": true, "security": false }
 * 
 * // Get available tools from healthy agents
 * const tools = mcpClient.getAvailableTools();
 * console.log(tools); // { "infrastructure": [{ name: "deployApplication", ... }] }
 * ```
 */
export class MCPAgentClient {
  private agentRegistry: Map<string, AgentRegistryEntry> = new Map();
  private config: MCPConfig;
  private logger: Logger;
  private httpClient: ReturnType<typeof createHttpClient>;

  constructor(config: MCPConfig, loggerConfig?: Partial<ServiceLoggerConfig>) {
    // Validate configuration using utils
    this.config = validateData(
      config,
      configSchemas.mcp,
      { service: 'mcp-client', operation: 'constructor' }
    );

    // Create logger using utils
    this.logger = createLogger({
      service: 'mcp-client',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development',
      ...loggerConfig
    });

    // Create HTTP client using utils
    const httpConfig: HttpClientConfig = {
      timeout: this.config.clientTimeout,
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelay,
      userAgent: 'AI-IDP MCP-Client/1.0.0'
    };

    this.httpClient = createHttpClient(httpConfig, this.logger);
  }

  /**
   * Register a focused agent with MCP client
   */
  async registerAgent(capabilities: AgentCapabilities): Promise<void> {
    const agentId = capabilities.agentId;
    
    try {
      this.logger.info({
        name: capabilities.name,
        tools: capabilities.tools.length
      }, `Registering agent: ${agentId}`);

      // Initialize registry entry with connecting state
      const registryEntry: AgentRegistryEntry = {
        capabilities,
        client: null as any, // Will be set after successful connection
        transport: null as any, // Will be set after creation
        lastHealthCheck: new Date(),
        healthy: false,
        connectionState: 'connecting',
        failureCount: 0
      };

      this.agentRegistry.set(agentId, registryEntry);

      // Create MCP transport with connection state tracking
      const transport = new SSEClientTransport(
        new URL(capabilities.endpoints.mcp)
      );

      // Create MCP client
      const client = new Client(
        {
          name: 'meta-agent',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // Connect with retry logic using utils
      await withRetry(
        async () => {
          registryEntry.connectionState = 'connecting';
          await client.connect(transport);
          
          // Connection successful - update state
          registryEntry.client = client;
          registryEntry.transport = transport;
          registryEntry.connectionState = 'connected';
          registryEntry.healthy = true;
          registryEntry.failureCount = 0;
          registryEntry.lastError = undefined;
          
          this.logger.info({ agentId }, 'MCP connection established successfully');
        },
        {
          config: {
            maxAttempts: this.config.maxRetries,
            baseDelayMs: this.config.retryDelay
          },
          logger: this.logger,
          operationName: `registerAgent-${agentId}`
        }
      );

      // Setup connection event handlers
      this.setupConnectionHandlers(agentId, registryEntry);

      this.logger.info({ agentId }, 'Successfully registered agent with connection management');
    } catch (error) {
      // Update registry entry with error state
      const entry = this.agentRegistry.get(agentId);
      if (entry) {
        entry.connectionState = 'error';
        entry.healthy = false;
        entry.failureCount += 1;
        entry.lastError = error as Error;
      }

      const serviceError = new ServiceError(
        `Failed to register agent: ${agentId}`,
        ErrorCode.DEPENDENCY_FAILED,
        { service: 'mcp-client', operation: 'registerAgent' },
        { cause: error as Error }
      );

      this.logger.error(serviceError, serviceError.message);
      throw serviceError;
    }
  }

  /**
   * Setup connection event handlers for an agent
   * @private
   */
  private setupConnectionHandlers(agentId: string, entry: AgentRegistryEntry): void {
    // Note: MCP SDK doesn't expose connection events directly
    // This is a placeholder for future SDK enhancements or custom transport monitoring
    
    // For now, we'll rely on health checks and call-time error handling
    // to detect connection issues and trigger reconnection
    
    this.logger.debug({ agentId }, 'Connection handlers configured (passive monitoring)');
  }

  /**
   * Attempt to reconnect a disconnected agent
   * @private
   */
  private async reconnectAgent(agentId: string): Promise<boolean> {
    const entry = this.agentRegistry.get(agentId);
    if (!entry) {
      this.logger.warn({ agentId }, 'Cannot reconnect: agent not found in registry');
      return false;
    }

    if (entry.connectionState === 'connecting') {
      this.logger.debug({ agentId }, 'Reconnection already in progress');
      return false;
    }

    try {
      this.logger.info({ 
        agentId, 
        failureCount: entry.failureCount 
      }, 'Attempting agent reconnection');

      entry.connectionState = 'connecting';
      
      // Create new transport and client
      const transport = new SSEClientTransport(
        new URL(entry.capabilities.endpoints.mcp)
      );

      const client = new Client(
        {
          name: 'meta-agent',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // Attempt reconnection with retry logic
      await withRetry(
        async () => {
          await client.connect(transport);
          
          // Close old client if it exists
          if (entry.client) {
            try {
              await entry.client.close();
            } catch (e) {
              this.logger.debug({ agentId }, 'Old client close failed (expected)');
            }
          }
          
          // Update entry with new connection
          entry.client = client;
          entry.transport = transport;
          entry.connectionState = 'connected';
          entry.healthy = true;
          entry.failureCount = 0;
          entry.lastError = undefined;
          
          this.logger.info({ agentId }, 'Agent reconnection successful');
        },
        {
          config: {
            maxAttempts: Math.min(3, this.config.maxRetries),
            baseDelayMs: this.config.retryDelay * (entry.failureCount + 1)
          },
          logger: this.logger,
          operationName: `reconnectAgent-${agentId}`
        }
      );

      return true;
    } catch (error) {
      entry.connectionState = 'error';
      entry.healthy = false;
      entry.failureCount += 1;
      entry.lastError = error as Error;

      this.logger.error({ 
        agentId, 
        failureCount: entry.failureCount,
        error: error instanceof Error ? error.message : String(error)
      }, 'Agent reconnection failed');

      // Schedule retry if failure count is reasonable
      if (entry.failureCount < 5) {
        const retryDelayMs = this.config.retryDelay * Math.pow(2, entry.failureCount);
        entry.retryTimeout = setTimeout(() => {
          this.reconnectAgent(agentId);
        }, retryDelayMs);
        
        this.logger.info({ 
          agentId, 
          retryDelayMs 
        }, 'Scheduled reconnection retry');
      }

      return false;
    }
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    try {
      const entry = this.agentRegistry.get(agentId);
      if (!entry) {
        this.logger.warn(`Agent not found for unregistration: ${agentId}`);
        return;
      }

      // Clear any pending retry timeouts
      if (entry.retryTimeout) {
        clearTimeout(entry.retryTimeout);
        entry.retryTimeout = undefined;
      }

      // Update connection state
      entry.connectionState = 'disconnected';
      entry.healthy = false;

      // Close client connection
      if (entry.client) {
        await entry.client.close();
      }

      // Remove from registry
      this.agentRegistry.delete(agentId);

      this.logger.info({ agentId }, 'Unregistered agent with connection cleanup');
    } catch (error) {
      const serviceError = new ServiceError(
        `Failed to unregister agent: ${agentId}`,
        ErrorCode.INTERNAL_ERROR,
        { service: 'mcp-client', operation: 'unregisterAgent' },
        { cause: error as Error }
      );

      this.logger.error({ error: serviceError }, serviceError.message);
      throw serviceError;
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
  ): Promise<MCPResponse> {
    const startTime = Date.now();

    try {
      const entry = this.agentRegistry.get(agentId);
      if (!entry) {
        throw new ServiceError(
          `Agent not registered: ${agentId}`,
          ErrorCode.NOT_FOUND,
          { service: 'mcp-client', operation: 'callTool' }
        );
      }

      // Check connection state and attempt reconnection if needed
      if (!entry.healthy || entry.connectionState !== 'connected') {
        this.logger.warn({ 
          agentId, 
          connectionState: entry.connectionState,
          healthy: entry.healthy 
        }, 'Agent connection unhealthy, attempting reconnection');
        
        const reconnected = await this.reconnectAgent(agentId);
        if (!reconnected) {
          throw new ServiceError(
            `Agent is unhealthy and reconnection failed: ${agentId}`,
            ErrorCode.SERVICE_UNAVAILABLE,
            { service: 'mcp-client', operation: 'callTool' }
          );
        }
      }

      // Check if tool exists
      const tool = entry.capabilities.tools.find(t => t.name === toolName);
      if (!tool) {
        throw new ServiceError(
          `Tool not found: ${toolName} on agent ${agentId}`,
          ErrorCode.NOT_FOUND,
          { service: 'mcp-client', operation: 'callTool' }
        );
      }

      this.logger.info({
        toolName,
        agentId,
        parameters: Object.keys(parameters),
        contextId: context.conversationId
      }, 'Calling tool');

      // Create MCP request
      const request: MCPRequest = {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: parameters
        },
        id: `${context.conversationId}_${Date.now()}`,
        context
      };

      // Make the MCP call with retry logic from utils
      const result = await withRetry(
        () => entry.client.callTool({
          name: toolName,
          arguments: parameters
        }),
        {
          config: {
            maxAttempts: this.config.maxRetries,
            baseDelayMs: this.config.retryDelay
          },
          logger: this.logger,
          operationName: `callTool-${toolName}`
        }
      );

      const executionTime = Date.now() - startTime;

      const response: MCPResponse = {
        result: result.content,
        id: request.id,
        metadata: {
          agent: agentId,
          executionTime,
          contextUsed: context.history.slice(-3).map(h => h.id) // Last 3 messages
        }
      };

      this.logger.info({
        agentId,
        executionTime,
        success: !response.error
      }, `Tool call completed: ${toolName}`);

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Update agent state if this looks like a connection error
      const entry = this.agentRegistry.get(agentId);
      if (entry && this.isConnectionError(error)) {
        entry.connectionState = 'error';
        entry.healthy = false;
        entry.failureCount += 1;
        entry.lastError = error as Error;
        
        this.logger.warn({ 
          agentId, 
          connectionState: entry.connectionState,
          failureCount: entry.failureCount 
        }, 'Connection error detected, marking agent unhealthy');
        
        // Schedule reconnection attempt (non-blocking)
        setTimeout(() => {
          this.reconnectAgent(agentId);
        }, this.config.retryDelay);
      }

      this.logger.error({
        agentId,
        error: error instanceof Error ? error.message : String(error),
        executionTime
      }, `Tool call failed: ${toolName}`);

      return {
        error: {
          code: -1,
          message: error instanceof Error ? error.message : String(error),
          data: { agentId, toolName }
        },
        id: `${context.conversationId}_${Date.now()}`,
        metadata: {
          agent: agentId,
          executionTime
        }
      };
    }
  }

  /**
   * Check if an error indicates a connection failure
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
      'ENETDOWN',
      'ENETUNREACH',
      'Connection failed',
      'Transport error',
      'MCP connection',
      'SSE connection'
    ];
    
    return connectionErrorPatterns.some(pattern => 
      errorMessage.includes(pattern)
    );
  }

  /**
   * Get available tools from all registered agents
   */
  getAvailableTools(): Record<string, ToolDefinition[]> {
    const toolsByAgent: Record<string, ToolDefinition[]> = {};

    for (const [agentId, entry] of this.agentRegistry) {
      if (entry.healthy) {
        toolsByAgent[agentId] = entry.capabilities.tools;
      }
    }

    return toolsByAgent;
  }

  /**
   * Find agents that can handle a specific capability
   */
  findAgentsForCapability(capability: string): AgentCapabilities[] {
    const matchingAgents: AgentCapabilities[] = [];

    for (const [, entry] of this.agentRegistry) {
      if (entry.healthy && entry.capabilities.specializations.includes(capability)) {
        matchingAgents.push(entry.capabilities);
      }
    }

    return matchingAgents;
  }

  /**
   * Health check for all registered agents using utils HTTP client
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const healthStatus: Record<string, boolean> = {};

    const healthPromises = Array.from(this.agentRegistry.entries()).map(
      async ([agentId, entry]) => {
        try {
          // Health check using utils HTTP client with automatic retry
          const response = await withRetry(
            () => this.httpClient.get(entry.capabilities.endpoints.health),
            {
              config: { maxAttempts: 2, baseDelayMs: 500 },
              logger: this.logger,
              operationName: `healthCheck-${agentId}`
            }
          );

          const healthy = response.status >= 200 && response.status < 300;
          entry.healthy = healthy;
          entry.lastHealthCheck = new Date();

          healthStatus[agentId] = healthy;

          if (!healthy) {
            this.logger.warn({
              status: response.status,
              statusText: response.statusText
            }, `Agent unhealthy: ${agentId}`);
          }
        } catch (error) {
          entry.healthy = false;
          entry.lastHealthCheck = new Date();
          healthStatus[agentId] = false;

          this.logger.error({
            error: error instanceof Error ? error.message : String(error)
          }, `Agent health check failed: ${agentId}`);
        }
      }
    );

    await Promise.all(healthPromises);

    return healthStatus;
  }

  /**
   * Get registered agents info
   */
  getRegisteredAgents(): AgentCapabilities[] {
    return Array.from(this.agentRegistry.values())
      .filter(entry => entry.healthy)
      .map(entry => entry.capabilities);
  }

  /**
   * Broadcast a message to all healthy agents (for notifications)
   */
  async broadcastNotification(
    message: string,
    data?: Record<string, any>
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    const broadcastPromises = Array.from(this.agentRegistry.entries())
      .filter(([, entry]) => entry.healthy)
      .map(async ([agentId, entry]) => {
        try {
          // If agent supports notifications, send it
          const notificationTool = entry.capabilities.tools.find(
            tool => tool.name === 'receiveNotification'
          );

          if (notificationTool) {
            await entry.client.callTool({
              name: 'receiveNotification',
              arguments: { message, data }
            });
            results[agentId] = true;
          } else {
            results[agentId] = false; // Agent doesn't support notifications
          }
        } catch (error) {
          this.logger.error({
            error: error instanceof Error ? error.message : String(error)
          }, `Broadcast failed to agent: ${agentId}`);
          results[agentId] = false;
        }
      });

    await Promise.all(broadcastPromises);

    return results;
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up MCP agent clients');

    const cleanupPromises = Array.from(this.agentRegistry.keys()).map(
      agentId => this.unregisterAgent(agentId)
    );

    await Promise.all(cleanupPromises);

    this.logger.info('MCP agent client cleanup completed');
  }
}

export * from '@ai-idp/types';