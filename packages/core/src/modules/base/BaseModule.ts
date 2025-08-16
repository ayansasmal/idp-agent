import {
  ModuleRequest,
  ModuleResponse,
  ValidationResult,
  HealthStatus,
  ModuleConfig,
  ModuleError,
} from '@/types';

/**
 * Base module interface that all modules must implement.
 * This interface is designed for zero-refactoring extraction to standalone agents.
 */
export abstract class BaseModule {
  abstract readonly config: ModuleConfig;
  abstract readonly capabilities: string[];

  // ============================================================================
  // Core Module Interface (Future Agent Interface)
  // ============================================================================

  /**
   * Process a module request - main entry point for all module operations
   */
  abstract process(request: ModuleRequest): Promise<ModuleResponse>;

  /**
   * Validate a request before processing
   */
  abstract validate(request: ModuleRequest): Promise<ValidationResult>;

  /**
   * Get module capabilities
   */
  getCapabilities(): string[] {
    return this.capabilities;
  }

  /**
   * Health check for module
   */
  async healthCheck(): Promise<HealthStatus> {
    return {
      status: 'healthy',
      checks: {
        module: {
          status: 'pass',
          message: `${this.config.name} module is operational`,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Extraction-Ready Methods (Future Agent Methods)
  // ============================================================================

  /**
   * Get network interface configuration for future agent extraction
   */
  getAgentConfig(): ModuleConfig['agentConfig'] {
    return this.config.agentConfig || {
      port: 3001,
      healthCheck: '/health',
      metrics: { enabled: true, port: 9001 },
      networking: {
        protocol: 'http',
        authentication: 'jwt',
        rateLimit: '100/minute',
      },
    };
  }

  /**
   * Get dependencies for agent extraction
   */
  getDependencies(): string[] {
    return this.config.dependencies;
  }

  // ============================================================================
  // Module Lifecycle Methods
  // ============================================================================

  /**
   * Initialize module - called when module starts
   */
  async initialize(): Promise<void> {
    // Override in subclasses for initialization logic
  }

  /**
   * Shutdown module - called when module stops
   */
  async shutdown(): Promise<void> {
    // Override in subclasses for cleanup logic
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Create successful response
   */
  protected createSuccessResponse(
    requestId: string,
    result: any,
    metadata: Record<string, any> = {}
  ): ModuleResponse {
    return {
      requestId,
      success: true,
      result,
      metadata: {
        module: this.config.name,
        timestamp: new Date().toISOString(),
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
    errors: string[],
    metadata: Record<string, any> = {}
  ): ModuleResponse {
    return {
      requestId,
      success: false,
      result: null,
      metadata: {
        module: this.config.name,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
      nextActions: [],
      errors,
      warnings: [],
    };
  }

  /**
   * Create validation result
   */
  protected createValidationResult(
    valid: boolean,
    errors: string[] = [],
    warnings: string[] = [],
    confidence: number = 1.0
  ): ValidationResult {
    return {
      valid,
      errors,
      warnings,
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  }

  /**
   * Validate request structure
   */
  protected validateRequestStructure(request: ModuleRequest): ValidationResult {
    const errors: string[] = [];

    if (!request.requestId) {
      errors.push('Request ID is required');
    }

    if (!request.action) {
      errors.push('Action is required');
    }

    if (!this.capabilities.includes(request.action)) {
      errors.push(`Action '${request.action}' not supported by ${this.config.name} module`);
    }

    if (!request.context?.userId) {
      errors.push('User context is required');
    }

    if (!request.context?.environment) {
      errors.push('Environment context is required');
    }

    return this.createValidationResult(errors.length === 0, errors);
  }

  /**
   * Execute action with error handling and logging
   */
  protected async executeWithErrorHandling<T>(
    requestId: string,
    operation: () => Promise<T>,
    operationName: string
  ): Promise<ModuleResponse> {
    try {
      const result = await operation();
      return this.createSuccessResponse(requestId, result, {
        operation: operationName,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // If it's a ModuleError, preserve the error details
      if (error instanceof ModuleError) {
        return this.createErrorResponse(requestId, [errorMessage], {
          operation: operationName,
          errorCode: error.errorCode,
          errorDetails: error.details,
        });
      }

      return this.createErrorResponse(requestId, [errorMessage], {
        operation: operationName,
      });
    }
  }

  /**
   * Check if action requires elevated permissions
   */
  protected requiresElevatedPermissions(action: string): boolean {
    const elevatedActions = ['delete', 'scale', 'deploy'];
    return elevatedActions.includes(action);
  }

  /**
   * Check user permissions for action
   */
  protected hasPermission(
    userPermissions: string[],
    requiredPermission: string
  ): boolean {
    return userPermissions.includes(requiredPermission) || userPermissions.includes('admin');
  }

  /**
   * Calculate confidence score based on validation results
   */
  protected calculateConfidence(errors: string[], warnings: string[]): number {
    if (errors.length > 0) return 0;
    if (warnings.length === 0) return 1.0;
    
    // Reduce confidence based on number of warnings
    const warningPenalty = Math.min(warnings.length * 0.1, 0.5);
    return Math.max(0.5, 1.0 - warningPenalty);
  }
}