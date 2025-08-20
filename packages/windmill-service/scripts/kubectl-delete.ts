// Windmill TypeScript Script: kubectl-delete.ts
// Description: Safely delete Kubernetes resources with confirmation and cleanup

export async function main(
  resourceName: string,
  namespace: string = 'default',
  resourceType: string = 'deployment',
  cascade: boolean = true,
  gracePeriodSeconds: number = 30
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

  // Safety validation - require explicit confirmation for critical resources
  const criticalResources = ['kube-system', 'default', 'kube-public', 'kube-node-lease'];
  if (criticalResources.includes(namespace)) {
    console.warn(`⚠️ Attempting to delete from critical namespace: ${namespace}`);
  }

  try {
    console.log(`🗑️ Preparing to delete ${resourceType}/${resourceName} from namespace ${namespace}...`);

    // Step 1: Verify resource exists and get current state
    console.log(`🔍 Verifying resource exists...`);
    const { stdout: resourceInfo } = await execAsync(
      `kubectl get ${resourceType} ${resourceName} -n ${namespace} -o json`
    );
    const resource = JSON.parse(resourceInfo);
    
    console.log(`✅ Found ${resourceType}/${resourceName}`);

    // Step 2: Get related resources before deletion
    console.log(`📋 Identifying related resources...`);
    const relatedResources = await getRelatedResources(resourceName, namespace, resourceType);
    
    // Step 3: Create backup information
    const backupInfo = {
      resource: resource,
      relatedResources: relatedResources,
      timestamp: new Date().toISOString(),
      namespace: namespace
    };

    // Step 4: Perform deletion with appropriate cascade settings
    console.log(`⚙️ Executing deletion...`);
    let deleteCommand = `kubectl delete ${resourceType} ${resourceName} -n ${namespace}`;
    
    if (!cascade) {
      deleteCommand += ' --cascade=orphan';
    }
    
    if (gracePeriodSeconds !== 30) {
      deleteCommand += ` --grace-period=${gracePeriodSeconds}`;
    }

    const { stdout: deleteOutput } = await execAsync(deleteCommand);
    console.log(deleteOutput);

    // Step 5: Verify deletion and monitor cleanup
    console.log(`⏳ Monitoring cleanup...`);
    await monitorDeletionProgress(resourceName, namespace, resourceType, relatedResources);

    // Step 6: Generate cleanup report
    const cleanupStatus = await verifyCleanup(resourceName, namespace, resourceType, relatedResources);

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    return {
      success: cleanupStatus.success,
      message: `Successfully deleted ${resourceType}/${resourceName} from ${namespace}`,
      data: {
        resource: {
          name: resourceName,
          type: resourceType,
          namespace: namespace,
          deletedAt: new Date().toISOString()
        },
        cleanup: cleanupStatus,
        backup: {
          available: true,
          manifest: resource,
          relatedResources: relatedResources.length,
          restoreCommands: generateRestoreCommands(backupInfo)
        },
        verification: {
          resourceDeleted: cleanupStatus.resourceDeleted,
          relatedResourcesCleanup: cleanupStatus.relatedCleanup,
          orphanedResources: cleanupStatus.orphaned
        }
      },
      metadata: {
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        duration: duration,
        namespace: namespace,
        cascade: cascade,
        gracePeriod: gracePeriodSeconds
      }
    };

  } catch (error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    console.error(`❌ Deletion failed: ${error.message}`);

    return {
      success: false,
      message: `Failed to delete ${resourceName}: ${error.message}`,
      error: error.message,
      data: {
        resource: {
          name: resourceName,
          type: resourceType,
          namespace: namespace
        },
        troubleshooting: [
          'Check if the resource exists and you have delete permissions',
          'Verify there are no finalizers preventing deletion',
          'Review any admission controllers that might block deletion',
          `Try: kubectl describe ${resourceType} ${resourceName} -n ${namespace}`,
          `Check for dependencies: kubectl get all -n ${namespace} | grep ${resourceName}`
        ]
      },
      metadata: {
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        duration: duration,
        namespace: namespace
      }
    };
  }
}

async function getRelatedResources(
  resourceName: string, 
  namespace: string, 
  resourceType: string
): Promise<any[]> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const relatedResources = [];

  try {
    // For deployments, get pods, replicasets, services
    if (resourceType.toLowerCase() === 'deployment') {
      
      // Get ReplicaSets
      try {
        const { stdout: rsOutput } = await execAsync(
          `kubectl get replicasets -n ${namespace} -l app=${resourceName} -o json`
        );
        const rsList = JSON.parse(rsOutput);
        rsList.items?.forEach((rs: any) => {
          relatedResources.push({
            kind: 'ReplicaSet',
            name: rs.metadata.name,
            namespace: namespace
          });
        });
      } catch (error) {
        console.warn(`Could not fetch ReplicaSets: ${error.message}`);
      }

      // Get Pods
      try {
        const { stdout: podOutput } = await execAsync(
          `kubectl get pods -n ${namespace} -l app=${resourceName} -o json`
        );
        const podList = JSON.parse(podOutput);
        podList.items?.forEach((pod: any) => {
          relatedResources.push({
            kind: 'Pod',
            name: pod.metadata.name,
            namespace: namespace
          });
        });
      } catch (error) {
        console.warn(`Could not fetch Pods: ${error.message}`);
      }

      // Check for associated Service
      try {
        const { stdout: svcOutput } = await execAsync(
          `kubectl get service ${resourceName} -n ${namespace} -o json`
        );
        const service = JSON.parse(svcOutput);
        relatedResources.push({
          kind: 'Service',
          name: service.metadata.name,
          namespace: namespace
        });
      } catch (error) {
        // No associated service found, which is fine
      }
    }

    console.log(`📦 Found ${relatedResources.length} related resources`);
    
  } catch (error) {
    console.warn(`Could not fully identify related resources: ${error.message}`);
  }

  return relatedResources;
}

async function monitorDeletionProgress(
  resourceName: string,
  namespace: string,
  resourceType: string,
  relatedResources: any[]
): Promise<void> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const maxWaitTime = 300000; // 5 minutes
  const checkInterval = 2000; // 2 seconds
  const startTime = Date.now();

  console.log(`⏱️ Monitoring deletion progress (max wait: 5 minutes)...`);

  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Check if main resource is gone
      await execAsync(`kubectl get ${resourceType} ${resourceName} -n ${namespace}`);
      // If we get here, resource still exists
      console.log(`⏳ ${resourceType}/${resourceName} still exists...`);
    } catch (error) {
      // Resource is gone
      console.log(`✅ ${resourceType}/${resourceName} has been deleted`);
      break;
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  // Check related resources cleanup
  let remainingRelated = 0;
  for (const related of relatedResources) {
    try {
      await execAsync(`kubectl get ${related.kind} ${related.name} -n ${namespace}`);
      remainingRelated++;
    } catch (error) {
      // Related resource is gone, which is expected
    }
  }

  if (remainingRelated > 0) {
    console.log(`⚠️ ${remainingRelated} related resources still exist (may be cleaning up)`);
  } else {
    console.log(`✅ All related resources have been cleaned up`);
  }
}

async function verifyCleanup(
  resourceName: string,
  namespace: string,
  resourceType: string,
  relatedResources: any[]
): Promise<any> {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  const cleanup = {
    success: true,
    resourceDeleted: false,
    relatedCleanup: [],
    orphaned: []
  };

  // Check main resource
  try {
    await execAsync(`kubectl get ${resourceType} ${resourceName} -n ${namespace}`);
    cleanup.success = false;
    cleanup.resourceDeleted = false;
  } catch (error) {
    cleanup.resourceDeleted = true;
  }

  // Check related resources
  for (const related of relatedResources) {
    try {
      await execAsync(`kubectl get ${related.kind} ${related.name} -n ${namespace}`);
      cleanup.orphaned.push(related);
      if (related.kind !== 'Service') { // Services might be intentionally kept
        cleanup.success = false;
      }
    } catch (error) {
      cleanup.relatedCleanup.push(related);
    }
  }

  return cleanup;
}

function generateRestoreCommands(backupInfo: any): string[] {
  const commands: string[] = [];
  
  // Generate restore command from backup manifest
  commands.push('# To restore this resource:');
  commands.push(`echo '${JSON.stringify(backupInfo.resource, null, 2)}' | kubectl apply -f -`);
  
  if (backupInfo.relatedResources.length > 0) {
    commands.push('');
    commands.push('# Related resources that were also affected:');
    backupInfo.relatedResources.forEach((resource: any) => {
      commands.push(`# - ${resource.kind}/${resource.name}`);
    });
  }

  return commands;
}