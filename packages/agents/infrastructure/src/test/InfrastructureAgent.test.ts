import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InfrastructureAgent, type InfrastructureAgentConfig } from '../agent/InfrastructureAgent';
import { pino } from 'pino';
import type { ConversationContext } from '@ai-idp/types';

// Mock the Kubernetes client
vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: vi.fn(() => ({
    loadFromDefault: vi.fn(),
    loadFromCluster: vi.fn(),
    loadFromString: vi.fn(),
    makeApiClient: vi.fn(() => ({
      listNamespace: vi.fn().mockResolvedValue({
        body: { items: [{ metadata: { name: 'default' } }] }
      }),
      createNamespacedDeployment: vi.fn().mockResolvedValue({ body: {} }),
      readNamespacedDeployment: vi.fn().mockResolvedValue({
        body: {
          spec: { replicas: 3 },
          status: { replicas: 3, readyReplicas: 3, availableReplicas: 3 }
        }
      }),
      listNamespacedPod: vi.fn().mockResolvedValue({
        body: {
          items: [{
            metadata: { name: 'test-pod', creationTimestamp: new Date().toISOString() },
            status: { phase: 'Running' },
            spec: { nodeName: 'test-node' }
          }]
        }
      })
    }))
  })),
  CoreV1Api: vi.fn(),
  AppsV1Api: vi.fn()
}));

describe('InfrastructureAgent', () => {
  let agent: InfrastructureAgent;
  let config: InfrastructureAgentConfig;
  let logger: any;
  let mockContext: ConversationContext;

  beforeEach(() => {
    logger = pino({ level: 'silent' }); // Silent logger for tests
    
    config = {
      agentId: 'test-infrastructure',
      name: 'Test Infrastructure Agent'
    };

    agent = new InfrastructureAgent(config, logger);

    mockContext = {
      conversationId: 'test-conversation',
      userId: 'test-user',
      sessionId: 'test-session',
      history: [],
      metadata: {}
    };
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(agent.initialize()).resolves.not.toThrow();
    });

    it('should return capabilities', () => {
      const capabilities = agent.getCapabilities();
      
      expect(capabilities.agentId).toBe('test-infrastructure');
      expect(capabilities.name).toBe('Test Infrastructure Agent');
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.tools.length).toBeGreaterThan(0);
      expect(capabilities.specializations).toContain('kubernetes');
    });
  });

  describe('deployApplication', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should deploy application successfully', async () => {
      const params = {
        resourceName: 'test-app',
        containerImage: 'nginx:latest',
        namespace: 'test-namespace',
        replicas: 2,
        port: 80,
        environment: 'development',
        context: mockContext
      };

      const result = await agent.deployApplication(params);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully deployed');
      expect(result.data).toBeDefined();
      expect(result.metadata.agent).toBe('infrastructure');
      expect(result.metadata.action).toBe('deployApplication');
    });

    it('should handle missing required parameters', async () => {
      const params = {
        resourceName: '',
        containerImage: '',
        context: mockContext
      };

      const result = await agent.deployApplication(params);

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
    });

    it('should include detailed response', async () => {
      const params = {
        resourceName: 'test-app',
        containerImage: 'nginx:latest',
        context: mockContext
      };

      const result = await agent.deployApplication(params);

      if (result.success) {
        expect(result.detailedResponse).toBeDefined();
        expect(result.detailedResponse).toContain('Deployment Successful');
      }
    });
  });

  describe('scaleResource', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should scale resource successfully', async () => {
      const params = {
        resourceName: 'test-app',
        replicas: 5,
        namespace: 'default',
        resourceType: 'deployment',
        context: mockContext
      };

      const result = await agent.scaleResource(params);

      expect(result.success).toBe(true);
      expect(result.message).toContain('scaled');
      expect(result.metadata.action).toBe('scaleResource');
    });

    it('should handle scaling to same replica count', async () => {
      // Mock to return current replicas = target replicas
      const params = {
        resourceName: 'test-app',
        replicas: 3, // Same as mocked current replicas
        namespace: 'default',
        resourceType: 'deployment',
        context: mockContext
      };

      const result = await agent.scaleResource(params);

      expect(result.success).toBe(true);
      expect(result.message).toContain('already has');
    });
  });

  describe('getResourceStatus', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should get resource status successfully', async () => {
      const params = {
        resourceName: 'test-app',
        namespace: 'default',
        resourceType: 'deployment',
        context: mockContext
      };

      const result = await agent.getResourceStatus(params);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Status retrieved');
      expect(result.data).toBeDefined();
      expect(result.metadata.action).toBe('getResourceStatus');
    });

    it('should include deployment and pod information', async () => {
      const params = {
        resourceName: 'test-app',
        namespace: 'default',
        resourceType: 'deployment',
        context: mockContext
      };

      const result = await agent.getResourceStatus(params);

      if (result.success) {
        expect(result.data.deployment).toBeDefined();
        expect(result.data.pods).toBeDefined();
        expect(result.data.deployment.replicas).toBeDefined();
      }
    });
  });

  describe('getResourceLogs', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should get resource logs successfully', async () => {
      const params = {
        resourceName: 'test-app',
        namespace: 'default',
        lines: 100,
        follow: false,
        context: mockContext
      };

      const result = await agent.getResourceLogs(params);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Retrieved logs');
      expect(result.metadata.action).toBe('getResourceLogs');
    });
  });

  describe('provisionDatabase', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should provision database successfully', async () => {
      const params = {
        databaseType: 'postgresql',
        name: 'test-db',
        size: 'small',
        environment: 'development',
        context: mockContext
      };

      const result = await agent.provisionDatabase(params);

      expect(result.success).toBe(true);
      expect(result.message).toContain('provisioned');
      expect(result.metadata.action).toBe('provisionDatabase');
    });

    it('should include connection details', async () => {
      const params = {
        databaseType: 'postgresql',
        name: 'test-db',
        size: 'medium',
        environment: 'staging',
        context: mockContext
      };

      const result = await agent.provisionDatabase(params);

      if (result.success) {
        expect(result.data.connectionDetails).toBeDefined();
        expect(result.data.connectionDetails.host).toBeDefined();
        expect(result.data.connectionDetails.port).toBeDefined();
      }
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    it('should return health status', async () => {
      const health = await agent.healthCheck();

      expect(health.healthy).toBeDefined();
      expect(health.details).toBeDefined();
      expect(health.details.kubernetes).toBeDefined();
      expect(health.details.cloud).toBeDefined();
      expect(health.details.initialized).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Create agent with invalid config to trigger error
      const invalidConfig = {
        agentId: 'test',
        name: 'Test',
        kubeconfig: 'invalid-config'
      };

      const invalidAgent = new InfrastructureAgent(invalidConfig, logger);

      // Should not throw during initialization
      await expect(invalidAgent.initialize()).resolves.not.toThrow();
    });

    it('should handle operation errors gracefully', async () => {
      await agent.initialize();

      // Test with invalid parameters that would cause errors
      const params = {
        resourceName: null as any,
        containerImage: null as any,
        context: mockContext
      };

      const result = await agent.deployApplication(params);

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
      expect(result.data.error).toBeDefined();
    });
  });

  describe('simulation mode', () => {
    it('should work in simulation mode without Kubernetes', async () => {
      // Agent should work even without real Kubernetes connection
      await agent.initialize();

      const params = {
        resourceName: 'simulated-app',
        containerImage: 'nginx:latest',
        context: mockContext
      };

      const result = await agent.deployApplication(params);

      // Should either succeed (if K8s available) or simulate
      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
    });
  });
});