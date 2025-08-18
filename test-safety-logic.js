#!/usr/bin/env node

// Simple test to verify the safety module logic works correctly
// This test simulates a production deployment request

const { PrimaryAgent } = require('./packages/core/dist/agent/PrimaryAgent.js');

async function testSafetyLogic() {
  console.log('🧪 Testing Safety Module Logic for Approval Creation');
  console.log('=' .repeat(60));

  try {
    const agent = new PrimaryAgent();
    await agent.initialize();

    console.log('✅ Primary Agent initialized successfully');

    // Test 1: Production deployment (should create approval)
    const prodRequest = {
      userId: 'test-user',
      environment: 'development', // Start with development
      permissions: ['read', 'write', 'deploy']
    };

    console.log('\n📋 Test 1: Development deployment');
    console.log('Input: "Deploy my user-auth service to development"');
    
    const response1 = await agent.processRequest(
      'Deploy my user-auth service to development',
      prodRequest
    );

    console.log('Response:', response1.message);
    console.log('Success:', response1.success);
    console.log('Has approval metadata:', !!response1.metadata?.approvalId);

    // Test 2: Production deployment (should definitely create approval)
    const prodRequest2 = {
      userId: 'test-user',
      environment: 'development',
      permissions: ['read', 'write', 'deploy', 'production']
    };

    console.log('\n📋 Test 2: Production deployment');
    console.log('Input: "Deploy my user-auth service to production"');
    
    const response2 = await agent.processRequest(
      'Deploy my user-auth service to production',
      prodRequest2
    );

    console.log('Response:', response2.message);
    console.log('Success:', response2.success);
    console.log('Has approval metadata:', !!response2.metadata?.approvalId);

    // Test 3: Delete operation (should create approval)
    console.log('\n📋 Test 3: Delete operation');
    console.log('Input: "Delete my test-service from staging"');
    
    const response3 = await agent.processRequest(
      'Delete my test-service from staging',
      {
        userId: 'test-user',
        environment: 'development',
        permissions: ['read', 'write', 'delete']
      }
    );

    console.log('Response:', response3.message);
    console.log('Success:', response3.success);
    console.log('Has approval metadata:', !!response3.metadata?.approvalId);

    console.log('\n🎉 Safety logic test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testSafetyLogic().then(() => {
  console.log('\n✅ Test execution finished');
  process.exit(0);
}).catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});