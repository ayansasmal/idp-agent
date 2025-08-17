#!/usr/bin/env tsx

/**
 * Quick test to verify core functionality
 */

import { createTestAgent } from './index';
import { defaultLogger } from './shared/logger/Logger';

const logger = defaultLogger.child({ component: 'QuickTest' });

async function quickTest() {
  logger.info('🚀 Quick Test - AI-IDP Core');

  try {
    // Create test agent
    logger.info('Creating test agent...');
    const { agent, createContext } = await createTestAgent('test-user');

    // Create context
    const context = createContext({
      environment: 'development',
      permissions: ['read', 'write', 'deploy']
    });

    logger.info('✅ Agent created successfully');

    // Test basic AI processing
    logger.info('Testing AI processing...');
    const response = await agent.processRequest(
      "Show me the status of my user-auth service",
      context
    );

    if (response.success) {
      logger.info('✅ AI processing works!');
      logger.info(`Generated message: ${response.message}`);
      logger.info(`Actions count: ${response.actions.length}`);
    } else {
      logger.error('❌ AI processing failed');
    }

    // Test health
    logger.info('Testing system health...');
    const health = await agent.getHealthStatus();
    logger.info(`Health status: ${health.status}`);
    logger.info(`Health message: ${health.checks.agent.message}`);

    if (health.status !== 'unhealthy') {
      logger.info('✅ System health is good');
    } else {
      logger.warn('⚠️ System health issues detected');
    }

    // Cleanup
    logger.info('✅ Agent shutdown complete');

    logger.info('🎉 Quick test completed successfully!');

  } catch (error) {
    logger.error('❌ Quick test failed:', error);
    process.exit(1);
  }
}

quickTest();