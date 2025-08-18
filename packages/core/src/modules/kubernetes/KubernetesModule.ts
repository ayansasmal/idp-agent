import { BaseModule } from '../base/SimpleBaseModule';
import { ModuleRequest, ModuleResponse, PlatformAction } from '../../types';
import { CorrelationLogger } from '../../shared/logger/Logger';
import { formatKubernetesResponse } from './formatters';
import * as k8s from '@kubernetes/client-node';
import * as yaml from 'js-yaml';
import * as kubeConfig from "./cloud-kubeconfig.json"

/**
 * Kubernetes Module - Handles all Kubernetes operations
 * This module will become the standalone Kubernetes Agent in Phase 2
 */
export class KubernetesModule extends BaseModule {
  private k8sApi?: k8s.CoreV1Api;
  private k8sAppsApi?: k8s.AppsV1Api;
  private logger: CorrelationLogger;
  private availableNamespaces: string[] = [];

  constructor() {
    super();
    this.logger = new CorrelationLogger('kubernetes-module', '');
  }

  async initialize(): Promise<void> {
    try {
      // Initialize Kubernetes client
      const kc = new k8s.KubeConfig();

      // Try to load config (in-cluster or local kubeconfig)
      try {
        kc.loadFromString(JSON.stringify(kubeConfig));
        this.logger.info('Loaded in-cluster Kubernetes config');
        const currentCluster = kc.getCurrentCluster();
        this.logger.info('Current cluster:', currentCluster);
        // // Verify the in-cluster config is actually usable by checking if service account token exists
        // const fs = require('fs');
        // if (!fs.existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token')) {
        //   throw new Error('In-cluster config loaded but service account token not found');
        // }
      } catch (clusterError) {
        this.logger.info('In-cluster config not available, trying default config', {
          error: clusterError instanceof Error ? clusterError.message : 'Unknown error'
        });

        try {
          kc.loadFromDefault();
          this.logger.info('Loaded default Kubernetes config');
        } catch (defaultError) {
          this.logger.warn('No Kubernetes config found, running in simulation mode', {
            clusterError: clusterError instanceof Error ? clusterError.message : 'Unknown',
            defaultError: defaultError instanceof Error ? defaultError.message : 'Unknown'
          });

          // Log to console for easier debugging
          console.log('[KubernetesModule] No K8s config found - running in simulation mode');
          console.log('Cluster config error:', clusterError);
          console.log('Default config error:', defaultError);

          // Continue without K8s client for development
          return;
        }
      }

      this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      this.k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);

      // Load available namespaces
      await this.loadNamespaces();

      this.logger.info('Kubernetes module initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Kubernetes module', error);
      throw error;
    }
  }

  getCapabilities(): string[] {
    return [
      'deploy',
      'scale',
      'status',
      'logs',
      'rollback',
      'delete',
      'list',
      'describe'
    ];
  }

  /**
   * Load available namespaces from the cluster
   */
  private async loadNamespaces(): Promise<void> {
    if (!this.k8sApi) {
      this.logger.warn('No Kubernetes API available, skipping namespace loading');
      return;
    }

    try {
      const namespacesResponse = await this.k8sApi.listNamespace();
      this.availableNamespaces = namespacesResponse.body.items.map(ns => ns.metadata?.name || '').filter(name => name);

      this.logger.info('Loaded available namespaces', {
        namespaces: this.availableNamespaces,
        count: this.availableNamespaces.length
      });
    } catch (error) {
      this.logger.warn('Failed to load namespaces, will use default', { error });
      this.availableNamespaces = ['default'];
    }
  }

  /**
   * Validate and resolve namespace for deployment
   */
  private async validateNamespace(requestedNamespace: string): Promise<{
    namespace: string;
    requiresUserInput: boolean;
    availableOptions?: string[]
  }> {
    // If no Kubernetes API, use simulation mode
    if (!this.k8sApi) {
      return { namespace: requestedNamespace || 'default', requiresUserInput: false };
    }

    // If no namespace requested, check available options
    if (!requestedNamespace) {
      if (this.availableNamespaces.length === 0) {
        return { namespace: 'default', requiresUserInput: false };
      } else if (this.availableNamespaces.length === 1) {
        return { namespace: this.availableNamespaces[0], requiresUserInput: false };
      } else {
        // Multiple namespaces available, ask user to choose
        return {
          namespace: 'default',
          requiresUserInput: true,
          availableOptions: this.availableNamespaces
        };
      }
    }

    // Check if requested namespace exists
    if (this.availableNamespaces.includes(requestedNamespace)) {
      return { namespace: requestedNamespace, requiresUserInput: false };
    }

    // Namespace doesn't exist, check if 'default' exists
    if (this.availableNamespaces.includes('default')) {
      this.logger.warn(`Namespace '${requestedNamespace}' not found, using 'default'`, {
        requested: requestedNamespace,
        available: this.availableNamespaces
      });
      return { namespace: 'default', requiresUserInput: false };
    }

    // Neither requested nor default exists, ask user to choose
    return {
      namespace: this.availableNamespaces[0] || 'default',
      requiresUserInput: true,
      availableOptions: this.availableNamespaces
    };
  }


  async process(request: ModuleRequest): Promise<ModuleResponse> {
    const startTime = Date.now();
    this.logger = CorrelationLogger.fromRequest(
      request.context.sessionId,
      request.context.userId,
      'KubernetesModule'
    );

    this.logger.info('Processing Kubernetes request', {
      action: request.action,
      parameters: request.parameters
    });

    try {
      const response = await this.handleKubernetesAction(request);

      const duration = Date.now() - startTime;
      this.logger.info('Kubernetes request completed', {
        action: request.action,
        success: response.success,
        duration
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error('Kubernetes request failed', error, {
        action: request.action,
        duration,
        errorMessage,
        errorStack
      });

      // Also log to console for debugging
      console.error(`[KubernetesModule] ${request.action} failed:`, error);

      return {
        success: false,
        message: `Kubernetes operation failed: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        data: null,
        metadata: {
          module: 'kubernetes',
          action: request.action,
          error: errorMessage,
          errorDetails: errorStack
        }
      };
    }
  }

  private async handleKubernetesAction(request: ModuleRequest): Promise<ModuleResponse> {
    const { action, parameters } = request;
    const { environment } = parameters;

    // Validate namespace once at the request level
    const namespaceValidation = await this.validateNamespace(environment);

    // If user input is required, return early with namespace selection request
    if (namespaceValidation.requiresUserInput) {
      return {
        success: false,
        message: `Multiple namespaces available. Please specify which namespace to ${action} in.`,
        timestamp: new Date().toISOString(),
        data: {
          availableNamespaces: namespaceValidation.availableOptions,
          requestedNamespace: environment,
          suggestedAction: `Please specify one of: ${namespaceValidation.availableOptions?.join(', ')}`
        },
        metadata: {
          module: 'kubernetes',
          action,
          requiresUserInput: true,
          inputType: 'namespace-selection'
        }
      };
    }

    const resolvedNamespace = namespaceValidation.namespace;
    this.logger.info(`Using namespace for ${action}`, {
      requested: environment,
      resolved: resolvedNamespace
    });

    // Create enhanced parameters with resolved namespace
    const enhancedParams = {
      ...parameters,
      resolvedNamespace,
      originalEnvironment: environment
    };

    switch (action) {
      case 'deploy':
        return this.handleDeploy(enhancedParams);
      case 'scale':
        return this.handleScale(enhancedParams);
      case 'status':
        return this.handleStatus(enhancedParams);
      case 'logs':
        return this.handleLogs(enhancedParams);
      case 'rollback':
        return this.handleRollback(enhancedParams);
      case 'delete':
        return this.handleDelete(enhancedParams);
      case 'list':
        return this.handleList(enhancedParams);
      case 'describe':
        return this.handleDescribe(enhancedParams);
      default:
        throw new Error(`Unsupported Kubernetes action: ${action}`);
    }
  }

  private async handleDeploy(params: any): Promise<ModuleResponse> {
    const { resourceName, resolvedNamespace, image, replicas = 1, port = 8080 } = params;

    // Generate Kubernetes deployment manifest
    const deployment = this.generateDeploymentManifest({
      name: resourceName,
      namespace: resolvedNamespace,
      image: image || `${resourceName}:latest`,
      replicas,
      port
    });

    // In development mode without K8s cluster, simulate deployment
    if (!this.k8sAppsApi) {
      this.logger.info('Simulating deployment (no K8s cluster)', { resourceName, namespace: resolvedNamespace });
      return this.createFormattedResponse(
        true,
        `Successfully simulated deployment of ${resourceName} to namespace ${resolvedNamespace}`,
        {
          manifest: deployment,
          status: 'simulated'
        },
        'deploy',
        resourceName,
        resolvedNamespace
      );
    }

    // Real Kubernetes deployment
    try {
      const result = await this.k8sAppsApi.createNamespacedDeployment(
        resolvedNamespace,
        deployment
      );

      return this.createFormattedResponse(
        true,
        `Successfully deployed ${resourceName} to namespace ${resolvedNamespace}`,
        {
          deployment: result.body,
          manifest: deployment
        },
        'deploy',
        resourceName,
        resolvedNamespace
      );
    } catch (error) {
      this.logger.error('Real Kubernetes deployment failed', error, {
        resourceName,
        resolvedNamespace,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined
      });

      // Log to console for debugging
      console.error(`[KubernetesModule] Deployment of ${resourceName} to namespace ${resolvedNamespace} failed:`, error);

      throw new Error(`Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleScale(params: any): Promise<ModuleResponse> {
    const { resourceName, resolvedNamespace, replicas } = params;

    if (!this.k8sAppsApi) {
      this.logger.info('Simulating scaling (no K8s cluster)', { resourceName, namespace: resolvedNamespace, replicas });
      return this.createFormattedResponse(
        true,
        `Successfully simulated scaling ${resourceName} to ${replicas} replicas in namespace ${resolvedNamespace}`,
        { status: 'simulated' },
        'scale',
        resourceName,
        resolvedNamespace,
        { replicas }
      );
    }

    try {
      // Patch deployment to scale replicas
      const patch = {
        spec: {
          replicas: parseInt(replicas)
        }
      };

      const result = await this.k8sAppsApi.patchNamespacedDeployment(
        resourceName,
        resolvedNamespace,
        patch,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: { 'Content-Type': 'application/merge-patch+json' } }
      );

      return this.createFormattedResponse(
        true,
        `Successfully scaled ${resourceName} to ${replicas} replicas in namespace ${resolvedNamespace}`,
        { deployment: result.body },
        'scale',
        resourceName,
        resolvedNamespace,
        { replicas }
      );
    } catch (error) {
      throw new Error(`Scaling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleStatus(params: any): Promise<ModuleResponse> {
    const { resourceName, resolvedNamespace } = params;

    if (!this.k8sAppsApi) {
      return this.createFormattedResponse(
        true,
        `Status check for ${resourceName} in namespace ${resolvedNamespace} (simulated)`,
        {
          status: 'simulated',
          namespace: resolvedNamespace,
          replicas: { desired: 1, ready: 1, available: 1 },
          conditions: [
            { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' }
          ]
        },
        'status',
        resourceName,
        resolvedNamespace
      );
    }

    try {
      const deployment = await this.k8sAppsApi.readNamespacedDeployment(
        resourceName,
        resolvedNamespace
      );

      const pods = await this.k8sApi!.listNamespacedPod(
        resolvedNamespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${resourceName}`
      );

      return this.createFormattedResponse(
        true,
        `Status for ${resourceName} in namespace ${resolvedNamespace}`,
        {
          deployment: deployment.body,
          pods: pods.body.items,
          replicas: {
            desired: deployment.body.spec?.replicas || 0,
            ready: deployment.body.status?.readyReplicas || 0,
            available: deployment.body.status?.availableReplicas || 0
          }
        },
        'status',
        resourceName,
        resolvedNamespace
      );
    } catch (error) {
      throw new Error(`Status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleLogs(params: any): Promise<ModuleResponse> {
    const { resourceName, resolvedNamespace, lines = 100 } = params;

    if (!this.k8sApi) {
      return this.createFormattedResponse(
        true,
        `Logs for ${resourceName} in namespace ${resolvedNamespace} (simulated)`,
        {
          logs: [
            `${new Date().toISOString()} [INFO] Application started`,
            `${new Date().toISOString()} [INFO] Listening on port 8080`,
            `${new Date().toISOString()} [DEBUG] Health check passed`
          ].join('\n')
        },
        'logs',
        resourceName,
        resolvedNamespace
      );
    }

    try {
      // Get pods for the deployment
      const pods = await this.k8sApi.listNamespacedPod(
        resolvedNamespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${resourceName}`
      );

      if (pods.body.items.length === 0) {
        throw new Error(`No pods found for ${resourceName}`);
      }

      // Get logs from the first pod
      const podName = pods.body.items[0].metadata?.name;
      if (!podName) {
        throw new Error('Pod name not found');
      }

      const logs = await this.k8sApi.readNamespacedPodLog(
        podName,
        resolvedNamespace,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        lines
      );

      return this.createFormattedResponse(
        true,
        `Logs for ${resourceName} in namespace ${resolvedNamespace}`,
        { logs: logs.body, podName },
        'logs',
        resourceName,
        resolvedNamespace
      );
    } catch (error) {
      throw new Error(`Failed to get logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleRollback(params: any): Promise<ModuleResponse> {
    const { resourceName, resolvedNamespace, revision } = params;

    if (!this.k8sAppsApi) {
      return this.createFormattedResponse(
        true,
        `Rollback of ${resourceName} in namespace ${resolvedNamespace} simulated`,
        { status: 'simulated' },
        'rollback',
        resourceName,
        resolvedNamespace,
        { revision }
      );
    }

    // Kubernetes rollback using annotations
    const rollbackAnnotation = revision
      ? `deployment.kubernetes.io/revision=${revision}`
      : 'deployment.kubernetes.io/rollback-to=previous';

    try {
      const patch = {
        metadata: {
          annotations: {
            [rollbackAnnotation]: 'true'
          }
        }
      };

      await this.k8sAppsApi.patchNamespacedDeployment(
        resourceName,
        resolvedNamespace,
        patch,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: { 'Content-Type': 'application/merge-patch+json' } }
      );

      return this.createFormattedResponse(
        true,
        `Successfully initiated rollback for ${resourceName}`,
        { revision: revision || 'previous' },
        'rollback',
        resourceName,
        resolvedNamespace,
        { revision }
      );
    } catch (error) {
      throw new Error(`Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleDelete(params: any): Promise<ModuleResponse> {
    const { resourceName, resolvedNamespace } = params;

    if (!this.k8sAppsApi) {
      return this.createFormattedResponse(
        true,
        `Deletion of ${resourceName} from namespace ${resolvedNamespace} simulated`,
        { status: 'simulated' },
        'delete',
        resourceName,
        resolvedNamespace
      );
    }

    try {
      await this.k8sAppsApi.deleteNamespacedDeployment(
        resourceName,
        resolvedNamespace
      );

      return this.createFormattedResponse(
        true,
        `Successfully deleted ${resourceName} from namespace ${resolvedNamespace}`,
        { deleted: true },
        'delete',
        resourceName,
        resolvedNamespace
      );
    } catch (error) {
      throw new Error(`Deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleList(params: any): Promise<ModuleResponse> {
    const { resolvedNamespace } = params;

    if (!this.k8sAppsApi) {
      return this.createFormattedResponse(
        true,
        `Listing deployments in namespace ${resolvedNamespace} (simulated)`,
        {
          deployments: [
            { name: 'user-auth', replicas: '1/1', status: 'Running' },
            { name: 'api-gateway', replicas: '2/2', status: 'Running' },
            { name: 'payment-service', replicas: '3/3', status: 'Running' }
          ]
        },
        'list',
        undefined,
        resolvedNamespace
      );
    }

    try {
      const deployments = await this.k8sAppsApi.listNamespacedDeployment(resolvedNamespace);

      const deploymentList = deployments.body.items.map(deployment => ({
        name: deployment.metadata?.name || 'unknown',
        replicas: `${deployment.status?.readyReplicas || 0}/${deployment.spec?.replicas || 0}`,
        status: deployment.status?.conditions?.find(c => c.type === 'Available')?.status === 'True'
          ? 'Running' : 'NotReady',
        age: deployment.metadata?.creationTimestamp
      }));

      return this.createFormattedResponse(
        true,
        `Deployments in namespace ${resolvedNamespace}`,
        { deployments: deploymentList },
        'list',
        undefined,
        resolvedNamespace
      );
    } catch (error) {
      throw new Error(`Failed to list deployments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleDescribe(params: any): Promise<ModuleResponse> {
    const { resourceName, resolvedNamespace } = params;

    if (!this.k8sAppsApi) {
      return this.createFormattedResponse(
        true,
        `Description of ${resourceName} in namespace ${resolvedNamespace} (simulated)`,
        {
          description: {
            name: resourceName,
            namespace: resolvedNamespace,
            replicas: '1/1',
            strategy: 'RollingUpdate',
            conditions: [
              { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' }
            ]
          }
        },
        'describe',
        resourceName,
        resolvedNamespace
      );
    }

    try {
      const deployment = await this.k8sAppsApi.readNamespacedDeployment(
        resourceName,
        resolvedNamespace
      );

      return this.createFormattedResponse(
        true,
        `Description of ${resourceName} in namespace ${resolvedNamespace}`,
        {
          description: deployment.body,
          summary: {
            name: deployment.body.metadata?.name,
            namespace: deployment.body.metadata?.namespace,
            replicas: `${deployment.body.status?.readyReplicas}/${deployment.body.spec?.replicas}`,
            strategy: deployment.body.spec?.strategy?.type,
            conditions: deployment.body.status?.conditions
          }
        },
        'describe',
        resourceName,
        resolvedNamespace
      );
    } catch (error) {
      throw new Error(`Failed to describe ${resourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateDeploymentManifest(config: {
    name: string;
    namespace: string;
    image: string;
    replicas: number;
    port: number;
  }) {
    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: config.name,
        namespace: config.namespace,
        labels: {
          app: config.name,
          'managed-by': 'ai-idp'
        }
      },
      spec: {
        replicas: config.replicas,
        selector: {
          matchLabels: {
            app: config.name
          }
        },
        template: {
          metadata: {
            labels: {
              app: config.name
            }
          },
          spec: {
            containers: [{
              name: config.name,
              image: config.image,
              ports: [{
                containerPort: config.port
              }],
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: config.port
                },
                initialDelaySeconds: 10,
                periodSeconds: 5
              },
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: config.port
                },
                initialDelaySeconds: 30,
                periodSeconds: 10
              }
            }]
          }
        }
      }
    };
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    if (!this.k8sApi) {
      return {
        status: 'degraded',
        message: 'Running in simulation mode (no Kubernetes cluster)'
      };
    }

    try {
      // Test K8s API connectivity
      await this.k8sApi.listNamespace();
      return {
        status: 'healthy',
        message: 'Connected to Kubernetes cluster'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Kubernetes API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Helper method to create formatted module responses
   */
  private createFormattedResponse(
    success: boolean,
    message: string,
    data: any,
    action: string,
    resourceName?: string,
    namespace?: string,
    additionalParams?: any
  ): ModuleResponse {
    let detailedResponse: string | undefined;
    
    try {
      if (success && data) {
        const formatterResult = formatKubernetesResponse(
          action,
          data,
          resourceName,
          namespace,
          additionalParams
        );
        detailedResponse = formatterResult.detailedResponse;
        
        // Enhance data with formatting metadata
        data = {
          ...data,
          formatted: formatterResult.enhancedData
        };
      }
    } catch (error) {
      this.logger.warn('Failed to format detailed response', { error, action });
      // Fallback to basic formatting
      detailedResponse = `## ${success ? '✅' : '❌'} ${action.toUpperCase()} Operation

**Resource:** ${resourceName || 'Unknown'}  
**Namespace:** ${namespace || 'default'}  
**Status:** ${success ? 'Completed' : 'Failed'}

### Raw Data
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\``;
    }

    return {
      requestId: '', // Will be set by communication layer
      success,
      message,
      detailedResponse,
      result: data,
      data,
      metadata: {
        module: 'kubernetes',
        action,
        resourceName,
        namespace,
        hasDetailedResponse: !!detailedResponse
      },
      errors: [],
      warnings: [],
      nextActions: [],
      timestamp: new Date().toISOString(),
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Kubernetes module');
    // Cleanup resources if needed
  }
}