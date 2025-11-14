/**
 * Common Zod schemas and smart defaults for Infrastructure Agent operations
 *
 * This module provides reusable validation schemas and context-aware default
 * generators for common infrastructure operations. These are used by the
 * assume-and-confirm framework to provide transparent, cost-effective
 * parameter completion.
 *
 * ## Architecture
 *
 * The assume-and-confirm framework consists of three main components:
 * 1. **Validation Schemas**: Zod schemas that define required and optional parameters
 * 2. **Smart Defaults Generators**: Functions that intelligently fill missing parameters
 * 3. **Confirmation Message Generators**: Functions that create user-friendly previews
 *
 * ## Benefits
 *
 * - 🎯 **Cost-effective**: No expensive LLM calls for parameter completion
 * - 🔍 **Transparent**: Users see exactly what will be deployed (Kubernetes manifests)
 * - ⚡ **Smart**: Context-aware defaults based on container images and workload types
 * - 🛡️ **Safe**: Comprehensive validation with clear error messages
 *
 * @example
 * ```typescript
 * // User provides minimal parameters
 * const userInput = { appName: "nginx", image: "nginx:latest" };
 *
 * // Schema validation fails (missing required fields)
 * const validation = DeployApplicationSchema.safeParse(userInput);
 *
 * // Smart defaults generator fills in the gaps
 * const defaults = await generateDeployApplicationDefaults(userInput, context);
 * // Returns: { namespace: "default", replicas: 1, port: 80, resources: {...} }
 *
 * // Confirmation message shows complete Kubernetes manifest
 * const message = generateDeploymentConfirmationMessage("deployApplication", mergedArgs);
 * // Shows full YAML preview with deployment and service
 * ```
 */

import { z } from 'zod';
import type { ConversationContext } from '@ai-idp/types';

// Inlined type from agent-communication (no longer used)
type DefaultsGenerator = (
  providedArgs: Record<string, any>,
  context?: ConversationContext
) => Record<string, any> | Promise<Record<string, any>>;

/**
 * Common Kubernetes resource naming schema
 */
export const KubernetesNameSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
    'Must be lowercase alphanumeric with dashes, start and end with alphanumeric'
  );

/**
 * Kubernetes namespace schema with default
 */
export const KubernetesNamespaceSchema = z
  .string()
  .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
  .default('default');

/**
 * Container image schema with validation
 */
export const ContainerImageSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+([._-][a-z0-9]+)*\/[a-z0-9]+([._-][a-z0-9]+)*:[a-z0-9]+([._-][a-z0-9]+)*$|^[a-z0-9]+([._-][a-z0-9]+)*:[a-z0-9]+([._-][a-z0-9]+)*$|^[a-z0-9]+([._-][a-z0-9]+)*$/,
    'Must be a valid container image reference'
  );

/**
 * Replicas count schema with sensible bounds
 */
export const ReplicasSchema = z
  .number()
  .int()
  .min(0)
  .max(100)
  .default(1);

/**
 * Port number schema
 */
export const PortSchema = z
  .number()
  .int()
  .min(1)
  .max(65535)
  .default(80);

/**
 * Kubernetes resource requirements schema
 */
export const ResourceRequirementsSchema = z.object({
  cpu: z.string().default('100m'),
  memory: z.string().default('128Mi')
}).default({ cpu: '100m', memory: '128Mi' });

/**
 * Deploy application schema
 */
export const DeployApplicationSchema = z.object({
  // Required fields
  appName: KubernetesNameSchema.optional(),
  resourceName: KubernetesNameSchema.optional(),
  containerImage: ContainerImageSchema.optional(),
  image: ContainerImageSchema.optional(),

  // Optional fields with defaults
  namespace: KubernetesNamespaceSchema,
  replicas: ReplicasSchema,
  port: PortSchema,
  resources: ResourceRequirementsSchema,

  // Environment variables (optional)
  env: z.record(z.string(), z.string()).optional(),

  // Service configuration (optional)
  serviceType: z.enum(['ClusterIP', 'NodePort', 'LoadBalancer']).default('ClusterIP'),

  // Labels and annotations (optional)
  labels: z.record(z.string(), z.string()).optional(),
  annotations: z.record(z.string(), z.string()).optional()
}).refine((data) => {
  // At least one of appName/resourceName is required
  return data.appName || data.resourceName;
}, {
  message: "Either appName or resourceName must be provided"
}).refine((data) => {
  // At least one of containerImage/image is required
  return data.containerImage || data.image;
}, {
  message: "Either containerImage or image must be provided"
});

/**
 * Scale resource schema
 */
export const ScaleResourceSchema = z.object({
  resourceName: KubernetesNameSchema,
  replicas: ReplicasSchema,
  namespace: KubernetesNamespaceSchema,
  resourceType: z.enum(['deployment', 'replicaset', 'statefulset']).default('deployment')
});

/**
 * Get resource status schema
 */
export const GetResourceStatusSchema = z.object({
  resourceName: KubernetesNameSchema,
  namespace: KubernetesNamespaceSchema,
  resourceType: z.enum(['deployment', 'service', 'pod', 'replicaset', 'statefulset']).default('deployment')
});

/**
 * Get resource logs schema
 */
export const GetResourceLogsSchema = z.object({
  resourceName: KubernetesNameSchema,
  namespace: KubernetesNamespaceSchema,
  lines: z.number().int().min(1).max(10000).default(100),
  follow: z.boolean().default(false),
  container: z.string().optional()
});

/**
 * Generate kubectl command schema
 */
export const GenerateKubectlCommandSchema = z.object({
  intent: z.string().min(1, 'Intent description is required'),
  query: z.string().optional(), // Legacy alias
  namespace: KubernetesNamespaceSchema,
  includeClusterContext: z.boolean().default(true)
}).refine((data) => {
  // Either intent or query must be provided
  return data.intent || data.query;
}, {
  message: "Either intent or query must be provided"
});

/**
 * Smart defaults generator for deploy application operations
 *
 * This function intelligently fills in missing parameters for Kubernetes deployments
 * without requiring expensive LLM calls. It uses image-based heuristics to determine
 * appropriate defaults for ports, resources, and other deployment settings.
 *
 * ## Smart Detection Logic
 *
 * - **Port Detection**: Analyzes container image names to set appropriate ports
 *   - nginx/apache → 80
 *   - postgres/postgresql → 5432
 *   - redis → 6379
 *   - mongo/mongodb → 27017
 *   - mysql → 3306
 *
 * - **Resource Allocation**: Sets CPU and memory based on workload type
 *   - Database workloads: 500m CPU, 512Mi memory
 *   - Web servers: 100m CPU, 128Mi memory
 *   - Default: 100m CPU, 128Mi memory
 *
 * - **Namespace & Replicas**: Sensible defaults for basic deployments
 *   - namespace: "default"
 *   - replicas: 1
 *
 * @param {Record<string, any>} providedArgs - User-provided arguments that may be incomplete
 * @param {ConversationContext} [context] - Optional conversation context for user-specific labeling
 * @returns {Promise<Record<string, any>>} Generated defaults to merge with provided args
 *
 * @example
 * ```typescript
 * // Input: { appName: "my-app", image: "postgres:13" }
 * const defaults = await generateDeployApplicationDefaults({
 *   appName: "my-app",
 *   image: "postgres:13"
 * }, context);
 *
 * // Output: {
 * //   resourceName: "my-app",
 * //   containerImage: "postgres:13",
 * //   namespace: "default",
 * //   replicas: 1,
 * //   port: 5432,           // ← Smart detection for PostgreSQL
 * //   resources: {          // ← Database-optimized resources
 * //     cpu: "500m",
 * //     memory: "512Mi"
 * //   },
 * //   labels: { ... }       // ← Context-based labeling
 * // }
 * ```
 */
export const generateDeployApplicationDefaults: DefaultsGenerator = async (
  providedArgs: Record<string, any>,
  context?: ConversationContext
) => {
  const defaults: Record<string, any> = {};

  // === RESOURCE NAMING NORMALIZATION ===
  // Ensure both appName and resourceName are available for Kubernetes resource creation
  // This handles cases where users provide only one of the two required naming fields
  if (providedArgs.appName && !providedArgs.resourceName) {
    // Convert appName to valid Kubernetes resource name (lowercase, alphanumeric + hyphens only)
    defaults.resourceName = providedArgs.appName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  } else if (providedArgs.resourceName && !providedArgs.appName) {
    // Use resourceName as appName for consistency in labeling
    defaults.appName = providedArgs.resourceName;
  }

  // === CONTAINER IMAGE NORMALIZATION ===
  // Handle different ways users might specify container images
  // Support both 'image' and 'containerImage' field names for flexibility
  if (providedArgs.image && !providedArgs.containerImage) {
    // Map shorthand 'image' field to the standard 'containerImage' field
    defaults.containerImage = providedArgs.image;
  } else if (providedArgs.containerImage && !providedArgs.image) {
    // Ensure 'image' field is also available for compatibility
    defaults.image = providedArgs.containerImage;
  }

  // === KUBERNETES DEPLOYMENT DEFAULTS ===
  // Set sensible defaults for basic Kubernetes deployment configuration

  // Use 'default' namespace unless user specified otherwise
  // This is the most common namespace for development and testing
  if (!providedArgs.namespace) {
    defaults.namespace = 'default';
  }

  // Default to single replica for simplicity and resource efficiency
  // Users can always scale up later via the scaleResource tool
  if (!providedArgs.replicas) {
    defaults.replicas = 1;
  }

  // === SMART PORT DETECTION ===
  // Analyze container image name to determine the most likely port for the service
  // This eliminates the need for users to remember default ports for common applications
  if (providedArgs.containerImage || providedArgs.image) {
    const image = providedArgs.containerImage || providedArgs.image;

    if (image.includes('nginx')) {
      defaults.port = 80;    // Standard HTTP port for Nginx web server
    } else if (image.includes('postgres') || image.includes('postgresql')) {
      defaults.port = 5432;  // Standard PostgreSQL database port
    } else if (image.includes('redis')) {
      defaults.port = 6379;  // Standard Redis cache port
    } else if (image.includes('mongo')) {
      defaults.port = 27017; // Standard MongoDB database port
    } else if (image.includes('mysql')) {
      defaults.port = 3306;  // Standard MySQL database port
    }
    // Note: If no specific image is detected, we'll use the generic default below
  }

  // Generic fallback port for unknown applications
  // Port 80 is chosen as it's the most common for web applications
  if (!defaults.port && !providedArgs.port) {
    defaults.port = 80;
  }

  // === INTELLIGENT RESOURCE ALLOCATION ===
  // Allocate CPU and memory resources based on workload characteristics
  // Different application types have different resource requirements
  if (providedArgs.containerImage || providedArgs.image) {
    const image = providedArgs.containerImage || providedArgs.image;

    if (image.includes('postgres') || image.includes('mysql') || image.includes('mongo')) {
      // Database workloads: Higher resource allocation for data processing
      // Databases typically need more CPU for query processing and memory for caching
      defaults.resources = {
        cpu: '500m',     // 0.5 CPU cores
        memory: '512Mi'  // 512 megabytes RAM
      };
    } else if (image.includes('nginx') || image.includes('apache')) {
      // Web servers: Lighter resource allocation for static content serving
      // These workloads are typically I/O bound rather than CPU/memory intensive
      defaults.resources = {
        cpu: '100m',     // 0.1 CPU cores
        memory: '128Mi'  // 128 megabytes RAM
      };
    }
    // Note: If no specific workload type is detected, we'll use the generic default below
  }

  // Generic resource allocation for unknown workload types
  // Conservative values that should work for most lightweight applications
  if (!defaults.resources && !providedArgs.resources) {
    defaults.resources = {
      cpu: '100m',     // 0.1 CPU cores (suitable for microservices)
      memory: '128Mi'  // 128 megabytes RAM (minimal but functional)
    };
  }

  // Add context-based labels
  if (context?.userId && context?.conversationId) {
    defaults.labels = {
      'ai-idp.io/managed-by': 'infrastructure-agent',
      'ai-idp.io/user-id': context.userId,
      'ai-idp.io/conversation-id': context.conversationId.slice(-8)
    };
  }

  return defaults;
};

/**
 * Smart defaults generator for scale resource
 */
export const generateScaleResourceDefaults: DefaultsGenerator = async (
  providedArgs: Record<string, any>,
  context?: ConversationContext
) => {
  const defaults: Record<string, any> = {};

  // Default scale up to 2 replicas if no replicas specified
  if (!providedArgs.replicas) {
    defaults.replicas = 2;
  }

  return defaults;
};

/**
 * Smart defaults generator for generate kubectl command
 */
export const generateKubectlCommandDefaults: DefaultsGenerator = async (
  providedArgs: Record<string, any>,
  context?: ConversationContext
) => {
  const defaults: Record<string, any> = {};

  // Use query as intent if intent is missing
  if (providedArgs.query && !providedArgs.intent) {
    defaults.intent = providedArgs.query;
  }

  return defaults;
};

/**
 * Enhanced confirmation message generator for deployments
 *
 * Creates a comprehensive confirmation message that includes:
 * 1. A human-readable summary of deployment settings
 * 2. Complete Kubernetes YAML manifest preview
 * 3. Clear explanation of what resources will be created
 *
 * This transparency is key to the assume-and-confirm framework - users can see
 * exactly what will be deployed before giving approval, building trust and
 * preventing surprises.
 *
 * @param {string} toolName - Name of the tool being executed (e.g., 'deployApplication')
 * @param {Record<string, any>} assumptions - Complete parameters including user input + smart defaults
 * @returns {string} Formatted confirmation message with YAML manifest preview
 *
 * @example
 * ```typescript
 * const message = generateDeploymentConfirmationMessage('deployApplication', {
 *   resourceName: 'nginx-app',
 *   containerImage: 'nginx:latest',
 *   namespace: 'default',
 *   replicas: 1,
 *   port: 80,
 *   resources: { cpu: '100m', memory: '128Mi' }
 * });
 *
 * // Returns:
 * // "Ready to deploy nginx-app with the following configuration:
 * //
 * // 📋 **Deployment Settings:**
 * // • Name: nginx-app
 * // • Image: nginx:latest
 * // • Namespace: default
 * // • Replicas: 1
 * // • Port: 80
 * // • CPU: 100m
 * // • Memory: 128Mi
 * //
 * // 📄 **Kubernetes Manifest Preview:**
 * // ```yaml
 * // apiVersion: apps/v1
 * // kind: Deployment
 * // ... (complete YAML)
 * // ```"
 * ```
 */
export const generateDeploymentConfirmationMessage = (
  toolName: string,
  assumptions: Record<string, any>
): string => {
  const { appName, resourceName, containerImage, image, namespace, replicas, port, resources } = assumptions;
  const finalImage = containerImage || image;

  // Generate a preview of the Kubernetes manifest that will be created
  const manifestPreview = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${resourceName || appName}
  namespace: ${namespace}
  labels:
    app: ${resourceName || appName}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${resourceName || appName}
  template:
    metadata:
      labels:
        app: ${resourceName || appName}
    spec:
      containers:
      - name: ${resourceName || appName}
        image: ${finalImage}
        ports:
        - containerPort: ${port}
        resources:
          requests:
            cpu: ${resources.cpu}
            memory: ${resources.memory}
---
apiVersion: v1
kind: Service
metadata:
  name: ${resourceName || appName}
  namespace: ${namespace}
spec:
  selector:
    app: ${resourceName || appName}
  ports:
  - port: ${port}
    targetPort: ${port}
  type: ClusterIP`;

  return `Ready to deploy ${resourceName || appName} with the following configuration:

📋 **Deployment Settings:**
• Name: ${resourceName || appName}
• Image: ${finalImage}
• Namespace: ${namespace}
• Replicas: ${replicas}
• Port: ${port}
• CPU: ${resources.cpu}
• Memory: ${resources.memory}

📄 **Kubernetes Manifest Preview:**
\`\`\`yaml${manifestPreview}
\`\`\`

This will create a Deployment and Service in your Kubernetes cluster.`;
};