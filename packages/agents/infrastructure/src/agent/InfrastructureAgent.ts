import { QdrantContextClient } from '@ai-idp/qdrant-client';
import { createLogger, validateData, type Logger } from '@ai-idp/utils';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import * as k8s from '@kubernetes/client-node';
import * as yaml from 'js-yaml';
import type {
  AgentCapabilities,
  ToolDefinition,
  ConversationContext
} from '@ai-idp/types';
import { KubernetesOperations } from '../kubernetes/KubernetesOperations';
import { CloudOperations } from '../cloud/CloudOperations';

// Infrastructure Agent Configuration
export interface InfrastructureAgentConfig {
  agentId: string;
  name: string;
  kubeconfig?: string;
  qdrant?: {
    url: string;
    apiKey?: string;
    collectionName: string;
    vectorSize?: number;
    timeout?: number;
  };
  windmill?: {
    baseUrl: string;
    token?: string;
    workspace: string;
  };
}

const InfrastructureAgentConfigSchema = z.object({
  agentId: z.string().default('infrastructure'),
  name: z.string().default('Infrastructure Agent'),
  kubeconfig: z.string().optional(),
  qdrant: z.object({
    url: z.string().url(),
    apiKey: z.string().optional(),
    collectionName: z.string().default('infrastructure_context'),
    vectorSize: z.number().default(1536),
    timeout: z.number().default(30000)
  }).optional(),
  windmill: z.object({
    baseUrl: z.string().url(),
    token: z.string().optional(),
    workspace: z.string().default('admins')
  }).optional()
});

/**
 * Infrastructure Agent - Specialized agent for Kubernetes and Cloud operations
 * 
 * Capabilities:
 * - Kubernetes cluster management (deploy, scale, status, logs, rollback)
 * - Cloud resource provisioning via Crossplane
 * - Container orchestration and networking
 * - Infrastructure pattern recognition and optimization
 */
export class InfrastructureAgent {
  private config: z.infer<typeof InfrastructureAgentConfigSchema>;
  private logger: Logger;
  private qdrantClient?: QdrantContextClient;
  private k8sOperations: KubernetesOperations;
  private cloudOperations: CloudOperations;
  private isInitialized = false;

  // Agent capabilities definition
  private capabilities: AgentCapabilities;

  constructor(config: InfrastructureAgentConfig, logger?: Logger) {
    this.config = validateData(
      config,
      InfrastructureAgentConfigSchema,
      { service: 'infrastructure-agent', operation: 'constructor' }
    );
    this.logger = logger ? (logger.child ? logger.child({ component: 'InfrastructureAgent' }) as Logger : logger) : createLogger({
      service: 'infrastructure-agent',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development'
    });

    // Initialize sub-components
    this.k8sOperations = new KubernetesOperations(this.config, this.logger);
    this.cloudOperations = new CloudOperations(this.config, this.logger);

    // Initialize Qdrant client if configured
    if (this.config.qdrant) {
      this.qdrantClient = new QdrantContextClient(
        this.config.qdrant,
        process.env.OPENAI_API_KEY || '',
        this.logger
      );
    }

    // Define agent capabilities
    this.capabilities = this.defineCapabilities();
  }

  /**
   * Initialize the Infrastructure Agent
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

      this.isInitialized = true;
      this.logger.info('Infrastructure Agent initialized successfully');

    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Infrastructure Agent');
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

      // Store context if Qdrant is available
      if (this.qdrantClient) {
        await this.storeOperationContext(
          operationId,
          'deployApplication',
          params,
          result,
          true
        );
      }

      const executionTime = Date.now() - startTime;

      this.logger.info({
        operationId,
        success: result.success,
        executionTime
      }, 'Application deployment completed');

      return {
        success: result.success,
        message: result.message,
        detailedResponse: result.detailedResponse,
        data: result.data,
        metadata: {
          operationId,
          executionTime,
          agent: 'infrastructure',
          action: 'deployApplication'
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
        'container-orchestration'
      ],
      endpoints: {
        mcp: `http://localhost:3001/mcp`,
        health: `http://localhost:3001/health`
      }
    };
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