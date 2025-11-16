// Shared types for Multi-Agent IDP Architecture

// Agent Communication Types
export interface AgentIntent {
  agent: 'infrastructure' | 'security' | 'workflow' | 'observability' | 'cicd';
  action: string;
  confidence: number;
  parameters: Record<string, any>;
  context?: string[];
}

/**
 * Context information for ongoing conversations with the Meta-Agent
 * 
 * Maintains conversation state, user identity, and history for multi-turn
 * interactions. Used by the Meta-Agent for context-aware responses and
 * by Qdrant for storing conversation memory.
 * 
 * @interface ConversationContext
 * @since 1.0.0
 * 
 * @example Web App Context
 * ```typescript
 * const context: ConversationContext = {
 *   conversationId: "conv-user123-20241201-001",
 *   userId: "user123",
 *   sessionId: "sess-web-abc456", 
 *   history: [
 *     {
 *       id: "msg-001",
 *       role: "user",
 *       content: "Deploy nginx to staging",
 *       timestamp: new Date(),
 *       metadata: { source: "web-chat" }
 *     }
 *   ],
 *   metadata: {
 *     source: "web-app",
 *     userAgent: "Mozilla/5.0...",
 *     permissions: ["deploy:staging", "read:all"],
 *     environment: "staging"
 *   }
 * };
 * ```
 * 
 * @example CLI Context  
 * ```typescript
 * const context: ConversationContext = {
 *   conversationId: "conv-cli-dev001",
 *   userId: "dev001", 
 *   sessionId: "sess-cli-terminal",
 *   history: [],
 *   metadata: {
 *     source: "cli",
 *     workingDirectory: "/home/user/project",
 *     kubeconfig: "/home/user/.kube/config",
 *     permissions: ["*"]
 *   }
 * };
 * ```
 */
export interface ConversationContext {
  /**
   * Unique identifier for this conversation thread
   * Used for context retrieval, history management, and Qdrant storage
   * @example "conv-user123-20241201-001"
   */
  conversationId: string;

  /**
   * Unique identifier for the user making requests
   * Used for RBAC, audit trails, and personalized responses
   * @example "user123" | "dev001" | "admin@company.com"
   */
  userId: string;

  /**
   * Session identifier for grouping related conversations
   * Different from conversationId - one session can have multiple conversations
   * @example "sess-web-abc456" | "sess-cli-terminal" | "sess-api-token"
   */
  sessionId: string;

  /**
   * Array of previous messages in this conversation for context continuity
   * Maintains conversation history for multi-turn interactions
   */
  history: ConversationMessage[];

  /**
   * Additional context metadata for specialized processing
   * @example { source: "web-app", permissions: ["deploy:staging"], environment: "staging" }
   */
  metadata: Record<string, any>;
}

/**
 * Individual message within a conversation thread
 * 
 * Represents a single turn in the conversation between user and assistant,
 * or system-generated messages for context and logging.
 * 
 * @interface ConversationMessage
 * @since 1.0.0
 * 
 * @example User Message
 * ```typescript
 * const userMessage: ConversationMessage = {
 *   id: "msg-001",
 *   role: "user",
 *   content: "Deploy nginx with 3 replicas to production",
 *   timestamp: new Date(),
 *   metadata: {
 *     source: "web-chat",
 *     messageType: "command",
 *     urgency: "normal"
 *   }
 * };
 * ```
 * 
 * @example Assistant Response
 * ```typescript
 * const assistantMessage: ConversationMessage = {
 *   id: "msg-002", 
 *   role: "assistant",
 *   content: "✅ Successfully deployed nginx to production with 3 replicas",
 *   timestamp: new Date(),
 *   metadata: {
 *     hasApproval: false,
 *     executionTime: 2500,
 *     agentsInvolved: ["infrastructure"],
 *     confidence: 0.96
 *   }
 * };
 * ```
 */
export interface ConversationMessage {
  /**
   * Unique identifier for this message
   * @example "msg-001" | "msg-user-20241201-14:30:25"
   */
  id: string;

  /**
   * Role of the message sender in the conversation
   * @example "user" for user inputs, "assistant" for AI responses, "system" for notifications
   */
  role: 'user' | 'assistant' | 'system';

  /**
   * Message content (text, commands, responses)
   * @example "Deploy nginx to staging" | "✅ Successfully deployed nginx"
   */
  content: string;

  /**
   * When this message was created
   */
  timestamp: Date;

  /**
   * Optional message-specific metadata for context and processing
   * @example { hasApproval: true, approvalId: "approval-123", executionTime: 1500 }
   */
  metadata?: Record<string, any>;
}

/**
 * Response structure returned by focused agents via MCP protocol
 * 
 * This interface standardizes communication between the Meta-Agent and
 * specialized focused agents (Infrastructure, Security, Workflow, Observability).
 * All agent responses must conform to this structure for proper web app integration.
 * 
 * @interface AgentResponse
 * @since 1.0.0
 * @version 1.1.0 - Added standardized metadata fields
 * 
 * @example
 * ```typescript
 * const agentResponse: AgentResponse = {
 *   agentId: "infrastructure",
 *   success: true,
 *   message: "✅ Successfully deployed nginx to staging",
 *   detailedResponse: "## Deployment Status\n\n- Pods: 3/3 Running...",
 *   data: {
 *     deployment: { name: "nginx", replicas: 3 },
 *     pods: [...]
 *   },
 *   metadata: {
 *     agent: "infrastructure",
 *     action: "deploy", 
 *     executionTime: 2500,
 *     approvalId: "approval-123", // If approval was required
 *     confidence: 0.95,
 *     riskLevel: "medium"
 *   }
 * };
 * ```
 */
export interface AgentResponse {
  /**
   * Unique identifier of the focused agent that generated this response
   * @example "infrastructure" | "security" | "workflow" | "observability"
   */
  agentId: string;

  /**
   * Indicates whether the agent operation completed successfully
   * @example true for successful operations, false for failures
   */
  success: boolean;

  /**
   * Human-readable status message for display in chat interface
   * @example "✅ Successfully deployed nginx to staging"
   * @example "❌ Failed to deploy: insufficient permissions"
   */
  message: string;

  /**
   * Optional rich markdown content for expanded UI display
   * Contains detailed information like pod status, logs, troubleshooting steps
   * @example "## Deployment Status\n\n- Pods: 3/3 Running\n- Service: nginx-svc (LoadBalancer)"
   */
  detailedResponse?: string;

  /**
   * Structured data payload for programmatic consumption
   * Contains raw API responses, resource objects, metrics, etc.
   * @example { deployment: {...}, pods: [...], services: [...] }
   */
  data: any;

  /**
   * Execution and context metadata for request tracking and UI integration
   */
  metadata: {
    /** Source agent identifier */
    agent: string;

    /** Specific action/operation that was performed */
    action: string;

    /** Whether detailedResponse field contains markdown content */
    hasDetailedResponse: boolean;

    /** Operation execution time in milliseconds */
    executionTime: number;

    /** Array of context item IDs used for this operation */
    contextUsed: string[];

    /** 
     * Approval request ID if human approval was required
     * Used by web app to link to approval details page
     * @example "approval-abc123"
     */
    approvalId?: string;

    /** 
     * AI confidence score for the operation (0-1)
     * Used for uncertainty indicators in UI
     * @example 0.95 for high confidence, 0.3 for low confidence
     */
    confidence?: number;

    /** 
     * Risk level assessment for the operation
     * Determines approval requirements and UI warnings
     * @example "low" | "medium" | "high" | "critical"
     */
    riskLevel?: string;

    /** 
     * Action ID for distributed action tracking
     * Used when operations are routed through Action Manager
     * @example "action-abc123"
     */
    actionId?: string;

    /** 
     * Whether distributed action tracking is enabled for this operation
     * Used by UI to show tracking capabilities
     */
    trackingEnabled?: boolean;
  };

  /** 
   * Array of error messages if operation failed
   * @example ["Permission denied for namespace 'production'", "Invalid resource configuration"]
   */
  errors?: string[];

  /** 
   * Array of warning messages for successful operations with caveats
   * @example ["Deployment succeeded but health check is pending", "Resource limits not specified"]
   */
  warnings?: string[];
}

/**
 * Final response returned to users by the Meta-Agent system
 * 
 * This is the primary interface for Meta-Agent responses, used by web applications,
 * APIs, and CLI interfaces. It aggregates responses from multiple focused agents
 * into a cohesive user-facing format with rich metadata for UI integration.
 * 
 * @interface UserResponse
 * @since 1.0.0
 * @version 1.1.0 - Added approval workflow integration fields
 * 
 * @example Successful Deployment Response
 * ```typescript
 * const response: UserResponse = {
 *   success: true,
 *   message: "✅ Successfully deployed nginx to production",
 *   detailedResponse: "## Deployment Status\n\n- Pods: 3/3 Running\n- Service: LoadBalancer...",
 *   data: {
 *     deployment: { name: "nginx", replicas: 3, status: "Running" },
 *     pods: [...],
 *     services: [...]
 *   },
 *   confidence: 0.96,
 *   riskLevel: "low",
 *   metadata: {
 *     agentsInvolved: ["infrastructure"],
 *     totalExecutionTime: 2500,
 *     contextStored: true
 *   }
 * };
 * ```
 * 
 * @example Approval Required Response
 * ```typescript
 * const response: UserResponse = {
 *   success: false,
 *   message: "⏳ Approval required for high-risk production deployment",
 *   detailedResponse: "## Approval Required\n\nThis operation requires approval...",
 *   approvalId: "approval-abc123",
 *   confidence: 0.85,
 *   riskLevel: "high",
 *   metadata: {
 *     agentsInvolved: ["infrastructure", "security"],
 *     totalExecutionTime: 1200,
 *     contextStored: true,
 *     approvalId: "approval-abc123"
 *   }
 * };
 * ```
 */
export interface UserResponse {
  /**
   * Indicates whether the overall operation completed successfully
   * False when approval is required, errors occurred, or operation was blocked
   * @example true for successful operations, false for failures or pending approval
   */
  success: boolean;

  /**
   * Primary user-facing message summarizing the operation result
   * Displayed prominently in chat interfaces and notifications
   * @example "✅ Successfully deployed nginx to production"
   * @example "⏳ Approval required for high-risk production deployment"
   * @example "❌ Deployment failed: insufficient permissions"
   */
  message: string;

  /**
   * Optional rich markdown content providing detailed operation information
   * Used by web apps for expandable detail sections with formatting
   * @example "## Deployment Status\n\n- Pods: 3/3 Running\n- Service: nginx-svc..."
   */
  detailedResponse?: string;

  /**
   * Structured data payload containing operation results and resource information
   * Used for programmatic processing, charts, and detailed UI components
   * @example { deployment: {...}, pods: [...], services: [...], metrics: {...} }
   */
  data?: any;

  /**
   * Array of recommended or required follow-up actions
   * Each action contains type, description, and parameters for execution
   * @example [{ type: "scale", description: "Scale to 5 replicas", params: {...} }]
   */
  actions?: any[];

  /**
   * Approval request identifier when human approval is required
   * Used by web app to link to approval details page and track approval status
   * @example "approval-abc123"
   */
  approvalId?: string;

  /**
   * AI confidence score for the operation result (0-1 scale)
   * Higher scores indicate more certainty in the AI's assessment and actions
   * @example 0.95 for high confidence, 0.3 for low confidence operations
   */
  confidence?: number;

  /**
   * Risk level assessment for the operation
   * Determines UI warnings, approval requirements, and safety measures
   * @example "low" | "medium" | "high" | "critical"
   */
  riskLevel?: string;

  /**
   * Execution metadata for tracking, debugging, and UI integration
   */
  metadata: {
    /** 
     * Array of focused agents that participated in processing this request
     * @example ["infrastructure", "security"] 
     */
    agentsInvolved: string[];

    /** 
     * Total execution time across all agents in milliseconds
     * @example 2500 for 2.5 second execution
     */
    totalExecutionTime: number;

    /** 
     * Whether the conversation context was stored in Qdrant for future learning
     * @example true when context successfully stored, false on storage failures
     */
    contextStored: boolean;

    /** 
     * Duplicate approval ID in metadata for backward compatibility
     * @example "approval-abc123"
     */
    approvalId?: string;

    /** 
     * Duplicate confidence score in metadata for backward compatibility
     * @example 0.95
     */
    confidence?: number;

    /** 
     * Duplicate risk level in metadata for backward compatibility  
     * @example "high"
     */
    riskLevel?: string;

    /** 
     * Duplicate actions array in metadata for backward compatibility
     * @example [{ type: "monitor", description: "Monitor deployment health" }]
     */
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

/**
 * Capabilities and metadata for registering focused agents with the Meta-Agent
 * 
 * This interface defines the complete specification for a focused agent,
 * including its identity, supported operations, domain expertise, and
 * communication endpoints. Used during agent registration to enable
 * the Meta-Agent to route appropriate requests.
 * 
 * @interface AgentCapabilities
 * @since 1.0.0
 * 
 * @example Infrastructure Agent Capabilities
 * ```typescript
 * const infrastructureCapabilities: AgentCapabilities = {
 *   agentId: "infrastructure",
 *   name: "Infrastructure Agent",
 *   description: "Kubernetes operations and cloud resource management",
 *   tools: [
 *     {
 *       name: "deployApplication",
 *       description: "Deploy applications to Kubernetes clusters",
 *       parameters: {
 *         type: "object",
 *         properties: {
 *           containerImage: { type: "string", description: "Docker image to deploy" },
 *           replicas: { type: "number", description: "Number of pod replicas" }
 *         },
 *         required: ["containerImage"]
 *       }
 *     },
 *     {
 *       name: "scaleApplication", 
 *       description: "Scale existing Kubernetes deployments",
 *       parameters: {  }
 *     }
 *   ],
 *   specializations: ["kubernetes", "deployment", "scaling", "cloud-provisioning"],
 *   endpoints: {
 *     mcp: "http://localhost:3003/mcp",
 *     health: "http://localhost:3003/health"
 *   }
 * };
 * ```
 * 
 * @example Security Agent Capabilities
 * ```typescript
 * const securityCapabilities: AgentCapabilities = {
 *   agentId: "security",
 *   name: "Security Agent",
 *   description: "Security scanning, policy validation, and compliance checks",
 *   tools: [
 *     { name: "scanContainer", description: "Scan container images for vulnerabilities" },
 *     { name: "validatePolicy", description: "Validate against security policies" }
 *   ],
 *   specializations: ["security-scanning", "compliance", "policy-validation"],
 *   endpoints: {
 *     mcp: "http://localhost:3004/mcp", 
 *     health: "http://localhost:3004/health"
 *   }
 * };
 * ```
 */
export interface AgentCapabilities {
  /**
   * Unique identifier for this agent within the Multi-Agent system
   * Used for routing, logging, and agent management
   * @example "infrastructure" | "security" | "workflow" | "observability"
   */
  agentId: string;

  /**
   * Human-readable name for the agent
   * Displayed in logs, UI, and documentation
   * @example "Infrastructure Agent" | "Security Agent"
   */
  name: string;

  /**
   * Detailed description of the agent's purpose and capabilities
   * Used for documentation and agent selection logic
   * @example "Kubernetes operations and cloud resource management"
   */
  description: string;

  /**
   * Array of tools/operations this agent can perform
   * Each tool defines a specific operation with parameters and validation
   */
  tools: ToolDefinition[];

  /**
   * Array of domain specializations for intelligent routing
   * Used by the Meta-Agent to determine which agent to use for specific requests
   * @example ["kubernetes", "deployment", "scaling"] for Infrastructure Agent
   * @example ["security-scanning", "compliance"] for Security Agent
   */
  specializations: string[];

  /**
   * Communication endpoints for agent interaction
   */
  endpoints: {
    /**
     * MCP (Model Context Protocol) endpoint for tool execution
     * @example "http://localhost:3003/mcp"
     */
    mcp: string;

    /**
     * Health check endpoint for monitoring agent availability
     * @example "http://localhost:3003/health"
     */
    health: string;
  };
}

/**
 * Definition of a specific tool/operation that an agent can perform
 * 
 * Tools represent the atomic operations that focused agents expose to
 * the Meta-Agent. Each tool has a well-defined interface with parameters,
 * validation rules, and documentation.
 * 
 * @interface ToolDefinition
 * @since 1.0.0
 * 
 * @example Deploy Application Tool
 * ```typescript
 * const deployTool: ToolDefinition = {
 *   name: "deployApplication",
 *   description: "Deploy containerized applications to Kubernetes with comprehensive validation",
 *   parameters: {
 *     type: "object",
 *     properties: {
 *       containerImage: {
 *         type: "string",
 *         description: "Docker container image to deploy",
 *         pattern: "^[a-z0-9]+(\\.[a-z0-9]+)*(\\/[a-z0-9]+)*:[a-z0-9]+$"
 *       },
 *       replicas: {
 *         type: "number", 
 *         description: "Number of pod replicas to create",
 *         minimum: 1,
 *         maximum: 100,
 *         default: 1
 *       },
 *       namespace: {
 *         type: "string",
 *         description: "Kubernetes namespace for deployment",
 *         default: "default"
 *       }
 *     },
 *     required: ["containerImage"],
 *     additionalProperties: false
 *   }
 * };
 * ```
 */
export interface ToolDefinition {
  /**
   * Unique name for this tool within the agent
   * Used for routing and tool selection
   * @example "deployApplication" | "scaleApplication" | "scanContainer"
   */
  name: string;

  /**
   * Human-readable description of what this tool does
   * Used for documentation and AI agent selection
   * @example "Deploy containerized applications to Kubernetes with comprehensive validation"
   */
  description: string;

  /**
   * JSON Schema definition for tool parameters
   * Defines required and optional parameters with validation rules
   * @example { type: "object", properties: { name: { type: "string" } }, required: ["name"] }
   */
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
  serverPort?: number;
  clientTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
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