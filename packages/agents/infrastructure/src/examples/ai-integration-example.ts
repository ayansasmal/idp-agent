#!/usr/bin/env node

import { InfrastructureAgent } from '../agent/InfrastructureAgent';

/**
 * Example usage of AI-powered Kubernetes operations in Infrastructure Agent
 * 
 * This example demonstrates the new AI capabilities integrated with the
 * Kubernetes Operator 3B model from Hugging Face.
 * 
 * Prerequisites:
 * - Ollama running on localhost:11434
 * - K8sAIOps/kubernetes_operator_3b_peft_gguf model pulled in Ollama
 * 
 * Usage:
 * tsx src/examples/ai-integration-example.ts
 */
async function runAIExample() {
  console.log('🤖 AI-Powered Infrastructure Agent Example\n');

  // Initialize Infrastructure Agent with AI configuration
  const agent = new InfrastructureAgent({
    agentId: 'infrastructure-ai-demo',
    name: 'AI Infrastructure Agent Demo',
    // Enable AI features
    kubernetesAI: {
      ollamaUrl: 'http://localhost:11434',
      modelName: 'hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf:latest',
      temperature: 0.1,
      timeout: 30000
    }
  });

  try {
    // Initialize the agent
    console.log('🚀 Initializing AI Infrastructure Agent...');
    await agent.initialize();
    console.log('✅ Agent initialized successfully\n');

    // Example 1: Generate kubectl command from natural language
    console.log('📝 Example 1: Generate kubectl command');
    console.log('Intent: "show me all running pods in the production namespace"');

    const commandResult = await agent.generateKubectlCommand({
      intent: 'show me all running pods in the production namespace',
      namespace: 'production',
      includeClusterContext: true,
      context: {
        conversationId: 'demo-conversation',
        userId: 'demo-user',
        sessionId: 'demo-session',
        history: [],
        metadata: { example: 'kubectl-generation' }
      }
    });

    console.log('Generated Command:', commandResult.command);
    console.log('Explanation:', commandResult.explanation);
    console.log('Risk Level:', commandResult.riskLevel);
    console.log('Confidence:', commandResult.confidence);
    if (commandResult.warnings) {
      console.log('Warnings:', commandResult.warnings);
    }
    console.log();

    // Example 2: Generate Kubernetes manifest from natural language
    console.log('📄 Example 2: Generate Kubernetes manifest');
    console.log('Intent: "create a nginx deployment with 3 replicas and resource limits"');

    const manifestResult = await agent.generateKubernetesManifest({
      intent: 'create a nginx deployment with 3 replicas and resource limits',
      resourceType: 'Deployment',
      appName: 'nginx-demo',
      namespace: 'default',
      parameters: {
        replicas: 3,
        image: 'nginx:latest',
        port: 80,
        resources: {
          limits: { cpu: '500m', memory: '512Mi' },
          requests: { cpu: '250m', memory: '256Mi' }
        }
      },
      context: {
        conversationId: 'demo-conversation',
        userId: 'demo-user',
        sessionId: 'demo-session',
        history: [],
        metadata: { example: 'manifest-generation' }
      }
    });

    console.log('Generated Manifest:');
    console.log('---');
    console.log(manifestResult.manifest);
    console.log('---');
    console.log('Metadata:', manifestResult.metadata);
    console.log('Valid:', manifestResult.isValid);
    if (manifestResult.validationErrors?.length) {
      console.log('Validation Errors:', manifestResult.validationErrors);
    }
    if (manifestResult.recommendations?.length) {
      console.log('Recommendations:', manifestResult.recommendations);
    }
    console.log();

    // Example 3: More complex scenarios
    console.log('🔧 Example 3: Complex kubectl operations');

    const complexCommands = [
      'scale the nginx deployment to 5 replicas',
      'delete all failed pods in the kube-system namespace',
      'show resource usage for all nodes',
      'create a service to expose the nginx deployment on port 80'
    ];

    for (const intent of complexCommands) {
      console.log(`\n🔍 Processing: "${intent}"`);

      const result = await agent.generateKubectlCommand({
        intent,
        includeClusterContext: false, // Skip context for faster processing
        context: {
          conversationId: 'demo-conversation',
          userId: 'demo-user',
          sessionId: 'demo-session',
          history: [],
          metadata: { example: 'complex-operations' }
        }
      });

      if (result.success) {
        console.log(`  ✅ ${result.command}`);
        console.log(`  📖 ${result.explanation}`);
        console.log(`  ⚠️  Risk: ${result.riskLevel} | Confidence: ${result.confidence}`);
      } else {
        console.log(`  ❌ Error: ${result.error}`);
      }
    }

    console.log('\n🎉 AI Integration Example completed successfully!');
    console.log('\n📊 Summary:');
    console.log('- AI-powered kubectl command generation ✅');
    console.log('- AI-powered manifest generation ✅');
    console.log('- Risk assessment and confidence scoring ✅');
    console.log('- Natural language to Kubernetes operations ✅');

  } catch (error) {
    console.error('❌ Error running AI example:', error);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Ensure Ollama is running: curl http://localhost:11434/api/tags');
    console.log('2. Check if K8s model is available: "hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf:latest"');
    console.log('3. Verify model was pulled correctly');
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runAIExample()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { runAIExample };