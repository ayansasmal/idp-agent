/**
 * Action Manager Service - Main Integration Service
 * 
 * High-level service that integrates ActionManager with queue processing
 * and provides a complete action tracking solution.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ActionManager } from './ActionManager';
import { ActionQueue, ActionQueueJob, InMemoryActionQueue } from '../queue/ActionQueue';
import { DynamoDBClientFactory } from '../clients/DynamoDBClientFactory';
import { 
  ActionRecord, 
  ActionStatus, 
  CreateActionRequest, 
  UpdateActionRequest,
  ActionQueryOptions,
  AgentName
} from '../types/ActionTypes';

/**
 * Configuration for ActionManagerService
 */
export interface ActionManagerServiceConfig {
  dynamoDbClient?: DynamoDBClient;
  tableName?: string;
  queue?: ActionQueue;
  ttlDays?: number;
}

/**
 * Event callbacks for action lifecycle
 */
export interface ActionEventCallbacks {
  onActionCreated?: (action: ActionRecord) => Promise<void>;
  onActionStarted?: (actionId: string) => Promise<void>;
  onActionProgress?: (actionId: string, progress: number) => Promise<void>;
  onActionCompleted?: (action: ActionRecord) => Promise<void>;
  onActionFailed?: (actionId: string, error: string) => Promise<void>;
}

/**
 * Main Action Manager Service
 * 
 * Provides comprehensive action tracking with background processing
 */
export class ActionManagerService {
  private actionManager: ActionManager;
  private queue: ActionQueue;
  private callbacks: ActionEventCallbacks = {};

  constructor(config: ActionManagerServiceConfig = {}) {
    // Initialize DynamoDB client
    const dynamoDbClient = config.dynamoDbClient || DynamoDBClientFactory.createClient();
    
    // Initialize ActionManager
    this.actionManager = new ActionManager({
      dynamoDbClient,
      tableName: config.tableName || process.env.ACTION_TRACKING_TABLE_NAME || 'ai-idp-action-tracking',
      ttlDays: config.ttlDays
    });

    // Initialize Queue
    this.queue = config.queue || new InMemoryActionQueue();

    // Set up queue event handlers
    this.setupQueueHandlers();
  }

  /**
   * Set event callbacks for action lifecycle events
   * @param callbacks - Event callbacks
   */
  setEventCallbacks(callbacks: ActionEventCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Initialize the service (start queue processing)
   * @param queueConcurrency - Number of concurrent queue workers
   */
  async initialize(queueConcurrency = 3): Promise<void> {
    console.log('Initializing Action Manager Service...');
    
    try {
      // Test DynamoDB connection
      const connectionTest = await DynamoDBClientFactory.testConnection(
        this.actionManager['dynamoDb'] // Access private member for testing
      );
      
      if (!connectionTest.connected) {
        throw new Error(`DynamoDB connection failed: ${connectionTest.error}`);
      }
      
      console.log(`DynamoDB connected: ${connectionTest.endpoint} (${connectionTest.region})`);

      // Start queue processing
      await this.queue.start(queueConcurrency);
      
      console.log('Action Manager Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Action Manager Service:', error);
      throw error;
    }
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down Action Manager Service...');
    await this.queue.stop();
    console.log('Action Manager Service shut down');
  }

  /**
   * Create and queue a new action
   * @param request - Action creation request
   * @returns Created action record
   */
  async createAndQueueAction(request: CreateActionRequest): Promise<ActionRecord> {
    // Create action record
    const action = await this.actionManager.createAction(request);
    
    // Trigger callback
    if (this.callbacks.onActionCreated) {
      await this.callbacks.onActionCreated(action);
    }

    // Queue for background processing
    const queueJob: ActionQueueJob = {
      actionId: action.actionId,
      actionRecord: action,
      priority: (request.priority as 'low' | 'normal' | 'high' | 'urgent') || 'normal',
      maxRetries: 3
    };

    await this.queue.enqueue(queueJob);
    
    console.log(`Created and queued action: ${action.actionId} (${action.toolName})`);
    return action;
  }

  /**
   * Create action without queueing (for immediate processing)
   * @param request - Action creation request
   * @returns Created action record
   */
  async createAction(request: CreateActionRequest): Promise<ActionRecord> {
    const action = await this.actionManager.createAction(request);
    
    // Trigger callback
    if (this.callbacks.onActionCreated) {
      await this.callbacks.onActionCreated(action);
    }

    return action;
  }

  /**
   * Get action by ID
   * @param actionId - Action identifier
   * @returns Action record or null
   */
  async getAction(actionId: string): Promise<ActionRecord | null> {
    return this.actionManager.getAction(actionId);
  }

  /**
   * Update action status and metadata
   * @param actionId - Action identifier
   * @param updates - Update parameters
   * @returns Updated action record
   */
  async updateAction(actionId: string, updates: UpdateActionRequest): Promise<ActionRecord> {
    const updatedAction = await this.actionManager.updateAction(actionId, updates);

    // Trigger appropriate callbacks
    if (updates.status === ActionStatus.COMPLETED && this.callbacks.onActionCompleted) {
      await this.callbacks.onActionCompleted(updatedAction);
    }

    return updatedAction;
  }

  /**
   * Get actions by session
   * @param sessionId - Session identifier
   * @param options - Query options
   * @returns Array of action records
   */
  async getActionsBySession(sessionId: string, options?: ActionQueryOptions): Promise<ActionRecord[]> {
    return this.actionManager.getActionsBySession(sessionId, options);
  }

  /**
   * Get actions by user
   * @param userId - User identifier
   * @param options - Query options
   * @returns Array of action records
   */
  async getActionsByUser(userId: string, options?: ActionQueryOptions): Promise<ActionRecord[]> {
    return this.actionManager.getActionsByUser(userId, options);
  }

  /**
   * Get actions by status
   * @param status - Action status
   * @param options - Query options
   * @returns Array of action records
   */
  async getActionsByStatus(status: ActionStatus, options?: ActionQueryOptions): Promise<ActionRecord[]> {
    return this.actionManager.getActionsByStatus(status, options);
  }

  /**
   * Get actions by agent
   * @param agentName - Agent name
   * @param options - Query options
   * @returns Array of action records
   */
  async getActionsByAgent(agentName: AgentName, options?: ActionQueryOptions): Promise<ActionRecord[]> {
    return this.actionManager.getActionsByAgent(agentName, options);
  }

  /**
   * Get pending actions that might need user attention
   * @returns Array of pending actions
   */
  async getPendingActionsForUser(): Promise<ActionRecord[]> {
    const pendingActions = await this.actionManager.getPendingActions();
    const runningActions = await this.actionManager.getRunningActions();
    
    // Filter actions that have been running for more than their estimated duration
    const now = Date.now();
    const actionsThatMayNeedAttention = runningActions.filter(action => {
      const startTime = new Date(action.startTime).getTime();
      const estimatedDuration = (action.executionMetadata.estimatedDuration || 120000) * 1000; // Convert to ms
      const elapsedTime = now - startTime;
      
      // Consider actions that have exceeded 2x their estimated duration
      return elapsedTime > (estimatedDuration * 2);
    });

    return [...pendingActions, ...actionsThatMayNeedAttention];
  }

  /**
   * Mark action as failed
   * @param actionId - Action identifier
   * @param error - Error message
   * @returns Updated action record
   */
  async markActionFailed(actionId: string, error: string): Promise<ActionRecord> {
    const updatedAction = await this.actionManager.markActionFailed(actionId, error);
    
    if (this.callbacks.onActionFailed) {
      await this.callbacks.onActionFailed(actionId, error);
    }

    return updatedAction;
  }

  /**
   * Get comprehensive service statistics
   * @returns Service statistics
   */
  async getServiceStatistics(): Promise<{
    actions: {
      total: number;
      pending: number;
      running: number;
      completed: number;
      failed: number;
      byAgent: Record<AgentName, number>;
    };
    queue: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
  }> {
    const [actionStats, queueStats] = await Promise.all([
      this.actionManager.getActionStatistics(),
      this.queue.getStats()
    ]);

    return {
      actions: actionStats,
      queue: queueStats
    };
  }

  /**
   * Setup queue event handlers to update action records
   */
  private setupQueueHandlers(): void {
    this.queue.setEventHandlers({
      onJobStarted: async (job) => {
        await this.actionManager.updateAction(job.actionId, {
          status: ActionStatus.RUNNING,
          progress: 0
        });

        if (this.callbacks.onActionStarted) {
          await this.callbacks.onActionStarted(job.actionId);
        }
      },

      onJobProgress: async (actionId, progress) => {
        await this.actionManager.updateAction(actionId, {
          progress
        });

        if (this.callbacks.onActionProgress) {
          await this.callbacks.onActionProgress(actionId, progress);
        }
      },

      onJobCompleted: async (result) => {
        const updatedAction = await this.actionManager.updateAction(result.actionId, {
          status: result.status,
          progress: result.progress,
          result: result.result
        });

        if (this.callbacks.onActionCompleted) {
          await this.callbacks.onActionCompleted(updatedAction);
        }
      },

      onJobFailed: async (actionId, error, retryCount) => {
        await this.actionManager.updateAction(actionId, {
          status: ActionStatus.FAILED,
          executionMetadata: {
            retryCount
          }
        });

        if (this.callbacks.onActionFailed) {
          await this.callbacks.onActionFailed(actionId, error);
        }
      },

      onJobRetry: async (actionId, retryCount) => {
        await this.actionManager.updateAction(actionId, {
          status: ActionStatus.PENDING,
          executionMetadata: {
            retryCount
          }
        });
      }
    });
  }
}

/**
 * Singleton instance for global access
 */
let actionManagerServiceInstance: ActionManagerService | null = null;

/**
 * Get singleton instance of ActionManagerService
 * @param config - Optional configuration (only used on first call)
 * @returns ActionManagerService instance
 */
export function getActionManagerService(config?: ActionManagerServiceConfig): ActionManagerService {
  if (!actionManagerServiceInstance) {
    actionManagerServiceInstance = new ActionManagerService(config);
  }
  return actionManagerServiceInstance;
}

/**
 * Initialize the global ActionManagerService instance
 * @param config - Service configuration
 * @param queueConcurrency - Queue concurrency
 * @returns Initialized service instance
 */
export async function initializeActionManagerService(
  config?: ActionManagerServiceConfig,
  queueConcurrency = 3
): Promise<ActionManagerService> {
  const service = getActionManagerService(config);
  await service.initialize(queueConcurrency);
  return service;
}