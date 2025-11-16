import WebSocket, { WebSocketServer } from 'ws';
import {
  createMessageConnection,
  RequestType,
  NotificationType,
} from 'vscode-jsonrpc';
import { Logger } from 'pino';
import type { ConversationContext } from '@ai-idp/types';
import { InfrastructureAgent } from '../agent/InfrastructureAgent';

/**
 * WebSocket MCP Server for Infrastructure Agent
 * 
 * Exposes Infrastructure Agent capabilities as WebSocket + JSON-RPC 2.0 endpoints
 * for reliable bidirectional communication with the Meta-Agent.
 * 
 * Features:
 * - WebSocket-based persistent connections
 * - JSON-RPC 2.0 protocol for structured communication
 * - Heartbeat monitoring for connection health
 * - Automatic client management and cleanup
 * 
 * @class WebSocketInfrastructureMCPServer
 * @since 1.2.0
 */
export class WebSocketInfrastructureMCPServer {
  private wss: WebSocketServer;
  private agent: InfrastructureAgent;
  private logger: Logger;
  private clients: Map<string, { socket: WebSocket; connection: any; lastHeartbeat: Date }> = new Map();

  // Define JSON-RPC request types
  private readonly ListTools = new RequestType<{}, { tools: any[] }, void>('tools/list');
  private readonly CallTool = new RequestType<
    { name: string; arguments: Record<string, any> },
    any,
    void
  >('tools/call');
  private readonly HealthCheck = new RequestType<{}, { healthy: boolean }, void>('health/check');

  // Define notification types
  private readonly HeartbeatNotification = new NotificationType<{ timestamp: number }>('heartbeat');

  constructor(agent: InfrastructureAgent, logger: Logger) {
    this.agent = agent;
    this.logger = logger.child({ component: 'WebSocketInfrastructureMCPServer' });
  }

  /**
   * Start the WebSocket MCP server
   */
  async start(port: number = 3003): Promise<void> {
    try {
      // Create WebSocket server
      this.wss = new WebSocketServer({ 
        port,
        path: '/mcp',
        perMessageDeflate: false // Disable compression for JSON-RPC reliability
      });

      this.logger.info({ port }, 'Starting WebSocket MCP server');

      // Handle WebSocket connections
      this.wss.on('connection', (socket: WebSocket, request) => {
        const clientId = this.generateClientId();
        this.logger.info({ clientId, remoteAddress: request.socket.remoteAddress }, 'New WebSocket MCP client connected');

        try {
          // Create JSON-RPC connection
          const connection = createMessageConnection(socket as any, socket as any);

          // Register client
          this.clients.set(clientId, {
            socket,
            connection,
            lastHeartbeat: new Date()
          });

          // Setup JSON-RPC handlers
          this.setupConnectionHandlers(clientId, connection);

          // Start listening for JSON-RPC messages
          connection.listen();

          // Setup WebSocket event handlers
          this.setupWebSocketHandlers(clientId, socket);

          // Send initial server capabilities notification
          this.sendServerCapabilities(connection);

          this.logger.info({ clientId, totalClients: this.clients.size }, 'WebSocket MCP client registered successfully');

        } catch (error) {
          this.logger.error({ clientId, error: error.message }, 'Failed to setup WebSocket MCP client');
          socket.close();
        }
      });

      this.wss.on('error', (error) => {
        this.logger.error({ error: error.message }, 'WebSocket server error');
      });

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring();

      this.logger.info({ port }, 'WebSocket Infrastructure MCP Server started successfully');
    } catch (error) {
      this.logger.error(error, 'Failed to start WebSocket Infrastructure MCP Server');
      throw error;
    }
  }

  /**
   * Setup JSON-RPC connection handlers
   * @private
   */
  private setupConnectionHandlers(clientId: string, connection: any): void {
    // Handle tools/list requests
    connection.onRequest(this.ListTools, async () => {
      try {
        const capabilities = this.agent.getCapabilities();
        this.logger.debug({ clientId, toolCount: capabilities.tools.length }, 'Sending tools list');
        
        return {
          tools: capabilities.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.parameters
          }))
        };
      } catch (error) {
        this.logger.error({ clientId, error: error.message }, 'Failed to list tools');
        throw error;
      }
    });

    // Handle tools/call requests
    connection.onRequest(this.CallTool, async (params) => {
      const { name: toolName, arguments: args } = params;
      
      try {
        this.logger.info({ clientId, toolName, args: Object.keys(args || {}) }, 'Received tool call via WebSocket JSON-RPC');

        // Add context if not provided
        const context: ConversationContext = args?.context || {
          conversationId: `ws-${clientId}-${Date.now()}`,
          userId: 'websocket-user',
          sessionId: `ws-session-${clientId}`,
          history: [],
          metadata: { clientId, transport: 'websocket' }
        };

        const argsWithContext = { ...args, context };

        // Route to appropriate agent method
        let result;
        switch (toolName) {
          case 'deployApplication':
            result = await this.agent.deployApplication(argsWithContext);
            break;
          case 'scaleResource':
            result = await this.agent.scaleResource(argsWithContext);
            break;
          case 'getResourceStatus':
            result = await this.agent.getResourceStatus(argsWithContext);
            break;
          case 'getResourceLogs':
            result = await this.agent.getResourceLogs(argsWithContext);
            break;
          case 'provisionDatabase':
            result = await this.agent.provisionDatabase(argsWithContext);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        this.logger.info({ 
          clientId, 
          toolName, 
          success: result.success, 
          executionTime: result.metadata?.executionTime 
        }, 'Tool call completed successfully');

        return result;

      } catch (error) {
        this.logger.error({ clientId, toolName, error: error.message }, 'Tool call failed');
        
        // Return structured error response
        return {
          success: false,
          message: `Tool call failed: ${error.message}`,
          data: { error: error.message },
          metadata: {
            tool: toolName,
            agent: 'infrastructure',
            executionTime: 0,
            clientId
          }
        };
      }
    });

    // Handle health check requests
    connection.onRequest(this.HealthCheck, async () => {
      try {
        const health = await this.agent.healthCheck();
        this.logger.debug({ clientId, healthy: health.healthy }, 'Health check requested');
        
        return {
          healthy: health.healthy,
          details: health.details,
          timestamp: new Date().toISOString(),
          agent: 'infrastructure'
        };
      } catch (error) {
        this.logger.error({ clientId, error: error.message }, 'Health check failed');
        return {
          healthy: false,
          error: error.message,
          timestamp: new Date().toISOString(),
          agent: 'infrastructure'
        };
      }
    });

    // Handle heartbeat notifications from client
    connection.onNotification(this.HeartbeatNotification, (params: { timestamp: number }) => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastHeartbeat = new Date();
        this.logger.debug({ clientId, clientTimestamp: params.timestamp }, 'Received heartbeat from client');
      }
    });
  }

  /**
   * Setup WebSocket event handlers
   * @private
   */
  private setupWebSocketHandlers(clientId: string, socket: WebSocket): void {
    socket.on('close', () => {
      this.logger.info({ clientId }, 'WebSocket MCP client disconnected');
      this.clients.delete(clientId);
    });

    socket.on('error', (error) => {
      this.logger.error({ clientId, error: error.message }, 'WebSocket client error');
      this.clients.delete(clientId);
    });

    socket.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastHeartbeat = new Date();
        this.logger.debug({ clientId }, 'Received WebSocket pong');
      }
    });
  }

  /**
   * Send server capabilities to a new client
   * @private
   */
  private sendServerCapabilities(connection: any): void {
    try {
      // Send initialization notification (MCP protocol)
      connection.sendNotification('notifications/initialized', {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            listChanged: true
          }
        },
        serverInfo: {
          name: 'infrastructure-agent',
          version: '1.0.0',
          transport: 'websocket-jsonrpc'
        }
      });

      this.logger.debug('Sent server capabilities to new client');
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to send server capabilities');
    }
  }

  /**
   * Start heartbeat monitoring for all clients
   * @private
   */
  private startHeartbeatMonitoring(): void {
    setInterval(() => {
      const now = new Date();
      const staleThreshold = 90000; // 90 seconds

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceLastHeartbeat = now.getTime() - client.lastHeartbeat.getTime();

        if (timeSinceLastHeartbeat > staleThreshold) {
          this.logger.warn({ 
            clientId, 
            timeSinceLastHeartbeat,
            staleThreshold 
          }, 'Client heartbeat timeout, removing stale connection');
          
          try {
            client.socket.close();
          } catch (error) {
            this.logger.debug({ clientId }, 'Error closing stale socket (expected)');
          }
          
          this.clients.delete(clientId);
        } else {
          // Send ping to check connection
          try {
            if (client.socket.readyState === WebSocket.OPEN) {
              client.socket.ping();
              
              // Send JSON-RPC heartbeat notification
              client.connection.sendNotification(this.HeartbeatNotification, {
                timestamp: Date.now()
              });
              
              this.logger.debug({ clientId }, 'Sent heartbeat ping to client');
            }
          } catch (error) {
            this.logger.warn({ clientId, error: error.message }, 'Failed to send heartbeat ping');
          }
        }
      }

      this.logger.debug({ 
        activeClients: this.clients.size,
        staleThreshold 
      }, 'Heartbeat monitoring cycle completed');

    }, 30000); // Check every 30 seconds
  }

  /**
   * Generate unique client ID
   * @private
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Broadcast notification to all connected clients
   */
  async broadcastNotification(method: string, params: any): Promise<void> {
    const broadcastPromises = Array.from(this.clients.entries()).map(
      async ([clientId, client]) => {
        try {
          if (client.socket.readyState === WebSocket.OPEN) {
            client.connection.sendNotification(method, params);
            this.logger.debug({ clientId, method }, 'Sent notification to client');
          }
        } catch (error) {
          this.logger.warn({ clientId, method, error: error.message }, 'Failed to send notification to client');
        }
      }
    );

    await Promise.all(broadcastPromises);
    
    this.logger.info({ 
      method, 
      clientCount: this.clients.size 
    }, 'Broadcast notification completed');
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean;
    port?: number;
    clientCount: number;
    clients: string[];
  } {
    return {
      running: !!this.wss,
      port: this.wss?.options.port,
      clientCount: this.clients.size,
      clients: Array.from(this.clients.keys())
    };
  }

  /**
   * Stop the WebSocket MCP server
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping WebSocket MCP server');

      // Close all client connections
      for (const [clientId, client] of this.clients.entries()) {
        try {
          client.socket.close();
          this.logger.debug({ clientId }, 'Closed client connection');
        } catch (error) {
          this.logger.debug({ clientId }, 'Error closing client connection (expected)');
        }
      }

      this.clients.clear();

      // Close WebSocket server
      if (this.wss) {
        await new Promise<void>((resolve, reject) => {
          this.wss.close((error) => {
            if (error) {
              this.logger.error({ error: error.message }, 'Error closing WebSocket server');
              reject(error);
            } else {
              this.logger.info('WebSocket MCP server stopped successfully');
              resolve();
            }
          });
        });
      }

    } catch (error) {
      this.logger.error(error, 'Failed to stop WebSocket MCP server');
      throw error;
    }
  }
}