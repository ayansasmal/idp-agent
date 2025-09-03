import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KubernetesAI } from './KubernetesAI';

// Mock Ollama
const mockOllamaInstance = {
  generate: vi.fn(),
  list: vi.fn(),
};

vi.mock('ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => mockOllamaInstance),
}));

describe('KubernetesAI', () => {
  let kubernetesAI: KubernetesAI;
  let mockOllama: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    kubernetesAI = new KubernetesAI({
      ollamaUrl: 'http://localhost:11434',
      modelName: 'hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf:latest',
      temperature: 0.1,
    });
  });

  describe('generateKubectlCommand', () => {
    it('should generate kubectl command from natural language intent', async () => {
      const mockResponse = {
        response: JSON.stringify({
          command: 'kubectl get pods -n default',
          explanation: 'Lists all pods in the default namespace',
          riskLevel: 'low',
          confidence: 0.95,
        }),
      };

      mockOllamaInstance.generate.mockResolvedValue(mockResponse);

      const result = await kubernetesAI.generateKubectlCommand({
        intent: 'show me all pods in default namespace',
        namespace: 'default',
      });

      expect(result.command).toBe('kubectl get pods -n default');
      expect(result.explanation).toBe('Lists all pods in the default namespace');
      expect(result.riskLevel).toBe('low');
      expect(result.confidence).toBe(0.95);
    });

    it('should handle parsing errors gracefully', async () => {
      const mockResponse = {
        response: 'Invalid JSON response from model',
      };

      mockOllamaInstance.generate.mockResolvedValue(mockResponse);

      const result = await kubernetesAI.generateKubectlCommand({
        intent: 'show me all pods',
      });

      expect(result.command).toBe('Invalid JSON response from model');
      expect(result.riskLevel).toBe('medium');
      expect(result.confidence).toBe(0.3);
    });

    it('should include cluster context in prompt when provided', async () => {
      const mockResponse = {
        response: JSON.stringify({
          command: 'kubectl get pods -n production',
          explanation: 'Lists pods in production namespace',
          riskLevel: 'low',
          confidence: 0.9,
        }),
      };

      mockOllamaInstance.generate.mockResolvedValue(mockResponse);

      await kubernetesAI.generateKubectlCommand({
        intent: 'show pods in production',
        namespace: 'production',
        clusterContext: {
          nodes: ['node1', 'node2'],
          deployments: ['app1', 'app2'],
          services: ['svc1'],
          pods: ['pod1', 'pod2'],
        },
      });

      expect(mockOllamaInstance.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf:latest',
          prompt: expect.stringContaining('Cluster Context:'),
        })
      );
    });
  });

  describe('generateManifest', () => {
    it('should generate Kubernetes YAML manifest', async () => {
      const mockResponse = {
        response: `---YAML-START---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-app
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx-app
  template:
    metadata:
      labels:
        app: nginx-app
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80
---YAML-END---

---METADATA-START---
{
  "kind": "Deployment",
  "name": "nginx-app",
  "namespace": "default",
  "isValid": true,
  "validationErrors": [],
  "recommendations": ["Consider adding resource limits"]
}
---METADATA-END---`,
      };

      mockOllamaInstance.generate.mockResolvedValue(mockResponse);

      const result = await kubernetesAI.generateManifest({
        intent: 'create nginx deployment with 3 replicas',
        resourceType: 'Deployment',
        appName: 'nginx-app',
        namespace: 'default',
      });

      expect(result.manifest).toContain('apiVersion: apps/v1');
      expect(result.manifest).toContain('kind: Deployment');
      expect(result.manifest).toContain('name: nginx-app');
      expect(result.metadata.kind).toBe('Deployment');
      expect(result.metadata.name).toBe('nginx-app');
      expect(result.isValid).toBe(true);
      expect(result.recommendations).toContain('Consider adding resource limits');
    });

    it('should handle invalid manifest responses', async () => {
      const mockResponse = {
        response: 'Invalid response without proper markers',
      };

      mockOllamaInstance.generate.mockResolvedValue(mockResponse);

      const result = await kubernetesAI.generateManifest({
        intent: 'create deployment',
        resourceType: 'Deployment',
        appName: 'test-app',
      });

      expect(result.manifest).toBe('');
      expect(result.isValid).toBe(false);
      expect(result.validationErrors).toContain('Failed to parse AI response');
    });
  });

  describe('validateService', () => {
    it('should return true when model exists', async () => {
      mockOllamaInstance.list.mockResolvedValue({
        models: [
          { name: 'hf.co/K8sAIOps/kubernetes_operator_3b_peft_gguf:latest' },
        ],
      });

      const result = await kubernetesAI.validateService();

      expect(result).toBe(true);
    });

    it('should return false when model does not exist', async () => {
      mockOllamaInstance.list.mockResolvedValue({
        models: [{ name: 'other-model' }],
      });

      const result = await kubernetesAI.validateService();

      expect(result).toBe(false);
    });

    it('should return false on service error', async () => {
      mockOllamaInstance.list.mockRejectedValue(new Error('Connection failed'));

      const result = await kubernetesAI.validateService();

      expect(result).toBe(false);
    });
  });
});