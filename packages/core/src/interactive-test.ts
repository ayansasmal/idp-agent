#!/usr/bin/env tsx

/**
 * Interactive test - try different commands manually
 */

import { createTestAgent } from './index';
import { defaultLogger } from './shared/logger/Logger';

const logger = defaultLogger.child({ component: 'InteractiveTest' });

async function interactiveTest() {
  logger.info('🎮 Interactive AI-IDP Test');
  logger.info('Try these example commands:');
  logger.info('');
  
  const examples = [
    'Deploy my user-auth service to staging',
    'Scale my api-gateway to 3 replicas', 
    'Show me the status of payment-service',
    'List all deployments in production',
    'Get logs for my web-app',
    'Delete the old test-service'
  ];
  
  examples.forEach((cmd, i) => {
    logger.info(`${i + 1}. "${cmd}"`);
  });
  
  logger.info('');
  logger.info('Setting up agent...');
  
  const { agent, createContext } = await createTestAgent('interactive-user');
  const context = createContext({
    environment: 'development',
    permissions: ['read', 'write', 'deploy']
  });
  
  // Test each example
  for (let i = 0; i < examples.length; i++) {
    const command = examples[i];
    logger.info(`\n--- Testing: "${command}" ---`);
    
    try {
      const response = await agent.process(command, context);
      
      logger.info(`✅ Success: ${response.success}`);
      logger.info(`📝 Message: ${response.message}`);
      logger.info(`🎯 Actions: ${response.actions.length} generated`);
      
      if (response.actions.length > 0) {
        response.actions.forEach((action, idx) => {
          logger.info(`   ${idx + 1}. ${action.action} on ${action.resourceName} (${action.environment})`);
        });
      }
      
    } catch (error) {
      logger.error(`❌ Failed: ${error}`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  await agent.shutdown();
  logger.info('\n🎉 Interactive test completed!');
}

interactiveTest().catch(error => {
  logger.error('Interactive test failed:', error);
  process.exit(1);
});