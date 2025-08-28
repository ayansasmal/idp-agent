import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Logger } from 'pino';
import type { ConversationContext } from '@ai-idp/types';
import { ObservabilityAgent } from '../agent/ObservabilityAgent';

/**
 * MCP Server for Observability Agent
 * 
 * Exposes Observability Agent capabilities as MCP tools for the Meta-Agent
 * to call via the Model Context Protocol. Provides SLM-powered observability
 * operations including monitoring, incident management, and analytics.
 */
export class ObservabilityMCPServer {
  private server: Server;
  private agent: ObservabilityAgent;
  private logger: Logger;

  constructor(agent: ObservabilityAgent, logger: Logger) {
    this.agent = agent;
    this.logger = logger.child({ component: 'ObservabilityMCPServer' });

    // Create MCP server
    this.server = new Server(
      {
        name: 'observability-agent',
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

      this.logger.info('Observability MCP Server started successfully');
    } catch (error) {
      this.logger.error(error, 'Failed to start Observability MCP Server');
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    try {
      await this.server.close();
      this.logger.info('Observability MCP Server stopped');
    } catch (error) {
      this.logger.error(error, 'Failed to stop Observability MCP Server');
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
      const { tool, arguments: args, context } = request.params;

      // Validate required arguments for each tool
      let missing: string[] = [];
      let requestObj: any = {};
      const ctx = context || args?.context || {
        conversationId: `mcp-${Date.now()}`,
        userId: 'mcp-user',
        sessionId: `mcp-session-${Date.now()}`,
        history: [],
        metadata: {}
      };

      switch (tool) {
        case 'analyzeMetrics':
          missing = ['query', 'duration'].filter(k => !(args && args[k]));
          requestObj = {
            query: args?.query,
            duration: args?.duration,
            threshold: args?.threshold,
            context: ctx
          };
          break;
        case 'analyzeIncident':
          missing = ['alertId', 'symptoms'].filter(k => !(args && args[k]));
          requestObj = {
            alertId: args?.alertId,
            symptoms: args?.symptoms,
            timeRange: args?.timeRange,
            context: ctx
          };
          break;
        case 'analyzeLogs':
          missing = ['query', 'timeRange'].filter(k => !(args && args[k]));
          requestObj = {
            query: args?.query,
            timeRange: args?.timeRange,
            logLevel: args?.logLevel,
            service: args?.service,
            context: ctx
          };
          break;
        case 'createDashboard':
          missing = ['name', 'description'].filter(k => !(args && args[k]));
          requestObj = {
            name: args?.name,
            description: args?.description,
            services: args?.services,
            metrics: args?.metrics,
            context: ctx
          };
          break;
        case 'configureAlerts':
          missing = ['ruleName', 'condition', 'severity'].filter(k => !(args && args[k]));
          requestObj = {
            ruleName: args?.ruleName,
            condition: args?.condition,
            severity: args?.severity,
            notification: args?.notification,
            context: ctx
          };
          break;
        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  message: `Unknown tool: ${tool}`,
                  data: {},
                  metadata: { tool, agent: 'observability', executionTime: 0 }
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
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: `Missing required arguments: ${missing.join(', ')}`,
                data: {},
                metadata: { tool, agent: 'observability', executionTime: 0 }
              }, null, 2)
            }
          ],
          isError: true
        };
      }

      this.logger.info({ tool, args: requestObj }, `Received tool call: ${tool}`);

      try {
        let result;
        // Note: These methods would need to be implemented in ObservabilityAgent
        switch (tool) {
          case 'analyzeMetrics':
            result = { success: true, message: 'Metrics analysis not yet implemented', data: requestObj, metadata: { tool, agent: 'observability', executionTime: 100 } };
            break;
          case 'analyzeIncident':
            result = { success: true, message: 'Incident analysis not yet implemented', data: requestObj, metadata: { tool, agent: 'observability', executionTime: 100 } };
            break;
          case 'analyzeLogs':
            result = { success: true, message: 'Log analysis not yet implemented', data: requestObj, metadata: { tool, agent: 'observability', executionTime: 100 } };
            break;
          case 'createDashboard':
            result = { success: true, message: 'Dashboard creation not yet implemented', data: requestObj, metadata: { tool, agent: 'observability', executionTime: 100 } };
            break;
          case 'configureAlerts':
            result = { success: true, message: 'Alert configuration not yet implemented', data: requestObj, metadata: { tool, agent: 'observability', executionTime: 100 } };
            break;
        }

        this.logger.info({ tool, success: result.success, executionTime: result.metadata?.executionTime }, `Tool call completed: ${tool}`);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        this.logger.error({ tool, error: error.message }, `Tool call failed: ${tool}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: `Tool call failed: ${error.message}`,
                data: { error: error.message },
                metadata: {
                  tool,
                  agent: 'observability',
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
 * HTTP MCP Server for Observability Agent
 * Alternative to stdio transport for HTTP-based communication
 */
export class ObservabilityHTTPServer {
  private agent: ObservabilityAgent;
  private logger: Logger;
  private fastify: any;

  constructor(agent: ObservabilityAgent, logger: Logger) {
    this.agent = agent;
    this.logger = logger.child({ component: 'ObservabilityHTTPServer' });
  }

  /**
   * Start HTTP server
   */
  async start(port: number = 3004): Promise<void> {
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
          agent: 'observability',
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
              name: 'observability-agent',
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
      });

      // MCP endpoint for tool calls
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

            let result = {
              success: true,
              message: `${name} tool not yet implemented`,
              data: argsWithContext,
              metadata: {
                tool: name,
                agent: 'observability',
                executionTime: 100
              }
            };

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

          const result = {
            success: true,
            message: `${toolName} tool executed successfully (placeholder)`,
            data: { ...args, context },
            metadata: {
              tool: toolName,
              agent: 'observability',
              executionTime: 100
            }
          };

          return result;

        } catch (error) {
          this.logger.error(error, 'Direct tool call failed');
          reply.code(500);
          return { error: error.message };
        }
      });

      // Start server
      await this.fastify.listen({ port, host: '0.0.0.0' });

      this.logger.info(`Observability HTTP Server started on port ${port}`);

    } catch (error) {
      this.logger.error(error, 'Failed to start Observability HTTP Server');
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
        this.logger.info('Observability HTTP Server stopped');
      }
    } catch (error) {
      this.logger.error(error, 'Failed to stop Observability HTTP Server');
    }
  }
}