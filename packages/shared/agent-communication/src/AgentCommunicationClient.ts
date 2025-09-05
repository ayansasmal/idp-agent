import WebSocket from 'ws';
import {
  createMessageConnection,
  RequestType,
  NotificationType,
  MessageConnection
} from 'vscode-jsonrpc';
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
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Connection health check timeout */
  healthCheckTimeout?: number;
}

/**
 * Default configuration for agent communication
 */
export const DEFAULT_AGENT_COMMUNICATION_CONFIG: AgentCommunicationConfig = {
  clientTimeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  heartbeatInterval: 30000,
  healthCheckTimeout: 90000
};

/**
 * Registry entry for connected agents
 */
interface AgentRegistryEntry {
  capabilities: AgentCapabilities;
  socket: WebSocket;
  connection: MessageConnection;
  lastHeartbeat: Date;
  healthy: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  failureCount: number;
  lastError?: Error;
  retryTimeout?: NodeJS.Timeout;
  heartbeatInterval?: NodeJS.Timeout;
}

/**
 * Standard JSON-RPC request types for agent communication
 */
export const StandardRequestTypes = {
  ListTools: new RequestType<{}, { tools: ToolDefinition[] }, void>('tools/list'),
  CallTool: new RequestType<
    { name: string; arguments: Record<string, any> },
    any,
    void
  >('tools/call'),
  HealthCheck: new RequestType<{}, { healthy: boolean; details?: any }, void>('health/check'),
  GetCapabilities: new RequestType<{}, AgentCapabilities, void>('agent/capabilities')
} as const;

/**
 * Standard JSON-RPC notification types for agent communication
 */
export const StandardNotificationTypes = {
  Heartbeat: new NotificationType<{ timestamp: number; clientId?: string }>('heartbeat'),
  StatusUpdate: new NotificationType<{ status: string; data?: any }>('status/update'),
  Initialized: new NotificationType<{ protocolVersion: string; capabilities: any }>('notifications/initialized')
} as const;

/**
 * Standardized Agent Communication Client
 * 
 * Provides a consistent interface for WebSocket + JSON-RPC communication between agents
 * with automatic reconnection, heartbeat monitoring, and error handling.
 * 
 * @class AgentCommunicationClient
 * @since 1.0.0
 * 
 * @example Basic Usage
 * ```typescript
 * const client = new AgentCommunicationClient(config);
 * 
 * // Register and connect to an agent
 * await client.connect('infrastructure', 'ws://localhost:3003/mcp');
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
  }

  /**
   * Connect to an agent via WebSocket + JSON-RPC
   */
  async connect(agentId: string, wsUrl: string): Promise<void> {
    try {
      this.logger.info({ agentId, wsUrl }, 'Connecting to agent');

      // Initialize registry entry
      const registryEntry: AgentRegistryEntry = {
        capabilities: null as any, // Will be fetched after connection
        socket: null as any,
        connection: null as any,
        lastHeartbeat: new Date(),
        healthy: false,
        connectionState: 'connecting',
        failureCount: 0
      };

      this.agentRegistry.set(agentId, registryEntry);

      // Connect with retry logic
      await withRetry(
        async () => {
          await this.establishConnection(agentId, wsUrl, registryEntry);
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
      try {
        const capabilities = await registryEntry.connection.sendRequest(
          StandardRequestTypes.GetCapabilities,
          {}
        );
        registryEntry.capabilities = capabilities;
      } catch (error) {
        this.logger.warn({ agentId }, 'Could not fetch agent capabilities, using defaults');
        registryEntry.capabilities = {
          agentId,
          name: agentId,
          description: `Agent ${agentId}`,
          tools: [],
          specializations: [],
          endpoints: { 
            mcp: wsUrl,
            health: wsUrl.replace('/mcp', '/health')
          }
        };
      }

      this.logger.info({ agentId }, 'Successfully connected to agent');
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
   * Establish WebSocket connection to agent
   * @private
   */
  private async establishConnection(
    agentId: string,
    wsUrl: string,
    entry: AgentRegistryEntry
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(wsUrl);

        const connectionTimeout = setTimeout(() => {
          socket.close();
          reject(new Error(`Connection timeout for agent: ${agentId}`));
        }, this.config.clientTimeout);

        socket.on('open', () => {
          clearTimeout(connectionTimeout);

          try {
            // Create JSON-RPC connection  
            const connection = createMessageConnection(socket as any, socket as any);

            connection.listen();

            // Update registry entry
            entry.socket = socket;
            entry.connection = connection;
            entry.connectionState = 'connected';
            entry.healthy = true;
            entry.failureCount = 0;
            entry.lastError = undefined;

            // Setup event handlers
            this.setupConnectionHandlers(agentId, entry);

            this.logger.info({ agentId }, 'WebSocket connection established');
            resolve();
          } catch (error) {
            clearTimeout(connectionTimeout);
            reject(error);
          }
        });

        socket.on('error', (error) => {
          clearTimeout(connectionTimeout);
          reject(error);
        });

        socket.on('close', () => {
          clearTimeout(connectionTimeout);
          if (entry.connectionState === 'connecting') {
            reject(new Error(`Connection closed during setup for agent: ${agentId}`));
          }
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Setup connection event handlers
   * @private
   */
  private setupConnectionHandlers(agentId: string, entry: AgentRegistryEntry): void {
    const { socket, connection } = entry;

    // WebSocket event handlers
    socket.on('close', () => {
      this.logger.warn({ agentId }, 'WebSocket connection closed');
      entry.connectionState = 'disconnected';
      entry.healthy = false;

      this.cleanupAgent(agentId, entry);
      this.scheduleReconnection(agentId);
    });

    socket.on('error', (error) => {
      this.logger.error({ agentId, error: error.message }, 'WebSocket error');
      entry.connectionState = 'error';
      entry.healthy = false;
      entry.lastError = error;
      entry.failureCount += 1;
    });

    // JSON-RPC notification handlers
    connection.onNotification(StandardNotificationTypes.Heartbeat, (params) => {
      entry.lastHeartbeat = new Date();
      this.logger.debug({ agentId, timestamp: params.timestamp }, 'Received heartbeat');
    });

    connection.onNotification(StandardNotificationTypes.StatusUpdate, (params) => {
      this.logger.info({ agentId, status: params.status }, 'Agent status update');
    });

    // Setup heartbeat monitoring
    this.setupHeartbeat(agentId, entry);
  }

  /**
   * Setup heartbeat monitoring
   * @private
   */
  private setupHeartbeat(agentId: string, entry: AgentRegistryEntry): void {
    if (!this.config.heartbeatInterval) return;

    entry.heartbeatInterval = setInterval(() => {
      if (entry.healthy && entry.connection) {
        try {
          entry.connection.sendNotification(StandardNotificationTypes.Heartbeat, {
            timestamp: Date.now(),
            clientId: 'meta-agent'
          });

          // Check for heartbeat timeout
          const timeSinceLastHeartbeat = Date.now() - entry.lastHeartbeat.getTime();
          if (timeSinceLastHeartbeat > (this.config.healthCheckTimeout || 90000)) {
            this.logger.warn({
              agentId,
              timeSinceLastHeartbeat
            }, 'Agent heartbeat timeout detected');
            entry.healthy = false;
          }
        } catch (error) {
          this.logger.warn({ agentId, error }, 'Failed to send heartbeat');
        }
      }
    }, this.config.heartbeatInterval);
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

    const wsUrl = entry.capabilities?.endpoints?.mcp;
    if (!wsUrl) return;

    const retryDelayMs = this.config.retryDelay * Math.pow(2, entry.failureCount);

    entry.retryTimeout = setTimeout(async () => {
      this.logger.info({ agentId, attempt: entry.failureCount + 1 }, 'Attempting reconnection');

      try {
        await this.establishConnection(agentId, wsUrl, entry);
      } catch (error) {
        this.logger.error({ agentId, error }, 'Reconnection failed');
        entry.failureCount += 1;

        if (entry.failureCount < 5) {
          this.scheduleReconnection(agentId);
        }
      }
    }, retryDelayMs);

    this.logger.info({ agentId, retryDelayMs }, 'Scheduled reconnection');
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
    const startTime = Date.now();

    try {
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

      this.logger.info({
        toolName,
        agentId,
        parameters: Object.keys(parameters),
        contextId: context.conversationId
      }, 'Calling tool on agent');

      // Make JSON-RPC call with retry logic
      const result = await withRetry(
        () => entry.connection.sendRequest(StandardRequestTypes.CallTool, {
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

      this.logger.info({
        agentId,
        toolName,
        executionTime,
        success: true
      }, 'Tool call completed successfully');

      return {
        result,
        metadata: {
          agent: agentId,
          executionTime,
          contextUsed: context.history.slice(-3).map(h => h.id)
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.logger.error({
        agentId,
        toolName,
        error: error instanceof Error ? error.message : String(error),
        executionTime
      }, 'Tool call failed');

      // Update agent state if connection error
      const entry = this.agentRegistry.get(agentId);
      if (entry && this.isConnectionError(error)) {
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
    if (!entry || !entry.healthy) {
      throw new ServiceError(
        `Agent not available: ${agentId}`,
        ErrorCode.SERVICE_UNAVAILABLE,
        { service: 'agent-communication', operation: 'getAgentTools' }
      );
    }

    try {
      const response = await entry.connection.sendRequest(StandardRequestTypes.ListTools, {});
      return response.tools;
    } catch (error) {
      // Fallback to cached capabilities
      return entry.capabilities?.tools || [];
    }
  }

  /**
   * Perform health check on an agent
   */
  async healthCheck(agentId: string): Promise<{ healthy: boolean; details?: any }> {
    const entry = this.agentRegistry.get(agentId);
    if (!entry || !entry.connection) {
      return { healthy: false, details: { error: 'Agent not connected' } };
    }

    try {
      const response = await entry.connection.sendRequest(StandardRequestTypes.HealthCheck, {});
      entry.healthy = response.healthy;
      entry.lastHeartbeat = new Date();
      return response;
    } catch (error) {
      entry.healthy = false;
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Get all connected agents
   */
  getConnectedAgents(): string[] {
    return Array.from(this.agentRegistry.entries())
      .filter(([, entry]) => entry.healthy)
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
      'WebSocket',
      'Connection closed',
      'Connection timeout'
    ];

    return connectionErrorPatterns.some(pattern =>
      errorMessage.includes(pattern)
    );
  }

  /**
   * Clean up agent resources
   * @private
   */
  private cleanupAgent(agentId: string, entry: AgentRegistryEntry): void {
    if (entry.heartbeatInterval) {
      clearInterval(entry.heartbeatInterval);
      entry.heartbeatInterval = undefined;
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

    this.logger.info({ agentId }, 'Disconnecting from agent');

    this.cleanupAgent(agentId, entry);

    if (entry.socket && entry.socket.readyState === WebSocket.OPEN) {
      entry.socket.close();
    }

    this.agentRegistry.delete(agentId);
  }

  /**
   * Disconnect from all agents and cleanup
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up agent communication client');

    const cleanupPromises = Array.from(this.agentRegistry.keys()).map(
      agentId => this.disconnect(agentId)
    );

    await Promise.all(cleanupPromises);

    this.logger.info('Agent communication client cleanup completed');
  }
}