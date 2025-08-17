import { z } from 'zod';

// ============================================================================
// Core Request/Response Types
// ============================================================================

export const RequestContextSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  originalRequest: z.string(),
  environment: z.enum(['development', 'staging', 'production']),
  permissions: z.array(z.string()),
  auditTrail: z.array(z.string()).default([]),
  timestamp: z.string().optional(),
});

export const ModuleRequestSchema = z.object({
  requestId: z.string(),
  module: z.string(),
  action: z.string(),
  parameters: z.record(z.any()),
  context: RequestContextSchema,
  requestingModule: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  timeout: z.number().optional(),
});

export const ModuleResponseSchema = z.object({
  requestId: z.string(),
  success: z.boolean(),
  result: z.any(),
  metadata: z.record(z.any()).default({}),
  nextActions: z.array(ModuleRequestSchema).default([]),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  message: z.string(),
  timestamp: z.string(),
  data: z.any().optional(),
});

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

// ============================================================================
// Platform Action Types
// ============================================================================

export const PlatformActionSchema = z.object({
  action: z.enum(['deploy', 'scale', 'status', 'logs', 'delete', 'rollback', 'list', 'describe']),
  resourceType: z.enum(['application', 'database', 'service', 'ingress']),
  resourceName: z.string(),
  environment: z.enum(['development', 'staging', 'production']),
  parameters: z.record(z.any()).default({}),
  explanation: z.string(),
  rollbackPlan: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  estimatedImpact: z.string(),
});

export const IntentAnalysisSchema = z.object({
  platformAction: PlatformActionSchema,
  confidence: z.number().min(0).max(1),
  requiresValidation: z.boolean(),
  requiresApproval: z.boolean(),
  additionalContext: z.record(z.any()).default({}),
});

// ============================================================================
// Agent Response Types
// ============================================================================

export const AgentResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.any().optional(),
  actions: z.array(PlatformActionSchema).default([]),
  metadata: z.record(z.any()).default({}),
  timestamp: z.string(),
});

// ============================================================================
// Health and Status Types
// ============================================================================

export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  checks: z.record(z.object({
    status: z.enum(['pass', 'fail', 'warn']),
    message: z.string().optional(),
    responseTime: z.number().optional(),
  })),
  timestamp: z.string(),
});

// ============================================================================
// Export TypeScript Types
// ============================================================================

export type RequestContext = z.infer<typeof RequestContextSchema>;
export type ModuleRequest = z.infer<typeof ModuleRequestSchema>;
export type ModuleResponse = z.infer<typeof ModuleResponseSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export type PlatformAction = z.infer<typeof PlatformActionSchema>;
export type IntentAnalysis = z.infer<typeof IntentAnalysisSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

// ============================================================================
// Module Configuration Types
// ============================================================================

export interface ModuleConfig {
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  dependencies: string[];
  // Configuration for future agent extraction
  agentConfig?: {
    port?: number;
    healthCheck?: string;
    metrics?: {
      enabled: boolean;
      port?: number;
    };
    networking?: {
      protocol: 'http' | 'grpc';
      authentication: 'jwt' | 'api-key' | 'none';
      rateLimit?: string;
    };
  };
}

// ============================================================================
// Error Types
// ============================================================================

export class ModuleError extends Error {
  constructor(
    message: string,
    public readonly moduleId: string,
    public readonly errorCode: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ModuleError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: string[],
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AIError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly errorCode?: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'AIError';
  }
}