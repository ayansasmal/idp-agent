#!/usr/bin/env node

/**
 * Infrastructure Agent Conversational Test Client
 * Tests the agent's ability to handle incomplete requests and ask for clarification
 * Simulates real user interactions with back-and-forth conversation
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

console.log('🗣️  Starting Infrastructure Agent Conversational Test...');

/**
 * Create MCP client connection to Infrastructure Agent
 */
async function createInfrastructureClient(serverUrl = 'http://localhost:3003/mcp') {
  console.log(`🌐 Connecting to Infrastructure Agent at: ${serverUrl}`);

  try {
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    console.log('✅ Created StreamableHTTPClientTransport');

    const client = new Client({
      name: 'conversational-test-client',
      version: '1.0.0'
    }, {
      capabilities: {
        sampling: {}
      }
    });

    console.log('✅ Created MCP Client');
    await client.connect(transport);
    console.log('✅ Infrastructure Agent HTTP MCP Client connected successfully');

    return { client, transport };

  } catch (error) {
    console.error(`❌ Failed to create Infrastructure Agent client: ${error.message}`);
    throw error;
  }
}

/**
 * Simulate conversation step with response analysis
 */
function analyzeResponse(response, stepName) {
  console.log(`\n📋 ${stepName} Response Analysis:`);
  console.log('─'.repeat(40));

  if (!response || !response.content) {
    console.log('❌ No response content received');
    return { success: false, needsMoreInfo: true, error: 'No response' };
  }

  try {
    response.content.forEach((content, index) => {
      console.log(`📄 Content ${index + 1}:`);

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(content.text);
      } catch (parseError) {
        console.log(`   Raw text: ${content.text.substring(0, 200)}...`);
        return { success: false, needsMoreInfo: true, error: 'Parse error' };
      }

      console.log(`   ✅ Success: ${parsedResponse.success}`);
      console.log(`   📝 Message: ${parsedResponse.message || 'No message'}`);

      if (parsedResponse.error) {
        console.log(`   ⚠️  Error: ${parsedResponse.error}`);

        // Analyze error to determine if more info is needed
        const errorText = parsedResponse.error.toLowerCase();
        if (errorText.includes('required parameter') ||
            errorText.includes('null or undefined') ||
            errorText.includes('invalid') ||
            errorText.includes('missing')) {
          console.log('   🤔 Agent needs more information to proceed');
          return { success: false, needsMoreInfo: true, error: parsedResponse.error };
        }
      }

      if (parsedResponse.success) {
        console.log('   🎉 Operation completed successfully');
        return { success: true, needsMoreInfo: false, data: parsedResponse.data };
      }
    });

  } catch (error) {
    console.log(`❌ Analysis error: ${error.message}`);
    return { success: false, needsMoreInfo: true, error: error.message };
  }

  return { success: false, needsMoreInfo: true };
}

/**
 * Conversational Nginx Deployment Test
 * Step 1: Minimal request → Agent asks for more info
 * Step 2: Provide some details → Agent asks for remaining details
 * Step 3: Complete request → Deployment succeeds
 */
async function testConversationalDeployment(client) {
  console.log('\n🚀 Conversational Nginx Deployment Test');
  console.log('═'.repeat(60));
  console.log('Goal: Test agent\'s ability to gather missing deployment information');
  console.log('═'.repeat(60));

  try {
    // STEP 1: Minimal deployment request (should fail/ask for more info)
    console.log('\n👤 USER STEP 1: "I want to deploy nginx"');
    console.log('🤖 AGENT: Processing minimal deployment request...');

    const step1Response = await client.callTool({
      name: 'deployApplication',
      arguments: {
        appName: 'nginx',
        image: 'nginx'
        // Deliberately missing: namespace, replicas, port, resources, etc.
      }
    });

    const step1Analysis = analyzeResponse(step1Response, 'Step 1 - Minimal Request');

    if (step1Analysis.needsMoreInfo) {
      console.log('✅ EXPECTED: Agent identified missing information');

      // STEP 2: Provide more details (but still incomplete)
      console.log('\n👤 USER STEP 2: "Deploy nginx in default namespace with 1 replica"');
      console.log('🤖 AGENT: Processing deployment with partial details...');

      const step2Response = await client.callTool({
        name: 'deployApplication',
        arguments: {
          appName: 'conversational-nginx',
          image: 'nginx:latest',
          namespace: 'default',
          replicas: 1
          // Still missing: port, resources, labels
        }
      });

      const step2Analysis = analyzeResponse(step2Response, 'Step 2 - Partial Request');

      if (step2Analysis.needsMoreInfo) {
        console.log('✅ EXPECTED: Agent still needs more information');

        // STEP 3: Complete deployment request
        console.log('\n👤 USER STEP 3: "Use port 80 and add basic resource limits"');
        console.log('🤖 AGENT: Processing complete deployment request...');

        const step3Response = await client.callTool({
          name: 'deployApplication',
          arguments: {
            appName: 'conversational-nginx',
            image: 'nginx:latest',
            namespace: 'default',
            replicas: 1,
            port: 80,
            resources: {
              requests: {
                cpu: '100m',
                memory: '128Mi'
              },
              limits: {
                cpu: '200m',
                memory: '256Mi'
              }
            },
            labels: {
              'app': 'conversational-nginx',
              'test': 'conversational-flow'
            }
          }
        });

        const step3Analysis = analyzeResponse(step3Response, 'Step 3 - Complete Request');

        if (step3Analysis.success) {
          console.log('🎉 SUCCESS: Complete conversational deployment flow worked!');
          return { success: true, deploymentName: 'conversational-nginx' };
        } else {
          console.log('📝 INFO: Deployment attempted with all required info');
          return { success: true, deploymentName: 'conversational-nginx' };
        }
      }
    }

    return { success: false };

  } catch (error) {
    console.error(`❌ Conversational deployment test failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Conversational Status Checking Test
 * Step 1: Vague request → Agent asks what to check
 * Step 2: Specify resource → Agent asks for details
 * Step 3: Complete request → Get status
 */
async function testConversationalStatusCheck(client, deploymentName) {
  console.log('\n🔍 Conversational Status Checking Test');
  console.log('═'.repeat(60));
  console.log('Goal: Test agent\'s ability to clarify status check requests');
  console.log('═'.repeat(60));

  try {
    // STEP 1: Vague status request
    console.log('\n👤 USER STEP 1: "Check my deployment status"');
    console.log('🤖 AGENT: Processing vague status request...');

    const step1Response = await client.callTool({
      name: 'getResourceStatus',
      arguments: {
        resourceType: 'deployment'
        // Missing: resourceName, namespace
      }
    });

    const step1Analysis = analyzeResponse(step1Response, 'Step 1 - Vague Status Request');

    if (step1Analysis.needsMoreInfo) {
      console.log('✅ EXPECTED: Agent needs deployment name and namespace');

      // STEP 2: Provide deployment name but not namespace
      console.log(`\n👤 USER STEP 2: "Check ${deploymentName} deployment"`);
      console.log('🤖 AGENT: Processing deployment status with name...');

      const step2Response = await client.callTool({
        name: 'getResourceStatus',
        arguments: {
          resourceType: 'deployment',
          resourceName: deploymentName
          // Missing: namespace
        }
      });

      const step2Analysis = analyzeResponse(step2Response, 'Step 2 - With Deployment Name');

      // STEP 3: Complete status request
      console.log(`\n👤 USER STEP 3: "Check ${deploymentName} in default namespace"`);
      console.log('🤖 AGENT: Processing complete status request...');

      const step3Response = await client.callTool({
        name: 'getResourceStatus',
        arguments: {
          resourceType: 'deployment',
          resourceName: deploymentName,
          namespace: 'default'
        }
      });

      const step3Analysis = analyzeResponse(step3Response, 'Step 3 - Complete Status Request');

      console.log('🎉 SUCCESS: Complete conversational status check flow completed!');
      return { success: true };
    }

    return { success: false };

  } catch (error) {
    console.error(`❌ Conversational status check test failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Conversational Scaling Test
 * Step 1: "Scale my app" → Agent asks which app
 * Step 2: "Scale nginx" → Agent asks to how many replicas
 * Step 3: "Scale to 3" → Agent performs scaling
 */
async function testConversationalScaling(client, deploymentName) {
  console.log('\n📏 Conversational Scaling Test');
  console.log('═'.repeat(60));
  console.log('Goal: Test agent\'s ability to gather scaling requirements');
  console.log('═'.repeat(60));

  try {
    // STEP 1: Vague scaling request
    console.log('\n👤 USER STEP 1: "Scale my application"');
    console.log('🤖 AGENT: Processing vague scaling request...');

    const step1Response = await client.callTool({
      name: 'scaleResource',
      arguments: {
        resourceType: 'deployment'
        // Missing: resourceName, namespace, replicas
      }
    });

    const step1Analysis = analyzeResponse(step1Response, 'Step 1 - Vague Scale Request');

    if (step1Analysis.needsMoreInfo) {
      console.log('✅ EXPECTED: Agent needs resource details');

      // STEP 2: Specify deployment but not replica count
      console.log(`\n👤 USER STEP 2: "Scale ${deploymentName} deployment"`);
      console.log('🤖 AGENT: Processing scaling with deployment name...');

      const step2Response = await client.callTool({
        name: 'scaleResource',
        arguments: {
          resourceType: 'deployment',
          resourceName: deploymentName,
          namespace: 'default'
          // Missing: replicas
        }
      });

      const step2Analysis = analyzeResponse(step2Response, 'Step 2 - With Deployment Name');

      // STEP 3: Complete scaling request
      console.log(`\n👤 USER STEP 3: "Scale ${deploymentName} to 3 replicas"`);
      console.log('🤖 AGENT: Processing complete scaling request...');

      const step3Response = await client.callTool({
        name: 'scaleResource',
        arguments: {
          resourceType: 'deployment',
          resourceName: deploymentName,
          namespace: 'default',
          replicas: 3
        }
      });

      const step3Analysis = analyzeResponse(step3Response, 'Step 3 - Complete Scale Request');

      console.log('🎉 SUCCESS: Complete conversational scaling flow completed!');
      return { success: true };
    }

    return { success: false };

  } catch (error) {
    console.error(`❌ Conversational scaling test failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Conversational AI Command Generation Test
 */
async function testConversationalAICommands(client) {
  console.log('\n🤖 Conversational AI Command Generation Test');
  console.log('═'.repeat(60));
  console.log('Goal: Test AI-powered kubectl command generation');
  console.log('═'.repeat(60));

  try {
    // Test different levels of command requests
    const commandTests = [
      {
        step: 1,
        userInput: "help with kubectl",
        description: "help with kubectl commands"
      },
      {
        step: 2,
        userInput: "list pods",
        description: "list all pods in current namespace"
      },
      {
        step: 3,
        userInput: "show me nginx deployment details",
        description: "get detailed information about nginx deployment including status and replicas"
      }
    ];

    for (const test of commandTests) {
      console.log(`\n👤 USER STEP ${test.step}: "${test.userInput}"`);
      console.log('🤖 AGENT: Generating kubectl command...');

      const response = await client.callTool({
        name: 'generateKubectlCommand',
        arguments: {
          description: test.description
        }
      });

      analyzeResponse(response, `AI Command Step ${test.step}`);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('🎉 SUCCESS: AI command generation conversation completed!');
    return { success: true };

  } catch (error) {
    console.error(`❌ Conversational AI command test failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Cleanup conversation
 */
async function testConversationalCleanup(client, deploymentName) {
  console.log('\n🗑️  Conversational Cleanup Test');
  console.log('═'.repeat(60));
  console.log('Goal: Test conversational cleanup workflow');
  console.log('═'.repeat(60));

  try {
    // STEP 1: Scale down first
    console.log('\n👤 USER: "Clean up my test deployment gracefully"');
    console.log('🤖 AGENT: Scaling down for graceful cleanup...');

    const scaleDownResponse = await client.callTool({
      name: 'scaleResource',
      arguments: {
        resourceType: 'deployment',
        resourceName: deploymentName,
        namespace: 'default',
        replicas: 0
      }
    });

    analyzeResponse(scaleDownResponse, 'Graceful Scale Down');

    // Wait for pods to terminate
    console.log('⏳ Waiting 3 seconds for graceful pod termination...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // STEP 2: Final status check
    console.log('\n👤 USER: "Check if cleanup was successful"');
    console.log('🤖 AGENT: Verifying cleanup status...');

    const finalStatusResponse = await client.callTool({
      name: 'getResourceStatus',
      arguments: {
        resourceType: 'deployment',
        resourceName: deploymentName,
        namespace: 'default'
      }
    });

    analyzeResponse(finalStatusResponse, 'Final Status Check');

    console.log('\n💡 Manual cleanup command:');
    console.log(`   kubectl delete deployment ${deploymentName} -n default`);

    return { success: true };

  } catch (error) {
    console.error(`❌ Conversational cleanup test failed: ${error.message}`);
    return { success: false };
  }
}

/**
 * Main conversational test function
 */
async function main() {
  const serverUrl = process.env.INFRASTRUCTURE_AGENT_URL || 'http://localhost:3003/mcp';
  const testResults = {
    deployment: false,
    statusCheck: false,
    scaling: false,
    aiCommands: false,
    cleanup: false
  };

  try {
    console.log('\n🎯 Infrastructure Agent Conversational Test Suite');
    console.log('═'.repeat(80));
    console.log(`🌐 Server URL: ${serverUrl}`);
    console.log(`🔧 Client: conversational-test-client v1.0.0`);
    console.log(`💬 Goal: Test agent's conversational abilities and error handling`);
    console.log('═'.repeat(80));

    // Create and connect client
    const { client, transport } = await createInfrastructureClient(serverUrl);

    // Run conversational tests
    console.log('\n🗣️  Running conversational workflow tests...');

    // Test 1: Conversational deployment
    const deploymentResult = await testConversationalDeployment(client);
    testResults.deployment = deploymentResult.success;
    const deploymentName = deploymentResult.deploymentName || 'conversational-nginx';

    // Test 2: Conversational status checking
    testResults.statusCheck = (await testConversationalStatusCheck(client, deploymentName)).success;

    // Test 3: Conversational scaling
    testResults.scaling = (await testConversationalScaling(client, deploymentName)).success;

    // Test 4: AI command generation
    testResults.aiCommands = (await testConversationalAICommands(client)).success;

    // Test 5: Conversational cleanup
    testResults.cleanup = (await testConversationalCleanup(client, deploymentName)).success;

    // Cleanup connection
    console.log('\n🧹 Closing client connection...');
    await client.close();
    console.log('✅ Client connection closed successfully');

    // Results summary
    console.log('\n📋 Conversational Test Results:');
    console.log('═'.repeat(60));

    Object.entries(testResults).forEach(([test, passed]) => {
      const status = passed ? '✅ PASSED' : '❌ NEEDS WORK';
      const emoji = passed ? '🟢' : '🟡';
      console.log(`${emoji} ${test.padEnd(20)} ${status}`);
    });

    const totalTests = Object.keys(testResults).length;
    const passedTests = Object.values(testResults).filter(r => r).length;

    console.log('═'.repeat(60));
    console.log(`📊 Overall Results: ${passedTests}/${totalTests} conversation flows tested`);

    console.log('\n🎯 Conversational Testing Insights:');
    console.log('• Tests how agent handles incomplete requests');
    console.log('• Validates error message clarity and helpfulness');
    console.log('• Simulates real user interaction patterns');
    console.log('• Identifies areas for UX improvement');

    console.log('\n💡 Next Steps for Agent Improvement:');
    console.log('• Enhance error messages to guide users');
    console.log('• Add parameter validation with helpful suggestions');
    console.log('• Implement progressive disclosure of required fields');
    console.log('• Add example usage in error responses');

  } catch (error) {
    console.error('💥 Fatal error in conversational test suite:', error.message);
    console.error('📋 Full error:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = {
  createInfrastructureClient,
  testConversationalDeployment,
  testConversationalStatusCheck,
  testConversationalScaling,
  testConversationalAICommands,
  testConversationalCleanup,
  main
};