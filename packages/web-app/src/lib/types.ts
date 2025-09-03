import { z } from 'zod';

export const ApprovalSchema = z.object({
  id: z.string(),
  state: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']),
  resource: z.string(),
  action: z.string(),
  parameters: z.record(z.string(), z.any()),
  diff: z.string(),
  explanation: z.string(),
  rollbackPlan: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  estimatedImpact: z.string(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
  createdBy: z.string(),
  reviewedAt: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewNotes: z.string().optional(),
});

export type Approval = z.infer<typeof ApprovalSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  detailedContent: z.string().optional(),
  rawData: z.any().optional(),
  // Action tracking fields
  actionId: z.string().optional(),
  actionStatus: z.enum(['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled']).optional(),
  progress: z.number().min(0).max(100).optional(),
  estimatedDuration: z.number().optional(),
  trackingEnabled: z.boolean().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const OperationRequestSchema = z.object({
  userInput: z.string(),
  context: z.object({
    userId: z.string(),
    environment: z.enum(['development', 'staging', 'production']),
    permissions: z.array(z.string()),
  }),
});

export type OperationRequest = z.infer<typeof OperationRequestSchema>;

// Action Tracking Types
export const ActionStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled']);
export type ActionStatus = z.infer<typeof ActionStatusSchema>;

export const ActionIntentSchema = z.enum(['deploy', 'scale', 'monitor', 'investigate', 'orchestrate', 'approve', 'ai-generate']);
export type ActionIntent = z.infer<typeof ActionIntentSchema>;

export const AgentNameSchema = z.enum(['infrastructure', 'observability', 'meta']);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const ActionRecordSchema = z.object({
  actionId: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  conversationId: z.string(),
  agentName: AgentNameSchema,
  toolName: z.string(),
  intent: ActionIntentSchema,
  status: ActionStatusSchema,
  progress: z.number().min(0).max(100),
  startTime: z.string(),
  lastUpdate: z.string(),
  completedTime: z.string().optional(),
  executionMetadata: z.object({
    toolParameters: z.record(z.string(), z.any()).optional(),
    environment: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    retryCount: z.number(),
    estimatedDuration: z.number().optional(),
    actualDuration: z.number().optional(),
  }),
  result: z.object({
    success: z.boolean(),
    data: z.any(),
    error: z.string().optional(),
    executionTime: z.number(),
    resourcesCreated: z.array(z.string()),
  }).optional(),
});

export type ActionRecord = z.infer<typeof ActionRecordSchema>;

export const ActionUpdateSchema = z.object({
  actionId: z.string(),
  status: ActionStatusSchema.optional(),
  progress: z.number().min(0).max(100).optional(),
  result: z.object({
    success: z.boolean(),
    data: z.any(),
    error: z.string().optional(),
    executionTime: z.number(),
    resourcesCreated: z.array(z.string()),
  }).optional(),
});

export type ActionUpdate = z.infer<typeof ActionUpdateSchema>;

// WebSocket Message Types
export const WebSocketMessageSchema = z.object({
  type: z.enum(['action-update', 'action-complete', 'system-message', 'error']),
  payload: z.any(),
  timestamp: z.string(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
});

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

// UI Component Types
export interface ActionTrackingProps {
  actionId?: string;
  onActionUpdate?: (update: ActionUpdate) => void;
  showProgress?: boolean;
  showDetails?: boolean;
}

export interface ActionDashboardFilters {
  status?: ActionStatus[];
  agent?: AgentName[];
  dateRange?: {
    start: string;
    end: string;
  };
  limit?: number;
}