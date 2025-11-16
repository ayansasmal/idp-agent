#!/usr/bin/env node

/**
 * Complete rewrite of MCP HTTP Server using official session management pattern
 * Based on: https://github.com/modelcontextprotocol/typescript-sdk
 */

const express = require('express');
const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');

const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports = {};

/**
 * Create and configure MCP server with tools
 */
function createMcpServer() {
  const server = new McpServer(
    {
      name: 'http-poc-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register hello tool
  server.registerTool(
    'hello',
    { title: 'Hello Tool', description: 'A simple hello tool for testing HTTP transport' },
    async args => {
      const name = args?.name || 'World';
      console.log(`📞 Hello tool called with name: ${name}`);
      return {
        content: [
          {
            type: 'text',
            text: `Hello, ${name}! (via HTTP transport)`,
          },
        ],
      };
    }
  );
  // Register serverInfo tool
  server.registerTool(
    'serverInfo',
    { title: 'Server Info Tool', description: 'Get server information and transport details' },
    async () => {
      console.log(`📞 ServerInfo tool called`);
      const info = {
        serverName: 'http-poc-server',
        version: '1.0.0',
        transport: 'streamable-http',
        timestamp: new Date().toISOString(),
        capabilities: ['tools'],
        tools: ['hello', 'serverInfo'],
      };
      return {
        content: [
          {
            type: 'text',
            text: `Server Information:\n${JSON.stringify(info, null, 2)}`,
          },
        ],
      };
    }
  );

  return server;
}

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
  try {
    console.log(`🌐 /mcp:`, JSON.stringify(req.body, null, 2));

    // Check for existing session ID
    const sessionId = req.headers['mcp-session-id'];
    let transport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      console.log(`♻️  Reusing session: ${sessionId}`);
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      console.log('🆕 Creating new session');
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: sessionId => {
          console.log(`✅ Session initialized: ${sessionId}`);
          // Store the transport by session ID
          transports[sessionId] = transport;
        },
        // DNS rebinding protection disabled for development
        // enableDnsRebindingProtection: true,
        // allowedHosts: ['127.0.0.1'],
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          console.log(`🧹 Cleaning up session: ${transport.sessionId}`);
          delete transports[transport.sessionId];
        }
      };

      const server = createMcpServer();

      // Connect to the MCP server
      await server.connect(transport);
    } else {
      // Invalid request
      console.log('❌ Invalid request: No valid session ID');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('❌ POST error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: { error: error.message },
        },
        id: req.body?.id || null,
      });
    }
  }
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  console.log(`🔄 ${req.method} /mcp session: ${sessionId}`);

  if (!sessionId || !transports[sessionId]) {
    console.log('❌ Invalid session ID');
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    server: 'http-poc-server',
    version: '1.0.0',
    transport: 'streamable-http',
    sessions: Object.keys(transports).length,
    timestamp: new Date().toISOString(),
  });
});

// Start server
const PORT = parseInt(process.env.HTTP_POC_PORT || '3010');

app.listen(PORT, () => {
  console.log(`✅ MCP HTTP Server running on http://localhost:${PORT}`);
  console.log(`🌐 MCP Endpoint: http://localhost:${PORT}/mcp`);
  console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
  console.log(`📋 Active sessions: 0`);
  console.log('✅ Ready for MCP clients!');
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  // Clean up all transports
  Object.values(transports).forEach(transport => {
    try {
      transport.close();
    } catch (err) {
      console.warn('Warning closing transport:', err.message);
    }
  });
  process.exit(0);
});
