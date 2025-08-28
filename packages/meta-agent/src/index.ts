import { MetaAgent, type MetaAgentConfig } from './agent/MetaAgent';
import { IntentClassifier } from './routing/IntentClassifier';
import { ContextManager } from './context/ContextManager';
import { ResponseCoordinator } from './agent/ResponseCoordinator';
import { createLogger } from '@ai-idp/utils';
import type { Logger } from 'pino';
import dotenv from 'dotenv';

// Load environment variables from root directory
dotenv.config({ path: '../../.env' });

// Export main components
export {
  MetaAgent,
  IntentClassifier,
  ContextManager,
  ResponseCoordinator,
  type MetaAgentConfig
};

// Export types from shared packages
export * from '@ai-idp/types';

/**
 * Create a Meta-Agent instance with default configuration
 */
export function createMetaAgent(overrides?: Partial<MetaAgentConfig>): MetaAgent {
  // Create logger using utils
  const logger = createLogger({
    service: 'meta-agent',
    level: (process.env.LOG_LEVEL as any) || 'info',
    environment: (process.env.NODE_ENV as any) || 'development'
  });

  // Build configuration from environment variables
  const config: MetaAgentConfig = {
    anthropic: process.env.ANTHROPIC_API_KEY ? {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4096', 10)
    } : undefined,

    openai: process.env.OPENAI_API_KEY ? {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4096', 10)
    } : undefined,

    qdrant: {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
      collectionName: process.env.QDRANT_COLLECTION || 'meta_agent_context',
      vectorSize: parseInt(process.env.QDRANT_VECTOR_SIZE || '1536', 10),
      timeout: parseInt(process.env.QDRANT_TIMEOUT || '30000', 10)
    },

    mcp: {
      serverPort: parseInt(process.env.MCP_SERVER_PORT || '3001', 10),
      clientTimeout: parseInt(process.env.MCP_CLIENT_TIMEOUT || '30000', 10),
      maxRetries: parseInt(process.env.MCP_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.MCP_RETRY_DELAY || '1000', 10)
    },

    ...overrides
  };

  logger.info({ config }, 'Meta-Agent configuration initialized');

  return new MetaAgent(config, logger);
}

/**
 * Start Meta-Agent as standalone service
 */
export async function startMetaAgentService(port: number = 3000): Promise<void> {
  const logger = createLogger({
    service: 'meta-agent-service',
    level: 'info',
    environment: (process.env.NODE_ENV as any) || 'development'
  });

  try {
    logger.info({ port }, 'Starting Meta-Agent service');

    // Create and initialize Meta-Agent
    const metaAgent = createMetaAgent();
    await metaAgent.initialize();

    // Create Fastify server
    const fastify = require('fastify')({ logger: false });

    // Add CORS support
    await fastify.register(require('@fastify/cors'), {
      origin: true,
      credentials: true
    });

    // Add WebSocket support
    await fastify.register(require('@fastify/websocket'));

    // Health check endpoint
    fastify.get('/health', async () => {
      const status = await metaAgent.getAgentStatus();
      return {
        healthy: status.metaAgent.initialized,
        timestamp: new Date().toISOString(),
        ...status
      };
    });

    // Process request endpoint
    fastify.post('/process', async (request: any, reply: any) => {
      try {
        const { userInput, context } = request.body;

        if (!userInput || !context) {
          reply.code(400);
          return { error: 'userInput and context are required' };
        }

        const response = await metaAgent.processRequest(userInput, context);
        return response;

      } catch (error) {
        logger.error(error, 'Request processing failed');
        reply.code(500);
        return { error: 'Internal server error' };
      }
    });

    // WebSocket endpoint for real-time communication
    fastify.register(async function (fastify: any) {
      fastify.get('/ws', { websocket: true }, (connection: any, req: any) => {
        logger.info({}, 'WebSocket connection established');

        connection.socket.on('message', async (message: any) => {
          try {
            const data = JSON.parse(message.toString());

            if (data.type === 'processRequest') {
              const response = await metaAgent.processRequest(
                data.userInput,
                data.context
              );

              connection.socket.send(JSON.stringify({
                type: 'response',
                data: response
              }));
            }
          } catch (error) {
            logger.error(error, 'WebSocket message processing failed');
            connection.socket.send(JSON.stringify({
              type: 'error',
              error: 'Failed to process message'
            }));
          }
        });

        connection.socket.on('close', () => {
          logger.info({}, 'WebSocket connection closed');
        });
      });
    });

    // Start server
    await fastify.listen({ port, host: '0.0.0.0' });

    logger.info({}, `Meta-Agent service started successfully on port ${port}`);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info({}, 'Shutting down Meta-Agent service...');
      await metaAgent.cleanup();
      await fastify.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error(error, 'Failed to start Meta-Agent service');
    process.exit(1);
  }
}

// Start service if this file is run directly
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  startMetaAgentService(port);
}