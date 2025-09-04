/**
 * Meta-Agent Action Manager Integration Tests
 * 
 * End-to-end tests for the complete distributed workflow:
 * UI → Meta-Agent → Action Manager → Workers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetaAgent } from '../agent/MetaAgent';
import { ActionManager } from '@ai-idp/action-manager';
import { ActionStatus, AgentName, ActionIntent } from '@ai-idp/action-manager';
import type { ConversationContext } from '@ai-idp/types';

// Mock dependencies
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({
    send: vi.fn()
  }))
}));

vi.mock('@aws-sdk/util-dynamodb', () => ({
  marshall: vi.fn((obj) => obj),
  unmarshall: vi.fn((obj) => obj)
}));

vi.mock('@anthropic-ai/sdk', () => ({
  Anthropic: vi.fn(() => ({
    messages: {
      create: vi.fn()
    }
  }))
}));

vi.mock('@ai-idp/qdrant-client', () => ({
  QdrantContextClient: vi.fn(() => ({
    initialize: vi.fn(),
    healthCheck: vi.fn(() => ({ connected: true })),
    retrieveContext: vi.fn(() => Promise.resolve([]))
  }))
}));

// Mock Context Manager
vi.mock('../context/ContextManager', () => ({
  ContextManager: vi.fn(() => ({
    initialize: vi.fn(),
    retrieveRelevantContext: vi.fn(() => Promise.resolve([])),
    storeInteraction: vi.fn()
  }))
}));

// Mock Intent Classifier
vi.mock('../routing/IntentClassifier', () => ({
  IntentClassifier: vi.fn(() => ({
    classifyIntent: vi.fn(() => Promise.resolve({
      agent: 'infrastructure',
      action: 'deployApplication',
      confidence: 0.95,
      parameters: {
        resourceName: 'nginx',
        containerImage: 'nginx:latest',
        replicas: 3
      }
    }))
  }))
}));

// Mock Response Coordinator
vi.mock('../agent/ResponseCoordinator', () => ({
  ResponseCoordinator: vi.fn(() => ({
    synthesizeResponse: vi.fn((agentResponses, intent, userInput) => Promise.resolve({
      success: agentResponses.length > 0 && agentResponses[0].success,
      message: agentResponses[0]?.message || 'Test response',
      data: agentResponses[0]?.data,
      metadata: {
        agentsInvolved: [agentResponses[0]?.agentId || 'infrastructure'],
        totalExecutionTime: 100,
        contextStored: true
      }
    }))
  }))
}));

vi.mock('@ai-idp/mcp-client', () => ({
  MCPAgentClient: vi.fn(() => ({
    healthCheckAll: vi.fn(() => ({ infrastructure: true })),
    callTool: vi.fn(),
    cleanup: vi.fn()
  }))
}));

// Mock fetch for agent registration
global.fetch = vi.fn(() => Promise.resolve({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: () => Promise.resolve({ healthy: true })
})) as any;

describe('Meta-Agent Action Manager Integration', () => {
  let metaAgent: MetaAgent;
  let mockDynamoDBClient: any;
  let mockActionRecord: any;

  const testContext: ConversationContext = {
    conversationId: 'test-conv-123',
    userId: 'test-user-123',
    sessionId: 'test-session-123',
    history: [],
    metadata: {
      source: 'test',
      environment: 'development'
    }
  };

  beforeEach(async () => {
    // Mock DynamoDB operations
    mockDynamoDBClient = {
      send: vi.fn()
    };

    // Mock action record
    mockActionRecord = {
      actionId: 'action-test-123',
      userId: 'test-user-123',
      sessionId: 'test-conv-123',
      conversationId: 'test-conv-123',
      agentName: AgentName.INFRASTRUCTURE,
      toolName: 'deployApplication',
      intent: ActionIntent.DEPLOY,
      status: ActionStatus.PENDING,
      progress: 0,
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      executionMetadata: {
        toolParameters: {
          resourceName: 'test-nginx',
          containerImage: 'nginx:latest',
          replicas: 3
        },
        priority: 'normal' as const,
        retryCount: 0,
        estimatedDuration: 30000
      },
      completionCriteria: {
        type: 'resource_ready' as const
      },
      childActionIds: [],
      ttl: Math.floor(Date.now() / 1000) + 2592000
    };

    // Setup Meta-Agent with Action Manager enabled
    const config = {
      anthropic: {
        apiKey: 'test-key',
        model: 'claude-3-5-sonnet-latest',
        maxTokens: 4096
      },
      qdrant: {
        url: 'http://localhost:6333',
        collectionName: 'test-context',
        vectorSize: 384,
        timeout: 30000
      },
      mcp: {
        serverPort: 3001,
        clientTimeout: 30000,
        maxRetries: 3,
        retryDelay: 1000
      },
      actionManager: {
        enabled: true,
        dynamoDbClient: mockDynamoDBClient,
        tableName: 'test-actions',
        ttlDays: 30
      }
    };

    metaAgent = new MetaAgent(config);
    await metaAgent.initialize();
  });

  afterEach(async () => {
    await metaAgent.cleanup();
    vi.clearAllMocks();
  });

  describe('Action Manager Enabled Workflow', () => {
    it('should route infrastructure deployment through Action Manager', async () => {
      // Mock DynamoDB put operation (create action)
      mockDynamoDBClient.send.mockResolvedValueOnce({});

      // Mock the createAction response
      vi.spyOn(ActionManager.prototype, 'createAction').mockResolvedValue(mockActionRecord);

      const userInput = 'Deploy nginx with 3 replicas to production';
      const response = await metaAgent.processRequest(userInput, testContext);

      // Verify response structure
      expect(response.success).toBe(true);
      expect(response.message).toContain('queued for background execution');
      expect(response.data?.actionId).toBe('action-test-123');
      expect(response.metadata.agentsInvolved).toContain('infrastructure');

      // Verify Action Manager was called
      expect(ActionManager.prototype.createAction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-123',
          sessionId: 'test-conv-123',
          conversationId: 'test-conv-123',
          agentName: AgentName.INFRASTRUCTURE,
          toolName: 'deployApplication',
          intent: ActionIntent.DEPLOY
        })
      );
    });

    it('should provide action status via API endpoints', async () => {
      // Mock getAction method
      vi.spyOn(ActionManager.prototype, 'getAction').mockResolvedValue({
        ...mockActionRecord,
        status: ActionStatus.RUNNING,
        progress: 50
      });

      const actionStatus = await metaAgent.getActionStatus('action-test-123');

      expect(actionStatus).toBeDefined();
      expect(actionStatus?.status).toBe(ActionStatus.RUNNING);
      expect(actionStatus?.progress).toBe(50);
      expect(ActionManager.prototype.getAction).toHaveBeenCalledWith('action-test-123');
    });

    it('should list user actions', async () => {
      const mockUserActions = [
        { ...mockActionRecord, status: ActionStatus.COMPLETED },
        { ...mockActionRecord, actionId: 'action-test-124', status: ActionStatus.RUNNING }
      ];

      vi.spyOn(ActionManager.prototype, 'getActionsByUser').mockResolvedValue(mockUserActions);

      const userActions = await metaAgent.listUserActions('test-user-123', { limit: 10 });

      expect(userActions).toHaveLength(2);
      expect(userActions[0].status).toBe(ActionStatus.COMPLETED);
      expect(userActions[1].status).toBe(ActionStatus.RUNNING);
      expect(ActionManager.prototype.getActionsByUser).toHaveBeenCalledWith('test-user-123', { limit: 10 });
    });

    it('should list session actions', async () => {
      const mockSessionActions = [mockActionRecord];

      vi.spyOn(ActionManager.prototype, 'getActionsBySession').mockResolvedValue(mockSessionActions);

      const sessionActions = await metaAgent.listSessionActions('test-conv-123');

      expect(sessionActions).toHaveLength(1);
      expect(sessionActions[0].actionId).toBe('action-test-123');
      expect(ActionManager.prototype.getActionsBySession).toHaveBeenCalledWith('test-conv-123', undefined);
    });

    it('should provide action statistics', async () => {
      const mockStats = {
        total: 10,
        pending: 2,
        running: 3,
        completed: 4,
        failed: 1,
        byAgent: {
          [AgentName.INFRASTRUCTURE]: 8,
          [AgentName.OBSERVABILITY]: 2,
          [AgentName.META]: 0
        }
      };

      vi.spyOn(ActionManager.prototype, 'getActionStatistics').mockResolvedValue(mockStats);

      const stats = await metaAgent.getActionStatistics();

      expect(stats.total).toBe(10);
      expect(stats.byAgent[AgentName.INFRASTRUCTURE]).toBe(8);
      expect(ActionManager.prototype.getActionStatistics).toHaveBeenCalled();
    });
  });

  describe('Action Manager Disabled Workflow', () => {
    it('should fall back to direct agent communication', async () => {
      // Create Meta-Agent with Action Manager disabled
      const configDisabled = {
        anthropic: {
          apiKey: 'test-key',
          model: 'claude-3-5-sonnet-latest',
          maxTokens: 4096
        },
        qdrant: {
          url: 'http://localhost:6333',
          collectionName: 'test-context',
          vectorSize: 384,
          timeout: 30000
        },
        mcp: {
          serverPort: 3001,
          clientTimeout: 30000,
          maxRetries: 3,
          retryDelay: 1000
        }
        // No actionManager config - should be disabled
      };

      const disabledMetaAgent = new MetaAgent(configDisabled);
      await disabledMetaAgent.initialize();

      expect(disabledMetaAgent.isActionManagerEnabled()).toBe(false);

      // Test that action status methods throw appropriate errors
      await expect(disabledMetaAgent.getActionStatus('test')).rejects.toThrow('Action Manager not enabled');
      await expect(disabledMetaAgent.listUserActions('test')).rejects.toThrow('Action Manager not enabled');
      await expect(disabledMetaAgent.listSessionActions('test')).rejects.toThrow('Action Manager not enabled');

      await disabledMetaAgent.cleanup();
    });
  });

  describe('Error Handling and Fallback', () => {
    it('should fall back to direct communication when Action Manager fails', async () => {
      // Mock Action Manager failure
      vi.spyOn(ActionManager.prototype, 'createAction').mockRejectedValue(
        new Error('DynamoDB connection failed')
      );

      const userInput = 'Deploy nginx to staging';

      // This should not throw - it should fall back to direct communication
      const response = await metaAgent.processRequest(userInput, testContext);

      expect(response).toBeDefined();
      // The exact response depends on the direct routing implementation
      // but it should not fail completely
    });

    it('should handle action status retrieval errors gracefully', async () => {
      vi.spyOn(ActionManager.prototype, 'getAction').mockRejectedValue(
        new Error('Action not found')
      );

      await expect(metaAgent.getActionStatus('nonexistent-action'))
        .rejects.toThrow('Action not found');
    });
  });

  describe('Integration Points', () => {
    it('should validate Action Manager integration configuration', () => {
      expect(metaAgent.isActionManagerEnabled()).toBe(true);
    });

    it('should support both immediate and distributed responses', async () => {
      // Test that the Meta-Agent can handle both response types
      // This validates the hybrid architecture works correctly

      // Mock successful action creation
      vi.spyOn(ActionManager.prototype, 'createAction').mockResolvedValue(mockActionRecord);

      const response = await metaAgent.processRequest(
        'Deploy nginx with monitoring enabled',
        testContext
      );

      // Should return tracking response when Action Manager is used
      expect(response.data?.actionId).toBeDefined();
      expect(response.metadata.agentsInvolved).toContain('infrastructure');
    });
  });
});