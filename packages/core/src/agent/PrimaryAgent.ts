import { AICore } from '@/ai/AICore';
import { ModuleCommunicationLayer } from '../modules/WorkingModuleSystem';
import {
  AgentResponse,
  RequestContext,
  ModuleRequest,
  IntentAnalysis,
  PlatformAction,
  AgentResponseSchema,
  ParameterDefinition,
  MissingParameter,
  ParameterValidationResult,
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

      // 1.5. Validate mandatory parameters and prompt for missing ones
      correlationLogger.info('Validating mandatory parameters');
      const validationResult = await this.validateMandatoryParameters(intent, userInput, context);
      
      if (!validationResult.isValid) {
        correlationLogger.info('Missing mandatory parameters, prompting user', {
          missingParameters: validationResult.missingParameters
        });
        
        return this.createParameterPromptResponse(validationResult, userInput);
      }

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
   * Create execution plan based on intent analysis and safety assessment
   */
  private async createExecutionPlan(
    intent: IntentAnalysis,
    context: RequestContext
  ): Promise<ExecutionPlan> {
    const steps: ExecutionStep[] = [];
    const actions = intent.isMultiAction && intent.allActions ? intent.allActions : [intent.platformAction];
    const executionOrder = intent.executionOrder || actions.map((_, index) => index);

    // For multi-action requests, validate all actions together
    if (intent.requiresValidation) {
      steps.push({
        module: 'safety',
        action: 'validate',
        parameters: { 
          platformAction: intent.platformAction, // Primary action for backward compatibility
          allActions: actions, // All actions for multi-action validation
          isMultiAction: intent.isMultiAction || false
        },
        dependsOn: [],
        critical: true,
      });

      // Get risk assessment for all actions to determine overall approval needs
      steps.push({
        module: 'safety',
        action: 'assess-risk',
        parameters: { 
          platformAction: intent.platformAction,
          allActions: actions,
          isMultiAction: intent.isMultiAction || false
        },
        dependsOn: ['safety'],
        critical: true,
      });
    }

    // Defer approval decision until after safety assessment
    // We'll add the approval step dynamically during execution

    // Execute platform actions in the specified order
    executionOrder.forEach((actionIndex, orderIndex) => {
      const action = actions[actionIndex];
      const executionDependencies = [];
      
      if (intent.requiresValidation) {
        executionDependencies.push('safety');
        // approval dependency will be added dynamically if needed
      }
      
      // Add dependency on previous action for sequential execution
      if (orderIndex > 0) {
        const prevActionIndex = executionOrder[orderIndex - 1];
        const prevAction = actions[prevActionIndex];
        const prevStepId = `${this.getModuleForAction(prevAction.action)}-${prevAction.action}`;
        executionDependencies.push(prevStepId);
      }

      const stepId = `${this.getModuleForAction(action.action)}-${action.action}`;
      
      steps.push({
        module: this.getModuleForAction(action.action),
        action: action.action,
        parameters: {
          resourceType: action.resourceType,
          resourceName: action.resourceName,
          environment: action.environment,
          ...action.parameters,
          // Add context for multi-action scenarios
          isPartOfMultiAction: intent.isMultiAction || false,
          actionIndex: actionIndex,
          totalActions: actions.length,
        },
        dependsOn: executionDependencies,
        critical: true,
        stepId: stepId, // Add step ID for dependency tracking
      });
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
      requiresApproval: intent.requiresApproval, // Initial value, will be updated based on safety assessment
      riskLevel: platformAction.riskLevel,
    };
  }

  /**
   * Execute the planned steps with dependency management and dynamic approval creation
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
        
        // Also track by stepId if available (for multi-action dependency tracking)
        if (step.stepId) {
          completedSteps.push(step.stepId);
        }

        // Check if this was a risk assessment and we need to create an approval
        if (step.module === 'safety' && step.action === 'assess-risk' && response.success) {
          const riskData = response.data;
          const riskLevel = riskData?.riskLevel;
          const needsApproval = riskData?.requiresApproval;

          logger.info('Safety risk assessment completed', {
            riskLevel,
            requiresApproval: needsApproval,
          });

          // Create approval request for medium/high/critical risk operations
          if (needsApproval || ['medium', 'high', 'critical'].includes(riskLevel)) {
            logger.info('Creating approval request based on safety assessment', { riskLevel });
            
            try {
              const approvalRequest: ModuleRequest = {
                requestId: uuidv4(),
                module: 'approval',
                action: 'request-approval',
                parameters: {
                  platformAction: step.parameters.platformAction,
                  riskLevel: riskLevel,
                  justification: await this.aiCore.generateApprovalSummary(step.parameters.platformAction),
                  safetyAssessment: riskData,
                },
                context,
                priority: 'normal',
              };

              const approvalResponse = await this.communication.sendRequest(approvalRequest);
              results['approval'] = approvalResponse;
              completedSteps.push('approval');

              logger.info('Approval request created successfully', {
                approvalId: approvalResponse.data?.id,
                success: approvalResponse.success,
              });

              // HALT EXECUTION: Do not proceed with main action when approval is required
              // Return immediately with approval-pending status
              const platformAction = step.parameters.platformAction;
              logger.info('Halting execution - approval required before proceeding', {
                approvalId: approvalResponse.data?.approvalId,
                platformAction: platformAction.action,
                resource: platformAction.resourceName
              });

              // Mark this as successful completion with approval pending
              return {
                success: true,
                results,
                errors,
                completedSteps,
                approvalRequired: true,
                approvalId: approvalResponse.data?.approvalId,
                halted: true // Flag to indicate execution was intentionally halted
              };

            } catch (approvalError) {
              logger.error('Failed to create approval request', approvalError);
              errors.push(`Failed to create approval request: ${approvalError instanceof Error ? approvalError.message : String(approvalError)}`);
              break;
            }
          }
        }

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
   * Generate user-friendly response by passing through module responses
   */
  private async generateUserResponse(
    result: ExecutionResult,
    intent: IntentAnalysis,
    originalInput: string
  ): Promise<AgentResponse> {
    const { platformAction } = intent;

    if (result.success && result.results) {
      // Check if execution was halted due to approval requirement
      if (result.approvalRequired && result.halted) {
        const approvalResponse = result.results['approval'];
        const approvalId = approvalResponse?.data?.approvalId || approvalResponse?.data?.id;
        
        const message = `⏳ Approval required for ${platformAction.action} operation on ${platformAction.resourceName}`;
        
        const detailedResponse = `## ⏳ Approval Required

**Action:** ${platformAction.action}  
**Resource:** ${platformAction.resourceName}  
**Environment:** ${platformAction.environment}  
**Risk Level:** ${result.results['safety']?.result?.riskLevel || 'medium'}

### 🔒 Why Approval is Required
${result.results['safety']?.result?.riskFactors?.map((factor: any) => 
  `- **${factor.factor}**: ${factor.description} (${factor.level} risk)`
).join('\n') || 'Operation requires approval due to security policies'}

### 📋 Approval Details
- **Approval ID:** \`${approvalId}\`
- **Status:** Pending Review
- **Required Approvers:** ${approvalResponse?.data?.requirements?.approvers?.join(', ') || 'Platform administrators'}
- **Timeout:** ${approvalResponse?.data?.requirements?.timeoutMinutes || 60} minutes

### 🚀 Next Steps
1. Wait for approval from authorized personnel
2. Once approved, the operation will proceed automatically
3. You can check approval status in the Approvals section

### 🛡️ Safety Assessment
${result.results['safety']?.result?.mitigations?.map((mitigation: string) => `- ${mitigation}`).join('\n') || ''}`;

        return AgentResponseSchema.parse({
          success: true,
          message,
          detailedResponse,
          data: {
            approvalId,
            status: 'approval-required',
            platformAction,
            safety: result.results['safety']?.result,
            approval: approvalResponse?.data
          },
          actions: [platformAction],
          metadata: {
            originalInput,
            executionSteps: result.completedSteps,
            confidence: intent.confidence,
            module: 'approval',
            action: 'request-approval',
            approvalId: approvalId,
            halted: true,
            approvalRequired: true
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Normal successful execution (no approval required)
      // Find the primary module response (not safety, approval, or audit)
      const moduleResponse = result.results[this.getModuleForAction(platformAction.action)] || 
                           result.results['kubernetes'] || 
                           Object.values(result.results).find((r: any) => 
                             r.metadata?.module && !['safety', 'approval', 'audit'].includes(r.metadata.module)
                           ) ||
                           result.results;
      
      // Use module's formatted response if available, otherwise generate simple response
      const message = moduleResponse.message || this.generateShortStatusMessage(platformAction, true);
      const detailedResponse = moduleResponse.detailedResponse;
      const data = moduleResponse.data || moduleResponse.result || moduleResponse;

      // Check if an approval was created (for metadata)
      const approvalResponse = result.results['approval'];
      const approvalId = approvalResponse?.data?.id;

      return AgentResponseSchema.parse({
        success: true,
        message,
        detailedResponse,
        data,
        actions: [platformAction],
        metadata: {
          originalInput,
          executionSteps: result.completedSteps,
          confidence: intent.confidence,
          module: moduleResponse.metadata?.module,
          action: moduleResponse.metadata?.action,
          approvalId: approvalId,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Failed execution - generate error response
      const message = `❌ Failed to ${platformAction.action} ${platformAction.resourceName}: ${result.errors.join('; ')}`;
      
      // Generate error details
      const detailedResponse = `## ❌ Operation Failed

**Action:** ${platformAction.action}  
**Resource:** ${platformAction.resourceName}  
**Environment:** ${platformAction.environment}

### 🔍 Error Details
${result.errors.map(error => `- ${error}`).join('\n')}

### 📋 Execution Steps Completed
${result.completedSteps.length > 0 ? 
  result.completedSteps.map((step, index) => `${index + 1}. ${step}`).join('\n') : 
  'No steps completed before failure'
}

### 🛠️ Troubleshooting
1. Check resource permissions
2. Verify namespace exists and is accessible
3. Review error messages above for specific issues
4. Try again or contact support if problem persists`;

      return AgentResponseSchema.parse({
        success: false,
        message,
        detailedResponse,
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
   * Generate concise status message for quick feedback
   */
  private generateShortStatusMessage(platformAction: PlatformAction, success: boolean): string {
    const actionPastTense = this.getActionPastTense(platformAction.action);
    const emoji = success ? '✅' : '❌';
    const verb = success ? 'Successfully' : 'Failed to';
    
    return `${emoji} ${verb} ${actionPastTense} ${platformAction.resourceName}`;
  }

  /**
   * Convert action to past tense for better readability
   */
  private getActionPastTense(action: string): string {
    const pastTenseMap: Record<string, string> = {
      'deploy': 'deployed',
      'scale': 'scaled', 
      'status': 'retrieved status for',
      'logs': 'retrieved logs for',
      'delete': 'deleted',
      'rollback': 'rolled back',
      'list': 'listed resources for',
      'describe': 'described'
    };
    
    return pastTenseMap[action] || `${action}ed`;
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
   * Validate that all mandatory parameters are present for the intended action
   */
  private async validateMandatoryParameters(
    intent: IntentAnalysis, 
    userInput: string, 
    context: RequestContext
  ): Promise<ParameterValidationResult> {
    const { platformAction } = intent;
    const missingParameters: MissingParameter[] = [];
    
    // Define mandatory parameters for each action type
    const mandatoryParams = this.getMandatoryParameters(platformAction.action);
    
    for (const param of mandatoryParams) {
      const value = this.getParameterValue(platformAction, param.name);
      
      if (!this.isValidParameterValue(value, param)) {
        // Try to extract the parameter from user input using AI
        const extractedValue = await this.extractParameterFromInput(param, userInput, context);
        
        if (!extractedValue) {
          missingParameters.push({
            name: param.name,
            displayName: param.displayName,
            description: param.description,
            example: param.example,
            required: true
          });
        } else {
          // Update the platform action with the extracted value
          this.setParameterValue(platformAction, param.name, extractedValue);
        }
      }
    }
    
    return {
      isValid: missingParameters.length === 0,
      missingParameters,
      validatedAction: platformAction
    };
  }

  /**
   * Get mandatory parameters for each action type
   */
  private getMandatoryParameters(action: string): ParameterDefinition[] {
    const commonParams: ParameterDefinition[] = [
      {
        name: 'resourceName',
        displayName: 'Resource Name',
        description: 'The name of the resource to operate on',
        example: 'nginx, user-service, payment-api',
        type: 'string',
        validation: (value: string) => value && value.trim().length > 0
      }
    ];

    const actionSpecificParams: Record<string, ParameterDefinition[]> = {
      'deploy': [
        ...commonParams,
        {
          name: 'image',
          displayName: 'Container Image',
          description: 'The container image to deploy (optional if using existing deployment)',
          example: 'nginx:latest, myapp:v1.2.3',
          type: 'string',
          required: false
        }
      ],
      'scale': [
        ...commonParams,
        {
          name: 'replicas',
          displayName: 'Number of Replicas',
          description: 'How many instances of the service to run',
          example: '3, 5, 10',
          type: 'number',
          validation: (value: any) => {
            const num = parseInt(value);
            return !isNaN(num) && num > 0 && num <= 100;
          }
        }
      ],
      'delete': [
        ...commonParams,
        {
          name: 'confirmDelete',
          displayName: 'Delete Confirmation',
          description: 'Confirmation that you want to delete this resource',
          example: 'yes, confirm, I understand',
          type: 'string',
          validation: (value: string) => {
            const confirmed = ['yes', 'confirm', 'true', 'ok'].includes(value?.toLowerCase());
            return confirmed;
          }
        }
      ]
    };

    return actionSpecificParams[action] || commonParams;
  }

  /**
   * Get parameter value from platform action
   */
  private getParameterValue(platformAction: PlatformAction, paramName: string): any {
    if (paramName === 'resourceName') return platformAction.resourceName;
    if (paramName === 'replicas') return platformAction.parameters?.replicas;
    if (paramName === 'image') return platformAction.parameters?.image;
    if (paramName === 'confirmDelete') return platformAction.parameters?.confirmDelete;
    
    return platformAction.parameters?.[paramName];
  }

  /**
   * Set parameter value in platform action
   */
  private setParameterValue(platformAction: PlatformAction, paramName: string, value: any): void {
    if (paramName === 'resourceName') {
      platformAction.resourceName = value;
    } else {
      if (!platformAction.parameters) platformAction.parameters = {};
      platformAction.parameters[paramName] = value;
    }
  }

  /**
   * Check if parameter value is valid
   */
  private isValidParameterValue(value: any, param: ParameterDefinition): boolean {
    if (!value && param.required !== false) return false;
    if (param.validation) return param.validation(value);
    
    // Basic type validation
    if (param.type === 'string') return typeof value === 'string' && value.trim().length > 0;
    if (param.type === 'number') return !isNaN(Number(value));
    
    return true;
  }

  /**
   * Extract parameter from user input using AI
   */
  private async extractParameterFromInput(
    param: ParameterDefinition, 
    userInput: string, 
    context: RequestContext
  ): Promise<string | null> {
    try {
      const extractedValue = await this.aiCore.extractParameter(
        userInput, 
        param.name, 
        param.description, 
        context
      );
      
      if (extractedValue && this.isValidParameterValue(extractedValue, param)) {
        return extractedValue;
      }
    } catch (error) {
      // AI extraction failed, parameter will be marked as missing
    }
    
    return null;
  }

  /**
   * Create response prompting user for missing parameters
   */
  private createParameterPromptResponse(
    validationResult: ParameterValidationResult, 
    originalInput: string
  ): AgentResponse {
    const missingParams = validationResult.missingParameters;
    const parameterList = missingParams.map(param => 
      `- **${param.displayName}**: ${param.description}\n  *Example: ${param.example}*`
    ).join('\n\n');
    
    const message = `I need some additional information to proceed with your request.`;
    
    const detailedResponse = `## 🤔 Missing Required Information

I understand you want to perform this operation, but I need some additional details:

${parameterList}

### 💡 How to Provide Information

You can provide the missing information in several ways:

1. **All at once**: "Deploy nginx with 3 replicas"
2. **Step by step**: Just tell me the resource name, and I'll ask for the next detail
3. **Be specific**: Include the exact values in your next message

### 🔄 Once you provide this information, I'll continue with your request.

**Your original request**: "${originalInput}"`;

    return AgentResponseSchema.parse({
      success: false,
      message,
      detailedResponse,
      data: {
        missingParameters: missingParams,
        originalRequest: originalInput,
        requiresUserInput: true
      },
      actions: [],
      metadata: {
        originalInput,
        missingParameters: missingParams.map(p => p.name),
        status: 'awaiting_parameters'
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Direct access to approval module for web API (bypasses AI processing)
   */
  async getApprovalModule(): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized');
    }
    
    const request = {
      requestId: uuidv4(),
      module: 'approval',
      action: 'list-pending',
      parameters: {},
      context: {
        userId: 'web-user',
        sessionId: `web-session-${Date.now()}`,
        originalRequest: 'list pending approvals',
        environment: 'development' as const,
        permissions: ['read', 'write', 'deploy'],
        auditTrail: [],
        timestamp: new Date().toISOString(),
      },
      priority: 'normal' as const,
    };
    
    return this.communication.sendRequest(request);
  }

  /**
   * Direct access to approval module for approve/reject actions
   */
  async processApprovalAction(action: string, approvalId: string, approverId: string, comments?: string): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized');
    }
    
    const request = {
      requestId: uuidv4(),
      module: 'approval',
      action: action,
      parameters: {
        approvalId,
        approverId,
        comments: comments || (action === 'approve' ? 'Approved via web interface' : 'Rejected via web interface'),
        reason: action === 'reject' ? comments || 'Rejected via web interface' : undefined
      },
      context: {
        userId: approverId,
        sessionId: `web-session-${Date.now()}`,
        originalRequest: `${action} approval ${approvalId}`,
        environment: 'development' as const,
        permissions: ['read', 'write', 'deploy', 'approve'],
        auditTrail: [],
        timestamp: new Date().toISOString(),
      },
      priority: 'normal' as const,
    };
    
    return this.communication.sendRequest(request);
  }

  /**
   * Get agent health status
   */
  async getHealthStatus() {
    type healthStatus = "pass" | "fail" | "warn" | "unknown" | "healthy" | "unhealthy" | "degraded";
    const health = {
      status: 'healthy' as healthStatus,
      checks: {
        agent: { status: 'pass' as healthStatus, message: 'Primary agent operational' },
        ai: { status: 'unknown' as healthStatus, message: 'Checking AI provider...' },
        modules: { status: 'unknown' as healthStatus, message: 'Checking modules...' },
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
  stepId?: string; // Optional step ID for dependency tracking
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
  approvalRequired?: boolean;
  approvalId?: string;
  halted?: boolean;
}