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
      this.logger.error(error, 'Failed to start Infrastructure MCP Server');
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
      this.logger.error(error, 'Failed to stop Infrastructure MCP Server');
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

    // Handle tool calls (request object pattern)
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: tool, arguments: args } = request.params;

      // Validate required arguments for each tool
      let missing: string[] = [];
      let requestObj: any = {};
      const ctx = args?.context || {
        conversationId: `mcp-${Date.now()}`,
        userId: 'mcp-user',
        sessionId: `mcp-session-${Date.now()}`,
        history: [],
        metadata: {}
      };

      switch (tool) {
        case 'deployApplication':
          missing = ['resourceName', 'containerImage'].filter(k => !(args && args[k]));
          requestObj = {
            resourceName: args?.resourceName,
            containerImage: args?.containerImage,
            namespace: args?.namespace,
            replicas: args?.replicas,
            port: args?.port,
            environment: args?.environment,
            context: ctx
          };
          break;
        case 'scaleResource':
          missing = ['resourceName', 'replicas'].filter(k => !(args && args[k]));
          requestObj = {
            resourceName: args?.resourceName,
            replicas: args?.replicas,
            namespace: args?.namespace,
            resourceType: args?.resourceType,
            context: ctx
          };
          break;
        case 'getResourceStatus':
          missing = ['resourceName'].filter(k => !(args && args[k]));
          requestObj = {
            resourceName: args?.resourceName,
            namespace: args?.namespace,
            resourceType: args?.resourceType,
            context: ctx
          };
          break;
        case 'getResourceLogs':
          missing = ['resourceName'].filter(k => !(args && args[k]));
          requestObj = {
            resourceName: args?.resourceName,
            namespace: args?.namespace,
            lines: args?.lines,
            follow: args?.follow,
            context: ctx
          };
          break;
        case 'provisionDatabase':
          missing = ['databaseType', 'name'].filter(k => !(args && args[k]));
          requestObj = {
            databaseType: args?.databaseType,
            name: args?.name,
            size: args?.size,
            environment: args?.environment,
            context: ctx
          };
          break;
        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  message: `Unknown tool: ${tool}`,
                  data: {},
                  metadata: { tool, agent: 'infrastructure', executionTime: 0 }
                }, null, 2)
              }
            ],
            isError: true
          };
      }

      if (missing.length > 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: `Missing required arguments: ${missing.join(', ')}`,
                data: {},
                metadata: { tool, agent: 'infrastructure', executionTime: 0 }
              }, null, 2)
            }
          ],
          isError: true
        };
      }

      this.logger.info({ tool, args: requestObj }, `Received tool call: ${tool}`);

      try {
        let result;
        switch (tool) {
          case 'deployApplication':
            result = await this.agent.deployApplication(requestObj);
            break;
          case 'scaleResource':
            result = await this.agent.scaleResource(requestObj);
            break;
          case 'getResourceStatus':
            result = await this.agent.getResourceStatus(requestObj);
            break;
          case 'getResourceLogs':
            result = await this.agent.getResourceLogs(requestObj);
            break;
          case 'provisionDatabase':
            result = await this.agent.provisionDatabase(requestObj);
            break;
        }

        this.logger.info({ tool, success: result.success, executionTime: result.metadata?.executionTime }, `Tool call completed: ${tool}`);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        this.logger.error({ tool, error: error.message }, `Tool call failed: ${tool}`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                message: `Tool call failed: ${error.message}`,
                data: { error: error.message },
                metadata: {
                  tool,
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

      // Enhanced SSE endpoint for MCP client with bidirectional support via POST
      this.fastify.get('/mcp', async (request: any, reply: any) => {
        this.logger.info('MCP SSE connection established');
        
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET'
        });
        
        // MCP protocol: Send server initialization
        const serverInfo = {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {
                listChanged: true
              }
            },
            serverInfo: {
              name: 'infrastructure-agent',
              version: '1.0.0'
            }
          }
        };
        
        reply.raw.write(`data: ${JSON.stringify(serverInfo)}\n\n`);
        this.logger.info('MCP server initialization notification sent via SSE');
        
        // Send available tools notification
        const capabilities = this.agent.getCapabilities();
        const toolsList = {
          jsonrpc: '2.0',
          method: 'notifications/tools/list_changed',
          params: {
            tools: capabilities.tools
          }
        };
        
        reply.raw.write(`data: ${JSON.stringify(toolsList)}\n\n`);
        this.logger.info({ toolCount: capabilities.tools.length }, 'MCP tools list notification sent via SSE');
        
        // Keep connection alive with heartbeat
        const keepAlive = setInterval(() => {
          if (!reply.raw.destroyed) {
            reply.raw.write(': heartbeat\n\n');
          } else {
            clearInterval(keepAlive);
          }
        }, 30000);
        
        // Clean up on connection close
        request.raw.on('close', () => {
          this.logger.info('MCP SSE connection closed');
          clearInterval(keepAlive);
        });
        
        request.raw.on('error', (error) => {
          this.logger.error(error, 'MCP SSE connection error');
          clearInterval(keepAlive);
        });
        
        // Keep connection open for SSE
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
          this.logger.error(error, 'MCP request failed');
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
          this.logger.error(error, 'Direct tool call failed');
          reply.code(500);
          return { error: error.message };
        }
      });

      // Start server
      await this.fastify.listen({ port, host: '0.0.0.0' });

      this.logger.info(`Infrastructure HTTP Server started on port ${port}`);

    } catch (error) {
      this.logger.error(error, 'Failed to start Infrastructure HTTP Server');
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
      this.logger.error(error, 'Failed to stop Infrastructure HTTP Server');
    }
  }
}