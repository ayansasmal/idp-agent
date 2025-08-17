import { ModuleRegistry } from './ModuleRegistry';
import { ModuleRequest, ModuleResponse } from '../types';

/**
 * Compatibility layer to bridge between old ModuleCommunicationLayer interface
 * and new ModuleRegistry system
 */
export class ModuleCommunicationLayer {
  private registry: ModuleRegistry;

  constructor() {
    this.registry = new ModuleRegistry();
  }

  async initialize(): Promise<void> {
    await this.registry.initialize();
  }

  async sendRequest(request: ModuleRequest): Promise<ModuleResponse> {
    const communication = this.registry.getCommunicationLayer();
    return communication.sendRequest(request);
  }

  async getAllModulesHealth(): Promise<Record<string, any>> {
    return this.registry.getModulesHealth();
  }

  getAvailableModules(): Record<string, string[]> {
    return this.registry.getAvailableModules();
  }

  isModuleAvailable(moduleName: string): boolean {
    return this.registry.isModuleAvailable(moduleName);
  }

  async getModuleHealth(moduleName: string): Promise<any> {
    return this.registry.getModuleHealth(moduleName);
  }

  setNetworkMode(enabled: boolean): void {
    this.registry.setNetworkMode(enabled);
  }

  async shutdown(): Promise<void> {
    await this.registry.shutdown();
  }

  // Additional methods that might be needed
  getModuleForAction(action: string): string {
    return this.registry.getModuleForAction(action);
  }

  getAllSupportedActions(): string[] {
    return this.registry.getAllSupportedActions();
  }

  async testConnectivity(): Promise<Record<string, boolean>> {
    return this.registry.testConnectivity();
  }
}