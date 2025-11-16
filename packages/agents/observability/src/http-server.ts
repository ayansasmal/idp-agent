#!/usr/bin/env ts-node

/**
 * Observability Agent HTTP MCP Server Entry Point
 * Migrated from WebSocket to HTTP transport for better containerization
 */

import dotenv from 'dotenv';
import { HTTPMCPServer } from './mcp/HTTPMCPServer';
import type { ObservabilityAgentConfig } from './agent/ObservabilityAgent';

// Load environment variables
dotenv.config({ path: '../../../../.env' });

/**
 * Configuration from environment variables
 */
const config: ObservabilityAgentConfig = {
  agentId: 'observability-agent',
  name: 'Observability Agent',
  
  // SLM configuration
  slm: {
    provider: (process.env.SLM_PROVIDER as 'ollama' | 'openai') || 'ollama',
    model: process.env.SLM_MODEL || 'llama3:latest',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    apiKey: process.env.OPENAI_API_KEY,
    maxTokens: parseInt(process.env.SLM_MAX_TOKENS || '2048'),
    temperature: parseFloat(process.env.SLM_TEMPERATURE || '0.1')
  },

  // Prometheus configuration
  prometheus: process.env.PROMETHEUS_URL ? {
    url: process.env.PROMETHEUS_URL,
    timeout: 30000
  } : undefined,

  // Grafana configuration
  grafana: process.env.GRAFANA_URL && process.env.GRAFANA_API_KEY ? {
    url: process.env.GRAFANA_URL,
    apiKey: process.env.GRAFANA_API_KEY,
    timeout: 30000
  } : undefined,

  // AlertManager configuration
  alertManager: process.env.ALERTMANAGER_URL ? {
    url: process.env.ALERTMANAGER_URL,
    timeout: 30000
  } : undefined,

  // Elasticsearch configuration
  elasticsearch: process.env.ELASTICSEARCH_URL ? {
    url: process.env.ELASTICSEARCH_URL,
    auth: process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD ? {
      username: process.env.ELASTICSEARCH_USERNAME,
      password: process.env.ELASTICSEARCH_PASSWORD
    } : undefined,
    indexPattern: process.env.ELASTICSEARCH_INDEX_PATTERN || 'logs-*'
  } : undefined,

  // Qdrant configuration for context storage
  qdrant: process.env.QDRANT_URL ? {
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
    collectionName: process.env.QDRANT_COLLECTION || 'observability_context',
    vectorSize: parseInt(process.env.QDRANT_VECTOR_SIZE || '384'),
    timeout: 30000
  } : undefined
};

/**
 * Server configuration
 */
const serverConfig = {
  port: parseInt(process.env.OBSERVABILITY_AGENT_PORT || '3005'),
  observabilityAgentConfig: config
};

/**
 * Main function to start Observability Agent HTTP MCP Server
 */
async function main() {
  try {
    console.log('🚀 Starting Observability Agent HTTP MCP Server...');
    console.log('='.repeat(60));
    console.log(`📋 Agent: ${config.name} (${config.agentId})`);
    console.log(`🌐 Port: ${serverConfig.port}`);
    console.log(`🧠 SLM: ${config.slm.provider}:${config.slm.model} ${config.slm.provider === 'ollama' ? `(${config.slm.baseUrl})` : ''}`);
    console.log(`📈 Prometheus: ${config.prometheus ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`📊 Grafana: ${config.grafana ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`🚨 AlertManager: ${config.alertManager ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`🔍 Elasticsearch: ${config.elasticsearch ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`🗄️  Qdrant: ${config.qdrant ? '✅ Configured' : '❌ Not configured'}`);
    console.log('='.repeat(60));

    // Validate required environment variables
    if (!serverConfig.port) {
      throw new Error('OBSERVABILITY_AGENT_PORT environment variable is required');
    }

    // Create and start HTTP MCP server
    const httpServer = new HTTPMCPServer(serverConfig);
    await httpServer.start();

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      try {
        await httpServer.stop();
        console.log('✅ Observability Agent HTTP MCP Server stopped successfully');
      } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
      }
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    console.log('✅ Observability Agent HTTP MCP Server is running');
    console.log('🔧 Available tools:');
    console.log('   • analyzeMetrics - Analyze metrics with SLM-powered pattern recognition');
    console.log('   • analyzeIncident - Perform SLM-powered incident analysis and root cause identification');
    console.log('   • analyzeLogs - Intelligent log analysis with SLM-powered pattern recognition');
    console.log('   • createDashboard - Generate intelligent dashboards based on SLM analysis');
    console.log('   • configureAlerts - Set up intelligent alerting rules with SLM-optimized thresholds');
    console.log('\n📋 Ready to accept MCP connections from Meta-Agent!');

  } catch (error) {
    console.error('💥 Fatal error starting Observability Agent HTTP MCP Server:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Promise Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

// Start the server
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Startup error:', error);
    process.exit(1);
  });
}

export { main };