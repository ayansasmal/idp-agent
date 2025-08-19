import { describe, it, expect, beforeEach } from 'vitest';
import { WindmillService } from './WindmillService';
import { WindmillConfig } from './types';

describe('WindmillService', () => {
  let service: WindmillService;
  
  beforeEach(() => {
    const config: Partial<WindmillConfig> = {
      baseUrl: 'http://localhost:8000',
      workspace: 'test',
      timeout: 5000
    };
    
    service = new WindmillService(config);
  });

  it('should initialize with default configuration', () => {
    const defaultService = new WindmillService();
    expect(defaultService).toBeInstanceOf(WindmillService);
  });

  it('should initialize with custom configuration', () => {
    expect(service).toBeInstanceOf(WindmillService);
  });

  it('should throw error when not initialized', async () => {
    await expect(service.executeScript({
      path: 'test/script',
      parameters: {}
    })).rejects.toThrow('WindmillService not initialized');
  });

  it('should list default kubectl scripts', async () => {
    // Mock initialize for testing
    (service as any).isInitialized = true;
    
    const scripts = await service.listScripts();
    expect(scripts).toContain('u/admin/kubectl-deploy');
    expect(scripts).toContain('u/admin/kubectl-port-forward');
    expect(scripts).toContain('u/admin/kubectl-status');
  });

  it('should generate kubectl operation response structure', async () => {
    // Mock initialize for testing
    (service as any).isInitialized = true;
    
    // Mock the executeScript method for testing
    const mockExecuteScript = async () => ({
      jobId: 'test-job-123',
      status: 'completed' as const,
      result: { success: true },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 1000
    });
    
    service.executeScript = mockExecuteScript;

    const operation = {
      action: 'status' as const,
      resourceName: 'test-app',
      namespace: 'default',
      environment: 'development' as const,
      parameters: {}
    };

    const result = await service.executeKubectlOperation(operation);
    
    expect(result.success).toBe(true);
    expect(result.metadata.service).toBe('windmill');
    expect(result.metadata.operation).toBe('status');
    expect(result.executionId).toBe('test-job-123');
  });
});