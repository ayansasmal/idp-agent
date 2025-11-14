import WebSocket, { WebSocketServer } from 'ws';
import { PassThrough } from 'stream';
import {
  createMessageConnection,
  MessageConnection
} from 'vscode-jsonrpc';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import {
  createLogger,
  ServiceError,
  ErrorCode,
  type ServiceLoggerConfig, type Logger
} from '@ai-idp/utils';
import type {
  AgentCapabilities,
  ToolDefinition,
  ConversationContext
} from '@ai-idp/types';
import { z } from 'zod';
import {
  AgentCommunicationConfig,
  DEFAULT_AGENT_COMMUNICATION_CONFIG
} from './AgentCommunicationClient';

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  parameters: Record<string, any>,
  context?: ConversationContext
) => Promise<any>;

/**
 * Smart defaults generator function signature
 */
export type DefaultsGenerator = (
  providedArgs: Record<string, any>,
  context?: ConversationContext
) => Record<string, any> | Promise<Record<string, any>>;

/**
 * Tool call response for pending confirmation
 */
export interface PendingConfirmationResponse {
  status: 'pending_confirmation';
  toolName: string;
  assumptions: Record<string, any>;
  message: string;
  confirmationPrompt: string;
  validationErrors?: string[];
}

/**
 * Tool call response for successful execution
 */
export interface SuccessfulToolResponse {
  status: 'success';
  result: any;
  executionTime: number;
  toolName: string;
}

/**
 * Tool call response for errors
 */
export interface ErrorToolResponse {
  status: 'error';
  message: string;
  error: any;
  toolName: string;
}

/**
 * Union type for all possible tool call responses
 */
export type ToolCallResponse = PendingConfirmationResponse | SuccessfulToolResponse | ErrorToolResponse;

/**
 * Custom confirmation message generator function signature
 */
export type ConfirmationMessageGenerator = (
  toolName: string,
  assumptions: Record<string, any>
) => string;

/**
 * Enhanced tool handler with parameter validation and smart defaults
 */
export interface EnhancedToolHandler {
  /** Original tool handler function */
  handler: ToolHandler;
  /** Zod schema for parameter validation */
  schema: z.ZodSchema;
  /** Smart defaults generator function */
  defaultsGenerator?: DefaultsGenerator;
  /** Whether confirmation is required for this tool */
  requiresConfirmation?: boolean;
  /** Human-readable description for confirmation prompts */
  description?: string;
  /** Custom confirmation message generator (optional) */
  confirmationMessageGenerator?: ConfirmationMessageGenerator;
}

/**
 * Agent implementation interface for standardized communication server
 */
export interface AgentImplementation {
  /** Agent capabilities including tools and metadata */
  getCapabilities(): AgentCapabilities;

  /** Health check method */
  healthCheck(): Promise<{ healthy: boolean; details?: any }>;

  /** Tool handlers mapped by tool name */
  getToolHandlers(): Record<string, ToolHandler>;

  /** Enhanced tool handlers with validation and smart defaults (optional) */
  getEnhancedToolHandlers?(): Record<string, EnhancedToolHandler>;
}

/**
 * Connected client information
 */
interface ConnectedClient {
  id: string;
  socket: WebSocket;
  connection: MessageConnection;
  lastHeartbeat: Date;
  metadata: {
    remoteAddress?: string;
    userAgent?: string;
    connectedAt: Date;
  };
}

/**
 * Standardized Agent Communication Server
 * 
 * Provides a consistent WebSocket + JSON-RPC 2.0 server interface that any agent
 * can use to expose its capabilities to other agents in the system.
 * 
 * @class AgentCommunicationServer
 * @since 1.0.0
 * 
 * @example Basic Usage
 * ```typescript
 * class MyAgent implements AgentImplementation {
 *   getCapabilities() {
 *     return {
 *       agentId: 'my-agent',
 *       name: 'My Agent',
 *       tools: [{ name: 'myTool', description: 'Does something', parameters: {} }]
 *       // ...
 *     };
 *   }
 * 
 *   async healthCheck() {
 *     return { healthy: true };
 *   }
 * 
 *   getToolHandlers() {
 *     return {
 *       myTool: async (params, context) => {
 *         // Tool implementation
 *         return { success: true, data: 'result' };
 *       }
 *     };
 *   }
 * }
 * 
 * const agent = new MyAgent();
 * const server = new AgentCommunicationServer(agent);
 * await server.start(3003);
 * ```
 */
export class AgentCommunicationServer {
  private wss: WebSocketServer | null = null;
  private agent: AgentImplementation;
  private config: AgentCommunicationConfig;
  private logger: Logger;
  private clients: Map<string, ConnectedClient> = new Map();
  private toolHandlers: Record<string, ToolHandler>;
  private enhancedToolHandlers: Record<string, EnhancedToolHandler>;

  constructor(
    agent: AgentImplementation,
    config: Partial<AgentCommunicationConfig> = {},
    loggerConfig?: Partial<ServiceLoggerConfig>
  ) {
    this.agent = agent;
    this.config = { ...DEFAULT_AGENT_COMMUNICATION_CONFIG, ...config };
    this.toolHandlers = agent.getToolHandlers();

    // Initialize enhanced tool handlers if available
    this.enhancedToolHandlers = agent.getEnhancedToolHandlers?.() || {};

    this.logger = createLogger({
      service: 'agent-communication-server',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development',
      ...loggerConfig
    });
  }

  /**
   * Start the WebSocket server
   */
  async start(port: number = 3003, path: string = '/mcp'): Promise<void> {
    try {
      this.logger.info({ port, path }, 'Starting agent communication server');

      // Create WebSocket server
      this.wss = new WebSocketServer({
        port,
        path,
        perMessageDeflate: false // Better reliability for JSON-RPC
      });

      // Handle new connections
      this.wss.on('connection', (socket: WebSocket, request) => {
        this.handleNewClient(socket, request);
      });

      this.wss.on('error', (error) => {
        this.logger.error({ error }, 'WebSocket server error');
      });

      // Start periodic client health monitoring
      this.startHealthMonitoring();

      this.logger.info({ port, path }, 'Agent communication server started successfully');
    } catch (error) {
      this.logger.error(error, 'Failed to start agent communication server');
      throw error;
    }
  }

  /**
   * Handle new client connection
   * @private
   */
  private handleNewClient(socket: WebSocket, request: any): void {
    const clientId = this.generateClientId();

    try {
      this.logger.info({
        clientId,
        remoteAddress: request.socket.remoteAddress
      }, 'New client connected');

      this.logger.debug({ clientId }, 'Creating JSON-RPC connection');
      
      // Create stream adapters for WebSocket compatibility with vscode-jsonrpc
      const reader = new PassThrough({ objectMode: false });
      const writer = new PassThrough({ objectMode: false });
      
      // Bridge WebSocket messages to streams
      socket.on('message', (data) => {
        reader.write(data);
      });
      
      writer.on('data', (data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(data);
        }
      });
      
      // Handle WebSocket closure
      socket.on('close', () => {
        reader.end();
        writer.end();
      });
      
      // Create JSON-RPC connection using stream adapters
      const messageReader = new StreamMessageReader(reader);
      const messageWriter = new StreamMessageWriter(writer);
      const connection = createMessageConnection(messageReader, messageWriter);
      
      this.logger.debug({ clientId }, 'JSON-RPC connection created with WebSocket stream adapters');

      // Create client record
      const client: ConnectedClient = {
        id: clientId,
        socket,
        connection,
        lastHeartbeat: new Date(),
        metadata: {
          remoteAddress: request.socket.remoteAddress,
          userAgent: request.headers['user-agent'],
          connectedAt: new Date()
        }
      };

      this.logger.debug({ clientId }, 'Client record created, registering client');
      // Register client
      this.clients.set(clientId, client);

      this.logger.debug({ clientId }, 'Setting up client handlers');
      // Setup handlers
      this.setupClientHandlers(client);

      this.logger.debug({ clientId }, 'Starting JSON-RPC listener');
      // Start listening for messages
      connection.listen();

      this.logger.debug({ clientId }, 'Sending server initialization');
      // Send server initialization
      this.sendServerInitialization(client);

      this.logger.info({
        clientId,
        totalClients: this.clients.size
      }, 'Client registered successfully');

    } catch (error) {
      this.logger.error({
        clientId,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      }, 'Failed to setup new client');
      socket.close();
    }
  }

  /**
   * Process tool call with parameter validation and smart defaults
   * @private
   */
  private async processToolCall(
    toolName: string,
    args: Record<string, any>,
    context: ConversationContext,
    clientId: string
  ): Promise<ToolCallResponse> {
    const startTime = Date.now();

    try {
      // Check if enhanced tool handler exists
      const enhancedHandler = this.enhancedToolHandlers[toolName];

      if (enhancedHandler) {
        // Use enhanced handler with validation and smart defaults
        return await this.processEnhancedToolCall(enhancedHandler, toolName, args, context, clientId);
      } else {
        // Fall back to legacy handler
        const handler = this.toolHandlers[toolName];
        if (!handler) {
          return {
            status: 'error',
            message: `Unknown tool: ${toolName}`,
            error: { code: 'TOOL_NOT_FOUND', toolName },
            toolName
          };
        }

        const result = await handler(args, context);
        const executionTime = Date.now() - startTime;

        return {
          status: 'success',
          result,
          executionTime,
          toolName
        };
      }
    } catch (error: any) {
      return {
        status: 'error',
        message: `Tool call failed: ${error.message}`,
        error,
        toolName
      };
    }
  }

  /**
   * Process enhanced tool call with validation and confirmation
   * @private
   */
  private async processEnhancedToolCall(
    enhancedHandler: EnhancedToolHandler,
    toolName: string,
    args: Record<string, any>,
    context: ConversationContext,
    clientId: string
  ): Promise<ToolCallResponse> {
    const startTime = Date.now();

    try {
      // Step 1: Validate provided parameters
      const validation = enhancedHandler.schema.safeParse(args);

      if (!validation.success) {
        // Step 2: Apply smart defaults for missing/invalid parameters
        let assumedArgs = { ...args };

        if (enhancedHandler.defaultsGenerator) {
          const generatedDefaults = await enhancedHandler.defaultsGenerator(args, context);
          assumedArgs = { ...assumedArgs, ...generatedDefaults };
        }

        // Step 3: Re-validate with defaults applied
        const revalidation = enhancedHandler.schema.safeParse(assumedArgs);

        if (!revalidation.success || enhancedHandler.requiresConfirmation) {
          // Step 4: Return confirmation request
          const validationErrors = validation.success ? [] : validation.error.errors.map(err =>
            `${err.path.join('.')}: ${err.message}`
          );

          // Generate custom confirmation message
          let confirmationMessage = `Ready to execute ${enhancedHandler.description || toolName} with these settings:`;

          if (enhancedHandler.confirmationMessageGenerator) {
            try {
              confirmationMessage = enhancedHandler.confirmationMessageGenerator(toolName, assumedArgs);
            } catch (error) {
              // Fallback to default message if custom generator fails
              this.logger.warn({ error }, 'Failed to generate custom confirmation message');
            }
          }

          return {
            status: 'pending_confirmation',
            toolName,
            assumptions: assumedArgs,
            message: confirmationMessage,
            confirmationPrompt: 'Proceed with these settings? (y/n) or specify changes:',
            validationErrors: validationErrors.length > 0 ? validationErrors : undefined
          };
        }

        // Use validated arguments with defaults
        args = revalidation.data;
      } else {
        // Use provided arguments (already valid)
        args = validation.data;
      }

      // Step 5: Execute tool with validated parameters
      const result = await enhancedHandler.handler(args, context);
      const executionTime = Date.now() - startTime;

      this.logger.info({
        clientId,
        toolName,
        executionTime,
        success: true
      }, 'Enhanced tool call completed successfully');

      return {
        status: 'success',
        result,
        executionTime,
        toolName
      };

    } catch (error: any) {
      this.logger.error({
        clientId,
        toolName,
        error
      }, 'Enhanced tool call failed');

      return {
        status: 'error',
        message: `Tool call failed: ${error.message}`,
        error,
        toolName
      };
    }
  }

  /**
   * Setup JSON-RPC handlers for a client
   * @private
   */
  private setupClientHandlers(client: ConnectedClient): void {
    const { connection, socket, id: clientId } = client;

    // Handle tools/list requests
    connection.onRequest('tools/list', async () => {
      try {
        const capabilities = this.agent.getCapabilities();

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
        this.logger.error({ clientId, error }, 'Failed to list tools');
        throw error;
      }
    });

    // Handle tools/call requests
    connection.onRequest('tools/call', async (params) => {
      const { name: toolName, arguments: args } = params;

      try {
        this.logger.info({
          clientId,
          toolName,
          args: Object.keys(args || {})
        }, 'Received tool call');

        // Create context if not provided
        const context: ConversationContext = args?.context || {
          conversationId: `server-${clientId}-${Date.now()}`,
          userId: 'agent-communication-user',
          sessionId: `server-session-${clientId}`,
          history: [],
          metadata: {
            clientId,
            transport: 'agent-communication',
            remoteAddress: client.metadata.remoteAddress
          }
        };

        // Use new parameter validation pipeline
        const response = await this.processToolCall(toolName, args, context, clientId);

        // Convert ToolCallResponse to legacy format for backward compatibility
        if (response.status === 'success') {
          return response.result;
        } else if (response.status === 'pending_confirmation') {
          // Return confirmation request
          return {
            success: false,
            status: 'pending_confirmation',
            message: response.message,
            assumptions: response.assumptions,
            confirmationPrompt: response.confirmationPrompt,
            validationErrors: response.validationErrors,
            toolName: response.toolName
          };
        } else {
          // Return error
          return {
            success: false,
            message: response.message,
            error: response.error,
            toolName: response.toolName
          };
        }

      } catch (error: any) {
        this.logger.error({
          clientId,
          toolName,
          error
        }, 'Tool call failed');

        // Return structured error response
        return {
          success: false,
          message: `Tool call failed: ${error.message}`,
          data: { error },
          metadata: {
            tool: toolName,
            executionTime: 0,
            clientId
          }
        };
      }
    });

    // Handle health check requests
    connection.onRequest('health/check', async () => {
      try {
        const health = await this.agent.healthCheck();

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
        this.logger.error({ clientId, error }, 'Health check failed');
        return {
          healthy: false,
          error,
          timestamp: new Date().toISOString()
        };
      }
    });

    // Handle capabilities requests
    connection.onRequest('agent/capabilities', async () => {
      try {
        const capabilities = this.agent.getCapabilities();
        this.logger.debug({ clientId }, 'Sending agent capabilities');
        return capabilities;
      } catch (error) {
        this.logger.error({ clientId, error }, 'Failed to get capabilities');
        throw error;
      }
    });

    // Handle heartbeat notifications
    connection.onNotification('heartbeat', (params: { timestamp: number }) => {
      client.lastHeartbeat = new Date();
      this.logger.debug({
        clientId,
        clientTimestamp: params.timestamp
      }, 'Received heartbeat from client');
    });

    // Setup WebSocket event handlers
    socket.on('close', () => {
      this.logger.info({ clientId }, 'Client disconnected');
      this.clients.delete(clientId);
    });

    socket.on('error', (error) => {
      this.logger.error({
        clientId,
        error
      }, 'Client socket error');
      this.clients.delete(clientId);
    });

    socket.on('pong', () => {
      client.lastHeartbeat = new Date();
      this.logger.debug({ clientId }, 'Received pong from client');
    });
  }

  /**
   * Send server initialization notification to client
   * @private
   */
  private sendServerInitialization(client: ConnectedClient): void {
    try {
      this.logger.debug({ clientId: client.id }, 'Getting agent capabilities for initialization');
      const capabilities = this.agent.getCapabilities();
      
      this.logger.debug({ 
        clientId: client.id, 
        capabilitiesKeys: Object.keys(capabilities),
        toolsCount: capabilities.tools?.length || 0
      }, 'Retrieved agent capabilities');

      // Send MCP initialization notification
      client.connection.sendNotification('notifications/initialized', {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            listChanged: true
          }
        }
      });

      this.logger.debug({ clientId: client.id }, 'Sent server initialization');
    } catch (error) {
      this.logger.error({
        clientId: client.id,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error
      }, 'Failed to send server initialization');
      throw error; // Re-throw to trigger the outer catch block
    }
  }

  /**
   * Start health monitoring for connected clients
   * @private
   */
  private startHealthMonitoring(): void {
    const interval = this.config.heartbeatInterval;
    if (!interval) return;

    setInterval(() => {
      const now = new Date();
      const staleThreshold = this.config.healthCheckTimeout || 90000;

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
          // Send heartbeat ping
          try {
            if (client.socket.readyState === WebSocket.OPEN) {
              client.socket.ping();

              // Send JSON-RPC heartbeat notification
              client.connection.sendNotification('heartbeat', {
                timestamp: Date.now()
              });

              this.logger.debug({ clientId }, 'Sent heartbeat to client');
            }
          } catch (error) {
            this.logger.warn({
              clientId,
              error
            }, 'Failed to send heartbeat to client');
          }
        }
      }

      this.logger.debug({
        activeClients: this.clients.size,
        staleThreshold
      }, 'Health monitoring cycle completed');

    }, interval);
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
          this.logger.warn({
            clientId,
            method,
            error
          }, 'Failed to send notification to client');
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
    path?: string;
    clientCount: number;
    clients: Array<{
      id: string;
      connectedAt: Date;
      lastHeartbeat: Date;
      remoteAddress?: string;
    }>;
  } {
    return {
      running: !!this.wss,
      port: this.wss?.options.port,
      path: this.wss?.options.path,
      clientCount: this.clients.size,
      clients: Array.from(this.clients.values()).map(client => ({
        id: client.id,
        connectedAt: client.metadata.connectedAt,
        lastHeartbeat: client.lastHeartbeat,
        remoteAddress: client.metadata.remoteAddress
      }))
    };
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping agent communication server');

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
          this.wss!.close((error) => {
            if (error) {
              this.logger.error({ error }, 'Error closing server');
              reject(error);
            } else {
              this.logger.info('Agent communication server stopped successfully');
              resolve();
            }
          });
        });

        this.wss = null;
      }

    } catch (error) {
      this.logger.error(error, 'Failed to stop agent communication server');
      throw error;
    }
  }
}