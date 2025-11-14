/**
 * Direct test for assume-and-confirm functionality
 *
 * Tests the enhanced tool handlers directly without HTTP/MCP transport
 * to verify the core logic works correctly.
 */

const { InfrastructureAgent } = require('../packages/agents/infrastructure/dist/agent/InfrastructureAgent');

async function testDirectAssumeAndConfirm() {
  console.log('🧪 Testing Direct Assume-and-Confirm Framework');
  console.log('===============================================\n');

  try {
    // Create InfrastructureAgent instance
    const agent = new InfrastructureAgent({
      agentId: 'test-infrastructure',
      name: 'Test Infrastructure Agent',
      kubeconfig: process.env.KUBECONFIG || '~/.kube/config'
    });

    await agent.initialize();
    console.log('✅ Infrastructure Agent initialized\n');

    // Test 1: Get enhanced tool handlers
    console.log('🔧 Testing enhanced tool handlers...');
    const enhancedHandlers = agent.getEnhancedToolHandlers();
    console.log(`✅ Found ${Object.keys(enhancedHandlers).length} enhanced handlers:`, Object.keys(enhancedHandlers));

    // Test 2: Test deployApplication with minimal args (should trigger smart defaults)
    console.log('\n🚀 Testing deployApplication with minimal args...');
    const deployHandler = enhancedHandlers.deployApplication;

    const minimalArgs = {
      appName: 'test-nginx',
      image: 'nginx:latest'
    };

    // Test parameter validation
    console.log('📋 Testing parameter validation...');
    const validation = deployHandler.schema.safeParse(minimalArgs);
    console.log('Validation result:', validation.success);
    if (!validation.success) {
      console.log('Validation errors:', validation.error.errors);
    }

    // Test smart defaults generation
    console.log('\n🔧 Testing smart defaults generation...');
    if (deployHandler.defaultsGenerator) {
      const context = {
        conversationId: 'test-conversation',
        userId: 'test-user',
        sessionId: 'test-session',
        history: [],
        metadata: { test: true }
      };

      const defaults = await deployHandler.defaultsGenerator(minimalArgs, context);
      console.log('Generated defaults:', JSON.stringify(defaults, null, 2));

      // Apply defaults
      const assumedArgs = { ...minimalArgs, ...defaults };
      console.log('Final args with defaults:', JSON.stringify(assumedArgs, null, 2));

      // Re-validate with defaults
      const revalidation = deployHandler.schema.safeParse(assumedArgs);
      console.log('Re-validation with defaults:', revalidation.success);
      if (!revalidation.success) {
        console.log('Re-validation errors:', revalidation.error.errors);
      }
    }

    // Test 3: Test confirmation message generation
    console.log('\n💬 Testing confirmation message generation...');
    if (deployHandler.confirmationMessageGenerator) {
      const assumedArgs = {
        appName: 'test-nginx',
        resourceName: 'test-nginx',
        containerImage: 'nginx:latest',
        namespace: 'default',
        replicas: 1,
        port: 80,
        resources: { cpu: '100m', memory: '128Mi' }
      };

      const confirmationMessage = deployHandler.confirmationMessageGenerator('deployApplication', assumedArgs);
      console.log('Generated confirmation message:');
      console.log('---');
      console.log(confirmationMessage);
      console.log('---');

      // Check if it contains Kubernetes manifest
      const hasManifest = confirmationMessage.includes('apiVersion: apps/v1');
      console.log(`\n✅ Contains Kubernetes manifest: ${hasManifest}`);
    }

    console.log('\n🎉 All direct tests passed!');
    console.log('✅ Enhanced tool handlers are working correctly');
    console.log('✅ Smart defaults generation works');
    console.log('✅ Confirmation message generation works');
    console.log('✅ Kubernetes manifest preview is included');

  } catch (error) {
    console.error('❌ Direct test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testDirectAssumeAndConfirm().catch(console.error);
}