import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Logger } from 'pino';
import type { ConversationContext } from '@ai-idp/types';
import { InfrastructureAgent } from '../agent/InfrastructureAgent';

/**
 * MCP Server for Infrastructure Agent
 * 
 * Exposes Infrastructure Agent capabilities as MCP tools for the Meta-Agent
 * to call via the Model Context Protocol
 */
export class InfrastructureMCPServer {
  private server: Server;
  private agent: InfrastructureAgent;
  private logger: Logger;

  constructor(agent: InfrastructureAgent, logger: Logger) {
    this.agent = agent;
    this.logger = logger.child({ component: 'InfrastructureMCPServer' });

    // Create MCP server
    this.server = new Server(
      {
        name: 'infrastructure-agent',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupToolHandlers();
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      this.logger.info('Infrastructure MCP Server started successfully');
    } catch (error) {
      this.logger.error('Failed to start Infrastructure MCP Server', { error });
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    try {
      await this.server.close();
      this.logger.info('Infrastructure MCP Server stopped');
    } catch (error) {
      this.logger.error('Failed to stop Infrastructure MCP Server', { error });
    }
  }

  /**
   * Setup MCP tool handlers
   */
  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const capabilities = this.agent.getCapabilities();
      
      return {
        tools: capabilities.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters
        }))
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.info('Received tool call', { 
        tool: name, 
        arguments: Object.keys(args || {}) 
      });

      try {
        // Add context to arguments for the agent methods
        const context: ConversationContext = args?.context || {
          conversationId: `mcp-${Date.now()}`,
          userId: 'mcp-user',
          sessionId: `mcp-session-${Date.now()}`,
          history: [],
          metadata: {}
        };

        const argsWithContext = { ...args, context };

        let result;

        // Route to appropriate agent method based on tool name
        switch (name) {
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
            throw new Error(`Unknown tool: ${name}`);
        }

        this.logger.info('Tool call completed', {
          tool: name,
          success: result.success,
          executionTime: result.metadata?.executionTime
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };

      } catch (error) {
        this.logger.error('Tool call failed', {
          tool: name,
          error: error.message
        });

        return {
          content: [
            {
              type: 'text', 
              text: JSON.stringify({
                success: false,
                message: `Tool call failed: ${error.message}`,
                data: { error: error.message },
                metadata: {
                  tool: name,
                  agent: 'infrastructure',
                  executionTime: 0
                }
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
  }
}

/**
 * HTTP MCP Server for Infrastructure Agent
 * Alternative to stdio transport for HTTP-based communication
 */
export class InfrastructureHTTPServer {
  private agent: InfrastructureAgent;
  private logger: Logger;
  private fastify: any;

  constructor(agent: InfrastructureAgent, logger: Logger) {
    this.agent = agent;
    this.logger = logger.child({ component: 'InfrastructureHTTPServer' });
  }

  /**
   * Start HTTP server
   */
  async start(port: number = 3001): Promise<void> {
    try {
      // Create Fastify instance
      this.fastify = require('fastify')({ logger: false });

      // Add CORS
      await this.fastify.register(require('@fastify/cors'), {
        origin: true,
        credentials: true
      });

      // Health check endpoint
      this.fastify.get('/health', async () => {
        const health = await this.agent.healthCheck();
        return {
          healthy: health.healthy,
          agent: 'infrastructure',
          timestamp: new Date().toISOString(),
          details: health.details
        };
      });

      // MCP endpoint
      this.fastify.post('/mcp', async (request: any, reply: any) => {
        try {
          const { method, params, id } = request.body;

          if (method === 'tools/list') {
            const capabilities = this.agent.getCapabilities();
            return {
              jsonrpc: '2.0',
              id,
              result: {
                tools: capabilities.tools
              }
            };
          }

          if (method === 'tools/call') {
            const { name, arguments: args } = params;

            // Add context if not provided
            const context: ConversationContext = args?.context || {
              conversationId: `http-${Date.now()}`,
              userId: 'http-user',
              sessionId: `http-session-${Date.now()}`,
              history: [],
              metadata: {}
            };

            const argsWithContext = { ...args, context };

            let result;

            // Route to appropriate method
            switch (name) {
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
                throw new Error(`Unknown tool: ${name}`);
            }

            return {
              jsonrpc: '2.0',
              id,
              result
            };
          }

          // Unknown method
          reply.code(400);
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: 'Method not found'
            }
          };

        } catch (error) {
          this.logger.error('MCP request failed', { error });
          reply.code(500);
          return {
            jsonrpc: '2.0',
            id: request.body?.id,
            error: {
              code: -32603,
              message: 'Internal error',
              data: { error: error.message }
            }
          };
        }
      });

      // Agent capabilities endpoint
      this.fastify.get('/capabilities', async () => {
        return this.agent.getCapabilities();
      });

      // Direct tool endpoints for testing
      this.fastify.post('/tools/:toolName', async (request: any, reply: any) => {
        try {
          const { toolName } = request.params;
          const args = request.body;

          // Add context
          const context: ConversationContext = args.context || {
            conversationId: `direct-${Date.now()}`,
            userId: 'direct-user',
            sessionId: `direct-session-${Date.now()}`,
            history: [],
            metadata: {}
          };

          const argsWithContext = { ...args, context };

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
              reply.code(404);
              return { error: `Tool not found: ${toolName}` };
          }

          return result;

        } catch (error) {
          this.logger.error('Direct tool call failed', { error });
          reply.code(500);
          return { error: error.message };
        }
      });

      // Start server
      await this.fastify.listen({ port, host: '0.0.0.0' });
      
      this.logger.info(`Infrastructure HTTP Server started on port ${port}`);

    } catch (error) {
      this.logger.error('Failed to start Infrastructure HTTP Server', { error });
      throw error;
    }
  }

  /**
   * Stop HTTP server
   */
  async stop(): Promise<void> {
    try {
      if (this.fastify) {
        await this.fastify.close();
        this.logger.info('Infrastructure HTTP Server stopped');
      }
    } catch (error) {
      this.logger.error('Failed to stop Infrastructure HTTP Server', { error });
    }
  }
}