#!/usr/bin/env npx tsx

/**
 * Quick Demo of AI-IDP Phase 1 Foundation
 * Run: npx tsx demo.ts
 */

import 'dotenv/config';

// Import our core package
import { createTestAgent, validateEnvironment, defaultLogger } from './packages/core/src/index';

async function demo() {
  const logger = defaultLogger.child({ component: 'Demo' });

  console.log(`
🤖 AI-IDP Phase 1 Foundation Demo
================================

This demonstrates the core agent foundation with:
✅ LangChain + Anthropic Claude integration
✅ Modular architecture ready for extraction
✅ Type-safe structured responses
✅ Comprehensive logging and error handling
✅ Natural language platform operations

`);

  // Environment check
  console.log('🔍 Checking environment...');
  const envCheck = validateEnvironment();
  
  if (!envCheck.valid) {
    console.log('❌ Environment issues found:');
    envCheck.errors.forEach(error => console.log(`   ${error}`));
    
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log(`
💡 To run this demo:
   1. Get an Anthropic API key from https://console.anthropic.com/
   2. Set environment variable: export ANTHROPIC_API_KEY=your_key_here
   3. Run: npx tsx demo.ts
`);
    }
    return;
  }

  console.log('✅ Environment looks good!\n');

  try {
    // Initialize agent
    console.log('🚀 Initializing AI Agent...');
    const { agent, createContext } = await createTestAgent('demo-user');
    console.log('✅ Agent ready!\n');

    // Create test context
    const context = createContext({
      environment: 'development',
      permissions: ['read', 'write', 'deploy'],
    });

    // Demo 1: Simple chat
    console.log('💬 Demo 1: Natural Language Processing');
    console.log('User: "Hello! Can you help me deploy my app?"');
    
    const greeting = await agent.chat(
      'Hello! Can you help me deploy my app?',
      context
    );
    
    console.log(`AI Agent: ${greeting}\n`);

    // Demo 2: Structured platform action
    console.log('🚀 Demo 2: Platform Operation Intent Parsing');
    console.log('User: "Deploy my user-auth service to development environment"');
    
    const deployResponse = await agent.processRequest(
      'Deploy my user-auth service to development environment',
      context
    );
    
    console.log(`AI Agent: ${deployResponse.message}`);
    
    if (deployResponse.actions.length > 0) {
      const action = deployResponse.actions[0];
      console.log(`
📋 Parsed Action Details:
   Action: ${action.action}
   Resource: ${action.resourceName} (${action.resourceType})
   Environment: ${action.environment}
   Risk Level: ${action.riskLevel}
   Explanation: ${action.explanation}
`);
    }

    // Demo 3: Health check
    console.log('❤️ Demo 3: System Health');
    const health = await agent.getHealthStatus();
    console.log(`Overall Status: ${health.status}`);
    console.log('Components:');
    Object.entries(health.checks).forEach(([name, check]) => {
      const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
      console.log(`   ${icon} ${name}: ${check.message}`);
    });

    console.log(`
🎉 Demo Complete!

What we just demonstrated:
✅ AI agent successfully initialized with LangChain + Anthropic
✅ Natural language understanding of platform operations  
✅ Structured response parsing with risk assessment
✅ Type-safe module communication architecture
✅ Comprehensive health monitoring

Next Steps:
📦 Implement the 4 core modules (Kubernetes, Safety, Approval, Audit)
🔗 Add module registration and communication
🎯 Build specialized platform operations
🌐 Add web interface and Slack integration

This foundation is ready for Phase 1 module implementation!
`);

    await agent.shutdown();

  } catch (error) {
    logger.error('Demo failed', error);
    console.log('\n❌ Demo failed. Check your environment and API key.');
  }
}

// Run demo
demo().catch(console.error);