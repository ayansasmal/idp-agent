# 🤖 AI-Powered Kubernetes Operations

This document describes the AI integration in the Infrastructure Agent using the Kubernetes Operator 3B model from Hugging Face.

## Overview

The Infrastructure Agent now includes AI-powered capabilities that can:
- Generate kubectl commands from natural language
- Create Kubernetes YAML manifests from descriptions
- Provide risk assessment and confidence scoring
- Include contextual cluster information

## Model Information

**Model**: `K8sAIOps/kubernetes_operator_3b_peft_gguf`
- **Source**: [Hugging Face K8sAIOps](https://huggingface.co/K8sAIOps/kubernetes_operator_3b_peft_gguf)
- **Type**: 3B parameter Llama-3.2-3B-Instruct with PEFT fine-tuning
- **Training**: ~1,500 Kubernetes operations scenarios
- **Format**: GGUF (compatible with Ollama)
- **Size**: ~3.4GB

## Setup Instructions

### 1. Prerequisites

```bash
# Ensure Ollama is running
curl http://localhost:11434/api/tags

# Pull the Kubernetes Operator model
curl -X POST http://localhost:11434/api/pull -d '{"name": "hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf"}'
```

### 2. Configuration

Enable AI features in your Infrastructure Agent configuration:

```typescript
const agent = new InfrastructureAgent({
  agentId: 'infrastructure-ai',
  name: 'AI Infrastructure Agent',
  kubernetesAI: {
    ollamaUrl: 'http://localhost:11434',
    modelName: 'hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf:latest',
    temperature: 0.1,        // Low temperature for consistent outputs
    timeout: 30000           // 30 second timeout
  }
});
```

## New AI-Powered Tools

### 1. generateKubectlCommand

Generate kubectl commands from natural language descriptions.

```typescript
const result = await agent.generateKubectlCommand({
  intent: 'show me all running pods in the production namespace',
  namespace: 'production',
  includeClusterContext: true,
  context: conversationContext
});

// Output:
// {
//   command: 'kubectl get pods -n production',
//   explanation: 'List all running pods in the production namespace',
//   riskLevel: 'low',
//   confidence: 0.95,
//   warnings: []
// }
```

**Parameters:**
- `intent`: Natural language description of desired kubectl operation
- `namespace`: Kubernetes namespace for context (optional)
- `includeClusterContext`: Include current cluster context in AI prompt (default: true)

**Response:**
- `command`: Generated kubectl command
- `explanation`: Human-readable explanation
- `riskLevel`: Risk assessment (low/medium/high)
- `confidence`: Confidence score (0.0-1.0)
- `warnings`: Safety warnings for potentially dangerous operations

### 2. generateKubernetesManifest

Generate Kubernetes YAML manifests from natural language descriptions.

```typescript
const result = await agent.generateKubernetesManifest({
  intent: 'create a nginx deployment with 3 replicas and resource limits',
  resourceType: 'Deployment',
  appName: 'nginx-demo',
  namespace: 'default',
  parameters: {
    replicas: 3,
    resources: { limits: { cpu: '500m', memory: '512Mi' } }
  },
  context: conversationContext
});

// Output:
// {
//   manifest: 'apiVersion: apps/v1\nkind: Deployment\n...',
//   metadata: { kind: 'Deployment', name: 'nginx-demo', namespace: 'default' },
//   isValid: true,
//   recommendations: ['Consider adding resource limits']
// }
```

**Parameters:**
- `intent`: Natural language description of desired resource
- `resourceType`: Kubernetes resource type (Deployment, Service, ConfigMap, etc.)
- `appName`: Application name for the resource
- `namespace`: Target namespace (default: 'default')
- `parameters`: Additional parameters for manifest generation

**Response:**
- `manifest`: Generated YAML manifest
- `metadata`: Resource metadata (kind, name, namespace)
- `isValid`: Validation status
- `validationErrors`: Validation errors if any
- `recommendations`: Best practice recommendations

## Example Usage

```typescript
import { InfrastructureAgent } from '@ai-idp/infrastructure-agent';

async function aiExample() {
  const agent = new InfrastructureAgent({
    agentId: 'ai-demo',
    name: 'AI Demo Agent',
    kubernetesAI: {
      ollamaUrl: 'http://localhost:11434',
      modelName: 'hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf:latest'
    }
  });

  await agent.initialize();

  // Generate kubectl command
  const cmdResult = await agent.generateKubectlCommand({
    intent: 'scale the nginx deployment to 5 replicas',
    context: { conversationId: 'demo', userId: 'user', timestamp: new Date().toISOString() }
  });

  console.log('Command:', cmdResult.command);
  console.log('Risk:', cmdResult.riskLevel);
  console.log('Confidence:', cmdResult.confidence);

  // Generate manifest
  const manifestResult = await agent.generateKubernetesManifest({
    intent: 'create a service to expose nginx on port 80',
    resourceType: 'Service',
    appName: 'nginx-service',
    context: { conversationId: 'demo', userId: 'user', timestamp: new Date().toISOString() }
  });

  console.log('Manifest:', manifestResult.manifest);
}
```

## Risk Assessment

The AI system provides automatic risk assessment for generated commands:

- **Low Risk**: Read-only operations (get, describe, logs)
- **Medium Risk**: Create/update operations (apply, create, patch)
- **High Risk**: Destructive operations (delete, scale down to 0)

## Best Practices

1. **Always review generated commands** before execution
2. **Pay attention to risk levels** and warnings
3. **Use low temperature (0.1)** for consistent outputs
4. **Include cluster context** for better results when possible
5. **Validate generated manifests** before applying to clusters

## Performance

- **Kubectl Command Generation**: ~500ms - 2s
- **Manifest Generation**: ~2s - 10s (depending on complexity)
- **Model Loading**: ~8s (first request only)

## Troubleshooting

### Model Not Found
```bash
# Check available models
curl -s http://localhost:11434/api/tags | jq .

# Pull the model if missing
curl -X POST http://localhost:11434/api/pull -d '{"name": "hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf"}'
```

### Ollama Connection Issues
```bash
# Check Ollama service
curl http://localhost:11434/api/tags

# Start Ollama if not running
ollama serve
```

### Slow Response Times
- Reduce model temperature (0.0 - 0.2)
- Disable cluster context for faster processing
- Use shorter, more specific prompts

## Integration with Meta-Agent

The AI-powered tools are automatically registered with the Meta-Agent via MCP protocol:

```json
{
  "tools": [
    {
      "name": "generateKubectlCommand",
      "description": "Generate kubectl commands from natural language using AI"
    },
    {
      "name": "generateKubernetesManifest", 
      "description": "Generate Kubernetes YAML manifests from natural language using AI"
    }
  ],
  "specializations": [
    "ai-powered-operations",
    "natural-language-to-kubectl",
    "manifest-generation"
  ]
}
```

Users can interact with these capabilities through natural language queries to the Meta-Agent:

- "Generate a kubectl command to show all failed pods"
- "Create a deployment manifest for a Redis instance with persistence"
- "Show me how to scale the API deployment to 10 replicas"

## Future Enhancements

1. **Command Execution**: Direct execution of generated kubectl commands
2. **Manifest Validation**: Schema validation against Kubernetes API
3. **Context Learning**: Learning from user feedback and corrections
4. **Multi-step Operations**: Complex operations requiring multiple commands
5. **Security Scanning**: Automated security analysis of generated resources