#!/usr/bin/env node

/**
 * Script to verify MCP SDK HTTP transport availability
 * Tests import paths and transport functionality for Phase 1.1.1
 */

console.log('🔍 Verifying MCP SDK HTTP Transport Compatibility...\n');

// Test SDK version
console.log('📦 SDK Information:');
try {
  const packageInfo = require('@modelcontextprotocol/sdk/package.json');
  console.log(`   Version: ${packageInfo.version}`);
  console.log(`   Description: ${packageInfo.description}`);
} catch (error) {
  console.log(`   ❌ Could not read package info: ${error.message}`);
}

// Test basic imports
console.log('\n🔧 Testing Basic Imports:');
try {
  const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
  console.log('   ✅ Server import successful');
  
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  console.log('   ✅ Client import successful');
} catch (error) {
  console.log(`   ❌ Basic imports failed: ${error.message}`);
  process.exit(1);
}

// Test transport imports
console.log('\n🌐 Testing Transport Imports:');

// Test STDIO transports (known to work)
try {
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  console.log('   ✅ STDIO Server transport available');
  
  const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
  console.log('   ✅ STDIO Client transport available');
} catch (error) {
  console.log(`   ⚠️  STDIO transports issue: ${error.message}`);
}

// Test SSE transports
try {
  const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
  console.log('   ✅ SSE Server transport available');
} catch (error) {
  console.log(`   ⚠️  SSE Server transport not available: ${error.message}`);
}

try {
  const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
  console.log('   ✅ SSE Client transport available');
} catch (error) {
  console.log(`   ⚠️  SSE Client transport not available: ${error.message}`);
}

// Test HTTP transports (what we're looking for)
console.log('\n🎯 Testing HTTP Transport Imports:');

const httpTransportTests = [
  // Streamable HTTP (recommended)
  { 
    path: '@modelcontextprotocol/sdk/server/streamableHttp.js',
    name: 'StreamableHTTPServerTransport',
    description: 'Streamable HTTP Server'
  },
  {
    path: '@modelcontextprotocol/sdk/client/streamableHttp.js', 
    name: 'StreamableHTTPClientTransport',
    description: 'Streamable HTTP Client'
  },
  // Legacy HTTP (fallback)
  {
    path: '@modelcontextprotocol/sdk/server/http.js',
    name: 'HTTPServerTransport', 
    description: 'HTTP Server'
  },
  {
    path: '@modelcontextprotocol/sdk/client/http.js',
    name: 'HTTPClientTransport',
    description: 'HTTP Client'
  }
];

let httpTransportsAvailable = 0;
let streamableHttpAvailable = false;

httpTransportTests.forEach(test => {
  try {
    const transport = require(test.path);
    if (transport[test.name]) {
      console.log(`   ✅ ${test.description} transport available (${test.name})`);
      httpTransportsAvailable++;
      if (test.path.includes('streamableHttp')) {
        streamableHttpAvailable = true;
      }
    } else {
      console.log(`   ⚠️  ${test.description} transport module found but ${test.name} not exported`);
    }
  } catch (error) {
    console.log(`   ❌ ${test.description} transport not available: ${error.message}`);
  }
});

// Test dependencies that suggest HTTP support
console.log('\n🔍 Checking HTTP-related Dependencies:');
try {
  const packageInfo = require('@modelcontextprotocol/sdk/package.json');
  const deps = packageInfo.dependencies || {};
  
  if (deps.express) {
    console.log(`   ✅ Express.js available (v${deps.express}) - suggests HTTP support`);
  }
  if (deps.cors) {
    console.log(`   ✅ CORS available (v${deps.cors}) - suggests HTTP support`);
  }
  if (deps['express-rate-limit']) {
    console.log(`   ✅ Rate limiting available - suggests HTTP server support`);
  }
  if (deps['raw-body']) {
    console.log(`   ✅ Raw body parser available - suggests HTTP request handling`);
  }
} catch (error) {
  console.log(`   ⚠️  Could not check dependencies: ${error.message}`);
}

// Summary and recommendations
console.log('\n📋 Verification Summary:');
console.log('=' .repeat(50));

if (httpTransportsAvailable === 0) {
  console.log('❌ HTTP TRANSPORT STATUS: Not Available');
  console.log('\n📋 Recommendations:');
  console.log('   1. Upgrade SDK: npm install @modelcontextprotocol/sdk@latest');
  console.log('   2. Check SDK documentation for HTTP transport availability');
  console.log('   3. Consider custom HTTP transport implementation');
  
  process.exit(1);
} else if (streamableHttpAvailable) {
  console.log('✅ HTTP TRANSPORT STATUS: Streamable HTTP Available (Recommended)');
  console.log('\n🎯 Phase 1.1.1 Result: READY TO PROCEED');
  console.log('   - Streamable HTTP transport is available');
  console.log('   - Can proceed with Phase 1.1.2 (Create proof-of-concept server)');
  console.log('   - SDK version is compatible');
} else if (httpTransportsAvailable > 0) {
  console.log('⚠️  HTTP TRANSPORT STATUS: Legacy HTTP Available');
  console.log('\n🎯 Phase 1.1.1 Result: PROCEED WITH CAUTION');
  console.log('   - Some HTTP transport available but not recommended Streamable HTTP');
  console.log('   - Consider upgrading SDK for latest transport features');
  console.log('   - Can proceed with Phase 1.1.2 but may need adjustments');
}

console.log('\n🚀 Next Steps for Phase 1.1.2:');
if (streamableHttpAvailable) {
  console.log('   1. Use StreamableHTTPServerTransport for server');
  console.log('   2. Use StreamableHTTPClientTransport for client');
  console.log('   3. Follow Streamable HTTP protocol specification');
} else {
  console.log('   1. Create custom HTTP transport layer');
  console.log('   2. Implement MCP protocol over standard HTTP');
  console.log('   3. Test compatibility with existing agents');
}

console.log('\n✅ Phase 1.1.1 verification complete!\n');