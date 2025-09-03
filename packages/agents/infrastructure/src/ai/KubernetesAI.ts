import { Ollama } from 'ollama';
import pino, { Logger } from 'pino';

/**
 * Configuration options for KubernetesAI service
 */
export interface KubernetesAIConfig {
  /** Ollama server URL */
  ollamaUrl: string;
  /** Model name to use for Kubernetes operations */
  modelName: string;
  /** Temperature for model responses (0.0-1.0) */
  temperature?: number;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Request for kubectl command generation
 */
export interface KubectlCommandRequest {
  /** Natural language description of the desired operation */
  intent: string;
  /** Current namespace context */
  namespace?: string;
  /** Available resources in the cluster */
  clusterContext?: {
    nodes?: string[];
    deployments?: string[];
    services?: string[];
    pods?: string[];
  };
}

/**
 * Response containing generated kubectl command
 */
export interface KubectlCommandResponse {
  /** Generated kubectl command */
  command: string;
  /** Explanation of what the command does */
  explanation: string;
  /** Risk level assessment */
  riskLevel: 'low' | 'medium' | 'high';
  /** Safety warnings if any */
  warnings?: string[];
  /** Confidence score (0.0-1.0) */
  confidence: number;
}

/**
 * Request for YAML manifest generation
 */
export interface ManifestGenerationRequest {
  /** Natural language description of the desired resource */
  intent: string;
  /** Resource type (deployment, service, configmap, etc.) */
  resourceType: string;
  /** Target namespace */
  namespace?: string;
  /** Application name */
  appName: string;
  /** Additional parameters */
  parameters?: Record<string, any>;
}

/**
 * Response containing generated YAML manifest
 */
export interface ManifestGenerationResponse {
  /** Generated YAML manifest */
  manifest: string;
  /** Resource metadata */
  metadata: {
    kind: string;
    name: string;
    namespace?: string;
  };
  /** Validation status */
  isValid: boolean;
  /** Validation errors if any */
  validationErrors?: string[];
  /** Best practices recommendations */
  recommendations?: string[];
}

/**
 * KubernetesAI Service - AI-powered Kubernetes operations using specialized models
 * 
 * This service integrates with Ollama to provide intelligent Kubernetes command generation
 * and manifest creation using the K8sAIOps/kubernetes_operator_3b_peft_gguf model.
 */
export class KubernetesAI {
  private readonly ollama: Ollama;
  private readonly config: Required<KubernetesAIConfig>;
  private readonly logger: Logger;

  constructor(config: KubernetesAIConfig) {
    this.config = {
      temperature: 0.1,
      timeout: 30000,
      ...config,
    };

    this.ollama = new Ollama({
      host: this.config.ollamaUrl,
    });

    this.logger = pino({
      name: 'kubernetes-ai',
      level: 'info',
    });

    this.logger.info({
      ollamaUrl: this.config.ollamaUrl,
      modelName: this.config.modelName,
    }, 'KubernetesAI service initialized');
  }

  /**
   * Generate kubectl command from natural language intent
   */
  async generateKubectlCommand(request: KubectlCommandRequest): Promise<KubectlCommandResponse> {
    try {
      this.logger.info({ intent: request.intent }, 'Generating kubectl command');

      const prompt = this.buildKubectlPrompt(request);
      
      const response = await this.ollama.generate({
        model: this.config.modelName,
        prompt,
        options: {
          temperature: this.config.temperature,
          num_predict: 500,
        },
      });

      const parsedResponse = this.parseKubectlResponse(response.response);
      
      this.logger.info({
        command: parsedResponse.command,
        riskLevel: parsedResponse.riskLevel,
        confidence: parsedResponse.confidence,
      }, 'Generated kubectl command');

      return parsedResponse;
    } catch (error) {
      this.logger.error(error, 'Failed to generate kubectl command');
      throw new Error(`Failed to generate kubectl command: ${error.message}`);
    }
  }

  /**
   * Generate Kubernetes YAML manifest from natural language description
   */
  async generateManifest(request: ManifestGenerationRequest): Promise<ManifestGenerationResponse> {
    try {
      this.logger.info({
        intent: request.intent,
        resourceType: request.resourceType,
        appName: request.appName,
      }, 'Generating Kubernetes manifest');

      const prompt = this.buildManifestPrompt(request);
      
      const response = await this.ollama.generate({
        model: this.config.modelName,
        prompt,
        options: {
          temperature: this.config.temperature,
          num_predict: 1000,
        },
      });

      const parsedResponse = this.parseManifestResponse(response.response, request);
      
      this.logger.info({
        kind: parsedResponse.metadata.kind,
        name: parsedResponse.metadata.name,
        isValid: parsedResponse.isValid,
      }, 'Generated Kubernetes manifest');

      return parsedResponse;
    } catch (error) {
      this.logger.error(error, 'Failed to generate manifest');
      throw new Error(`Failed to generate manifest: ${error.message}`);
    }
  }

  /**
   * Validate if the AI service is available and working
   */
  async validateService(): Promise<boolean> {
    try {
      const response = await this.ollama.list();
      const modelExists = response.models.some(
        (model) => model.name === this.config.modelName
      );

      if (!modelExists) {
        this.logger.warn({ modelName: this.config.modelName }, 'Model not found');
        return false;
      }

      this.logger.info('KubernetesAI service validation successful');
      return true;
    } catch (error) {
      this.logger.error(error, 'KubernetesAI service validation failed');
      return false;
    }
  }

  /**
   * Build prompt for kubectl command generation
   */
  private buildKubectlPrompt(request: KubectlCommandRequest): string {
    const contextInfo = request.clusterContext 
      ? `\nCluster Context:
- Nodes: ${request.clusterContext.nodes?.join(', ') || 'unknown'}
- Deployments: ${request.clusterContext.deployments?.join(', ') || 'none'}
- Services: ${request.clusterContext.services?.join(', ') || 'none'}
- Pods: ${request.clusterContext.pods?.join(', ') || 'none'}`
      : '';

    const namespaceInfo = request.namespace ? `\nNamespace: ${request.namespace}` : '';

    return `You are a Kubernetes expert assistant. Generate a kubectl command for the following request.

Intent: ${request.intent}${namespaceInfo}${contextInfo}

Please respond in this exact JSON format:
{
  "command": "kubectl command here",
  "explanation": "Brief explanation of what this command does",
  "riskLevel": "low|medium|high",
  "warnings": ["warning 1", "warning 2"] (optional),
  "confidence": 0.95
}

Rules:
1. Always use full kubectl commands with proper flags
2. Include namespace flag (-n) when applicable
3. Assess risk level: low (read operations), medium (create/update), high (delete/destructive)
4. Provide warnings for potentially dangerous operations
5. Confidence should reflect certainty in the command accuracy`;
  }

  /**
   * Build prompt for manifest generation
   */
  private buildManifestPrompt(request: ManifestGenerationRequest): string {
    const parametersInfo = request.parameters 
      ? `\nParameters: ${JSON.stringify(request.parameters, null, 2)}`
      : '';

    const namespaceInfo = request.namespace ? `\nNamespace: ${request.namespace}` : '';

    return `You are a Kubernetes expert assistant. Generate a YAML manifest for the following request.

Intent: ${request.intent}
Resource Type: ${request.resourceType}
Application Name: ${request.appName}${namespaceInfo}${parametersInfo}

Please respond with a valid Kubernetes YAML manifest followed by metadata in this format:

---YAML-START---
apiVersion: ...
kind: ...
metadata:
  name: ...
spec:
  ...
---YAML-END---

---METADATA-START---
{
  "kind": "ResourceKind",
  "name": "resource-name",
  "namespace": "namespace-name",
  "isValid": true,
  "validationErrors": [],
  "recommendations": ["recommendation 1", "recommendation 2"]
}
---METADATA-END---

Rules:
1. Generate production-ready YAML with best practices
2. Include appropriate labels and annotations
3. Use proper resource limits and requests
4. Follow Kubernetes naming conventions
5. Include security context when applicable`;
  }

  /**
   * Parse kubectl command response
   */
  private parseKubectlResponse(response: string): KubectlCommandResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          command: parsed.command || '',
          explanation: parsed.explanation || '',
          riskLevel: parsed.riskLevel || 'medium',
          warnings: parsed.warnings,
          confidence: parsed.confidence || 0.5,
        };
      }

      // Fallback parsing if JSON format is not found
      const lines = response.split('\n').filter(line => line.trim());
      return {
        command: lines[0] || '',
        explanation: 'Generated kubectl command',
        riskLevel: 'medium',
        confidence: 0.3,
      };
    } catch (error) {
      this.logger.warn(error, 'Failed to parse kubectl response');
      return {
        command: '',
        explanation: 'Failed to parse response',
        riskLevel: 'high',
        confidence: 0.0,
      };
    }
  }

  /**
   * Parse manifest generation response
   */
  private parseManifestResponse(
    response: string,
    request: ManifestGenerationRequest
  ): ManifestGenerationResponse {
    try {
      // Extract YAML manifest
      const yamlMatch = response.match(/---YAML-START---([\s\S]*?)---YAML-END---/);
      const manifest = yamlMatch ? yamlMatch[1].trim() : '';

      // Extract metadata
      const metadataMatch = response.match(/---METADATA-START---([\s\S]*?)---METADATA-END---/);
      let metadata = {
        kind: request.resourceType,
        name: request.appName,
        namespace: request.namespace,
        isValid: manifest.length > 0,
        validationErrors: [] as string[],
        recommendations: [] as string[],
      };

      if (metadataMatch) {
        try {
          const parsedMetadata = JSON.parse(metadataMatch[1].trim());
          metadata = { ...metadata, ...parsedMetadata };
        } catch (e) {
          this.logger.warn(e, 'Failed to parse metadata JSON');
        }
      }

      return {
        manifest,
        metadata: {
          kind: metadata.kind,
          name: metadata.name,
          namespace: metadata.namespace,
        },
        isValid: metadata.isValid,
        validationErrors: metadata.validationErrors,
        recommendations: metadata.recommendations,
      };
    } catch (error) {
      this.logger.warn(error, 'Failed to parse manifest response');
      return {
        manifest: '',
        metadata: {
          kind: request.resourceType,
          name: request.appName,
          namespace: request.namespace,
        },
        isValid: false,
        validationErrors: ['Failed to parse AI response'],
        recommendations: [],
      };
    }
  }
}