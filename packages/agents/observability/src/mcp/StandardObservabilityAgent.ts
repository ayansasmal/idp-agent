import { Logger } from 'pino';
import type {
  AgentCapabilities,
  ConversationContext
} from '@ai-idp/types';
import { ObservabilityAgent } from '../agent/ObservabilityAgent';

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
 * Observability Agent implementation for standardized communication
 * 
 * Adapts the existing ObservabilityAgent to work with the standardized
 * AgentCommunicationServer pattern for WebSocket + JSON-RPC communication.
 */
export class StandardObservabilityAgent implements AgentImplementation {
  private agent: ObservabilityAgent;
  private logger: Logger;
  private port: number;

  constructor(agent: ObservabilityAgent, logger: Logger, port?: number) {
    this.agent = agent;
    this.logger = logger.child({ component: 'StandardObservabilityAgent' });
    this.port = port || parseInt(process.env.OBSERVABILITY_AGENT_PORT || '3006', 10);
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
      analyzeMetrics: async (parameters: any, context?: ConversationContext) => {
        try {
          // Validate required parameters
          const required = ['query', 'duration'];
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
                tool: 'analyzeMetrics',
                executionTime: 0,
                agent: 'observability'
              }
            };
          }

          // Add context if not provided
          const ctx = context || this.createDefaultContext('analyzeMetrics');
          const paramsWithContext = { ...parameters, context: ctx };

          const result = await this.agent.analyzeMetrics(paramsWithContext);
          
          this.logger.info({
            tool: 'analyzeMetrics',
            success: result.success,
            executionTime: result.metadata?.executionTime
          }, 'Analyze metrics completed');

          return result;
        } catch (error) {
          this.logger.error({ 
            tool: 'analyzeMetrics', 
            error: error.message 
          }, 'Analyze metrics failed');
          throw error;
        }
      },

      analyzeIncident: async (parameters: any, context?: ConversationContext) => {
        try {
          const required = ['alertId', 'symptoms'];
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
                tool: 'analyzeIncident',
                executionTime: 0,
                agent: 'observability'
              }
            };
          }

          const ctx = context || this.createDefaultContext('analyzeIncident');
          const paramsWithContext = { ...parameters, context: ctx };

          const result = await this.agent.analyzeIncident(paramsWithContext);
          
          this.logger.info({
            tool: 'analyzeIncident',
            success: result.success,
            executionTime: result.metadata?.executionTime
          }, 'Analyze incident completed');

          return result;
        } catch (error) {
          this.logger.error({ 
            tool: 'analyzeIncident', 
            error: error.message 
          }, 'Analyze incident failed');
          throw error;
        }
      },

      analyzeLogs: async (parameters: any, context?: ConversationContext) => {
        try {
          const required = ['query', 'timeRange'];
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
                tool: 'analyzeLogs',
                executionTime: 0,
                agent: 'observability'
              }
            };
          }

          const ctx = context || this.createDefaultContext('analyzeLogs');
          const paramsWithContext = { ...parameters, context: ctx };

          const result = await this.agent.analyzeLogs(paramsWithContext);
          
          this.logger.info({
            tool: 'analyzeLogs',
            success: result.success,
            executionTime: result.metadata?.executionTime
          }, 'Analyze logs completed');

          return result;
        } catch (error) {
          this.logger.error({ 
            tool: 'analyzeLogs', 
            error: error.message 
          }, 'Analyze logs failed');
          throw error;
        }
      },

      createDashboard: async (parameters: any, context?: ConversationContext) => {
        try {
          const required = ['name', 'description'];
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
                tool: 'createDashboard',
                executionTime: 0,
                agent: 'observability'
              }
            };
          }

          const ctx = context || this.createDefaultContext('createDashboard');
          const paramsWithContext = { ...parameters, context: ctx };

          // Check if the agent has createDashboard method
          if (typeof (this.agent as any).createDashboard === 'function') {
            const result = await (this.agent as any).createDashboard(paramsWithContext);
            
            this.logger.info({
              tool: 'createDashboard',
              success: result.success,
              executionTime: result.metadata?.executionTime
            }, 'Create dashboard completed');

            return result;
          } else {
            return {
              success: false,
              message: 'Dashboard creation is not yet implemented',
              data: { error: 'Feature not available' },
              metadata: {
                tool: 'createDashboard',
                executionTime: 0,
                agent: 'observability'
              }
            };
          }
        } catch (error) {
          this.logger.error({ 
            tool: 'createDashboard', 
            error: error.message 
          }, 'Create dashboard failed');
          throw error;
        }
      },

      configureAlerts: async (parameters: any, context?: ConversationContext) => {
        try {
          const ctx = context || this.createDefaultContext('configureAlerts');
          const paramsWithContext = { ...parameters, context: ctx };

          // Check if the agent has configureAlerts method
          if (typeof (this.agent as any).configureAlerts === 'function') {
            const result = await (this.agent as any).configureAlerts(paramsWithContext);
            
            this.logger.info({
              tool: 'configureAlerts',
              success: result.success,
              executionTime: result.metadata?.executionTime
            }, 'Configure alerts completed');

            return result;
          } else {
            return {
              success: false,
              message: 'Alert configuration is not yet implemented',
              data: { error: 'Feature not available' },
              metadata: {
                tool: 'configureAlerts',
                executionTime: 0,
                agent: 'observability'
              }
            };
          }
        } catch (error) {
          this.logger.error({ 
            tool: 'configureAlerts', 
            error: error.message 
          }, 'Configure alerts failed');
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
      conversationId: `observability-${timestamp}`,
      userId: 'observability-agent-user',
      sessionId: `observability-session-${timestamp}`,
      history: [],
      metadata: {
        source: 'observability-agent',
        tool: toolName,
        createdAt: new Date().toISOString()
      }
    };
  }
}