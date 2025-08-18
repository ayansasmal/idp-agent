import { z } from 'zod';

export const ApprovalSchema = z.object({
  id: z.string(),
  state: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  resource: z.string(),
  action: z.string(),
  parameters: z.record(z.any()),
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
  metadata: z.record(z.any()).optional(),
  detailedContent: z.string().optional(),
  rawData: z.any().optional(),
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