import WebSocket from 'ws';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  RequestType,
  NotificationType,
} from 'vscode-jsonrpc/node';
import {
  createLogger,
  withRetry,
  validateData,
  configSchemas,
  ServiceError,
  ErrorCode,
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
 * WebSocket Agent Registry Entry
 */
interface WebSocketAgentRegistryEntry {
  capabilities: AgentCapabilities;
  socket: WebSocket;
  connection: any; // JSON-RPC connection
  lastHealthCheck: Date;
  healthy: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  failureCount: number;
  lastError?: Error;
  retryTimeout?: NodeJS.Timeout;
  heartbeatInterval?: NodeJS.Timeout;
}

/**
 * WebSocket MCP Agent Client for Multi-Agent Communication
 * 
 * Uses WebSocket + JSON-RPC 2.0 instead of SSE for reliable bidirectional communication
 * with automatic reconnection, heartbeat monitoring, and circuit breaker patterns.
 * 
 * @class WebSocketMCPClient
 * @since 1.2.0
 * 
 * @example Basic Usage
 * ```typescript
 * const wsClient = new WebSocketMCPClient(config);
 * 
 * // Register an Infrastructure Agent
 * await wsClient.registerAgent(infrastructureCapabilities);
 * 
 * // Execute a tool on the agent
 * const response = await wsClient.callTool(
 *   "infrastructure",
 *   "deployApplication", 
 *   { containerImage: "nginx:latest", replicas: 3 },
 *   context
 * );
 * ```
 */
export class WebSocketMCPClient {
  private agentRegistry: Map<string, WebSocketAgentRegistryEntry> = new Map();
  private config: MCPConfig;
  private logger: Logger;

  // Define JSON-RPC request types
  private readonly ListTools = new RequestType<{}, { tools: ToolDefinition[] }, void>('tools/list');
  private readonly CallTool = new RequestType<
    { name: string; arguments: Record<string, any> },
    any,
    void
  >('tools/call');
  private readonly HealthCheck = new RequestType<{}, { healthy: boolean }, void>('health/check');

  // Define notification types
  private readonly HeartbeatNotification = new NotificationType<{ timestamp: number }>('heartbeat');

  constructor(config: MCPConfig, loggerConfig?: Partial<ServiceLoggerConfig>) {
    // Validate configuration
    this.config = validateData(
      config,
      configSchemas.mcp,
      { service: 'websocket-mcp-client', operation: 'constructor' }
    );

    // Create logger
    this.logger = createLogger({
      service: 'websocket-mcp-client',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development',
      ...loggerConfig
    });
  }

  /**
   * Register a focused agent with WebSocket MCP client
   */
  async registerAgent(capabilities: AgentCapabilities): Promise<void> {
    const agentId = capabilities.agentId;

    try {
      this.logger.info({
        name: capabilities.name,
        tools: capabilities.tools.length,
        endpoint: capabilities.endpoints.mcp
      }, `Registering WebSocket agent: ${agentId}`);

      // Initialize registry entry
      const registryEntry: WebSocketAgentRegistryEntry = {
        capabilities,
        socket: null as any,
        connection: null as any,
        lastHealthCheck: new Date(),
        healthy: false,
        connectionState: 'connecting',
        failureCount: 0
      };

      this.agentRegistry.set(agentId, registryEntry);

      // Connect with retry logic
      await withRetry(
        async () => {
          await this.connectToAgent(agentId, registryEntry);
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

      this.logger.info({ agentId }, 'Successfully registered WebSocket agent');
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
        `Failed to register WebSocket agent: ${agentId}`,
        ErrorCode.DEPENDENCY_FAILED,
        { service: 'websocket-mcp-client', operation: 'registerAgent' },
        { cause: error as Error }
      );

      this.logger.error(serviceError, serviceError.message);
      throw serviceError;
    }
  }

  /**
   * Connect to a specific agent via WebSocket
   * @private
   */
  private async connectToAgent(agentId: string, entry: WebSocketAgentRegistryEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Convert HTTP URL to WebSocket URL
        const wsUrl = entry.capabilities.endpoints.mcp.replace('http://', 'ws://').replace('https://', 'wss://');

        this.logger.debug({ agentId, wsUrl }, 'Connecting to WebSocket agent');

        // Create WebSocket connection
        const socket = new WebSocket(wsUrl);

        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          socket.close();
          reject(new Error(`WebSocket connection timeout for agent: ${agentId}`));
        }, this.config.clientTimeout);

        socket.on('open', () => {
          clearTimeout(connectionTimeout);

          try {
            // Create JSON-RPC connection
            const connection = createMessageConnection(
              new StreamMessageReader(socket as any),
              new StreamMessageWriter(socket as any)
            );

            // Start listening for JSON-RPC messages
            connection.listen();

            // Update registry entry
            entry.socket = socket;
            entry.connection = connection;
            entry.connectionState = 'connected';
            entry.healthy = true;
            entry.failureCount = 0;
            entry.lastError = undefined;

            // Setup heartbeat monitoring
            this.setupHeartbeat(agentId, entry);

            // Setup connection event handlers
            this.setupWebSocketHandlers(agentId, entry);

            this.logger.info({ agentId }, 'WebSocket connection established with JSON-RPC');
            resolve();
          } catch (error) {
            clearTimeout(connectionTimeout);
            reject(error);
          }
        });

        socket.on('error', (error) => {
          clearTimeout(connectionTimeout);
          this.logger.error({ agentId, error: error.message }, 'WebSocket connection error');
          reject(error);
        });

        socket.on('close', () => {
          clearTimeout(connectionTimeout);
          if (entry.connectionState === 'connecting') {
            reject(new Error(`WebSocket connection closed during connection for agent: ${agentId}`));
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Setup WebSocket event handlers for an agent
   * @private
   */
  private setupWebSocketHandlers(agentId: string, entry: WebSocketAgentRegistryEntry): void {
    const { socket, connection } = entry;

    socket.on('close', () => {
      this.logger.warn({ agentId }, 'WebSocket connection closed');
      entry.connectionState = 'disconnected';
      entry.healthy = false;

      // Clear heartbeat
      if (entry.heartbeatInterval) {
        clearInterval(entry.heartbeatInterval);
        entry.heartbeatInterval = undefined;
      }

      // Schedule reconnection
      this.scheduleReconnection(agentId);
    });

    socket.on('error', (error) => {
      this.logger.error({ agentId, error: error.message }, 'WebSocket error');
      entry.connectionState = 'error';
      entry.healthy = false;
      entry.lastError = error;
      entry.failureCount += 1;
    });

    // Handle JSON-RPC notifications from the agent
    connection.onNotification(this.HeartbeatNotification, (params: { timestamp: number }) => {
      this.logger.debug({ agentId, timestamp: params.timestamp }, 'Received heartbeat from agent');
      entry.lastHealthCheck = new Date();
    });
  }

  /**
   * Setup heartbeat monitoring for an agent
   * @private
   */
  private setupHeartbeat(agentId: string, entry: WebSocketAgentRegistryEntry): void {
    // Send heartbeat every 30 seconds
    entry.heartbeatInterval = setInterval(() => {
      if (entry.healthy && entry.connection) {
        try {
          entry.connection.sendNotification(this.HeartbeatNotification, {
            timestamp: Date.now()
          });
          this.logger.debug({ agentId }, 'Sent heartbeat to agent');
        } catch (error) {
          this.logger.warn({ agentId, error: error.message }, 'Failed to send heartbeat');
        }
      }
    }, 30000);
  }

  /**
   * Schedule reconnection for a disconnected agent
   * @private
   */
  private scheduleReconnection(agentId: string): void {
    const entry = this.agentRegistry.get(agentId);
    if (!entry || entry.failureCount >= 5) {
      return;
    }

    const retryDelayMs = this.config.retryDelay * Math.pow(2, entry.failureCount);

    entry.retryTimeout = setTimeout(async () => {
      this.logger.info({ agentId, attempt: entry.failureCount + 1 }, 'Attempting WebSocket reconnection');

      try {
        await this.connectToAgent(agentId, entry);
      } catch (error) {
        this.logger.error({ agentId, error: error.message }, 'WebSocket reconnection failed');
        entry.failureCount += 1;

        // Schedule next retry if under limit
        if (entry.failureCount < 5) {
          this.scheduleReconnection(agentId);
        }
      }
    }, retryDelayMs);

    this.logger.info({ agentId, retryDelayMs }, 'Scheduled WebSocket reconnection');
  }

  /**
   * Call a tool on a specific agent via WebSocket JSON-RPC
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
          { service: 'websocket-mcp-client', operation: 'callTool' }
        );
      }

      // Check connection health
      if (!entry.healthy || entry.connectionState !== 'connected') {
        throw new ServiceError(
          `Agent is unhealthy or disconnected: ${agentId}`,
          ErrorCode.SERVICE_UNAVAILABLE,
          { service: 'websocket-mcp-client', operation: 'callTool' }
        );
      }

      // Check if tool exists
      const tool = entry.capabilities.tools.find(t => t.name === toolName);
      if (!tool) {
        throw new ServiceError(
          `Tool not found: ${toolName} on agent ${agentId}`,
          ErrorCode.NOT_FOUND,
          { service: 'websocket-mcp-client', operation: 'callTool' }
        );
      }

      this.logger.info({
        toolName,
        agentId,
        parameters: Object.keys(parameters),
        contextId: context.conversationId
      }, 'Calling tool via WebSocket JSON-RPC');

      // Make the JSON-RPC call with retry logic
      const result = await withRetry(
        () => entry.connection.sendRequest(this.CallTool, {
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
        result: result,
        id: `${context.conversationId}_${Date.now()}`,
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
      }, `WebSocket tool call completed: ${toolName}`);

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
        }, 'WebSocket connection error detected');

        // Schedule reconnection
        this.scheduleReconnection(agentId);
      }

      this.logger.error({
        agentId,
        error: error instanceof Error ? error.message : String(error),
        executionTime
      }, `WebSocket tool call failed: ${toolName}`);

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
      'WebSocket',
      'Connection closed',
      'Connection timeout'
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
   * Health check for all registered agents via WebSocket
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const healthStatus: Record<string, boolean> = {};

    const healthPromises = Array.from(this.agentRegistry.entries()).map(
      async ([agentId, entry]) => {
        try {
          if (entry.healthy && entry.connection) {
            // Use JSON-RPC health check if available
            const result = await entry.connection.sendRequest(this.HealthCheck, {});
            healthStatus[agentId] = result.healthy;
            entry.lastHealthCheck = new Date();
          } else {
            healthStatus[agentId] = false;
          }
        } catch (error) {
          entry.healthy = false;
          entry.lastHealthCheck = new Date();
          healthStatus[agentId] = false;

          this.logger.error({
            error: error instanceof Error ? error.message : String(error)
          }, `WebSocket health check failed: ${agentId}`);
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
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    try {
      const entry = this.agentRegistry.get(agentId);
      if (!entry) {
        this.logger.warn(`Agent not found for unregistration: ${agentId}`);
        return;
      }

      // Clear intervals and timeouts
      if (entry.heartbeatInterval) {
        clearInterval(entry.heartbeatInterval);
      }
      if (entry.retryTimeout) {
        clearTimeout(entry.retryTimeout);
      }

      // Close WebSocket connection
      if (entry.socket && entry.socket.readyState === WebSocket.OPEN) {
        entry.socket.close();
      }

      // Remove from registry
      this.agentRegistry.delete(agentId);

      this.logger.info({ agentId }, 'Unregistered WebSocket agent');
    } catch (error) {
      const serviceError = new ServiceError(
        `Failed to unregister WebSocket agent: ${agentId}`,
        ErrorCode.INTERNAL_ERROR,
        { service: 'websocket-mcp-client', operation: 'unregisterAgent' },
        { cause: error as Error }
      );

      this.logger.error({ error: serviceError }, serviceError.message);
      throw serviceError;
    }
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up WebSocket MCP agent clients');

    const cleanupPromises = Array.from(this.agentRegistry.keys()).map(
      agentId => this.unregisterAgent(agentId)
    );

    await Promise.all(cleanupPromises);

    this.logger.info('WebSocket MCP agent client cleanup completed');
  }
}

export * from '@ai-idp/types';