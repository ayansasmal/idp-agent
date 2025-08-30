/**
 * Core types for the distributed action tracking system
 */

export type ActionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';

export type ActionType = 
  // Infrastructure Actions
  | 'deploy' 
  | 'scale' 
  | 'status-check' 
  | 'get-logs' 
  | 'provision-db'
  // Observability Actions  
  | 'analyze-logs' 
  | 'monitor-metrics' 
  | 'investigate-incident' 
  | 'health-check'
  // Meta Actions
  | 'orchestrate' 
  | 'request-approval';

export type AgentName = 'infrastructure' | 'observability' | 'meta';

export interface ActionIntent {
  operation: string;                    // "deploy", "scale", "investigate"
  resource: string;                     // "nginx", "postgresql-db"  
  namespace?: string;                   // "production", "staging"
  parameters: Record<string, any>;      // Tool-specific parameters
}

export interface CompletionCriteria {
  type: 'resource_ready' | 'analysis_complete' | 'immediate';
  validationCommand?: string;           // kubectl get deployment...
  expectedResult?: any;                 // Expected validation result
  checkInterval?: number;               // Validation check interval in ms
}

export interface ValidationRule {
  command: string;                      // Command to execute for validation
  interval: number;                     // How often to check (ms)
  parser: string;                       // How to parse the result
  expectedResult: any;                  // What constitutes success
}

export interface RollbackAction {
  type: 'delete_resource' | 'revert_config' | 'custom';
  command?: string;                     // Rollback command
  toolName?: string;                    // Tool to call for rollback
  parameters?: Record<string, any>;     // Rollback parameters
}

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;                   // Initial delay in ms
  backoffMultiplier: number;            // Exponential backoff
  retryableErrors: string[];            // Error patterns that allow retry
}

export interface ExecutionMetadata {
  retryCount: number;
  lastRetryTime?: string;
  errorHistory: Array<{
    timestamp: string;
    error: string;
    retryable: boolean;
  }>;
  workerId?: string;                    // Which worker is handling this
  estimatedDuration?: number;           // Expected completion time
  actualDuration?: number;              // Actual completion time
}

export interface ActionResult {
  success: boolean;
  message: string;
  data: any;
  detailedResponse?: string;
  metrics?: {
    executionTime: number;
    resourcesUsed: Record<string, any>;
    errorCount: number;
  };
}

/**
 * Core Action Record - stored in DynamoDB
 */
export interface ActionRecord {
  // Primary Key
  actionId: string;                     // action_deploy_abc123
  
  // User/Session Context  
  userId: string;                       // web-user-123
  sessionId: string;                    // session_xyz789
  conversationId: string;               // Maps to chat conversation
  
  // Action Definition
  actionType: ActionType;
  agentName: AgentName;
  toolName: string;                     // deployApplication, analyzeLogs, etc.
  
  // Action Details
  intent: ActionIntent;
  
  // State Management
  status: ActionStatus;
  progress: number;                     // 0-100
  startTime: string;                    // ISO timestamp
  lastUpdate: string;                   // ISO timestamp
  completedTime?: string;               // ISO timestamp
  
  // Execution Details
  executionMetadata: ExecutionMetadata;
  
  // Completion & Validation
  completionCriteria: CompletionCriteria;
  
  // Results
  result?: ActionResult;
  
  // Relationships
  parentActionId?: string;              // For dependent actions
  childActionIds?: string[];            // Actions triggered by this one
  
  // DynamoDB TTL
  ttl: number;                         // Unix timestamp for automatic cleanup
}

/**
 * User Session Record - tracks active actions per session
 */
export interface UserSessionRecord {
  // Primary Key
  sessionId: string;
  
  // User Info
  userId: string;
  environment: string;                  // Current namespace
  permissions: string[];
  
  // Active Actions
  activeActions: string[];              // Array of actionIds
  recentActions: string[];              // Last 10 completed actions
  
  // Session Context
  createdAt: string;
  lastActivity: string;
  metadata: Record<string, any>;
  
  // DynamoDB TTL
  ttl: number;                         // 7 days
}

/**
 * Action Definition Template
 */
export interface ActionDefinition {
  actionType: ActionType;
  tool: string;                        // Underlying tool/method name
  defaultTimeout: number;              // Default timeout in ms
  completionCriteria: CompletionCriteria;
  rollback?: RollbackAction;
  retryPolicy: RetryConfig;
  estimatedDuration: number;           // Expected duration in ms
  resourceRequirements?: {
    cpu?: string;
    memory?: string;
    storage?: string;
  };
}

/**
 * Request to create a new action
 */
export interface CreateActionRequest {
  actionType: ActionType;
  agentName: AgentName;
  toolName: string;
  userId: string;
  sessionId: string;
  conversationId: string;
  intent: ActionIntent;
  parentActionId?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Follow-up action options for UI
 */
export interface FollowUpAction {
  id: string;
  label: string;
  description: string;
  action: 'continue' | 'investigate' | 'manual-check' | 'cancel' | 'retry';
  icon: string;
  actionType?: ActionType;              // If this creates a new action
  parameters?: Record<string, any>;     // Parameters for the new action
}