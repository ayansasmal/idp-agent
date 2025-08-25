import { Anthropic } from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { QdrantContextClient } from '@ai-idp/qdrant-client';
import { MCPAgentClient } from '@ai-idp/mcp-client';
import type {
  ConversationContext,
  AgentIntent,
  AgentResponse,
  UserResponse,
  AgentCapabilities,
  MultiAgentWorkflow,
  MCPResponse
} from '@ai-idp/types';
import { IntentClassifier } from '../routing/IntentClassifier';
import { ContextManager } from '../context/ContextManager';
import { ResponseCoordinator } from './ResponseCoordinator';
import { Logger } from 'pino';

// Meta-Agent Configuration
export interface MetaAgentConfig {
  anthropic?: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
  openai?: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
  qdrant: {
    url: string;
    apiKey?: string;
    collectionName: string;
  };
  mcp: {
    clientTimeout: number;
    maxRetries: number;
  };
}

const MetaAgentConfigSchema = z.object({
  anthropic: z.object({
    apiKey: z.string(),
    model: z.string().default('claude-3-5-sonnet-20241022'),
    maxTokens: z.number().default(4096)
  }).optional(),
  openai: z.object({
    apiKey: z.string(),
    model: z.string().default('gpt-4-turbo-preview'),
    maxTokens: z.number().default(4096)
  }).optional(),
  qdrant: z.object({
    url: z.string().url(),
    apiKey: z.string().optional(),
    collectionName: z.string().default('meta_agent_context')
  }),
  mcp: z.object({
    clientTimeout: z.number().default(30000),
    maxRetries: z.number().default(3)
  })
});

/**
 * Meta-Agent: The central orchestrator for multi-agent workflows
 * 
 * Responsibilities:
 * - Intent classification and agent routing
 * - Context management via Qdrant vector database
 * - Multi-agent workflow coordination
 * - Response synthesis and user communication
 */
export class MetaAgent {
  private config: z.infer<typeof MetaAgentConfigSchema>;
  private anthropic?: Anthropic;
  private openai?: OpenAI;
  private qdrantClient: QdrantContextClient;
  private mcpClient: MCPAgentClient;
  private intentClassifier: IntentClassifier;
  private contextManager: ContextManager;
  private responseCoordinator: ResponseCoordinator;
  private logger: Logger;
  private isInitialized = false;

  // Registered focused agents
  private registeredAgents: Map<string, AgentCapabilities> = new Map();

  constructor(config: MetaAgentConfig, logger: Logger) {
    this.config = MetaAgentConfigSchema.parse(config);
    this.logger = logger.child({ component: 'MetaAgent' });

    // Initialize AI providers
    if (this.config.anthropic) {
      this.anthropic = new Anthropic({
        apiKey: this.config.anthropic.apiKey
      });
    }

    if (this.config.openai) {
      this.openai = new OpenAI({
        apiKey: this.config.openai.apiKey
      });
    }

    // Initialize context and communication clients
    this.qdrantClient = new QdrantContextClient(
      this.config.qdrant,
      this.config.openai?.apiKey || this.config.anthropic?.apiKey || '',
      this.logger
    );

    this.mcpClient = new MCPAgentClient(this.config.mcp, this.logger);

    // Initialize sub-components
    this.intentClassifier = new IntentClassifier(this.anthropic, this.openai, this.logger);
    this.contextManager = new ContextManager(this.qdrantClient, this.logger);
    this.responseCoordinator = new ResponseCoordinator(this.logger);
  }

  /**
   * Initialize the Meta-Agent and all subsystems
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Meta-Agent');

      // Initialize Qdrant context storage
      await this.qdrantClient.initialize();
      this.logger.info('Qdrant context client initialized');

      // Initialize context manager
      await this.contextManager.initialize();
      this.logger.info('Context manager initialized');

      // Validate AI providers
      await this.validateAIProviders();
      this.logger.info('AI providers validated');

      this.isInitialized = true;
      this.logger.info('Meta-Agent initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize Meta-Agent', { error });
      throw error;
    }
  }

  /**
   * Register a focused agent with the Meta-Agent
   */
  async registerFocusedAgent(capabilities: AgentCapabilities): Promise<void> {
    try {
      this.logger.info(`Registering focused agent: ${capabilities.agentId}`, {
        name: capabilities.name,
        tools: capabilities.tools.length,
        specializations: capabilities.specializations
      });

      // Register with MCP client
      await this.mcpClient.registerAgent(capabilities);

      // Store in local registry
      this.registeredAgents.set(capabilities.agentId, capabilities);

      this.logger.info(`Successfully registered focused agent: ${capabilities.agentId}`);
    } catch (error) {
      this.logger.error(`Failed to register focused agent: ${capabilities.agentId}`, { error });
      throw error;
    }
  }

  /**
   * Process user request - main entry point for conversations
   */
  async processRequest(
    userInput: string,
    context: ConversationContext
  ): Promise<UserResponse> {
    if (!this.isInitialized) {
      throw new Error('Meta-Agent not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    const requestId = uuidv4();

    this.logger.info('Processing user request', {
      requestId,
      userInput: userInput.substring(0, 100),
      userId: context.userId,
      conversationId: context.conversationId
    });

    try {
      // 1. Retrieve relevant context from Qdrant
      const relevantContext = await this.contextManager.retrieveRelevantContext(
        userInput,
        context
      );

      this.logger.info('Retrieved relevant context', {
        requestId,
        contextItems: relevantContext.length
      });

      // 2. Classify intent and determine agent routing
      const intent = await this.intentClassifier.classifyIntent(
        userInput,
        context,
        relevantContext
      );

      this.logger.info('Intent classified', {
        requestId,
        targetAgent: intent.agent,
        action: intent.action,
        confidence: intent.confidence
      });

      // 3. Route to appropriate focused agent(s)
      const agentResponses = await this.routeToAgents(intent, context);

      this.logger.info('Agent execution completed', {
        requestId,
        agentCount: agentResponses.length,
        successful: agentResponses.filter(r => r.success).length
      });

      // 4. Coordinate and synthesize responses
      const userResponse = await this.responseCoordinator.synthesizeResponse(
        agentResponses,
        intent,
        userInput
      );

      // 5. Store interaction context in Qdrant
      await this.contextManager.storeInteraction(
        context,
        userInput,
        userResponse,
        agentResponses
      );

      const executionTime = Date.now() - startTime;
      userResponse.metadata.totalExecutionTime = executionTime;

      this.logger.info('Request processed successfully', {
        requestId,
        executionTime,
        success: userResponse.success,
        agentsInvolved: userResponse.metadata.agentsInvolved
      });

      return userResponse;

    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.logger.error('Failed to process request', {
        requestId,
        error: error.message,
        executionTime
      });

      // Return error response
      return {
        success: false,
        message: `I encountered an error processing your request: ${error.message}`,
        metadata: {
          agentsInvolved: [],
          totalExecutionTime: executionTime,
          contextStored: false
        }
      };
    }
  }

  /**
   * Route intent to appropriate focused agents
   */
  private async routeToAgents(
    intent: AgentIntent,
    context: ConversationContext
  ): Promise<AgentResponse[]> {
    const targetAgent = this.registeredAgents.get(intent.agent);
    if (!targetAgent) {
      throw new Error(`No agent registered for: ${intent.agent}`);
    }

    // Find appropriate tool for the action
    const tool = targetAgent.tools.find(t => 
      t.name === intent.action || 
      t.name.includes(intent.action) ||
      intent.action.includes(t.name)
    );

    if (!tool) {
      throw new Error(`No tool found for action: ${intent.action} on agent: ${intent.agent}`);
    }

    this.logger.info('Routing to agent', {
      agent: intent.agent,
      tool: tool.name,
      parameters: Object.keys(intent.parameters)
    });

    // Call the focused agent via MCP
    const mcpResponse = await this.mcpClient.callTool(
      intent.agent,
      tool.name,
      intent.parameters,
      context
    );

    // Convert MCP response to AgentResponse format
    const agentResponse: AgentResponse = {
      agentId: intent.agent,
      success: !mcpResponse.error,
      message: mcpResponse.error ? mcpResponse.error.message : 'Operation completed successfully',
      data: mcpResponse.result || {},
      metadata: {
        agent: intent.agent,
        action: intent.action,
        hasDetailedResponse: !!mcpResponse.result?.detailedResponse,
        executionTime: mcpResponse.metadata.executionTime,
        contextUsed: mcpResponse.metadata.contextUsed || []
      }
    };

    // Add detailed response if available
    if (mcpResponse.result?.detailedResponse) {
      agentResponse.detailedResponse = mcpResponse.result.detailedResponse;
    }

    // Add errors if present
    if (mcpResponse.error) {
      agentResponse.errors = [mcpResponse.error.message];
    }

    return [agentResponse];
  }

  /**
   * Execute multi-agent workflow (for complex operations)
   */
  async executeWorkflow(workflow: MultiAgentWorkflow): Promise<UserResponse> {
    this.logger.info('Executing multi-agent workflow', {
      workflowId: workflow.workflowId,
      name: workflow.name,
      agents: workflow.agents,
      steps: workflow.steps.length
    });

    const agentResponses: AgentResponse[] = [];
    const startTime = Date.now();

    try {
      // Execute workflow steps in dependency order
      for (const step of workflow.steps) {
        // Check dependencies
        const dependenciesMet = step.dependencies.every(depId =>
          agentResponses.some(r => r.metadata.action === depId && r.success)
        );

        if (!dependenciesMet) {
          this.logger.warn('Workflow step dependencies not met', {
            stepId: step.stepId,
            dependencies: step.dependencies
          });
          continue;
        }

        // Execute step
        const mcpResponse = await this.mcpClient.callTool(
          step.agent,
          step.action,
          step.parameters,
          workflow.context
        );

        const agentResponse: AgentResponse = {
          agentId: step.agent,
          success: !mcpResponse.error,
          message: mcpResponse.error ? mcpResponse.error.message : `Step ${step.stepId} completed`,
          data: mcpResponse.result || {},
          metadata: {
            agent: step.agent,
            action: step.action,
            hasDetailedResponse: false,
            executionTime: mcpResponse.metadata.executionTime,
            contextUsed: mcpResponse.metadata.contextUsed || []
          }
        };

        agentResponses.push(agentResponse);

        // Stop if step failed and is critical
        if (!agentResponse.success) {
          this.logger.error('Workflow step failed', {
            workflowId: workflow.workflowId,
            stepId: step.stepId,
            error: mcpResponse.error
          });
          break;
        }
      }

      // Synthesize workflow response
      const userResponse = await this.responseCoordinator.synthesizeResponse(
        agentResponses,
        { agent: 'workflow', action: workflow.name, confidence: 1.0, parameters: {} },
        `Execute workflow: ${workflow.name}`
      );

      userResponse.metadata.totalExecutionTime = Date.now() - startTime;

      return userResponse;

    } catch (error) {
      this.logger.error('Workflow execution failed', {
        workflowId: workflow.workflowId,
        error: error.message
      });

      return {
        success: false,
        message: `Workflow execution failed: ${error.message}`,
        metadata: {
          agentsInvolved: agentResponses.map(r => r.agentId),
          totalExecutionTime: Date.now() - startTime,
          contextStored: false
        }
      };
    }
  }

  /**
   * Get status of all registered agents
   */
  async getAgentStatus(): Promise<Record<string, any>> {
    const healthStatus = await this.mcpClient.healthCheckAll();
    const registeredAgents = Array.from(this.registeredAgents.values());

    return {
      metaAgent: {
        initialized: this.isInitialized,
        registeredAgents: registeredAgents.length
      },
      focusedAgents: registeredAgents.map(agent => ({
        agentId: agent.agentId,
        name: agent.name,
        healthy: healthStatus[agent.agentId] || false,
        tools: agent.tools.length,
        specializations: agent.specializations
      })),
      qdrant: await this.qdrantClient.healthCheck(),
      mcp: {
        registeredAgents: Object.keys(healthStatus).length,
        healthyAgents: Object.values(healthStatus).filter(Boolean).length
      }
    };
  }

  /**
   * Validate AI providers
   */
  private async validateAIProviders(): Promise<void> {
    const providers = [];

    if (this.anthropic) {
      try {
        // Simple test call to validate Anthropic
        await this.anthropic.messages.create({
          model: this.config.anthropic!.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Test' }]
        });
        providers.push('anthropic');
      } catch (error) {
        this.logger.warn('Anthropic provider validation failed', { error });
      }
    }

    if (this.openai) {
      try {
        // Simple test call to validate OpenAI
        await this.openai.chat.completions.create({
          model: this.config.openai!.model,
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 10
        });
        providers.push('openai');
      } catch (error) {
        this.logger.warn('OpenAI provider validation failed', { error });
      }
    }

    if (providers.length === 0) {
      throw new Error('No valid AI providers available');
    }

    this.logger.info('AI providers validated', { providers });
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Meta-Agent resources');

    try {
      await this.mcpClient.cleanup();
      this.logger.info('Meta-Agent cleanup completed');
    } catch (error) {
      this.logger.error('Meta-Agent cleanup failed', { error });
      throw error;
    }
  }
}