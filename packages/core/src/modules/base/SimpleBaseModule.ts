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

  /**
   * Create successful response
   */
  protected createSuccessResponse(
    requestId: string,
    result: any,
    message?: string,
    metadata: Record<string, any> = {}
  ): ModuleResponse {
    const timestamp = new Date().toISOString();
    return {
      requestId,
      success: true,
      result,
      message: message || `Operation completed successfully`,
      timestamp,
      metadata: {
        timestamp,
        ...metadata,
      },
      nextActions: [],
      errors: [],
      warnings: [],
    };
  }

  /**
   * Create error response
   */
  protected createErrorResponse(
    requestId: string,
    errors: string | string[],
    metadata: Record<string, any> = {}
  ): ModuleResponse {
    const timestamp = new Date().toISOString();
    const errorArray = Array.isArray(errors) ? errors : [errors];
    return {
      requestId,
      success: false,
      result: null,
      message: `Operation failed: ${errorArray.join('; ')}`,
      timestamp,
      metadata: {
        timestamp,
        ...metadata,
      },
      nextActions: [],
      errors: errorArray,
      warnings: [],
    };
  }

  /**
   * Create custom response with all fields
   */
  protected createCustomResponse(
    requestId: string,
    success: boolean,
    result: any,
    message: string,
    metadata: Record<string, any> = {},
    data?: any,
    detailedResponse?: string,
    nextActions: any[] = [],
    errors: string[] = [],
    warnings: string[] = []
  ): ModuleResponse {
    return {
      requestId,
      success,
      result,
      metadata,
      nextActions,
      errors,
      warnings,
      message,
      detailedResponse,
      timestamp: new Date().toISOString(),
      data
    };
  }
}