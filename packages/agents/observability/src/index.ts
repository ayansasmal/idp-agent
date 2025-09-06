import { ObservabilityAgent, type ObservabilityAgentConfig } from './agent/ObservabilityAgent';
import { ObservabilityMCPServer, ObservabilityHTTPServer } from './mcp/MCPServer';
import { StandardObservabilityAgent } from './mcp/StandardObservabilityAgent';
import { AgentCommunicationServer } from '@ai-idp/agent-communication';
import { MonitoringOperations } from './monitoring/MonitoringOperations';
import { IncidentManagement } from './incident/IncidentManagement';
import { MetricsAnalysis } from './metrics/MetricsAnalysis';
import { LoggingOperations } from './logging/LoggingOperations';
import { pino, type Logger } from 'pino';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: require('path').resolve(__dirname, '../../../../.env') });

// Export main components
export {
  ObservabilityAgent,
  ObservabilityMCPServer,
  ObservabilityHTTPServer,
  MonitoringOperations,
  IncidentManagement,
  MetricsAnalysis,
  LoggingOperations,
  type ObservabilityAgentConfig
};

// Export types
export * from '@ai-idp/types';

/**
 * Create Observability Agent with default configuration
 */
export function createObservabilityAgent(
  overrides?: Partial<ObservabilityAgentConfig>
): ObservabilityAgent {
  // Create logger
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    name: 'observability-agent'
  });

  // Build configuration from environment
  const config: ObservabilityAgentConfig = {
    agentId: process.env.OBSERVABILITY_AGENT_ID || 'observability',
    name: process.env.OBSERVABILITY_AGENT_NAME || 'Observability Agent',

    // SLM Configuration - using Ollama with Llama by default
    slm: {
      provider: (process.env.SLM_PROVIDER as 'ollama' | 'openai') || 'ollama',
      model: process.env.SLM_MODEL || 'llama3.1:8b',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      apiKey: process.env.OPENAI_API_KEY, // For OpenAI SLM if needed
      maxTokens: parseInt(process.env.SLM_MAX_TOKENS || '2048', 10),
      temperature: parseFloat(process.env.SLM_TEMPERATURE || '0.1')
    },

    // Observability Tools Configuration
    prometheus: process.env.PROMETHEUS_URL ? {
      url: process.env.PROMETHEUS_URL,
      auth: process.env.PROMETHEUS_USERNAME ? {
        username: process.env.PROMETHEUS_USERNAME,
        password: process.env.PROMETHEUS_PASSWORD || ''
      } : undefined,
      timeout: parseInt(process.env.PROMETHEUS_TIMEOUT || '30000', 10)
    } : undefined,

    grafana: process.env.GRAFANA_URL ? {
      url: process.env.GRAFANA_URL,
      apiKey: process.env.GRAFANA_API_KEY || '',
      timeout: parseInt(process.env.GRAFANA_TIMEOUT || '30000', 10)
    } : undefined,

    alertManager: process.env.ALERTMANAGER_URL ? {
      url: process.env.ALERTMANAGER_URL,
      timeout: parseInt(process.env.ALERTMANAGER_TIMEOUT || '30000', 10)
    } : undefined,

    elasticsearch: process.env.ELASTICSEARCH_URL ? {
      url: process.env.ELASTICSEARCH_URL,
      auth: process.env.ELASTICSEARCH_USERNAME ? {
        username: process.env.ELASTICSEARCH_USERNAME,
        password: process.env.ELASTICSEARCH_PASSWORD || ''
      } : undefined,
      indexPattern: process.env.ELASTICSEARCH_INDEX_PATTERN || 'logs-*'
    } : undefined,

    // Qdrant for pattern recognition and incident history
    qdrant: process.env.QDRANT_URL ? {
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      collectionName: process.env.QDRANT_COLLECTION || 'observability_context',
      vectorSize: parseInt(process.env.QDRANT_VECTOR_SIZE || '384', 10),
      timeout: parseInt(process.env.QDRANT_TIMEOUT || '30000', 10)
    } : undefined,

    ...overrides
  };

  logger.info({ config: { agentId: config.agentId, slm: config.slm } }, 'Observability Agent configuration initialized');

  return new ObservabilityAgent(config, logger);
}

/**
 * Start Observability Agent as standalone service with WebSocket + JSON-RPC
 */
export async function startObservabilityAgentService(port?: number): Promise<void> {
  // Use the provided port or OBSERVABILITY_AGENT_PORT environment variable
  const actualPort = port || parseInt(process.env.OBSERVABILITY_AGENT_PORT || '3006', 10);
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    name: 'observability-agent-service'
  });

  try {
    logger.info({ port: actualPort, mode: 'websocket' }, 'Starting Observability Agent service');

    // Create and initialize Observability Agent
    const observabilityAgent = createObservabilityAgent();
    await observabilityAgent.initialize();
    logger.info({}, 'Observability Agent initialized successfully');

    // Create standardized agent adapter
    const standardAgent = new StandardObservabilityAgent(observabilityAgent, logger, actualPort);

    // Create WebSocket server using standardized communication
    const webSocketServer = new AgentCommunicationServer(standardAgent, {
      heartbeatInterval: 30000,
      healthCheckTimeout: 90000
    });

    await webSocketServer.start(actualPort, '/mcp');

    logger.info({}, `Observability Agent service started successfully on port ${actualPort}`);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info({}, 'Shutting down Observability Agent service...');
      await webSocketServer.stop();
      await observabilityAgent.cleanup();
      process.exit(0);
    });

  } catch (error) {
    logger.error(error, 'Failed to start Observability Agent service');
    process.exit(1);
  }
}

// Start service if this file is run directly
if (require.main === module) {
  startObservabilityAgentService();
}