// Shared types for Multi-Agent IDP Architecture

// Agent Communication Types
export interface AgentIntent {
  agent: 'infrastructure' | 'security' | 'workflow' | 'observability' | 'cicd';
  action: string;
  confidence: number;
  parameters: Record<string, any>;
  context?: string[];
}

export interface ConversationContext {
  conversationId: string;
  userId: string;
  sessionId: string;
  history: ConversationMessage[];
  metadata: Record<string, any>;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AgentResponse {
  agentId: string;
  success: boolean;
  message: string;
  detailedResponse?: string;
  data: any;
  metadata: {
    agent: string;
    action: string;
    hasDetailedResponse: boolean;
    executionTime: number;
    contextUsed: string[];
    // Standardized fields for web app compatibility
    approvalId?: string;
    confidence?: number;
    riskLevel?: string;
  };
  errors?: string[];
  warnings?: string[];
}

export interface UserResponse {
  success: boolean;
  message: string;
  detailedResponse?: string;
  data?: any;
  actions?: any[];
  approvalId?: string;
  confidence?: number;
  riskLevel?: string;
  metadata: {
    agentsInvolved: string[];
    totalExecutionTime: number;
    contextStored: boolean;
    approvalId?: string;
    confidence?: number;
    riskLevel?: string;
    actions?: any[];
  };
}

// Vector Database Types
export interface ContextVector {
  id: string;
  vector: number[];
  payload: {
    type: 'conversation' | 'decision' | 'execution' | 'pattern';
    agent: string;
    timestamp: string;
    content: string;
    metadata: Record<string, any>;
  };
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: ContextVector['payload'];
}

export interface ContextRetrievalQuery {
  query: string;
  type?: ContextVector['payload']['type'];
  agent?: string;
  limit?: number;
  scoreThreshold?: number;
}

// MCP Protocol Types
export interface MCPRequest {
  method: string;
  params: Record<string, any>;
  id: string;
  context: ConversationContext;
}

export interface MCPResponse {
  result?: any;
  error?: MCPError;
  id: string;
  metadata: {
    agent: string;
    executionTime: number;
    contextUsed?: string[];
  };
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface AgentCapabilities {
  agentId: string;
  name: string;
  description: string;
  tools: ToolDefinition[];
  specializations: string[];
  endpoints: {
    mcp: string;
    health: string;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

// Agent-Specific Types
export interface InfrastructureOperation {
  type: 'deploy' | 'scale' | 'status' | 'logs' | 'rollback' | 'provision';
  resource: string;
  parameters: Record<string, any>;
  environment: 'development' | 'staging' | 'production';
}

export interface SecurityAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  findings: SecurityFinding[];
  recommendations: string[];
  complianceStatus: 'compliant' | 'non-compliant' | 'warning';
}

export interface SecurityFinding {
  type: 'vulnerability' | 'policy_violation' | 'misconfiguration';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affected: string[];
  remediation: string;
}

export interface WorkflowExecution {
  workflowId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: WorkflowStep[];
  approvals: ApprovalRequest[];
  notifications: NotificationResult[];
}

export interface WorkflowStep {
  stepId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  agent?: string;
  action?: string;
  result?: any;
  startTime?: Date;
  endTime?: Date;
}

export interface ApprovalRequest {
  approvalId: string;
  title: string;
  description: string;
  riskLevel: SecurityAssessment['riskLevel'];
  requester: string;
  approvers: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  context: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationResult {
  notificationId: string;
  channel: 'slack' | 'email' | 'webhook';
  recipient: string;
  status: 'sent' | 'failed' | 'pending';
  timestamp: Date;
  message: string;
}

// Performance & Monitoring Types
export interface PerformanceMetrics {
  agentResponseTime: number;
  contextRetrievalTime: number;
  mcpCommunicationTime: number;
  totalExecutionTime: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface HealthStatus {
  healthy: boolean;
  services: ServiceHealth[];
  lastCheck: Date;
  uptime: number;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  lastCheck: Date;
  details?: Record<string, any>;
}

// Configuration Types
export interface AgentConfig {
  agentId: string;
  name: string;
  llmProvider: 'anthropic' | 'openai' | 'local';
  llmModel: string;
  maxTokens: number;
  temperature: number;
  qdrantConfig: QdrantConfig;
  mcpConfig: MCPConfig;
}

export interface QdrantConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
  vectorSize: number;
  timeout: number;
}

export interface MCPConfig {
  serverPort: number;
  clientTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

// Multi-Agent Workflow Types
export interface MultiAgentWorkflow {
  workflowId: string;
  name: string;
  agents: string[];
  steps: MultiAgentStep[];
  dependencies: WorkflowDependency[];
  context: ConversationContext;
}

export interface MultiAgentStep {
  stepId: string;
  agent: string;
  action: string;
  parameters: Record<string, any>;
  dependencies: string[];
  timeout: number;
}

export interface WorkflowDependency {
  fromStep: string;
  toStep: string;
  condition?: string;
  dataMapping?: Record<string, string>;
}