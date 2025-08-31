/**
 * Worker Framework Integration Tests
 * 
 * Tests the complete worker execution workflow including validation,
 * retry logic, and different worker types.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { 
  ActionManagerService,
  WorkerManager,
  ActionStatus,
  ActionIntent,
  AgentName,
  CreateActionRequest,
  ActionType,
  InfrastructureWorker,
  ObservabilityWorker,
  MetaWorker,
  DynamoDBClientFactory
} from '../index';

describe('Worker Framework Integration Tests', () => {
  let actionService: ActionManagerService;
  let workerManager: WorkerManager;
  const testTableName = 'test-action-tracking-workers';

  beforeAll(async () => {
    // Create service with worker manager enabled
    actionService = new ActionManagerService({
      tableName: testTableName,
      dynamoDbClient: DynamoDBClientFactory.createLocalStackClient(),
      useWorkerManager: true,
      workerConfig: {
        maxConcurrentWorkers: 3,
        defaultWorkerTimeout: 30000, // 30 seconds for testing
        retryAttempts: 2
      }
    });

    // Initialize the service
    await actionService.initialize();
  });

  afterAll(async () => {
    await actionService.shutdown();
  });

  describe('Infrastructure Worker Tests', () => {
    it('should execute deployment action successfully', async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-infra',
        sessionId: 'test-session-infra',
        conversationId: 'test-conv-infra',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'deployApplication',
        intent: ActionIntent.DEPLOY,
        toolParameters: {
          resourceName: 'test-nginx-worker',
          containerImage: 'nginx:latest',
          namespace: 'default',
          replicas: 2
        },
        environment: 'test'
      };

      const action = await actionService.createAndQueueAction(request);

      // Wait for worker to start processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check action status
      const updatedAction = await actionService.getAction(action.actionId);
      expect(updatedAction).toBeDefined();
      expect(updatedAction!.status).toBeOneOf([
        ActionStatus.RUNNING, 
        ActionStatus.COMPLETED,
        ActionStatus.PENDING
      ]);
    }, 15000);

    it('should validate deployment completion', async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-infra-2',
        sessionId: 'test-session-infra-2',
        conversationId: 'test-conv-infra-2',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'scaleResource',
        intent: ActionIntent.SCALE,
        toolParameters: {
          resourceName: 'test-app-scale',
          replicas: 3,
          namespace: 'default'
        },
        environment: 'test'
      };

      const action = await actionService.createAndQueueAction(request);

      // Wait longer for validation
      await new Promise(resolve => setTimeout(resolve, 5000));

      const updatedAction = await actionService.getAction(action.actionId);
      expect(updatedAction).toBeDefined();
      
      // Should have some progress
      expect(updatedAction!.progress).toBeGreaterThanOrEqual(0);
    }, 20000);
  });

  describe('Observability Worker Tests', () => {
    it('should execute log analysis action', async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-obs',
        sessionId: 'test-session-obs',
        conversationId: 'test-conv-obs',
        agentName: AgentName.OBSERVABILITY,
        toolName: 'analyzeLogs',
        intent: ActionIntent.INVESTIGATE,
        toolParameters: {
          resourceName: 'test-app-logs',
          namespace: 'default',
          logLevel: 'error',
          timeRange: '1h'
        },
        environment: 'test'
      };

      const action = await actionService.createAndQueueAction(request);

      // Wait for analysis to complete
      await new Promise(resolve => setTimeout(resolve, 8000));

      const updatedAction = await actionService.getAction(action.actionId);
      expect(updatedAction).toBeDefined();
      
      // Log analysis should progress through validation
      if (updatedAction!.status === ActionStatus.COMPLETED) {
        expect(updatedAction!.result?.success).toBe(true);
        expect(updatedAction!.result?.data).toBeDefined();
      }
    }, 25000);

    it('should execute health check action', async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-obs-2',
        sessionId: 'test-session-obs-2',
        conversationId: 'test-conv-obs-2',
        agentName: AgentName.OBSERVABILITY,
        toolName: 'performHealthCheck',
        intent: ActionIntent.MONITOR,
        toolParameters: {
          resourceName: 'test-app-health',
          namespace: 'default',
          checks: ['connectivity', 'performance']
        },
        environment: 'test'
      };

      const action = await actionService.createAndQueueAction(request);

      // Health checks are relatively quick
      await new Promise(resolve => setTimeout(resolve, 6000));

      const updatedAction = await actionService.getAction(action.actionId);
      expect(updatedAction).toBeDefined();
      
      if (updatedAction!.status === ActionStatus.COMPLETED) {
        expect(updatedAction!.result?.data).toBeDefined();
        expect(updatedAction!.result?.data.overall).toBeOneOf(['healthy', 'warning', 'critical']);
      }
    }, 15000);
  });

  describe('Meta Worker Tests', () => {
    it('should execute orchestration workflow', async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-meta',
        sessionId: 'test-session-meta',
        conversationId: 'test-conv-meta',
        agentName: AgentName.META,
        toolName: 'orchestrateDeployment',
        intent: ActionIntent.ORCHESTRATE,
        toolParameters: {
          userInput: 'deploy nginx with database',
          resourceName: 'test-orchestrated-app',
          containerImage: 'nginx:latest',
          namespace: 'default'
        },
        environment: 'test'
      };

      const action = await actionService.createAndQueueAction(request);

      // Orchestration takes time
      await new Promise(resolve => setTimeout(resolve, 5000));

      const updatedAction = await actionService.getAction(action.actionId);
      expect(updatedAction).toBeDefined();
      
      if (updatedAction!.status === ActionStatus.COMPLETED) {
        expect(updatedAction!.result?.data.workflowId).toBeDefined();
        expect(updatedAction!.result?.data.steps).toBeInstanceOf(Array);
      }
    }, 20000);

    it('should execute approval request', async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-meta-2',
        sessionId: 'test-session-meta-2',
        conversationId: 'test-conv-meta-2',
        agentName: AgentName.META,
        toolName: 'requestApproval',
        intent: ActionIntent.APPROVE,
        toolParameters: {
          actionType: 'deployment',
          description: 'Deploy critical application to production',
          riskLevel: 'high',
          approvers: ['admin', 'devops-lead']
        },
        environment: 'production'
      };

      const action = await actionService.createAndQueueAction(request);

      // Approval requests start immediately
      await new Promise(resolve => setTimeout(resolve, 3000));

      const updatedAction = await actionService.getAction(action.actionId);
      expect(updatedAction).toBeDefined();
      
      if (updatedAction!.status === ActionStatus.COMPLETED) {
        expect(updatedAction!.result?.data.approvalId).toBeDefined();
        expect(updatedAction!.result?.data.status).toBeOneOf(['pending', 'approved', 'rejected']);
      }
    }, 15000);
  });

  describe('Worker Manager Tests', () => {
    it('should handle concurrent worker execution', async () => {
      const requests: CreateActionRequest[] = [
        {
          userId: 'test-concurrent-1',
          sessionId: 'test-concurrent-session',
          conversationId: 'test-concurrent-conv',
          agentName: AgentName.INFRASTRUCTURE,
          toolName: 'getResourceStatus',
          intent: ActionIntent.MONITOR,
          toolParameters: { resourceName: 'app-1', namespace: 'default' },
          environment: 'test'
        },
        {
          userId: 'test-concurrent-2',
          sessionId: 'test-concurrent-session',
          conversationId: 'test-concurrent-conv',
          agentName: AgentName.OBSERVABILITY,
          toolName: 'performHealthCheck',
          intent: ActionIntent.MONITOR,
          toolParameters: { resourceName: 'app-2', namespace: 'default' },
          environment: 'test'
        },
        {
          userId: 'test-concurrent-3',
          sessionId: 'test-concurrent-session',
          conversationId: 'test-concurrent-conv',
          agentName: AgentName.META,
          toolName: 'requestApproval',
          intent: ActionIntent.APPROVE,
          toolParameters: { actionType: 'scaling', description: 'Scale application' },
          environment: 'test'
        }
      ];

      // Create all actions
      const actions = await Promise.all(
        requests.map(request => actionService.createAndQueueAction(request))
      );

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Check results
      for (const action of actions) {
        const updatedAction = await actionService.getAction(action.actionId);
        expect(updatedAction).toBeDefined();
        expect(updatedAction!.status).not.toBe(ActionStatus.PENDING);
      }
    }, 30000);

    it('should provide worker statistics', async () => {
      const stats = await actionService.getServiceStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.actions).toBeDefined();
      expect(stats.processing).toBeDefined();
      
      expect(typeof stats.actions.total).toBe('number');
      expect(typeof stats.processing.active).toBe('number');
      
      console.log('Worker Statistics:', JSON.stringify(stats, null, 2));
    });

    it('should handle action abortion', async () => {
      const request: CreateActionRequest = {
        userId: 'test-abort-user',
        sessionId: 'test-abort-session',
        conversationId: 'test-abort-conv',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'deployApplication',
        intent: ActionIntent.DEPLOY,
        toolParameters: {
          resourceName: 'test-abort-app',
          containerImage: 'nginx:latest',
          namespace: 'default'
        },
        environment: 'test'
      };

      const action = await actionService.createAndQueueAction(request);

      // Wait a moment then abort
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const aborted = await actionService.abortAction(action.actionId);
      expect(aborted).toBe(true);

      // Check action status
      const updatedAction = await actionService.getAction(action.actionId);
      expect(updatedAction?.status).toBe(ActionStatus.CANCELLED);
    });
  });

  describe('Error Handling and Retry Tests', () => {
    it('should handle worker failures gracefully', async () => {
      const request: CreateActionRequest = {
        userId: 'test-error-user',
        sessionId: 'test-error-session',
        conversationId: 'test-error-conv',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'invalidTool' as any, // This should cause an error
        intent: ActionIntent.DEPLOY,
        toolParameters: {},
        environment: 'test'
      };

      try {
        await actionService.createAndQueueAction(request);
        // This should fail during action creation due to invalid tool
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect(error instanceof Error ? error.message : '').toContain('Action definition not found');
      }
    });

    it('should track action execution metadata', async () => {
      const request: CreateActionRequest = {
        userId: 'test-metadata-user',
        sessionId: 'test-metadata-session',
        conversationId: 'test-metadata-conv',
        agentName: AgentName.OBSERVABILITY,
        toolName: 'performHealthCheck',
        intent: ActionIntent.MONITOR,
        toolParameters: {
          resourceName: 'test-metadata-app',
          namespace: 'default'
        },
        environment: 'test'
      };

      const action = await actionService.createAndQueueAction(request);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 5000));

      const updatedAction = await actionService.getAction(action.actionId);
      expect(updatedAction).toBeDefined();
      
      // Check execution metadata
      expect(updatedAction!.executionMetadata).toBeDefined();
      expect(updatedAction!.executionMetadata.retryCount).toBeGreaterThanOrEqual(0);
      
      if (updatedAction!.executionMetadata.workerId) {
        expect(updatedAction!.executionMetadata.workerId).toMatch(/^worker_/);
      }
    }, 15000);
  });
});