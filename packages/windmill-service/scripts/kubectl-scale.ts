// Windmill TypeScript Script: kubectl-scale.ts
// Description: Scale Kubernetes deployments with validation and monitoring

export async function main(
  resourceName: string,
  replicas: number,
  namespace: string = 'default',
  resourceType: string = 'deployment'
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

  if (replicas < 0) {
    throw new Error('Replica count cannot be negative');
  }

  if (replicas > 50) {
    console.warn('⚠️ Large replica count detected. Consider resource limits.');
  }

  try {
    console.log(`📏 Scaling ${resourceType}/${resourceName} to ${replicas} replicas...`);

    // Step 1: Verify resource exists and get current state
    const { stdout: currentState } = await execAsync(
      `kubectl get ${resourceType} ${resourceName} -n ${namespace} -o json`
    );
    const resource = JSON.parse(currentState);
    const currentReplicas = resource.spec?.replicas || 0;

    console.log(`📊 Current replicas: ${currentReplicas}, Target replicas: ${replicas}`);

    if (currentReplicas === replicas) {
      console.log(`✅ Already at target replica count (${replicas})`);
      
      return {
        success: true,
        message: `${resourceName} already has ${replicas} replicas`,
        data: {
          resource: {
            name: resourceName,
            type: resourceType,
            namespace: namespace,
            replicas: {
              current: currentReplicas,
              target: replicas,
              change: 0
            },
            status: 'unchanged'
          }
        },
        metadata: {
          startedAt: startTime.toISOString(),
          completedAt: new Date().toISOString(),
          duration: new Date().getTime() - startTime.getTime(),
          namespace: namespace
        }
      };
    }

    // Step 2: Perform scaling operation
    console.log(`⚙️ Executing scale operation...`);
    const { stdout: scaleOutput } = await execAsync(
      `kubectl scale ${resourceType} ${resourceName} --replicas=${replicas} -n ${namespace}`
    );
    console.log(scaleOutput);

    // Step 3: Monitor rollout progress
    console.log(`⏳ Monitoring rollout progress...`);
    
    // Wait for rollout with timeout
    const timeoutSeconds = Math.max(300, replicas * 10); // Scale timeout based on replica count
    try {
      await execAsync(
        `kubectl rollout status ${resourceType}/${resourceName} -n ${namespace} --timeout=${timeoutSeconds}s`
      );
      console.log(`✅ Rollout completed successfully`);
    } catch (rolloutError) {
      console.warn(`⚠️ Rollout monitoring failed: ${rolloutError.message}`);
      // Continue to get final status even if rollout monitoring failed
    }

    // Step 4: Get final status
    const { stdout: finalState } = await execAsync(
      `kubectl get ${resourceType} ${resourceName} -n ${namespace} -o json`
    );
    const finalResource = JSON.parse(finalState);
    
    // Get pod information
    const { stdout: podOutput } = await execAsync(
      `kubectl get pods -n ${namespace} -l app=${resourceName} -o json`
    );
    const pods = JSON.parse(podOutput);

    // Analyze scaling operation
    const analysis = analyzeScalingOperation(
      currentReplicas, 
      replicas, 
      finalResource, 
      pods.items || []
    );

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    return {
      success: analysis.success,
      message: analysis.message,
      data: {
        resource: {
          name: resourceName,
          type: resourceType,
          namespace: namespace,
          replicas: {
            previous: currentReplicas,
            target: replicas,
            current: finalResource.status?.replicas || 0,
            ready: finalResource.status?.readyReplicas || 0,
            available: finalResource.status?.availableReplicas || 0,
            change: replicas - currentReplicas
          },
          status: analysis.status
        },
        pods: (pods.items || []).map(pod => ({
          name: pod.metadata.name,
          status: pod.status.phase,
          ready: pod.status.conditions?.find(c => c.type === 'Ready')?.status === 'True',
          age: calculateAge(pod.metadata.creationTimestamp),
          node: pod.spec.nodeName,
          restarts: pod.status.containerStatuses?.[0]?.restartCount || 0
        })),
        scaling: {
          direction: replicas > currentReplicas ? 'up' : 'down',
          factor: replicas / Math.max(currentReplicas, 1),
          duration: duration,
          efficiency: analysis.efficiency
        },
        monitoring: {
          nextSteps: [
            `Monitor status: kubectl get ${resourceType} ${resourceName} -n ${namespace} -w`,
            `Check pods: kubectl get pods -n ${namespace} -l app=${resourceName}`,
            `View events: kubectl get events -n ${namespace} --sort-by=.lastTimestamp`,
            `Check logs: kubectl logs -l app=${resourceName} -n ${namespace} --tail=50`
          ]
        }
      },
      metadata: {
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        duration: duration,
        namespace: namespace,
        operation: 'scale'
      }
    };

  } catch (error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    console.error(`❌ Scaling failed: ${error.message}`);

    return {
      success: false,
      message: `Failed to scale ${resourceName}: ${error.message}`,
      error: error.message,
      data: {
        resource: {
          name: resourceName,
          type: resourceType,
          namespace: namespace,
          replicas: {
            target: replicas
          }
        },
        troubleshooting: [
          'Check if the resource exists and you have permissions',
          'Verify cluster has sufficient resources for scaling up',
          'Review resource quotas and limits in the namespace',
          `Try: kubectl describe ${resourceType} ${resourceName} -n ${namespace}`,
          'Check for any admission controllers that might block scaling'
        ]
      },
      metadata: {
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        duration: duration,
        namespace: namespace,
        operation: 'scale'
      }
    };
  }
}

function analyzeScalingOperation(
  previousReplicas: number,
  targetReplicas: number,
  finalResource: any,
  pods: any[]
): any {
  const status = finalResource.status || {};
  const currentReplicas = status.replicas || 0;
  const readyReplicas = status.readyReplicas || 0;
  const availableReplicas = status.availableReplicas || 0;

  const analysis = {
    success: false,
    message: '',
    status: 'unknown',
    efficiency: 0
  };

  // Determine success criteria
  if (readyReplicas === targetReplicas && availableReplicas === targetReplicas) {
    analysis.success = true;
    analysis.status = 'completed';
    analysis.message = `Successfully scaled to ${targetReplicas} replicas`;
    analysis.efficiency = 100;
  } else if (readyReplicas > 0) {
    analysis.success = true;
    analysis.status = 'partial';
    analysis.message = `Partially scaled: ${readyReplicas}/${targetReplicas} replicas ready`;
    analysis.efficiency = Math.round((readyReplicas / targetReplicas) * 100);
  } else {
    analysis.success = false;
    analysis.status = 'failed';
    analysis.message = `Scaling failed: 0/${targetReplicas} replicas ready`;
    analysis.efficiency = 0;
  }

  // Additional status details
  if (currentReplicas !== targetReplicas) {
    analysis.message += ` (${currentReplicas} total replicas)`;
  }

  return analysis;
}

function calculateAge(creationTimestamp: string): string {
  const created = new Date(creationTimestamp);
  const now = new Date();
  const ageMs = now.getTime() - created.getTime();
  
  const minutes = Math.floor(ageMs / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}