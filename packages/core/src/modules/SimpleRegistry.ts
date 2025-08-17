/**
 * Simple Module Registry for Phase 2 Demo
 * This provides a working implementation without complex type issues
 */

export interface SimpleModule {
  name: string;
  capabilities: string[];
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
}

export class SimpleModuleRegistry {
  private modules: Map<string, SimpleModule>;
  private networkMode: boolean = false;

  constructor() {
    this.modules = new Map();
    this.initializeModules();
  }

  private initializeModules(): void {
    // Kubernetes Module
    this.modules.set('kubernetes', {
      name: 'kubernetes',
      capabilities: ['deploy', 'scale', 'status', 'logs', 'rollback', 'delete', 'list', 'describe'],
      status: 'healthy',
      message: 'Kubernetes module operational (simulation mode)'
    });

    // Safety Module
    this.modules.set('safety', {
      name: 'safety',
      capabilities: ['validate', 'assess-risk', 'check-policies', 'reality-check', 'compliance-check', 'generate-rollback-plan'],
      status: 'healthy',
      message: 'Safety module operational with default policies'
    });

    // Approval Module
    this.modules.set('approval', {
      name: 'approval',
      capabilities: ['request-approval', 'check-approval', 'approve', 'reject', 'list-pending', 'escalate'],
      status: 'healthy',
      message: 'Approval module operational with multi-channel notifications'
    });

    // Audit Module
    this.modules.set('audit', {
      name: 'audit',
      capabilities: ['log-event', 'query-audit-trail', 'generate-report', 'get-metrics', 'compliance-report', 'export-logs', 'search-events'],
      status: 'healthy',
      message: 'Audit module operational with comprehensive logging'
    });
  }

  getModuleStats(): {
    totalModules: number;
    initializedModules: number;
    moduleNames: string[];
    capabilities: Record<string, string[]>;
  } {
    const capabilities: Record<string, string[]> = {};
    
    this.modules.forEach((module, name) => {
      capabilities[name] = module.capabilities;
    });

    return {
      totalModules: this.modules.size,
      initializedModules: this.modules.size,
      moduleNames: Array.from(this.modules.keys()),
      capabilities
    };
  }

  async getModulesHealth(): Promise<Record<string, { status: string; message: string }>> {
    const health: Record<string, { status: string; message: string }> = {};
    
    this.modules.forEach((module, name) => {
      health[name] = {
        status: module.status,
        message: module.message
      };
    });

    return health;
  }

  async testConnectivity(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    this.modules.forEach((module, name) => {
      results[name] = module.status === 'healthy';
    });

    return results;
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

    if (!this.modules.has(moduleName)) {
      throw new Error(`Module ${moduleName} not available for action: ${action}`);
    }

    return moduleName;
  }

  setNetworkMode(enabled: boolean): void {
    this.networkMode = enabled;
  }

  validateRequiredModules(requiredModules: string[]): { valid: boolean; missing: string[] } {
    const missing = requiredModules.filter(moduleName => !this.modules.has(moduleName));
    
    return {
      valid: missing.length === 0,
      missing
    };
  }

  getAllSupportedActions(): string[] {
    const allActions: string[] = [];
    
    this.modules.forEach(module => {
      allActions.push(...module.capabilities);
    });

    // Remove duplicates and sort
    return [...new Set(allActions)].sort();
  }

  async shutdown(): Promise<void> {
    // Simulate shutdown
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}