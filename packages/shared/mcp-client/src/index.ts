import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { Logger } from 'pino';
import type {
  MCPRequest,
  MCPResponse,
  AgentCapabilities,
  ToolDefinition,
  MCPConfig,
  ConversationContext
} from '@ai-idp/types';

// MCP Configuration Schema
const MCPConfigSchema = z.object({
  serverPort: z.number().default(3001),
  clientTimeout: z.number().default(30000),
  maxRetries: z.number().default(3),
  retryDelay: z.number().default(1000)
});

// Agent Registry Entry
interface AgentRegistryEntry {
  capabilities: AgentCapabilities;
  client: Client;
  transport: SSEClientTransport | StdioClientTransport;
  lastHealthCheck: Date;
  healthy: boolean;
}

export class MCPAgentClient {
  private agentRegistry: Map<string, AgentRegistryEntry> = new Map();
  private config: z.infer<typeof MCPConfigSchema>;
  private logger: Logger;

  constructor(config: MCPConfig, logger: Logger) {
    this.config = MCPConfigSchema.parse(config);
    this.logger = logger;
  }

  /**
   * Register a focused agent with MCP client
   */
  async registerAgent(capabilities: AgentCapabilities): Promise<void> {
    try {
      this.logger.info({
        name: capabilities.name,
        tools: capabilities.tools.length
      }, `Registering agent: ${capabilities.agentId}`);

      // Create MCP transport (SSE for HTTP endpoints)
      const transport = new SSEClientTransport(
        new URL(capabilities.endpoints.mcp)
      );

      // Create MCP client
      const client = new Client(
        {
          name: 'meta-agent',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // Connect to the agent
      await client.connect(transport);

      // Store in registry
      this.agentRegistry.set(capabilities.agentId, {
        capabilities,
        client,
        transport,
        lastHealthCheck: new Date(),
        healthy: true
      });

      this.logger.info({ agentId: capabilities.agentId }, 'Successfully registered agent');
    } catch (error) {
      this.logger.error({ error }, `Failed to register agent: ${capabilities.agentId}`);
      throw error;
    }
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    try {
      const entry = this.agentRegistry.get(agentId);
      if (!entry) {
        this.logger.warn(`Agent not found for unregistration: ${agentId}`);
        return;
      }

      // Close client connection
      await entry.client.close();

      // Remove from registry
      this.agentRegistry.delete(agentId);

      this.logger.info({ agentId }, 'Unregistered agent');
    } catch (error) {
      this.logger.error({ error }, `Failed to unregister agent: ${agentId}`);
      throw error;
    }
  }

  /**
   * Call a tool on a specific agent
   */
  async callTool(
    agentId: string,
    toolName: string,
    parameters: Record<string, any>,
    context: ConversationContext
  ): Promise<MCPResponse> {
    const startTime = Date.now();

    try {
      const entry = this.agentRegistry.get(agentId);
      if (!entry) {
        throw new Error(`Agent not registered: ${agentId}`);
      }

      if (!entry.healthy) {
        throw new Error(`Agent is unhealthy: ${agentId}`);
      }

      // Check if tool exists
      const tool = entry.capabilities.tools.find(t => t.name === toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName} on agent ${agentId}`);
      }

      this.logger.info({
        toolName,
        agentId,
        parameters: Object.keys(parameters),
        contextId: context.conversationId
      }, 'Calling tool');

      // Create MCP request
      const request: MCPRequest = {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: parameters
        },
        id: `${context.conversationId}_${Date.now()}`,
        context
      };

      // Make the MCP call with retry logic
      const result = await this.callWithRetry(
        () => entry.client.callTool({
          name: toolName,
          arguments: parameters
        }),
        this.config.maxRetries
      );

      const executionTime = Date.now() - startTime;

      const response: MCPResponse = {
        result: result.content,
        id: request.id,
        metadata: {
          agent: agentId,
          executionTime,
          contextUsed: context.history.slice(-3).map(h => h.id) // Last 3 messages
        }
      };

      this.logger.info({
        agentId,
        executionTime,
        success: !response.error
      }, `Tool call completed: ${toolName}`);

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.logger.error({
        agentId,
        error: error.message,
        executionTime
      }, `Tool call failed: ${toolName}`);

      return {
        error: {
          code: -1,
          message: error.message,
          data: { agentId, toolName }
        },
        id: `${context.conversationId}_${Date.now()}`,
        metadata: {
          agent: agentId,
          executionTime
        }
      };
    }
  }

  /**
   * Get available tools from all registered agents
   */
  getAvailableTools(): Record<string, ToolDefinition[]> {
    const toolsByAgent: Record<string, ToolDefinition[]> = {};

    for (const [agentId, entry] of this.agentRegistry) {
      if (entry.healthy) {
        toolsByAgent[agentId] = entry.capabilities.tools;
      }
    }

    return toolsByAgent;
  }

  /**
   * Find agents that can handle a specific capability
   */
  findAgentsForCapability(capability: string): AgentCapabilities[] {
    const matchingAgents: AgentCapabilities[] = [];

    for (const [, entry] of this.agentRegistry) {
      if (entry.healthy && entry.capabilities.specializations.includes(capability)) {
        matchingAgents.push(entry.capabilities);
      }
    }

    return matchingAgents;
  }

  /**
   * Health check for all registered agents
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const healthStatus: Record<string, boolean> = {};

    const healthPromises = Array.from(this.agentRegistry.entries()).map(
      async ([agentId, entry]) => {
        try {
          // Simple ping to health endpoint
          const response = await fetch(entry.capabilities.endpoints.health, {
            method: 'GET'
          });

          const healthy = response.ok;
          entry.healthy = healthy;
          entry.lastHealthCheck = new Date();

          healthStatus[agentId] = healthy;

          if (!healthy) {
            this.logger.warn({
              status: response.status,
              statusText: response.statusText
            }, `Agent unhealthy: ${agentId}`);
          }
        } catch (error) {
          entry.healthy = false;
          entry.lastHealthCheck = new Date();
          healthStatus[agentId] = false;

          this.logger.error({ error }, `Agent health check failed: ${agentId}`);
        }
      }
    );

    await Promise.all(healthPromises);

    return healthStatus;
  }

  /**
   * Get registered agents info
   */
  getRegisteredAgents(): AgentCapabilities[] {
    return Array.from(this.agentRegistry.values())
      .filter(entry => entry.healthy)
      .map(entry => entry.capabilities);
  }

  /**
   * Broadcast a message to all healthy agents (for notifications)
   */
  async broadcastNotification(
    message: string,
    data?: Record<string, any>
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    const broadcastPromises = Array.from(this.agentRegistry.entries())
      .filter(([, entry]) => entry.healthy)
      .map(async ([agentId, entry]) => {
        try {
          // If agent supports notifications, send it
          const notificationTool = entry.capabilities.tools.find(
            tool => tool.name === 'receiveNotification'
          );

          if (notificationTool) {
            await entry.client.callTool({
              name: 'receiveNotification',
              arguments: { message, data }
            });
            results[agentId] = true;
          } else {
            results[agentId] = false; // Agent doesn't support notifications
          }
        } catch (error) {
          this.logger.error({ error }, `Broadcast failed to agent: ${agentId}`);
          results[agentId] = false;
        }
      });

    await Promise.all(broadcastPromises);

    return results;
  }

  /**
   * Retry logic for MCP calls
   */
  private async callWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));

        this.logger.warn({
          error: error.message,
          nextRetryIn: delay
        }, `MCP call failed, retrying (${attempt}/${maxRetries})`);
      }
    }

    throw lastError!;
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up MCP agent clients');

    const cleanupPromises = Array.from(this.agentRegistry.keys()).map(
      agentId => this.unregisterAgent(agentId)
    );

    await Promise.all(cleanupPromises);

    this.logger.info('MCP agent client cleanup completed');
  }
}

export * from '@ai-idp/types';