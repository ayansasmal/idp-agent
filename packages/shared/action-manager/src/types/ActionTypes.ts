/**
 * Core types for the distributed action tracking system
 */

export enum ActionStatus {
  PENDING = 'pending',
  RUNNING = 'running', 
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled'
}

export enum ActionType {
  // Infrastructure Actions
  DEPLOY = 'deploy',
  SCALE = 'scale',
  STATUS_CHECK = 'status-check',
  GET_LOGS = 'get-logs',
  PROVISION_DB = 'provision-db',
  // AI-Powered Infrastructure Actions
  AI_KUBECTL_COMMAND = 'ai-kubectl-command',
  AI_K8S_MANIFEST = 'ai-k8s-manifest',
  // Observability Actions  
  ANALYZE_LOGS = 'analyze-logs',
  MONITOR_METRICS = 'monitor-metrics',
  INVESTIGATE_INCIDENT = 'investigate-incident',
  HEALTH_CHECK = 'health-check',
  // Meta Actions
  ORCHESTRATE = 'orchestrate',
  REQUEST_APPROVAL = 'request-approval'
}

export enum ActionIntent {
  DEPLOY = 'deploy',
  SCALE = 'scale', 
  MONITOR = 'monitor',
  INVESTIGATE = 'investigate',
  ORCHESTRATE = 'orchestrate',
  APPROVE = 'approve',
  AI_GENERATE = 'ai-generate' // For AI-powered generation tasks
}

export enum AgentName {
  INFRASTRUCTURE = 'infrastructure',
  OBSERVABILITY = 'observability', 
  META = 'meta'
}

export interface ActionIntentDetails {
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
  toolParameters?: Record<string, any>;
  environment?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  retryCount: number;
  lastRetryTime?: string;
  lastStatusMessage?: string;
  errorHistory?: Array<{
    timestamp: string;
    error: string;
    retryable: boolean;
  }>;
  workerId?: string;                    // Which worker is handling this
  estimatedDuration?: number;           // Expected completion time
  actualDuration?: number;              // Actual completion time
  orchestrationData?: any;              // For meta agent orchestration
  approvalData?: any;                   // For approval workflows
}

export interface ActionResult {
  success: boolean;
  data: any;
  error?: string | null;
  executionTime: number;
  resourcesCreated: string[];
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
  userId: string;
  sessionId: string;
  conversationId: string;
  agentName: AgentName;
  toolName: string;
  intent: ActionIntent;
  toolParameters?: Record<string, any>;
  environment?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  parentActionId?: string;
}

/**
 * Request to update an existing action
 */
export interface UpdateActionRequest {
  status?: ActionStatus;
  progress?: number;
  result?: ActionResult;
  executionMetadata?: Partial<ExecutionMetadata>;
  addChildActionId?: string;
}

/**
 * Options for querying actions
 */
export interface ActionQueryOptions {
  limit?: number;
  offset?: number;
  sortOrder?: 'asc' | 'desc';
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