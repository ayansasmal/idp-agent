import { ModuleCommunicationLayer } from './WorkingModuleSystem';
import { defaultLogger } from '../shared/logger/Logger';

/**
 * Module Registry - Simplified registry that delegates to WorkingModuleSystem
 * Phase 1: All modules run locally in the same process
 * Phase 2: Modules can be extracted to standalone agents
 */
export class ModuleRegistry {
  private communication: ModuleCommunicationLayer;
  private logger = defaultLogger.child({ component: 'ModuleRegistry' });
  private initialized: boolean = false;

  constructor(networkMode: boolean = false) {
    this.communication = new ModuleCommunicationLayer();
  }

  /**
   * Initialize all modules and register them
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Module registry already initialized');
      return;
    }

    this.logger.info('Initializing module registry');

    try {
      // Initialize the communication layer (which handles module creation and registration)
      await this.communication.initialize();

      this.initialized = true;
      this.logger.info('Module registry initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize module registry', error);
      throw new Error(`Module registry initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the communication layer for sending requests to modules
   */
  getCommunicationLayer(): ModuleCommunicationLayer {
    if (!this.initialized) {
      throw new Error('Module registry not initialized. Call initialize() first.');
    }
    return this.communication;
  }

  /**
   * Get all available modules and their capabilities
   */
  getAvailableModules(): Record<string, string[]> {
    return this.communication.getAvailableModules();
  }

  /**
   * Check if a specific module is available
   */
  isModuleAvailable(moduleName: string): boolean {
    return this.communication.isModuleAvailable(moduleName);
  }

  /**
   * Get health status of all modules
   */
  async getModulesHealth(): Promise<Record<string, any>> {
    return this.communication.getAllModulesHealth();
  }

  /**
   * Get health status of a specific module
   */
  async getModuleHealth(moduleName: string): Promise<any> {
    return this.communication.getModuleHealth(moduleName);
  }

  /**
   * Test connectivity to all modules
   */
  async testConnectivity(): Promise<Record<string, boolean>> {
    return this.communication.testConnectivity();
  }

  /**
   * Switch between local and network communication modes
   * Phase 1: Local mode (method calls)
   * Phase 2: Network mode (HTTP calls to standalone agents)
   */
  setNetworkMode(enabled: boolean): void {
    this.communication.setNetworkMode(enabled);
    this.logger.info('Communication mode changed', { networkMode: enabled });
  }

  /**
   * Gracefully shutdown all modules
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down module registry');

    try {
      await this.communication.shutdown();
      this.initialized = false;
      this.logger.info('Module registry shutdown complete');
    } catch (error) {
      this.logger.error('Error during module registry shutdown', error);
    }
  }

  /**
   * Get module statistics and status
   */
  getModuleStats(): {
    totalModules: number;
    initializedModules: number;
    moduleNames: string[];
    capabilities: Record<string, string[]>;
  } {
    const capabilities = this.getAvailableModules();
    const moduleNames = Object.keys(capabilities);

    return {
      totalModules: moduleNames.length,
      initializedModules: this.initialized ? moduleNames.length : 0,
      moduleNames,
      capabilities
    };
  }

  /**
   * Validate that all required modules are available
   */
  validateRequiredModules(requiredModules: string[]): { valid: boolean; missing: string[] } {
    const missing = requiredModules.filter(moduleName => !this.isModuleAvailable(moduleName));

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Get module for a specific platform action
   */
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

  /**
   * Check if an action is supported by any module
   */
  isActionSupported(action: string): boolean {
    try {
      this.getModuleForAction(action);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all supported actions across all modules
   */
  getAllSupportedActions(): string[] {
    const allActions: string[] = [];
    const capabilities = this.getAvailableModules();

    Object.values(capabilities).forEach(moduleActions => {
      allActions.push(...moduleActions);
    });

    // Remove duplicates and sort
    return [...new Set(allActions)].sort();
  }
}