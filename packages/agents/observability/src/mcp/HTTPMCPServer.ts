/**
 * HTTP MCP Server for Observability Agent
 * Based on successful POC, adapted for Observability Agent's tools and capabilities
 */

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createLogger, type Logger } from '@ai-idp/utils';
import { ObservabilityAgent } from '../agent/ObservabilityAgent';
import type { 
  ObservabilityAgentConfig,
} from '../agent/ObservabilityAgent';
import type { ConversationContext } from '@ai-idp/types';

/**
 * HTTP MCP Server configuration
 */
export interface HTTPMCPServerConfig {
  port: number;
  observabilityAgentConfig: ObservabilityAgentConfig;
}

/**
 * HTTP MCP Server for Observability Agent
 * Exposes Observability Agent capabilities via MCP over HTTP
 */
export class HTTPMCPServer {
  private app: express.Application;
  private logger: Logger;
  private config: HTTPMCPServerConfig;
  private observabilityAgent: ObservabilityAgent;
  private transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  private server?: any;

  constructor(config: HTTPMCPServerConfig) {
    this.config = config;
    this.app = express();
    this.app.use(express.json());

    this.logger = createLogger({
      service: 'observability-http-mcp-server',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development'
    });

    // Initialize Observability Agent
    this.observabilityAgent = new ObservabilityAgent(this.config.observabilityAgentConfig, this.logger);

    this.setupRoutes();
  }

  /**
   * Create MCP server with Observability Agent tools
   */
  private createMcpServer(): McpServer {
    const server = new McpServer({
      name: "observability-agent",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    });

    // Get Observability Agent capabilities and register tools
    const capabilities = this.observabilityAgent.getCapabilities();
    
    // Register analyzeMetrics tool
    server.registerTool(
      'analyzeMetrics',
      {
        title: 'Analyze Metrics',
        description: 'Analyze metrics using SLM-powered pattern recognition and anomaly detection'
      },
      async (args, extra) => {
        const request = { arguments: args };
        try {
          const args = request.arguments || {};
          const context: ConversationContext = {
            conversationId: randomUUID(),
            userId: 'http-mcp-client',
            sessionId: 'http-mcp-session',
            history: [],
            metadata: { timestamp: new Date().toISOString() }
          };

          this.logger.info({ args }, '📊 Analyzing metrics via HTTP MCP');
          
          const result = await this.observabilityAgent.analyzeMetrics({
            query: args.query,
            duration: args.duration,
            threshold: args.threshold,
            context
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          this.logger.error({ error: error.message }, '❌ Analyze metrics failed');
          return {
            content: [{
              type: "text", 
              text: `Error: ${error.message}`
            }]
          };
        }
      }
    );

    // Register analyzeIncident tool
    server.registerTool(
      'analyzeIncident',
      {
        title: 'Analyze Incident',
        description: 'Perform SLM-powered incident analysis and root cause identification'
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

          this.logger.info({ args }, '🚨 Analyzing incident via HTTP MCP');

          const result = await this.observabilityAgent.analyzeIncident({
            alertId: args.alertId,
            symptoms: args.symptoms,
            timeRange: args.timeRange,
            context
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          this.logger.error({ error: error.message }, '❌ Analyze incident failed');
          return {
            content: [{
              type: "text",
              text: `Error: ${error.message}`
            }]
          };
        }
      }
    );

    // Register analyzeLogs tool
    server.registerTool(
      'analyzeLogs',
      {
        title: 'Analyze Logs',
        description: 'Intelligent log analysis with SLM-powered pattern recognition'
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

          this.logger.info({ args }, '📝 Analyzing logs via HTTP MCP');

          const result = await this.observabilityAgent.analyzeLogs({
            query: args.query,
            timeRange: args.timeRange,
            logLevel: args.logLevel,
            service: args.service,
            context
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          this.logger.error({ error: error.message }, '❌ Analyze logs failed');
          return {
            content: [{
              type: "text",
              text: `Error: ${error.message}`
            }]
          };
        }
      }
    );

    // Register createDashboard tool
    server.registerTool(
      'createDashboard',
      {
        title: 'Create Dashboard',
        description: 'Generate intelligent dashboards based on SLM analysis of requirements'
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

          this.logger.info({ args }, '📊 Creating dashboard via HTTP MCP');

          const result = await this.observabilityAgent.createDashboard({
            name: args.name,
            description: args.description,
            services: args.services,
            metrics: args.metrics,
            context
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          this.logger.error({ error: error.message }, '❌ Create dashboard failed');
          return {
            content: [{
              type: "text",
              text: `Error: ${error.message}`
            }]
          };
        }
      }
    );

    // Register configureAlerts tool
    server.registerTool(
      'configureAlerts',
      {
        title: 'Configure Alerts',
        description: 'Set up intelligent alerting rules with SLM-optimized thresholds'
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

          this.logger.info({ args }, '🚨 Configuring alerts via HTTP MCP');

          const result = await this.observabilityAgent.configureAlerts({
            ruleName: args.ruleName,
            condition: args.condition,
            severity: args.severity,
            notification: args.notification,
            context
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          this.logger.error({ error: error.message }, '❌ Configure alerts failed');
          return {
            content: [{
              type: "text",
              text: `Error: ${error.message}`
            }]
          };
        }
      }
    );

    this.logger.info({ toolCount: capabilities.tools.length }, 'MCP server created with Observability Agent tools');
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
        agent: 'observability-agent',
        version: '1.0.0',
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
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, '0.0.0.0', () => {
          this.logger.info({
            port: this.config.port,
            agent: 'observability-agent'
          }, '🚀 Observability Agent HTTP MCP Server started');
          
          console.log(`✅ Observability Agent HTTP MCP Server running on port ${this.config.port}`);
          console.log(`🌐 MCP Endpoint: http://localhost:${this.config.port}/mcp`);
          console.log(`🔍 Health Check: http://localhost:${this.config.port}/health`);
          console.log(`📋 Tools: analyzeMetrics, analyzeIncident, analyzeLogs, createDashboard, configureAlerts`);
          
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
          this.logger.info('🛑 Observability Agent HTTP MCP Server stopped');
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
      agent: 'observability-agent',
      transport: 'http'
    };
  }
}