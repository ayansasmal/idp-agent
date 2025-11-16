/**
 * Infrastructure Worker Implementation
 * 
 * Handles execution and validation of infrastructure-related actions
 * such as deployments, scaling, and resource management.
 */

import { ActionWorker, ToolExecutionResult, ValidationResult } from './ActionWorker';
import { ActionStatus, ActionType } from '../types/ActionTypes';

/**
 * Kubernetes resource status interface
 */
export interface K8sResourceStatus {
  name: string;
  namespace: string;
  kind: string;
  status: {
    phase?: string;
    replicas?: {
      desired: number;
      ready: number;
      current: number;
    };
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
  };
  isReady: boolean;
}

/**
 * Infrastructure Worker - handles Kubernetes operations
 */
export class InfrastructureWorker extends ActionWorker {

  /**
   * Execute the infrastructure tool based on action type
   */
  protected async executeTool(): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Executing ${this.actionRecord.toolName} for action ${this.actionRecord.actionId}`);
      
      switch (this.actionRecord.toolName) {
        case 'deployApplication':
          return await this.executeDeployApplication();
          
        case 'scaleResource':
          return await this.executeScaleResource();
          
        case 'getResourceStatus':
          return await this.executeGetResourceStatus();
          
        case 'getResourceLogs':
          return await this.executeGetResourceLogs();
          
        case 'provisionDatabase':
          return await this.executeProvisionDatabase();
          
        case 'generateKubectlCommand':
          return await this.executeGenerateKubectlCommand();
          
        case 'generateKubernetesManifest':
          return await this.executeGenerateKubernetesManifest();
          
        default:
          throw new Error(`Unknown infrastructure tool: ${this.actionRecord.toolName}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Tool execution failed';
      return {
        success: false,
        data: null,
        message: errorMessage,
        error: errorMessage,
        executionTime: Date.now() - startTime,
        resourcesCreated: []
      };
    }
  }

  /**
   * Check completion status based on action type
   */
  protected async checkCompletion(): Promise<ValidationResult> {
    try {
      switch (this.actionRecord.toolName) {
        case 'deployApplication':
          return await this.validateDeployment();
          
        case 'scaleResource':
          return await this.validateScaling();
          
        case 'getResourceStatus':
        case 'getResourceLogs':
          // These are immediate actions
          return {
            isComplete: true,
            progress: 100,
            status: ActionStatus.COMPLETED,
            message: 'Information retrieval completed'
          };
          
        case 'provisionDatabase':
          return await this.validateDatabaseProvisioning();
          
        case 'generateKubectlCommand':
        case 'generateKubernetesManifest':
          // AI generation actions are immediate
          return {
            isComplete: true,
            progress: 100,
            status: ActionStatus.COMPLETED,
            message: 'AI generation completed'
          };
          
        default:
          return {
            isComplete: false,
            progress: 0,
            status: ActionStatus.FAILED,
            message: `Unknown validation for tool: ${this.actionRecord.toolName}`
          };
      }
    } catch (error) {
      console.error(`Validation failed for ${this.actionRecord.actionId}:`, error);
      return {
        isComplete: false,
        progress: 0,
        status: ActionStatus.FAILED,
        message: error instanceof Error ? error.message : 'Validation error'
      };
    }
  }

  // Tool Execution Methods

  /**
   * Deploy an application to Kubernetes
   */
  private async executeDeployApplication(): Promise<ToolExecutionResult> {
    const params = this.actionRecord.executionMetadata.toolParameters || {};
    const { resourceName, containerImage, namespace = 'default', replicas = 1 } = params;

    if (!resourceName || !containerImage) {
      throw new Error('Missing required parameters: resourceName, containerImage');
    }

    // Simulate kubectl deployment creation
    const deploymentCommand = `kubectl create deployment ${resourceName} --image=${containerImage} --replicas=${replicas} -n ${namespace}`;
    const result = await this.executeKubectlCommand(deploymentCommand);

    if (!result.success) {
      throw new Error(`Deployment failed: ${result.error}`);
    }

    // Also create a service if needed
    const serviceCommand = `kubectl expose deployment ${resourceName} --port=80 --target-port=8080 -n ${namespace}`;
    await this.executeKubectlCommand(serviceCommand); // Don't fail if service creation fails

    return {
      success: true,
      data: {
        deployment: resourceName,
        namespace,
        image: containerImage,
        replicas,
        command: deploymentCommand
      },
      message: `Deployment ${resourceName} created in ${namespace} namespace`,
      executionTime: 0,
      resourcesCreated: [`deployment/${resourceName}`, `service/${resourceName}`]
    };
  }

  /**
   * Scale a Kubernetes resource
   */
  private async executeScaleResource(): Promise<ToolExecutionResult> {
    const params = this.actionRecord.executionMetadata.toolParameters || {};
    const { resourceName, replicas, namespace = 'default' } = params;

    if (!resourceName || replicas === undefined) {
      throw new Error('Missing required parameters: resourceName, replicas');
    }

    const scaleCommand = `kubectl scale deployment ${resourceName} --replicas=${replicas} -n ${namespace}`;
    const result = await this.executeKubectlCommand(scaleCommand);

    if (!result.success) {
      throw new Error(`Scaling failed: ${result.error}`);
    }

    return {
      success: true,
      data: {
        deployment: resourceName,
        namespace,
        replicas,
        command: scaleCommand
      },
      message: `Deployment ${resourceName} scaled to ${replicas} replicas`,
      executionTime: 0,
      resourcesCreated: []
    };
  }

  /**
   * Get resource status
   */
  private async executeGetResourceStatus(): Promise<ToolExecutionResult> {
    const params = this.actionRecord.executionMetadata.toolParameters || {};
    const { resourceName, namespace = 'default' } = params;

    if (!resourceName) {
      throw new Error('Missing required parameter: resourceName');
    }

    const statusCommand = `kubectl get deployment ${resourceName} -n ${namespace} -o json`;
    const result = await this.executeKubectlCommand(statusCommand);

    if (!result.success) {
      throw new Error(`Status check failed: ${result.error}`);
    }

    // Parse kubectl output to extract status
    const status = this.parseDeploymentStatus(result.data);

    return {
      success: true,
      data: status,
      message: `Status retrieved for ${resourceName}`,
      executionTime: 0,
      resourcesCreated: []
    };
  }

  /**
   * Get resource logs
   */
  private async executeGetResourceLogs(): Promise<ToolExecutionResult> {
    const params = this.actionRecord.executionMetadata.toolParameters || {};
    const { resourceName, namespace = 'default', lines = 100 } = params;

    if (!resourceName) {
      throw new Error('Missing required parameter: resourceName');
    }

    const logsCommand = `kubectl logs deployment/${resourceName} -n ${namespace} --tail=${lines}`;
    const result = await this.executeKubectlCommand(logsCommand);

    return {
      success: result.success,
      data: {
        logs: result.data,
        resourceName,
        namespace,
        lines
      },
      message: result.success ? `Logs retrieved for ${resourceName}` : `Failed to get logs: ${result.error}`,
      error: result.success ? undefined : result.error,
      executionTime: 0,
      resourcesCreated: []
    };
  }

  /**
   * Provision a database
   */
  private async executeProvisionDatabase(): Promise<ToolExecutionResult> {
    const params = this.actionRecord.executionMetadata.toolParameters || {};
    const { dbName, dbType = 'postgresql', namespace = 'default' } = params;

    if (!dbName) {
      throw new Error('Missing required parameter: dbName');
    }

    // For now, deploy a simple database using Helm or kubectl
    const dbDeployCommand = `kubectl create deployment ${dbName} --image=${dbType}:latest -n ${namespace}`;
    const result = await this.executeKubectlCommand(dbDeployCommand);

    if (!result.success) {
      throw new Error(`Database provisioning failed: ${result.error}`);
    }

    // Create service for the database
    const serviceCommand = `kubectl expose deployment ${dbName} --port=5432 -n ${namespace}`;
    await this.executeKubectlCommand(serviceCommand);

    return {
      success: true,
      data: {
        database: dbName,
        type: dbType,
        namespace,
        command: dbDeployCommand
      },
      message: `Database ${dbName} (${dbType}) provisioned in ${namespace}`,
      executionTime: 0,
      resourcesCreated: [`deployment/${dbName}`, `service/${dbName}`]
    };
  }

  /**
   * Generate kubectl command from natural language using AI
   */
  private async executeGenerateKubectlCommand(): Promise<ToolExecutionResult> {
    const params = this.actionRecord.executionMetadata.toolParameters || {};
    const { intent, namespace, includeClusterContext = true } = params;

    if (!intent) {
      throw new Error('Missing required parameter: intent');
    }

    try {
      // Simulate AI-powered kubectl command generation
      // In production, this would call the InfrastructureAgent's generateKubectlCommand method
      const startTime = Date.now();
      
      console.log(`[AI WORKER] Generating kubectl command for: "${intent}"`);
      
      // Simulate AI processing delay
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      
      // Mock AI response based on common intents
      const aiResponse = this.mockAIKubectlGeneration(intent, namespace);
      
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          command: aiResponse.command,
          explanation: aiResponse.explanation,
          riskLevel: aiResponse.riskLevel,
          confidence: aiResponse.confidence,
          warnings: aiResponse.warnings,
          intent,
          namespace,
          aiProcessingTime: executionTime
        },
        message: `AI generated kubectl command: ${aiResponse.command}`,
        executionTime,
        resourcesCreated: []
      };
    } catch (error) {
      throw new Error(`AI kubectl generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate Kubernetes manifest from natural language using AI
   */
  private async executeGenerateKubernetesManifest(): Promise<ToolExecutionResult> {
    const params = this.actionRecord.executionMetadata.toolParameters || {};
    const { intent, resourceType, appName, namespace = 'default', parameters } = params;

    if (!intent || !resourceType || !appName) {
      throw new Error('Missing required parameters: intent, resourceType, appName');
    }

    try {
      // Simulate AI-powered manifest generation
      // In production, this would call the InfrastructureAgent's generateKubernetesManifest method
      const startTime = Date.now();
      
      console.log(`[AI WORKER] Generating ${resourceType} manifest for: "${intent}"`);
      
      // Simulate AI processing delay (manifests take longer)
      await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 5000));
      
      // Mock AI manifest generation
      const aiResponse = this.mockAIManifestGeneration(intent, resourceType, appName, namespace, parameters);
      
      const executionTime = Date.now() - startTime;

      return {
        success: aiResponse.isValid,
        data: {
          manifest: aiResponse.manifest,
          metadata: aiResponse.metadata,
          isValid: aiResponse.isValid,
          validationErrors: aiResponse.validationErrors,
          recommendations: aiResponse.recommendations,
          intent,
          resourceType,
          appName,
          namespace,
          aiProcessingTime: executionTime
        },
        message: aiResponse.isValid 
          ? `AI generated valid ${resourceType} manifest for ${appName}`
          : `AI generated manifest with validation issues`,
        error: aiResponse.isValid ? undefined : `Validation errors: ${aiResponse.validationErrors?.join(', ')}`,
        executionTime,
        resourcesCreated: aiResponse.isValid ? [`${resourceType.toLowerCase()}/${appName}`] : []
      };
    } catch (error) {
      throw new Error(`AI manifest generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // AI Mock Methods (for simulation)

  /**
   * Mock AI kubectl command generation for testing
   */
  private mockAIKubectlGeneration(intent: string, namespace?: string): {
    command: string;
    explanation: string;
    riskLevel: 'low' | 'medium' | 'high';
    confidence: number;
    warnings?: string[];
  } {
    const lowerIntent = intent.toLowerCase();
    
    // Pattern matching for common kubectl operations
    if (lowerIntent.includes('list') || lowerIntent.includes('show') || lowerIntent.includes('get')) {
      if (lowerIntent.includes('pod')) {
        return {
          command: `kubectl get pods${namespace ? ` -n ${namespace}` : ''}`,
          explanation: `List all pods${namespace ? ` in the ${namespace} namespace` : ''}`,
          riskLevel: 'low',
          confidence: 0.95
        };
      }
      if (lowerIntent.includes('deployment')) {
        return {
          command: `kubectl get deployments${namespace ? ` -n ${namespace}` : ''}`,
          explanation: `List all deployments${namespace ? ` in the ${namespace} namespace` : ''}`,
          riskLevel: 'low',
          confidence: 0.95
        };
      }
    }
    
    if (lowerIntent.includes('scale') && lowerIntent.includes('replicas')) {
      const replicaMatch = lowerIntent.match(/(\d+)\s*replica/);
      const deploymentMatch = lowerIntent.match(/(\w+)\s*deployment/);
      const replicas = replicaMatch ? replicaMatch[1] : '3';
      const deployment = deploymentMatch ? deploymentMatch[1] : 'app';
      
      return {
        command: `kubectl scale deployment ${deployment} --replicas=${replicas}${namespace ? ` -n ${namespace}` : ''}`,
        explanation: `Scale the ${deployment} deployment to ${replicas} replicas`,
        riskLevel: replicas === '0' ? 'high' : 'medium',
        confidence: 0.88,
        warnings: replicas === '0' ? ['Scaling to 0 replicas will make the application unavailable'] : []
      };
    }
    
    if (lowerIntent.includes('delete')) {
      return {
        command: `kubectl delete deployment app${namespace ? ` -n ${namespace}` : ''}`,
        explanation: `Delete deployment (WARNING: This is a destructive operation)`,
        riskLevel: 'high',
        confidence: 0.75,
        warnings: ['This operation will permanently delete the deployment and all its pods']
      };
    }
    
    // Default fallback
    return {
      command: `kubectl get all${namespace ? ` -n ${namespace}` : ''}`,
      explanation: `Show all resources${namespace ? ` in the ${namespace} namespace` : ''} (fallback for unclear intent)`,
      riskLevel: 'low',
      confidence: 0.60,
      warnings: ['Intent was unclear, generated generic command']
    };
  }

  /**
   * Mock AI manifest generation for testing
   */
  private mockAIManifestGeneration(
    intent: string, 
    resourceType: string, 
    appName: string, 
    namespace: string,
    parameters?: any
  ): {
    manifest: string;
    metadata: { kind: string; name: string; namespace: string };
    isValid: boolean;
    validationErrors?: string[];
    recommendations?: string[];
  } {
    const replicas = parameters?.replicas || 3;
    const image = parameters?.image || 'nginx:latest';
    
    let manifest = '';
    const metadata = { kind: resourceType, name: appName, namespace };
    const recommendations = [];
    
    switch (resourceType.toLowerCase()) {
      case 'deployment':
        manifest = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
  namespace: ${namespace}
  labels:
    app: ${appName}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:
      - name: ${appName}
        image: ${image}
        ports:
        - containerPort: 80
        resources:
          limits:
            cpu: 500m
            memory: 512Mi
          requests:
            cpu: 250m
            memory: 256Mi`;
        
        if (!parameters?.resources) {
          recommendations.push('Consider adding resource limits and requests for better resource management');
        }
        if (image.includes(':latest')) {
          recommendations.push('Consider using specific image tags instead of :latest for reproducible deployments');
        }
        break;
        
      case 'service':
        manifest = `apiVersion: v1
kind: Service
metadata:
  name: ${appName}
  namespace: ${namespace}
spec:
  selector:
    app: ${appName}
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
  type: ClusterIP`;
        break;
        
      case 'configmap':
        manifest = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${appName}
  namespace: ${namespace}
data:
  config.yaml: |
    # Configuration for ${appName}
    app:
      name: ${appName}
      environment: production`;
        break;
        
      default:
        return {
          manifest: '',
          metadata,
          isValid: false,
          validationErrors: [`Unsupported resource type: ${resourceType}`],
          recommendations: ['Try using Deployment, Service, or ConfigMap']
        };
    }
    
    return {
      manifest,
      metadata,
      isValid: true,
      validationErrors: [],
      recommendations
    };
  }

  // Validation Methods

  /**
   * Validate deployment completion
   */
  private async validateDeployment(): Promise<ValidationResult> {
    const params = this.actionRecord.executionMetadata.toolParameters || {};
    const { resourceName, namespace = 'default', replicas = 1 } = params;

    const status = await this.getResourceStatus(resourceName, namespace);
    
    if (!status) {
      return {
        isComplete: false,
        progress: 0,
        status: ActionStatus.FAILED,
        message: `Deployment ${resourceName} not found`
      };
    }

    const currentReplicas = status.status.replicas?.ready || 0;
    const desiredReplicas = status.status.replicas?.desired || replicas;
    const progress = Math.min((currentReplicas / desiredReplicas) * 100, 100);

    const isComplete = currentReplicas >= desiredReplicas && status.isReady;

    return {
      isComplete,
      progress,
      status: isComplete ? ActionStatus.COMPLETED : ActionStatus.RUNNING,
      message: `Deployment progress: ${currentReplicas}/${desiredReplicas} replicas ready`,
      data: status
    };
  }

  /**
   * Validate scaling completion
   */
  private async validateScaling(): Promise<ValidationResult> {
    const params = this.actionRecord.executionMetadata.toolParameters || {};
    const { resourceName, namespace = 'default', replicas } = params;

    const status = await this.getResourceStatus(resourceName, namespace);
    
    if (!status) {
      return {
        isComplete: false,
        progress: 0,
        status: ActionStatus.FAILED,
        message: `Deployment ${resourceName} not found`
      };
    }

    const currentReplicas = status.status.replicas?.ready || 0;
    const targetReplicas = replicas;
    const progress = targetReplicas > 0 ? Math.min((currentReplicas / targetReplicas) * 100, 100) : 100;

    const isComplete = currentReplicas === targetReplicas;

    return {
      isComplete,
      progress,
      status: isComplete ? ActionStatus.COMPLETED : ActionStatus.RUNNING,
      message: `Scaling progress: ${currentReplicas}/${targetReplicas} replicas ready`,
      data: status
    };
  }

  /**
   * Validate database provisioning
   */
  private async validateDatabaseProvisioning(): Promise<ValidationResult> {
    const params = this.actionRecord.executionMetadata.toolParameters || {};
    const { dbName, namespace = 'default' } = params;

    const status = await this.getResourceStatus(dbName, namespace);
    
    if (!status) {
      return {
        isComplete: false,
        progress: 0,
        status: ActionStatus.FAILED,
        message: `Database ${dbName} not found`
      };
    }

    const isComplete = status.isReady;
    const progress = isComplete ? 100 : 50; // Simple progress for database

    return {
      isComplete,
      progress,
      status: isComplete ? ActionStatus.COMPLETED : ActionStatus.RUNNING,
      message: isComplete ? `Database ${dbName} is ready` : `Database ${dbName} is starting`,
      data: status
    };
  }

  // Helper Methods

  /**
   * Execute a kubectl command (simulated)
   */
  private async executeKubectlCommand(command: string): Promise<{
    success: boolean;
    data: any;
    error?: string;
  }> {
    console.log(`[SIMULATED] Executing: ${command}`);
    
    // Simulate command execution delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // For simulation, most commands succeed
    // In production, this would use child_process.exec or kubectl client
    if (command.includes('kubectl get') && command.includes('-o json')) {
      // Return mock deployment status
      return {
        success: true,
        data: JSON.stringify({
          metadata: { name: 'test-app', namespace: 'default' },
          status: {
            replicas: 2,
            readyReplicas: Math.random() > 0.3 ? 2 : 1, // Simulate progress
            conditions: [
              { type: 'Available', status: 'True' },
              { type: 'Progressing', status: 'True' }
            ]
          }
        })
      };
    }

    if (command.includes('kubectl logs')) {
      return {
        success: true,
        data: `Sample log output for ${command}`
      };
    }

    // Default success for create/scale commands
    return {
      success: Math.random() > 0.1, // 90% success rate for simulation
      data: `Command executed: ${command}`,
      error: Math.random() > 0.9 ? 'Simulated failure' : undefined
    };
  }

  /**
   * Get resource status from Kubernetes
   */
  private async getResourceStatus(resourceName: string, namespace: string): Promise<K8sResourceStatus | null> {
    const command = `kubectl get deployment ${resourceName} -n ${namespace} -o json`;
    const result = await this.executeKubectlCommand(command);

    if (!result.success) {
      return null;
    }

    return this.parseDeploymentStatus(result.data);
  }

  /**
   * Parse kubectl deployment status output
   */
  private parseDeploymentStatus(jsonOutput: string): K8sResourceStatus {
    try {
      const data = JSON.parse(jsonOutput);
      const status = data.status || {};
      
      return {
        name: data.metadata?.name || 'unknown',
        namespace: data.metadata?.namespace || 'default',
        kind: 'Deployment',
        status: {
          replicas: {
            desired: status.replicas || 0,
            ready: status.readyReplicas || 0,
            current: status.replicas || 0
          },
          conditions: status.conditions || []
        },
        isReady: (status.readyReplicas || 0) >= (status.replicas || 1)
      };
    } catch (error) {
      console.error('Failed to parse deployment status:', error);
      return {
        name: 'unknown',
        namespace: 'default',
        kind: 'Deployment',
        status: { replicas: { desired: 0, ready: 0, current: 0 } },
        isReady: false
      };
    }
  }
}