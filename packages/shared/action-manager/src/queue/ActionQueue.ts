/**
 * Action Queue Interface
 * 
 * Defines interface for background processing of actions.
 * Supports multiple queue implementations (Redis, SQS, Bull, etc.)
 */

import { ActionRecord, ActionStatus } from '../types/ActionTypes';

/**
 * Queue job data for action processing
 */
export interface ActionQueueJob {
  actionId: string;
  actionRecord: ActionRecord;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  delay?: number; // milliseconds
  maxRetries?: number;
}

/**
 * Queue processing result
 */
export interface ActionQueueResult {
  actionId: string;
  success: boolean;
  status: ActionStatus;
  progress: number;
  result?: any;
  error?: string;
  retryCount: number;
  processingTime: number;
}

/**
 * Queue event handlers
 */
export interface ActionQueueEventHandlers {
  onJobStarted?: (job: ActionQueueJob) => Promise<void>;
  onJobProgress?: (actionId: string, progress: number) => Promise<void>;
  onJobCompleted?: (result: ActionQueueResult) => Promise<void>;
  onJobFailed?: (actionId: string, error: string, retryCount: number) => Promise<void>;
  onJobRetry?: (actionId: string, retryCount: number) => Promise<void>;
}

/**
 * Abstract base class for action queue implementations
 */
export abstract class ActionQueue {
  protected handlers: ActionQueueEventHandlers = {};

  /**
   * Set event handlers for queue processing events
   * @param handlers - Event handlers
   */
  setEventHandlers(handlers: ActionQueueEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * Add action to processing queue
   * @param job - Action queue job
   * @returns Promise resolving to job ID
   */
  abstract enqueue(job: ActionQueueJob): Promise<string>;

  /**
   * Remove job from queue
   * @param jobId - Job identifier
   * @returns Promise resolving to success status
   */
  abstract dequeue(jobId: string): Promise<boolean>;

  /**
   * Get queue statistics
   * @returns Promise resolving to queue stats
   */
  abstract getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }>;

  /**
   * Start queue processing
   * @param concurrency - Number of concurrent workers
   */
  abstract start(concurrency?: number): Promise<void>;

  /**
   * Stop queue processing
   */
  abstract stop(): Promise<void>;

  /**
   * Process a single action (implemented by subclasses)
   * @param job - Action job to process
   * @returns Promise resolving to processing result
   */
  protected abstract processAction(job: ActionQueueJob): Promise<ActionQueueResult>;
}

/**
 * In-memory queue implementation for development and testing
 */
export class InMemoryActionQueue extends ActionQueue {
  private queue: Map<string, ActionQueueJob> = new Map();
  private processing: Map<string, Promise<ActionQueueResult>> = new Map();
  private results: Map<string, ActionQueueResult> = new Map();
  private isProcessing = false;
  private processingInterval?: NodeJS.Timeout;

  async enqueue(job: ActionQueueJob): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.queue.set(jobId, job);
    
    console.log(`Enqueued action ${job.actionId} as job ${jobId}`);
    return jobId;
  }

  async dequeue(jobId: string): Promise<boolean> {
    const removed = this.queue.delete(jobId);
    this.processing.delete(jobId);
    console.log(`Dequeued job ${jobId}: ${removed ? 'success' : 'not found'}`);
    return removed;
  }

  async getStats() {
    return {
      waiting: this.queue.size,
      active: this.processing.size,
      completed: [...this.results.values()].filter(r => r.success).length,
      failed: [...this.results.values()].filter(r => !r.success).length,
      delayed: 0 // In-memory queue doesn't support delayed jobs
    };
  }

  async start(concurrency = 3): Promise<void> {
    if (this.isProcessing) {
      console.log('Queue is already processing');
      return;
    }

    this.isProcessing = true;
    console.log(`Starting in-memory action queue with concurrency: ${concurrency}`);

    this.processingInterval = setInterval(async () => {
      if (this.processing.size >= concurrency) {
        return; // At max concurrency
      }

      // Get next job from queue
      const [jobId, job] = [...this.queue.entries()][0] || [];
      if (!jobId || !job) {
        return; // No jobs waiting
      }

      // Remove from queue and add to processing
      this.queue.delete(jobId);
      
      const processingPromise = this.processJobWithRetry(jobId, job).then(() => {
        // Return void, but this is wrapped in a completion handler
        return {} as ActionQueueResult; // Placeholder
      });
      this.processing.set(jobId, processingPromise);

      // Handle completion
      processingPromise.finally(() => {
        this.processing.delete(jobId);
      });

    }, 1000); // Check every second
  }

  async stop(): Promise<void> {
    this.isProcessing = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    // Wait for active jobs to complete
    if (this.processing.size > 0) {
      console.log(`Waiting for ${this.processing.size} active jobs to complete...`);
      await Promise.allSettled([...this.processing.values()]);
    }

    console.log('In-memory action queue stopped');
  }

  private async processJobWithRetry(jobId: string, job: ActionQueueJob): Promise<void> {
    const maxRetries = job.maxRetries || 3;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        // Trigger job started event
        if (this.handlers.onJobStarted) {
          await this.handlers.onJobStarted(job);
        }

        const result = await this.processAction(job);
        result.retryCount = retryCount;

        // Store result
        this.results.set(jobId, result);

        // Trigger completion event
        if (result.success && this.handlers.onJobCompleted) {
          await this.handlers.onJobCompleted(result);
        } else if (!result.success && this.handlers.onJobFailed) {
          await this.handlers.onJobFailed(result.actionId, result.error || 'Unknown error', retryCount);
        }

        break; // Success, exit retry loop

      } catch (error) {
        retryCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (retryCount > maxRetries) {
          // Final failure
          const failureResult: ActionQueueResult = {
            actionId: job.actionId,
            success: false,
            status: ActionStatus.FAILED,
            progress: 0,
            error: errorMessage,
            retryCount,
            processingTime: 0
          };

          this.results.set(jobId, failureResult);

          if (this.handlers.onJobFailed) {
            await this.handlers.onJobFailed(job.actionId, errorMessage, retryCount);
          }
        } else {
          // Retry
          console.log(`Retrying action ${job.actionId} (attempt ${retryCount}/${maxRetries})`);
          
          if (this.handlers.onJobRetry) {
            await this.handlers.onJobRetry(job.actionId, retryCount);
          }

          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        }
      }
    }
  }

  protected async processAction(job: ActionQueueJob): Promise<ActionQueueResult> {
    const startTime = Date.now();
    
    // Simulate action processing based on action type
    const { ActionRegistry } = await import('../registry/ActionRegistry');
    const definition = ActionRegistry.getActionDefinition(
      job.actionRecord.agentName, 
      job.actionRecord.toolName
    );

    if (!definition) {
      throw new Error(`Unknown action: ${job.actionRecord.agentName}:${job.actionRecord.toolName}`);
    }

    // Simulate processing time
    const processingTime = definition.estimatedDuration * 1000; // Convert to milliseconds
    
    // Report progress during processing
    const progressInterval = setInterval(async () => {
      if (this.handlers.onJobProgress) {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(Math.floor((elapsed / processingTime) * 100), 90);
        await this.handlers.onJobProgress(job.actionId, progress);
      }
    }, 5000); // Report progress every 5 seconds

    try {
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, processingTime));

      // Final progress update
      if (this.handlers.onJobProgress) {
        await this.handlers.onJobProgress(job.actionId, 100);
      }

      const result: ActionQueueResult = {
        actionId: job.actionId,
        success: true,
        status: ActionStatus.COMPLETED,
        progress: 100,
        result: {
          success: true,
          data: { message: `Action ${job.actionRecord.toolName} completed successfully` },
          error: null,
          executionTime: Date.now() - startTime,
          resourcesCreated: []
        },
        retryCount: 0,
        processingTime: Date.now() - startTime
      };

      return result;

    } finally {
      clearInterval(progressInterval);
    }
  }
}