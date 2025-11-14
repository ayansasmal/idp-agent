#!/usr/bin/env ts-node

/**
 * Infrastructure Agent HTTP MCP Server Entry Point
 * Migrated from WebSocket to HTTP transport for better containerization
 */

import dotenv from 'dotenv';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { HTTPMCPServer } from './mcp/HTTPMCPServer';
import type { InfrastructureAgentConfig } from './agent/InfrastructureAgent';

// Load environment variables
dotenv.config({ path: '../../../../.env' });

// Create DynamoDB client for Action Manager if enabled
const dynamoDbClient = process.env.ACTION_MANAGER_ENABLED === 'true' ? 
  new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT // For LocalStack
  }) : undefined;

/**
 * Configuration from environment variables
 */
const config: InfrastructureAgentConfig = {
  agentId: 'infrastructure-agent',
  name: 'Infrastructure Agent',
  kubeconfig: process.env.KUBECONFIG,
  
  // Qdrant configuration for context storage
  qdrant: process.env.QDRANT_URL ? {
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
    collectionName: process.env.QDRANT_COLLECTION || 'infrastructure_context',
    vectorSize: parseInt(process.env.QDRANT_VECTOR_SIZE || '384'),
    timeout: 30000
  } : undefined,

  // Windmill configuration for complex operations
  windmill: process.env.WINDMILL_TOKEN ? {
    baseUrl: process.env.WINDMILL_BASE_URL || 'https://app.windmill.dev',
    token: process.env.WINDMILL_TOKEN,
    workspace: process.env.WINDMILL_WORKSPACE || 'default'
  } : undefined,

  // Action Manager configuration
  actionManager: dynamoDbClient ? {
    enabled: true,
    dynamoDbClient,
    tableName: process.env.ACTION_TRACKING_TABLE_NAME || 'ai-idp-action-tracking'
  } : undefined
};

/**
 * Server configuration
 */
const serverConfig = {
  port: parseInt(process.env.INFRASTRUCTURE_AGENT_PORT || '3003'),
  infraAgentConfig: config
};

/**
 * Main function to start Infrastructure Agent HTTP MCP Server
 */
async function main() {
  try {
    console.log('🚀 Starting Infrastructure Agent HTTP MCP Server...');
    console.log('='.repeat(60));
    console.log(`📋 Agent: ${config.name} (${config.agentId})`);
    console.log(`🌐 Port: ${serverConfig.port}`);
    console.log(`🔧 Kubernetes: ${config.kubeconfig ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`🗄️  Qdrant: ${config.qdrant ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`⚡ Windmill: ${config.windmill ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`📊 Action Manager: ${config.actionManager?.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log('='.repeat(60));

    // Validate required environment variables
    if (!serverConfig.port) {
      throw new Error('INFRASTRUCTURE_AGENT_PORT environment variable is required');
    }

    // Create and start HTTP MCP server
    const httpServer = new HTTPMCPServer(serverConfig);
    await httpServer.start();

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      try {
        await httpServer.stop();
        console.log('✅ Infrastructure Agent HTTP MCP Server stopped successfully');
      } catch (error) {
        console.error('❌ Error during shutdown:', error.message);
      }
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    console.log('✅ Infrastructure Agent HTTP MCP Server is running');
    console.log('🔧 Available tools:');
    console.log('   • deployApplication - Deploy applications to Kubernetes');
    console.log('   • scaleResource - Scale Kubernetes resources');
    console.log('   • getResourceStatus - Get resource status');
    console.log('   • getResourceLogs - Get pod logs');
    console.log('   • generateKubectlCommand - AI-powered kubectl generation');
    console.log('\n📋 Ready to accept MCP connections from Meta-Agent!');

  } catch (error) {
    console.error('💥 Fatal error starting Infrastructure Agent HTTP MCP Server:');
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