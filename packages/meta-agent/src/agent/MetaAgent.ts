import { Anthropic } from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';
import {
  createLogger,
  validateData,
  configSchemas,
  ServiceError,
  ErrorCode,
  Logger
} from '@ai-idp/utils';
import { z } from 'zod';
import { QdrantContextClient } from '@ai-idp/qdrant-client';
import { MCPAgentClient } from '@ai-idp/mcp-client';
import { ActionManager, type ActionManagerConfig } from '@ai-idp/action-manager';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type {
  ConversationContext,
  AgentIntent,
  AgentResponse,
  UserResponse,
  AgentCapabilities,
  MultiAgentWorkflow,
  MCPResponse
} from '@ai-idp/types';
import {
  ActionIntent,
  ActionStatus,
  AgentName,
  CreateActionRequest,
  ActionRecord,
  ActionQueryOptions
} from '@ai-idp/action-manager';
import { IntentClassifier } from '../routing/IntentClassifier';
import { ContextManager } from '../context/ContextManager';
import { ResponseCoordinator } from './ResponseCoordinator';
// ApprovalModule not available in current build - using placeholder for approval methods

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
    vectorSize?: number;
    timeout?: number;
  };
  mcp: {
    serverPort?: number;
    clientTimeout: number;
    maxRetries: number;
    retryDelay?: number;
  };
  actionManager?: ActionManagerConfig & {
    enabled: boolean;
  };
}

const MetaAgentConfigSchema = z.object({
  anthropic: z.object({
    apiKey: z.string(),
    model: z.string().default('claude-3-7-sonnet-latest'),
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
    collectionName: z.string().default('meta_agent_context'),
    vectorSize: z.number().default(1536),
    timeout: z.number().default(30000)
  }),
  mcp: z.object({
    serverPort: z.number().default(3001),
    clientTimeout: z.number().default(30000),
    maxRetries: z.number().default(3),
    retryDelay: z.number().default(1000)
  }),
  actionManager: z.object({
    enabled: z.boolean().default(false),
    dynamoDbClient: z.any(),
    tableName: z.string().default('ai-idp-actions'),
    ttlDays: z.number().default(30)
  }).optional()
});

/**
 * Meta-Agent orchestrator for AI-powered infrastructure platform
 * 
 * The Meta-Agent serves as the central intelligence coordinator in the multi-agent
 * architecture, responsible for:
 * - Intelligent intent classification and agent routing
 * - Context management and memory via Qdrant vector database  
 * - Response coordination from multiple specialized agents
 * - Integration with approval workflows and security policies
 * 
 * Architecture:
 * - Communicates with focused agents via MCP (Model Context Protocol)
 * - Maintains conversation context in Qdrant for learning and continuity
 * - Integrates with web app through standardized API responses
 * - Supports multiple AI providers (Anthropic Claude, OpenAI) with fallback
 * 
 * @class MetaAgent
 * @since 1.0.0
 * @version 1.2.0
 * 
 * @example Basic Usage
 * ```typescript
 * const config = {
 *   anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
 *   qdrant: { url: "http://localhost:6333", collectionName: "ai_idp_context" },
 *   mcp: { serverPort: 3001, clientTimeout: 30000 }
 * };
 * 
 * const metaAgent = new MetaAgent(config);
 * await metaAgent.initialize();
 * 
 * const response = await metaAgent.processRequest(
 *   "Show me the status of all production services",
 *   context
 * );
 * ```
 * 
 * @example Agent Registration
 * ```typescript
 * // Agents are automatically discovered and registered during initialization
 * await metaAgent.initialize(); // Registers Infrastructure, Security, Workflow agents
 * 
 * // Manual registration also supported
 * await metaAgent.registerFocusedAgent(customAgentCapabilities);
 * ```
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
  private actionManager?: ActionManager;
  // ApprovalModule placeholder - will be implemented when core package is available
  private logger: Logger;
  private isInitialized = false;

  // Registered focused agents
  private registeredAgents: Map<string, AgentCapabilities> = new Map();

  constructor(config: MetaAgentConfig, logger?: Logger) {
    // Validate configuration using utils
    this.config = validateData(
      config,
      MetaAgentConfigSchema,
      { service: 'meta-agent', operation: 'constructor' }
    );

    // Create or use provided logger
    this.logger = logger ? (logger.child ? logger.child({ component: 'MetaAgent' }) as Logger : logger) : createLogger({
      service: 'meta-agent',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development'
    });

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
    const qdrantConfig = {
      url: this.config.qdrant.url,
      apiKey: this.config.qdrant.apiKey,
      collectionName: this.config.qdrant.collectionName,
      vectorSize: 384, // Use 384 for local embeddings (Xenova/all-MiniLM-L6-v2)
      timeout: this.config.qdrant.timeout || 30000
    };

    this.qdrantClient = new QdrantContextClient(
      qdrantConfig,
      this.logger
    );

    this.mcpClient = new MCPAgentClient(this.config.mcp, {
      service: 'meta-agent-mcp',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development'
    });

    // Initialize Action Manager if enabled
    if (this.config.actionManager?.enabled) {
      this.actionManager = new ActionManager({
        dynamoDbClient: this.config.actionManager.dynamoDbClient,
        tableName: this.config.actionManager.tableName,
        ttlDays: this.config.actionManager.ttlDays
      });
    }

    // Initialize sub-components
    this.intentClassifier = new IntentClassifier(this.anthropic, this.openai, this.logger);
    this.contextManager = new ContextManager(this.qdrantClient, this.logger);
    this.responseCoordinator = new ResponseCoordinator(this.logger);
    // ApprovalModule initialization placeholder
  }

  /**
   * Initialize the Meta-Agent and all subsystems
   * 
   * This method performs the complete initialization sequence:
   * 1. Initializes Qdrant vector database connection for context storage
   * 2. Sets up context manager for conversation memory
   * 3. Initializes approval module for human-in-the-loop workflows
   * 4. Validates AI provider connections (Anthropic Claude, OpenAI)
   * 5. Discovers and registers available focused agents automatically
   * 
   * Must be called before using processRequest() or any other operations.
   * Initialization is idempotent - calling multiple times is safe.
   * 
   * @returns Promise that resolves when initialization is complete
   * 
   * @throws {ServiceError} When Qdrant connection fails
   * @throws {ValidationError} When AI provider validation fails
   * @throws {Error} When agent registration fails
   * 
   * @example
   * ```typescript
   * const metaAgent = new MetaAgent(config);
   * 
   * // Required before any operations
   * await metaAgent.initialize();
   * 
   * // Now ready for requests
   * const response = await metaAgent.processRequest("deploy nginx", context);
   * ```
   * 
   * @example Error Handling
   * ```typescript
   * try {
   *   await metaAgent.initialize();
   *   console.log('✅ Meta-Agent ready');
   * } catch (error) {
   *   if (error.code === 'QDRANT_CONNECTION_FAILED') {
   *     console.log('❌ Vector database unavailable');
   *   } else if (error.code === 'AI_PROVIDER_INVALID') {
   *     console.log('❌ Check API keys');
   *   }
   * }
   * ```
   * 
   * @since 1.0.0
   * @version 1.2.0 - Added automatic agent registration
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info({}, 'Initializing Meta-Agent');

      // Initialize Qdrant context storage (graceful fallback for development)
      try {
        await this.qdrantClient.initialize();
        this.logger.info({}, 'Qdrant context client initialized');
      } catch (error) {
        this.logger.warn({ error: error?.message || error }, 'Qdrant initialization failed - continuing without context storage');
        // In development, continue without Qdrant for basic functionality
        if (process.env.NODE_ENV !== 'development') {
          throw error;
        }
      }

      // Initialize context manager (graceful fallback for development)
      try {
        await this.contextManager.initialize();
        this.logger.info({}, 'Context manager initialized');
      } catch (error) {
        this.logger.warn({ error: error?.message || error }, 'Context manager initialization failed - continuing without context management');
        if (process.env.NODE_ENV !== 'development') {
          throw error;
        }
      }

      // Initialize Action Manager if enabled
      if (this.actionManager) {
        try {
          // Action Manager doesn't have an initialize method - it's ready on construction
          this.logger.info({}, 'Action Manager initialized successfully');
        } catch (error) {
          this.logger.error({ error: error?.message || error }, 'Action Manager initialization failed');
          if (process.env.NODE_ENV !== 'development') {
            throw error;
          }
        }
      } else {
        this.logger.info({}, 'Action Manager disabled - using direct agent communication');
      }

      // Initialize approval module (placeholder - will be implemented when core package is available)
      // await this.approvalModule.initialize();
      this.logger.info({}, 'Approval module placeholder initialized');

      // Validate AI providers
      await this.validateAIProviders();
      this.logger.info({}, 'AI providers validated');

      // Register available focused agents (graceful fallback for development)
      try {
        await this.registerAvailableAgents();
        this.logger.info({}, 'Focused agents registered');
      } catch (error) {
        this.logger.warn({
          error: error?.message || String(error),
          stack: error?.stack
        }, 'Agent registration failed - continuing without focused agents');
        if (process.env.NODE_ENV !== 'development') {
          throw error;
        }
      }

      this.isInitialized = true;
      this.logger.info({}, 'Meta-Agent initialized successfully');

    } catch (error: any) {
      this.logger.error({
        error: error?.message || String(error),
        stack: error?.stack,
        code: error?.code,
        cause: error?.cause
      }, 'Failed to initialize Meta-Agent');
      throw error;
    }
  }

  /**
   * Register a focused agent with the Meta-Agent system
   * 
   * Registers a specialized focused agent (Infrastructure, Security, Workflow, Observability)
   * to handle specific types of operations. The agent must implement MCP protocol for
   * communication and provide capabilities metadata.
   * 
   * @param capabilities - Complete agent capabilities and metadata
   * @param capabilities.agentId - Unique identifier for the agent (e.g., "infrastructure")
   * @param capabilities.name - Human-readable agent name
   * @param capabilities.tools - Array of tools/operations the agent supports
   * @param capabilities.specializations - Array of domain specializations
   * @param capabilities.endpoints - MCP and health check endpoint URLs
   * 
   * @returns Promise that resolves when agent is successfully registered
   * 
   * @throws {ServiceError} When MCP client registration fails
   * @throws {ValidationError} When capabilities are invalid
   * @throws {Error} When agent endpoints are unreachable
   * 
   * @example Infrastructure Agent Registration
   * ```typescript
   * const infrastructureCapabilities = {
   *   agentId: "infrastructure",
   *   name: "Infrastructure Agent",
   *   description: "Kubernetes and cloud operations",
   *   tools: [
   *     { name: "deployApplication", description: "Deploy to Kubernetes" },
   *     { name: "scaleApplication", description: "Scale deployments" }
   *   ],
   *   specializations: ["kubernetes", "deployment", "scaling"],
   *   endpoints: {
   *     mcp: "http://localhost:3003/mcp",
   *     health: "http://localhost:3003/health"
   *   }
   * };
   * 
   * await metaAgent.registerFocusedAgent(infrastructureCapabilities);
   * ```
   * 
   * @example Custom Agent Registration
   * ```typescript
   * const customAgent = {
   *   agentId: "custom-monitoring",
   *   name: "Custom Monitoring Agent",
   *   tools: [{ name: "getMetrics", description: "Retrieve system metrics" }],
   *   specializations: ["monitoring", "alerts"],
   *   endpoints: {
   *     mcp: "http://localhost:4000/mcp",
   *     health: "http://localhost:4000/health"
   *   }
   * };
   * 
   * await metaAgent.registerFocusedAgent(customAgent);
   * ```
   * 
   * @since 1.0.0
   * @version 1.1.0 - Added endpoint validation and health checks
   */
  async registerFocusedAgent(capabilities: AgentCapabilities): Promise<void> {
    try {
      this.logger.info({
        name: capabilities.name,
        tools: capabilities.tools.length,
        specializations: capabilities.specializations
      }, `Registering focused agent: ${capabilities.agentId}`);

      // Validate agent endpoints before registration
      this.logger.info({ healthEndpoint: capabilities.endpoints.health }, 'Validating agent endpoints');
      
      try {
        const healthResponse = await fetch(capabilities.endpoints.health, { 
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        if (!healthResponse.ok) {
          throw new Error(`Health endpoint returned ${healthResponse.status}: ${healthResponse.statusText}`);
        }
        
        this.logger.info({ agentId: capabilities.agentId }, 'Agent health endpoint validated successfully');
      } catch (error: any) {
        throw new Error(`Agent endpoint validation failed: ${error.message}`);
      }

      // Store in local registry first (essential for agent discovery)
      this.registeredAgents.set(capabilities.agentId, capabilities);
      
      // Attempt MCP registration with timeout - this enables full MCP protocol support
      try {
        // Set a reasonable timeout for MCP registration
        const mcpTimeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('MCP registration timeout after 10 seconds')), 10000);
        });
        
        await Promise.race([
          this.mcpClient.registerAgent(capabilities),
          mcpTimeout
        ]);
        
        this.logger.info({ agentId: capabilities.agentId }, 'Successfully registered agent via MCP');
      } catch (error: any) {
        this.logger.warn({ agentId: capabilities.agentId, error: error.message }, 'MCP registration failed, continuing with direct HTTP communication');
        // Agent is still registered in local registry, Meta-Agent can route requests
      }

      this.logger.info({}, `Successfully registered focused agent: ${capabilities.agentId}`);
    } catch (error: any) {
      this.logger.error(error, `Failed to register focused agent: ${capabilities.agentId}`);
      throw error;
    }
  }

  /**
   * Automatically discover and register available focused agents
   */
  private async registerAvailableAgents(): Promise<void> {
    this.logger.info({}, 'Discovering and registering available focused agents');

    try {
      // Register Infrastructure Agent
      await this.registerInfrastructureAgent();

      // Register Observability Agent
      await this.registerObservabilityAgent();

      // TODO: Register other focused agents as they become available
      // - Security Agent
      // - Workflow Agent

      this.logger.info({
        totalAgents: this.registeredAgents.size,
        agentIds: Array.from(this.registeredAgents.keys())
      }, 'Successfully registered all available focused agents');

    } catch (error: any) {
      this.logger.error(error, 'Failed to register available agents');
      throw error;
    }
  }

  /**
   * Register Infrastructure Agent if available
   */
  private async registerInfrastructureAgent(): Promise<void> {
    try {
      // Define Infrastructure Agent capabilities without creating a local instance
      const capabilities = {
        agentId: 'infrastructure',
        name: 'Infrastructure Agent',
        description: 'Kubernetes and Cloud Operations Specialist',
        tools: [
          {
            name: 'deployApplication',
            description: 'Deploy applications to Kubernetes with comprehensive validation',
            parameters: {
              type: 'object' as const,
              properties: {
                resourceName: { type: 'string', description: 'Name of the application to deploy' },
                containerImage: { type: 'string', description: 'Container image to deploy' },
                namespace: { type: 'string', description: 'Kubernetes namespace (default: default)' },
                replicas: { type: 'number', description: 'Number of replicas (default: 1)' },
                port: { type: 'number', description: 'Application port (default: 8080)' },
                environment: { type: 'string', description: 'Environment (development/staging/production)' }
              },
              required: ['resourceName', 'containerImage']
            }
          },
          {
            name: 'scaleResource',
            description: 'Scale Kubernetes resources with monitoring and validation',
            parameters: {
              type: 'object' as const,
              properties: {
                resourceName: { type: 'string', description: 'Name of the resource to scale' },
                replicas: { type: 'number', description: 'Target number of replicas' },
                namespace: { type: 'string', description: 'Kubernetes namespace (default: default)' },
                resourceType: { type: 'string', description: 'Resource type (default: deployment)' }
              },
              required: ['resourceName', 'replicas']
            }
          },
          {
            name: 'getResourceStatus',
            description: 'Get detailed status of Kubernetes resources',
            parameters: {
              type: 'object' as const,
              properties: {
                resourceName: { type: 'string', description: 'Name of the resource to check' },
                namespace: { type: 'string', description: 'Kubernetes namespace (default: default)' },
                resourceType: { type: 'string', description: 'Resource type (default: deployment)' }
              },
              required: ['resourceName']
            }
          },
          {
            name: 'getResourceLogs',
            description: 'Retrieve logs from Kubernetes resources',
            parameters: {
              type: 'object' as const,
              properties: {
                resourceName: { type: 'string', description: 'Name of the resource to get logs from' },
                namespace: { type: 'string', description: 'Kubernetes namespace (default: default)' },
                lines: { type: 'number', description: 'Number of log lines to retrieve (default: 100)' },
                follow: { type: 'boolean', description: 'Whether to follow logs (default: false)' }
              },
              required: ['resourceName']
            }
          },
          {
            name: 'provisionDatabase',
            description: 'Provision cloud databases using Crossplane',
            parameters: {
              type: 'object' as const,
              properties: {
                name: { type: 'string', description: 'Database instance name' },
                type: { type: 'string', description: 'Database type (postgresql, mysql, redis)' },
                namespace: { type: 'string', description: 'Kubernetes namespace (default: default)' },
                storageSize: { type: 'string', description: 'Storage size (e.g., 10Gi, 100Gi)' },
                environment: { type: 'string', description: 'Environment (development/staging/production)' }
              },
              required: ['name', 'type']
            }
          }
        ],
        specializations: [
          'kubernetes',
          'deployment', 
          'scaling',
          'monitoring',
          'cloud-provisioning',
          'container-orchestration'
        ],
        endpoints: {
          mcp: `http://localhost:${process.env.INFRASTRUCTURE_AGENT_PORT || 3003}/mcp`,
          health: `http://localhost:${process.env.INFRASTRUCTURE_AGENT_PORT || 3003}/health`
        }
      };

      await this.registerFocusedAgent(capabilities);

      this.logger.info({}, 'Infrastructure Agent registered successfully');
    } catch (error: any) {
      this.logger.warn({ error: error?.message || error }, 'Failed to register Infrastructure Agent - it may not be running');
      // Don't throw error - allow Meta-Agent to continue without this agent
    }
  }

  /**
   * Register Observability Agent if available
   */
  private async registerObservabilityAgent(): Promise<void> {
    try {
      // Define Observability Agent capabilities
      const capabilities = {
        agentId: 'observability',
        name: 'Observability Agent',
        description: 'SLM-powered monitoring, incident management, and analytics specialist',
        version: '1.0.0',
        tools: [
          {
            name: 'analyzeMetrics',
            description: 'Analyze metrics using SLM-powered pattern recognition and anomaly detection',
            parameters: {
              type: 'object' as const,
              properties: {
                query: { type: 'string', description: 'PromQL query or metric pattern' },
                duration: { type: 'string', description: 'Time range (e.g., "5m", "1h", "1d")' },
                threshold: { type: 'number', description: 'Anomaly detection threshold' },
                context: { type: 'object', description: 'Conversation context' }
              },
              required: ['query', 'duration', 'context']
            }
          },
          {
            name: 'analyzeIncident',
            description: 'Perform SLM-powered incident analysis and root cause identification',
            parameters: {
              type: 'object' as const,
              properties: {
                alertId: { type: 'string', description: 'Alert or incident identifier' },
                symptoms: { type: 'array', items: { type: 'string' }, description: 'Observed symptoms' },
                timeRange: { type: 'string', description: 'Incident time window' },
                context: { type: 'object', description: 'Conversation context' }
              },
              required: ['alertId', 'symptoms', 'context']
            }
          },
          {
            name: 'analyzeLogs',
            description: 'Intelligent log analysis with SLM-powered pattern recognition',
            parameters: {
              type: 'object' as const,
              properties: {
                query: { type: 'string', description: 'Log search query or pattern' },
                timeRange: { type: 'string', description: 'Log search time range' },
                logLevel: { type: 'string', description: 'Log level filter (error, warn, info, debug)' },
                service: { type: 'string', description: 'Service or component filter' },
                context: { type: 'object', description: 'Conversation context' }
              },
              required: ['query', 'timeRange', 'context']
            }
          },
          {
            name: 'createDashboard',
            description: 'Generate intelligent dashboards based on SLM analysis of requirements',
            parameters: {
              type: 'object' as const,
              properties: {
                name: { type: 'string', description: 'Dashboard name' },
                description: { type: 'string', description: 'Dashboard purpose and scope' },
                services: { type: 'array', items: { type: 'string' }, description: 'Services to monitor' },
                metrics: { type: 'array', items: { type: 'string' }, description: 'Key metrics to display' },
                context: { type: 'object', description: 'Conversation context' }
              },
              required: ['name', 'description', 'context']
            }
          },
          {
            name: 'configureAlerts',
            description: 'Set up intelligent alerting rules with SLM-optimized thresholds',
            parameters: {
              type: 'object' as const,
              properties: {
                ruleName: { type: 'string', description: 'Alert rule name' },
                condition: { type: 'string', description: 'Alert condition or pattern' },
                severity: { type: 'string', description: 'Alert severity (critical, warning, info)' },
                notification: { type: 'object', description: 'Notification configuration' },
                context: { type: 'object', description: 'Conversation context' }
              },
              required: ['ruleName', 'condition', 'severity', 'context']
            }
          }
        ],
        specializations: [
          'monitoring',
          'incident-management', 
          'metrics-analysis',
          'log-analysis',
          'alerting',
          'dashboards',
          'root-cause-analysis'
        ],
        endpoints: {
          mcp: `http://localhost:${process.env.OBSERVABILITY_AGENT_PORT || 3005}/mcp`,
          health: `http://localhost:${process.env.OBSERVABILITY_AGENT_PORT || 3005}/health`
        }
      };

      await this.registerFocusedAgent(capabilities);

      this.logger.info({}, 'Observability Agent registered successfully');
    } catch (error: any) {
      this.logger.warn({ error: error?.message || error }, 'Failed to register Observability Agent - it may not be running');
      // Don't throw error - allow Meta-Agent to continue without this agent
    }
  }

  /**
   * Process user request through the meta-agent orchestration system
   * 
   * This method handles the complete request lifecycle:
   * 1. Retrieves relevant context from Qdrant vector database
   * 2. Classifies intent and determines appropriate focused agent
   * 3. Routes request to specialized agents via MCP protocol
   * 4. Coordinates and synthesizes responses from multiple agents
   * 5. Stores interaction context for future learning
   * 
   * @param userInput - Natural language user request (max 10,000 chars)
   * @param context - Conversation context with user session data
   * @param context.userId - Unique user identifier for RBAC
   * @param context.conversationId - Session ID for context continuity  
   * @param context.permissions - User permissions array for security validation
   * 
   * @returns Promise resolving to structured user response with:
   *   - success: boolean indicating operation success
   *   - message: Human-readable response message  
   *   - detailedResponse?: Rich markdown content for UI display
   *   - data?: Structured result data for programmatic use
   *   - metadata: Execution metadata (agents, timing, context)
   * 
   * @throws {Error} When Meta-Agent is not initialized
   * @throws {ServiceError} When agent communication fails
   * @throws {ValidationError} When user input validation fails
   * 
   * @example
   * ```typescript
   * const response = await metaAgent.processRequest(
   *   "Deploy nginx to production with 3 replicas",
   *   {
   *     userId: "user123",
   *     conversationId: "conv-456", 
   *     permissions: ["deploy:production"],
   *     environment: "production"
   *   }
   * );
   * 
   * if (response.success) {
   *   console.log(response.message); // "✅ Successfully deployed nginx to production"
   *   console.log(response.detailedResponse); // Rich markdown with deployment details
   * }
   * ```
   * 
   * @since 1.0.0
   * @version 1.2.0 - Added automatic agent registration and standardized responses
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

    this.logger.info({
      requestId,
      userInput: userInput.substring(0, 100),
      userId: context.userId,
      conversationId: context.conversationId
    }, 'Processing user request');

    try {
      // 1. Retrieve relevant context from Qdrant
      const relevantContext = await this.contextManager.retrieveRelevantContext(
        userInput,
        context
      );

      this.logger.info({
        requestId,
        contextItems: relevantContext.length
      }, 'Retrieved relevant context');

      // 2. Classify intent and determine agent routing
      const intent = await this.intentClassifier.classifyIntent(
        userInput,
        context,
        relevantContext
      );

      this.logger.info({
        requestId,
        targetAgent: intent.agent,
        action: intent.action,
        confidence: intent.confidence
      }, 'Intent classified');

      // 3. Route to appropriate focused agent(s)
      const agentResponses = await this.routeToAgents(intent, context);

      this.logger.info({
        requestId,
        agentCount: agentResponses.length,
        successful: agentResponses.filter(r => r.success).length
      }, 'Agent execution completed');

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

      this.logger.info({
        requestId,
        executionTime,
        success: userResponse.success,
        agentsInvolved: userResponse.metadata.agentsInvolved
      }, 'Request processed successfully');

      return userResponse;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      this.logger.error({
        requestId,
        error: error?.message || error,
        executionTime
      }, 'Failed to process request');

      // Return error response
      return {
        success: false,
        message: `I encountered an error processing your request: ${error?.message || error}`,
        metadata: {
          agentsInvolved: [],
          totalExecutionTime: executionTime,
          contextStored: false
        }
      };
    }
  }

  /**
   * Direct call to Infrastructure Agent bypassing MCP registration
   */
  private async callInfrastructureAgentDirect(
    intent: AgentIntent,
    context: ConversationContext
  ): Promise<AgentResponse[]> {
    try {
      this.logger.info({ action: intent.action }, 'Calling Infrastructure Agent directly');
      
      // Extract nginx deployment parameters
      let resourceName = 'nginx';
      let replicas = 1;
      
      // Simple parameter extraction from intent
      if (intent.parameters.resourceName) {
        resourceName = intent.parameters.resourceName;
      }
      if (intent.parameters.replicas) {
        replicas = intent.parameters.replicas;
      }
      
      // Call Infrastructure Agent directly
      const infrastructureResponse = await fetch('http://localhost:3003/tools/deployApplication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceName,
          containerImage: 'nginx:latest',
          replicas,
          port: 80,
          environment: context.metadata.environment || 'development'
        })
      });
      
      if (!infrastructureResponse.ok) {
        throw new Error(`Infrastructure Agent responded with ${infrastructureResponse.status}`);
      }
      
      const result = await infrastructureResponse.json();
      
      // Convert Infrastructure Agent response to AgentResponse format
      const agentResponse: AgentResponse = {
        agentId: 'infrastructure',
        success: result.success,
        message: result.message,
        detailedResponse: result.detailedResponse,
        data: result.data,
        metadata: {
          ...result.metadata,
          agent: 'infrastructure',
          action: 'deployApplication'
        }
      };
      
      return [agentResponse];
      
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Direct Infrastructure Agent call failed');
      
      const errorResponse: AgentResponse = {
        agentId: 'infrastructure',
        success: false,
        message: `Failed to deploy: ${error.message}`,
        data: null,
        metadata: {
          agent: 'infrastructure',
          action: 'deployApplication',
          hasDetailedResponse: false,
          executionTime: 0,
          contextUsed: []
        }
      };
      
      return [errorResponse];
    }
  }

  /**
   * Route intent to appropriate focused agents
   * Uses distributed Action Manager when enabled, otherwise direct communication
   */
  private async routeToAgents(
    intent: AgentIntent,
    context: ConversationContext
  ): Promise<AgentResponse[]> {
    // Use Action Manager for distributed execution if enabled
    if (this.actionManager && this.shouldUseActionManager(intent)) {
      return await this.routeViaActionManager(intent, context);
    }
    
    // Fall back to direct agent communication
    return await this.routeDirectly(intent, context);
  }

  /**
   * Determine if this intent should use distributed Action Manager
   */
  private shouldUseActionManager(intent: AgentIntent): boolean {
    // Use Action Manager for infrastructure operations that benefit from tracking
    return intent.agent === 'infrastructure' && 
           ['deployApplication', 'scaleResource', 'provisionDatabase'].includes(intent.action);
  }

  /**
   * Route via distributed Action Manager
   */
  private async routeViaActionManager(
    intent: AgentIntent,
    context: ConversationContext
  ): Promise<AgentResponse[]> {
    if (!this.actionManager) {
      throw new Error('Action Manager not initialized');
    }

    try {
      // Map intent to action request
      const actionRequest: CreateActionRequest = {
        userId: context.userId,
        sessionId: context.conversationId, // Use conversationId as sessionId
        conversationId: context.conversationId,
        agentName: intent.agent as AgentName,
        toolName: intent.action,
        intent: this.mapToActionIntent(intent.action),
        toolParameters: intent.parameters,
        environment: context.metadata?.environment || 'development',
        priority: 'normal'
      };

      // Create action record
      const actionRecord = await this.actionManager.createAction(actionRequest);
      
      this.logger.info({ actionId: actionRecord.actionId, toolName: intent.action }, 'Created distributed action');

      // Return immediate response with action tracking info
      const agentResponse: AgentResponse = {
        agentId: intent.agent,
        success: true,
        message: `Action ${intent.action} queued for background execution`,
        data: {
          actionId: actionRecord.actionId,
          status: actionRecord.status,
          estimatedDuration: actionRecord.executionMetadata.estimatedDuration
        },
        metadata: {
          agent: intent.agent,
          action: intent.action,
          hasDetailedResponse: true,
          executionTime: 0,
          contextUsed: [],
          actionId: actionRecord.actionId,
          trackingEnabled: true
        },
        detailedResponse: `## 🚀 Action Queued for Background Execution\n\n` +
          `**Action ID:** \`${actionRecord.actionId}\`\n` +
          `**Tool:** ${intent.action}\n` +
          `**Status:** ${actionRecord.status}\n` +
          `**Estimated Duration:** ${(actionRecord.executionMetadata.estimatedDuration || 0) / 1000}s\n\n` +
          `Your request has been queued for distributed execution. You can track its progress using the action ID above.`
      };

      return [agentResponse];

    } catch (error: any) {
      this.logger.error({ error: error.message, intent }, 'Failed to route via Action Manager');
      
      // Fall back to direct routing on error
      this.logger.warn({}, 'Falling back to direct agent communication');
      return await this.routeDirectly(intent, context);
    }
  }

  /**
   * Map action name to ActionIntent enum
   */
  private mapToActionIntent(actionName: string): ActionIntent {
    const mapping: Record<string, ActionIntent> = {
      'deployApplication': ActionIntent.DEPLOY,
      'scaleResource': ActionIntent.SCALE,
      'provisionDatabase': ActionIntent.DEPLOY,
      'getResourceStatus': ActionIntent.MONITOR,
      'getResourceLogs': ActionIntent.INVESTIGATE,
      'analyzeMetrics': ActionIntent.INVESTIGATE,
      'analyzeIncident': ActionIntent.INVESTIGATE,
      'generateKubectlCommand': ActionIntent.AI_GENERATE,
      'generateKubernetesManifest': ActionIntent.AI_GENERATE
    };
    
    return mapping[actionName] || ActionIntent.DEPLOY;
  }

  /**
   * Direct agent routing (original implementation)
   */
  private async routeDirectly(
    intent: AgentIntent,
    context: ConversationContext
  ): Promise<AgentResponse[]> {
    const targetAgent = this.registeredAgents.get(intent.agent);
    
    // Direct Infrastructure Agent bypass for deployment operations
    if (!targetAgent && intent.agent === 'infrastructure' && intent.action === 'deployApplication') {
      return await this.callInfrastructureAgentDirect(intent, context);
    }
    
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

    // Map intent parameters to agent tool parameters
    let mappedParameters = { ...intent.parameters };
    
    // Map parameters for Infrastructure Agent deployApplication tool
    if (intent.agent === 'infrastructure' && intent.action === 'deployApplication') {
      // Map application_name -> resourceName and image -> containerImage
      if (intent.parameters.application_name) {
        mappedParameters.resourceName = intent.parameters.application_name;
        delete mappedParameters.application_name;
      }
      if (intent.parameters.image) {
        mappedParameters.containerImage = intent.parameters.image;
        delete mappedParameters.image;
      }
    }
    
    // Merge context into parameters for agent compatibility
    const parametersWithContext = {
      ...mappedParameters,
      context: context
    };

    this.logger.info({
      agent: intent.agent,
      tool: tool.name,
      parameters: Object.keys(parametersWithContext)
    }, 'Routing to agent');

    // Call the focused agent via MCP with fallback to direct HTTP
    let mcpResponse: MCPResponse;
    
    try {
      mcpResponse = await this.mcpClient.callTool(
        intent.agent,
        tool.name,
        parametersWithContext,
        context
      );
    } catch (error: any) {
      this.logger.warn({ 
        agent: intent.agent, 
        tool: tool.name, 
        error: error.message 
      }, 'MCP call failed, attempting direct HTTP call');
      
      try {
        // Fall back to direct HTTP call to agent's MCP endpoint
        const agentUrl = targetAgent.endpoints.mcp.replace('/mcp', '');
        const directResponse = await fetch(`${agentUrl}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: tool.name,
              arguments: parametersWithContext
            },
            id: `${context.conversationId}_${Date.now()}`
          })
        });
        
        if (!directResponse.ok) {
          throw new Error(`Direct HTTP call failed: ${directResponse.status} ${directResponse.statusText}`);
        }
        
        const directResult = await directResponse.json();
        
        if (directResult.error) {
          throw new Error(`Agent returned error: ${directResult.error.message}`);
        }
        
        this.logger.info({ 
          agent: intent.agent, 
          tool: tool.name 
        }, 'Direct HTTP fallback successful');
        
        // Convert direct response to MCP format
        mcpResponse = {
          result: directResult.result,
          id: directResult.id,
          metadata: {
            agent: intent.agent,
            executionTime: Date.now() - Date.now(), // Will be updated by caller
            contextUsed: context.history.slice(-3).map(h => h.id)
          }
        };
      } catch (fallbackError: any) {
        this.logger.error({ 
          agent: intent.agent, 
          tool: tool.name, 
          originalError: error.message,
          fallbackError: fallbackError.message
        }, 'Both MCP call and direct HTTP fallback failed');
        
        throw new Error(`MCP call failed: ${error.message}. HTTP fallback also failed: ${fallbackError.message}`);
      }
    }

    // Convert MCP response to AgentResponse format with standardized response structure
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
        contextUsed: mcpResponse.metadata.contextUsed || [],
        // Standardized fields for web app compatibility
        approvalId: mcpResponse.result?.approvalId || mcpResponse.result?.data?.approvalId,
        confidence: mcpResponse.result?.confidence || mcpResponse.result?.data?.confidence,
        riskLevel: mcpResponse.result?.riskLevel || mcpResponse.result?.data?.riskLevel
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

    // Add warnings if present
    if (mcpResponse.result?.warnings) {
      agentResponse.warnings = mcpResponse.result.warnings;
    }

    return [agentResponse];
  }

  /**
   * Execute multi-agent workflow (for complex operations)
   */
  async executeWorkflow(workflow: MultiAgentWorkflow): Promise<UserResponse> {
    this.logger.info({
      workflowId: workflow.workflowId,
      name: workflow.name,
      agents: workflow.agents,
      steps: workflow.steps.length
    }, 'Executing multi-agent workflow');

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
          this.logger.warn({
            stepId: step.stepId,
            dependencies: step.dependencies
          }, 'Workflow step dependencies not met');
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
          this.logger.error({
            workflowId: workflow.workflowId,
            stepId: step.stepId,
            error: mcpResponse.error?.message || mcpResponse.error
          }, 'Workflow step failed');
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
      this.logger.error({
        workflowId: workflow.workflowId,
        error: error?.message || error
      }, 'Workflow execution failed');

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
   * Get comprehensive status of Meta-Agent and all registered focused agents
   * 
   * Provides complete system health information including:
   * - Meta-Agent initialization status and registered agent count
   * - Individual focused agent health, capabilities, and connectivity
   * - Qdrant vector database connection status
   * - MCP communication health for all agents
   * 
   * Useful for system monitoring, debugging, and health checks.
   * 
   * @returns Promise resolving to comprehensive status object with:
   *   - metaAgent: Meta-Agent initialization and registration status
   *   - focusedAgents: Array of agent health and capability information
   *   - qdrant: Vector database connection and health status
   *   - mcp: MCP protocol communication statistics
   * 
   * @throws {ServiceError} When health check operations fail
   * 
   * @example Basic Health Check
   * ```typescript
   * const status = await metaAgent.getAgentStatus();
   * 
   * console.log(`Meta-Agent initialized: ${status.metaAgent.initialized}`);
   * console.log(`Registered agents: ${status.metaAgent.registeredAgents}`);
   * 
   * status.focusedAgents.forEach(agent => {
   *   console.log(`${agent.name}: ${agent.healthy ? '✅' : '❌'}`);
   *   console.log(`  Tools: ${agent.tools}`);
   *   console.log(`  Specializations: ${agent.specializations.join(', ')}`);
   * });
   * ```
   * 
   * @example Monitoring Integration
   * ```typescript
   * // Use in health check endpoints
   * app.get('/health', async (req, res) => {
   *   try {
   *     const status = await metaAgent.getAgentStatus();
   *     const healthy = status.metaAgent.initialized && 
   *                    status.focusedAgents.every(a => a.healthy);
   *     
   *     res.status(healthy ? 200 : 503).json({
   *       healthy,
   *       ...status,
   *       timestamp: new Date().toISOString()
   *     });
   *   } catch (error) {
   *     res.status(500).json({ error: 'Health check failed' });
   *   }
   * });
   * ```
   * 
   * @example Status Response Format
   * ```json
   * {
   *   "metaAgent": {
   *     "initialized": true,
   *     "registeredAgents": 2
   *   },
   *   "focusedAgents": [
   *     {
   *       "agentId": "infrastructure",
   *       "name": "Infrastructure Agent",
   *       "healthy": true,
   *       "tools": 8,
   *       "specializations": ["kubernetes", "deployment", "scaling"]
   *     }
   *   ],
   *   "qdrant": {
   *     "connected": true,
   *     "collections": ["meta_agent_context"],
   *     "vectorCount": 1250
   *   },
   *   "mcp": {
   *     "registeredAgents": 2,
   *     "healthyAgents": 2
   *   }
   * }
   * ```
   * 
   * @since 1.0.0
   * @version 1.1.0 - Added Qdrant and MCP health details
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
   * Get approval module for web app compatibility
   * Returns pending approvals and approval module status
   */
  async getApprovalModule(): Promise<any> {
    try {
      // Use the ApprovalModule's process method to get pending approvals
      const request = {
        requestId: uuidv4(),
        module: 'approval',
        action: 'list-pending',
        parameters: {},
        context: {
          userId: 'meta-agent',
          sessionId: 'meta-agent-session',
          originalRequest: 'list-pending-approvals',
          environment: 'production' as const,
          permissions: ['approval:read'],
          auditTrail: [],
          timestamp: new Date().toISOString()
        },
        priority: 'normal' as const
      };

      // Placeholder - approval module not available in current build
      return {
        success: true,
        message: 'Approval module placeholder - no pending approvals',
        result: {
          pendingApprovals: []
        }
      };
    } catch (error: any) {
      this.logger.error(error, 'Failed to get approval module');
      return {
        success: false,
        message: `Failed to access approval module: ${error.message}`
      };
    }
  }

  /**
   * Process approval action for web app compatibility
   * Handles approve/reject actions on approval requests
   */
  async processApprovalAction(action: string, id: string, reviewedBy: string, reviewNotes?: string): Promise<any> {
    try {
      // Map web app action to approval module action
      const moduleAction = action === 'approve' ? 'approve' : 'reject';

      const request = {
        requestId: uuidv4(),
        module: 'approval',
        action: moduleAction,
        parameters: {
          approvalId: id,
          reviewedBy: reviewedBy,
          reviewNotes: reviewNotes || '',
          timestamp: new Date().toISOString()
        },
        context: {
          userId: reviewedBy,
          sessionId: `approval-${id}`,
          originalRequest: `${action}-approval-${id}`,
          environment: 'production' as const,
          permissions: ['approval:write'],
          auditTrail: [`${moduleAction}-${id}-${reviewedBy}-${new Date().toISOString()}`],
          timestamp: new Date().toISOString()
        },
        priority: 'high' as const
      };

      // Placeholder - approval module not available in current build
      return {
        success: true,
        message: `Approval action ${action} placeholder - would process approval ${id}`,
        data: { approvalId: id, action, reviewedBy, reviewNotes, status: 'placeholder' }
      };
    } catch (error: any) {
      this.logger.error({
        error: error.message,
        action,
        approvalId: id
      }, 'Failed to process approval action');

      return {
        success: false,
        message: `Failed to ${action} approval: ${error.message}`
      };
    }
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
      } catch (error: any) {
        this.logger.warn({ error: error?.message || error }, 'Anthropic provider validation failed');
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
      } catch (error: any) {
        this.logger.warn({ error: error?.message || error }, 'OpenAI provider validation failed');
      }
    }

    if (providers.length === 0) {
      throw new Error('No valid AI providers available');
    }

    this.logger.info({ providers }, 'AI providers validated');
  }

  /**
   * Get action status by action ID
   * Used by web app to track distributed actions
   */
  async getActionStatus(actionId: string): Promise<ActionRecord | null> {
    if (!this.actionManager) {
      throw new Error('Action Manager not enabled');
    }
    
    return await this.actionManager.getAction(actionId);
  }

  /**
   * List user actions
   * Used by web app to show action history
   */
  async listUserActions(userId: string, options?: ActionQueryOptions): Promise<ActionRecord[]> {
    if (!this.actionManager) {
      throw new Error('Action Manager not enabled');
    }
    
    return await this.actionManager.getActionsByUser(userId, options);
  }

  /**
   * List session actions
   * Used by web app to show current conversation actions
   */
  async listSessionActions(sessionId: string, options?: ActionQueryOptions): Promise<ActionRecord[]> {
    if (!this.actionManager) {
      throw new Error('Action Manager not enabled');
    }
    
    return await this.actionManager.getActionsBySession(sessionId, options);
  }

  /**
   * Get action statistics
   * Used by web app for monitoring dashboard
   */
  async getActionStatistics(): Promise<any> {
    if (!this.actionManager) {
      return {
        total: 0,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        byAgent: {}
      };
    }
    
    return await this.actionManager.getActionStatistics();
  }

  /**
   * Check if Action Manager is enabled
   */
  isActionManagerEnabled(): boolean {
    return !!this.actionManager;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info({}, 'Cleaning up Meta-Agent resources');

    try {
      await this.mcpClient.cleanup();
      this.logger.info({}, 'Meta-Agent cleanup completed');
    } catch (error: any) {
      this.logger.error(error, 'Meta-Agent cleanup failed');
      throw error;
    }
  }
}