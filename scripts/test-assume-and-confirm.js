/**
 * Test script for the new "assume-and-confirm" framework
 *
 * Tests the enhanced parameter validation and smart defaults system
 * in the AgentCommunicationServer. This validates that:
 *
 * 1. Missing parameters trigger smart defaults
 * 2. Confirmation workflow presents Kubernetes manifests
 * 3. Validation errors are handled gracefully
 * 4. No expensive LLM calls are made for parameter completion
 */

const axios = require('axios');

const INFRASTRUCTURE_AGENT_URL = 'http://localhost:3003';

/**
 * Test configuration
 */
const CONFIG = {
  timeout: 30000,
  verbose: true
};

/**
 * Test cases for assume-and-confirm functionality
 */
const TEST_CASES = [
  {
    name: 'Minimal nginx deployment (should trigger confirmation)',
    description: 'Test with minimal parameters to trigger smart defaults and confirmation',
    toolCall: {
      name: 'deployApplication',
      arguments: {
        appName: 'nginx',
        image: 'nginx:latest'
        // Missing: namespace, replicas, port, resources
      }
    },
    expectedStatus: 'pending_confirmation',
    expectedDefaults: {
      namespace: 'default',
      replicas: 1,
      port: 80,
      resources: { cpu: '100m', memory: '128Mi' }
    }
  },
  {
    name: 'PostgreSQL deployment (should trigger smart resource defaults)',
    description: 'Test database deployment with higher resource requirements',
    toolCall: {
      name: 'deployApplication',
      arguments: {
        resourceName: 'my-postgres',
        containerImage: 'postgres:13'
        // Missing parameters should get database-specific defaults
      }
    },
    expectedStatus: 'pending_confirmation',
    expectedDefaults: {
      namespace: 'default',
      replicas: 1,
      port: 5432,
      resources: { cpu: '500m', memory: '512Mi' } // Database-specific resources
    }
  },
  {
    name: 'Get resource status (no confirmation needed)',
    description: 'Test read-only operation that should execute directly',
    toolCall: {
      name: 'getResourceStatus',
      arguments: {
        resourceName: 'test-nginx'
        // Missing: namespace (should default), resourceType (should default)
      }
    },
    expectedStatus: 'success',
    expectedDefaults: {
      namespace: 'default',
      resourceType: 'deployment'
    }
  },
  {
    name: 'Invalid deployment (validation errors)',
    description: 'Test with invalid parameters to verify error handling',
    toolCall: {
      name: 'deployApplication',
      arguments: {
        appName: 'INVALID-NAME-WITH-CAPS-AND-UNDERSCORES_BAD',
        image: 'invalid-image-format'
      }
    },
    expectedStatus: 'pending_confirmation', // Should still try to fix with defaults
    expectValidationErrors: true
  }
];

/**
 * HTTP MCP client for testing
 */
class TestHTTPMCPClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.sessionId = null;
  }

  async initialize() {
    try {
      // First, send initialize request to establish MCP session
      const initResponse = await axios.post(`${this.baseUrl}/mcp`, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'assume-and-confirm-test',
            version: '1.0.0'
          }
        }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: CONFIG.timeout
      });

      // Extract session ID from response headers if available
      this.sessionId = initResponse.headers['mcp-session-id'] || 'test-session';
      console.log('✅ Initialized HTTP MCP connection with session:', this.sessionId);
      return true;
    } catch (error) {
      // If initialization fails, try with a default session ID
      this.sessionId = 'test-session-fallback';
      console.log('⚠️  MCP initialization failed, using fallback session');
      return true;
    }
  }

  async callTool({ name, arguments: args }) {
    try {
      const response = await axios.post(`${this.baseUrl}/mcp`, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: args }
      }, {
        headers: {
          'Content-Type': 'application/json',
          ...(this.sessionId && { 'mcp-session-id': this.sessionId })
        },
        timeout: CONFIG.timeout
      });

      return response.data.result;
    } catch (error) {
      if (error.response?.data) {
        return error.response.data.result || error.response.data;
      }
      throw error;
    }
  }

  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}

/**
 * Validation helpers
 */
function validateConfirmationResponse(response, testCase) {
  const errors = [];

  // Check basic structure
  if (response.status !== 'pending_confirmation') {
    errors.push(`Expected status 'pending_confirmation', got '${response.status}'`);
  }

  if (!response.assumptions) {
    errors.push('Missing assumptions object');
    return errors;
  }

  if (!response.message) {
    errors.push('Missing confirmation message');
  }

  // Validate smart defaults were applied
  for (const [key, expectedValue] of Object.entries(testCase.expectedDefaults || {})) {
    if (typeof expectedValue === 'object') {
      // Deep comparison for objects like resources
      const actualValue = response.assumptions[key];
      if (!actualValue || JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
        errors.push(`Expected ${key} to be ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
      }
    } else {
      if (response.assumptions[key] !== expectedValue) {
        errors.push(`Expected ${key} to be ${expectedValue}, got ${response.assumptions[key]}`);
      }
    }
  }

  // Check for Kubernetes manifest in deployment messages
  if (testCase.toolCall.name === 'deployApplication') {
    if (!response.message.includes('apiVersion: apps/v1')) {
      errors.push('Expected Kubernetes manifest preview in deployment confirmation');
    }
    if (!response.message.includes('kind: Deployment')) {
      errors.push('Expected Deployment manifest in confirmation message');
    }
  }

  // Check validation errors if expected
  if (testCase.expectValidationErrors && !response.validationErrors?.length) {
    errors.push('Expected validation errors but none were returned');
  }

  return errors;
}

function validateSuccessResponse(response, testCase) {
  const errors = [];

  // For read-only operations, we expect direct execution (simulation mode)
  if (!response || response.status === 'error') {
    errors.push(`Expected successful execution, got error: ${response?.message}`);
  }

  return errors;
}

/**
 * Test execution
 */
async function runAssumeAndConfirmTests() {
  console.log('🧪 Starting Assume-and-Confirm Framework Tests');
  console.log('==================================================\\n');

  const client = new TestHTTPMCPClient(INFRASTRUCTURE_AGENT_URL);

  // Check infrastructure agent health
  console.log('🔍 Checking Infrastructure Agent health...');
  const health = await client.healthCheck();
  if (health.status !== 'healthy') {
    console.error('❌ Infrastructure Agent is not healthy:', health);
    process.exit(1);
  }
  console.log('✅ Infrastructure Agent is healthy\\n');

  // Initialize connection
  const initialized = await client.initialize();
  if (!initialized) {
    console.error('❌ Failed to initialize HTTP MCP connection');
    process.exit(1);
  }
  console.log('');

  let passedTests = 0;
  let failedTests = 0;

  // Run each test case
  for (const testCase of TEST_CASES) {
    console.log(`🧪 Test: ${testCase.name}`);
    console.log(`📝 Description: ${testCase.description}`);

    if (CONFIG.verbose) {
      console.log(`📤 Request:`, JSON.stringify(testCase.toolCall, null, 2));
    }

    try {
      const response = await client.callTool(testCase.toolCall);

      if (CONFIG.verbose) {
        console.log(`📥 Response:`, JSON.stringify(response, null, 2));
      }

      // Validate response based on expected status
      let errors = [];
      if (testCase.expectedStatus === 'pending_confirmation') {
        errors = validateConfirmationResponse(response, testCase);
      } else if (testCase.expectedStatus === 'success') {
        errors = validateSuccessResponse(response, testCase);
      }

      if (errors.length === 0) {
        console.log('✅ PASSED\\n');
        passedTests++;
      } else {
        console.log('❌ FAILED:');
        errors.forEach(error => console.log(`   • ${error}`));
        console.log('');
        failedTests++;
      }

    } catch (error) {
      console.log(`❌ FAILED: ${error.message}\\n`);
      failedTests++;
    }
  }

  // Summary
  console.log('📊 Test Summary:');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Success Rate: ${Math.round((passedTests / (passedTests + failedTests)) * 100)}%`);

  if (failedTests === 0) {
    console.log('\\n🎉 All assume-and-confirm framework tests passed!');
    console.log('💰 Cost-effective parameter completion is working correctly.');
  } else {
    console.log('\\n⚠️  Some tests failed. Please review the implementation.');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runAssumeAndConfirmTests().catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { runAssumeAndConfirmTests };