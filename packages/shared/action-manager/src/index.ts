/**
 * Action Manager Package - Main Export
 * 
 * Distributed action tracking system for AI-IDP platform
 */

// Core Types
export * from './types/ActionTypes';

// Services
export { ActionManager, type ActionManagerConfig } from './services/ActionManager';
export { 
  ActionManagerService, 
  getActionManagerService, 
  initializeActionManagerService,
  type ActionManagerServiceConfig,
  type ActionEventCallbacks
} from './services/ActionManagerService';

// Queue System
export { 
  ActionQueue, 
  InMemoryActionQueue,
  type ActionQueueJob,
  type ActionQueueResult,
  type ActionQueueEventHandlers
} from './queue/ActionQueue';

// Database Clients
export { 
  DynamoDBClientFactory,
  createAndTestDynamoDBClient,
  type DynamoDBFactoryConfig
} from './clients/DynamoDBClientFactory';

// Action Registry
export { ActionRegistry } from './registry/ActionRegistry';

// Worker Framework
export { 
  ActionWorker, 
  WorkerFactory,
  type WorkerContext,
  type ToolExecutionResult,
  type ValidationResult,
  type WorkerStats
} from './workers/ActionWorker';
export { InfrastructureWorker, type K8sResourceStatus } from './workers/InfrastructureWorker';
export { 
  ObservabilityWorker,
  type LogAnalysisResult,
  type MetricsAnalysisResult,
  type HealthCheckResult
} from './workers/ObservabilityWorker';
export { 
  MetaWorker,
  type OrchestrationStep,
  type OrchestrationResult,
  type ApprovalRequest
} from './workers/MetaWorker';
export { 
  WorkerManager,
  type WorkerPoolConfig,
  type ActiveWorker,
  type WorkerExecutionResult
} from './workers/WorkerManager';

// Storage classes (legacy)
export * from './storage/TableSetup';

// Convenience exports for common patterns
export {
  ActionStatus,
  ActionType,
  ActionIntent,
  AgentName
} from './types/ActionTypes';

/**
 * Package version and info
 */
export const ACTION_MANAGER_VERSION = '2.0.0';
export const ACTION_MANAGER_NAME = '@ai-idp/action-manager';