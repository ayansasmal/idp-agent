/**
 * Abstract Action Worker Base Class
 * 
 * Provides the foundation for executing actions with validation polling,
 * retry logic, and proper status updates.
 */

import { 
  ActionRecord, 
  ActionStatus, 
  ActionResult, 
  CompletionCriteria,
  ValidationRule 
} from '../types/ActionTypes';
import { ActionManagerService } from '../services/ActionManagerService';

/**
 * Worker execution context
 */
export interface WorkerContext {
  actionRecord: ActionRecord;
  actionManager: ActionManagerService;
  workerId: string;
  startTime: Date;
  timeoutMs: number;
  retryCount: number;
  isAborted: boolean;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  data: any;
  message: string;
  error?: string;
  executionTime: number;
  resourcesCreated: string[];
}

/**
 * Validation result from checking completion criteria
 */
export interface ValidationResult {
  isComplete: boolean;
  progress: number; // 0-100
  status: ActionStatus;
  message: string;
  data?: any;
  shouldRetry?: boolean;
  nextCheckDelayMs?: number;
}

/**
 * Worker execution statistics
 */
export interface WorkerStats {
  totalExecutions: number;
  successful: number;
  failed: number;
  averageExecutionTime: number;
  averageValidationTime: number;
  activeWorkers: number;
}

/**
 * Abstract base class for all action workers
 */
export abstract class ActionWorker {
  protected context: WorkerContext;
  protected validationInterval?: NodeJS.Timeout;
  protected isValidating = false;
  protected validationAttempts = 0;
  protected maxValidationAttempts = 120; // 2 hours at 1-minute intervals

  constructor(
    protected actionRecord: ActionRecord,
    protected actionManager: ActionManagerService,
    protected workerId: string = `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  ) {
    this.context = {
      actionRecord,
      actionManager,
      workerId,
      startTime: new Date(),
      timeoutMs: this.getActionTimeout(),
      retryCount: actionRecord.executionMetadata.retryCount || 0,
      isAborted: false
    };
  }

  /**
   * Main execution method - orchestrates the entire action workflow
   * @returns Promise resolving to execution result
   */
  async execute(): Promise<ActionResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Worker ${this.workerId} starting execution of action ${this.actionRecord.actionId}`);
      
      // Update action status to running
      await this.updateActionStatus(ActionStatus.RUNNING, 0, 'Starting execution');

      // Execute the tool
      const toolResult = await this.executeTool();
      
      if (!toolResult.success) {
        return await this.handleFailure(toolResult.error || 'Tool execution failed');
      }

      // Update progress after tool execution
      await this.updateActionStatus(ActionStatus.RUNNING, 25, 'Tool executed, starting validation');

      // Start validation process
      const validationResult = await this.startValidation();
      
      if (!validationResult.isComplete) {
        return await this.handleFailure('Validation failed or timed out');
      }

      // Complete the action
      const finalResult: ActionResult = {
        success: true,
        data: {
          toolResult: toolResult.data,
          validationResult: validationResult.data
        },
        error: null,
        executionTime: Date.now() - startTime,
        resourcesCreated: toolResult.resourcesCreated
      };

      await this.updateActionStatus(ActionStatus.COMPLETED, 100, 'Action completed successfully');
      
      console.log(`Worker ${this.workerId} completed action ${this.actionRecord.actionId}`);
      return finalResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Worker ${this.workerId} failed:`, error);
      return await this.handleFailure(errorMessage);
    }
  }

  /**
   * Abstract method: Execute the specific tool for this action
   * Must be implemented by concrete worker classes
   */
  protected abstract executeTool(): Promise<ToolExecutionResult>;

  /**
   * Abstract method: Check if action is complete based on completion criteria
   * Must be implemented by concrete worker classes
   */
  protected abstract checkCompletion(): Promise<ValidationResult>;

  /**
   * Start the validation polling process
   * @returns Promise resolving when action is complete or failed
   */
  protected async startValidation(): Promise<ValidationResult> {
    const criteria = this.actionRecord.completionCriteria;
    
    // For immediate completion, skip validation
    if (criteria.type === 'immediate') {
      return {
        isComplete: true,
        progress: 100,
        status: ActionStatus.COMPLETED,
        message: 'Action completed immediately'
      };
    }

    console.log(`Starting validation for action ${this.actionRecord.actionId}`);
    this.isValidating = true;
    this.validationAttempts = 0;

    // Initial check
    const initialResult = await this.checkCompletion();
    if (initialResult.isComplete) {
      this.isValidating = false;
      return initialResult;
    }

    // Start polling
    return new Promise((resolve, reject) => {
      const checkInterval = criteria.checkInterval || 30000; // Default 30 seconds
      
      this.validationInterval = setInterval(async () => {
        if (this.context.isAborted) {
          this.stopValidation();
          resolve({
            isComplete: false,
            progress: 0,
            status: ActionStatus.CANCELLED,
            message: 'Validation aborted'
          });
          return;
        }

        this.validationAttempts++;
        
        if (this.validationAttempts > this.maxValidationAttempts) {
          this.stopValidation();
          resolve({
            isComplete: false,
            progress: 90,
            status: ActionStatus.TIMEOUT,
            message: `Validation timed out after ${this.validationAttempts} attempts`
          });
          return;
        }

        try {
          const result = await this.checkCompletion();
          
          // Update progress
          if (result.progress > 0) {
            await this.updateActionStatus(
              ActionStatus.RUNNING, 
              Math.min(25 + (result.progress * 0.75), 99), // Scale progress from 25-99%
              result.message
            );
          }

          if (result.isComplete) {
            this.stopValidation();
            resolve(result);
          } else if (result.shouldRetry === false) {
            // Explicit failure, don't continue validation
            this.stopValidation();
            resolve({
              isComplete: false,
              progress: result.progress,
              status: ActionStatus.FAILED,
              message: result.message
            });
          }

          // Continue validation on next interval
          
        } catch (error) {
          console.error(`Validation check failed for action ${this.actionRecord.actionId}:`, error);
          // Continue validation, but log the error
        }
      }, checkInterval);

      // Set overall timeout
      setTimeout(() => {
        if (this.isValidating) {
          this.stopValidation();
          resolve({
            isComplete: false,
            progress: 90,
            status: ActionStatus.TIMEOUT,
            message: 'Overall validation timeout reached'
          });
        }
      }, this.context.timeoutMs);
    });
  }

  /**
   * Stop the validation process
   */
  protected stopValidation(): void {
    this.isValidating = false;
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = undefined;
    }
  }

  /**
   * Handle action failure
   * @param error - Error message
   * @returns Failed action result
   */
  protected async handleFailure(error: string): Promise<ActionResult> {
    const result: ActionResult = {
      success: false,
      data: null,
      error,
      executionTime: Date.now() - this.context.startTime.getTime(),
      resourcesCreated: []
    };

    await this.updateActionStatus(ActionStatus.FAILED, 0, error);
    
    console.error(`Worker ${this.workerId} failed action ${this.actionRecord.actionId}: ${error}`);
    return result;
  }

  /**
   * Update action status in the database
   * @param status - New status
   * @param progress - Progress percentage
   * @param message - Status message
   */
  protected async updateActionStatus(
    status: ActionStatus, 
    progress: number, 
    message?: string
  ): Promise<void> {
    try {
      await this.actionManager.updateAction(this.actionRecord.actionId, {
        status,
        progress,
        executionMetadata: {
          workerId: this.workerId,
          retryCount: this.context.retryCount,
          ...(message && { lastStatusMessage: message })
        }
      });
    } catch (error) {
      console.error(`Failed to update action status for ${this.actionRecord.actionId}:`, error);
    }
  }

  /**
   * Get action timeout from definition or use default
   * @returns Timeout in milliseconds
   */
  protected getActionTimeout(): number {
    // Get from action definition or use a reasonable default
    const baseTimeout = this.actionRecord.executionMetadata.estimatedDuration || 300000; // 5 minutes
    return baseTimeout * 4; // Allow 4x estimated duration for completion
  }

  /**
   * Check if action should be retried
   * @param error - The error that occurred
   * @returns True if action should be retried
   */
  protected shouldRetry(error: string): boolean {
    const registry = require('../registry/ActionRegistry').ActionRegistry;
    const definition = registry.getActionDefinition(
      this.actionRecord.agentName,
      this.actionRecord.toolName
    );

    if (!definition || !definition.retryPolicy) {
      return false;
    }

    const retryPolicy = definition.retryPolicy;
    
    // Check max retries
    if (this.context.retryCount >= retryPolicy.maxRetries) {
      return false;
    }

    // Check if error is retryable
    return retryPolicy.retryableErrors.some((pattern: string) => 
      error.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Calculate retry delay using exponential backoff
   * @returns Delay in milliseconds
   */
  protected getRetryDelay(): number {
    const registry = require('../registry/ActionRegistry').ActionRegistry;
    const definition = registry.getActionDefinition(
      this.actionRecord.agentName,
      this.actionRecord.toolName
    );

    if (!definition?.retryPolicy) {
      return 60000; // 1 minute default
    }

    const retryPolicy = definition.retryPolicy;
    const baseDelay = retryPolicy.retryDelay;
    const multiplier = retryPolicy.backoffMultiplier;
    
    return baseDelay * Math.pow(multiplier, this.context.retryCount);
  }

  /**
   * Abort the worker execution
   */
  abort(): void {
    console.log(`Aborting worker ${this.workerId} for action ${this.actionRecord.actionId}`);
    this.context.isAborted = true;
    this.stopValidation();
  }

  /**
   * Get worker statistics
   */
  getStats(): WorkerStats {
    // This would be implemented by tracking stats across all workers
    // For now, return basic stats
    return {
      totalExecutions: 0,
      successful: 0,
      failed: 0,
      averageExecutionTime: 0,
      averageValidationTime: 0,
      activeWorkers: 0
    };
  }
}

/**
 * Worker factory for creating appropriate worker instances
 */
export class WorkerFactory {
  /**
   * Create a worker for the given action
   * @param actionRecord - Action to execute
   * @param actionManager - Action manager service
   * @returns Appropriate worker instance
   */
  static createWorker(
    actionRecord: ActionRecord,
    actionManager: ActionManagerService
  ): ActionWorker {
    switch (actionRecord.agentName) {
      case 'infrastructure':
        const { InfrastructureWorker } = require('./InfrastructureWorker');
        return new InfrastructureWorker(actionRecord, actionManager);
        
      case 'observability':
        const { ObservabilityWorker } = require('./ObservabilityWorker');
        return new ObservabilityWorker(actionRecord, actionManager);
        
      case 'meta':
        const { MetaWorker } = require('./MetaWorker');
        return new MetaWorker(actionRecord, actionManager);
        
      default:
        throw new Error(`No worker available for agent: ${actionRecord.agentName}`);
    }
  }
}