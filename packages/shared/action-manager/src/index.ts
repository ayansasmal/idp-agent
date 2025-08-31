/**
 * Action Manager Package - Main Export
 * 
 * Distributed action tracking system for AI-IDP platform
 */

// Core Types
export * from './types/ActionTypes';

// Services
export { ActionManager } from './services/ActionManager';
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