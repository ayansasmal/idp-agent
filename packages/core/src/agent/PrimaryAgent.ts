import { AICore } from '@/ai/AICore';
import { ModuleCommunicationLayer } from '../modules/WorkingModuleSystem';
import { 
  AgentResponse,
  RequestContext,
  ModuleRequest,
  IntentAnalysis,
  PlatformAction,
  AgentResponseSchema,
} from '@/types';
import { config } from '@/shared/config/ConfigManager';
import { Logger, CorrelationLogger } from '@/shared/logger/Logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Primary Agent - The main coordinator for all platform operations
 * Routes user requests to appropriate modules and coordinates responses
 */
export class PrimaryAgent {
  private aiCore: AICore;
  private communication: ModuleCommunicationLayer;
  private logger = new Logger('PrimaryAgent');
  private isInitialized = false;

  constructor() {
    // Initialize AI Core with configuration
    this.aiCore = new AICore(config.getAIConfig());
    this.communication = new ModuleCommunicationLayer();
  }

  /**
   * Initialize the primary agent and all subsystems
   */
  async initialize(): Promise<void> {
    const timer = this.logger.startTimer('agent_initialization');

    try {
      this.logger.info('Initializing Primary Agent');

      // Initialize AI Core
      await this.aiCore.initialize();
      this.logger.info('AI Core initialized successfully');

      // Validate AI provider
      const providerValidation = await this.aiCore.validateProviders();
      this.logger.info('AI provider validation completed', { validation: providerValidation });

      if (!Object.values(providerValidation).some(valid => valid)) {
        throw new Error('No valid AI providers available');
      }

      // Initialize module communication layer
      await this.communication.initialize();
      this.logger.info('Module communication layer initialized');

      // Validate configuration
      const configValidation = config.validate();
      if (!configValidation.valid) {
        this.logger.error('Configuration validation failed', undefined, {
          errors: configValidation.errors,
        });
        throw new Error(`Configuration validation failed: ${configValidation.errors.join(', ')}`);
      }

      this.isInitialized = true;
      timer.end({ success: true });
      
      this.logger.info('Primary Agent initialized successfully', {
        aiProvider: this.aiCore.getCurrentProviderInfo(),
        environment: config.getAppConfig().nodeEnv,
      });

    } catch (error) {
      timer.end({ success: false, error: true });
      this.logger.error('Failed to initialize Primary Agent', error);
      throw error;
    }
  }

  /**
   * Process user request - main entry point for all interactions
   */
  async processRequest(
    userInput: string,
    context: RequestContext
  ): Promise<AgentResponse> {
    if (!this.isInitialized) {
      throw new Error('Primary Agent not initialized. Call initialize() first.');
    }

    const requestId = uuidv4();
    const correlationLogger = CorrelationLogger.fromRequest(
      requestId,
      context.userId,
      'PrimaryAgent'
    );

    correlationLogger.info('Processing user request', {
      userInput,
      environment: context.environment,
      permissions: context.permissions,
    });

    const timer = correlationLogger.startTimer('request_processing');

    try {
      // 1. Parse user intent with AI
      correlationLogger.info('Parsing user intent');
      const intent = await this.aiCore.parseIntent(userInput, context);
      
      correlationLogger.info('Intent parsed successfully', {
        action: intent.platformAction.action,
        resourceType: intent.platformAction.resourceType,
        riskLevel: intent.platformAction.riskLevel,
        confidence: intent.confidence,
        requiresApproval: intent.requiresApproval,
      });

      // 2. Create execution plan
      const executionPlan = await this.createExecutionPlan(intent, context);
      correlationLogger.info('Execution plan created', {
        stepCount: executionPlan.steps.length,
        requiresApproval: executionPlan.requiresApproval,
      });

      // 3. Execute plan with module coordination
      const result = await this.executePlan(executionPlan, context, correlationLogger);

      // 4. Generate user response
      const response = await this.generateUserResponse(result, intent, userInput);

      timer.end({ success: true });
      
      correlationLogger.info('Request processed successfully', {
        success: response.success,
        actionCount: response.actions.length,
      });

      return response;

    } catch (error) {
      timer.end({ success: false, error: true });
      
      correlationLogger.error('Request processing failed', error, {
        userInput,
        context,
      });

      // Return error response
      return this.createErrorResponse(
        error instanceof Error ? error.message : String(error),
        userInput
      );
    }
  }

  /**
   * Create execution plan based on intent analysis
   */
  private async createExecutionPlan(
    intent: IntentAnalysis,
    context: RequestContext
  ): Promise<ExecutionPlan> {
    const steps: ExecutionStep[] = [];
    const { platformAction } = intent;

    // Always validate with safety module first
    if (intent.requiresValidation) {
      steps.push({
        module: 'safety',
        action: 'validate_action',
        parameters: { targetAction: platformAction },
        dependsOn: [],
        critical: true,
      });
    }

    // Human approval for high-risk actions
    if (intent.requiresApproval) {
      steps.push({
        module: 'approval',
        action: 'request_approval',
        parameters: { 
          action: platformAction,
          summary: await this.aiCore.generateApprovalSummary(platformAction),
        },
        dependsOn: intent.requiresValidation ? ['safety'] : [],
        critical: true,
      });
    }

    // Execute the actual platform action
    const executionDependencies = [];
    if (intent.requiresValidation) executionDependencies.push('safety');
    if (intent.requiresApproval) executionDependencies.push('approval');

    steps.push({
      module: this.getModuleForAction(platformAction.action),
      action: platformAction.action,
      parameters: {
        resourceType: platformAction.resourceType,
        resourceName: platformAction.resourceName,
        environment: platformAction.environment,
        ...platformAction.parameters,
      },
      dependsOn: executionDependencies,
      critical: true,
    });

    // Always audit the action
    steps.push({
      module: 'audit',
      action: 'log_action',
      parameters: {
        action: platformAction,
        context,
        result: 'pending', // Will be updated after execution
      },
      dependsOn: [this.getModuleForAction(platformAction.action)],
      critical: false, // Audit failure shouldn't stop execution
    });

    return {
      steps,
      requiresApproval: intent.requiresApproval,
      riskLevel: platformAction.riskLevel,
    };
  }

  /**
   * Execute the planned steps with dependency management
   */
  private async executePlan(
    plan: ExecutionPlan,
    context: RequestContext,
    logger: CorrelationLogger
  ): Promise<ExecutionResult> {
    const results: Record<string, any> = {};
    const errors: string[] = [];
    const completedSteps: string[] = [];

    logger.info('Starting plan execution', {
      stepCount: plan.steps.length,
      requiresApproval: plan.requiresApproval,
    });

    // Execute steps in dependency order
    for (const step of plan.steps) {
      // Check if dependencies are satisfied
      const unsatisfiedDeps = step.dependsOn.filter(dep => !completedSteps.includes(dep));
      if (unsatisfiedDeps.length > 0) {
        logger.warn(`Skipping step ${step.module}.${step.action} - dependencies not satisfied`, {
          unsatisfiedDependencies: unsatisfiedDeps,
        });
        continue;
      }

      logger.info(`Executing step: ${step.module}.${step.action}`);
      
      try {
        const request: ModuleRequest = {
          requestId: uuidv4(),
          module: step.module,
          action: step.action,
          parameters: step.parameters,
          context,
          priority: 'normal',
        };

        const response = await this.communication.sendRequest(request);
        
        results[step.module] = response;
        completedSteps.push(step.module);

        if (!response.success && step.critical) {
          errors.push(`Critical step failed: ${step.module}.${step.action}: ${response.errors.join(', ')}`);
          break; // Stop execution on critical failure
        }

        logger.info(`Step completed: ${step.module}.${step.action}`, {
          success: response.success,
          hasWarnings: response.warnings.length > 0,
        });

      } catch (error) {
        const errorMessage = `Step failed: ${step.module}.${step.action}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMessage);
        
        logger.error(`Step execution failed: ${step.module}.${step.action}`, error);

        if (step.critical) {
          break; // Stop execution on critical failure
        }
      }
    }

    return {
      success: errors.length === 0,
      results,
      errors,
      completedSteps,
    };
  }

  /**
   * Generate user-friendly response
   */
  private async generateUserResponse(
    result: ExecutionResult,
    intent: IntentAnalysis,
    originalInput: string
  ): Promise<AgentResponse> {
    const { platformAction } = intent;
    
    if (result.success) {
      // Successful execution
      const message = `✅ Successfully ${platformAction.action}ed ${platformAction.resourceName} in ${platformAction.environment}`;
      
      return AgentResponseSchema.parse({
        success: true,
        message,
        data: result.results,
        actions: [platformAction],
        metadata: {
          originalInput,
          executionSteps: result.completedSteps,
          confidence: intent.confidence,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Failed execution
      const message = `❌ Failed to ${platformAction.action} ${platformAction.resourceName}: ${result.errors.join('; ')}`;
      
      return AgentResponseSchema.parse({
        success: false,
        message,
        data: { errors: result.errors, partialResults: result.results },
        actions: [],
        metadata: {
          originalInput,
          completedSteps: result.completedSteps,
          confidence: intent.confidence,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Create error response for unexpected failures
   */
  private createErrorResponse(error: string, originalInput: string): AgentResponse {
    return AgentResponseSchema.parse({
      success: false,
      message: `❌ I encountered an error processing your request: ${error}`,
      data: { error },
      actions: [],
      metadata: {
        originalInput,
        errorType: 'processing_error',
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Determine which module should handle a specific action
   */
  private getModuleForAction(action: string): string {
    try {
      return this.communication.getModuleForAction(action);
    } catch (error) {
      // Fallback to kubernetes for unknown actions
      this.logger.warn('Unknown action, defaulting to kubernetes module', { action, error });
      return 'kubernetes';
    }
  }

  /**
   * Chat interface for conversational interactions
   */
  async chat(input: string, context: RequestContext): Promise<string> {
    const response = await this.processRequest(input, context);
    return response.message;
  }

  /**
   * Stream chat responses for real-time interfaces
   */
  async *streamChat(input: string, context: RequestContext) {
    // For now, process normally and yield the complete response
    // In future iterations, this can be enhanced with real streaming
    const response = await this.processRequest(input, context);
    yield response.message;
  }

  /**
   * Get agent health status
   */
  async getHealthStatus() {
    const health = {
      status: 'healthy' as const,
      checks: {
        agent: { status: 'pass' as const, message: 'Primary agent operational' },
        ai: { status: 'unknown' as const, message: 'Checking AI provider...' },
        modules: { status: 'unknown' as const, message: 'Checking modules...' },
      },
      timestamp: new Date().toISOString(),
    };

    try {
      // Check AI provider
      const aiValidation = await this.aiCore.validateProviders();
      const aiHealthy = Object.values(aiValidation).some(valid => valid);
      health.checks.ai = {
        status: aiHealthy ? 'pass' : 'fail',
        message: aiHealthy ? 'AI provider responsive' : 'AI provider not available',
      };

      // Check modules
      const moduleHealth = await this.communication.getAllModulesHealth();
      const modulesHealthy = Object.values(moduleHealth).every(h => h.status === 'healthy');
      health.checks.modules = {
        status: modulesHealthy ? 'pass' : 'warn',
        message: modulesHealthy ? 'All modules operational' : 'Some modules have issues',
      };

      // Overall health
      if (!aiHealthy) {
        health.status = 'unhealthy';
      } else if (!modulesHealthy) {
        health.status = 'degraded';
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.checks.agent = {
        status: 'fail',
        message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return health;
  }

  /**
   * Shutdown the agent gracefully
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Primary Agent');
    this.isInitialized = false;
    // Additional cleanup can be added here
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

interface ExecutionStep {
  module: string;
  action: string;
  parameters: Record<string, any>;
  dependsOn: string[];
  critical: boolean;
}

interface ExecutionPlan {
  steps: ExecutionStep[];
  requiresApproval: boolean;
  riskLevel: string;
}

interface ExecutionResult {
  success: boolean;
  results: Record<string, any>;
  errors: string[];
  completedSteps: string[];
}