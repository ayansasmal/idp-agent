#!/usr/bin/env node

/**
 * Quick test of WebSocket MCP connection
 * Tests the connection to Infrastructure Agent running in WebSocket mode
 */

const WebSocket = require('ws');
const { 
  createMessageConnection, 
  MessageReader,
  MessageWriter,
  DataCallback,
  PartialMessageInfo
} = require('vscode-jsonrpc');

async function testConnection() {
  console.log('🔌 Testing WebSocket MCP connection to Infrastructure Agent...');
  
  try {
    const socket = new WebSocket('ws://localhost:3004/mcp');
    
    await new Promise((resolve, reject) => {
      socket.on('open', () => {
        console.log('✅ WebSocket connected successfully');
        resolve();
      });
      
      socket.on('error', (error) => {
        console.error('❌ WebSocket connection failed:', error.message);
        reject(error);
      });
      
      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);
    });
    
    // Create simple message reader/writer wrappers
    const messageReader = {
      listen: (callback) => {
        socket.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            callback(message);
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        });
      },
      onClose: (callback) => {
        socket.on('close', callback);
      },
      onError: (callback) => {
        socket.on('error', callback);
      }
    };

    const messageWriter = {
      write: (message) => {
        const data = JSON.stringify(message);
        socket.send(data);
        return Promise.resolve();
      },
      onClose: (callback) => {
        socket.on('close', callback);
      },
      onError: (callback) => {
        socket.on('error', callback);
      }
    };

    // Create JSON-RPC connection
    const connection = createMessageConnection(messageReader, messageWriter);
    connection.listen();
    
    // Test health check
    console.log('🏥 Testing health check...');
    const healthResponse = await connection.sendRequest('health/check', {});
    console.log('✅ Health check response:', JSON.stringify(healthResponse, null, 2));
    
    // Test tools list
    console.log('🔧 Testing tools list...');
    const toolsResponse = await connection.sendRequest('tools/list', {});
    console.log('✅ Tools available:', toolsResponse.tools.length);
    console.log('📋 Tool names:', toolsResponse.tools.map(t => t.name).join(', '));
    
    // Test a simple tool call
    console.log('⚙️  Testing tool call: getResourceStatus...');
    const toolResponse = await connection.sendRequest('tools/call', {
      name: 'getResourceStatus',
      arguments: {
        resourceName: 'test-nginx',
        namespace: 'default'
      }
    });
    console.log('✅ Tool call response:', JSON.stringify(toolResponse, null, 2));
    
    socket.close();
    console.log('🎉 All WebSocket tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testConnection();