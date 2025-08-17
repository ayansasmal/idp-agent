import { ModuleRequest, ModuleResponse } from '../../types';

/**
 * Simplified Base Module for Phase 2 implementation
 */
export abstract class BaseModule {
  
  /**
   * Process a module request - main entry point
   */
  abstract process(request: ModuleRequest): Promise<ModuleResponse>;

  /**
   * Get module capabilities
   */
  abstract getCapabilities(): string[];

  /**
   * Initialize module
   */
  async initialize(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Shutdown module
   */
  async shutdown(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Get module health
   */
  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    return {
      status: 'healthy',
      message: 'Module operational'
    };
  }
}