import WebSocket from 'ws';
import {
  createMessageConnection,
  RequestType,
  NotificationType
} from 'vscode-jsonrpc';
import {
  createLogger,
  withRetry,
  ServiceError,
  ErrorCode,
  type ServiceLoggerConfig
} from '@ai-idp/utils';
import type { Logger } from 'pino';
import type {
  AgentCapabilities,
  ToolDefinition,
  MCPConfig,
  ConversationContext
} from '@ai-idp/types';

/**
 * Simple WebSocket MCP Client based on the clean documentation pattern
 * 
 * Provides a straightforward interface for connecting to WebSocket + JSON-RPC agents
 * with built-in heartbeat monitoring and automatic reconnection.
 */
export class SimpleWebSocketMCPClient {
  private agentConnections: Map<string, {
    capabilities: AgentCapabilities;
    socket: WebSocket;
    connection: any;
    lastHeartbeat: Date;
    healthy: boolean;
  }> = new Map();
  
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
    this.config = config;
    
    this.logger = createLogger({
      service: 'simple-websocket-mcp-client',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development',
      ...loggerConfig
    });
  }

  /**
   * Connect to an agent via WebSocket
   */
  async connectToAgent(agentId: string, wsUrl: string, capabilities: AgentCapabilities): Promise<void> {
    try {
      this.logger.info({ agentId, wsUrl }, 'Connecting to agent via WebSocket');

      await withRetry(
        async () => {
          await this.establishConnection(agentId, wsUrl, capabilities);
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

      this.logger.info({ agentId }, 'Successfully connected to agent');
    } catch (error) {
      this.logger.error({ agentId, error: error.message }, 'Failed to connect to agent');
      throw new ServiceError(
        `Failed to connect to agent: ${agentId}`,
        ErrorCode.DEPENDENCY_FAILED,
        { service: 'simple-websocket-mcp-client', operation: 'connectToAgent' },
        { cause: error as Error }
      );
    }
  }

  /**
   * Establish WebSocket connection - based on clean documentation pattern
   * @private
   */
  private async establishConnection(agentId: string, wsUrl: string, capabilities: AgentCapabilities): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);

      const connectionTimeout = setTimeout(() => {
        socket.close();
        reject(new Error(`Connection timeout for agent: ${agentId}`));
      }, this.config.clientTimeout);

      socket.on('open', () => {
        clearTimeout(connectionTimeout);
        
        try {
          this.logger.info({ agentId }, 'WebSocket connection established');

          // Create JSON-RPC connection - simple approach from docs
          const connection = createMessageConnection(socket as any, socket as any);
          connection.listen();

          // Register connection
          this.agentConnections.set(agentId, {
            capabilities,
            socket,
            connection,
            lastHeartbeat: new Date(),
            healthy: true
          });

          // Setup event handlers
          this.setupConnectionHandlers(agentId);

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
        this.handleConnectionClose(agentId);
      });
    });
  }

  /**
   * Setup connection event handlers
   * @private
   */
  private setupConnectionHandlers(agentId: string): void {
    const agentConn = this.agentConnections.get(agentId);
    if (!agentConn) return;

    const { socket, connection } = agentConn;

    // Handle heartbeat notifications from server
    connection.onNotification(this.HeartbeatNotification, (params: { timestamp: number }) => {
      agentConn.lastHeartbeat = new Date();
      this.logger.debug({ agentId, serverTimestamp: params.timestamp }, 'Received heartbeat from server');
    });

    // WebSocket event handlers
    socket.on('close', () => {
      this.logger.warn({ agentId }, 'WebSocket connection closed');
      this.handleConnectionClose(agentId);
    });

    socket.on('error', (error) => {
      this.logger.error({ agentId, error: error.message }, 'WebSocket error');
      agentConn.healthy = false;
    });

    // Send heartbeat to server every 30 seconds
    setInterval(() => {
      if (agentConn.healthy && socket.readyState === WebSocket.OPEN) {
        try {
          connection.sendNotification(this.HeartbeatNotification, {
            timestamp: Date.now()
          });
          this.logger.debug({ agentId }, 'Sent heartbeat to server');
        } catch (error) {
          this.logger.warn({ agentId, error: error.message }, 'Failed to send heartbeat');
        }
      }
    }, 30000);
  }

  /**
   * Handle connection close
   * @private
   */
  private handleConnectionClose(agentId: string): void {
    const agentConn = this.agentConnections.get(agentId);
    if (agentConn) {
      agentConn.healthy = false;
      this.logger.info({ agentId }, 'Agent connection marked as unhealthy');
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
    const agentConn = this.agentConnections.get(agentId);
    if (!agentConn) {
      throw new ServiceError(
        `Agent not connected: ${agentId}`,
        ErrorCode.NOT_FOUND,
        { service: 'simple-websocket-mcp-client', operation: 'callTool' }
      );
    }

    if (!agentConn.healthy) {
      throw new ServiceError(
        `Agent is unhealthy: ${agentId}`,
        ErrorCode.SERVICE_UNAVAILABLE,
        { service: 'simple-websocket-mcp-client', operation: 'callTool' }
      );
    }

    this.logger.info({
      toolName,
      agentId,
      parameters: Object.keys(parameters),
      contextId: context.conversationId
    }, 'Calling tool via WebSocket JSON-RPC');

    try {
      // Make JSON-RPC call with retry logic
      const result = await withRetry(
        () => agentConn.connection.sendRequest(this.CallTool, {
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

      this.logger.info({
        agentId,
        toolName,
        success: true
      }, 'WebSocket tool call completed successfully');

      return result;

    } catch (error) {
      this.logger.error({
        agentId,
        toolName,
        error: error instanceof Error ? error.message : String(error)
      }, 'WebSocket tool call failed');

      // Mark agent as unhealthy if connection error
      if (this.isConnectionError(error)) {
        agentConn.healthy = false;
      }

      throw error;
    }
  }

  /**
   * Get list of tools from an agent
   */
  async getAgentTools(agentId: string): Promise<ToolDefinition[]> {
    const agentConn = this.agentConnections.get(agentId);
    if (!agentConn || !agentConn.healthy) {
      throw new ServiceError(
        `Agent not available: ${agentId}`,
        ErrorCode.SERVICE_UNAVAILABLE,
        { service: 'simple-websocket-mcp-client', operation: 'getAgentTools' }
      );
    }

    try {
      const response = await agentConn.connection.sendRequest(this.ListTools, {});
      return response.tools;
    } catch (error) {
      this.logger.error({ agentId, error: error.message }, 'Failed to get agent tools');
      // Fallback to cached capabilities
      return agentConn.capabilities.tools || [];
    }
  }

  /**
   * Perform health check on an agent
   */
  async healthCheck(agentId: string): Promise<{ healthy: boolean; details?: any }> {
    const agentConn = this.agentConnections.get(agentId);
    if (!agentConn) {
      return { healthy: false, details: { error: 'Agent not connected' } };
    }

    try {
      const response = await agentConn.connection.sendRequest(this.HealthCheck, {});
      agentConn.healthy = response.healthy;
      agentConn.lastHeartbeat = new Date();
      return response;
    } catch (error) {
      agentConn.healthy = false;
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
    return Array.from(this.agentConnections.entries())
      .filter(([, conn]) => conn.healthy)
      .map(([agentId]) => agentId);
  }

  /**
   * Get agent capabilities
   */
  getAgentCapabilities(agentId: string): AgentCapabilities | null {
    const agentConn = this.agentConnections.get(agentId);
    return agentConn?.capabilities || null;
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
   * Disconnect from an agent
   */
  async disconnect(agentId: string): Promise<void> {
    const agentConn = this.agentConnections.get(agentId);
    if (!agentConn) return;

    this.logger.info({ agentId }, 'Disconnecting from agent');

    if (agentConn.socket && agentConn.socket.readyState === WebSocket.OPEN) {
      agentConn.socket.close();
    }

    this.agentConnections.delete(agentId);
  }

  /**
   * Disconnect from all agents and cleanup
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up WebSocket MCP client');

    const cleanupPromises = Array.from(this.agentConnections.keys()).map(
      agentId => this.disconnect(agentId)
    );

    await Promise.all(cleanupPromises);
    
    this.logger.info('WebSocket MCP client cleanup completed');
  }
}