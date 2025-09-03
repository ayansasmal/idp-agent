import { MetaAgent, type MetaAgentConfig } from './agent/MetaAgent';
import { IntentClassifier } from './routing/IntentClassifier';
import { ContextManager } from './context/ContextManager';
import { ResponseCoordinator } from './agent/ResponseCoordinator';
import { createLogger } from '@ai-idp/utils';
import type { Logger } from 'pino';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';

// Load environment variables from root directory
dotenv.config({ path: require('path').resolve(__dirname, '../../../.env') });

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
      model: process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-latest',
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
      vectorSize: parseInt(process.env.QDRANT_VECTOR_SIZE || '384', 10),
      timeout: parseInt(process.env.QDRANT_TIMEOUT || '30000', 10)
    },

    mcp: {
      serverPort: parseInt(process.env.MCP_SERVER_PORT || '3001', 10),
      clientTimeout: parseInt(process.env.MCP_CLIENT_TIMEOUT || '30000', 10),
      maxRetries: parseInt(process.env.MCP_MAX_RETRIES || '3', 10),
      retryDelay: parseInt(process.env.MCP_RETRY_DELAY || '1000', 10)
    },

    // Action Manager configuration
    actionManager: process.env.ACTION_MANAGER_ENABLED === 'true' ? {
      enabled: true,
      dynamoDbClient: new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-east-1',
        endpoint: process.env.AWS_ENDPOINT_URL || undefined
      }),
      tableName: process.env.ACTION_MANAGER_TABLE_NAME || 'ai-idp-actions',
      ttlDays: parseInt(process.env.ACTION_MANAGER_TTL_DAYS || '30', 10)
    } : {
      enabled: false,
      dynamoDbClient: null,
      tableName: '',
      ttlDays: 30
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

    // Process request endpoint (legacy)
    fastify.post('/process', async (request: any, reply: any) => {
      try {
        const { userInput, context } = request.body;

        if (!userInput || !context) {
          logger.error({ body: request.body }, 'Missing required fields in /process request');
          reply.code(400);
          return { error: 'userInput and context are required' };
        }

        logger.info({ userInput: userInput.substring(0, 100) }, 'Processing request via /process endpoint');
        const response = await metaAgent.processRequest(userInput, context);
        logger.info({ success: response.success }, 'Request processing completed');
        return response;

      } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Request processing failed in /process');
        reply.code(500);
        return { error: 'Internal server error', details: error.message };
      }
    });

    // Chat endpoint (web-app compatible)
    fastify.post('/chat', async (request: any, reply: any) => {
      try {
        const { userInput, context } = request.body;

        if (!userInput || !context) {
          logger.error({ body: request.body }, 'Missing required fields in /chat request');
          reply.code(400);
          return { error: 'userInput and context are required' };
        }

        logger.info({ userInput: userInput.substring(0, 100) }, 'Processing chat request');
        const response = await metaAgent.processRequest(userInput, context);
        logger.info({ success: response.success }, 'Chat request processing completed');
        return response;

      } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Chat request processing failed');
        reply.code(500);
        return { error: 'Internal server error', details: error.message };
      }
    });

    // Approvals endpoint (web-app compatible)
    fastify.get('/approvals', async (request: any, reply: any) => {
      try {
        logger.info({}, 'Fetching approvals list');
        const approvalModule = await metaAgent.getApprovalModule();
        logger.info({ approvalCount: approvalModule?.result?.pendingApprovals?.length || 0 }, 'Approvals retrieved');
        return approvalModule;

      } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Failed to fetch approvals');
        reply.code(500);
        return { error: 'Failed to fetch approvals', details: error.message };
      }
    });

    // Approval approve endpoint
    fastify.post('/approvals/approve', async (request: any, reply: any) => {
      try {
        const { id, approverId, comments } = request.body;

        if (!id) {
          logger.error({ body: request.body }, 'Missing approval ID in approve request');
          reply.code(400);
          return { error: 'Approval ID is required' };
        }

        logger.info({ id, approverId }, 'Processing approval approve action');
        const result = await metaAgent.processApprovalAction('approve', id, approverId || 'web-user', comments);
        logger.info({ id, success: result.success }, 'Approval approve action completed');
        return result;

      } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Failed to approve request');
        reply.code(500);
        return { error: 'Failed to approve request', details: error.message };
      }
    });

    // Approval reject endpoint
    fastify.post('/approvals/reject', async (request: any, reply: any) => {
      try {
        const { id, approverId, comments } = request.body;

        if (!id) {
          logger.error({ body: request.body }, 'Missing approval ID in reject request');
          reply.code(400);
          return { error: 'Approval ID is required' };
        }

        logger.info({ id, approverId }, 'Processing approval reject action');
        const result = await metaAgent.processApprovalAction('reject', id, approverId || 'web-user', comments);
        logger.info({ id, success: result.success }, 'Approval reject action completed');
        return result;

      } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Failed to reject request');
        reply.code(500);
        return { error: 'Failed to reject request', details: error.message };
      }
    });

    // Action tracking endpoints
    
    // Get action status by ID
    fastify.get('/actions/:actionId', async (request: any, reply: any) => {
      try {
        const { actionId } = request.params;
        
        if (!metaAgent.isActionManagerEnabled()) {
          reply.code(404);
          return { error: 'Action Manager not enabled' };
        }
        
        logger.info({ actionId }, 'Getting action status');
        const action = await metaAgent.getActionStatus(actionId);
        
        if (!action) {
          reply.code(404);
          return { error: 'Action not found' };
        }
        
        logger.info({ actionId, status: action.status }, 'Action status retrieved');
        return { success: true, action };
        
      } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Failed to get action status');
        reply.code(500);
        return { error: 'Failed to get action status', details: error.message };
      }
    });
    
    // List user actions
    fastify.get('/actions/user/:userId', async (request: any, reply: any) => {
      try {
        const { userId } = request.params;
        const { limit, offset } = request.query;
        
        if (!metaAgent.isActionManagerEnabled()) {
          reply.code(404);
          return { error: 'Action Manager not enabled' };
        }
        
        logger.info({ userId, limit, offset }, 'Listing user actions');
        const actions = await metaAgent.listUserActions(userId, { limit, offset });
        
        logger.info({ userId, actionCount: actions.length }, 'User actions retrieved');
        return { success: true, actions };
        
      } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Failed to list user actions');
        reply.code(500);
        return { error: 'Failed to list user actions', details: error.message };
      }
    });
    
    // List session actions
    fastify.get('/actions/session/:sessionId', async (request: any, reply: any) => {
      try {
        const { sessionId } = request.params;
        const { limit, offset } = request.query;
        
        if (!metaAgent.isActionManagerEnabled()) {
          reply.code(404);
          return { error: 'Action Manager not enabled' };
        }
        
        logger.info({ sessionId, limit, offset }, 'Listing session actions');
        const actions = await metaAgent.listSessionActions(sessionId, { limit, offset });
        
        logger.info({ sessionId, actionCount: actions.length }, 'Session actions retrieved');
        return { success: true, actions };
        
      } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Failed to list session actions');
        reply.code(500);
        return { error: 'Failed to list session actions', details: error.message };
      }
    });
    
    // Get action statistics
    fastify.get('/actions/stats', async (request: any, reply: any) => {
      try {
        logger.info({}, 'Getting action statistics');
        const stats = await metaAgent.getActionStatistics();
        
        logger.info({ stats }, 'Action statistics retrieved');
        return { success: true, statistics: stats };
        
      } catch (error: any) {
        logger.error({ error: error.message, stack: error.stack }, 'Failed to get action statistics');
        reply.code(500);
        return { error: 'Failed to get action statistics', details: error.message };
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