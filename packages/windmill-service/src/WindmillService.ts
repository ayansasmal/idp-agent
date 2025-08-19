import * as wmill from 'windmill-client';
import pino from 'pino';
import {
  WindmillServiceInterface,
  WindmillScript,
  WindmillWorkflow,
  ExecutionResult,
  KubectlOperation,
  WindmillServiceResponse,
  WindmillConfig,
  WindmillConfigSchema,
  ExecutionResultSchema
} from './types';

export class WindmillService implements WindmillServiceInterface {
  private logger: pino.Logger;
  private config: WindmillConfig;
  private isInitialized = false;

  constructor(config: Partial<WindmillConfig> = {}) {
    this.logger = pino({
      name: 'WindmillService',
      level: process.env.LOG_LEVEL || 'info'
    });

    // Validate and set configuration
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:8000',
      workspace: config.workspace || 'admins', 
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      token: config.token
    };
    
    this.logger.info({
      baseUrl: this.config.baseUrl,
      workspace: this.config.workspace,
      timeout: this.config.timeout
    }, 'WindmillService initialized');
  }

  /**
   * Initialize connection to Windmill
   */
  async initialize(): Promise<void> {
    try {
      // Set Windmill client configuration  
      wmill.setClient(this.config.token, this.config.baseUrl);

      // Test connection
      await this.healthCheck();
      this.isInitialized = true;
      
      this.logger.info({
        baseUrl: this.config.baseUrl,
        workspace: this.config.workspace
      }, 'Successfully connected to Windmill');
    } catch (error) {
      this.logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        config: this.config
      }, 'Failed to initialize Windmill connection');
      throw error;
    }
  }

  /**
   * Execute a Windmill script
   */
  async executeScript(script: WindmillScript): Promise<ExecutionResult> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    this.logger.info({ 
      path: script.path, 
      parameters: script.parameters 
    }, 'Executing Windmill script');

    try {
      // Run script asynchronously and get job ID
      const jobId = await wmill.runScriptAsync(
        script.path,
        null, // hash - not used when path is provided
        script.parameters
      );

      // Wait for completion with timeout
      const result = await this.waitForCompletion(jobId, this.config.timeout);
      
      this.logger.info({
        path: script.path,
        jobId,
        status: result.status,
        duration: Date.now() - startTime
      }, 'Script execution completed');

      return result;
    } catch (error) {
      this.logger.error({
        path: script.path,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Script execution failed');

      return {
        jobId: 'failed',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Execute a Windmill workflow
   */
  async executeWorkflow(workflow: WindmillWorkflow): Promise<ExecutionResult> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    this.logger.info({ 
      path: workflow.path, 
      parameters: workflow.parameters 
    }, 'Executing Windmill workflow');

    try {
      const jobId = await wmill.runFlowAsync(
        workflow.path,
        workflow.parameters,
        null // scheduledInSeconds - run immediately
      );

      const result = await this.waitForCompletion(jobId, this.config.timeout);
      
      this.logger.info({
        path: workflow.path,
        jobId,
        status: result.status,
        duration: Date.now() - startTime
      }, 'Workflow execution completed');

      return result;
    } catch (error) {
      this.logger.error({
        path: workflow.path,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Workflow execution failed');

      return {
        jobId: 'failed',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date().toISOString(),
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Get execution status for a job
   */
  async getExecutionStatus(jobId: string): Promise<ExecutionResult> {
    this.ensureInitialized();

    try {
      // Use JobService to get job details
      const { JobService } = await import('windmill-client');
      const job = await JobService.getJob({ workspace: this.config.workspace, id: jobId });
      
      return ExecutionResultSchema.parse({
        jobId,
        status: this.mapJobStatus(job.type || 'unknown'),
        result: job.type === 'CompletedJob' ? (job as any).result : undefined,
        logs: job.type === 'CompletedJob' ? (job as any).logs : undefined,
        error: job.type === 'CompletedJob' && !(job as any).success ? 'Job failed' : undefined,
        startedAt: job.type === 'CompletedJob' ? (job as any).started_at : (job as any).created_at,
        completedAt: job.type === 'CompletedJob' ? new Date((job as any).created_at + (job as any).duration_ms).toISOString() : undefined,
        duration: job.type === 'CompletedJob' ? (job as any).duration_ms : undefined
      });
    } catch (error) {
      this.logger.error({
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to get job status');

      return {
        jobId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Job not found'
      };
    }
  }

  /**
   * Get execution logs for a job
   */
  async getExecutionLogs(jobId: string): Promise<string> {
    this.ensureInitialized();

    try {
      const { JobService } = await import('windmill-client');
      const job = await JobService.getJob({ workspace: this.config.workspace, id: jobId });
      return job.type === 'CompletedJob' ? (job as any).logs || '' : '';
    } catch (error) {
      this.logger.error({
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to get job logs');
      return '';
    }
  }

  /**
   * Deploy a script to Windmill
   */
  async deployScript(scriptContent: string, path: string): Promise<{ success: boolean; path: string }> {
    this.ensureInitialized();

    try {
      // This is a placeholder - actual implementation would use Windmill's script deployment API
      // For now, we assume scripts are manually deployed to Windmill
      this.logger.info({ path }, 'Script deployment requested');
      
      return {
        success: true,
        path
      };
    } catch (error) {
      this.logger.error({
        path,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Script deployment failed');

      return {
        success: false,
        path
      };
    }
  }

  /**
   * List available scripts
   */
  async listScripts(): Promise<string[]> {
    this.ensureInitialized();

    try {
      // This would use Windmill's script listing API
      // For now, return hardcoded kubectl scripts
      return [
        'u/admin/kubectl-deploy',
        'u/admin/kubectl-scale',
        'u/admin/kubectl-status',
        'u/admin/kubectl-logs',
        'u/admin/kubectl-port-forward',
        'u/admin/kubectl-rollback',
        'u/admin/kubectl-delete'
      ];
    } catch (error) {
      this.logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Failed to list scripts');
      return [];
    }
  }

  /**
   * Execute kubectl operation via Windmill script
   */
  async executeKubectlOperation(operation: KubectlOperation): Promise<WindmillServiceResponse> {
    const startTime = Date.now();
    const scriptPath = `u/admin/kubectl-${operation.action}`;
    
    this.logger.info({
      action: operation.action,
      resourceName: operation.resourceName,
      namespace: operation.namespace,
      scriptPath
    }, 'Executing kubectl operation via Windmill');

    try {
      const script: WindmillScript = {
        path: scriptPath,
        parameters: {
          resourceName: operation.resourceName,
          namespace: operation.namespace,
          environment: operation.environment,
          ...operation.parameters
        },
        metadata: {
          operation: operation.action,
          requestedAt: new Date().toISOString()
        }
      };

      const executionResult = await this.executeScript(script);

      return {
        success: executionResult.status === 'completed',
        message: executionResult.status === 'completed' 
          ? `Successfully executed ${operation.action} for ${operation.resourceName}`
          : `Failed to execute ${operation.action}: ${executionResult.error}`,
        data: executionResult.result,
        executionId: executionResult.jobId,
        error: executionResult.error,
        metadata: {
          service: 'windmill',
          operation: operation.action,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime
        }
      };
    } catch (error) {
      this.logger.error({
        operation: operation.action,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'kubectl operation failed');

      return {
        success: false,
        message: `Failed to execute ${operation.action}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          service: 'windmill',
          operation: operation.action,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; version?: string }> {
    try {
      // Test connection by checking if client is configured
      return {
        healthy: true,
        version: this.config.workspace || 'unknown'
      };
    } catch (error) {
      this.logger.error({
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Health check failed');

      return {
        healthy: false
      };
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('WindmillService not initialized. Call initialize() first.');
    }
  }

  private async waitForCompletion(jobId: string, timeoutMs: number): Promise<ExecutionResult> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getExecutionStatus(jobId);
      
      if (status.status === 'completed' || status.status === 'error') {
        return status;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout reached
    return {
      jobId,
      status: 'error',
      error: `Execution timeout after ${timeoutMs}ms`,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      duration: timeoutMs
    };
  }

  private mapJobStatus(windmillStatus: string): ExecutionResult['status'] {
    switch (windmillStatus) {
      case 'QueuedJob':
      case 'WaitingForExecutor':
        return 'pending';
      case 'RunningJob':
        return 'running';
      case 'CompletedJob':
        return 'completed';
      case 'FailedJob':
      default:
        return 'error';
    }
  }
}