import { BaseModule } from './base/SimpleBaseModule';
import { KubernetesModule } from './kubernetes/KubernetesModule';
import { SafetyModule } from './safety/SafetyModule';
import { ApprovalModule } from './approval/ApprovalModule';
import { AuditModule } from './audit/AuditModule';
import { ModuleRequest, ModuleResponse } from '../types';
import { defaultLogger } from '../shared/logger/Logger';

/**
 * Working Module Communication Layer for Phase 2
 * This provides the interface that PrimaryAgent expects
 */
export class ModuleCommunicationLayer {
  private modules: Map<string, BaseModule>;
  private logger = defaultLogger.child({ component: 'ModuleCommunication' });
  private networkMode: boolean = false;
  private initialized: boolean = false;

  constructor() {
    this.modules = new Map();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing module communication layer');

    try {
      // Create and register modules
      const kubernetesModule = new KubernetesModule();
      const safetyModule = new SafetyModule();
      const approvalModule = new ApprovalModule();
      const auditModule = new AuditModule();

      this.registerModule('kubernetes', kubernetesModule);
      this.registerModule('safety', safetyModule);
      this.registerModule('approval', approvalModule);
      this.registerModule('audit', auditModule);

      // Initialize all modules
      await this.initializeModules();

      this.initialized = true;
      this.logger.info('Module communication layer initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize module communication layer', error);
      throw error;
    }
  }

  registerModule(name: string, module: BaseModule): void {
    this.modules.set(name, module);
    this.logger.info('Module registered', { moduleName: name, capabilities: module.getCapabilities() });
  }

  async initializeModules(): Promise<void> {
    for (const [name, module] of this.modules) {
      try {
        await module.initialize();
        this.logger.info('Module initialized successfully', { moduleName: name });
      } catch (error) {
        this.logger.error('Module initialization failed', { moduleName: name, error });
        throw new Error(`Failed to initialize module ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  async sendRequest(request: ModuleRequest): Promise<ModuleResponse> {
    if (!this.initialized) {
      throw new Error('Module communication layer not initialized');
    }

    const module = this.modules.get(request.module);
    if (!module) {
      throw new Error(`Module not found: ${request.module}`);
    }

    // Call module and convert response format
    try {
      const response = await module.process(request);

      // Handle the response format from our modules
      if (typeof response === 'object' && response !== null) {
        // If it's already in the right format, use it
        if ('requestId' in response) {
          return response as ModuleResponse;
        }

        // Convert simple response format
        if ('success' in response && 'message' in response) {
          const legacyResponse = response as any;
          return {
            requestId: request.requestId,
            success: legacyResponse.success,
            result: legacyResponse.data || null,
            metadata: legacyResponse.metadata || { module: request.module },
            nextActions: [],
            errors: legacyResponse.success ? [] : [legacyResponse.message as string],
            warnings: [],
            message: legacyResponse.message || 'Operation completed',
            timestamp: new Date().toISOString()
          };
        }
      }

      // Fallback for unknown response format
      return {
        requestId: request.requestId,
        success: true,
        result: response,
        metadata: { module: request.module },
        nextActions: [],
        errors: [],
        warnings: [],
        message: 'Operation completed',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        requestId: request.requestId,
        success: false,
        result: null,
        metadata: { module: request.module, error: error instanceof Error ? error.message : 'Unknown error' },
        nextActions: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
        message: `Module communication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getAllModulesHealth(): Promise<Record<string, any>> {
    const health: Record<string, any> = {};

    for (const [name, module] of this.modules) {
      try {
        health[name] = await module.getHealth();
      } catch (error) {
        health[name] = {
          status: 'unhealthy',
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }

    return health;
  }

  getAvailableModules(): Record<string, string[]> {
    const modules: Record<string, string[]> = {};

    for (const [name, module] of this.modules) {
      modules[name] = module.getCapabilities();
    }

    return modules;
  }

  isModuleAvailable(moduleName: string): boolean {
    return this.modules.has(moduleName);
  }

  async getModuleHealth(moduleName: string): Promise<any> {
    const module = this.modules.get(moduleName);
    if (!module) {
      return {
        status: 'not_found',
        message: `Module '${moduleName}' not found`
      };
    }

    try {
      return await module.getHealth();
    } catch (error) {
      return {
        status: 'error',
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  setNetworkMode(enabled: boolean): void {
    this.networkMode = enabled;
    this.logger.info('Network mode changed', { networkMode: enabled });
  }

  async shutdownModules(): Promise<void> {
    for (const [name, module] of this.modules) {
      try {
        await module.shutdown();
        this.logger.info('Module shutdown successfully', { moduleName: name });
      } catch (error) {
        this.logger.error('Module shutdown failed', { moduleName: name, error });
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.shutdownModules();
    this.modules.clear();
    this.initialized = false;
  }

  getModuleForAction(action: string): string {
    const actionModuleMap: Record<string, string> = {
      // Kubernetes operations
      deploy: 'kubernetes',
      scale: 'kubernetes',
      status: 'kubernetes',
      logs: 'kubernetes',
      delete: 'kubernetes',
      rollback: 'kubernetes',
      list: 'kubernetes',
      describe: 'kubernetes',

      // Safety operations
      validate: 'safety',
      'assess-risk': 'safety',
      'check-policies': 'safety',
      'reality-check': 'safety',
      'compliance-check': 'safety',
      'generate-rollback-plan': 'safety',

      // Approval operations
      'request-approval': 'approval',
      'check-approval': 'approval',
      approve: 'approval',
      reject: 'approval',
      'list-pending': 'approval',
      escalate: 'approval',

      // Audit operations
      'log-event': 'audit',
      'query-audit-trail': 'audit',
      'generate-report': 'audit',
      'get-metrics': 'audit',
      'compliance-report': 'audit',
      'export-logs': 'audit',
      'search-events': 'audit'
    };

    const moduleName = actionModuleMap[action];
    if (!moduleName) {
      throw new Error(`No module found for action: ${action}`);
    }

    if (!this.isModuleAvailable(moduleName)) {
      throw new Error(`Module ${moduleName} not available for action: ${action}`);
    }

    return moduleName;
  }

  getAllSupportedActions(): string[] {
    const allActions: string[] = [];
    const capabilities = this.getAvailableModules();

    Object.values(capabilities).forEach(moduleActions => {
      allActions.push(...moduleActions);
    });

    return [...new Set(allActions)].sort();
  }

  async testConnectivity(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name] of this.modules) {
      try {
        const health = await this.getModuleHealth(name);
        results[name] = health.status === 'healthy';
      } catch (error) {
        results[name] = false;
      }
    }

    return results;
  }
}