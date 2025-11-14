import { InfrastructureAgent, type InfrastructureAgentConfig } from './agent/InfrastructureAgent';
import { InfrastructureMCPServer, InfrastructureHTTPServer } from './mcp/MCPServer';
import { WebSocketInfrastructureMCPServer } from './mcp/WebSocketMCPServer';
import { HTTPMCPServer } from './mcp/HTTPMCPServer';
import { KubernetesOperations } from './kubernetes/KubernetesOperations';
import { CloudOperations } from './cloud/CloudOperations';
import { pino, type Logger } from 'pino';
import dotenv from 'dotenv';

// Load environment variables from root directory
dotenv.config({ path: require('path').resolve(__dirname, '../../../../.env') });

// Export main components
export {
  InfrastructureAgent,
  InfrastructureMCPServer,
  InfrastructureHTTPServer,
  WebSocketInfrastructureMCPServer,
  HTTPMCPServer,
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
 *
 * Only supports HTTP MCP mode since this is our single, focused implementation
 */
export async function startInfrastructureAgentService(
  port: number = 3003
): Promise<void> {
  const logger = pino({ name: 'infrastructure-agent-service' });

  try {
    logger.info({ port }, 'Starting Infrastructure Agent HTTP MCP service');

    // Create and initialize agent
    const agent = createInfrastructureAgent();
    await agent.initialize();

    logger.info('Infrastructure Agent initialized successfully');

    // Start HTTP MCP server with enhanced tool handlers (assume-and-confirm framework)
    const httpMcpServer = new HTTPMCPServer({
      port,
      infraAgentConfig: {
        agentId: 'infrastructure',
        name: 'Infrastructure Agent'
      }
    });
    await httpMcpServer.start();

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Infrastructure Agent HTTP MCP service...');
      await httpMcpServer.stop();
      process.exit(0);
    });

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
    // Start as service - ENFORCE environment variable usage
    if (!process.env.INFRASTRUCTURE_AGENT_PORT) {
      console.error('❌ INFRASTRUCTURE_AGENT_PORT environment variable is required');
      console.error('Please set INFRASTRUCTURE_AGENT_PORT in your .env file');
      console.error('Example: INFRASTRUCTURE_AGENT_PORT=3003');
      process.exit(1);
    }

    const port = parseInt(process.env.INFRASTRUCTURE_AGENT_PORT, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`❌ Invalid INFRASTRUCTURE_AGENT_PORT: ${process.env.INFRASTRUCTURE_AGENT_PORT}`);
      console.error('Port must be a number between 1 and 65535');
      process.exit(1);
    }

    console.log(`🚀 Starting Infrastructure Agent HTTP MCP Server on port ${port}`);
    startInfrastructureAgentService(port);
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