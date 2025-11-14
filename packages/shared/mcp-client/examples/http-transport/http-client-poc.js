#!/usr/bin/env node

/**
 * Proof-of-Concept MCP HTTP Client using Streamable HTTP Transport
 * Phase 1.1.3 - Testing HTTP transport client functionality (JavaScript version)
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

console.log('🚀 Starting MCP HTTP Client Proof-of-Concept...');

/**
 * Create a simple proof-of-concept MCP client with HTTP transport
 */
async function createHttpClient(serverUrl = 'http://localhost:3010/mcp') {
  console.log(`🌐 Connecting to MCP server at: ${serverUrl}`);

  try {
    // Create HTTP transport (no sessionId - server will generate one)
    const transport = new StreamableHTTPClientTransport(
      new URL(serverUrl)
    );

    console.log('✅ Created StreamableHTTPClientTransport');

    // Create MCP Client instance
    const client = new Client({
      name: 'http-poc-client',
      version: '1.0.0'
    }, {
      capabilities: {
        sampling: {}
      }
    });

    console.log('✅ Created MCP Client');

    // Connect client to transport
    await client.connect(transport);
    console.log('✅ MCP HTTP Client connected successfully');

    return { client, transport };

  } catch (error) {
    console.error(`❌ Failed to create MCP HTTP client: ${error.message}`);
    console.error('📋 Full error:', error);
    throw error;
  }
}

/**
 * Test basic MCP operations
 */
async function testBasicOperations(client) {
  console.log('\n🔧 Testing Basic MCP Operations:');
  console.log('=' .repeat(40));

  try {
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

    // Test 2: Call hello tool
    console.log('\n🔧 Testing hello tool...');
    const helloResult = await client.callTool({
      name: 'hello',
      arguments: { name: 'Phase1.1.3' }
    });

    if (helloResult && helloResult.content) {
      console.log('✅ Hello tool response:');
      helloResult.content.forEach(content => {
        console.log(`   💬 ${content.text}`);
      });
    } else {
      console.log('⚠️  Unexpected hello tool response format');
      console.log('📋 Raw response:', JSON.stringify(helloResult, null, 2));
    }

    // Test 3: Call serverInfo tool
    console.log('\n🔧 Testing serverInfo tool...');
    const serverInfoResult = await client.callTool({
      name: 'serverInfo',
      arguments: {}
    });

    if (serverInfoResult && serverInfoResult.content) {
      console.log('✅ Server info response:');
      serverInfoResult.content.forEach(content => {
        console.log(`   📊 ${content.text}`);
      });
    } else {
      console.log('⚠️  Unexpected serverInfo tool response format');
      console.log('📋 Raw response:', JSON.stringify(serverInfoResult, null, 2));
    }

    return true;

  } catch (error) {
    console.error(`❌ Basic operations test failed: ${error.message}`);
    console.error('📋 Full error:', error);
    return false;
  }
}

/**
 * Test connection and cleanup
 */
async function testConnectionAndCleanup(client) {
  try {
    console.log('\n🔗 Testing connection status...');
    
    // Simple connectivity test - try listing tools again
    const toolsCheck = await client.listTools();
    if (toolsCheck) {
      console.log('✅ Connection is healthy');
    }

    console.log('\n🧹 Closing client connection...');
    await client.close();
    console.log('✅ Client connection closed successfully');

  } catch (error) {
    console.error(`❌ Connection test or cleanup failed: ${error.message}`);
  }
}

/**
 * Main function to run the proof-of-concept client
 */
async function main() {
  const serverUrl = process.env.HTTP_POC_SERVER_URL || 'http://localhost:3010/mcp';
  
  try {
    console.log('\n🎯 MCP HTTP Client Proof-of-Concept Starting!');
    console.log('=' .repeat(50));
    console.log(`🌐 Server URL: ${serverUrl}`);
    console.log(`🔧 Client: http-poc-client v1.0.0`);
    console.log('=' .repeat(50));

    // Create and connect client
    const { client, transport } = await createHttpClient(serverUrl);

    // Test basic operations
    const testsSuccessful = await testBasicOperations(client);

    // Test connection and cleanup
    await testConnectionAndCleanup(client);

    console.log('\n📋 Test Summary:');
    console.log('=' .repeat(30));
    if (testsSuccessful) {
      console.log('✅ All tests passed successfully!');
      console.log('✅ HTTP transport is working correctly');
      console.log('✅ Phase 1.1.3 completed successfully');
    } else {
      console.log('❌ Some tests failed');
      console.log('⚠️  HTTP transport may have issues');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Fatal error:', error.message);
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

module.exports = { createHttpClient, testBasicOperations, main };