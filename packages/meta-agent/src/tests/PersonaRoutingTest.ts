#!/usr/bin/env tsx
/**
 * Persona-Based Routing Test
 *
 * This test verifies that the PersonaRouter correctly classifies user input
 * and extracts parameters using markdown persona definitions.
 *
 * Run with: npx tsx src/tests/PersonaRoutingTest.ts
 */

import { PersonaRouter } from '../persona/PersonaRouter';
import type { ConversationContext } from '@ai-idp/types';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '@ai-idp/utils';
import { join } from 'path';

async function testPersonaRouting() {
  console.log('🎭 Testing Persona-Based Routing\n');

  // Initialize required dependencies
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
  });

  const logger = createLogger({
    service: 'persona-routing-test',
    level: 'info',
    environment: 'development'
  });

  // Set up agent configurations with persona paths
  const agentConfigs = new Map();

  const basePath = join(__dirname, '../../agents');

  agentConfigs.set('infrastructure', {
    name: 'infrastructure',
    filePath: join(basePath, 'infrastructure/personas/infrastructure-agent.md'),
    url: 'http://localhost:3003/mcp',
    enabled: true
  });

  agentConfigs.set('observability', {
    name: 'observability',
    filePath: join(basePath, 'observability/personas/observability-agent.md'),
    url: 'http://localhost:3005/mcp',
    enabled: true
  });

  const personaRouter = new PersonaRouter(
    agentConfigs,
    anthropic,
    null,
    logger
  );

  // Test context
  const context: ConversationContext = {
    conversationId: 'test-conv-001',
    userId: 'test-user',
    sessionId: 'test-session-001',
    history: [],
    metadata: {
      source: 'test',
      environment: 'production'
    }
  };

  // Test cases that should be routed correctly with proper parameter extraction
  const testCases = [
    {
      input: 'deploy nginx',
      expectedAgent: 'infrastructure',
      expectedAction: 'deployApplication',
      expectedParams: {
        resourceName: 'nginx',
        containerImage: 'nginx:latest'
      }
    },
    {
      input: 'Deploy my app called myservice with 3 replicas to production',
      expectedAgent: 'infrastructure',
      expectedAction: 'deployApplication',
      expectedParams: {
        resourceName: 'myservice',
        containerImage: 'myservice:latest',
        replicas: 3,
        environment: 'production'
      }
    },
    {
      input: 'scale webapp to 5 instances',
      expectedAgent: 'infrastructure',
      expectedAction: 'scaleResource',
      expectedParams: {
        resourceName: 'webapp',
        replicas: 5
      }
    },
    {
      input: 'check status of api service',
      expectedAgent: 'infrastructure',
      expectedAction: 'getResourceStatus',
      expectedParams: {
        resourceName: 'api'
      }
    },
    {
      input: 'analyze error logs for webapp last 30 minutes',
      expectedAgent: 'observability',
      expectedAction: 'analyzeLogs',
      expectedParams: {
        service: 'webapp',
        logLevel: 'error',
        timeRange: '30m'
      }
    },
    {
      input: 'check CPU metrics for database service',
      expectedAgent: 'observability',
      expectedAction: 'analyzeMetrics',
      expectedParams: {
        query: 'database CPU',
        service: 'database'
      }
    },
    {
      input: 'create monitoring dashboard for microservices',
      expectedAgent: 'observability',
      expectedAction: 'createDashboard',
      expectedParams: {
        name: 'microservices',
        services: ['microservices']
      }
    }
  ];

  console.log('🔍 Testing persona-based routing for different user inputs:\n');

  let passedTests = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    try {
      console.log(`👤 User Input: "${testCase.input}"`);

      const intent = await personaRouter.routeWithPersona(
        testCase.input,
        context,
        [] // No relevant context for this test
      );

      console.log('🎭 Persona Routing Result:');
      console.log(`  Agent: ${intent.agent}`);
      console.log(`  Action: ${intent.action}`);
      console.log(`  Confidence: ${intent.confidence}`);
      console.log('  Parameters:');

      if (Object.keys(intent.parameters).length === 0) {
        console.log('    ❌ NO PARAMETERS EXTRACTED');
      } else {
        Object.entries(intent.parameters).forEach(([key, value]) => {
          console.log(`    ${key}: ${JSON.stringify(value)}`);
        });
      }

      // Validate results
      console.log('  Validation:');

      let testPassed = true;

      // Check agent routing
      const agentCorrect = intent.agent === testCase.expectedAgent;
      console.log(`    Agent: ${agentCorrect ? '✅' : '❌'} (expected: ${testCase.expectedAgent}, got: ${intent.agent})`);
      if (!agentCorrect) testPassed = false;

      // Check action classification
      const actionCorrect = intent.action === testCase.expectedAction;
      console.log(`    Action: ${actionCorrect ? '✅' : '❌'} (expected: ${testCase.expectedAction}, got: ${intent.action})`);
      if (!actionCorrect) testPassed = false;

      // Check parameter extraction
      Object.entries(testCase.expectedParams).forEach(([expectedKey, expectedValue]) => {
        const actualValue = intent.parameters[expectedKey];
        const paramCorrect = actualValue === expectedValue;
        console.log(`    ${expectedKey}: ${paramCorrect ? '✅' : '❌'} (expected: ${JSON.stringify(expectedValue)}, got: ${JSON.stringify(actualValue)})`);
        if (!paramCorrect) testPassed = false;
      });

      // Check confidence level
      const confidenceOk = intent.confidence >= 0.7;
      console.log(`    Confidence: ${confidenceOk ? '✅' : '❌'} (${intent.confidence >= 0.7 ? 'High' : 'Low'} confidence: ${intent.confidence})`);
      if (!confidenceOk) testPassed = false;

      if (testPassed) {
        console.log('    🎉 PERSONA ROUTING SUCCESS!');
        passedTests++;
      } else {
        console.log('    💥 PERSONA ROUTING FAILED!');
      }

      console.log('');

    } catch (error: any) {
      console.log(`❌ Error processing "${testCase.input}": ${error.message}\n`);
      console.log('Stack trace:', error.stack);
    }
  }

  console.log(`🏁 Persona routing test completed!`);
  console.log(`📊 Results: ${passedTests}/${totalTests} tests passed`);

  if (passedTests === totalTests) {
    console.log('🎉 All persona routing tests PASSED! The persona system is working correctly!');
  } else {
    console.log('⚠️  Some persona routing tests failed. Review the results above.');
  }

  // Display routing statistics
  const stats = personaRouter.getStats();
  console.log('\n📈 PersonaRouter Statistics:');
  console.log(`  Available Agents: ${stats.availableAgents.join(', ')}`);
  console.log(`  Enabled Agents: ${stats.enabledAgents.join(', ')}`);
  console.log(`  Cached Personas: ${stats.cachedPersonas.length}`);
}

// Run test
testPersonaRouting().catch(console.error);