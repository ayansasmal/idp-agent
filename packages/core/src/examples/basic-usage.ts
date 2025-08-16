#!/usr/bin/env tsx

/**
 * Basic usage example for the AI-IDP Core Agent
 * This demonstrates the primary agent functionality with natural language requests
 */

import 'dotenv/config';
import { createTestAgent, validateEnvironment } from '../index';

async function main() {
  console.log('🚀 AI-IDP Core Agent - Basic Usage Example\n');

  // Validate environment
  console.log('Validating environment...');
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    console.error('❌ Environment validation failed:');
    envCheck.errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
  console.log('✅ Environment validation passed\n');

  try {
    // Create agent
    console.log('Initializing AI Agent...');
    const { agent, createContext } = await createTestAgent('demo-user');
    console.log('✅ Agent initialized successfully\n');

    // Test context
    const context = createContext({
      environment: 'development',
      permissions: ['read', 'write', 'deploy'],
    });

    console.log('Testing various natural language requests:\n');

    // Example 1: Basic status check
    console.log('🔍 Example 1: Status Check');
    console.log('User: "Show me the status of my user-service"');
    
    const response1 = await agent.processRequest(
      'Show me the status of my user-service',
      context
    );
    
    console.log(`Agent: ${response1.message}`);
    console.log(`Success: ${response1.success}\n`);

    // Example 2: Deployment request
    console.log('🚀 Example 2: Deployment Request');
    console.log('User: "Deploy my node.js app called api-gateway to development"');
    
    const response2 = await agent.processRequest(
      'Deploy my node.js app called api-gateway to development',
      context
    );
    
    console.log(`Agent: ${response2.message}`);
    console.log(`Success: ${response2.success}`);
    if (response2.actions.length > 0) {
      console.log(`Planned Action: ${response2.actions[0].action} ${response2.actions[0].resourceName}`);
      console.log(`Risk Level: ${response2.actions[0].riskLevel}`);
    }
    console.log('');

    // Example 3: Scaling request
    console.log('📊 Example 3: Scaling Request');
    console.log('User: "Scale my payment-service to 5 replicas"');
    
    const response3 = await agent.processRequest(
      'Scale my payment-service to 5 replicas',
      context
    );
    
    console.log(`Agent: ${response3.message}`);
    console.log(`Success: ${response3.success}\n`);

    // Example 4: Chat interaction
    console.log('💬 Example 4: Conversational Chat');
    console.log('User: "What can you help me with?"');
    
    const chatResponse = await agent.chat(
      'What can you help me with?',
      context
    );
    
    console.log(`Agent: ${chatResponse}\n`);

    // Example 5: Health check
    console.log('❤️ Example 5: Agent Health Check');
    const health = await agent.getHealthStatus();
    console.log(`Overall Status: ${health.status}`);
    console.log('Component Health:');
    Object.entries(health.checks).forEach(([component, check]) => {
      const status = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
      console.log(`  ${status} ${component}: ${check.message}`);
    });
    console.log('');

    // Example 6: Production deployment (high risk)
    console.log('⚠️  Example 6: High-Risk Production Deployment');
    console.log('User: "Deploy my payment-service to production"');
    
    const prodContext = createContext({
      environment: 'production',
      permissions: ['read', 'write', 'deploy'],
    });
    
    const response6 = await agent.processRequest(
      'Deploy my payment-service to production',
      prodContext
    );
    
    console.log(`Agent: ${response6.message}`);
    console.log(`Success: ${response6.success}`);
    if (response6.actions.length > 0) {
      console.log(`Risk Level: ${response6.actions[0].riskLevel} (should be high/critical)`);
      console.log(`Requires Approval: This would typically require human approval`);
    }
    console.log('');

    // Shutdown
    console.log('Shutting down agent...');
    await agent.shutdown();
    console.log('✅ Agent shutdown complete');

  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Run example
if (require.main === module) {
  main().catch(console.error);
}

export { main as runBasicExample };