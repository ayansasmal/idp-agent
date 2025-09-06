import { Logger } from 'pino';
import type {
  AgentCapabilities,
  ToolDefinition,
  ConversationContext
} from '@ai-idp/types';
import { InfrastructureAgent } from '../agent/InfrastructureAgent';

/**
 * Agent implementation interface for standardized communication
 */
interface AgentImplementation {
  /** Agent capabilities including tools and metadata */
  getCapabilities(): AgentCapabilities;
  
  /** Health check method */
  healthCheck(): Promise<{ healthy: boolean; details?: any }>;
  
  /** Tool handlers mapped by tool name */
  getToolHandlers(): Record<string, ToolHandler>;
}

/**
 * Tool handler function signature
 */
type ToolHandler = (
  parameters: Record<string, any>,
  context?: ConversationContext
) => Promise<any>;

/**
 * Infrastructure Agent implementation for standardized communication
 * 
 * Adapts the existing InfrastructureAgent to work with the standardized
 * AgentCommunicationServer pattern.
 */
export class StandardInfrastructureAgent implements AgentImplementation {
  private agent: InfrastructureAgent;
  private logger: Logger;
  private port: number;

  constructor(agent: InfrastructureAgent, logger: Logger, port?: number) {
    this.agent = agent;
    this.logger = logger.child({ component: 'StandardInfrastructureAgent' });
    this.port = port || parseInt(process.env.INFRASTRUCTURE_AGENT_PORT || '3003', 10);
  }

  /**
   * Get agent capabilities
   */
  getCapabilities(): AgentCapabilities {
    const capabilities = this.agent.getCapabilities();
    
    // Update endpoints to use WebSocket URLs with the actual port
    return {
      ...capabilities,
      endpoints: {
        mcp: `ws://localhost:${this.port}/mcp`,
        health: `ws://localhost:${this.port}/health`
      }
    };
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    try {
      const health = await this.agent.healthCheck();
      return health;
    } catch (error) {
      this.logger.error({ error: error.message }, 'Health check failed');
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Get tool handlers mapped by tool name
   */
  getToolHandlers(): Record<string, ToolHandler> {
    return {
      deployApplication: async (parameters: any, context?: ConversationContext) => {
        try {
          // Validate required parameters
          const required = ['resourceName', 'containerImage'];
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
                tool: 'deployApplication',
                executionTime: 0,
                agent: 'infrastructure'
              }
            };
          }

          // Add context if not provided
          const ctx = context || this.createDefaultContext('deployApplication');
          const paramsWithContext = { ...parameters, context: ctx };

          const result = await this.agent.deployApplication(paramsWithContext);
          
          this.logger.info({
            tool: 'deployApplication',
            success: result.success,
            executionTime: result.metadata?.executionTime
          }, 'Deploy application completed');

          return result;
        } catch (error) {
          this.logger.error({ 
            tool: 'deployApplication', 
            error: error.message 
          }, 'Deploy application failed');
          throw error;
        }
      },

      scaleResource: async (parameters: any, context?: ConversationContext) => {
        try {
          const ctx = context || this.createDefaultContext('scaleResource');
          const paramsWithContext = { ...parameters, context: ctx };

          const result = await this.agent.scaleResource(paramsWithContext);
          
          this.logger.info({
            tool: 'scaleResource',
            success: result.success,
            executionTime: result.metadata?.executionTime
          }, 'Scale resource completed');

          return result;
        } catch (error) {
          this.logger.error({ 
            tool: 'scaleResource', 
            error: error.message 
          }, 'Scale resource failed');
          throw error;
        }
      },

      getResourceStatus: async (parameters: any, context?: ConversationContext) => {
        try {
          const ctx = context || this.createDefaultContext('getResourceStatus');
          const paramsWithContext = { ...parameters, context: ctx };

          const result = await this.agent.getResourceStatus(paramsWithContext);
          
          this.logger.info({
            tool: 'getResourceStatus',
            success: result.success,
            executionTime: result.metadata?.executionTime
          }, 'Get resource status completed');

          return result;
        } catch (error) {
          this.logger.error({ 
            tool: 'getResourceStatus', 
            error: error.message 
          }, 'Get resource status failed');
          throw error;
        }
      },

      getResourceLogs: async (parameters: any, context?: ConversationContext) => {
        try {
          const ctx = context || this.createDefaultContext('getResourceLogs');
          const paramsWithContext = { ...parameters, context: ctx };

          const result = await this.agent.getResourceLogs(paramsWithContext);
          
          this.logger.info({
            tool: 'getResourceLogs',
            success: result.success,
            executionTime: result.metadata?.executionTime
          }, 'Get resource logs completed');

          return result;
        } catch (error) {
          this.logger.error({ 
            tool: 'getResourceLogs', 
            error: error.message 
          }, 'Get resource logs failed');
          throw error;
        }
      },

      provisionDatabase: async (parameters: any, context?: ConversationContext) => {
        try {
          const ctx = context || this.createDefaultContext('provisionDatabase');
          const paramsWithContext = { ...parameters, context: ctx };

          const result = await this.agent.provisionDatabase(paramsWithContext);
          
          this.logger.info({
            tool: 'provisionDatabase',
            success: result.success,
            executionTime: result.metadata?.executionTime
          }, 'Provision database completed');

          return result;
        } catch (error) {
          this.logger.error({ 
            tool: 'provisionDatabase', 
            error: error.message 
          }, 'Provision database failed');
          throw error;
        }
      }
    };
  }

  /**
   * Create a default context for tool calls
   * @private
   */
  private createDefaultContext(toolName: string): ConversationContext {
    const timestamp = Date.now();
    return {
      conversationId: `infrastructure-${timestamp}`,
      userId: 'infrastructure-agent-user',
      sessionId: `infrastructure-session-${timestamp}`,
      history: [],
      metadata: {
        source: 'infrastructure-agent',
        tool: toolName,
        createdAt: new Date().toISOString()
      }
    };
  }
}