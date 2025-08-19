# Windmill Service

Module-agnostic Windmill integration service for the AI-IDP platform. This service provides a clean interface for any module to execute scripts and workflows via Windmill, enabling powerful automation capabilities.

## Overview

The Windmill Service acts as a bridge between the AI-IDP platform and Windmill, allowing modules to:

- Execute kubectl operations via Windmill scripts
- Run complex workflows with multiple steps
- Monitor execution status and retrieve logs
- Handle long-running operations asynchronously
- Provide rich error handling and troubleshooting

## Key Features

### 🚀 **Module-Agnostic Design**
- Any module (Kubernetes, Safety, Audit, etc.) can use this service
- Clean, typed interface for all operations
- Consistent response format across all modules

### ⚡ **kubectl Operations**
- **Port-forwarding**: Full support for pods, services, and deployments
- **Status checks**: Comprehensive resource health analysis
- **Deployments**: Advanced deployment with validation
- **Scaling**: Intelligent scaling with monitoring
- **Logs**: Advanced log aggregation and filtering
- **Rollbacks**: Safe rollback with history validation

### 🔧 **Advanced Features**
- Asynchronous execution with job tracking
- Automatic retry logic with exponential backoff
- Rich error handling and troubleshooting guidance
- Health checks and connectivity monitoring
- Structured logging with correlation IDs

## Installation

```bash
cd packages/windmill-service
npm install
```

## Configuration

```typescript
import { WindmillService } from '@ai-idp/windmill-service';

const service = new WindmillService({
  baseUrl: 'http://localhost:8000',    // Windmill instance URL
  workspace: 'admins',                 // Windmill workspace
  token: 'your-token',                 // Optional: authentication token
  timeout: 30000,                      // Request timeout (30 seconds)
  retries: 3                          // Retry attempts
});

await service.initialize();
```

## Usage Examples

### Basic Script Execution

```typescript
// Execute a kubectl status check
const result = await service.executeScript({
  path: 'u/admin/kubectl-status',
  parameters: {
    resourceName: 'nginx-server',
    namespace: 'default',
    resourceType: 'deployment'
  }
});

console.log(result.status); // 'completed' | 'error' | 'pending' | 'running'
console.log(result.result); // Script output
```

### kubectl Operations

```typescript
// Port-forward to a service
const portForwardResult = await service.executeKubectlOperation({
  action: 'port-forward',
  resourceName: 'api-gateway',
  namespace: 'production',
  environment: 'production',
  parameters: {
    localPort: 8080,
    remotePort: 3000,
    resourceType: 'service'
  }
});

if (portForwardResult.success) {
  console.log('Access URL:', portForwardResult.data.connection.url);
}
```

### Workflow Execution

```typescript
// Execute a complex deployment workflow
const workflowResult = await service.executeWorkflow({
  path: 'u/admin/deploy-with-validation',
  parameters: {
    appName: 'user-service',
    environment: 'staging',
    image: 'user-service:v1.2.3',
    replicas: 3
  }
});
```

### Status Monitoring

```typescript
// Monitor long-running operations
const jobId = 'job-123';
const status = await service.getExecutionStatus(jobId);

if (status.status === 'running') {
  const logs = await service.getExecutionLogs(jobId);
  console.log('Current logs:', logs);
}
```

## Integration with Modules

### Kubernetes Module Integration

```typescript
// In KubernetesModule.ts
import { WindmillService } from '@ai-idp/windmill-service';

class KubernetesModule extends BaseModule {
  constructor(private windmillService: WindmillService) {
    super();
  }

  async process(request: ModuleRequest): Promise<ModuleResponse> {
    if (this.isComplexOperation(request)) {
      // Route complex operations to Windmill
      const result = await this.windmillService.executeKubectlOperation({
        action: request.action,
        resourceName: request.parameters.resourceName,
        namespace: request.parameters.namespace,
        environment: request.context.environment,
        parameters: request.parameters
      });

      return this.createFormattedResponse(
        result.success,
        result.message,
        result.data,
        request.action,
        request.parameters.resourceName,
        request.parameters.namespace
      );
    } else {
      // Use existing JavaScript client for simple operations
      return await this.handleWithJSClient(request);
    }
  }

  private isComplexOperation(request: ModuleRequest): boolean {
    const complexOperations = ['port-forward', 'advanced-deploy', 'multi-step-rollback'];
    return complexOperations.includes(request.action);
  }
}
```

### Other Module Integration

```typescript
// Any module can use Windmill for automation
class SecurityModule extends BaseModule {
  constructor(private windmillService: WindmillService) {
    super();
  }

  async runSecurityScan(target: string): Promise<ModuleResponse> {
    const result = await this.windmillService.executeScript({
      path: 'u/security/vulnerability-scan',
      parameters: { target, scanType: 'comprehensive' }
    });

    return {
      success: result.status === 'completed',
      message: result.status === 'completed' ? 'Security scan completed' : 'Scan failed',
      data: result.result
    };
  }
}
```

## Available Scripts

The service includes pre-built kubectl scripts:

- **`kubectl-port-forward`**: Port-forward to pods, services, or deployments
- **`kubectl-status`**: Comprehensive resource status with health analysis
- **`kubectl-logs`**: Advanced log collection and filtering
- **`kubectl-deploy`**: Advanced deployment with validation
- **`kubectl-scale`**: Intelligent scaling with monitoring
- **`kubectl-rollback`**: Safe rollback with history
- **`kubectl-delete`**: Secure deletion with confirmations

## Error Handling

The service provides rich error information:

```typescript
const result = await service.executeKubectlOperation(operation);

if (!result.success) {
  console.error('Operation failed:', result.error);
  console.log('Troubleshooting:', result.data?.troubleshooting);
}
```

## Development

### Running Tests

```bash
npm run test
```

### Type Checking

```bash
npm run type-check
```

### Building

```bash
npm run build
```

## Architecture Benefits

1. **🔄 Module Agnostic**: Any current or future module can leverage Windmill
2. **⚡ Full kubectl Parity**: No limitations compared to native kubectl operations
3. **📈 Scalable**: Independent service scaling based on workload
4. **🛡️ Secure**: Integrated with existing approval and audit systems
5. **🔮 Future-Proof**: Easy to add new script types and capabilities
6. **⚙️ Production-Ready**: Comprehensive error handling, logging, and monitoring

## Next Steps

1. Deploy Windmill scripts to your Windmill instance
2. Configure authentication and workspace access
3. Integrate with your modules using the provided interfaces
4. Set up monitoring and alerting for script executions

For more information about Windmill, see: https://www.windmill.dev/docs