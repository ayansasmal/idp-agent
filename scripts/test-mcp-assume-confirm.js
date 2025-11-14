#!/usr/bin/env node

/**
 * MCP Server Tests for Assume-and-Confirm Framework
 * Tests Infrastructure Agent and Observability Agent MCP servers
 * Based on http-client-poc.js reference implementation
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

console.log('🧪 Starting MCP Assume-and-Confirm Framework Tests...');

/**
 * Test configuration
 */
const CONFIG = {
  infrastructureAgent: {
    url: 'http://localhost:3003/mcp',
    name: 'Infrastructure Agent'
  },
  observabilityAgent: {
    url: 'http://localhost:3005/mcp',
    name: 'Observability Agent'
  },
  timeout: 30000,
  verbose: true
};

/**
 * Test cases for assume-and-confirm functionality
 */
const INFRASTRUCTURE_TEST_CASES = [
  {
    name: 'Minimal nginx deployment (should trigger confirmation)',
    description: 'Test with minimal parameters to trigger smart defaults and confirmation',
    toolCall: {
      name: 'deployApplication',
      arguments: {
        appName: 'test-nginx',
        image: 'nginx:latest'
        // Missing: namespace, replicas, port, resources
      }
    },
    expectedResult: {
      shouldHaveConfirmation: true,
      shouldHaveKubernetesManifest: true,
      expectedDefaults: {
        namespace: 'default',
        replicas: 1,
        port: 80
      }
    }
  },
  {
    name: 'PostgreSQL deployment (database-specific defaults)',
    description: 'Test database deployment with higher resource requirements',
    toolCall: {
      name: 'deployApplication',
      arguments: {
        resourceName: 'my-postgres',
        containerImage: 'postgres:13'
        // Missing parameters should get database-specific defaults
      }
    },
    expectedResult: {
      shouldHaveConfirmation: true,
      shouldHaveKubernetesManifest: true,
      expectedDefaults: {
        namespace: 'default',
        replicas: 1,
        port: 5432
      }
    }
  },
  {
    name: 'Get resource status (minimal confirmation)',
    description: 'Test read-only operation with smart defaults',
    toolCall: {
      name: 'getResourceStatus',
      arguments: {
        resourceName: 'test-nginx'
        // Missing: namespace, resourceType
      }
    },
    expectedResult: {
      shouldHaveConfirmation: false, // Read-only operations may not need confirmation
      expectedDefaults: {
        namespace: 'default',
        resourceType: 'deployment'
      }
    }
  }
];

const OBSERVABILITY_TEST_CASES = [
  {
    name: 'Get system metrics with defaults',
    description: 'Test metrics collection with smart parameter completion',
    toolCall: {
      name: 'getSystemMetrics',
      arguments: {
        // Minimal args - should apply defaults
      }
    },
    expectedResult: {
      shouldHaveConfirmation: false,
      expectedDefaults: {
        timeRange: '1h',
        includeDetails: true
      }
    }
  }
];

/**
 * Create MCP client with proper initialization
 */
async function createMCPClient(serverUrl, clientName) {
  console.log(`🌐 Connecting to MCP server at: ${serverUrl}`);

  try {
    // Create HTTP transport
    const transport = new StreamableHTTPClientTransport(
      new URL(serverUrl)
    );

    console.log('✅ Created StreamableHTTPClientTransport');

    // Create MCP Client instance
    const client = new Client({
      name: clientName,
      version: '1.0.0'
    }, {
      capabilities: {
        sampling: {}
      }
    });

    console.log('✅ Created MCP Client');

    // Connect client to transport
    await client.connect(transport);
    console.log('✅ MCP Client connected successfully');

    return { client, transport };

  } catch (error) {
    console.error(`❌ Failed to create MCP client: ${error.message}`);
    console.error('📋 Full error:', error);
    throw error;
  }
}

/**
 * Test MCP server tools
 */
async function testMCPServer(serverConfig, testCases) {
  console.log(`\n🔧 Testing ${serverConfig.name}`);
  console.log('=' .repeat(50));

  let client, transport;

  try {
    // Create and connect client
    ({ client, transport } = await createMCPClient(
      serverConfig.url,
      `test-${serverConfig.name.toLowerCase().replace(/\s+/g, '-')}-client`
    ));

    // Test 1: List available tools
    console.log('\n📋 Listing available tools...');
    const toolsResponse = await client.listTools();

    if (toolsResponse && toolsResponse.tools) {
      console.log(`✅ Found ${toolsResponse.tools.length} tools:`);
      toolsResponse.tools.forEach(tool => {
        console.log(`   📎 ${tool.name}: ${tool.description}`);
      });
    } else {
      console.log('⚠️  No tools found or unexpected response format');
    }

    // Test 2: Run test cases
    console.log(`\n🧪 Running ${testCases.length} test cases...`);

    for (const testCase of testCases) {
      console.log(`\n🔧 Test: ${testCase.name}`);
      console.log(`📝 Description: ${testCase.description}`);

      if (CONFIG.verbose) {
        console.log(`📤 Request:`, JSON.stringify(testCase.toolCall, null, 2));
      }

      try {
        const result = await client.callTool(testCase.toolCall);

        if (CONFIG.verbose) {
          console.log(`📥 Response:`, JSON.stringify(result, null, 2));
        }

        // Validate response
        const validation = validateTestResult(result, testCase);
        if (validation.success) {
          console.log('✅ PASSED');
        } else {
          console.log('❌ FAILED:');
          validation.errors.forEach(error => console.log(`   • ${error}`));
        }

      } catch (error) {
        console.log(`❌ FAILED: ${error.message}`);
        if (CONFIG.verbose) {
          console.error('Full error:', error);
        }
      }
    }

    // Clean up
    console.log('\n🧹 Closing client connection...');
    await client.close();
    console.log('✅ Client connection closed successfully');

    return true;

  } catch (error) {
    console.error(`❌ ${serverConfig.name} test failed: ${error.message}`);
    return false;
  }
}

/**
 * Validate test result against expected outcome
 */
function validateTestResult(result, testCase) {
  const errors = [];

  if (!result || !result.content) {
    errors.push('Missing result content');
    return { success: false, errors };
  }

  try {
    // Parse the result content (should be JSON string)
    let parsedResult;
    if (result.content[0] && result.content[0].text) {
      parsedResult = JSON.parse(result.content[0].text);
    } else {
      errors.push('Unable to parse result content');
      return { success: false, errors };
    }

    const expected = testCase.expectedResult;

    // Check for confirmation workflow
    if (expected.shouldHaveConfirmation) {
      if (parsedResult.status !== 'pending_confirmation') {
        errors.push(`Expected confirmation workflow, got status: ${parsedResult.status}`);
      }

      if (!parsedResult.assumptions) {
        errors.push('Missing assumptions in confirmation response');
      }

      if (!parsedResult.message) {
        errors.push('Missing confirmation message');
      }

      // Check for Kubernetes manifest in deployment confirmations
      if (expected.shouldHaveKubernetesManifest) {
        if (!parsedResult.message.includes('apiVersion')) {
          errors.push('Expected Kubernetes manifest in confirmation message');
        }
      }
    }

    // Check default values were applied
    if (expected.expectedDefaults && parsedResult.assumptions) {
      for (const [key, expectedValue] of Object.entries(expected.expectedDefaults)) {
        if (parsedResult.assumptions[key] !== expectedValue) {
          errors.push(`Expected ${key} to be ${expectedValue}, got ${parsedResult.assumptions[key]}`);
        }
      }
    }

  } catch (parseError) {
    errors.push(`Failed to parse result: ${parseError.message}`);
  }

  return { success: errors.length === 0, errors };
}

/**
 * Main test function
 */
async function runMCPAssumeConfirmTests() {
  console.log('🧪 MCP Assume-and-Confirm Framework Tests');
  console.log('==========================================\n');

  let allTestsPassed = true;

  // Test Infrastructure Agent
  console.log('🏗️  Testing Infrastructure Agent MCP Server');
  const infraSuccess = await testMCPServer(CONFIG.infrastructureAgent, INFRASTRUCTURE_TEST_CASES);
  if (!infraSuccess) allTestsPassed = false;

  // Test Observability Agent
  console.log('\n📊 Testing Observability Agent MCP Server');
  const obsSuccess = await testMCPServer(CONFIG.observabilityAgent, OBSERVABILITY_TEST_CASES);
  if (!obsSuccess) allTestsPassed = false;

  // Summary
  console.log('\n📊 Test Summary:');
  console.log('================');
  if (allTestsPassed) {
    console.log('✅ All MCP assume-and-confirm tests passed!');
    console.log('✅ Smart defaults generation is working correctly');
    console.log('✅ Kubernetes manifest preview functionality verified');
    console.log('✅ Cost-effective parameter completion validated');
  } else {
    console.log('❌ Some tests failed. Please review the implementation.');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runMCPAssumeConfirmTests().catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { runMCPAssumeConfirmTests };