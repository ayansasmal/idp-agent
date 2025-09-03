/**
 * End-to-End AI Workflow Integration Tests
 * 
 * Tests the complete AI workflow from action creation through distributed tracking
 * to worker execution and completion validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActionManager } from '../services/ActionManager';
import { WorkerManager } from '../workers/WorkerManager';
import { InfrastructureWorker } from '../workers/InfrastructureWorker';
import { ActionStatus, ActionType, ActionIntent, AgentName, ActionRecord } from '../types/ActionTypes';

// Mock AWS SDK
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({
      send: vi.fn()
    }))
  },
  PutCommand: vi.fn(),
  GetCommand: vi.fn(),
  UpdateCommand: vi.fn(),
  ScanCommand: vi.fn(),
  QueryCommand: vi.fn()
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({}))
}));

describe('AI Workflow Integration Tests', () => {
  let actionManager: ActionManager;
  let workerManager: WorkerManager;
  let mockDynamoDBClient: any;

  beforeEach(async () => {
    // Setup mock DynamoDB responses
    mockDynamoDBClient = {
      send: vi.fn()
    };

    // Initialize Action Manager with mock config
    actionManager = new ActionManager({
      dynamoDbClient: mockDynamoDBClient,
      tableName: 'test-actions-table',
      ttlDays: 30
    });
    
    workerManager = new WorkerManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('AI Kubectl Command Generation Workflow', () => {
    it('should complete full AI kubectl command generation workflow', async () => {
      const testActionId = 'test-ai-kubectl-001';
      const testUserId = 'test-user';
      const testIntent = 'show me all pods in production namespace';

      // Step 1: Create AI action record
      const actionRecord: ActionRecord = {
        actionId: testActionId,
        userId: testUserId,
        conversationId: 'test-conversation',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'generateKubectlCommand',
        intent: ActionIntent.AI_GENERATE,
        status: ActionStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executionMetadata: {
          toolParameters: {
            intent: testIntent,
            namespace: 'production',
            includeClusterContext: true
          },
          timeout: 120000,
          retryCount: 0,
          estimatedDuration: 15000
        }
      };

      // Mock DynamoDB operations
      mockDynamoDBClient.send
        .mockResolvedValueOnce({ Item: null }) // Initial get (not found)
        .mockResolvedValueOnce({}) // Put action record
        .mockResolvedValueOnce({ Item: actionRecord }) // Get action record
        .mockResolvedValueOnce({}) // Update to RUNNING
        .mockResolvedValueOnce({}) // Update to COMPLETED
        .mockResolvedValueOnce({ 
          Item: {
            ...actionRecord,
            status: ActionStatus.COMPLETED,
            result: {
              success: true,
              command: 'kubectl get pods -n production',
              explanation: 'List all pods in production namespace',
              riskLevel: 'low',
              confidence: 0.95
            }
          }
        }); // Final get

      // Step 2: Create action via Action Manager
      const createResult = await actionManager.createAction(
        testUserId,
        'test-conversation',
        AgentName.INFRASTRUCTURE,
        'generateKubectlCommand',
        ActionIntent.AI_GENERATE,
        {
          intent: testIntent,
          namespace: 'production',
          includeClusterContext: true
        }
      );

      expect(createResult.success).toBe(true);
      expect(createResult.actionId).toBe(testActionId);

      // Step 3: Execute action via Worker
      const infrastructureWorker = new InfrastructureWorker(actionRecord);
      
      // Execute the AI tool
      const executionResult = await (infrastructureWorker as any).executeTool();

      expect(executionResult.success).toBe(true);
      expect(executionResult.data.command).toBe('kubectl get pods -n production');
      expect(executionResult.data.explanation).toContain('production namespace');
      expect(executionResult.data.riskLevel).toBe('low');
      expect(executionResult.data.confidence).toBeGreaterThan(0.9);
      expect(executionResult.message).toContain('AI generated kubectl command');

      // Step 4: Validate completion
      const validationResult = await (infrastructureWorker as any).checkCompletion();

      expect(validationResult.isComplete).toBe(true);
      expect(validationResult.progress).toBe(100);
      expect(validationResult.status).toBe(ActionStatus.COMPLETED);
      expect(validationResult.message).toBe('AI generation completed');

      console.log('✅ AI Kubectl Command Generation Workflow Test Passed');
    }, 30000); // 30 second timeout

    it('should handle AI kubectl command generation with high-risk operations', async () => {
      const testActionId = 'test-ai-kubectl-002';
      const dangerousIntent = 'delete all pods in production';

      const actionRecord: ActionRecord = {
        actionId: testActionId,
        userId: 'test-user',
        conversationId: 'test-conversation',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'generateKubectlCommand',
        intent: ActionIntent.AI_GENERATE,
        status: ActionStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executionMetadata: {
          toolParameters: {
            intent: dangerousIntent,
            namespace: 'production'
          },
          timeout: 120000,
          retryCount: 0
        }
      };

      const infrastructureWorker = new InfrastructureWorker(actionRecord);
      const executionResult = await (infrastructureWorker as any).executeTool();

      expect(executionResult.success).toBe(true);
      expect(executionResult.data.riskLevel).toBe('high');
      expect(executionResult.data.warnings).toBeDefined();
      expect(executionResult.data.warnings.length).toBeGreaterThan(0);
      expect(executionResult.data.confidence).toBeLessThan(0.9); // Lower confidence for dangerous ops

      console.log('⚠️  High-Risk AI Command Detection Test Passed');
    });
  });

  describe('AI Kubernetes Manifest Generation Workflow', () => {
    it('should complete full AI manifest generation workflow', async () => {
      const testActionId = 'test-ai-manifest-001';
      const testIntent = 'create a nginx deployment with 3 replicas and resource limits';

      const actionRecord: ActionRecord = {
        actionId: testActionId,
        userId: 'test-user',
        conversationId: 'test-conversation',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'generateKubernetesManifest',
        intent: ActionIntent.AI_GENERATE,
        status: ActionStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executionMetadata: {
          toolParameters: {
            intent: testIntent,
            resourceType: 'Deployment',
            appName: 'nginx-app',
            namespace: 'default',
            parameters: {
              replicas: 3,
              image: 'nginx:1.21',
              resources: {
                limits: { cpu: '500m', memory: '512Mi' },
                requests: { cpu: '250m', memory: '256Mi' }
              }
            }
          },
          timeout: 300000,
          retryCount: 0
        }
      };

      const infrastructureWorker = new InfrastructureWorker(actionRecord);
      const executionResult = await (infrastructureWorker as any).executeTool();

      expect(executionResult.success).toBe(true);
      expect(executionResult.data.manifest).toContain('apiVersion: apps/v1');
      expect(executionResult.data.manifest).toContain('kind: Deployment');
      expect(executionResult.data.manifest).toContain('nginx-app');
      expect(executionResult.data.metadata.kind).toBe('Deployment');
      expect(executionResult.data.metadata.name).toBe('nginx-app');
      expect(executionResult.data.isValid).toBe(true);
      expect(executionResult.data.recommendations).toBeDefined();
      expect(executionResult.resourcesCreated).toContain('deployment/nginx-app');

      console.log('📄 AI Manifest Generation Workflow Test Passed');
    }, 30000);

    it('should handle unsupported resource types gracefully', async () => {
      const testActionId = 'test-ai-manifest-002';
      const invalidIntent = 'create a custom resource that does not exist';

      const actionRecord: ActionRecord = {
        actionId: testActionId,
        userId: 'test-user',
        conversationId: 'test-conversation',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'generateKubernetesManifest',
        intent: ActionIntent.AI_GENERATE,
        status: ActionStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executionMetadata: {
          toolParameters: {
            intent: invalidIntent,
            resourceType: 'UnsupportedResource',
            appName: 'test-app',
            namespace: 'default'
          },
          timeout: 300000,
          retryCount: 0
        }
      };

      const infrastructureWorker = new InfrastructureWorker(actionRecord);
      const executionResult = await (infrastructureWorker as any).executeTool();

      expect(executionResult.success).toBe(false);
      expect(executionResult.data.isValid).toBe(false);
      expect(executionResult.data.validationErrors).toBeDefined();
      expect(executionResult.data.validationErrors.length).toBeGreaterThan(0);
      expect(executionResult.resourcesCreated).toEqual([]);

      console.log('❌ Unsupported Resource Type Handling Test Passed');
    });
  });

  describe('Worker Manager AI Integration', () => {
    it('should manage multiple AI workers concurrently', async () => {
      const workerPromises: Promise<any>[] = [];
      const testActionIds = ['ai-test-001', 'ai-test-002', 'ai-test-003'];

      // Create multiple AI action records
      const aiActionRecords: ActionRecord[] = testActionIds.map((actionId, index) => ({
        actionId,
        userId: 'test-user',
        conversationId: 'test-conversation',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: index % 2 === 0 ? 'generateKubectlCommand' : 'generateKubernetesManifest',
        intent: ActionIntent.AI_GENERATE,
        status: ActionStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executionMetadata: {
          toolParameters: index % 2 === 0 ? {
            intent: `get pods for test ${index}`,
            namespace: 'default'
          } : {
            intent: `create deployment for app-${index}`,
            resourceType: 'Deployment',
            appName: `app-${index}`,
            namespace: 'default'
          },
          timeout: 120000,
          retryCount: 0
        }
      }));

      // Execute all workers concurrently
      for (const actionRecord of aiActionRecords) {
        const worker = new InfrastructureWorker(actionRecord);
        workerPromises.push((worker as any).executeTool());
      }

      // Wait for all workers to complete
      const results = await Promise.all(workerPromises);

      // Validate all results
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.executionTime).toBeGreaterThan(0);
        
        if (testActionIds[index].includes('001') || testActionIds[index].includes('003')) {
          // kubectl command generation
          expect(result.data.command).toBeDefined();
          expect(result.data.riskLevel).toBeDefined();
          expect(result.data.confidence).toBeGreaterThan(0);
        } else {
          // manifest generation
          expect(result.data.manifest).toBeDefined();
          expect(result.data.metadata).toBeDefined();
          expect(result.data.isValid).toBe(true);
        }
      });

      console.log(`🔄 Concurrent AI Workers Test Passed (${results.length} workers)`);
    }, 45000);
  });

  describe('Error Handling and Retry Logic', () => {
    it('should handle AI service unavailable errors', async () => {
      const testActionId = 'test-ai-error-001';

      const actionRecord: ActionRecord = {
        actionId: testActionId,
        userId: 'test-user',
        conversationId: 'test-conversation',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'generateKubectlCommand',
        intent: ActionIntent.AI_GENERATE,
        status: ActionStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executionMetadata: {
          toolParameters: {
            intent: 'trigger ai service error',
            namespace: 'error-test'
          },
          timeout: 120000,
          retryCount: 0
        }
      };

      // Mock the worker to simulate AI service failure
      const infrastructureWorker = new InfrastructureWorker(actionRecord);
      
      // Override the mock AI generation to simulate failure
      const originalMock = (infrastructureWorker as any).mockAIKubectlGeneration;
      (infrastructureWorker as any).mockAIKubectlGeneration = () => {
        throw new Error('AI service unavailable');
      };

      try {
        await (infrastructureWorker as any).executeTool();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('AI kubectl generation failed');
        expect(error.message).toContain('AI service unavailable');
      }

      // Restore original mock
      (infrastructureWorker as any).mockAIKubectlGeneration = originalMock;

      console.log('🔄 AI Service Error Handling Test Passed');
    });
  });

  describe('Performance and Timing', () => {
    it('should complete AI operations within expected time bounds', async () => {
      const testActionId = 'test-ai-performance-001';

      const actionRecord: ActionRecord = {
        actionId: testActionId,
        userId: 'test-user',
        conversationId: 'test-conversation',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'generateKubectlCommand',
        intent: ActionIntent.AI_GENERATE,
        status: ActionStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executionMetadata: {
          toolParameters: {
            intent: 'get all services in kube-system',
            namespace: 'kube-system'
          },
          timeout: 120000,
          retryCount: 0
        }
      };

      const startTime = Date.now();
      const infrastructureWorker = new InfrastructureWorker(actionRecord);
      const executionResult = await (infrastructureWorker as any).executeTool();
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      
      expect(executionResult.success).toBe(true);
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds (mocked)
      expect(executionResult.executionTime).toBeGreaterThan(1000); // Minimum processing time
      expect(executionResult.data.aiProcessingTime).toBeDefined();

      console.log(`⏱️  AI Performance Test Passed (${totalTime}ms total, ${executionResult.executionTime}ms AI processing)`);
    });
  });
});

/**
 * Integration Test Utilities
 */
export class AIWorkflowTestUtils {
  
  /**
   * Create test action record for AI kubectl command
   */
  static createKubectlActionRecord(
    actionId: string,
    intent: string,
    namespace?: string
  ): ActionRecord {
    return {
      actionId,
      userId: 'test-user',
      conversationId: 'test-conversation',
      agentName: AgentName.INFRASTRUCTURE,
      toolName: 'generateKubectlCommand',
      intent: ActionIntent.AI_GENERATE,
      status: ActionStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executionMetadata: {
        toolParameters: {
          intent,
          namespace,
          includeClusterContext: true
        },
        timeout: 120000,
        retryCount: 0
      }
    };
  }

  /**
   * Create test action record for AI manifest generation
   */
  static createManifestActionRecord(
    actionId: string,
    intent: string,
    resourceType: string,
    appName: string
  ): ActionRecord {
    return {
      actionId,
      userId: 'test-user',
      conversationId: 'test-conversation',
      agentName: AgentName.INFRASTRUCTURE,
      toolName: 'generateKubernetesManifest',
      intent: ActionIntent.AI_GENERATE,
      status: ActionStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executionMetadata: {
        toolParameters: {
          intent,
          resourceType,
          appName,
          namespace: 'default'
        },
        timeout: 300000,
        retryCount: 0
      }
    };
  }

  /**
   * Validate AI kubectl command result
   */
  static validateKubectlResult(result: any): void {
    expect(result.success).toBe(true);
    expect(result.data.command).toBeDefined();
    expect(result.data.explanation).toBeDefined();
    expect(result.data.riskLevel).toMatch(/^(low|medium|high)$/);
    expect(result.data.confidence).toBeGreaterThan(0);
    expect(result.data.confidence).toBeLessThanOrEqual(1);
    expect(result.data.intent).toBeDefined();
    expect(result.data.aiProcessingTime).toBeGreaterThan(0);
    expect(result.executionTime).toBeGreaterThan(0);
    expect(result.resourcesCreated).toEqual([]);
  }

  /**
   * Validate AI manifest generation result
   */
  static validateManifestResult(result: any): void {
    expect(result.success).toBe(true);
    expect(result.data.manifest).toBeDefined();
    expect(result.data.metadata).toBeDefined();
    expect(result.data.metadata.kind).toBeDefined();
    expect(result.data.metadata.name).toBeDefined();
    expect(result.data.isValid).toBe(true);
    expect(result.data.aiProcessingTime).toBeGreaterThan(0);
    expect(result.executionTime).toBeGreaterThan(0);
    if (result.data.isValid) {
      expect(result.resourcesCreated.length).toBeGreaterThan(0);
    }
  }
}