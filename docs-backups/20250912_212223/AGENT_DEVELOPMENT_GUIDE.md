# AI-IDP Agent Development Guide

**Complete reference for creating focused agents with standardized WebSocket + JSON-RPC communication**

---

## Overview

This guide provides everything you need to create a new focused agent that integrates seamlessly with the AI-IDP Meta-Agent using our standardized communication library.

### What You'll Learn
- 🏗️ Agent architecture and project structure
- 🔌 WebSocket + JSON-RPC integration
- 🛠️ Tool implementation patterns
- 🧪 Testing and validation
- 📋 Configuration and deployment

---

## 🚀 Quick Start

### 1. Create Agent Package Structure

```bash
mkdir -p packages/agents/your-agent/src/{agent,tools,types}
cd packages/agents/your-agent
```

### 2. Initialize Package

```json
// packages/agents/your-agent/package.json
{
  "name": "@ai-idp/your-agent",
  "version": "1.0.0",
  "description": "Your Agent - Description of capabilities",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc && tsc-alias && echo '@ai-idp/your-agent Build complete'",
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-idp/types": "file:../../shared/types",
    "@ai-idp/utils": "file:../../shared/utils", 
    "@ai-idp/agent-communication": "file:../../shared/agent-communication",
    "ws": "^8.17.1",
    "vscode-jsonrpc": "^8.2.0",
    "pino": "^8.19.0",
    "zod": "^3.22.4",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/ws": "^8.5.10",
    "typescript": "^5.6.2",
    "tsx": "^4.7.1",
    "vitest": "^1.6.0"
  }
}
```

### 3. TypeScript Configuration

```json
// packages/agents/your-agent/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS", 
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": "src",
    "paths": {
      "@/*": ["*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

---

## 🏗️ Agent Architecture

### Core Agent Class

```typescript
// packages/agents/your-agent/src/agent/YourAgent.ts
import { Logger } from 'pino';
import {
  createLogger,
  ServiceError,
  ErrorCode,
  withRetry
} from '@ai-idp/utils';
import type {
  AgentCapabilities,
  ToolDefinition,
  ConversationContext
} from '@ai-idp/types';

export interface YourAgentConfig {
  agentId: string;
  name: string;
  // Add your specific configuration options
  apiKey?: string;
  endpoint?: string;
}

export class YourAgent {
  private config: YourAgentConfig;
  private logger: Logger;
  private initialized: boolean = false;

  constructor(config: YourAgentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'YourAgent' });
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info({
        agentId: this.config.agentId,
        name: this.config.name
      }, 'Initializing Your Agent');

      // Add your initialization logic here
      // - Connect to external services
      // - Validate configuration
      // - Setup resources

      this.initialized = true;
      this.logger.info('Your Agent initialized successfully');

    } catch (error) {
      this.logger.error(error, 'Failed to initialize Your Agent');
      throw error;
    }
  }

  /**
   * Get agent capabilities
   */
  getCapabilities(): AgentCapabilities {
    return {
      agentId: this.config.agentId,
      name: this.config.name,
      version: '1.0.0',
      description: 'Your agent description and capabilities',
      tools: [
        {
          name: 'yourTool',
          description: 'Description of what your tool does',
          parameters: {
            type: 'object',
            properties: {
              requiredParam: {
                type: 'string',
                description: 'Required parameter description'
              },
              optionalParam: {
                type: 'number',
                description: 'Optional parameter description',
                default: 10
              }
            },
            required: ['requiredParam']
          }
        }
        // Add more tools...
      ],
      specializations: [
        'your-domain',
        'specific-capabilities'
      ],
      endpoints: {
        mcp: `ws://localhost:${process.env.YOUR_AGENT_PORT || '3006'}/mcp`,
        health: `http://localhost:${process.env.YOUR_AGENT_PORT || '3006'}/health`
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    try {
      // Add your health check logic
      const checks = {
        initialized: this.initialized,
        // Add more health checks
      };

      const healthy = Object.values(checks).every(check => 
        typeof check === 'boolean' ? check : check.healthy
      );

      return {
        healthy,
        details: checks
      };

    } catch (error) {
      this.logger.error(error, 'Health check failed');
      return {
        healthy: false,
        details: { error: error.message }
      };
    }
  }

  /**
   * Your tool implementation
   */
  async yourTool(request: {
    requiredParam: string;
    optionalParam?: number;
    context: ConversationContext;
  }): Promise<any> {
    const startTime = Date.now();

    try {
      this.logger.info({
        requiredParam: request.requiredParam,
        contextId: request.context.conversationId
      }, 'Executing your tool');

      // Implement your tool logic here
      const result = {
        success: true,
        message: `Tool executed successfully with ${request.requiredParam}`,
        data: {
          processedParam: request.requiredParam,
          value: request.optionalParam || 10
        }
      };

      const executionTime = Date.now() - startTime;

      return {
        ...result,
        metadata: {
          operationId: crypto.randomUUID(),
          executionTime,
          agent: this.config.agentId,
          action: 'yourTool'
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error(error, 'Your tool execution failed');

      throw new ServiceError(
        `Your tool failed: ${error.message}`,
        ErrorCode.INTERNAL_ERROR,
        { 
          service: 'your-agent', 
          operation: 'yourTool',
          executionTime
        },
        { cause: error as Error }
      );
    }
  }
}
```

### Standard Agent Adapter

```typescript
// packages/agents/your-agent/src/adapter/StandardYourAgent.ts
import { Logger } from 'pino';
import type {
  AgentCapabilities,
  ConversationContext
} from '@ai-idp/types';
import { YourAgent } from '../agent/YourAgent';

/**
 * Tool handler function signature
 */
type ToolHandler = (
  parameters: Record<string, any>,
  context?: ConversationContext
) => Promise<any>;

/**
 * Agent implementation interface for standardized communication
 */
interface AgentImplementation {
  getCapabilities(): AgentCapabilities;
  healthCheck(): Promise<{ healthy: boolean; details?: any }>;
  getToolHandlers(): Record<string, ToolHandler>;
}

/**
 * Standard adapter for Your Agent
 * Implements the standardized communication interface
 */
export class StandardYourAgent implements AgentImplementation {
  private agent: YourAgent;
  private logger: Logger;

  constructor(agent: YourAgent, logger: Logger) {
    this.agent = agent;
    this.logger = logger.child({ component: 'StandardYourAgent' });
  }

  getCapabilities(): AgentCapabilities {
    return this.agent.getCapabilities();
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    return this.agent.healthCheck();
  }

  getToolHandlers(): Record<string, ToolHandler> {
    return {
      yourTool: async (parameters: any, context?: ConversationContext) => {
        try {
          // Parameter validation
          const required = ['requiredParam'];
          const missing = required.filter(param => !parameters[param]);
          
          if (missing.length > 0) {
            return {
              success: false,
              message: `Missing required parameters: ${missing.join(', ')}`,
              data: { 
                error: 'Parameter validation failed',
                missingParameters: missing,
                requiredParameters: required
              },
              metadata: {
                tool: 'yourTool',
                executionTime: 0,
                agent: 'your-agent'
              }
            };
          }

          const ctx = context || this.createDefaultContext('yourTool');
          const result = await this.agent.yourTool({ ...parameters, context: ctx });
          
          this.logger.info({
            tool: 'yourTool',
            success: result.success,
            executionTime: result.metadata?.executionTime
          }, 'Tool execution completed');

          return result;

        } catch (error) {
          this.logger.error({ 
            tool: 'yourTool', 
            error: error.message 
          }, 'Tool execution failed');
          throw error;
        }
      }

      // Add more tool handlers...
    };
  }

  private createDefaultContext(toolName: string): ConversationContext {
    const timestamp = Date.now();
    return {
      conversationId: `your-agent-${timestamp}`,
      userId: 'your-agent-user',
      sessionId: `your-agent-session-${timestamp}`,
      history: [],
      metadata: {
        source: 'your-agent',
        tool: toolName,
        createdAt: new Date().toISOString()
      }
    };
  }
}
```

---

## 🔌 WebSocket Server Integration

### Simple WebSocket MCP Server

```typescript
// packages/agents/your-agent/src/server/WebSocketMCPServer.ts
import { Logger } from 'pino';
import { 
  AgentCommunicationServer,
  createAgentCommunicationServer
} from '@ai-idp/agent-communication';
import { StandardYourAgent } from '../adapter/StandardYourAgent';

export class YourAgentWebSocketServer {
  private server: AgentCommunicationServer;
  private standardAgent: StandardYourAgent;
  private logger: Logger;

  constructor(standardAgent: StandardYourAgent, logger: Logger) {
    this.standardAgent = standardAgent;
    this.logger = logger.child({ component: 'YourAgentWebSocketServer' });
    
    // Use the standardized communication server
    this.server = createAgentCommunicationServer(standardAgent, {
      heartbeatInterval: 30000,
      healthCheckTimeout: 90000
    });
  }

  async start(port: number = 3006): Promise<void> {
    try {
      this.logger.info({ port }, 'Starting Your Agent WebSocket server');
      await this.server.start(port);
      this.logger.info({ port }, 'Your Agent WebSocket server started successfully');
    } catch (error) {
      this.logger.error(error, 'Failed to start Your Agent WebSocket server');
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping Your Agent WebSocket server');
      await this.server.stop();
      this.logger.info('Your Agent WebSocket server stopped');
    } catch (error) {
      this.logger.error(error, 'Failed to stop Your Agent WebSocket server');
      throw error;
    }
  }

  getStatus() {
    return this.server.getStatus();
  }
}
```

---

## 📋 Main Entry Point

```typescript
// packages/agents/your-agent/src/index.ts
import { YourAgent, type YourAgentConfig } from './agent/YourAgent';
import { StandardYourAgent } from './adapter/StandardYourAgent';
import { YourAgentWebSocketServer } from './server/WebSocketMCPServer';
import { pino } from 'pino';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: require('path').resolve(__dirname, '../../../.env') });

// Export main components
export {
  YourAgent,
  StandardYourAgent,
  YourAgentWebSocketServer,
  type YourAgentConfig
};

export * from '@ai-idp/types';

/**
 * Create Your Agent with default configuration
 */
export function createYourAgent(
  overrides?: Partial<YourAgentConfig>
): YourAgent {
  const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    name: 'your-agent'
  });

  const config: YourAgentConfig = {
    agentId: process.env.YOUR_AGENT_ID || 'your-agent',
    name: process.env.YOUR_AGENT_NAME || 'Your Agent',
    // Add your configuration from environment
    apiKey: process.env.YOUR_API_KEY,
    endpoint: process.env.YOUR_ENDPOINT,
    ...overrides
  };

  return new YourAgent(config, logger);
}

/**
 * Start Your Agent as standalone service
 */
export async function startYourAgentService(
  port: number = parseInt(process.env.YOUR_AGENT_PORT || '3006', 10)
): Promise<void> {
  const logger = pino({ name: 'your-agent-service' });

  try {
    logger.info({ port }, 'Starting Your Agent service');

    // Create and initialize agent
    const agent = createYourAgent();
    await agent.initialize();

    // Create standard adapter
    const standardAgent = new StandardYourAgent(agent, logger);

    // Start WebSocket server
    const wsServer = new YourAgentWebSocketServer(standardAgent, logger);
    await wsServer.start(port);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Your Agent service...');
      await wsServer.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error(error, 'Failed to start Your Agent service');
    process.exit(1);
  }
}

// Start service if run directly
if (require.main === module) {
  startYourAgentService();
}
```

---

## 🧪 Testing Your Agent

### Test Suite Template

```typescript
// packages/agents/your-agent/src/test/YourAgent.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { YourAgent } from '../agent/YourAgent';
import { StandardYourAgent } from '../adapter/StandardYourAgent';
import { YourAgentWebSocketServer } from '../server/WebSocketMCPServer';
import { pino } from 'pino';

describe('YourAgent', () => {
  let agent: YourAgent;
  let standardAgent: StandardYourAgent;
  let server: YourAgentWebSocketServer;
  const logger = pino({ level: 'silent' }); // Silent for tests

  beforeEach(async () => {
    agent = new YourAgent({
      agentId: 'test-your-agent',
      name: 'Test Your Agent'
    }, logger);

    await agent.initialize();
    standardAgent = new StandardYourAgent(agent, logger);
    server = new YourAgentWebSocketServer(standardAgent, logger);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Agent Capabilities', () => {
    it('should return valid capabilities', () => {
      const capabilities = agent.getCapabilities();
      
      expect(capabilities).toHaveProperty('agentId');
      expect(capabilities).toHaveProperty('name');
      expect(capabilities).toHaveProperty('tools');
      expect(capabilities.tools).toBeInstanceOf(Array);
      expect(capabilities.tools.length).toBeGreaterThan(0);
    });

    it('should have required tool properties', () => {
      const capabilities = agent.getCapabilities();
      const tool = capabilities.tools[0];
      
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('parameters');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const health = await agent.healthCheck();
      
      expect(health).toHaveProperty('healthy');
      expect(health.healthy).toBe(true);
    });
  });

  describe('Tool Execution', () => {
    it('should execute your tool successfully', async () => {
      const result = await agent.yourTool({
        requiredParam: 'test-value',
        context: {
          conversationId: 'test-conversation',
          userId: 'test-user',
          sessionId: 'test-session',
          history: [],
          metadata: {}
        }
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('metadata');
    });

    it('should handle missing parameters', async () => {
      const toolHandlers = standardAgent.getToolHandlers();
      const result = await toolHandlers.yourTool({});

      expect(result).toHaveProperty('success', false);
      expect(result.message).toContain('Missing required parameters');
    });
  });

  describe('WebSocket Server', () => {
    it('should start and stop server', async () => {
      const port = 3007; // Use different port for tests
      
      await server.start(port);
      const status = server.getStatus();
      
      expect(status.running).toBe(true);
      expect(status.port).toBe(port);
      
      await server.stop();
    });
  });
});
```

### Integration Test

```javascript
// test-your-agent-integration.js
const WebSocket = require('ws');
const { createMessageConnection } = require('vscode-jsonrpc');

async function testYourAgent() {
  console.log('Testing Your Agent WebSocket connection...');
  
  const port = process.env.YOUR_AGENT_PORT || 3006;
  const socket = new WebSocket(`ws://localhost:${port}/mcp`);
  
  await new Promise((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
  
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

  const connection = createMessageConnection(messageReader, messageWriter);
  connection.listen();
  
  // Test health check
  const health = await connection.sendRequest('health/check', {});
  console.log('Health check:', health.healthy ? '✅ Healthy' : '❌ Unhealthy');
  
  // Test tools list
  const tools = await connection.sendRequest('tools/list', {});
  console.log(`Available tools: ${tools.tools.length}`);
  
  // Test tool call
  const result = await connection.sendRequest('tools/call', {
    name: 'yourTool',
    arguments: { requiredParam: 'test-value' }
  });
  console.log('Tool call result:', result.success ? '✅ Success' : '❌ Failed');
  
  socket.close();
  console.log('🎉 All tests completed!');
}

testYourAgent().catch(console.error);
```

---

## 📦 Build and Deployment

### Add to Root Package.json

```json
// Add to root package.json scripts
{
  "scripts": {
    "dev:your-agent": "cd packages/agents/your-agent && npm run dev",
    "build:your-agent": "cd packages/agents/your-agent && npm run build",
    "test:your-agent": "cd packages/agents/your-agent && npm run test",
    
    // Update existing scripts
    "build": "npm run build:shared && npm run build:meta-agent && npm run build:infrastructure && npm run build:your-agent && npm run build:web",
    "test": "concurrently \"npm run test:shared\" \"npm run test:meta-agent\" \"npm run test:infrastructure\" \"npm run test:your-agent\" \"npm run test:web\""
  }
}
```

### Environment Configuration

```bash
# Add to .env file
YOUR_AGENT_PORT=3006
YOUR_AGENT_ID=your-agent
YOUR_AGENT_NAME="Your Agent"
YOUR_API_KEY=your-api-key-here
YOUR_ENDPOINT=https://your-service-endpoint.com
```

---

## 🔗 Meta-Agent Integration

### Register with Meta-Agent

```typescript
// In Meta-Agent configuration
import { SimpleWebSocketMCPClient } from '@ai-idp/mcp-client';

const mcpClient = new SimpleWebSocketMCPClient(config);

// Connect to your agent
await mcpClient.connectToAgent(
  'your-agent',
  'ws://localhost:3006/mcp',
  yourAgentCapabilities
);
```

---

## ✅ Validation Checklist

Before deploying your agent, ensure:

- [ ] **Agent implements all required interfaces**
- [ ] **WebSocket server starts successfully**  
- [ ] **All tools have proper parameter validation**
- [ ] **Health check returns accurate status**
- [ ] **Error handling is comprehensive**
- [ ] **Tests achieve >95% coverage**
- [ ] **Integration test passes**
- [ ] **Environment variables are documented**
- [ ] **Agent capabilities are accurate**
- [ ] **Logging is comprehensive but not verbose**

---

## 🎯 Best Practices

### 1. **Error Handling**
- Always return structured error responses
- Use ServiceError for consistent error types
- Log errors appropriately (not user data)
- Validate all parameters before processing

### 2. **Performance**
- Implement proper timeout handling
- Use connection pooling for external services
- Cache expensive operations when possible
- Monitor and log execution times

### 3. **Security**
- Never log sensitive data (API keys, user data)
- Validate all inputs thoroughly
- Use environment variables for configuration
- Implement proper authentication if needed

### 4. **Monitoring**
- Use structured logging (JSON format)
- Include correlation IDs in logs
- Monitor health check endpoints
- Track tool execution metrics

### 5. **Documentation**
- Document all tools and parameters
- Provide usage examples
- Maintain changelog for versions
- Include troubleshooting guide

---

## 📚 References

- [Infrastructure Agent Implementation](../packages/agents/infrastructure/) - Complete reference implementation
- [Agent Communication Library](../packages/shared/agent-communication/) - Standardized communication patterns
- [Types Documentation](../packages/shared/types/) - All TypeScript definitions
- [Testing Guide](./TESTING.md) - Comprehensive testing strategies

---

**🚀 Your agent is now ready for seamless Meta-Agent integration!**

For questions or support, refer to the Infrastructure Agent as the reference implementation or check the shared libraries documentation.