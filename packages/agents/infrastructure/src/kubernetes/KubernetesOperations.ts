import * as k8s from '@kubernetes/client-node';
import * as yaml from 'js-yaml';
import type { Logger } from '@ai-idp/utils';
import type { InfrastructureAgentConfig } from '../agent/InfrastructureAgent';

/**
 * Kubernetes Operations - Core Kubernetes functionality
 * 
 * Extracted from the original KubernetesModule to work as a focused operations class
 * for the Infrastructure Agent
 */
export class KubernetesOperations {
  private k8sApi?: k8s.CoreV1Api;
  private k8sAppsApi?: k8s.AppsV1Api;
  private logger: Logger;
  private availableNamespaces: string[] = [];
  private config: InfrastructureAgentConfig;

  constructor(config: InfrastructureAgentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'KubernetesOperations' });
  }

  /**
   * Initialize Kubernetes client and load configuration
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info({}, 'Initializing Kubernetes operations');

      const kc = new k8s.KubeConfig();

      this.logger.info({ kubeconfigProvided: this.config.kubeconfig }, 'Kubeconfig provided');

      // Try to load kubeconfig
      if (this.config.kubeconfig) {
        // Load from provided config
        kc.loadFromFile(this.config.kubeconfig);
        this.logger.info({ config: this.config.kubeconfig }, 'Loaded provided Kubernetes config');
      } else {
        try {
          // Try in-cluster config first
          kc.loadFromCluster();
          this.logger.info({}, 'Loaded in-cluster Kubernetes config');
        } catch (clusterError) {
          // Fallback to default config
          try {
            kc.loadFromDefault();
            this.logger.info({}, 'Loaded default Kubernetes config');
          } catch (defaultError) {
            this.logger.warn({
              clusterError: clusterError instanceof Error ? clusterError.message : 'Unknown',
              defaultError: defaultError instanceof Error ? defaultError.message : 'Unknown'
            }, 'No Kubernetes config found, running in simulation mode');
            // Continue without K8s client for development
            return;
          }
        }
      }

      // Create API clients
      this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
      this.k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);

      // Load available namespaces
      await this.loadNamespaces();

      this.logger.info({}, 'Kubernetes operations initialized successfully');

    } catch (error) {
      this.logger.error(error, 'Failed to initialize Kubernetes operations');
      throw error;
    }
  }

  /**
   * Deploy application to Kubernetes
   */
  async deployApplication(params: {
    resourceName: string;
    containerImage: string;
    namespace: string;
    replicas: number;
    port: number;
    environment: string;
  }): Promise<any> {
    if (!this.k8sAppsApi) {
      return this.simulateDeployment(params);
    }

    try {
      const { resourceName, containerImage, namespace, replicas, port, environment } = params;

      // Ensure namespace exists
      await this.ensureNamespace(namespace);

      // Create deployment manifest
      const deployment = this.generateDeploymentManifest(
        resourceName,
        containerImage,
        namespace,
        replicas,
        port,
        environment
      );

      // Apply deployment
      let deploymentResult;
      try {
        // Try to patch existing deployment
        deploymentResult = await this.k8sAppsApi.patchNamespacedDeployment({
          name: resourceName,
          namespace,
          body: deployment
        });
        this.logger.info({ resourceName, namespace }, 'Updated existing deployment');
      } catch (patchError) {
        // Create new deployment
        deploymentResult = await this.k8sAppsApi.createNamespacedDeployment({
          namespace,
          body: deployment
        });
        this.logger.info({ resourceName, namespace }, 'Created new deployment');
      }

      // Create service manifest
      const service = this.generateServiceManifest(resourceName, namespace, port);

      // Apply service
      try {
        // Try to patch existing service
        await this.k8sApi!.patchNamespacedService({
          name: resourceName,
          namespace,
          body: service
        });
      } catch (patchError) {
        // Create new service
        await this.k8sApi!.createNamespacedService({
          namespace,
          body: service
        });
        this.logger.info({ resourceName, namespace }, 'Created new service');
      }

      // Wait for deployment to be ready (with timeout)
      await this.waitForDeploymentReady(resourceName, namespace, 300000); // 5 minutes timeout

      // Get final status
      const status = await this.getDeploymentStatus(resourceName, namespace);

      return {
        success: true,
        message: `Successfully deployed ${resourceName} to ${namespace}`,
        detailedResponse: this.formatDeploymentResponse(status, resourceName, namespace, containerImage),
        data: status
      };

    } catch (error) {
      this.logger.error(error, 'Deployment failed');
      throw error;
    }
  }

  /**
   * Scale Kubernetes resource
   */
  async scaleResource(params: {
    resourceName: string;
    replicas: number;
    namespace: string;
    resourceType: string;
  }): Promise<any> {
    if (!this.k8sAppsApi) {
      return this.simulateScaling(params);
    }

    try {
      const { resourceName, replicas, namespace, resourceType } = params;

      if (resourceType !== 'deployment') {
        throw new Error(`Scaling ${resourceType} not yet supported`);
      }

      // Get current deployment
      const currentDeploymentResp = await this.k8sAppsApi.readNamespacedDeployment({
        name: resourceName,
        namespace
      });
      const currentDeployment = currentDeploymentResp;
      const currentReplicas = currentDeployment.spec?.replicas || 0;

      if (currentReplicas === replicas) {
        return {
          success: true,
          message: `${resourceName} already has ${replicas} replicas`,
          detailedResponse: this.formatScalingResponse(currentReplicas, replicas, resourceName, namespace),
          data: {
            resourceName,
            namespace,
            currentReplicas,
            targetReplicas: replicas,
            unchanged: true
          }
        };
      }

      // Scale deployment
      const scaleObj = {
        spec: {
          replicas: replicas
        }
      };

      await this.k8sAppsApi.patchNamespacedDeploymentScale({
        name: resourceName,
        namespace,
        body: scaleObj
      });

      // Wait for scaling to complete
      await this.waitForDeploymentReady(resourceName, namespace, 180000); // 3 minutes timeout

      // Get final status
      const finalStatus = await this.getDeploymentStatus(resourceName, namespace);

      return {
        success: true,
        message: `Successfully scaled ${resourceName} from ${currentReplicas} to ${replicas} replicas`,
        detailedResponse: this.formatScalingResponse(currentReplicas, replicas, resourceName, namespace),
        data: finalStatus
      };

    } catch (error) {
      this.logger.error(error, 'Scaling failed');
      throw error;
    }
  }

  /**
   * Get resource status
   */
  async getResourceStatus(params: {
    resourceName: string;
    namespace: string;
    resourceType: string;
  }): Promise<any> {
    if (!this.k8sAppsApi) {
      return this.simulateStatus(params);
    }

    try {
      const { resourceName, namespace, resourceType } = params;

      if (resourceType !== 'deployment') {
        throw new Error(`Status check for ${resourceType} not yet supported`);
      }

      const status = await this.getDeploymentStatus(resourceName, namespace);

      return {
        success: true,
        message: `Status retrieved for ${resourceName}`,
        detailedResponse: this.formatStatusResponse(status, resourceName, namespace),
        data: status
      };

    } catch (error) {
      if (error.response?.statusCode === 404) {
        return {
          success: false,
          message: `Resource ${params.resourceName} not found in namespace ${params.namespace}`,
          data: { error: 'Resource not found' }
        };
      }

      this.logger.error(error, 'Status check failed');
      throw error;
    }
  }

  /**
   * Get resource logs
   */
  async getResourceLogs(params: {
    resourceName: string;
    namespace: string;
    lines: number;
    follow: boolean;
  }): Promise<any> {
    if (!this.k8sApi) {
      return this.simulateLogs(params);
    }

    try {
      const { resourceName, namespace, lines, follow } = params;

      // Get pods for the deployment
      const podsResp = await this.k8sApi.listNamespacedPod({
        namespace,
        labelSelector: `app=${resourceName}`
      });
      const pods = podsResp;
      if (pods.items.length === 0) {
        return {
          success: false,
          message: `No pods found for ${resourceName} in namespace ${namespace}`,
          data: { logs: [] }
        };
      }
      const logResults = [];
      // Get logs from all pods (limit to first 3 for performance)
      const targetPods = pods.items.slice(0, 3);

      for (const pod of targetPods) {
        try {
          const logResponse = await this.k8sApi.readNamespacedPodLog({
            name: pod.metadata!.name!,
            namespace,
            follow,
            tailLines: lines
          });
          logResults.push({
            podName: pod.metadata!.name!,
            logs: logResponse.split('\n').filter(line => line.trim() !== '')
          });
        } catch (podLogError) {
          logResults.push({
            podName: pod.metadata!.name!,
            logs: [`Error retrieving logs: ${podLogError.message}`]
          });
        }
      }

      return {
        success: true,
        message: `Retrieved logs for ${resourceName} (${logResults.length} pods)`,
        detailedResponse: this.formatLogsResponse(logResults, resourceName, namespace),
        data: { logs: logResults, podCount: logResults.length }
      };

    } catch (error) {
      this.logger.error(error, 'Log retrieval failed');
      throw error;
    }
  }

  /**
   * Health check for Kubernetes operations
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      if (!this.k8sApi) {
        return {
          healthy: false,
          details: { error: 'Kubernetes API not initialized (simulation mode)' }
        };
      }

      // Test API connectivity by listing namespaces
      const namespacesResp = await this.k8sApi.listNamespace({});
      const namespaces = namespacesResp;
      return {
        healthy: true,
        details: {
          namespaces: namespaces.items.length,
          availableNamespaces: this.availableNamespaces.length,
          apiVersion: 'v1'
        }
      };

    } catch (error) {
      return {
        healthy: false,
        details: { error: error.message }
      };
    }
  }

  // Private helper methods
  private async loadNamespaces(): Promise<void> {
    if (!this.k8sApi) return;

    try {
      const namespacesResp = await this.k8sApi.listNamespace({});
      const namespaces = namespacesResp;
      this.availableNamespaces = namespaces.items.map(ns => ns.metadata!.name!);
      this.logger.info({ count: this.availableNamespaces.length }, 'Loaded namespaces');
    } catch (error) {
      this.logger.warn({ error }, 'Failed to load namespaces');
      this.availableNamespaces = ['default'];
    }
  }

  private async ensureNamespace(namespace: string): Promise<void> {
    if (!this.k8sApi) return;

    try {
      await this.k8sApi.readNamespace({ name: namespace });
    } catch (error) {
      if (error.response?.statusCode === 404) {
        // Create namespace
        const namespaceManifest: k8s.V1Namespace = {
          apiVersion: 'v1',
          kind: 'Namespace',
          metadata: {
            name: namespace,
            labels: {
              'managed-by': 'ai-idp-infrastructure-agent'
            }
          }
        };
        await this.k8sApi.createNamespace({ body: namespaceManifest });
        this.logger.info({ namespace }, 'Created namespace');
      } else {
        throw error;
      }
    }
  }

  private generateDeploymentManifest(
    name: string,
    image: string,
    namespace: string,
    replicas: number,
    port: number,
    environment: string
  ): k8s.V1Deployment {
    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name,
        namespace,
        labels: {
          app: name,
          environment,
          'managed-by': 'ai-idp-infrastructure-agent'
        }
      },
      spec: {
        replicas,
        selector: {
          matchLabels: { app: name }
        },
        template: {
          metadata: {
            labels: {
              app: name,
              environment
            }
          },
          spec: {
            containers: [
              {
                name,
                image,
                ports: [{ containerPort: port, name: 'http' }],
                env: [{ name: 'ENVIRONMENT', value: environment }],
                resources: {
                  requests: {
                    memory: '64Mi',
                    cpu: '50m'
                  },
                  limits: {
                    memory: '256Mi',
                    cpu: '200m'
                  }
                },
                livenessProbe: {
                  httpGet: {
                    path: '/health',
                    port: 'http'
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10
                },
                readinessProbe: {
                  httpGet: {
                    path: '/ready',
                    port: 'http'
                  },
                  initialDelaySeconds: 5,
                  periodSeconds: 5
                }
              }
            ]
          }
        }
      }
    };
  }

  private generateServiceManifest(name: string, namespace: string, port: number): k8s.V1Service {
    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name,
        namespace,
        labels: {
          app: name,
          'managed-by': 'ai-idp-infrastructure-agent'
        }
      },
      spec: {
        selector: { app: name },
        ports: [
          {
            port,
            targetPort: 'http',
            protocol: 'TCP',
            name: 'http'
          }
        ],
        type: 'ClusterIP'
      }
    };
  }

  private async waitForDeploymentReady(
    name: string,
    namespace: string,
    timeoutMs: number
  ): Promise<void> {
    const startTime = Date.now();
    const interval = 5000; // 5 seconds

    while (Date.now() - startTime < timeoutMs) {
      try {
        const deploymentResp = await this.k8sAppsApi!.readNamespacedDeployment({ name, namespace });
        const deployment = deploymentResp;
        const status = deployment.status;
        if (
          status?.readyReplicas === status?.replicas &&
          status?.readyReplicas === deployment.spec?.replicas
        ) {
          this.logger.info({ name, namespace }, 'Deployment ready');
          return;
        }
        this.logger.debug({
          name,
          namespace,
          ready: status?.readyReplicas,
          desired: status?.replicas
        }, 'Waiting for deployment');
        await new Promise(resolve => setTimeout(resolve, interval));

      } catch (error) {
        this.logger.warn({ error }, 'Error checking deployment status');
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    throw new Error(`Deployment ${name} did not become ready within ${timeoutMs}ms`);
  }

  private async getDeploymentStatus(name: string, namespace: string): Promise<any> {
    const deploymentResp = await this.k8sAppsApi!.readNamespacedDeployment({ name, namespace });
    const deployment = deploymentResp;
    // Get pods
    const podsResp = await this.k8sApi!.listNamespacedPod({ namespace, labelSelector: `app=${name}` });
    const pods = podsResp;
    return {
      deployment: {
        name,
        namespace,
        replicas: {
          desired: deployment.spec?.replicas || 0,
          current: deployment.status?.replicas || 0,
          ready: deployment.status?.readyReplicas || 0,
          available: deployment.status?.availableReplicas || 0
        },
        conditions: deployment.status?.conditions || []
      },
      pods: pods.items.map(pod => ({
        name: pod.metadata!.name!,
        phase: pod.status?.phase,
        ready: pod.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True',
        restarts: pod.status?.containerStatuses?.[0]?.restartCount || 0,
        node: pod.spec?.nodeName,
        age: this.calculateAge(String(pod.metadata!.creationTimestamp!))
      }))
    };
  }

  // Simulation methods for development without K8s
  private simulateDeployment(params: any): any {
    this.logger.info({ params }, 'Simulating deployment (no K8s available)');
    return {
      success: true,
      message: `Simulated deployment of ${params.resourceName}`,
      detailedResponse: `## Simulated Deployment\n**Resource**: ${params.resourceName}\n**Image**: ${params.containerImage}\n**Status**: Simulated - no actual Kubernetes cluster available`,
      data: { simulated: true, ...params }
    };
  }

  private simulateScaling(params: any): any {
    this.logger.info({ params }, 'Simulating scaling (no K8s available)');
    return {
      success: true,
      message: `Simulated scaling of ${params.resourceName} to ${params.replicas} replicas`,
      detailedResponse: `## Simulated Scaling\n**Resource**: ${params.resourceName}\n**Replicas**: ${params.replicas}\n**Status**: Simulated - no actual Kubernetes cluster available`,
      data: { simulated: true, ...params }
    };
  }

  private simulateStatus(params: any): any {
    return {
      success: true,
      message: `Simulated status for ${params.resourceName}`,
      detailedResponse: `## Simulated Status\n**Resource**: ${params.resourceName}\n**Status**: Simulated - no actual Kubernetes cluster available`,
      data: { simulated: true, ...params }
    };
  }

  private simulateLogs(params: any): any {
    return {
      success: true,
      message: `Simulated logs for ${params.resourceName}`,
      detailedResponse: `## Simulated Logs\n**Resource**: ${params.resourceName}\n**Logs**: Simulated logs - no actual Kubernetes cluster available`,
      data: { simulated: true, logs: ['Simulated log entry 1', 'Simulated log entry 2'] }
    };
  }

  // Response formatting methods
  private formatDeploymentResponse(status: any, name: string, namespace: string, image: string): string {
    const deployment = status.deployment;
    const pods = status.pods;

    return `## 🚀 Deployment Successful

**Application**: ${name}
**Namespace**: ${namespace}
**Container Image**: ${image}

### 📊 Deployment Status
- **Desired Replicas**: ${deployment.replicas.desired}
- **Ready Replicas**: ${deployment.replicas.ready}
- **Available Replicas**: ${deployment.replicas.available}

### 🔄 Pod Details
${pods.map((pod: any) =>
      `- **${pod.name}**: ${pod.phase} (${pod.ready ? 'Ready' : 'Not Ready'}) - ${pod.age} old`
    ).join('\n')}

### 🔧 Next Steps
- Monitor deployment: \`kubectl get deployment ${name} -n ${namespace}\`
- Check pod status: \`kubectl get pods -l app=${name} -n ${namespace}\`
- View logs: \`kubectl logs -l app=${name} -n ${namespace}\`
- Port forward: \`kubectl port-forward -n ${namespace} service/${name} 8080:80\``;
  }

  private formatScalingResponse(currentReplicas: number, targetReplicas: number, name: string, namespace: string): string {
    const direction = targetReplicas > currentReplicas ? 'up' : 'down';
    const change = Math.abs(targetReplicas - currentReplicas);

    return `## 📏 Scaling Complete

**Resource**: ${name}
**Namespace**: ${namespace}
**Direction**: Scaled ${direction} by ${change} replica(s)
**Previous Replicas**: ${currentReplicas}
**Current Replicas**: ${targetReplicas}

### 🔧 Monitoring Commands
- Watch pods: \`kubectl get pods -l app=${name} -n ${namespace} -w\`
- Check deployment: \`kubectl get deployment ${name} -n ${namespace}\`
- View events: \`kubectl get events -n ${namespace} --sort-by=.lastTimestamp\``;
  }

  private formatStatusResponse(status: any, name: string, namespace: string): string {
    const deployment = status.deployment;
    const pods = status.pods;

    return `## 📊 Resource Status

**Resource**: ${name}
**Namespace**: ${namespace}

### 🎯 Deployment Status
- **Desired**: ${deployment.replicas.desired} replicas
- **Current**: ${deployment.replicas.current} replicas  
- **Ready**: ${deployment.replicas.ready} replicas
- **Available**: ${deployment.replicas.available} replicas

### 🔄 Pod Status (${pods.length} pods)
${pods.map((pod: any) =>
      `- **${pod.name}**: ${pod.phase} - ${pod.ready ? '✅ Ready' : '❌ Not Ready'} (${pod.restarts} restarts) - ${pod.age} old`
    ).join('\n')}

### 📋 Recent Conditions
${deployment.conditions.slice(-3).map((condition: any) =>
      `- **${condition.type}**: ${condition.status} - ${condition.reason || 'N/A'}`
    ).join('\n')}`;
  }

  private formatLogsResponse(logResults: any[], name: string, namespace: string): string {
    return `## 📜 Logs for ${name}

**Namespace**: ${namespace}
**Pods**: ${logResults.length}

${logResults.map((result, index) => `
### Pod ${index + 1}: ${result.podName}

\`\`\`
${result.logs.slice(-10).join('\n')}
\`\`\`
`).join('\n')}

### 🔧 Log Commands
- Follow logs: \`kubectl logs -f -l app=${name} -n ${namespace}\`
- All pods: \`kubectl logs -l app=${name} -n ${namespace} --all-containers=true\`
- Previous logs: \`kubectl logs -l app=${name} -n ${namespace} --previous\``;
  }

  private calculateAge(creationTimestamp: string): string {
    const created = new Date(creationTimestamp);
    const now = new Date();
    const ageMs = now.getTime() - created.getTime();

    const minutes = Math.floor(ageMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  }
}