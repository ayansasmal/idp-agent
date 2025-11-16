/**
 * HTTP MCP Server for Infrastructure Agent
 * Based on successful POC, adapted for Infrastructure Agent's tools and capabilities
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createLogger, type Logger } from '@ai-idp/utils';
import { InfrastructureAgent } from '../agent/InfrastructureAgent';
import type {
  InfrastructureAgentConfig,
} from '../agent/InfrastructureAgent';
import type { ConversationContext } from '@ai-idp/types';
// Inlined type from agent-communication (no longer used)
type EnhancedToolHandler = {
  handler: any;
  schema: any;
  defaultsGenerator?: any;
  confirmationMessageGenerator?: any;
  requiresConfirmation?: boolean;
  description?: string;
};

/**
 * HTTP MCP Server configuration
 */
export interface HTTPMCPServerConfig {
  port: number;
  infraAgentConfig: InfrastructureAgentConfig;
}

/**
 * HTTP MCP Server for Infrastructure Agent
 * Exposes Infrastructure Agent capabilities via MCP over HTTP
 */
export class HTTPMCPServer {
  private app: express.Application;
  private logger: Logger;
  private config: HTTPMCPServerConfig;
  private infraAgent: InfrastructureAgent;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  private server?: any;

  constructor(config: HTTPMCPServerConfig) {
    this.config = config;
    this.app = express();
    this.app.use(express.json());

    this.logger = createLogger({
      service: 'infrastructure-http-mcp-server',
      level: 'debug',
      environment: (process.env.NODE_ENV as any) || 'development'
    });

    // Initialize Infrastructure Agent
    this.infraAgent = new InfrastructureAgent(this.config.infraAgentConfig);

    this.setupRoutes();
  }

  /**
   * Process enhanced tool call with assume-and-confirm functionality
   *
   * This method implements a cost-effective parameter completion workflow that:
   * 1. Validates provided parameters using Zod schemas
   * 2. Generates smart defaults for missing parameters without expensive LLM calls
   * 3. Shows users a confirmation message with Kubernetes manifest previews
   * 4. Only executes the tool after user confirmation
   *
   * @private
   * @param {string} toolName - Name of the tool to execute (e.g., 'deployApplication')
   * @param {Record<string, any>} args - Original arguments provided by the user
   * @param {ConversationContext} context - Conversation context including user ID and session info
   * @returns {Promise<any>} Either a confirmation request or the tool execution result
   *
   * @example
   * ```typescript
   * // User provides minimal args: { appName: "nginx", image: "nginx:latest" }
   * // System generates defaults: { namespace: "default", replicas: 1, port: 80 }
   * // Returns confirmation with complete Kubernetes manifest preview
   * const result = await processEnhancedToolCall('deployApplication', minimalArgs, context);
   * ```
   */
  private async processEnhancedToolCall(
    toolName: string,
    args: Record<string, any>,
    context: ConversationContext
  ): Promise<any> {
    // Retrieve the enhanced tool handler for this tool
    // All tools in our system use the assume-and-confirm framework
    const enhancedHandlers = this.infraAgent.getEnhancedToolHandlers();
    const enhancedHandler = enhancedHandlers[toolName];

    if (!enhancedHandler) {
      throw new Error(`Unknown tool: ${toolName}. Available tools: ${Object.keys(enhancedHandlers).join(', ')}`);
    }

    // Step 1: Validate provided parameters
    const validation = enhancedHandler.schema.safeParse(args);

    if (!validation.success) {
      // Step 2: Apply smart defaults for missing/invalid parameters
      let assumedArgs = { ...args };

      if (enhancedHandler.defaultsGenerator) {
        const generatedDefaults = await enhancedHandler.defaultsGenerator(args, context);
        this.logger.debug({
          originalArgs: args,
          generatedDefaults,
          mergedArgs: { ...assumedArgs, ...generatedDefaults }
        }, 'Debug: Smart defaults generation');
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

    this.logger.info({
      toolName,
      success: true
    }, 'Enhanced tool call completed successfully');

    return result;
  }

  /**
   * Create MCP server with Infrastructure Agent tools
   */
  private createMcpServer(): McpServer {
    const server = new McpServer({
      name: "infrastructure-agent",
      version: "2.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    });

    // Get Infrastructure Agent capabilities and register tools
    const capabilities = this.infraAgent.getCapabilities();
    
    // Register deployApplication tool with enhanced processing
    server.registerTool(
      'deployApplication',
      {
        title: 'Deploy Application',
        description: 'Deploy applications to Kubernetes with comprehensive validation'
      },
      async (args, extra) => {
        try {
          this.logger.debug({
            args,
            argsKeys: Object.keys(args || {}),
            extra,
            extraKeys: Object.keys(extra || {}),
            fullRequest: JSON.stringify(extra || {}, null, 2)
          }, 'MCP request received');
          this.logger.debug({
            args,
            argKeys: Object.keys(args),
            resourceName: args.resourceName,
            containerImage: args.containerImage
          }, 'DEBUG: Extracted arguments from MCP request');
          const context: ConversationContext = {
            conversationId: randomUUID(),
            userId: 'http-mcp-client',
            sessionId: 'http-mcp-session',
            history: [],
            metadata: { timestamp: new Date().toISOString() }
          };

          this.logger.info({ args }, '🚀 Processing deployment via enhanced HTTP MCP');

          // Use enhanced tool call processing
          const result = await this.processEnhancedToolCall('deployApplication', args, context);

          return {
            content: [{
              type: "text",
              text: result.success
                ? `✅ ${result.message}`
                : `❌ ${result.message}`,
              annotations: {
                audience: ['user', 'assistant'],
                priority: result.success ? 0.8 : 0.9,
                executionTime: result.metadata?.executionTime || 0
              }
            }],
            metadata: {
              executionTime: result.metadata?.executionTime || 0,
              contextUsed: result.metadata?.contextUsed || [],
              confidence: result.metadata?.confidence || 0.95,
              riskLevel: result.metadata?.riskLevel || 'low',
              approvalId: result.metadata?.approvalId,
              agent: 'infrastructure',
              tool: 'deployApplication'
            },
            isError: !result.success
          };
        } catch (error) {
          this.logger.error({ error: error.message }, '❌ Deploy application failed');
          return {
            content: [{
              type: "text",
              text: `Error: ${error.message}`
            }]
          };
        }
      }
    );

    // Register scaleResource tool
    server.registerTool(
      'scaleResource',
      {
        title: 'Scale Resource',
        description: 'Scale Kubernetes resources with monitoring and validation'
      },
      async (args, extra) => {
        try {
          args = args || {};
          const context: ConversationContext = {
            conversationId: randomUUID(),
            userId: 'http-mcp-client',
            sessionId: 'http-mcp-session',
            history: [],
            metadata: { timestamp: new Date().toISOString() }
          };

          this.logger.info({ args }, '📏 Scaling resource via HTTP MCP');

          const result = await this.infraAgent.scaleResource({
            resourceName: args.resourceName,
            replicas: args.replicas,
            namespace: args.namespace,
            resourceType: args.resourceType,
            context
          });

          return {
            content: [{
              type: "text",
              text: result.success
                ? `📏 ${result.message}`
                : `❌ ${result.message}`,
              annotations: {
                audience: ['user', 'assistant'],
                priority: result.success ? 0.8 : 0.9,
                executionTime: result.metadata?.executionTime || 0
              }
            }],
            metadata: {
              executionTime: result.metadata?.executionTime || 0,
              contextUsed: result.metadata?.contextUsed || [],
              confidence: result.metadata?.confidence || 0.95,
              riskLevel: result.metadata?.riskLevel || 'low',
              agent: 'infrastructure',
              tool: 'scaleResource'
            },
            isError: !result.success
          };
        } catch (error) {
          this.logger.error({ error: error.message }, '❌ Scale resource failed');
          return {
            content: [{
              type: "text",
              text: `Error: ${error.message}`
            }]
          };
        }
      }
    );

    // Register getResourceStatus tool
    server.registerTool(
      'getResourceStatus',
      {
        title: 'Get Resource Status',
        description: 'Get comprehensive status of Kubernetes resources'
      },
      async (args, extra) => {
        try {
          args = args || {};
          const context: ConversationContext = {
            conversationId: randomUUID(),
            userId: 'http-mcp-client',
            sessionId: 'http-mcp-session',
            history: [],
            metadata: { timestamp: new Date().toISOString() }
          };

          this.logger.info({ args }, '📊 Getting resource status via HTTP MCP');

          const result = await this.infraAgent.getResourceStatus({
            resourceName: args.resourceName,
            namespace: args.namespace,
            resourceType: args.resourceType,
            context
          });

          return {
            content: [{
              type: "text",
              text: result.success
                ? `📊 ${result.message}`
                : `❌ ${result.message}`,
              annotations: {
                audience: ['user', 'assistant'],
                priority: 0.7,
                executionTime: result.metadata?.executionTime || 0
              }
            }],
            metadata: {
              executionTime: result.metadata?.executionTime || 0,
              contextUsed: result.metadata?.contextUsed || [],
              confidence: result.metadata?.confidence || 0.95,
              agent: 'infrastructure',
              tool: 'getResourceStatus'
            },
            isError: !result.success
          };
        } catch (error) {
          this.logger.error({ error: error.message }, '❌ Get resource status failed');
          return {
            content: [{
              type: "text",
              text: `Error: ${error.message}`
            }]
          };
        }
      }
    );

    // Register getResourceLogs tool
    server.registerTool(
      'getResourceLogs',
      {
        title: 'Get Resource Logs',
        description: 'Retrieve and analyze Kubernetes pod logs'
      },
      async (args, extra) => {
        try {
          args = args || {};
          const context: ConversationContext = {
            conversationId: randomUUID(),
            userId: 'http-mcp-client',
            sessionId: 'http-mcp-session',
            history: [],
            metadata: { timestamp: new Date().toISOString() }
          };

          this.logger.info({ args }, '📝 Getting resource logs via HTTP MCP');

          const result = await this.infraAgent.getResourceLogs({
            resourceName: args.resourceName,
            namespace: args.namespace,
            lines: args.lines,
            follow: args.follow,
            context
          });

          return {
            content: [{
              type: "text",
              text: result.success
                ? `📝 ${result.message}`
                : `❌ ${result.message}`,
              annotations: {
                audience: ['user', 'assistant'],
                priority: 0.7,
                executionTime: result.metadata?.executionTime || 0
              }
            }],
            metadata: {
              executionTime: result.metadata?.executionTime || 0,
              contextUsed: result.metadata?.contextUsed || [],
              confidence: result.metadata?.confidence || 0.95,
              agent: 'infrastructure',
              tool: 'getResourceLogs'
            },
            isError: !result.success
          };
        } catch (error) {
          this.logger.error({ error: error.message }, '❌ Get resource logs failed');
          return {
            content: [{
              type: "text",
              text: `Error: ${error.message}`
            }]
          };
        }
      }
    );

    // Register generateKubectlCommand tool
    server.registerTool(
      'generateKubectlCommand',
      {
        title: 'Generate Kubectl Command',
        description: 'Generate kubectl commands from natural language using AI'
      },
      async (args, extra) => {
        try {
          args = args || {};
          const context: ConversationContext = {
            conversationId: randomUUID(),
            userId: 'http-mcp-client',
            sessionId: 'http-mcp-session',
            history: [],
            metadata: { timestamp: new Date().toISOString() }
          };

          this.logger.info({ args }, '🤖 Generating kubectl command via HTTP MCP');

          const result = await this.infraAgent.generateKubectlCommand({
            intent: args.query || args.intent,
            namespace: args.namespace,
            includeClusterContext: args.includeClusterContext,
            context
          });

          return {
            content: [{
              type: "text",
              text: result.success
                ? `🤖 ${result.message}`
                : `❌ ${result.message}`,
              annotations: {
                audience: ['user', 'assistant'],
                priority: 0.8,
                executionTime: result.metadata?.executionTime || 0
              }
            }],
            metadata: {
              executionTime: result.metadata?.executionTime || 0,
              contextUsed: result.metadata?.contextUsed || [],
              confidence: result.metadata?.confidence || 0.8,
              agent: 'infrastructure',
              tool: 'generateKubectlCommand'
            },
            isError: !result.success
          };
        } catch (error) {
          this.logger.error({ error: error.message }, '❌ Generate kubectl command failed');
          return {
            content: [{
              type: "text",
              text: `Error: ${error.message}`
            }]
          };
        }
      }
    );

    this.logger.info({ toolCount: capabilities.tools.length }, 'MCP server created with Infrastructure Agent tools');
    return server;
  }

  /**
   * Setup Express routes for MCP HTTP transport
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        agent: 'infrastructure-agent',
        version: '2.0.0',
        transport: 'http',
        sessions: Object.keys(this.transports).length,
        timestamp: new Date().toISOString()
      });
    });

    // Handle POST requests for client-to-server communication
    this.app.post('/mcp', async (req, res) => {
      try {
        this.logger.debug({ body: req.body }, '🌐 POST /mcp request received');

        // Check for existing session ID
        const sessionId = req.headers['mcp-session-id'] as string;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.transports[sessionId]) {
          // Reuse existing transport
          this.logger.debug(`♻️  Reusing session: ${sessionId}`);
          transport = this.transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request
          this.logger.info('🆕 Creating new session');
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
              this.logger.info(`✅ Session initialized: ${sessionId}`);
              this.transports[sessionId] = transport;
            },
          });

          // Clean up transport when closed
          transport.onclose = () => {
            if (transport.sessionId) {
              this.logger.info(`🧹 Cleaning up session: ${transport.sessionId}`);
              delete this.transports[transport.sessionId];
            }
          };

          const server = this.createMcpServer();
          await server.connect(transport);
        } else {
          // Invalid request
          this.logger.warn('❌ Invalid request: No valid session ID');
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          });
          return;
        }

        // Handle the request
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        this.logger.error({ error: error.message }, '❌ POST /mcp error');
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
              data: { error: error.message }
            },
            id: req.body?.id || null,
          });
        }
      }
    });

    // Reusable handler for GET and DELETE requests
    const handleSessionRequest = async (req: express.Request, res: express.Response) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      this.logger.debug(`🔄 ${req.method} /mcp session: ${sessionId}`);

      if (!sessionId || !this.transports[sessionId]) {
        this.logger.warn('❌ Invalid session ID');
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);
    };

    // Handle GET requests for server-to-client notifications via SSE
    this.app.get('/mcp', handleSessionRequest);

    // Handle DELETE requests for session termination
    this.app.delete('/mcp', handleSessionRequest);
  }

  /**
   * Start the HTTP MCP server
   */
  async start(): Promise<void> {
    // Initialize Infrastructure Agent first
    await this.infraAgent.initialize();
    this.logger.info('✅ Infrastructure Agent initialized successfully');

    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, '0.0.0.0', () => {
          this.logger.info({
            port: this.config.port,
            agent: 'infrastructure-agent'
          }, '🚀 Infrastructure Agent HTTP MCP Server started');

          console.log(`✅ Infrastructure Agent HTTP MCP Server running on port ${this.config.port}`);
          console.log(`🌐 MCP Endpoint: http://localhost:${this.config.port}/mcp`);
          console.log(`🔍 Health Check: http://localhost:${this.config.port}/health`);
          console.log(`📋 Tools: deployApplication, scaleResource, getResourceStatus, getResourceLogs, generateKubectlCommand`);

          resolve();
        });

        this.server.on('error', (error: any) => {
          this.logger.error({ error: error.message }, '❌ Server error');
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the HTTP MCP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Clean up all transports
      Object.values(this.transports).forEach(transport => {
        try {
          transport.close();
        } catch (err) {
          this.logger.warn({ error: err }, 'Warning closing transport');
        }
      });
      this.transports = {};

      if (this.server) {
        this.server.close(() => {
          this.logger.info('🛑 Infrastructure Agent HTTP MCP Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      activeSessions: Object.keys(this.transports).length,
      port: this.config.port,
      agent: 'infrastructure-agent',
      transport: 'http'
    };
  }
}