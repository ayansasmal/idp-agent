import { InfrastructureAgent, type InfrastructureAgentConfig } from './agent/InfrastructureAgent';
import { InfrastructureMCPServer, InfrastructureHTTPServer } from './mcp/MCPServer';
import { WebSocketInfrastructureMCPServer } from './mcp/WebSocketMCPServer';
import { StandardInfrastructureAgent } from './mcp/StandardInfrastructureAgent';
import { SimpleWebSocketMCPServer } from './mcp/SimpleWebSocketMCPServer';
import { KubernetesOperations } from './kubernetes/KubernetesOperations';
import { CloudOperations } from './cloud/CloudOperations';
import { pino, type Logger } from 'pino';
import dotenv from 'dotenv';

// Load environment variables from root directory
dotenv.config({ path: require('path').resolve(__dirname, '../../../.env') });

// Export main components
export {
  InfrastructureAgent,
  InfrastructureMCPServer,
  InfrastructureHTTPServer,
  WebSocketInfrastructureMCPServer,
  KubernetesOperations,
  CloudOperations,
  type InfrastructureAgentConfig
};

// Export types
export * from '@ai-idp/types';

/**
 * Create Infrastructure Agent with default configuration
 */
export function createInfrastructureAgent(
  overrides?: Partial<InfrastructureAgentConfig>
): InfrastructureAgent {
  // Create logger
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    name: 'infrastructure-agent'
  });

  // Build configuration from environment
  const config: InfrastructureAgentConfig = {
    agentId: process.env.AGENT_ID || 'infrastructure',
    name: process.env.AGENT_NAME || 'Infrastructure Agent',
    kubeconfig: process.env.KUBECONFIG,

    qdrant: process.env.QDRANT_URL ? {
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      collectionName: process.env.QDRANT_COLLECTION || 'infrastructure_context'
    } : undefined,

    windmill: process.env.WINDMILL_BASE_URL ? {
      baseUrl: process.env.WINDMILL_BASE_URL,
      token: process.env.WINDMILL_TOKEN,
      workspace: process.env.WINDMILL_WORKSPACE || 'admins'
    } : undefined,

    ...overrides
  };

  return new InfrastructureAgent(config, logger);
}

/**
 * Start Infrastructure Agent as standalone service
 */
export async function startInfrastructureAgentService(
  port: number = 3001,
  mode: 'http' | 'stdio' | 'websocket' = 'websocket'
): Promise<void> {
  const logger = pino({ name: 'infrastructure-agent-service' });

  try {
    logger.info({ port, mode }, 'Starting Infrastructure Agent service');

    // Create and initialize agent
    const agent = createInfrastructureAgent();
    await agent.initialize();

    logger.info('Infrastructure Agent initialized successfully');

    if (mode === 'http') {
      // Start HTTP server for MCP over HTTP
      const httpServer = new InfrastructureHTTPServer(agent, logger);
      await httpServer.start(port);

      // Graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Shutting down Infrastructure Agent HTTP service...');
        await httpServer.stop();
        process.exit(0);
      });

    } else if (mode === 'websocket') {
      // Start simple WebSocket server for MCP over WebSocket + JSON-RPC
      const standardAgent = new StandardInfrastructureAgent(agent, logger);
      const wsServer = new SimpleWebSocketMCPServer(standardAgent, logger);
      await wsServer.start(port);

      // Graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Shutting down Infrastructure Agent WebSocket service...');
        await wsServer.stop();
        process.exit(0);
      });

    } else {
      // Start stdio MCP server
      const mcpServer = new InfrastructureMCPServer(agent, logger);
      await mcpServer.start();

      // Graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Shutting down Infrastructure Agent MCP service...');
        await mcpServer.stop();
        process.exit(0);
      });
    }

  } catch (error) {
    logger.error(error, 'Failed to start Infrastructure Agent service');
    process.exit(1);
  }
}

/**
 * CLI for running Infrastructure Agent operations directly
 */
export async function runInfrastructureOperation(
  operation: string,
  params: any
): Promise<any> {
  const logger = pino({ name: 'infrastructure-cli' });

  try {
    // Create and initialize agent
    const agent = createInfrastructureAgent();
    await agent.initialize();

    // Add context for operation
    const context = {
      conversationId: `cli-${Date.now()}`,
      userId: 'cli-user',
      sessionId: `cli-session-${Date.now()}`,
      history: [],
      metadata: { source: 'cli' }
    };

    const paramsWithContext = { ...params, context };

    // Execute operation
    let result;
    switch (operation) {
      case 'deploy':
        result = await agent.deployApplication(paramsWithContext);
        break;
      case 'scale':
        result = await agent.scaleResource(paramsWithContext);
        break;
      case 'status':
        result = await agent.getResourceStatus(paramsWithContext);
        break;
      case 'logs':
        result = await agent.getResourceLogs(paramsWithContext);
        break;
      case 'provision-db':
        result = await agent.provisionDatabase(paramsWithContext);
        break;
      case 'health':
        result = await agent.healthCheck();
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return result;

  } catch (error) {
    logger.error(error, 'Infrastructure operation failed');
    throw error;
  }
}

// Start service if this file is run directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Start as service
    const port = parseInt(process.env.INFRASTRUCTURE_AGENT_PORT || process.env.PORT || '3003', 10);
    const mode = (process.env.MCP_MODE as 'http' | 'stdio' | 'websocket') || 'websocket';
    startInfrastructureAgentService(port, mode);
  } else {
    // Run as CLI
    const operation = args[0];
    const paramsStr = args[1];

    try {
      const params = paramsStr ? JSON.parse(paramsStr) : {};
      runInfrastructureOperation(operation, params)
        .then(result => {
          console.log(JSON.stringify(result, null, 2));
          process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
          console.error('Operation failed:', error.message);
          process.exit(1);
        });
    } catch (error) {
      console.error('Invalid parameters:', error.message);
      console.log('Usage: tsx src/index.ts <operation> <params-json>');
      console.log('Example: tsx src/index.ts deploy \'{"resourceName":"nginx","containerImage":"nginx:latest"}\'');
      process.exit(1);
    }
  }
}