import { QdrantContextClient } from '@ai-idp/qdrant-client';
import { createLogger, validateData, type Logger } from '@ai-idp/utils';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentCapabilities,
  ToolDefinition,
  ConversationContext
} from '@ai-idp/types';
import { KubernetesOperations } from '../kubernetes/KubernetesOperations';
import { CloudOperations } from '../cloud/CloudOperations';
import { KubernetesAI } from '../ai/KubernetesAI';
import { ActionManager, ActionManagerConfig } from '@ai-idp/action-manager';

/**
 * Configuration interface for Infrastructure Agent
 * 
 * Defines all configuration options for the Infrastructure Agent including
 * Kubernetes connection, Qdrant vector database, and optional Windmill
 * integration for complex kubectl operations.
 * 
 * @interface InfrastructureAgentConfig
 * @since 1.0.0
 */
export interface InfrastructureAgentConfig {
  /** Unique agent identifier within the AI-IDP system */
  agentId: string;

  /** Human-readable agent name */
  name: string;

  /** Optional path to kubeconfig file for Kubernetes authentication */
  kubeconfig?: string;

  /** Optional Qdrant vector database configuration for context storage */
  qdrant?: {
    /** Qdrant cluster URL */
    url: string;
    /** Qdrant API key for authentication */
    apiKey?: string;
    /** Collection name for infrastructure context storage */
    collectionName: string;
    /** Vector dimension size for embeddings */
    vectorSize?: number;
    /** Request timeout in milliseconds */
    timeout?: number;
  };

  /** Optional Windmill configuration for complex kubectl operations */
  windmill?: {
    /** Windmill server base URL */
    baseUrl: string;
    /** Authentication token for Windmill API */
    token?: string;
    /** Windmill workspace identifier */
    workspace: string;
  };

  /** Optional AI-powered Kubernetes operations configuration */
  kubernetesAI?: {
    /** Ollama server URL */
    ollamaUrl: string;
    /** Kubernetes AI model name */
    modelName: string;
    /** Temperature for AI responses */
    temperature?: number;
    /** Request timeout in milliseconds */
    timeout?: number;
  };

  /** Optional Action Manager configuration for distributed tracking */
  actionManager?: ActionManagerConfig & {
    /** Enable distributed action tracking */
    enabled: boolean;
  };
}

/**
 * Zod schema for Infrastructure Agent configuration validation
 * 
 * Provides type-safe validation and default values for all Infrastructure Agent
 * configuration options, ensuring proper setup and preventing runtime errors.
 */
const InfrastructureAgentConfigSchema = z.object({
  /** Agent identifier with default value */
  agentId: z.string().default('infrastructure'),
  /** Agent display name with default value */
  name: z.string().default('Infrastructure Agent'),
  /** Optional kubeconfig path for Kubernetes access */
  kubeconfig: z.string().optional(),
  /** Optional Qdrant configuration with sensible defaults */
  qdrant: z.object({
    url: z.string().url(),
    apiKey: z.string().optional(),
    collectionName: z.string().default('infrastructure_context'),
    vectorSize: z.number().default(1536),
    timeout: z.number().default(30000)
  }).optional(),
  /** Optional Windmill configuration with defaults */
  windmill: z.object({
    baseUrl: z.string().url(),
    token: z.string().optional(),
    workspace: z.string().default('admins')
  }).optional(),
  /** Optional Kubernetes AI configuration with defaults */
  kubernetesAI: z.object({
    ollamaUrl: z.string().url().default('http://localhost:11434'),
    modelName: z.string().default('hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf:latest'),
    temperature: z.number().min(0).max(1).default(0.1),
    timeout: z.number().default(30000)
  }).optional(),
  /** Optional Action Manager configuration for distributed tracking */
  actionManager: z.object({
    enabled: z.boolean().default(false),
    dynamoDbClient: z.any().optional(), // Will be provided at runtime
    tableName: z.string().default('ai-idp-actions'),
    ttlDays: z.number().default(30)
  }).optional()
});

/**
 * Infrastructure Agent - Specialized focused agent for Kubernetes and cloud operations
 * 
 * The Infrastructure Agent is a specialized focused agent within the AI-IDP multi-agent
 * architecture, responsible for all infrastructure-related operations including Kubernetes
 * cluster management, cloud resource provisioning, and container orchestration.
 * 
 * **Core Capabilities:**
 * - **Kubernetes Operations**: Deploy, scale, status, logs, rollback, and resource management
 * - **Cloud Provisioning**: Database, storage, and function provisioning via Crossplane
 * - **Container Orchestration**: Advanced container management and networking
 * - **Pattern Recognition**: Infrastructure pattern learning and optimization via Qdrant
 * - **MCP Integration**: Model Context Protocol server for Meta-Agent communication
 * - **Health Monitoring**: Cluster health checks and performance monitoring
 * 
 * **Integration Points:**
 * - **Meta-Agent**: Receives requests via MCP protocol for infrastructure operations
 * - **Qdrant**: Stores and retrieves infrastructure patterns for learning and optimization
 * - **Kubernetes API**: Direct integration with Kubernetes clusters for operations
 * - **Crossplane**: Cloud resource provisioning and lifecycle management
 * - **Windmill**: Complex kubectl operations requiring shell access
 * 
 * @class InfrastructureAgent
 * @since 1.0.0
 * @version 1.2.0
 * 
 * @example Basic Infrastructure Agent Setup
 * ```typescript
 * import { InfrastructureAgent } from '@ai-idp/infrastructure-agent';
 * 
 * const infrastructureAgent = new InfrastructureAgent({
 *   agentId: 'infrastructure',
 *   name: 'Infrastructure Agent',
 *   kubeconfig: '/home/user/.kube/config',
 *   qdrant: {
 *     url: 'https://your-qdrant-cluster.qdrant.io',
 *     apiKey: 'your-qdrant-key',
 *     collectionName: 'infrastructure_context'
 *   }
 * });
 * 
 * await infrastructureAgent.initialize();
 * 
 * // Deploy application
 * const deployResult = await infrastructureAgent.deployApplication({
 *   containerImage: 'nginx:latest',
 *   replicas: 3,
 *   namespace: 'production'
 * });
 * ```
 * 
 * @example MCP Integration with Meta-Agent  
 * ```typescript
 * // Infrastructure Agent automatically registers capabilities
 * const capabilities = infrastructureAgent.getCapabilities();
 * console.log(capabilities.tools); // [deployApplication, scaleApplication, ...]
 * 
 * // Meta-Agent calls via MCP
 * const result = await infrastructureAgent.executeTool(
 *   'deployApplication',
 *   { containerImage: 'redis:latest', replicas: 1 },
 *   conversationContext
 * );
 * ```
 */
/**
 * Validated configuration type with defaults applied
 * This represents the actual config after Zod validation with defaults filled in
 */
type ValidatedInfrastructureAgentConfig = Required<Pick<InfrastructureAgentConfig, 'agentId' | 'name'>> &
  Omit<InfrastructureAgentConfig, 'agentId' | 'name'>;

export class InfrastructureAgent {
  private config: ValidatedInfrastructureAgentConfig;
  private logger: Logger;
  private qdrantClient?: QdrantContextClient;
  private k8sOperations: KubernetesOperations;
  private cloudOperations: CloudOperations;
  private kubernetesAI?: KubernetesAI;
  private actionManager?: ActionManager;
  private isInitialized = false;

  // Agent capabilities definition
  private capabilities: AgentCapabilities;

  /**
   * Create a new Infrastructure Agent with configuration and optional logger
   * 
   * Initializes the Infrastructure Agent with Kubernetes operations, cloud operations,
   * and optional Qdrant context storage. The agent is ready for MCP communication
   * after construction but requires calling initialize() for full functionality.
   * 
   * @param config - Infrastructure agent configuration with Kubernetes and cloud settings
   * @param logger - Optional Pino logger instance (creates default if not provided)
   * 
   * @example
   * ```typescript
   * const agent = new InfrastructureAgent({
   *   agentId: 'infrastructure',
   *   name: 'Production Infrastructure Agent',
   *   kubeconfig: '/etc/kubernetes/kubeconfig',
   *   qdrant: {
   *     url: 'https://qdrant.example.com',
   *     apiKey: process.env.QDRANT_API_KEY,
   *     collectionName: 'prod_infrastructure'
   *   }
   * });
   * ```
   * 
   * @since 1.0.0
   */
  constructor(config: InfrastructureAgentConfig, logger?: Logger) {
    this.config = validateData(
      config,
      InfrastructureAgentConfigSchema,
      { service: 'infrastructure-agent', operation: 'constructor' }
    ) as ValidatedInfrastructureAgentConfig;
    this.logger = logger ? (logger.child ? logger.child({ component: 'InfrastructureAgent' }) as Logger : logger) : createLogger({
      service: 'infrastructure-agent',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development'
    });

    // Initialize sub-components
    this.k8sOperations = new KubernetesOperations(this.config, this.logger);
    this.cloudOperations = new CloudOperations(this.config, this.logger);

    // Initialize Kubernetes AI service if configured
    if (this.config.kubernetesAI) {
      this.kubernetesAI = new KubernetesAI({
        ollamaUrl: this.config.kubernetesAI.ollamaUrl,
        modelName: this.config.kubernetesAI.modelName,
        temperature: this.config.kubernetesAI.temperature,
        timeout: this.config.kubernetesAI.timeout
      });
    }

    // Initialize Action Manager if configured
    if (this.config.actionManager?.enabled && this.config.actionManager.dynamoDbClient) {
      this.actionManager = new ActionManager({
        dynamoDbClient: this.config.actionManager.dynamoDbClient,
        tableName: this.config.actionManager.tableName,
        ttlDays: this.config.actionManager.ttlDays
      });
    }

    // Initialize Qdrant client if configured
    if (this.config.qdrant) {
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
    }

    // Define agent capabilities
    this.capabilities = this.defineCapabilities();
  }

  /**
   * Initialize the Infrastructure Agent and all its subsystems
   * 
   * Performs complete initialization of the Infrastructure Agent including Kubernetes
   * client setup, cloud operations initialization, and Qdrant context storage.
   * Must be called before the agent can process any infrastructure operations.
   * 
   * **Initialization Steps:**
   * 1. Initialize Kubernetes operations client
   * 2. Initialize cloud operations (Crossplane)
   * 3. Initialize Qdrant context client (if configured)
   * 4. Mark agent as ready for operation
   * 
   * @returns Promise resolving when all subsystems are initialized
   * @throws Error if any subsystem fails to initialize
   * 
   * @example
   * ```typescript
   * const agent = new InfrastructureAgent(config);
   * 
   * try {
   *   await agent.initialize();
   *   console.log('Infrastructure Agent ready for operations');
   * } catch (error) {
   *   console.error('Failed to initialize Infrastructure Agent:', error);
   * }
   * ```
   * 
   * @since 1.0.0
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info({
        agentId: this.config.agentId,
        name: this.config.name
      }, 'Initializing Infrastructure Agent');

      // Initialize Kubernetes operations
      await this.k8sOperations.initialize();

      // Initialize cloud operations
      await this.cloudOperations.initialize();

      // Initialize Qdrant client if available
      if (this.qdrantClient) {
        await this.qdrantClient.initialize();
        this.logger.info('Qdrant context client initialized');
      }

      // Validate Kubernetes AI service if available
      if (this.kubernetesAI) {
        const isAIServiceValid = await this.kubernetesAI.validateService();
        if (isAIServiceValid) {
          this.logger.info('Kubernetes AI service initialized and validated');
        } else {
          this.logger.warn('Kubernetes AI service failed validation - AI features will be disabled');
        }
      }

      this.isInitialized = true;
      this.logger.info('Infrastructure Agent initialized successfully');

    } catch (error) {
      this.logger.error(error, 'Failed to initialize Infrastructure Agent');
      throw error;
    }
  }

  /**
   * Get agent capabilities for Meta-Agent registration
   */
  getCapabilities(): AgentCapabilities {
    return this.capabilities;
  }

  /**
   * Execute Kubernetes deployment operation
   */
  async deployApplication(params: {
    resourceName: string;
    containerImage: string;
    namespace?: string;
    replicas?: number;
    port?: number;
    environment?: string;
    context: ConversationContext;
  }): Promise<any> {
    const startTime = Date.now();
    const operationId = uuidv4();

    this.logger.info({
      operationId,
      resourceName: params.resourceName,
      containerImage: params.containerImage,
      namespace: params.namespace || 'default'
    }, 'Executing application deployment');

    try {
      // Execute deployment via Kubernetes operations
      const result = await this.k8sOperations.deployApplication({
        resourceName: params.resourceName,
        containerImage: params.containerImage,
        namespace: params.namespace || 'default',
        replicas: params.replicas || 1,
        port: params.port || 8080,
        environment: params.environment || 'development'
      });

      // Handle timeout case specially
      const isTimeout = result.data?.timeout === true;
      const executionTime = Date.now() - startTime;
      
      // Store context if Qdrant is available
      if (this.qdrantClient) {
        try {
          await this.storeOperationContext(
            operationId,
            'deployApplication',
            params,
            result,
            result.success || isTimeout // Don't treat timeout as failure for context
          );
        } catch (contextError) {
          this.logger.warn({ error: contextError.message }, 'Failed to store operation context - continuing anyway');
        }
      }

      // Schedule health check analysis for timeout cases
      if (isTimeout && result.data?.requiresHealthCheck) {
        this.scheduleHealthCheckAnalysis(operationId, params.resourceName, params.namespace || 'default');
      }

      this.logger.info({
        operationId,
        success: result.success,
        timeout: isTimeout,
        executionTime
      }, isTimeout ? 'Application deployment timed out - requires monitoring' : 'Application deployment completed');

      return {
        success: result.success,
        message: result.message,
        detailedResponse: result.detailedResponse,
        data: result.data,
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'deployApplication',
          timeout: isTimeout,
          requiresMonitoring: isTimeout
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.logger.error({
        operationId,
        error: error.message,
        executionTime
      }, 'Application deployment failed');

      // Store failure context
      if (this.qdrantClient) {
        await this.storeOperationContext(
          operationId,
          'deployApplication',
          params,
          { error: error.message },
          false
        );
      }

      return {
        success: false,
        message: `Deployment failed: ${error.message}`,
        data: { error: error.message },
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'deployApplication'
        }
      };
    }
  }

  /**
   * Execute Kubernetes scaling operation
   */
  async scaleResource(params: {
    resourceName: string;
    replicas: number;
    namespace?: string;
    resourceType?: string;
    context: ConversationContext;
  }): Promise<any> {
    const startTime = Date.now();
    const operationId = uuidv4();

    this.logger.info({
      operationId,
      resourceName: params.resourceName,
      replicas: params.replicas,
      namespace: params.namespace || 'default'
    }, 'Executing resource scaling');

    try {
      const result = await this.k8sOperations.scaleResource({
        resourceName: params.resourceName,
        replicas: params.replicas,
        namespace: params.namespace || 'default',
        resourceType: params.resourceType || 'deployment'
      });

      // Store context if Qdrant is available
      if (this.qdrantClient) {
        await this.storeOperationContext(
          operationId,
          'scaleResource',
          params,
          result,
          true
        );
      }

      const executionTime = Date.now() - startTime;

      return {
        success: result.success,
        message: result.message,
        detailedResponse: result.detailedResponse,
        data: result.data,
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'scaleResource'
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.logger.error({
        operationId,
        error: error.message,
        executionTime
      }, 'Resource scaling failed');

      return {
        success: false,
        message: `Scaling failed: ${error.message}`,
        data: { error: error.message },
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'scaleResource'
        }
      };
    }
  }

  /**
   * Get resource status
   */
  async getResourceStatus(params: {
    resourceName: string;
    namespace?: string;
    resourceType?: string;
    context: ConversationContext;
  }): Promise<any> {
    const startTime = Date.now();
    const operationId = uuidv4();

    try {
      const result = await this.k8sOperations.getResourceStatus({
        resourceName: params.resourceName,
        namespace: params.namespace || 'default',
        resourceType: params.resourceType || 'deployment'
      });

      const executionTime = Date.now() - startTime;

      return {
        success: result.success,
        message: result.message,
        detailedResponse: result.detailedResponse,
        data: result.data,
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'getResourceStatus'
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        message: `Status check failed: ${error.message}`,
        data: { error: error.message },
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'getResourceStatus'
        }
      };
    }
  }

  /**
   * Get resource logs
   */
  async getResourceLogs(params: {
    resourceName: string;
    namespace?: string;
    lines?: number;
    follow?: boolean;
    context: ConversationContext;
  }): Promise<any> {
    const startTime = Date.now();
    const operationId = uuidv4();

    try {
      const result = await this.k8sOperations.getResourceLogs({
        resourceName: params.resourceName,
        namespace: params.namespace || 'default',
        lines: params.lines || 100,
        follow: params.follow || false
      });

      const executionTime = Date.now() - startTime;

      return {
        success: result.success,
        message: result.message,
        detailedResponse: result.detailedResponse,
        data: result.data,
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'getResourceLogs'
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        message: `Log retrieval failed: ${error.message}`,
        data: { error: error.message },
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'getResourceLogs'
        }
      };
    }
  }

  /**
   * Provision cloud database
   */
  async provisionDatabase(params: {
    databaseType: string;
    name: string;
    size?: string;
    environment?: string;
    context: ConversationContext;
  }): Promise<any> {
    const startTime = Date.now();
    const operationId = uuidv4();

    try {
      const result = await this.cloudOperations.provisionDatabase({
        databaseType: params.databaseType,
        name: params.name,
        size: params.size || 'small',
        environment: params.environment || 'development'
      });

      const executionTime = Date.now() - startTime;

      return {
        success: result.success,
        message: result.message,
        detailedResponse: result.detailedResponse,
        data: result.data,
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'provisionDatabase'
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        message: `Database provisioning failed: ${error.message}`,
        data: { error: error.message },
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'provisionDatabase'
        }
      };
    }
  }

  /**
   * Health check for the agent
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const k8sHealth = await this.k8sOperations.healthCheck();
      const cloudHealth = await this.cloudOperations.healthCheck();
      const qdrantHealth = this.qdrantClient ?
        await this.qdrantClient.healthCheck() :
        { healthy: true, details: 'Not configured' };

      const overall = k8sHealth.healthy && cloudHealth.healthy && qdrantHealth.healthy;

      return {
        healthy: overall,
        details: {
          kubernetes: k8sHealth,
          cloud: cloudHealth,
          qdrant: qdrantHealth,
          initialized: this.isInitialized
        }
      };

    } catch (error) {
      return {
        healthy: false,
        details: { error: error.message }
      };
    }
  }

  /**
   * Schedule health check analysis for deployments that timed out
   */
  private scheduleHealthCheckAnalysis(operationId: string, resourceName: string, namespace: string): void {
    this.logger.info({ operationId, resourceName, namespace }, 'Scheduling health check analysis for timed out deployment');
    
    // Schedule analysis after a delay to allow deployment to potentially complete
    setTimeout(async () => {
      try {
        const status = await this.k8sOperations.getResourceStatus({
          resourceName,
          namespace,
          resourceType: 'deployment'
        });

        if (status.success) {
          const deployment = status.data.deployment;
          const isHealthy = deployment.replicas.ready === deployment.replicas.desired && deployment.replicas.ready > 0;

          if (isHealthy) {
            this.logger.info({ operationId, resourceName, namespace }, 'Delayed health check: Deployment is now healthy');
            // Could notify UI of successful completion here
          } else {
            this.logger.warn({ 
              operationId, 
              resourceName, 
              namespace,
              replicas: deployment.replicas
            }, 'Delayed health check: Deployment still not ready - investigating');
            
            // Get logs to analyze the issue
            const logs = await this.k8sOperations.getResourceLogs({
              resourceName,
              namespace,
              lines: 50,
              follow: false
            });

            if (logs.success) {
              this.logger.info({ 
                operationId, 
                resourceName, 
                namespace,
                podCount: logs.data.logs.length
              }, 'Retrieved pod logs for analysis');
              // Could send logs to observability agent for AI analysis
            }
          }
        }
      } catch (error) {
        this.logger.error({ 
          operationId, 
          resourceName, 
          namespace,
          error: error.message 
        }, 'Failed to perform delayed health check analysis');
      }
    }, 120000); // Wait 2 minutes before checking
  }

  /**
   * Define agent capabilities for Meta-Agent registration
   */
  private defineCapabilities(): AgentCapabilities {
    const tools: ToolDefinition[] = [
      {
        name: 'deployApplication',
        description: 'Deploy applications to Kubernetes with comprehensive validation',
        parameters: {
          type: 'object',
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
          type: 'object',
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
        description: 'Get comprehensive status of Kubernetes resources',
        parameters: {
          type: 'object',
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
        description: 'Retrieve and analyze Kubernetes pod logs',
        parameters: {
          type: 'object',
          properties: {
            resourceName: { type: 'string', description: 'Name of the resource to get logs for' },
            namespace: { type: 'string', description: 'Kubernetes namespace (default: default)' },
            lines: { type: 'number', description: 'Number of log lines to retrieve (default: 100)' },
            follow: { type: 'boolean', description: 'Follow logs in real-time (default: false)' }
          },
          required: ['resourceName']
        }
      },
      {
        name: 'provisionDatabase',
        description: 'Provision cloud databases via Crossplane',
        parameters: {
          type: 'object',
          properties: {
            databaseType: { type: 'string', description: 'Database type (postgresql, mysql, redis)' },
            name: { type: 'string', description: 'Database instance name' },
            size: { type: 'string', description: 'Database size (small/medium/large, default: small)' },
            environment: { type: 'string', description: 'Environment (development/staging/production)' }
          },
          required: ['databaseType', 'name']
        }
      },
      {
        name: 'generateKubectlCommand',
        description: 'Generate kubectl commands from natural language using AI',
        parameters: {
          type: 'object',
          properties: {
            intent: { type: 'string', description: 'Natural language description of desired kubectl operation' },
            namespace: { type: 'string', description: 'Kubernetes namespace for context' },
            includeClusterContext: { type: 'boolean', description: 'Include current cluster context in AI prompt (default: true)' }
          },
          required: ['intent']
        }
      },
      {
        name: 'generateKubernetesManifest',
        description: 'Generate Kubernetes YAML manifests from natural language using AI',
        parameters: {
          type: 'object',
          properties: {
            intent: { type: 'string', description: 'Natural language description of desired resource' },
            resourceType: { type: 'string', description: 'Kubernetes resource type (deployment, service, configmap, etc.)' },
            appName: { type: 'string', description: 'Application name for the resource' },
            namespace: { type: 'string', description: 'Target namespace (default: default)' },
            parameters: { type: 'object', description: 'Additional parameters for manifest generation' }
          },
          required: ['intent', 'resourceType', 'appName']
        }
      },
      {
        name: 'getActionStatus',
        description: 'Get status of a distributed action by ID',
        parameters: {
          type: 'object',
          properties: {
            actionId: { type: 'string', description: 'Unique action identifier' }
          },
          required: ['actionId']
        }
      },
      {
        name: 'listUserActions',
        description: 'List all actions for a user with optional filtering',
        parameters: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User identifier' },
            status: { type: 'string', description: 'Filter by action status (pending, running, completed, failed)' },
            limit: { type: 'number', description: 'Maximum number of actions to return (default: 20)' }
          },
          required: ['userId']
        }
      }
    ];

    return {
      agentId: this.config.agentId,
      name: this.config.name,
      description: 'Infrastructure Agent specializing in Kubernetes operations and cloud resource management',
      tools,
      specializations: [
        'kubernetes',
        'deployment',
        'scaling',
        'monitoring',
        'cloud-provisioning',
        'container-orchestration',
        'ai-powered-operations',
        'natural-language-to-kubectl',
        'manifest-generation',
        'distributed-action-tracking',
        'background-processing'
      ],
      endpoints: {
        mcp: `http://localhost:3001/mcp`,
        health: `http://localhost:3001/health`
      }
    };
  }

  /**
   * Generate kubectl command from natural language using AI
   */
  async generateKubectlCommand(params: {
    intent: string;
    namespace?: string;
    includeClusterContext?: boolean;
    context: ConversationContext;
  }): Promise<any> {
    const startTime = Date.now();
    const operationId = uuidv4();

    this.logger.info({
      operationId,
      intent: params.intent,
      namespace: params.namespace,
      includeClusterContext: params.includeClusterContext
    }, 'Generating kubectl command using AI');

    try {
      // Check if AI service is available
      if (!this.kubernetesAI) {
        throw new Error('Kubernetes AI service not configured or available');
      }

      // Gather cluster context if requested
      let clusterContext;
      if (params.includeClusterContext !== false) {
        try {
          // Basic cluster context - can be expanded when KubernetesOperations has more methods
          clusterContext = {
            namespace: params.namespace || 'default',
            timestamp: new Date().toISOString()
          };
        } catch (contextError) {
          this.logger.warn({ error: contextError.message }, 'Failed to gather cluster context, proceeding without it');
          clusterContext = undefined;
        }
      }

      // Generate kubectl command using AI
      const aiResponse = await this.kubernetesAI.generateKubectlCommand({
        intent: params.intent,
        namespace: params.namespace,
        clusterContext
      });

      const duration = Date.now() - startTime;

      // Store operation context for learning
      await this.storeOperationContext(
        operationId,
        'generateKubectlCommand',
        params,
        aiResponse,
        true
      );

      this.logger.info({
        operationId,
        duration,
        command: aiResponse.command,
        riskLevel: aiResponse.riskLevel,
        confidence: aiResponse.confidence
      }, 'AI kubectl command generation completed');

      return {
        success: true,
        command: aiResponse.command,
        explanation: aiResponse.explanation,
        riskLevel: aiResponse.riskLevel,
        warnings: aiResponse.warnings,
        confidence: aiResponse.confidence,
        operationId,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      await this.storeOperationContext(
        operationId,
        'generateKubectlCommand',
        params,
        { error: error.message },
        false
      );

      this.logger.error({
        operationId,
        duration,
        error: error.message,
        intent: params.intent
      }, 'Failed to generate kubectl command');

      return {
        success: false,
        error: error.message,
        operationId,
        duration
      };
    }
  }

  /**
   * Generate Kubernetes YAML manifest from natural language using AI
   */
  async generateKubernetesManifest(params: {
    intent: string;
    resourceType: string;
    appName: string;
    namespace?: string;
    parameters?: Record<string, any>;
    context: ConversationContext;
  }): Promise<any> {
    const startTime = Date.now();
    const operationId = uuidv4();

    this.logger.info({
      operationId,
      intent: params.intent,
      resourceType: params.resourceType,
      appName: params.appName,
      namespace: params.namespace
    }, 'Generating Kubernetes manifest using AI');

    try {
      // Check if AI service is available
      if (!this.kubernetesAI) {
        throw new Error('Kubernetes AI service not configured or available');
      }

      // Generate manifest using AI
      const aiResponse = await this.kubernetesAI.generateManifest({
        intent: params.intent,
        resourceType: params.resourceType,
        appName: params.appName,
        namespace: params.namespace || 'default',
        parameters: params.parameters
      });

      const duration = Date.now() - startTime;

      // Store operation context for learning
      await this.storeOperationContext(
        operationId,
        'generateKubernetesManifest',
        params,
        aiResponse,
        aiResponse.isValid
      );

      this.logger.info({
        operationId,
        duration,
        kind: aiResponse.metadata.kind,
        name: aiResponse.metadata.name,
        isValid: aiResponse.isValid
      }, 'AI manifest generation completed');

      return {
        success: true,
        manifest: aiResponse.manifest,
        metadata: aiResponse.metadata,
        isValid: aiResponse.isValid,
        validationErrors: aiResponse.validationErrors,
        recommendations: aiResponse.recommendations,
        operationId,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      await this.storeOperationContext(
        operationId,
        'generateKubernetesManifest',
        params,
        { error: error.message },
        false
      );

      this.logger.error({
        operationId,
        duration,
        error: error.message,
        intent: params.intent,
        resourceType: params.resourceType
      }, 'Failed to generate Kubernetes manifest');

      return {
        success: false,
        error: error.message,
        operationId,
        duration
      };
    }
  }

  /**
   * Execute tool with optional distributed action tracking
   */
  private async executeToolWithTracking(
    toolName: string,
    parameters: any,
    context: ConversationContext
  ): Promise<any> {
    // If Action Manager is available, use distributed tracking
    if (this.actionManager) {
      return await this.executeToolViaActionManager(toolName, parameters, context);
    } 
    
    // Otherwise, execute directly (legacy mode)
    return await this.executeToolDirectly(toolName, parameters, context);
  }

  /**
   * Execute tool via Action Manager for distributed tracking
   */
  private async executeToolViaActionManager(
    toolName: string,
    parameters: any,
    context: ConversationContext
  ): Promise<any> {
    try {
      // Import action types
      const { ActionIntent, AgentName } = await import('@ai-idp/action-manager');
      
      // Map tool names to action intents
      const actionIntentMap = {
        'deployApplication': ActionIntent.DEPLOY,
        'scaleResource': ActionIntent.SCALE,
        'getResourceStatus': ActionIntent.MONITOR,
        'getResourceLogs': ActionIntent.MONITOR,
        'provisionDatabase': ActionIntent.DEPLOY,
        'generateKubectlCommand': ActionIntent.AI_GENERATE,
        'generateKubernetesManifest': ActionIntent.AI_GENERATE
      };

      const actionIntent = actionIntentMap[toolName] || ActionIntent.DEPLOY;

      // Create action via Action Manager
      const actionRecord = await this.actionManager!.createAction({
        userId: context.userId,
        sessionId: context.sessionId,
        conversationId: context.conversationId,
        agentName: AgentName.INFRASTRUCTURE,
        toolName,
        intent: actionIntent,
        toolParameters: parameters,
        environment: 'production'
      });

      if (!actionRecord) {
        throw new Error(`Failed to create action`);
      }

      // Log that we're using distributed tracking
      this.logger.info({
        actionId: actionRecord.actionId,
        toolName,
        parameters
      }, 'Executing tool via distributed action tracking');

      // Get the action status (will be processed by workers)
      const statusResult = await this.actionManager!.getAction(actionRecord.actionId);
      
      return {
        success: true,
        actionId: actionRecord.actionId,
        status: statusResult?.status || 'unknown',
        message: `Action ${actionRecord.actionId} queued for distributed execution`,
        data: statusResult || null,
        isDistributedAction: true
      };

    } catch (error) {
      this.logger.error(error, 'Failed to execute tool via Action Manager');
      
      // Fallback to direct execution
      this.logger.warn('Falling back to direct tool execution');
      return await this.executeToolDirectly(toolName, parameters, context);
    }
  }

  /**
   * Execute tool directly (legacy mode)
   */
  private async executeToolDirectly(
    toolName: string,
    parameters: any,
    context: ConversationContext
  ): Promise<any> {
    switch (toolName) {
      case 'deployApplication':
        return await this.deployApplication({ ...parameters, context });
      case 'scaleResource':
        return await this.scaleResource({ ...parameters, context });
      case 'getResourceStatus':
        return await this.getResourceStatus({ ...parameters, context });
      case 'getResourceLogs':
        return await this.getResourceLogs({ ...parameters, context });
      case 'generateKubectlCommand':
        return await this.generateKubectlCommand({ ...parameters, context });
      case 'generateKubernetesManifest':
        return await this.generateKubernetesManifest({ ...parameters, context });
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Get action status from Action Manager
   */
  async getActionStatus(actionId: string): Promise<any> {
    if (!this.actionManager) {
      return {
        success: false,
        error: 'Action Manager not configured'
      };
    }

    return await this.actionManager.getAction(actionId);
  }

  /**
   * List user actions from Action Manager
   */
  async listUserActions(userId: string, options?: any): Promise<any> {
    if (!this.actionManager) {
      return {
        success: false,
        error: 'Action Manager not configured'
      };
    }

    return await this.actionManager.getActionsByUser(userId, options);
  }

  /**
   * Store operation context in Qdrant for learning
   */
  private async storeOperationContext(
    operationId: string,
    operation: string,
    params: any,
    result: any,
    success: boolean
  ): Promise<void> {
    if (!this.qdrantClient) return;

    try {
      const pattern = `Infrastructure operation: ${operation} with params: ${JSON.stringify(params)}`;

      await this.qdrantClient.storeExecutionPattern(
        operationId,
        this.config.agentId,
        pattern,
        {
          operation,
          params,
          result,
          timestamp: new Date().toISOString()
        },
        success
      );

      this.logger.debug({
        operationId,
        operation,
        success
      }, 'Operation context stored in Qdrant');

    } catch (error) {
      this.logger.warn({
        error: error.message,
        operationId
      }, 'Failed to store operation context');
    }
  }
}