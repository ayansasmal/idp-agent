import { BaseModule } from './BaseModule';
import { 
  ModuleRequest, 
  ModuleResponse, 
  ModuleError,
  RequestContext,
} from '@/types';
import { Logger, CorrelationLogger } from '@/shared/logger/Logger';

/**
 * Module Communication Layer
 * Handles routing and communication between modules
 * Designed to work with both local method calls (Phase 1) and network calls (Phase 2)
 */
export class ModuleCommunicationLayer {
  private modules = new Map<string, BaseModule>();
  private logger = new Logger('ModuleCommunication');

  constructor() {
    this.setupModules();
  }

  /**
   * Register modules - to be called during initialization
   */
  private setupModules(): void {
    // Modules will be registered dynamically during startup
    // This allows for easy addition/removal of modules
  }

  /**
   * Register a module
   */
  registerModule(name: string, module: BaseModule): void {
    this.modules.set(name, module);
    this.logger.info(`Module registered: ${name}`, {
      capabilities: module.getCapabilities(),
    });
  }

  /**
   * Unregister a module
   */
  unregisterModule(name: string): void {
    if (this.modules.has(name)) {
      this.modules.delete(name);
      this.logger.info(`Module unregistered: ${name}`);
    }
  }

  /**
   * Send request to a specific module
   * In Phase 1: Direct method call
   * In Phase 2: This becomes a network call
   */
  async sendRequest(request: ModuleRequest): Promise<ModuleResponse> {
    const correlationLogger = CorrelationLogger.fromRequest(
      request.requestId,
      request.context.userId,
      'ModuleCommunication'
    );

    // Validate request
    const validatedRequest = this.validateRequest(request);

    // Get target module
    const targetModule = this.modules.get(validatedRequest.module);
    if (!targetModule) {
      const error = `Module '${validatedRequest.module}' not found`;
      correlationLogger.error(error, undefined, { 
        availableModules: Array.from(this.modules.keys()),
        request: validatedRequest 
      });
      
      throw new ModuleError(
        error,
        validatedRequest.module,
        'MODULE_NOT_FOUND',
        { availableModules: Array.from(this.modules.keys()) }
      );
    }

    // Check if module supports the requested action
    if (!targetModule.getCapabilities().includes(validatedRequest.action)) {
      const error = `Action '${validatedRequest.action}' not supported by module '${validatedRequest.module}'`;
      correlationLogger.error(error, undefined, {
        availableCapabilities: targetModule.getCapabilities(),
        request: validatedRequest
      });
      
      throw new ModuleError(
        error,
        validatedRequest.module,
        'ACTION_NOT_SUPPORTED',
        { availableCapabilities: targetModule.getCapabilities() }
      );
    }

    correlationLogger.info(`Sending request to module: ${validatedRequest.module}.${validatedRequest.action}`, {
      module: validatedRequest.module,
      action: validatedRequest.action,
      priority: validatedRequest.priority,
    });

    const timer = correlationLogger.startTimer(`${validatedRequest.module}.${validatedRequest.action}`);

    try {
      // Phase 1: Direct method call to module
      const response = await targetModule.process(validatedRequest);
      
      // Phase 2: This would become a network call
      // const response = await this.networkClient.sendRequest(validatedRequest);

      // Validate response structure
      const validatedResponse = this.validateResponse(response, validatedRequest);

      timer.end({
        success: validatedResponse.success,
        hasErrors: validatedResponse.errors.length > 0,
        hasWarnings: validatedResponse.warnings.length > 0,
      });

      correlationLogger.logModuleOperation(
        validatedRequest.module,
        validatedRequest.action,
        validatedResponse.success,
        undefined,
        {
          hasNextActions: validatedResponse.nextActions.length > 0,
          errorCount: validatedResponse.errors.length,
          warningCount: validatedResponse.warnings.length,
        }
      );

      return validatedResponse;
    } catch (error) {
      timer.end({ success: false, error: true });
      
      correlationLogger.error(
        `Module request failed: ${validatedRequest.module}.${validatedRequest.action}`,
        error,
        { request: validatedRequest }
      );

      // Re-throw ModuleError as-is, wrap other errors
      if (error instanceof ModuleError) {
        throw error;
      }

      throw new ModuleError(
        `Module operation failed: ${error instanceof Error ? error.message : String(error)}`,
        validatedRequest.module,
        'OPERATION_FAILED',
        { originalError: error, request: validatedRequest }
      );
    }
  }

  /**
   * Broadcast request to multiple modules
   */
  async broadcastRequest(
    request: Omit<ModuleRequest, 'module'>,
    targetModules: string[]
  ): Promise<ModuleResponse[]> {
    const correlationLogger = CorrelationLogger.fromRequest(
      request.requestId,
      request.context.userId,
      'ModuleCommunication'
    );

    correlationLogger.info(`Broadcasting request to ${targetModules.length} modules`, {
      targetModules,
      action: request.action,
    });

    const requests = targetModules.map(module => ({
      ...request,
      module,
    }));

    // Execute requests in parallel
    const results = await Promise.allSettled(
      requests.map(req => this.sendRequest(req))
    );

    const responses: ModuleResponse[] = [];
    const errors: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        responses.push(result.value);
      } else {
        const moduleName = targetModules[index];
        const errorMessage = `${moduleName}: ${result.reason.message}`;
        errors.push(errorMessage);
        
        correlationLogger.error(`Broadcast failed for module: ${moduleName}`, result.reason);
      }
    });

    if (errors.length > 0) {
      correlationLogger.warn(`Broadcast completed with ${errors.length} failures`, {
        successCount: responses.length,
        failureCount: errors.length,
        failures: errors,
      });
    }

    return responses;
  }

  /**
   * Get available modules and their capabilities
   */
  getAvailableModules(): Record<string, string[]> {
    const modules: Record<string, string[]> = {};
    
    for (const [name, module] of this.modules) {
      modules[name] = module.getCapabilities();
    }
    
    return modules;
  }

  /**
   * Check if a module is available
   */
  isModuleAvailable(moduleName: string): boolean {
    return this.modules.has(moduleName);
  }

  /**
   * Get module health status
   */
  async getModuleHealth(moduleName: string) {
    const module = this.modules.get(moduleName);
    if (!module) {
      return {
        status: 'not_found',
        message: `Module '${moduleName}' not found`,
      };
    }

    try {
      return await module.healthCheck();
    } catch (error) {
      return {
        status: 'error',
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get health status for all modules
   */
  async getAllModulesHealth() {
    const healthChecks: Record<string, any> = {};
    
    for (const [name] of this.modules) {
      healthChecks[name] = await this.getModuleHealth(name);
    }
    
    return healthChecks;
  }

  /**
   * Validate request structure and content
   */
  private validateRequest(request: ModuleRequest): ModuleRequest {
    // Basic structure validation
    if (!request.requestId) {
      throw new ModuleError('Request ID is required', 'unknown', 'INVALID_REQUEST');
    }

    if (!request.module) {
      throw new ModuleError('Module name is required', 'unknown', 'INVALID_REQUEST');
    }

    if (!request.action) {
      throw new ModuleError('Action is required', request.module, 'INVALID_REQUEST');
    }

    if (!request.context) {
      throw new ModuleError('Request context is required', request.module, 'INVALID_REQUEST');
    }

    // Context validation
    if (!request.context.userId) {
      throw new ModuleError('User ID is required in context', request.module, 'INVALID_CONTEXT');
    }

    if (!request.context.environment) {
      throw new ModuleError('Environment is required in context', request.module, 'INVALID_CONTEXT');
    }

    return request;
  }

  /**
   * Validate response structure
   */
  private validateResponse(response: ModuleResponse, request: ModuleRequest): ModuleResponse {
    if (!response.requestId) {
      throw new ModuleError('Response missing request ID', request.module, 'INVALID_RESPONSE');
    }

    if (response.requestId !== request.requestId) {
      throw new ModuleError('Response request ID mismatch', request.module, 'INVALID_RESPONSE');
    }

    if (typeof response.success !== 'boolean') {
      throw new ModuleError('Response missing success status', request.module, 'INVALID_RESPONSE');
    }

    return response;
  }

  /**
   * Create a request context for internal module communication
   */
  createInternalContext(
    originalContext: RequestContext,
    sourceModule: string
  ): RequestContext {
    return {
      ...originalContext,
      auditTrail: [
        ...originalContext.auditTrail,
        `${sourceModule} -> internal`,
      ],
    };
  }
}

// ============================================================================
// Module Registry
// ============================================================================

/**
 * Global module registry for easy access
 */
export class ModuleRegistry {
  private static instance: ModuleRegistry;
  private communication: ModuleCommunicationLayer;

  private constructor() {
    this.communication = new ModuleCommunicationLayer();
  }

  static getInstance(): ModuleRegistry {
    if (!ModuleRegistry.instance) {
      ModuleRegistry.instance = new ModuleRegistry();
    }
    return ModuleRegistry.instance;
  }

  getCommunicationLayer(): ModuleCommunicationLayer {
    return this.communication;
  }

  async initialize(): Promise<void> {
    // Initialize all registered modules
    const modules = this.communication.getAvailableModules();
    const logger = new Logger('ModuleRegistry');
    
    logger.info('Initializing module registry', {
      moduleCount: Object.keys(modules).length,
      modules: Object.keys(modules),
    });

    // Additional initialization logic can be added here
  }
}

// Export singleton instance
export const moduleRegistry = ModuleRegistry.getInstance();