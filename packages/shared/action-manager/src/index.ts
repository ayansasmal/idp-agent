/**
 * Action Manager - Distributed Action Tracking System
 * Entry point for the action tracking system
 */

// Export core types
export * from './types/ActionTypes';

// Export storage classes
export * from './storage/TableSetup';

// Export registry
export * from './registry/ActionRegistry';

// Main exports that will be implemented
// export * from './manager/ActionManager';
// export * from './workers/ActionWorker';

/**
 * Package version and info
 */
export const ACTION_MANAGER_VERSION = '1.0.0';
export const ACTION_MANAGER_NAME = '@ai-idp/action-manager';