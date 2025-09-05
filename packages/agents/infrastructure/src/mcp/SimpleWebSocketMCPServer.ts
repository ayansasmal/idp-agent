import WebSocket, { WebSocketServer } from 'ws';
import {
  createMessageConnection,
  RequestType,
  NotificationType
} from 'vscode-jsonrpc';
import { Logger } from 'pino';
import type { ConversationContext } from '@ai-idp/types';
import { StandardInfrastructureAgent } from './StandardInfrastructureAgent';

/**
 * Simple WebSocket MCP Server for Infrastructure Agent
 * 
 * Based on the clean pattern from the documentation:
 * - WebSocket server listening on specified port
 * - JSON-RPC 2.0 over WebSocket
 * - Simple request/response pattern
 * - Built-in heartbeat monitoring
 */
export class SimpleWebSocketMCPServer {
  private wss: WebSocketServer | null = null;
  private standardAgent: StandardInfrastructureAgent;
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

  constructor(standardAgent: StandardInfrastructureAgent, logger: Logger) {
    this.standardAgent = standardAgent;
    this.logger = logger.child({ component: 'SimpleWebSocketMCPServer' });
  }

  /**
   * Start the WebSocket server
   */
  async start(port: number = 3003): Promise<void> {
    try {
      this.logger.info({ port }, 'Starting simple WebSocket MCP server');

      // Create WebSocket server
      this.wss = new WebSocketServer({ 
        port,
        path: '/mcp'
      });

      // Handle new connections
      this.wss.on('connection', (socket: WebSocket) => {
        this.handleNewClient(socket);
      });

      this.wss.on('error', (error) => {
        this.logger.error({ error: error.message }, 'WebSocket server error');
      });

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring();

      this.logger.info({ port }, 'Simple WebSocket MCP server started successfully');
    } catch (error) {
      this.logger.error(error, 'Failed to start simple WebSocket MCP server');
      throw error;
    }
  }

  /**
   * Handle new client connection
   * @private
   */
  private handleNewClient(socket: WebSocket): void {
    const clientId = this.generateClientId();
    
    try {
      this.logger.info({ clientId }, 'New WebSocket client connected');

      // Create proper message reader/writer for WebSocket
      const messageReader = {
        listen: (callback: (message: any) => void) => {
          socket.on('message', (data: Buffer) => {
            try {
              const message = JSON.parse(data.toString());
              callback(message);
            } catch (error) {
              this.logger.error({ clientId, error: error.message }, 'Failed to parse JSON-RPC message');
            }
          });
        },
        onClose: (callback: () => void) => {
          socket.on('close', callback);
        },
        onError: (callback: (error: Error) => void) => {
          socket.on('error', callback);
        }
      };

      const messageWriter = {
        write: (message: any) => {
          try {
            const data = JSON.stringify(message);
            socket.send(data);
            return Promise.resolve();
          } catch (error) {
            this.logger.error({ clientId, error: error.message }, 'Failed to send JSON-RPC message');
            return Promise.reject(error);
          }
        },
        onClose: (callback: () => void) => {
          socket.on('close', callback);
        },
        onError: (callback: (error: Error) => void) => {
          socket.on('error', callback);
        }
      };

      // Create JSON-RPC connection
      const connection = createMessageConnection(messageReader as any, messageWriter as any);

      // Register client
      this.clients.set(clientId, {
        socket,
        connection,
        lastHeartbeat: new Date()
      });

      // Setup JSON-RPC handlers
      this.setupRequestHandlers(clientId, connection);

      // Start listening for messages
      connection.listen();

      // Setup WebSocket event handlers
      this.setupSocketHandlers(clientId, socket);

      this.logger.info({ 
        clientId, 
        totalClients: this.clients.size 
      }, 'WebSocket client registered successfully');

    } catch (error) {
      this.logger.error({ 
        clientId, 
        error: error.message 
      }, 'Failed to setup WebSocket client');
      socket.close();
    }
  }

  /**
   * Setup JSON-RPC request handlers
   * @private
   */
  private setupRequestHandlers(clientId: string, connection: any): void {
    // Handle tools/list requests
    connection.onRequest(this.ListTools, async () => {
      try {
        const capabilities = this.standardAgent.getCapabilities();
        
        this.logger.debug({ 
          clientId, 
          toolCount: capabilities.tools.length 
        }, 'Sending tools list');
        
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
        this.logger.info({ 
          clientId, 
          toolName, 
          args: Object.keys(args || {}) 
        }, 'Received tool call');

        // Get tool handlers from standard agent
        const toolHandlers = this.standardAgent.getToolHandlers();
        const handler = toolHandlers[toolName];

        if (!handler) {
          // Return structured error response instead of throwing
          return {
            success: false,
            message: `Unknown tool: ${toolName}`,
            data: { 
              error: `Tool '${toolName}' is not available`,
              availableTools: Object.keys(toolHandlers)
            },
            metadata: {
              tool: toolName,
              executionTime: 0,
              clientId
            }
          };
        }

        // Create context if not provided
        const context: ConversationContext = args?.context || {
          conversationId: `ws-${clientId}-${Date.now()}`,
          userId: 'websocket-user',
          sessionId: `ws-session-${clientId}`,
          history: [],
          metadata: { clientId, transport: 'websocket' }
        };

        // Execute tool
        const startTime = Date.now();
        const result = await handler(args, context);
        const executionTime = Date.now() - startTime;

        this.logger.info({ 
          clientId, 
          toolName, 
          executionTime,
          success: !!result
        }, 'Tool call completed');

        return result;

      } catch (error) {
        this.logger.error({ 
          clientId, 
          toolName, 
          error: error.message 
        }, 'Tool call failed');
        
        // Return structured error response
        return {
          success: false,
          message: `Tool call failed: ${error.message}`,
          data: { error: error.message },
          metadata: {
            tool: toolName,
            executionTime: 0,
            clientId
          }
        };
      }
    });

    // Handle health check requests
    connection.onRequest(this.HealthCheck, async () => {
      try {
        const health = await this.standardAgent.healthCheck();
        
        this.logger.debug({ 
          clientId, 
          healthy: health.healthy 
        }, 'Health check requested');
        
        return {
          ...health,
          timestamp: new Date().toISOString(),
          serverInfo: {
            clientCount: this.clients.size,
            uptime: process.uptime()
          }
        };
      } catch (error) {
        this.logger.error({ clientId, error: error.message }, 'Health check failed');
        return {
          healthy: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Handle heartbeat notifications
    connection.onNotification(this.HeartbeatNotification, (params: { timestamp: number }) => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastHeartbeat = new Date();
        this.logger.debug({ 
          clientId, 
          clientTimestamp: params.timestamp 
        }, 'Received heartbeat from client');
      }
    });
  }

  /**
   * Setup WebSocket event handlers
   * @private
   */
  private setupSocketHandlers(clientId: string, socket: WebSocket): void {
    socket.on('close', () => {
      this.logger.info({ clientId }, 'WebSocket client disconnected');
      this.clients.delete(clientId);
    });

    socket.on('error', (error) => {
      this.logger.error({ 
        clientId, 
        error: error.message 
      }, 'WebSocket client error');
      this.clients.delete(clientId);
    });

    socket.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastHeartbeat = new Date();
        this.logger.debug({ clientId }, 'Received pong from client');
      }
    });
  }

  /**
   * Start heartbeat monitoring
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
            timeSinceLastHeartbeat
          }, 'Client heartbeat timeout, removing stale connection');
          
          try {
            client.socket.close();
          } catch (error) {
            // Expected if socket already closed
          }
          
          this.clients.delete(clientId);
        } else {
          // Send heartbeat ping
          try {
            if (client.socket.readyState === WebSocket.OPEN) {
              client.socket.ping();
              
              // Send JSON-RPC heartbeat notification
              client.connection.sendNotification(this.HeartbeatNotification, {
                timestamp: Date.now()
              });
            }
          } catch (error) {
            this.logger.warn({ 
              clientId, 
              error: error.message 
            }, 'Failed to send heartbeat');
          }
        }
      }

      this.logger.debug({ 
        activeClients: this.clients.size 
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
   * Stop the server
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping simple WebSocket MCP server');

      // Close all client connections
      for (const [clientId, client] of this.clients.entries()) {
        try {
          client.socket.close();
          this.logger.debug({ clientId }, 'Closed client connection');
        } catch (error) {
          // Expected
        }
      }

      this.clients.clear();

      // Close WebSocket server
      if (this.wss) {
        await new Promise<void>((resolve, reject) => {
          this.wss!.close((error) => {
            if (error) {
              this.logger.error({ error: error.message }, 'Error closing server');
              reject(error);
            } else {
              this.logger.info('Simple WebSocket MCP server stopped');
              resolve();
            }
          });
        });
        
        this.wss = null;
      }

    } catch (error) {
      this.logger.error(error, 'Failed to stop simple WebSocket MCP server');
      throw error;
    }
  }
}