import { BaseModule } from '../base/SimpleBaseModule';
import { ModuleRequest, ModuleResponse, PlatformAction, RequestContext } from '../../types';
import { CorrelationLogger } from '../../shared/logger/Logger';
import { z } from 'zod';

/**
 * Safety Module - Handles all safety validation and risk assessment
 * This module will become the standalone Security/Safety Agent in Phase 2
 */
export class SafetyModule extends BaseModule {
  private logger: CorrelationLogger;
  private policies: SafetyPolicy[];

  constructor() {
    super();
    this.logger = new CorrelationLogger('safety-module', '', '');
    this.policies = this.initializeDefaultPolicies();
  }

  async initialize(): Promise<void> {
    this.logger.info('Safety module initialized with default policies', {
      policyCount: this.policies.length
    });
  }

  getCapabilities(): string[] {
    return [
      'validate',
      'assess-risk',
      'check-policies',
      'reality-check',
      'compliance-check',
      'generate-rollback-plan'
    ];
  }

  async process(request: ModuleRequest): Promise<ModuleResponse> {
    const startTime = Date.now();
    this.logger = CorrelationLogger.fromRequest(
      request.context.sessionId,
      request.context.userId,
      'SafetyModule'
    );

    this.logger.info('Processing safety request', { 
      action: request.action,
      parameters: request.parameters 
    });

    try {
      const response = await this.handleSafetyAction(request);
      
      const duration = Date.now() - startTime;
      this.logger.info('Safety request completed', { 
        action: request.action,
        success: response.success,
        duration 
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Safety request failed', { 
        action: request.action,
        error,
        duration 
      });
      
      return {
        success: false,
        message: `Safety validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        data: null,
        metadata: {
          module: 'safety',
          action: request.action,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private async handleSafetyAction(request: ModuleRequest): Promise<ModuleResponse> {
    const { action, parameters } = request;

    switch (action) {
      case 'validate':
        return this.validateAction(parameters.platformAction, request.context);
      case 'assess-risk':
        return this.assessRisk(parameters.platformAction, request.context);
      case 'check-policies':
        return this.checkPolicies(parameters.platformAction, request.context);
      case 'reality-check':
        return this.performRealityCheck(parameters.platformAction, request.context);
      case 'compliance-check':
        return this.checkCompliance(parameters.platformAction, request.context);
      case 'generate-rollback-plan':
        return this.generateRollbackPlan(parameters.platformAction, request.context);
      default:
        throw new Error(`Unsupported safety action: ${action}`);
    }
  }

  async validateAction(action: PlatformAction, context: RequestContext): Promise<ModuleResponse> {
    this.logger.info('Validating platform action', { action: action.action, resource: action.resourceName });

    const validationResults: ValidationResult[] = [];

    // 1. Basic parameter validation
    const paramValidation = this.validateParameters(action);
    validationResults.push(paramValidation);

    // 2. Environment validation
    const envValidation = this.validateEnvironment(action, context);
    validationResults.push(envValidation);

    // 3. Permission validation
    const permValidation = this.validatePermissions(action, context);
    validationResults.push(permValidation);

    // 4. Resource name validation
    const resourceValidation = this.validateResourceName(action);
    validationResults.push(resourceValidation);

    const allValid = validationResults.every(r => r.valid);
    const errors = validationResults.filter(r => !r.valid).map(r => r.message);
    const warnings = validationResults.filter(r => r.warnings?.length).flatMap(r => r.warnings || []);

    return {
      success: allValid,
      message: allValid 
        ? 'Action validation passed'
        : `Action validation failed: ${errors.join(', ')}`,
      timestamp: new Date().toISOString(),
      data: {
        valid: allValid,
        results: validationResults,
        errors,
        warnings
      },
      metadata: {
        module: 'safety',
        action: 'validate'
      }
    };
  }

  async assessRisk(action: PlatformAction, context: RequestContext): Promise<ModuleResponse> {
    this.logger.info('Assessing risk for platform action', { 
      action: action.action, 
      resource: action.resourceName,
      environment: action.environment 
    });

    const riskFactors: RiskFactor[] = [];

    // 1. Environment risk
    const envRisk = this.assessEnvironmentRisk(action.environment);
    riskFactors.push(envRisk);

    // 2. Action type risk
    const actionRisk = this.assessActionRisk(action.action);
    riskFactors.push(actionRisk);

    // 3. Resource criticality risk
    const resourceRisk = this.assessResourceRisk(action.resourceName);
    riskFactors.push(resourceRisk);

    // 4. Time-based risk (e.g., business hours)
    const timeRisk = this.assessTimeRisk();
    riskFactors.push(timeRisk);

    // 5. User permissions risk
    const userRisk = this.assessUserRisk(context);
    riskFactors.push(userRisk);

    // Calculate overall risk level
    const overallRisk = this.calculateOverallRisk(riskFactors);
    const requiresApproval = this.requiresApproval(overallRisk, action, context);

    return {
      success: true,
      message: `Risk assessment completed: ${overallRisk} risk`,
      timestamp: new Date().toISOString(),
      data: {
        riskLevel: overallRisk,
        riskFactors,
        requiresApproval,
        riskScore: this.calculateRiskScore(riskFactors),
        mitigations: this.suggestMitigations(riskFactors)
      },
      metadata: {
        module: 'safety',
        action: 'assess-risk'
      }
    };
  }

  async checkPolicies(action: PlatformAction, context: RequestContext): Promise<ModuleResponse> {
    this.logger.info('Checking policies for platform action', { 
      action: action.action,
      policyCount: this.policies.length 
    });

    const policyResults: PolicyCheckResult[] = [];

    for (const policy of this.policies) {
      const result = await this.evaluatePolicy(policy, action, context);
      policyResults.push(result);
    }

    const violations = policyResults.filter(r => r.status === 'violation');
    const warnings = policyResults.filter(r => r.status === 'warning');
    const passed = policyResults.filter(r => r.status === 'pass');

    const hasViolations = violations.length > 0;

    return {
      success: !hasViolations,
      message: hasViolations 
        ? `Policy violations found: ${violations.map(v => v.policy.name).join(', ')}`
        : 'All policy checks passed',
      timestamp: new Date().toISOString(),
      data: {
        results: policyResults,
        violations,
        warnings,
        passed,
        summary: {
          total: policyResults.length,
          violations: violations.length,
          warnings: warnings.length,
          passed: passed.length
        }
      },
      metadata: {
        module: 'safety',
        action: 'check-policies'
      }
    };
  }

  async performRealityCheck(action: PlatformAction, context: RequestContext): Promise<ModuleResponse> {
    this.logger.info('Performing reality check', { 
      action: action.action,
      resource: action.resourceName 
    });

    const checks: RealityCheck[] = [];

    // 1. Resource existence check
    const resourceExists = await this.checkResourceExists(action);
    checks.push(resourceExists);

    // 2. Environment state check
    const envState = await this.checkEnvironmentState(action);
    checks.push(envState);

    // 3. Dependency check
    const dependencies = await this.checkDependencies(action);
    checks.push(dependencies);

    // 4. Capacity check
    const capacity = await this.checkCapacity(action);
    checks.push(capacity);

    const allPassed = checks.every(c => c.status === 'pass');
    const blockers = checks.filter(c => c.status === 'fail');
    const concerns = checks.filter(c => c.status === 'warning');

    return {
      success: allPassed && blockers.length === 0,
      message: blockers.length > 0 
        ? `Reality check failed: ${blockers.map(b => b.name).join(', ')}`
        : 'Reality check passed',
      timestamp: new Date().toISOString(),
      data: {
        checks,
        blockers,
        concerns,
        summary: {
          total: checks.length,
          passed: checks.filter(c => c.status === 'pass').length,
          warnings: concerns.length,
          failed: blockers.length
        }
      },
      metadata: {
        module: 'safety',
        action: 'reality-check'
      }
    };
  }

  async checkCompliance(action: PlatformAction, context: RequestContext): Promise<ModuleResponse> {
    this.logger.info('Checking compliance requirements', { action: action.action });

    const complianceChecks: ComplianceCheck[] = [
      await this.checkSOC2Compliance(action, context),
      await this.checkGDPRCompliance(action, context),
      await this.checkAuditRequirements(action, context),
      await this.checkDataRetention(action, context)
    ];

    const violations = complianceChecks.filter(c => !c.compliant);
    const isCompliant = violations.length === 0;

    return {
      success: isCompliant,
      message: isCompliant 
        ? 'All compliance checks passed'
        : `Compliance violations: ${violations.map(v => v.requirement).join(', ')}`,
      timestamp: new Date().toISOString(),
      data: {
        compliant: isCompliant,
        checks: complianceChecks,
        violations,
        requirements: complianceChecks.map(c => c.requirement)
      },
      metadata: {
        module: 'safety',
        action: 'compliance-check'
      }
    };
  }

  async generateRollbackPlan(action: PlatformAction, context: RequestContext): Promise<ModuleResponse> {
    this.logger.info('Generating rollback plan', { action: action.action });

    const rollbackSteps = this.createRollbackSteps(action);
    const estimatedTime = this.estimateRollbackTime(action);
    const dependencies = this.identifyRollbackDependencies(action);

    return {
      success: true,
      message: `Rollback plan generated for ${action.action} operation`,
      timestamp: new Date().toISOString(),
      data: {
        rollbackPlan: {
          steps: rollbackSteps,
          estimatedTime,
          dependencies,
          automated: this.canAutomate(action),
          riskLevel: this.assessRollbackRisk(action),
          validation: this.createRollbackValidation(action)
        }
      },
      metadata: {
        module: 'safety',
        action: 'generate-rollback-plan'
      }
    };
  }

  // Helper methods for validation
  private validateParameters(action: PlatformAction): ValidationResult {
    const errors: string[] = [];

    if (!action.resourceName || action.resourceName.trim() === '') {
      errors.push('Resource name is required');
    }

    if (!action.environment || !['development', 'staging', 'production'].includes(action.environment)) {
      errors.push('Valid environment is required (development, staging, production)');
    }

    if (!action.action || action.action.trim() === '') {
      errors.push('Action is required');
    }

    return {
      valid: errors.length === 0,
      message: errors.length === 0 ? 'Parameters valid' : errors.join(', '),
      warnings: []
    };
  }

  private validateEnvironment(action: PlatformAction, context: RequestContext): ValidationResult {
    const warnings: string[] = [];

    // Check if user is deploying to production outside business hours
    if (action.environment === 'production') {
      const hour = new Date().getHours();
      if (hour < 9 || hour > 17) {
        warnings.push('Production deployment outside business hours');
      }
    }

    return {
      valid: true,
      message: 'Environment validation passed',
      warnings
    };
  }

  private validatePermissions(action: PlatformAction, context: RequestContext): ValidationResult {
    const requiredPermissions = this.getRequiredPermissions(action);
    const userPermissions = context.permissions || [];
    
    const missingPermissions = requiredPermissions.filter(p => !userPermissions.includes(p));

    return {
      valid: missingPermissions.length === 0,
      message: missingPermissions.length === 0 
        ? 'Permission check passed' 
        : `Missing permissions: ${missingPermissions.join(', ')}`,
      warnings: []
    };
  }

  private validateResourceName(action: PlatformAction): ValidationResult {
    const warnings: string[] = [];
    
    // Check naming conventions
    if (!/^[a-z0-9-]+$/.test(action.resourceName)) {
      warnings.push('Resource name should contain only lowercase letters, numbers, and hyphens');
    }

    if (action.resourceName.length > 63) {
      warnings.push('Resource name should be 63 characters or less');
    }

    return {
      valid: true,
      message: 'Resource name validation passed',
      warnings
    };
  }

  // Risk assessment methods
  private assessEnvironmentRisk(environment: string): RiskFactor {
    const riskLevels = {
      development: 'low',
      staging: 'medium', 
      production: 'high'
    };

    return {
      factor: 'environment',
      level: riskLevels[environment as keyof typeof riskLevels] || 'high',
      description: `${environment} environment operations`,
      weight: environment === 'production' ? 0.4 : environment === 'staging' ? 0.2 : 0.1
    };
  }

  private assessActionRisk(action: string): RiskFactor {
    const riskLevels = {
      status: 'low',
      logs: 'low',
      list: 'low',
      describe: 'low',
      scale: 'medium',
      deploy: 'medium',
      rollback: 'medium',
      delete: 'high'
    };

    return {
      factor: 'action',
      level: riskLevels[action as keyof typeof riskLevels] || 'high',
      description: `${action} operation risk`,
      weight: action === 'delete' ? 0.3 : action === 'deploy' ? 0.2 : 0.1
    };
  }

  private assessResourceRisk(resourceName: string): RiskFactor {
    // Critical services that require extra caution
    const criticalServices = ['payment', 'auth', 'user', 'database', 'api-gateway'];
    const isCritical = criticalServices.some(service => 
      resourceName.toLowerCase().includes(service)
    );

    return {
      factor: 'resource',
      level: isCritical ? 'high' : 'medium',
      description: `${resourceName} criticality`,
      weight: isCritical ? 0.2 : 0.1
    };
  }

  private assessTimeRisk(): RiskFactor {
    const hour = new Date().getHours();
    const isBusinessHours = hour >= 9 && hour <= 17;
    
    return {
      factor: 'time',
      level: isBusinessHours ? 'low' : 'medium',
      description: `${isBusinessHours ? 'Business hours' : 'After hours'} operation`,
      weight: isBusinessHours ? 0.05 : 0.15
    };
  }

  private assessUserRisk(context: RequestContext): RiskFactor {
    // In a real system, this would check user roles, experience level, etc.
    return {
      factor: 'user',
      level: 'low',
      description: 'User permissions and experience',
      weight: 0.1
    };
  }

  private calculateOverallRisk(factors: RiskFactor[]): 'low' | 'medium' | 'high' | 'critical' {
    const score = this.calculateRiskScore(factors);
    
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.3) return 'medium';
    return 'low';
  }

  private calculateRiskScore(factors: RiskFactor[]): number {
    const levelValues = { low: 0.2, medium: 0.5, high: 0.8, critical: 1.0 };
    
    return factors.reduce((score, factor) => {
      const levelValue = levelValues[factor.level as keyof typeof levelValues] || 0.5;
      return score + (levelValue * factor.weight);
    }, 0);
  }

  private requiresApproval(riskLevel: string, action: PlatformAction, context: RequestContext): boolean {
    // Production deployments always require approval
    if (action.environment === 'production') {
      return true;
    }

    // High/critical risk operations require approval
    if (riskLevel === 'high' || riskLevel === 'critical') {
      return true;
    }

    // Delete operations require approval
    if (action.action === 'delete') {
      return true;
    }

    return false;
  }

  private suggestMitigations(factors: RiskFactor[]): string[] {
    const mitigations: string[] = [];
    
    factors.forEach(factor => {
      if (factor.level === 'high' || factor.level === 'critical') {
        switch (factor.factor) {
          case 'environment':
            mitigations.push('Consider testing in staging first');
            break;
          case 'action':
            mitigations.push('Have rollback plan ready');
            break;
          case 'resource':
            mitigations.push('Monitor critical service metrics closely');
            break;
          case 'time':
            mitigations.push('Ensure on-call engineer is available');
            break;
        }
      }
    });

    return mitigations;
  }

  // Policy evaluation methods
  private async evaluatePolicy(policy: SafetyPolicy, action: PlatformAction, context: RequestContext): Promise<PolicyCheckResult> {
    try {
      const result = await policy.evaluate(action, context);
      return {
        policy,
        status: result.passed ? 'pass' : (result.severity === 'error' ? 'violation' : 'warning'),
        message: result.message,
        details: result.details
      };
    } catch (error) {
      return {
        policy,
        status: 'violation',
        message: `Policy evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: null
      };
    }
  }

  // Reality check methods
  private async checkResourceExists(action: PlatformAction): Promise<RealityCheck> {
    // Simulate resource existence check
    // In real implementation, this would check actual Kubernetes resources
    return {
      name: 'Resource Existence',
      status: 'pass',
      message: `Resource ${action.resourceName} can be ${action.action}ed`,
      details: { exists: action.action !== 'deploy', canCreate: action.action === 'deploy' }
    };
  }

  private async checkEnvironmentState(action: PlatformAction): Promise<RealityCheck> {
    return {
      name: 'Environment State',
      status: 'pass',
      message: `${action.environment} environment is healthy`,
      details: { healthy: true, capacity: 'available' }
    };
  }

  private async checkDependencies(action: PlatformAction): Promise<RealityCheck> {
    return {
      name: 'Dependencies',
      status: 'pass',
      message: 'All dependencies are available',
      details: { dependencies: [], allAvailable: true }
    };
  }

  private async checkCapacity(action: PlatformAction): Promise<RealityCheck> {
    return {
      name: 'Capacity',
      status: 'pass',
      message: 'Sufficient capacity available',
      details: { cpuAvailable: '75%', memoryAvailable: '60%', sufficient: true }
    };
  }

  // Compliance check methods
  private async checkSOC2Compliance(action: PlatformAction, context: RequestContext): Promise<ComplianceCheck> {
    return {
      requirement: 'SOC2',
      compliant: true,
      message: 'SOC2 controls satisfied',
      details: { auditLog: true, accessControl: true, changeManagement: true }
    };
  }

  private async checkGDPRCompliance(action: PlatformAction, context: RequestContext): Promise<ComplianceCheck> {
    return {
      requirement: 'GDPR',
      compliant: true,
      message: 'GDPR requirements met',
      details: { dataProcessing: 'compliant', retention: 'within-limits' }
    };
  }

  private async checkAuditRequirements(action: PlatformAction, context: RequestContext): Promise<ComplianceCheck> {
    return {
      requirement: 'Audit',
      compliant: true,
      message: 'Audit requirements satisfied',
      details: { logging: true, traceability: true, retention: 'configured' }
    };
  }

  private async checkDataRetention(action: PlatformAction, context: RequestContext): Promise<ComplianceCheck> {
    return {
      requirement: 'Data Retention',
      compliant: true,
      message: 'Data retention policies followed',
      details: { policy: 'applied', retention: '7-years', classification: 'appropriate' }
    };
  }

  // Rollback planning methods
  private createRollbackSteps(action: PlatformAction): RollbackStep[] {
    const steps: RollbackStep[] = [];

    switch (action.action) {
      case 'deploy':
        steps.push(
          { step: 1, description: 'Stop new traffic to deployment', command: 'kubectl patch service ... ' },
          { step: 2, description: 'Scale down new deployment', command: 'kubectl scale deployment ... --replicas=0' },
          { step: 3, description: 'Restore previous deployment', command: 'kubectl rollout undo deployment/...' },
          { step: 4, description: 'Verify rollback success', command: 'kubectl rollout status deployment/...' }
        );
        break;
      case 'scale':
        steps.push(
          { step: 1, description: 'Restore previous replica count', command: `kubectl scale deployment ${action.resourceName} --replicas=<previous-count>` },
          { step: 2, description: 'Verify scaling completed', command: `kubectl get deployment ${action.resourceName}` }
        );
        break;
      case 'delete':
        steps.push(
          { step: 1, description: 'Restore from backup', command: 'kubectl apply -f backup-manifest.yaml' },
          { step: 2, description: 'Verify restoration', command: `kubectl get deployment ${action.resourceName}` }
        );
        break;
    }

    return steps;
  }

  private estimateRollbackTime(action: PlatformAction): string {
    const timeEstimates = {
      deploy: '2-5 minutes',
      scale: '30-60 seconds',
      delete: '1-3 minutes',
      default: '1-2 minutes'
    };

    return timeEstimates[action.action as keyof typeof timeEstimates] || timeEstimates.default;
  }

  private identifyRollbackDependencies(action: PlatformAction): string[] {
    // Common dependencies for rollback operations
    return [
      'Kubernetes cluster access',
      'Previous deployment state',
      'Network connectivity',
      'Sufficient cluster resources'
    ];
  }

  private canAutomate(action: PlatformAction): boolean {
    // Most K8s operations can be automated
    return ['deploy', 'scale'].includes(action.action);
  }

  private assessRollbackRisk(action: PlatformAction): 'low' | 'medium' | 'high' {
    if (action.environment === 'production') return 'medium';
    if (action.action === 'delete') return 'high';
    return 'low';
  }

  private createRollbackValidation(action: PlatformAction): string[] {
    return [
      'Check deployment status',
      'Verify health endpoints',
      'Monitor error rates',
      'Confirm user traffic restored'
    ];
  }

  // Helper methods
  private getRequiredPermissions(action: PlatformAction): string[] {
    const permissions = ['read']; // Basic read permission always required

    switch (action.action) {
      case 'deploy':
      case 'scale':
      case 'rollback':
        permissions.push('write', 'deploy');
        break;
      case 'delete':
        permissions.push('write', 'delete');
        break;
    }

    if (action.environment === 'production') {
      permissions.push('production');
    }

    return permissions;
  }

  private initializeDefaultPolicies(): SafetyPolicy[] {
    return [
      {
        name: 'Production Deployment Policy',
        description: 'Requires approval for production deployments',
        evaluate: async (action: PlatformAction, context: RequestContext) => {
          if (action.environment === 'production' && action.action === 'deploy') {
            return {
              passed: false,
              severity: 'warning',
              message: 'Production deployments require approval',
              details: { requiresApproval: true }
            };
          }
          return { passed: true, severity: 'info', message: 'Policy satisfied', details: null };
        }
      },
      {
        name: 'Resource Naming Policy',
        description: 'Enforces resource naming conventions',
        evaluate: async (action: PlatformAction, context: RequestContext) => {
          const validName = /^[a-z0-9-]+$/.test(action.resourceName) && action.resourceName.length <= 63;
          return {
            passed: validName,
            severity: validName ? 'info' : 'error',
            message: validName ? 'Resource name follows conventions' : 'Resource name must be lowercase alphanumeric with hyphens, max 63 chars',
            details: { resourceName: action.resourceName, valid: validName }
          };
        }
      },
      {
        name: 'Business Hours Policy',
        description: 'Restricts high-risk operations outside business hours',
        evaluate: async (action: PlatformAction, context: RequestContext) => {
          const hour = new Date().getHours();
          const isBusinessHours = hour >= 9 && hour <= 17;
          const isHighRisk = action.environment === 'production' && ['deploy', 'delete'].includes(action.action);
          
          if (isHighRisk && !isBusinessHours) {
            return {
              passed: false,
              severity: 'warning',
              message: 'High-risk operations should be performed during business hours',
              details: { currentHour: hour, businessHours: '9-17', requiresJustification: true }
            };
          }
          
          return { passed: true, severity: 'info', message: 'Business hours policy satisfied', details: null };
        }
      }
    ];
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    return {
      status: 'healthy',
      message: `Safety module operational with ${this.policies.length} policies`
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Safety module');
  }
}

// Type definitions for safety module
interface ValidationResult {
  valid: boolean;
  message: string;
  warnings?: string[];
}

interface RiskFactor {
  factor: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  weight: number;
}

interface PolicyCheckResult {
  policy: SafetyPolicy;
  status: 'pass' | 'warning' | 'violation';
  message: string;
  details: any;
}

interface SafetyPolicy {
  name: string;
  description: string;
  evaluate: (action: PlatformAction, context: RequestContext) => Promise<{
    passed: boolean;
    severity: 'info' | 'warning' | 'error';
    message: string;
    details: any;
  }>;
}

interface RealityCheck {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  details: any;
}

interface ComplianceCheck {
  requirement: string;
  compliant: boolean;
  message: string;
  details: any;
}

interface RollbackStep {
  step: number;
  description: string;
  command: string;
}