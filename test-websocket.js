#!/usr/bin/env node

const WebSocket = require('ws');

async function testWebSocketHealthCheck() {
  console.log('🔍 Testing WebSocket JSON-RPC health check...');
  
  const ws = new WebSocket('ws://localhost:3003/mcp');
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('❌ Connection timeout');
      ws.close();
      resolve(false);
    }, 5000);
    
    ws.on('open', () => {
      console.log('✅ WebSocket connection established');
      
      // Send a JSON-RPC health check request
      const healthCheckRequest = {
        jsonrpc: "2.0",
        method: "health",
        id: 1
      };
      
      console.log('📤 Sending health check request:', JSON.stringify(healthCheckRequest));
      ws.send(JSON.stringify(healthCheckRequest));
    });
    
    ws.on('message', (data) => {
      console.log('📥 Received response:', data.toString());
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    });
    
    ws.on('error', (error) => {
      console.log('❌ WebSocket error:', error.message);
      clearTimeout(timeout);
      resolve(false);
    });
    
    ws.on('close', () => {
      console.log('🔒 WebSocket connection closed');
      clearTimeout(timeout);
    });
  });
}

testWebSocketHealthCheck().then((success) => {
  console.log(success ? '✅ Health check test completed successfully' : '❌ Health check test failed');
  process.exit(success ? 0 : 1);
});