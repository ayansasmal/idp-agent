#!/usr/bin/env node

/**
 * Comprehensive WebSocket MCP Test Suite
 * Tests multiple interactions, concurrent connections, error handling, and edge cases
 */

const WebSocket = require('ws');
const { createMessageConnection } = require('vscode-jsonrpc');
require('dotenv').config();

// Test configuration using environment variables
const CONFIG = {
  host: process.env.INFRASTRUCTURE_AGENT_HOST || 'localhost',
  port: process.env.INFRASTRUCTURE_AGENT_PORT || process.env.PORT || '3003',
  path: process.env.INFRASTRUCTURE_AGENT_MCP_PATH || '/mcp',
  get url() {
    return `ws://${this.host}:${this.port}${this.path}`;
  },
  concurrentConnections: parseInt(process.env.TEST_CONCURRENT_CONNECTIONS || '3', 10),
  requestsPerConnection: parseInt(process.env.TEST_REQUESTS_PER_CONNECTION || '5', 10),
  heartbeatInterval: parseInt(process.env.TEST_HEARTBEAT_INTERVAL || '10000', 10)
};

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const emoji = {
    'INFO': '📋',
    'SUCCESS': '✅', 
    'ERROR': '❌',
    'WARN': '⚠️'
  };
  console.log(`${emoji[level]} [${timestamp}] ${message}`);
}

function test(name, success) {
  totalTests++;
  if (success) {
    passedTests++;
    log(`${name} - PASSED`, 'SUCCESS');
  } else {
    failedTests++;
    log(`${name} - FAILED`, 'ERROR');
  }
}

// Create JSON-RPC connection helper
function createJSONRPCConnection(socket) {
  const messageReader = {
    listen: (callback) => {
      socket.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          callback(message);
        } catch (error) {
          log(`Failed to parse message: ${error.message}`, 'ERROR');
        }
      });
    },
    onClose: (callback) => socket.on('close', callback),
    onError: (callback) => socket.on('error', callback)
  };

  const messageWriter = {
    write: (message) => {
      const data = JSON.stringify(message);
      socket.send(data);
      return Promise.resolve();
    },
    onClose: (callback) => socket.on('close', callback),
    onError: (callback) => socket.on('error', callback)
  };

  return createMessageConnection(messageReader, messageWriter);
}

// Test 1: Basic Connection & Health Check
async function testBasicConnection() {
  log('Test 1: Basic Connection & Health Check');
  
  try {
    const socket = new WebSocket(CONFIG.url);
    
    await new Promise((resolve, reject) => {
      socket.on('open', resolve);
      socket.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    const connection = createJSONRPCConnection(socket);
    connection.listen();
    
    const healthResponse = await connection.sendRequest('health/check', {});
    test('Basic connection established', true);
    test('Health check response received', healthResponse && typeof healthResponse.healthy === 'boolean');
    test('Health check contains server info', healthResponse.serverInfo && typeof healthResponse.serverInfo.uptime === 'number');
    
    socket.close();
    
  } catch (error) {
    test('Basic connection failed', false);
    log(`Basic connection error: ${error.message}`, 'ERROR');
  }
}

// Test 2: Tools List and Validation  
async function testToolsListAndValidation() {
  log('Test 2: Tools List and Validation');
  
  try {
    const socket = new WebSocket(CONFIG.url);
    await new Promise((resolve, reject) => {
      socket.on('open', resolve);
      socket.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    const connection = createJSONRPCConnection(socket);
    connection.listen();
    
    const toolsResponse = await connection.sendRequest('tools/list', {});
    
    test('Tools list request successful', toolsResponse && Array.isArray(toolsResponse.tools));
    test('Tools list contains infrastructure tools', toolsResponse.tools.length >= 5);
    
    // Validate tool structure
    const firstTool = toolsResponse.tools[0];
    test('Tool has required fields', firstTool.name && firstTool.description);
    
    // Test each tool existence
    const expectedTools = ['deployApplication', 'scaleResource', 'getResourceStatus', 'getResourceLogs', 'provisionDatabase'];
    for (const toolName of expectedTools) {
      const toolExists = toolsResponse.tools.some(t => t.name === toolName);
      test(`Tool '${toolName}' is available`, toolExists);
    }
    
    socket.close();
    
  } catch (error) {
    test('Tools list test failed', false);
    log(`Tools list error: ${error.message}`, 'ERROR');
  }
}

// Test 3: Multiple Tool Calls with Different Parameters
async function testMultipleToolCalls() {
  log('Test 3: Multiple Tool Calls with Different Parameters');
  
  try {
    const socket = new WebSocket(CONFIG.url);
    await new Promise((resolve, reject) => {
      socket.on('open', resolve);
      socket.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    const connection = createJSONRPCConnection(socket);
    connection.listen();
    
    // Test different tools with various parameters
    const testCases = [
      {
        name: 'getResourceStatus',
        args: { resourceName: 'test-nginx', namespace: 'default' }
      },
      {
        name: 'getResourceStatus', 
        args: { resourceName: 'test-postgres', namespace: 'database' }
      },
      {
        name: 'scaleResource',
        args: { resourceName: 'test-app', replicas: 3 }
      },
      {
        name: 'getResourceLogs',
        args: { resourceName: 'test-service', namespace: 'production', lines: 50 }
      },
      {
        name: 'provisionDatabase',
        args: { databaseType: 'postgresql', name: 'test-db', size: '10Gi' }
      }
    ];
    
    for (const testCase of testCases) {
      try {
        const result = await connection.sendRequest('tools/call', {
          name: testCase.name,
          arguments: testCase.args
        });
        
        test(`Tool call '${testCase.name}' successful`, result && result.success !== false);
        test(`Tool call '${testCase.name}' has metadata`, result.metadata && result.metadata.executionTime !== undefined);
        
      } catch (error) {
        test(`Tool call '${testCase.name}' failed`, false);
        log(`Tool call error: ${error.message}`, 'ERROR');
      }
    }
    
    socket.close();
    
  } catch (error) {
    test('Multiple tool calls test failed', false);
    log(`Multiple tool calls error: ${error.message}`, 'ERROR');
  }
}

// Test 4: Concurrent Connections
async function testConcurrentConnections() {
  log(`Test 4: Concurrent Connections (${CONFIG.concurrentConnections} connections)`);
  
  const connectionPromises = Array.from({ length: CONFIG.concurrentConnections }, async (_, index) => {
    try {
      const socket = new WebSocket(CONFIG.url);
      
      await new Promise((resolve, reject) => {
        socket.on('open', resolve);
        socket.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
      
      const connection = createJSONRPCConnection(socket);
      connection.listen();
      
      // Make multiple requests per connection
      const requests = [];
      for (let i = 0; i < CONFIG.requestsPerConnection; i++) {
        requests.push(
          connection.sendRequest('tools/call', {
            name: 'getResourceStatus',
            arguments: { resourceName: `test-app-${index}-${i}`, namespace: 'test' }
          })
        );
      }
      
      const results = await Promise.all(requests);
      test(`Connection ${index} - all requests completed`, results.every(r => r && r.success !== false));
      
      socket.close();
      return true;
      
    } catch (error) {
      test(`Connection ${index} failed`, false);
      log(`Concurrent connection ${index} error: ${error.message}`, 'ERROR');
      return false;
    }
  });
  
  const results = await Promise.all(connectionPromises);
  test('All concurrent connections successful', results.every(r => r === true));
}

// Test 5: Error Handling and Invalid Requests
async function testErrorHandling() {
  log('Test 5: Error Handling and Invalid Requests');
  
  try {
    const socket = new WebSocket(CONFIG.url);
    await new Promise((resolve, reject) => {
      socket.on('open', resolve);
      socket.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    const connection = createJSONRPCConnection(socket);
    connection.listen();
    
    // Test invalid tool name
    const invalidToolResult = await connection.sendRequest('tools/call', {
      name: 'nonExistentTool',
      arguments: {}
    });
    test('Invalid tool name handled gracefully', invalidToolResult && invalidToolResult.success === false && invalidToolResult.message.includes('Unknown tool'));
    
    // Test missing required parameters
    const result = await connection.sendRequest('tools/call', {
      name: 'deployApplication',
      arguments: {} // Missing required parameters
    });
    test('Missing parameters handled', result && result.success === false);
    
    // Test invalid JSON-RPC method
    try {
      await connection.sendRequest('invalid/method', {});
      test('Invalid method handled gracefully', false);
    } catch (error) {
      test('Invalid method returns error', true);
    }
    
    socket.close();
    
  } catch (error) {
    test('Error handling test failed', false);
    log(`Error handling test error: ${error.message}`, 'ERROR');
  }
}

// Test 6: Connection Resilience and Heartbeat
async function testConnectionResilience() {
  log('Test 6: Connection Resilience and Heartbeat');
  
  try {
    const socket = new WebSocket(CONFIG.url);
    await new Promise((resolve, reject) => {
      socket.on('open', resolve);
      socket.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
    
    const connection = createJSONRPCConnection(socket);
    connection.listen();
    
    // Test long-running connection
    let heartbeatReceived = false;
    
    // Listen for server heartbeat
    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.method === 'heartbeat') {
          heartbeatReceived = true;
          log('Heartbeat received from server');
        }
      } catch (e) {
        // Ignore parsing errors for non-JSON messages
      }
    });
    
    // Send client heartbeat
    const heartbeatInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        connection.sendNotification('heartbeat', { timestamp: Date.now() });
      }
    }, 5000);
    
    // Keep connection alive and make periodic requests
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const result = await connection.sendRequest('health/check', {});
      test(`Heartbeat health check ${i + 1}`, result && result.healthy !== undefined);
    }
    
    clearInterval(heartbeatInterval);
    test('Connection maintained during heartbeat test', true);
    
    socket.close();
    
  } catch (error) {
    test('Connection resilience test failed', false);
    log(`Connection resilience error: ${error.message}`, 'ERROR');
  }
}

// Main test runner
async function runAllTests() {
  log('🚀 Starting Comprehensive WebSocket MCP Test Suite');
  log(`Target: ${CONFIG.url}`);
  
  const startTime = Date.now();
  
  try {
    await testBasicConnection();
    await testToolsListAndValidation();  
    await testMultipleToolCalls();
    await testConcurrentConnections();
    await testErrorHandling();
    await testConnectionResilience();
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    log('');
    log('📊 Test Results Summary');
    log(`Total Tests: ${totalTests}`);
    log(`✅ Passed: ${passedTests}`, 'SUCCESS');
    log(`❌ Failed: ${failedTests}`, failedTests > 0 ? 'ERROR' : 'SUCCESS');
    log(`⏱️  Duration: ${duration.toFixed(2)}s`);
    log(`📈 Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests === 0) {
      log('🎉 All tests passed! WebSocket MCP communication is working perfectly.', 'SUCCESS');
      process.exit(0);
    } else {
      log(`⚠️  ${failedTests} test(s) failed. WebSocket MCP communication needs attention.`, 'WARN');
      process.exit(1);
    }
    
  } catch (error) {
    log(`💥 Test suite failed: ${error.message}`, 'ERROR');
    process.exit(1);
  }
}

// Run the test suite
runAllTests();