# AI-IDP Agent Development Guide

**Complete reference for creating focused agents with standardized HTTP MCP transport communication**

---

## Overview

This guide provides everything you need to create a new focused agent that integrates seamlessly with the AI-IDP Meta-Agent using our standardized communication library.

### What You'll Learn
- 🏗️ Agent architecture and project structure
- 🔌 HTTP MCP integration
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
    "@ai-idp/mcp-client": "file:../../shared/mcp-client",
    "@modelcontextprotocol/sdk": "^1.0.4",
    "express": "^4.18.2",
    "pino": "^8.19.0",
    "zod": "^3.22.4",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
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
        mcp: `http://localhost:${process.env.YOUR_AGENT_PORT || '3006'}/mcp`,
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

## 🔌 HTTP MCP Server Integration

### HTTP MCP Server Implementation

```typescript
// packages/agents/your-agent/src/server/HTTPMCPServer.ts
import { Logger } from 'pino';
import express, { Express } from 'express';
import { Server } from 'http';
import { 
  MCPServer,
  Tool,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StandardYourAgent } from '../adapter/StandardYourAgent';

export class YourAgentHTTPMCPServer {
  private app: Express;
  private server: Server | null = null;
  private mcpServer: MCPServer;
  private standardAgent: StandardYourAgent;
  private logger: Logger;
  private port: number;

  constructor(standardAgent: StandardYourAgent, logger: Logger, port: number = 3006) {
    this.standardAgent = standardAgent;
    this.logger = logger.child({ component: 'YourAgentHTTPMCPServer' });
    this.port = port;
    this.app = express();
    
    // Create MCP Server
    this.mcpServer = new MCPServer(
      {
        name: 'your-agent',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    
    this.setupMCPServer();
    this.setupExpressRoutes();
  }

  private setupMCPServer(): void {
    // Register tools from agent capabilities
    const capabilities = this.standardAgent.getCapabilities();
    const toolHandlers = this.standardAgent.getToolHandlers();
    
    capabilities.tools.forEach(tool => {
      this.mcpServer.setRequestHandler(
        CallToolRequestSchema,
        async (request) => {
          const { name, arguments: args } = request.params;
          
          if (name === tool.name && toolHandlers[name]) {
            try {
              const result = await toolHandlers[name](args);
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }]
              };
            } catch (error) {
              return {
                content: [{
                  type: 'text', 
                  text: `Error: ${error.message}`
                }],
                isError: true
              };
            }
          }
          
          throw new Error(`Unknown tool: ${name}`);
        }
      );
    });
    
    // Set tool list handler
    this.mcpServer.setRequestHandler('tools/list', async () => {
      return {
        tools: capabilities.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.parameters
        }))
      };
    });
  }

  private setupExpressRoutes(): void {
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.standardAgent.healthCheck();
        res.status(health.healthy ? 200 : 503).json(health);
      } catch (error) {
        this.logger.error(error, 'Health check failed');
        res.status(500).json({ healthy: false, error: error.message });
      }
    });
    
    // MCP endpoint
    this.app.post('/mcp', async (req, res) => {
      try {
        // Create stdio transport for this request
        const transport = new StdioServerTransport();
        
        // Process MCP request
        const response = await this.mcpServer.handleRequest(req.body);
        res.json(response);
        
      } catch (error) {
        this.logger.error(error, 'MCP request failed');
        res.status(500).json({ 
          error: error.message,
          id: req.body?.id || null
        });
      }
    });
    
    // Agent capabilities endpoint
    this.app.get('/capabilities', (req, res) => {
      const capabilities = this.standardAgent.getCapabilities();
      res.json(capabilities);
    });
  }

  async start(): Promise<void> {
    try {
      this.logger.info({ port: this.port }, 'Starting Your Agent HTTP MCP server');
      
      this.server = this.app.listen(this.port, () => {
        this.logger.info({ port: this.port }, 'Your Agent HTTP MCP server started successfully');
      });
      
    } catch (error) {
      this.logger.error(error, 'Failed to start Your Agent HTTP MCP server');
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.server) {
        this.logger.info('Stopping Your Agent HTTP MCP server');
        this.server.close();
        this.server = null;
        this.logger.info('Your Agent HTTP MCP server stopped');
      }
    } catch (error) {
      this.logger.error(error, 'Failed to stop Your Agent HTTP MCP server');
      throw error;
    }
  }

  getStatus() {
    return {
      running: this.server !== null,
      port: this.port,
      endpoints: {
        health: `http://localhost:${this.port}/health`,
        mcp: `http://localhost:${this.port}/mcp`,
        capabilities: `http://localhost:${this.port}/capabilities`
      }
    };
  }
}
```

---

## 📋 Main Entry Point

```typescript
// packages/agents/your-agent/src/index.ts
import { YourAgent, type YourAgentConfig } from './agent/YourAgent';
import { StandardYourAgent } from './adapter/StandardYourAgent';
import { YourAgentHTTPMCPServer } from './server/HTTPMCPServer';
import { pino } from 'pino';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: require('path').resolve(__dirname, '../../../.env') });

// Export main components
export {
  YourAgent,
  StandardYourAgent,
  YourAgentHTTPMCPServer,
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

    // Start HTTP MCP server
    const httpServer = new YourAgentHTTPMCPServer(standardAgent, logger, port);
    await httpServer.start();

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down Your Agent service...');
      await httpServer.stop();
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
import { YourAgentHTTPMCPServer } from '../server/HTTPMCPServer';
import { pino } from 'pino';

describe('YourAgent', () => {
  let agent: YourAgent;
  let standardAgent: StandardYourAgent;
  let server: YourAgentHTTPMCPServer;
  const logger = pino({ level: 'silent' }); // Silent for tests

  beforeEach(async () => {
    agent = new YourAgent({
      agentId: 'test-your-agent',
      name: 'Test Your Agent'
    }, logger);

    await agent.initialize();
    standardAgent = new StandardYourAgent(agent, logger);
    server = new YourAgentHTTPMCPServer(standardAgent, logger, 3007);
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

  describe('HTTP MCP Server', () => {
    it('should start and stop server', async () => {
      await server.start();
      const status = server.getStatus();
      
      expect(status.running).toBe(true);
      expect(status.port).toBe(3007);
      expect(status.endpoints).toHaveProperty('mcp');
      expect(status.endpoints).toHaveProperty('health');
      
      await server.stop();
    });
  });
});
```

### Integration Test

```javascript
// test-your-agent-integration.js
const axios = require('axios');

async function testYourAgent() {
  console.log('Testing Your Agent HTTP MCP connection...');
  
  const port = process.env.YOUR_AGENT_PORT || 3006;
  const baseUrl = `http://localhost:${port}`;
  
  try {
    // Test health check
    const healthResponse = await axios.get(`${baseUrl}/health`);
    console.log('Health check:', healthResponse.data.healthy ? '✅ Healthy' : '❌ Unhealthy');
    
    // Test capabilities
    const capabilitiesResponse = await axios.get(`${baseUrl}/capabilities`);
    console.log(`Available tools: ${capabilitiesResponse.data.tools.length}`);
    
    // Test MCP tools list
    const toolsResponse = await axios.post(`${baseUrl}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });
    console.log(`MCP tools list: ${toolsResponse.data.result?.tools?.length || 0} tools`);
    
    // Test tool call
    const toolCallResponse = await axios.post(`${baseUrl}/mcp`, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'yourTool',
        arguments: { requiredParam: 'test-value' }
      }
    });
    
    const toolResult = toolCallResponse.data.result;
    console.log('Tool call result:', toolResult && !toolResult.isError ? '✅ Success' : '❌ Failed');
    
    console.log('🎉 All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
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
import { SimpleHTTPMCPClient } from '@ai-idp/mcp-client';

const mcpClient = new SimpleHTTPMCPClient(config);

// Connect to your agent
await mcpClient.connectToAgent(
  'your-agent',
  'http://localhost:3006/mcp',
  yourAgentCapabilities
);
```

---

## ✅ Validation Checklist

Before deploying your agent, ensure:

- [ ] **Agent implements all required interfaces**
- [ ] **HTTP MCP server starts successfully**  
- [ ] **All tools have proper parameter validation**
- [ ] **Health check returns accurate status**
- [ ] **Error handling is comprehensive**
- [ ] **Tests achieve >95% coverage**
- [ ] **Integration test passes**
- [ ] **Environment variables are documented**
- [ ] **Agent capabilities are accurate**
- [ ] **Logging is comprehensive but not verbose**
- [ ] **MCP endpoints respond correctly**
- [ ] **HTTP routes are properly secured**

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