/**
 * Worker Manager
 * 
 * Coordinates and manages worker execution, handles retry logic,
 * and provides worker pool management for action processing.
 */

import { 
  ActionRecord, 
  ActionStatus, 
  ActionResult 
} from '../types/ActionTypes';
import { ActionManagerService } from '../services/ActionManagerService';
import { ActionWorker, WorkerFactory, WorkerStats } from './ActionWorker';

/**
 * Worker pool configuration
 */
export interface WorkerPoolConfig {
  maxConcurrentWorkers: number;
  defaultWorkerTimeout: number;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * Active worker information
 */
export interface ActiveWorker {
  worker: ActionWorker;
  actionId: string;
  startTime: Date;
  timeoutMs: number;
}

/**
 * Worker execution result with metadata
 */
export interface WorkerExecutionResult {
  actionId: string;
  result: ActionResult;
  executionTime: number;
  workerType: string;
  retryCount: number;
}

/**
 * Worker Manager - orchestrates worker execution
 */
export class WorkerManager {
  private activeWorkers: Map<string, ActiveWorker> = new Map();
  private workerQueue: ActionRecord[] = [];
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout;
  private config: WorkerPoolConfig;

  constructor(
    private actionManager: ActionManagerService,
    config: Partial<WorkerPoolConfig> = {}
  ) {
    this.config = {
      maxConcurrentWorkers: config.maxConcurrentWorkers || 5,
      defaultWorkerTimeout: config.defaultWorkerTimeout || 600000, // 10 minutes
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 60000, // 1 minute
    };
  }

  /**
   * Start the worker manager
   */
  async start(): Promise<void> {
    if (this.isProcessing) {
      console.log('Worker manager is already running');
      return;
    }

    this.isProcessing = true;
    console.log(`Starting worker manager with max ${this.config.maxConcurrentWorkers} concurrent workers`);

    // Start processing loop
    this.processingInterval = setInterval(async () => {
      await this.processWorkerQueue();
      await this.checkWorkerTimeouts();
    }, 5000); // Check every 5 seconds

    // Load any pending actions
    await this.loadPendingActions();
  }

  /**
   * Stop the worker manager
   */
  async stop(): Promise<void> {
    console.log('Stopping worker manager...');
    this.isProcessing = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    // Wait for active workers to complete or timeout
    const activeWorkerPromises = Array.from(this.activeWorkers.values()).map(
      activeWorker => this.waitForWorkerCompletion(activeWorker, 30000) // 30 second grace period
    );

    await Promise.allSettled(activeWorkerPromises);

    // Abort any remaining workers
    for (const [actionId, activeWorker] of this.activeWorkers) {
      console.log(`Aborting worker for action ${actionId}`);
      activeWorker.worker.abort();
    }

    this.activeWorkers.clear();
    this.workerQueue = [];
    console.log('Worker manager stopped');
  }

  /**
   * Submit an action for worker execution
   * @param actionRecord - Action to execute
   * @returns Promise resolving when action is queued
   */
  async submitAction(actionRecord: ActionRecord): Promise<void> {
    console.log(`Submitting action ${actionRecord.actionId} to worker queue`);
    this.workerQueue.push(actionRecord);
  }

  /**
   * Get worker manager statistics
   */
  getStats(): {
    activeWorkers: number;
    queuedActions: number;
    totalProcessed: number;
    averageExecutionTime: number;
  } {
    // In a real implementation, these would be tracked over time
    return {
      activeWorkers: this.activeWorkers.size,
      queuedActions: this.workerQueue.length,
      totalProcessed: 0, // Would track this
      averageExecutionTime: 0 // Would calculate this
    };
  }

  /**
   * Process the worker queue
   */
  private async processWorkerQueue(): Promise<void> {
    if (!this.isProcessing) return;

    // Check if we can start more workers
    const availableSlots = this.config.maxConcurrentWorkers - this.activeWorkers.size;
    if (availableSlots <= 0 || this.workerQueue.length === 0) {
      return;
    }

    // Start new workers up to available capacity
    const actionsToProcess = this.workerQueue.splice(0, availableSlots);
    
    for (const actionRecord of actionsToProcess) {
      try {
        await this.startWorker(actionRecord);
      } catch (error) {
        console.error(`Failed to start worker for action ${actionRecord.actionId}:`, error);
        // Put the action back in queue for retry
        this.workerQueue.unshift(actionRecord);
      }
    }
  }

  /**
   * Start a worker for an action
   */
  private async startWorker(actionRecord: ActionRecord): Promise<void> {
    try {
      // Create appropriate worker
      const worker = WorkerFactory.createWorker(actionRecord, this.actionManager);
      
      const activeWorker: ActiveWorker = {
        worker,
        actionId: actionRecord.actionId,
        startTime: new Date(),
        timeoutMs: this.config.defaultWorkerTimeout
      };

      this.activeWorkers.set(actionRecord.actionId, activeWorker);
      console.log(`Started worker for action ${actionRecord.actionId} (${actionRecord.agentName}:${actionRecord.toolName})`);

      // Execute worker asynchronously
      this.executeWorkerAsync(activeWorker);

    } catch (error) {
      console.error(`Failed to create worker for action ${actionRecord.actionId}:`, error);
      
      // Mark action as failed
      await this.actionManager.markActionFailed(
        actionRecord.actionId,
        `Failed to create worker: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Execute worker asynchronously
   */
  private async executeWorkerAsync(activeWorker: ActiveWorker): Promise<void> {
    const { worker, actionId } = activeWorker;

    try {
      // Execute the worker
      const result = await worker.execute();
      
      // Handle result
      await this.handleWorkerCompletion(actionId, result, false);

    } catch (error) {
      console.error(`Worker execution failed for action ${actionId}:`, error);
      
      // Check if we should retry
      const actionRecord = await this.actionManager.getAction(actionId);
      if (actionRecord && this.shouldRetryAction(actionRecord, error)) {
        await this.scheduleRetry(actionRecord, error);
      } else {
        // Mark as failed
        const errorMessage = error instanceof Error ? error.message : 'Worker execution failed';
        await this.actionManager.markActionFailed(actionId, errorMessage);
      }
      
      this.activeWorkers.delete(actionId);
    }
  }

  /**
   * Handle worker completion
   */
  private async handleWorkerCompletion(
    actionId: string, 
    result: ActionResult, 
    wasTimeout: boolean
  ): Promise<void> {
    try {
      if (result.success) {
        console.log(`Worker completed successfully for action ${actionId}`);
        await this.actionManager.updateAction(actionId, {
          status: ActionStatus.COMPLETED,
          progress: 100,
          result
        });
      } else {
        console.log(`Worker failed for action ${actionId}: ${result.error}`);
        await this.actionManager.updateAction(actionId, {
          status: wasTimeout ? ActionStatus.TIMEOUT : ActionStatus.FAILED,
          progress: 100,
          result
        });
      }
    } catch (error) {
      console.error(`Failed to update action ${actionId} after worker completion:`, error);
    } finally {
      this.activeWorkers.delete(actionId);
    }
  }

  /**
   * Check for worker timeouts
   */
  private async checkWorkerTimeouts(): Promise<void> {
    const now = Date.now();
    const timeoutPromises: Promise<void>[] = [];

    for (const [actionId, activeWorker] of this.activeWorkers) {
      const elapsed = now - activeWorker.startTime.getTime();
      
      if (elapsed > activeWorker.timeoutMs) {
        console.log(`Worker timeout for action ${actionId} after ${elapsed}ms`);
        
        // Abort the worker
        activeWorker.worker.abort();
        
        // Handle timeout
        timeoutPromises.push(
          this.handleWorkerTimeout(actionId, activeWorker)
        );
      }
    }

    await Promise.allSettled(timeoutPromises);
  }

  /**
   * Handle worker timeout
   */
  private async handleWorkerTimeout(actionId: string, activeWorker: ActiveWorker): Promise<void> {
    try {
      const timeoutResult: ActionResult = {
        success: false,
        data: null,
        error: `Worker timeout after ${activeWorker.timeoutMs}ms`,
        executionTime: Date.now() - activeWorker.startTime.getTime(),
        resourcesCreated: []
      };

      await this.handleWorkerCompletion(actionId, timeoutResult, true);
    } catch (error) {
      console.error(`Failed to handle timeout for action ${actionId}:`, error);
      this.activeWorkers.delete(actionId);
    }
  }

  /**
   * Wait for worker completion with timeout
   */
  private async waitForWorkerCompletion(activeWorker: ActiveWorker, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, timeoutMs);

      // In a real implementation, we'd listen for worker completion events
      // For now, just resolve after timeout
      setTimeout(() => {
        clearTimeout(timeout);
        resolve();
      }, timeoutMs);
    });
  }

  /**
   * Check if action should be retried
   */
  private shouldRetryAction(actionRecord: ActionRecord, error: any): boolean {
    const retryCount = actionRecord.executionMetadata.retryCount || 0;
    
    if (retryCount >= this.config.retryAttempts) {
      return false;
    }

    // In a real implementation, we'd check the action definition's retry policy
    // For now, retry on most errors except explicit failures
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Don't retry on these error types
    const nonRetryableErrors = [
      'validation failed',
      'invalid parameters',
      'permission denied',
      'resource already exists'
    ];

    return !nonRetryableErrors.some(pattern => 
      errorMessage.toLowerCase().includes(pattern)
    );
  }

  /**
   * Schedule action retry
   */
  private async scheduleRetry(actionRecord: ActionRecord, error: any): Promise<void> {
    const retryCount = (actionRecord.executionMetadata.retryCount || 0) + 1;
    const retryDelay = this.config.retryDelay * Math.pow(2, retryCount - 1); // Exponential backoff

    console.log(`Scheduling retry ${retryCount} for action ${actionRecord.actionId} in ${retryDelay}ms`);

    // Update retry count
    await this.actionManager.updateAction(actionRecord.actionId, {
      status: ActionStatus.PENDING,
      executionMetadata: {
        retryCount,
        lastRetryTime: new Date().toISOString()
      }
    });

    // Schedule retry
    setTimeout(() => {
      this.workerQueue.push({
        ...actionRecord,
        executionMetadata: {
          ...actionRecord.executionMetadata,
          retryCount
        }
      });
    }, retryDelay);
  }

  /**
   * Load pending actions from database
   */
  private async loadPendingActions(): Promise<void> {
    try {
      const pendingActions = await this.actionManager.getActionsByStatus(ActionStatus.PENDING);
      console.log(`Loaded ${pendingActions.length} pending actions`);
      
      for (const action of pendingActions) {
        this.workerQueue.push(action);
      }
    } catch (error) {
      console.error('Failed to load pending actions:', error);
    }
  }

  /**
   * Abort specific action
   * @param actionId - Action to abort
   */
  async abortAction(actionId: string): Promise<boolean> {
    const activeWorker = this.activeWorkers.get(actionId);
    
    if (activeWorker) {
      console.log(`Aborting action ${actionId}`);
      activeWorker.worker.abort();
      
      // Update action status
      await this.actionManager.updateAction(actionId, {
        status: ActionStatus.CANCELLED
      });
      
      this.activeWorkers.delete(actionId);
      return true;
    }
    
    // Check if it's in queue
    const queueIndex = this.workerQueue.findIndex(action => action.actionId === actionId);
    if (queueIndex >= 0) {
      this.workerQueue.splice(queueIndex, 1);
      
      // Update action status
      await this.actionManager.updateAction(actionId, {
        status: ActionStatus.CANCELLED
      });
      
      return true;
    }
    
    return false;
  }
}