import { z } from 'zod';

// ============================================================================
// Windmill Execution Types
// ============================================================================

export const WindmillScriptSchema = z.object({
  path: z.string().describe('Windmill script path (e.g., "u/user/kubectl-deploy")'),
  parameters: z.record(z.string(), z.any()).default({}),
  metadata: z.record(z.string(), z.any()).default({})
});

export const WindmillWorkflowSchema = z.object({
  path: z.string().describe('Windmill workflow path'),
  parameters: z.record(z.string(), z.any()).default({}),
  steps: z.array(WindmillScriptSchema).optional()
});

export const ExecutionResultSchema = z.object({
  jobId: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'error']),
  result: z.any().optional(),
  logs: z.string().optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  duration: z.number().optional() // milliseconds
});

export const WindmillConfigSchema = z.object({
  baseUrl: z.string().default('http://localhost:8000'),
  token: z.string().optional(),
  workspace: z.string().default('admins'),
  timeout: z.number().default(30000), // 30 seconds
  retries: z.number().default(3)
});

// ============================================================================
// kubectl Operation Types
// ============================================================================

export const KubectlOperationSchema = z.object({
  action: z.enum(['deploy', 'scale', 'status', 'logs', 'port-forward', 'rollback', 'delete']),
  resourceName: z.string(),
  namespace: z.string().default('default'),
  environment: z.enum(['development', 'staging', 'production']),
  parameters: z.record(z.string(), z.any()).default({}),
  approvalRequired: z.boolean().default(false)
});

// ============================================================================
// Service Response Types
// ============================================================================

export const WindmillServiceResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.any().optional(),
  executionId: z.string().optional(),
  error: z.string().optional(),
  metadata: z.object({
    service: z.string().default('windmill'),
    operation: z.string(),
    timestamp: z.string(),
    duration: z.number().optional()
  })
});

// ============================================================================
// Exported Types
// ============================================================================

export type WindmillScript = z.infer<typeof WindmillScriptSchema>;
export type WindmillWorkflow = z.infer<typeof WindmillWorkflowSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type WindmillConfig = z.infer<typeof WindmillConfigSchema>;
export type KubectlOperation = z.infer<typeof KubectlOperationSchema>;
export type WindmillServiceResponse = z.infer<typeof WindmillServiceResponseSchema>;

// ============================================================================
// Service Interface
// ============================================================================

export interface WindmillServiceInterface {
  // Core execution methods
  executeScript(script: WindmillScript): Promise<ExecutionResult>;
  executeWorkflow(workflow: WindmillWorkflow): Promise<ExecutionResult>;
  
  // Status monitoring
  getExecutionStatus(jobId: string): Promise<ExecutionResult>;
  getExecutionLogs(jobId: string): Promise<string>;
  
  // Script management
  deployScript(scriptContent: string, path: string): Promise<{ success: boolean; path: string }>;
  listScripts(): Promise<string[]>;
  
  // kubectl-specific operations
  executeKubectlOperation(operation: KubectlOperation): Promise<WindmillServiceResponse>;
  
  // Health and connectivity
  healthCheck(): Promise<{ healthy: boolean; version?: string }>;
}