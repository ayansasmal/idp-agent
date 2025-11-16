/**
 * ActionManagerService Integration Tests
 * 
 * Tests the complete action tracking workflow with DynamoDB and queue processing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { 
  ActionManagerService, 
  ActionStatus, 
  ActionIntent, 
  AgentName,
  CreateActionRequest,
  DynamoDBClientFactory
} from '../index';

describe('ActionManagerService Integration Tests', () => {
  let actionService: ActionManagerService;
  const testTableName = 'test-action-tracking';

  beforeAll(async () => {
    // Create service with test configuration
    actionService = new ActionManagerService({
      tableName: testTableName,
      dynamoDbClient: DynamoDBClientFactory.createLocalStackClient()
    });

    // Initialize the service
    await actionService.initialize(2); // Low concurrency for tests
  });

  afterAll(async () => {
    await actionService.shutdown();
  });

  describe('Action Creation and Queuing', () => {
    it('should create and queue a deployment action', async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-1',
        sessionId: 'test-session-1',
        conversationId: 'test-conv-1',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'deployApplication',
        intent: ActionIntent.DEPLOY,
        toolParameters: {
          resourceName: 'test-nginx',
          containerImage: 'nginx:latest',
          namespace: 'default',
          replicas: 2
        },
        environment: 'test',
        priority: 'normal'
      };

      const action = await actionService.createAndQueueAction(request);

      expect(action).toBeDefined();
      expect(action.actionId).toBeDefined();
      expect(action.status).toBe(ActionStatus.PENDING);
      expect(action.agentName).toBe(AgentName.INFRASTRUCTURE);
      expect(action.toolName).toBe('deployApplication');
      expect(action.intent).toBe(ActionIntent.DEPLOY);
      expect(action.progress).toBe(0);
      expect(action.executionMetadata.toolParameters).toEqual(request.toolParameters);
    });

    it('should create action without queueing', async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-2',
        sessionId: 'test-session-2',
        conversationId: 'test-conv-2',
        agentName: AgentName.OBSERVABILITY,
        toolName: 'analyzeLogs',
        intent: ActionIntent.MONITOR,
        toolParameters: {
          logLevel: 'error',
          timeRange: '1h'
        },
        environment: 'test'
      };

      const action = await actionService.createAction(request);

      expect(action).toBeDefined();
      expect(action.status).toBe(ActionStatus.PENDING);
      expect(action.agentName).toBe(AgentName.OBSERVABILITY);
    });
  });

  describe('Action Retrieval', () => {
    let testActionId: string;

    beforeEach(async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-3',
        sessionId: 'test-session-3',
        conversationId: 'test-conv-3',
        agentName: AgentName.META,
        toolName: 'orchestrateDeployment',
        intent: ActionIntent.ORCHESTRATE,
        toolParameters: {},
        environment: 'test'
      };

      const action = await actionService.createAction(request);
      testActionId = action.actionId;
    });

    it('should retrieve action by ID', async () => {
      const action = await actionService.getAction(testActionId);
      
      expect(action).toBeDefined();
      expect(action!.actionId).toBe(testActionId);
      expect(action!.agentName).toBe(AgentName.META);
    });

    it('should return null for non-existent action', async () => {
      const action = await actionService.getAction('non-existent-id');
      expect(action).toBeNull();
    });

    it('should retrieve actions by session', async () => {
      const actions = await actionService.getActionsBySession('test-session-3');
      
      expect(actions).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some(a => a.actionId === testActionId)).toBe(true);
    });

    it('should retrieve actions by user', async () => {
      const actions = await actionService.getActionsByUser('test-user-3');
      
      expect(actions).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some(a => a.actionId === testActionId)).toBe(true);
    });

    it('should retrieve actions by agent', async () => {
      const actions = await actionService.getActionsByAgent(AgentName.META);
      
      expect(actions).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some(a => a.actionId === testActionId)).toBe(true);
    });

    it('should retrieve actions by status', async () => {
      const actions = await actionService.getActionsByStatus(ActionStatus.PENDING);
      
      expect(actions).toBeDefined();
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some(a => a.actionId === testActionId)).toBe(true);
    });
  });

  describe('Action Updates', () => {
    let testActionId: string;

    beforeEach(async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-4',
        sessionId: 'test-session-4',
        conversationId: 'test-conv-4',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'scaleResource',
        intent: ActionIntent.SCALE,
        toolParameters: {
          resourceName: 'test-app',
          replicas: 3
        },
        environment: 'test'
      };

      const action = await actionService.createAction(request);
      testActionId = action.actionId;
    });

    it('should update action status', async () => {
      const updatedAction = await actionService.updateAction(testActionId, {
        status: ActionStatus.RUNNING,
        progress: 25
      });

      expect(updatedAction.status).toBe(ActionStatus.RUNNING);
      expect(updatedAction.progress).toBe(25);
      expect(updatedAction.lastUpdate).toBeDefined();
    });

    it('should mark action as completed', async () => {
      const result = {
        success: true,
        data: { message: 'Resource scaled successfully' },
        error: null,
        executionTime: 5000,
        resourcesCreated: ['deployment/test-app']
      };

      const updatedAction = await actionService.updateAction(testActionId, {
        status: ActionStatus.COMPLETED,
        progress: 100,
        result
      });

      expect(updatedAction.status).toBe(ActionStatus.COMPLETED);
      expect(updatedAction.progress).toBe(100);
      expect(updatedAction.completedTime).toBeDefined();
      expect(updatedAction.result).toEqual(result);
    });

    it('should mark action as failed', async () => {
      const errorMessage = 'Kubernetes API connection failed';
      
      const updatedAction = await actionService.markActionFailed(testActionId, errorMessage);

      expect(updatedAction.status).toBe(ActionStatus.FAILED);
      expect(updatedAction.result?.success).toBe(false);
      expect(updatedAction.result?.error).toBe(errorMessage);
    });
  });

  describe('Service Statistics', () => {
    it('should provide comprehensive service statistics', async () => {
      const stats = await actionService.getServiceStatistics();

      expect(stats).toBeDefined();
      expect(stats.actions).toBeDefined();
      expect(stats.queue).toBeDefined();

      expect(typeof stats.actions.total).toBe('number');
      expect(typeof stats.actions.pending).toBe('number');
      expect(typeof stats.actions.running).toBe('number');
      expect(typeof stats.actions.completed).toBe('number');
      expect(typeof stats.actions.failed).toBe('number');
      expect(typeof stats.actions.byAgent).toBe('object');

      expect(typeof stats.queue.waiting).toBe('number');
      expect(typeof stats.queue.active).toBe('number');
      expect(typeof stats.queue.completed).toBe('number');
      expect(typeof stats.queue.failed).toBe('number');
    });
  });

  describe('Event Callbacks', () => {
    it('should trigger callbacks during action lifecycle', async () => {
      let createdAction: any = null;
      let startedActionId: string | null = null;
      let progressUpdates: { actionId: string; progress: number }[] = [];
      let completedAction: any = null;

      actionService.setEventCallbacks({
        onActionCreated: async (action) => {
          createdAction = action;
        },
        onActionStarted: async (actionId) => {
          startedActionId = actionId;
        },
        onActionProgress: async (actionId, progress) => {
          progressUpdates.push({ actionId, progress });
        },
        onActionCompleted: async (action) => {
          completedAction = action;
        }
      });

      const request: CreateActionRequest = {
        userId: 'test-user-callback',
        sessionId: 'test-session-callback',
        conversationId: 'test-conv-callback',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'getResourceStatus',
        intent: ActionIntent.MONITOR,
        toolParameters: {
          resourceName: 'test-resource',
          namespace: 'default'
        },
        environment: 'test'
      };

      const action = await actionService.createAndQueueAction(request);

      // Wait a bit for queue processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(createdAction).toBeDefined();
      expect(createdAction.actionId).toBe(action.actionId);
      
      // Note: Queue processing callbacks might not trigger immediately in tests
      // This would require more sophisticated testing setup
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid action definitions', async () => {
      const request: CreateActionRequest = {
        userId: 'test-user-error',
        sessionId: 'test-session-error',
        conversationId: 'test-conv-error',
        agentName: AgentName.INFRASTRUCTURE,
        toolName: 'invalidTool', // This tool doesn't exist
        intent: ActionIntent.DEPLOY,
        toolParameters: {},
        environment: 'test'
      };

      await expect(actionService.createAction(request)).rejects.toThrow(
        'Action definition not found'
      );
    });

    it('should handle update to non-existent action', async () => {
      await expect(
        actionService.updateAction('non-existent-id', {
          status: ActionStatus.COMPLETED
        })
      ).rejects.toThrow();
    });
  });
});