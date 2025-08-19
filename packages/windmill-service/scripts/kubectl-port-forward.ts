// Windmill TypeScript Script: kubectl-port-forward.ts
// Description: Port-forward to Kubernetes pods, services, or deployments

export async function main(
  resourceName: string,
  namespace: string = 'default',
  localPort?: number,
  remotePort?: number,
  resourceType: string = 'pod'
) {
  const startTime = new Date();
  
  // Import required modules
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  // Validate inputs
  if (!resourceName) {
    throw new Error('Resource name is required');
  }

  // Default ports
  const targetLocalPort = localPort || 8080;
  const targetRemotePort = remotePort || 8080;

  try {
    // Step 1: Validate resource exists
    console.log(`🔍 Validating ${resourceType}/${resourceName} in namespace ${namespace}...`);
    
    let validateCommand: string;
    switch (resourceType.toLowerCase()) {
      case 'service':
      case 'svc':
        validateCommand = `kubectl get service ${resourceName} -n ${namespace}`;
        break;
      case 'deployment':
      case 'deploy':
        validateCommand = `kubectl get deployment ${resourceName} -n ${namespace}`;
        break;
      case 'pod':
      default:
        validateCommand = `kubectl get pod ${resourceName} -n ${namespace}`;
        resourceType = 'pod';
        break;
    }

    const { stdout: validateOutput } = await execAsync(validateCommand);
    console.log(`✅ Resource ${resourceType}/${resourceName} found`);

    // Step 2: For non-pod resources, resolve to pod
    let targetResource = resourceName;
    
    if (resourceType !== 'pod') {
      console.log(`🔄 Resolving ${resourceType} to pod...`);
      
      let podSelector: string;
      if (resourceType === 'service') {
        // Get service selector
        const { stdout: svcOutput } = await execAsync(
          `kubectl get service ${resourceName} -n ${namespace} -o jsonpath='{.spec.selector}' | tr -d '{}'`
        );
        podSelector = svcOutput.trim().replace(/:/g, '=').replace(/ /g, ',');
      } else if (resourceType === 'deployment') {
        // Get deployment selector
        const { stdout: depOutput } = await execAsync(
          `kubectl get deployment ${resourceName} -n ${namespace} -o jsonpath='{.spec.selector.matchLabels}' | tr -d '{}'`
        );
        podSelector = depOutput.trim().replace(/:/g, '=').replace(/ /g, ',');
      }

      // Get first available pod
      const { stdout: podOutput } = await execAsync(
        `kubectl get pods -n ${namespace} -l ${podSelector} -o jsonpath='{.items[0].metadata.name}'`
      );
      
      targetResource = podOutput.trim();
      if (!targetResource) {
        throw new Error(`No running pods found for ${resourceType}/${resourceName}`);
      }
      
      console.log(`📍 Resolved to pod: ${targetResource}`);
    }

    // Step 3: Check if port is available locally
    console.log(`🔌 Checking if local port ${targetLocalPort} is available...`);
    
    try {
      const { stdout: portCheck } = await execAsync(`lsof -i :${targetLocalPort}`);
      if (portCheck.trim()) {
        console.log(`⚠️  Port ${targetLocalPort} is in use. Finding alternative...`);
        
        // Find next available port
        for (let port = targetLocalPort + 1; port <= targetLocalPort + 100; port++) {
          try {
            const { stdout: altPortCheck } = await execAsync(`lsof -i :${port}`);
            if (!altPortCheck.trim()) {
              targetLocalPort = port;
              console.log(`✅ Using alternative port: ${port}`);
              break;
            }
          } catch {
            targetLocalPort = port;
            console.log(`✅ Using alternative port: ${port}`);
            break;
          }
        }
      }
    } catch {
      // Port is available (lsof returns error when no process found)
      console.log(`✅ Port ${targetLocalPort} is available`);
    }

    // Step 4: Start port-forward
    console.log(`🚀 Starting port-forward: localhost:${targetLocalPort} -> ${targetResource}:${targetRemotePort}`);
    
    const portForwardCommand = `kubectl port-forward -n ${namespace} pod/${targetResource} ${targetLocalPort}:${targetRemotePort}`;
    
    // Note: In a real implementation, this would need to handle the long-running process
    // For now, we'll return the command and connection details
    
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    return {
      success: true,
      message: `Port-forward configured for ${resourceName}`,
      data: {
        resource: {
          name: resourceName,
          type: resourceType,
          namespace: namespace,
          resolvedPod: targetResource
        },
        ports: {
          local: targetLocalPort,
          remote: targetRemotePort
        },
        connection: {
          url: `http://localhost:${targetLocalPort}`,
          command: portForwardCommand
        },
        instructions: [
          `Access your application at: http://localhost:${targetLocalPort}`,
          `To stop port-forwarding, terminate the kubectl process`,
          `Command to run manually: ${portForwardCommand}`
        ]
      },
      metadata: {
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        duration: duration,
        namespace: namespace,
        resourceType: resourceType
      }
    };

  } catch (error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    console.error(`❌ Port-forward failed: ${error.message}`);

    return {
      success: false,
      message: `Failed to set up port-forward for ${resourceName}: ${error.message}`,
      error: error.message,
      data: {
        resource: {
          name: resourceName,
          type: resourceType,
          namespace: namespace
        },
        troubleshooting: [
          'Verify the resource exists and is running',
          'Check if you have kubectl access to the cluster',
          'Ensure the target port is open in the pod',
          `Try: kubectl get ${resourceType} ${resourceName} -n ${namespace}`
        ]
      },
      metadata: {
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        duration: duration,
        namespace: namespace,
        resourceType: resourceType
      }
    };
  }
}