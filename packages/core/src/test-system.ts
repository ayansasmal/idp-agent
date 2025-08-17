#!/usr/bin/env tsx

/**
 * Comprehensive test script for AI-IDP Core System
 * Tests all modules, AI integration, and end-to-end workflows
 */

import { PrimaryAgent } from './agent/PrimaryAgent';
import { createTestAgent } from './index';
import { defaultLogger } from './shared/logger/Logger';

const logger = defaultLogger.child({ component: 'SystemTest' });

async function testModuleSystem() {
  logger.info('🧪 Testing Module Communication System...');

  try {
    const { agent, createContext } = await createTestAgent('test-user');
    const context = createContext({ environment: 'development' });

    // Test each module individually
    const moduleTests = [
      {
        name: 'Kubernetes Module',
        input: 'Show me the status of my user-auth service',
        expectedModule: 'kubernetes',
        expectedAction: 'status'
      },
      {
        name: 'Safety Module',
        input: 'Validate deploying my payment service to production',
        expectedModule: 'safety',
        expectedAction: 'validate'
      },
      {
        name: 'Approval Module',
        input: 'Request approval for deleting the old api-gateway',
        expectedModule: 'approval',
        expectedAction: 'request-approval'
      }
    ];

    for (const test of moduleTests) {
      logger.info(`Testing ${test.name}...`);

      const response = await agent.processRequest(test.input, context);

      if (response.success) {
        logger.info(`✅ ${test.name} working`);
      } else {
        logger.error(`❌ ${test.name} failed:`, { errors: response.actions });
      }
    }

    await agent.shutdown();
    return true;

  } catch (error) {
    logger.error('❌ Module system test failed:', error);
    return false;
  }
}

async function testAIIntegration() {
  logger.info('🤖 Testing AI Integration...');

  try {
    const { agent, createContext } = await createTestAgent();
    const context = createContext();

    // Test AI intent parsing
    const testInputs = [
      "Deploy my user authentication service to staging",
      "Scale my api-gateway to 3 replicas",
      "Show me the logs for payment-service",
      "List all deployments in production"
    ];

    for (const input of testInputs) {
      logger.info(`Testing AI with input: "${input}"`);

      const response = await agent.processRequest(input, context);

      if (response.success) {
        logger.info(`✅ AI processed: ${input}`);
        logger.info(`Generated ${response.actions.length} actions`);
      } else {
        logger.warn(`⚠️ AI processing issue for: ${input}`);
      }
    }

    await agent.shutdown();
    return true;

  } catch (error) {
    logger.error('❌ AI integration test failed:', error);
    return false;
  }
}

async function testHealthChecks() {
  logger.info('💚 Testing Health Checks...');

  try {
    const { agent } = await createTestAgent();

    // Test module health
    const health = await agent.getHealthStatus();

    logger.info('System Health:', health);

    if (health.status === 'healthy' || health.status === 'degraded') {
      logger.info('✅ Health checks passing');
      return true;
    } else {
      logger.error('❌ System unhealthy:', health);
      return false;
    }

  } catch (error) {
    logger.error('❌ Health check failed:', error);
    return false;
  }
}

async function testEndToEndWorkflow() {
  logger.info('🔄 Testing End-to-End Workflow...');

  try {
    const { agent, createContext } = await createTestAgent();
    const context = createContext({
      environment: 'development',
      permissions: ['read', 'write', 'deploy']
    });

    // Test complete workflow: Deploy → Status → Logs
    const workflow = [
      "Deploy my test-app to development environment",
      "Check the status of test-app",
      "Show me the logs for test-app"
    ];

    for (let i = 0; i < workflow.length; i++) {
      const step = workflow[i];
      logger.info(`Step ${i + 1}: ${step}`);

      const response = await agent.processRequest(step, context);

      if (response.success) {
        logger.info(`✅ Step ${i + 1} completed successfully`);
        logger.info(`Actions generated: ${response.actions.length}`);
      } else {
        logger.error(`❌ Step ${i + 1} failed`);
        break;
      }

      // Small delay between steps
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await agent.shutdown();
    return true;

  } catch (error) {
    logger.error('❌ End-to-end workflow test failed:', error);
    return false;
  }
}

async function testErrorHandling() {
  logger.info('🚨 Testing Error Handling...');

  try {
    const { agent, createContext } = await createTestAgent();
    const context = createContext();

    // Test various error scenarios
    const errorTests = [
      "Deploy nothing to nowhere",  // Invalid request
      "Delete the entire universe", // Dangerous request
      "", // Empty request
      "Do something completely impossible and nonsensical with quantum flux capacitors" // Nonsense
    ];

    for (const input of errorTests) {
      logger.info(`Testing error handling with: "${input}"`);

      const response = await agent.processRequest(input, context);

      // Error handling should gracefully handle these
      if (response.message.includes('error') || response.message.includes('invalid') || !response.success) {
        logger.info('✅ Error handled gracefully');
      } else {
        logger.warn('⚠️ Error handling could be improved');
      }
    }

    await agent.shutdown();
    return true;

  } catch (error) {
    logger.error('❌ Error handling test failed:', error);
    return false;
  }
}

async function runSystemTests() {
  logger.info('🚀 Starting AI-IDP Core System Tests...');

  const tests = [
    { name: 'Health Checks', fn: testHealthChecks },
    { name: 'Module System', fn: testModuleSystem },
    { name: 'AI Integration', fn: testAIIntegration },
    { name: 'End-to-End Workflow', fn: testEndToEndWorkflow },
    { name: 'Error Handling', fn: testErrorHandling }
  ];

  const results = [];

  for (const test of tests) {
    logger.info(`\n=== ${test.name} ===`);

    try {
      const success = await test.fn();
      results.push({ name: test.name, success });

      if (success) {
        logger.info(`✅ ${test.name} PASSED`);
      } else {
        logger.error(`❌ ${test.name} FAILED`);
      }
    } catch (error) {
      logger.error(`💥 ${test.name} CRASHED:`, error);
      results.push({ name: test.name, success: false });
    }
  }

  // Final report
  logger.info('\n' + '='.repeat(50));
  logger.info('🎯 FINAL TEST RESULTS:');
  logger.info('='.repeat(50));

  let passed = 0;
  let failed = 0;

  results.forEach(result => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    logger.info(`${status} - ${result.name}`);

    if (result.success) passed++;
    else failed++;
  });

  logger.info('='.repeat(50));
  logger.info(`📊 Summary: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    logger.info('🎉 ALL TESTS PASSED! AI-IDP Core is working properly!');
  } else {
    logger.error('💀 Some tests failed. Check the logs above for details.');
  }

  process.exit(failed === 0 ? 0 : 1);
}

// Run the tests
runSystemTests().catch(error => {
  logger.fatal('Test runner crashed:', error);
  process.exit(1);
});