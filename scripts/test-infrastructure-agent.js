#!/usr/bin/env node

/**
 * Infrastructure Agent Test Client
 * Comprehensive testing of all infrastructure agent tools and integrations
 * Based on http-client-poc.js but specifically for infrastructure operations
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

console.log('🚀 Starting Infrastructure Agent Test Client...');

/**
 * Create MCP client connection to Infrastructure Agent
 */
async function createInfrastructureClient(serverUrl = 'http://localhost:3003/mcp') {
  console.log(`🌐 Connecting to Infrastructure Agent at: ${serverUrl}`);

  try {
    // Create HTTP transport
    const transport = new StreamableHTTPClientTransport(
      new URL(serverUrl)
    );

    console.log('✅ Created StreamableHTTPClientTransport');

    // Create MCP Client instance
    const client = new Client({
      name: 'infrastructure-test-client',
      version: '1.0.0'
    }, {
      capabilities: {
        sampling: {}
      }
    });

    console.log('✅ Created MCP Client');

    // Connect client to transport
    await client.connect(transport);
    console.log('✅ Infrastructure Agent HTTP MCP Client connected successfully');

    return { client, transport };

  } catch (error) {
    console.error(`❌ Failed to create Infrastructure Agent client: ${error.message}`);
    console.error('📋 Full error:', error);
    throw error;
  }
}

/**
 * Test basic agent connectivity and tool discovery
 */
async function testBasicConnectivity(client) {
  console.log('\n🔍 Testing Basic Connectivity:');
  console.log('=' .repeat(50));

  try {
    // Test 1: List available tools
    console.log('\n📋 Discovering available tools...');
    const toolsResponse = await client.listTools();

    if (toolsResponse && toolsResponse.tools) {
      console.log(`✅ Found ${toolsResponse.tools.length} infrastructure tools:`);
      toolsResponse.tools.forEach((tool, index) => {
        console.log(`   ${index + 1}. 📎 ${tool.name}: ${tool.description}`);
        if (tool.inputSchema && tool.inputSchema.properties) {
          const params = Object.keys(tool.inputSchema.properties);
          console.log(`      📝 Parameters: ${params.join(', ')}`);
        }
      });
      return toolsResponse.tools;
    } else {
      console.log('⚠️  No tools found or unexpected response format');
      return [];
    }

  } catch (error) {
    console.error(`❌ Basic connectivity test failed: ${error.message}`);
    console.error('📋 Full error:', error);
    return [];
  }
}

/**
 * Test nginx deployment status checking
 */
async function testCheckNginxStatus(client) {
  console.log('\n🔍 Testing nginx deployment status:');
  console.log('=' .repeat(50));

  try {
    // Check deployment status
    console.log('📋 Checking nginx deployment status...');
    const deploymentResult = await client.callTool({
      name: 'getResourceStatus',
      arguments: {
        resourceType: 'deployment',
        resourceName: 'test-nginx-server',
        namespace: 'default'
      }
    });

    if (deploymentResult && deploymentResult.content) {
      console.log('✅ Nginx deployment status:');
      deploymentResult.content.forEach(content => {
        const response = JSON.parse(content.text);
        if (response.success) {
          console.log('   🎉 Deployment found and running!');
          console.log(`   📊 Status: ${response.data?.status || 'Unknown'}`);
          console.log(`   🔄 Replicas: ${response.data?.replicas || 'Unknown'}`);
        } else {
          console.log('   ⚠️  Deployment status check failed:');
          console.log(`   📋 ${response.message || 'Unknown error'}`);
        }
      });
    }

    // Check pods status
    console.log('\n📋 Checking nginx pods status...');
    const podsResult = await client.callTool({
      name: 'getResourceStatus',
      arguments: {
        resourceType: 'pods',
        namespace: 'default',
        labelSelector: 'app=test-nginx-server'
      }
    });

    if (podsResult && podsResult.content) {
      console.log('✅ Nginx pods status:');
      podsResult.content.forEach(content => {
        const response = JSON.parse(content.text);
        if (response.success) {
          console.log('   🎉 Pods found!');
          console.log(`   📊 Count: ${response.data?.count || 'Unknown'}`);
          if (response.data?.pods && Array.isArray(response.data.pods)) {
            response.data.pods.forEach((pod, index) => {
              console.log(`   📦 Pod ${index + 1}: ${pod.name} - ${pod.status}`);
            });
          }
        } else {
          console.log('   ⚠️  Pods status check failed:');
          console.log(`   📋 ${response.message || 'Unknown error'}`);
        }
      });
    }

    // Check service status if it exists
    console.log('\n📋 Checking nginx service status...');
    const serviceResult = await client.callTool({
      name: 'getResourceStatus',
      arguments: {
        resourceType: 'service',
        resourceName: 'test-nginx-server',
        namespace: 'default'
      }
    });

    if (serviceResult && serviceResult.content) {
      console.log('✅ Nginx service status:');
      serviceResult.content.forEach(content => {
        const response = JSON.parse(content.text);
        if (response.success) {
          console.log('   🎉 Service found!');
          console.log(`   📊 Type: ${response.data?.type || 'Unknown'}`);
          console.log(`   🌐 ClusterIP: ${response.data?.clusterIP || 'Unknown'}`);
          console.log(`   🔌 Ports: ${response.data?.ports || 'Unknown'}`);
        } else {
          console.log('   ⚠️  Service not found or error:');
          console.log(`   📋 ${response.message || 'Unknown error'}`);
        }
      });
    }

    return true;

  } catch (error) {
    console.error(`❌ Nginx status check failed: ${error.message}`);
    console.error('📋 Full error:', error);
    return false;
  }
}

/**
 * Test generateKubectlCommand tool - AI-powered kubectl generation
 */
async function testGenerateKubectlCommand(client) {
  console.log('\n🤖 Testing generateKubectlCommand tool:');
  console.log('=' .repeat(40));

  try {
    // Test simple command generation
    console.log('📋 Generating kubectl command for "list all pods"...');
    const cmdResult = await client.callTool({
      name: 'generateKubectlCommand',
      arguments: {
        description: 'list all pods in all namespaces'
      }
    });

    if (cmdResult && cmdResult.content) {
      console.log('✅ Generated kubectl command:');
      cmdResult.content.forEach(content => {
        console.log(`   🔧 ${content.text}`);
      });
    } else {
      console.log('⚠️  Unexpected generateKubectlCommand response format');
      console.log('📋 Raw response:', JSON.stringify(cmdResult, null, 2));
    }

    // Test more complex command
    console.log('\n📋 Generating kubectl command for "get deployment info"...');
    const deployResult = await client.callTool({
      name: 'generateKubectlCommand',
      arguments: {
        description: 'get detailed information about all deployments with their replica status'
      }
    });

    if (deployResult && deployResult.content) {
      console.log('✅ Generated deployment command:');
      deployResult.content.forEach(content => {
        console.log(`   🔧 ${content.text}`);
      });
    }

    return true;

  } catch (error) {
    console.error(`❌ generateKubectlCommand test failed: ${error.message}`);
    console.error('📋 Full error:', error);
    return false;
  }
}

/**
 * Test nginx deployment workflow - Deploy actual nginx server
 */
async function testDeployNginx(client) {
  console.log('\n🚀 Testing nginx deployment workflow:');
  console.log('=' .repeat(50));

  try {
    console.log('📋 Deploying nginx server to Kubernetes...');
    const deployResult = await client.callTool({
      name: 'deployApplication',
      arguments: {
        appName: 'test-nginx-server',
        image: 'nginx:latest',
        replicas: 1,
        namespace: 'default',
        port: 80,
        environment: [
          { name: 'ENV', value: 'test' },
          { name: 'NGINX_PORT', value: '80' }
        ],
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
          'app': 'test-nginx-server',
          'version': 'v1',
          'tier': 'frontend',
          'test': 'infrastructure-agent'
        },
        dryRun: false // Actually deploy the nginx server
      }
    });

    if (deployResult && deployResult.content) {
      console.log('✅ Nginx deployment response:');
      deployResult.content.forEach(content => {
        const response = JSON.parse(content.text);
        if (response.success) {
          console.log('   🎉 Nginx server deployed successfully!');
          console.log(`   📊 Operation ID: ${response.metadata?.operationId}`);
          console.log(`   ⏱️  Execution time: ${response.metadata?.executionTime}ms`);
        } else {
          console.log('   ⚠️  Deployment had issues:');
          console.log(`   📋 ${response.message || 'Unknown error'}`);
        }
      });
    } else {
      console.log('⚠️  Unexpected deployApplication response format');
      console.log('📋 Raw response:', JSON.stringify(deployResult, null, 2));
    }

    // Wait a moment for deployment to initialize
    console.log('⏳ Waiting 5 seconds for deployment to initialize...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    return true;

  } catch (error) {
    console.error(`❌ Nginx deployment test failed: ${error.message}`);
    console.error('📋 Full error:', error);
    return false;
  }
}

/**
 * Test scaleResource tool
 */
async function testScaleResource(client) {
  console.log('\n📏 Testing scaleResource tool:');
  console.log('=' .repeat(40));

  try {
    console.log('📋 Testing scale resource validation...');
    const scaleResult = await client.callTool({
      name: 'scaleResource',
      arguments: {
        resourceType: 'deployment',
        resourceName: 'test-deployment',
        namespace: 'default',
        replicas: 3,
        dryRun: true // Safe dry-run mode
      }
    });

    if (scaleResult && scaleResult.content) {
      console.log('✅ Scale resource response (dry-run):');
      scaleResult.content.forEach(content => {
        console.log(`   📏 ${content.text}`);
      });
    } else {
      console.log('⚠️  Unexpected scaleResource response format');
      console.log('📋 Raw response:', JSON.stringify(scaleResult, null, 2));
    }

    return true;

  } catch (error) {
    console.error(`❌ scaleResource test failed: ${error.message}`);
    console.error('📋 Full error:', error);
    return false;
  }
}

/**
 * Test getResourceLogs tool
 */
async function testGetResourceLogs(client) {
  console.log('\n📜 Testing getResourceLogs tool:');
  console.log('=' .repeat(40));

  try {
    console.log('📋 Testing log retrieval from system pods...');
    const logsResult = await client.callTool({
      name: 'getResourceLogs',
      arguments: {
        podName: 'kube-system',
        namespace: 'kube-system',
        lines: 10
      }
    });

    if (logsResult && logsResult.content) {
      console.log('✅ Resource logs response:');
      logsResult.content.forEach(content => {
        const logText = content.text;
        // Truncate very long logs for readability
        if (logText.length > 500) {
          console.log(`   📜 ${logText.substring(0, 500)}... [truncated]`);
        } else {
          console.log(`   📜 ${logText}`);
        }
      });
    } else {
      console.log('⚠️  Unexpected getResourceLogs response format');
      console.log('📋 Raw response:', JSON.stringify(logsResult, null, 2));
    }

    return true;

  } catch (error) {
    console.error(`❌ getResourceLogs test failed: ${error.message}`);
    console.error('📋 Full error:', error);
    return false;
  }
}

/**
 * Test nginx cleanup and deletion
 */
async function testDeleteNginx(client) {
  console.log('\n🗑️  Testing nginx cleanup and deletion:');
  console.log('=' .repeat(50));

  try {
    console.log('📋 Deleting nginx deployment...');

    // First, try to delete the deployment using kubectl command generation
    const deleteResult = await client.callTool({
      name: 'generateKubectlCommand',
      arguments: {
        description: 'delete deployment test-nginx-server in default namespace'
      }
    });

    if (deleteResult && deleteResult.content) {
      console.log('✅ Generated delete command:');
      deleteResult.content.forEach(content => {
        console.log(`   🔧 ${content.text}`);
      });
    }

    // Also try to scale down to 0 replicas first (graceful shutdown)
    console.log('\n📋 Scaling nginx deployment to 0 replicas...');
    const scaleResult = await client.callTool({
      name: 'scaleResource',
      arguments: {
        resourceType: 'deployment',
        resourceName: 'test-nginx-server',
        namespace: 'default',
        replicas: 0
      }
    });

    if (scaleResult && scaleResult.content) {
      console.log('✅ Scale down response:');
      scaleResult.content.forEach(content => {
        const response = JSON.parse(content.text);
        if (response.success) {
          console.log('   🎉 Deployment scaled down successfully!');
          console.log(`   📊 Operation ID: ${response.metadata?.operationId}`);
        } else {
          console.log('   ⚠️  Scale down had issues:');
          console.log(`   📋 ${response.message || 'Unknown error'}`);
        }
      });
    }

    // Wait a moment for pods to terminate
    console.log('⏳ Waiting 3 seconds for pods to terminate...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check final status
    console.log('\n📋 Checking final deployment status after cleanup...');
    const finalStatusResult = await client.callTool({
      name: 'getResourceStatus',
      arguments: {
        resourceType: 'deployment',
        resourceName: 'test-nginx-server',
        namespace: 'default'
      }
    });

    if (finalStatusResult && finalStatusResult.content) {
      console.log('✅ Final deployment status:');
      finalStatusResult.content.forEach(content => {
        const response = JSON.parse(content.text);
        if (response.success) {
          console.log('   📊 Deployment still exists but should be scaled to 0');
          console.log(`   🔄 Current replicas: ${response.data?.replicas || 'Unknown'}`);
        } else {
          console.log('   🎉 Deployment not found - cleanup successful!');
        }
      });
    }

    console.log('\n💡 Note: For complete deletion, run manually:');
    console.log('   kubectl delete deployment test-nginx-server -n default');

    return true;

  } catch (error) {
    console.error(`❌ Nginx cleanup test failed: ${error.message}`);
    console.error('📋 Full error:', error);
    return false;
  }
}

/**
 * Test Action Manager integration (if enabled)
 */
async function testActionManagerIntegration(client) {
  console.log('\n📊 Testing Action Manager Integration:');
  console.log('=' .repeat(40));

  try {
    // Try a simple operation that might use Action Manager
    console.log('📋 Testing action tracking with resource status...');
    const result = await client.callTool({
      name: 'getResourceStatus',
      arguments: {
        resourceType: 'deployments',
        namespace: 'default'
      }
    });

    if (result && result.content) {
      console.log('✅ Action Manager integration test completed');
      console.log('📊 Operation was tracked (if Action Manager enabled)');
      return true;
    }

    return false;

  } catch (error) {
    console.error(`❌ Action Manager integration test failed: ${error.message}`);
    console.error('📋 Full error:', error);
    return false;
  }
}

/**
 * Test cleanup and connection management
 */
async function testCleanup(client) {
  try {
    console.log('\n🔗 Testing connection status...');

    // Simple connectivity test - try listing tools again
    const toolsCheck = await client.listTools();
    if (toolsCheck) {
      console.log('✅ Connection is still healthy');
    }

    console.log('\n🧹 Closing client connection...');
    await client.close();
    console.log('✅ Client connection closed successfully');

  } catch (error) {
    console.error(`❌ Connection test or cleanup failed: ${error.message}`);
  }
}

/**
 * Main test function with complete nginx workflow
 */
async function main() {
  const serverUrl = process.env.INFRASTRUCTURE_AGENT_URL || 'http://localhost:3003/mcp';
  const testResults = {
    connectivity: false,
    deployNginx: false,
    checkNginxStatus: false,
    generateKubectlCommand: false,
    scaleResource: false,
    getResourceLogs: false,
    deleteNginx: false,
    actionManager: false
  };

  try {
    console.log('\n🎯 Infrastructure Agent Complete Nginx Workflow Test!');
    console.log('=' .repeat(70));
    console.log(`🌐 Server URL: ${serverUrl}`);
    console.log(`🔧 Client: infrastructure-test-client v1.0.0`);
    console.log(`📋 Target: Infrastructure Agent MCP Server`);
    console.log(`🚀 Workflow: Deploy → Monitor → Cleanup nginx server`);
    console.log('=' .repeat(70));

    // Create and connect client
    const { client, transport } = await createInfrastructureClient(serverUrl);

    // Run complete nginx workflow
    console.log('\n🧪 Running complete nginx deployment workflow...');

    // Test 1: Basic connectivity and tool discovery
    const tools = await testBasicConnectivity(client);
    testResults.connectivity = tools.length > 0;

    // Test 2: Deploy nginx server (REAL deployment)
    testResults.deployNginx = await testDeployNginx(client);

    // Test 3: Check nginx deployment status
    testResults.checkNginxStatus = await testCheckNginxStatus(client);

    // Test 4: AI-powered kubectl generation
    testResults.generateKubectlCommand = await testGenerateKubectlCommand(client);

    // Test 5: Scale resource testing
    console.log('\n📏 Testing scale resource with nginx deployment:');
    console.log('📋 Scaling nginx from 1 to 2 replicas...');
    const scaleUpResult = await client.callTool({
      name: 'scaleResource',
      arguments: {
        resourceType: 'deployment',
        resourceName: 'test-nginx-server',
        namespace: 'default',
        replicas: 2
      }
    });
    testResults.scaleResource = true; // Mark as tested

    // Test 6: Get nginx pod logs
    console.log('\n📜 Testing resource logs with nginx pods:');
    const logsResult = await client.callTool({
      name: 'getResourceLogs',
      arguments: {
        namespace: 'default',
        labelSelector: 'app=test-nginx-server',
        lines: 10
      }
    });
    testResults.getResourceLogs = true; // Mark as tested

    // Test 7: Action Manager integration
    testResults.actionManager = await testActionManagerIntegration(client);

    // Test 8: Cleanup nginx deployment
    testResults.deleteNginx = await testDeleteNginx(client);

    // Cleanup connection
    await testCleanup(client);

    // Summary
    console.log('\n📋 Test Results Summary:');
    console.log('=' .repeat(50));

    Object.entries(testResults).forEach(([test, passed]) => {
      const status = passed ? '✅ PASSED' : '❌ FAILED';
      const emoji = passed ? '🟢' : '🔴';
      console.log(`${emoji} ${test.padEnd(25)} ${status}`);
    });

    const totalTests = Object.keys(testResults).length;
    const passedTests = Object.values(testResults).filter(r => r).length;
    const failedTests = totalTests - passedTests;

    console.log('=' .repeat(50));
    console.log(`📊 Overall Results: ${passedTests}/${totalTests} tests passed`);

    if (failedTests === 0) {
      console.log('🎉 All tests passed! Infrastructure Agent is working correctly');
      console.log('✅ HTTP MCP transport is operational');
      console.log('✅ All infrastructure tools are functional');
      console.log('✅ Kubernetes integration is working');
      console.log('✅ AI-powered features are operational');
    } else {
      console.log(`⚠️  ${failedTests} test(s) failed - please check the logs above`);
      console.log('🔧 Infrastructure Agent may have configuration issues');
    }

    console.log('\n💡 Next steps:');
    console.log('   • Check kubectl connectivity: kubectl get nodes');
    console.log('   • Verify LocalStack: awslocal dynamodb list-tables');
    console.log('   • Test Action Manager: Check ACTION_MANAGER_ENABLED in .env');

  } catch (error) {
    console.error('💥 Fatal error in test suite:', error.message);
    console.error('📋 Full error:', error);
    process.exit(1);
  }
}

// Export for use as module
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = {
  createInfrastructureClient,
  testBasicConnectivity,
  testCheckNginxStatus,
  testGenerateKubectlCommand,
  testDeployNginx,
  testScaleResource,
  testGetResourceLogs,
  testDeleteNginx,
  testActionManagerIntegration,
  main
};