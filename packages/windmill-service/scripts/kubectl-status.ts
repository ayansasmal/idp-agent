// Windmill TypeScript Script: kubectl-status.ts
// Description: Get comprehensive status of Kubernetes resources

export async function main(
  resourceName: string,
  namespace: string = 'default',
  resourceType: string = 'deployment'
) {
  const startTime = new Date();
  
  // Import required modules
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  if (!resourceName) {
    throw new Error('Resource name is required');
  }

  try {
    console.log(`📊 Getting status for ${resourceType}/${resourceName} in namespace ${namespace}...`);

    // Step 1: Get main resource info
    const { stdout: resourceInfo } = await execAsync(
      `kubectl get ${resourceType} ${resourceName} -n ${namespace} -o json`
    );
    const resource = JSON.parse(resourceInfo);

    // Step 2: Get associated pods
    console.log('🔍 Finding associated pods...');
    let podSelector = '';
    
    if (resourceType === 'deployment') {
      const matchLabels = resource.spec?.selector?.matchLabels || {};
      podSelector = Object.entries(matchLabels)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
    } else if (resourceType === 'service') {
      const selector = resource.spec?.selector || {};
      podSelector = Object.entries(selector)
        .map(([key, value]) => `${key}=${value}`)
        .join(',');
    }

    let pods = [];
    if (podSelector) {
      try {
        const { stdout: podInfo } = await execAsync(
          `kubectl get pods -n ${namespace} -l ${podSelector} -o json`
        );
        const podList = JSON.parse(podInfo);
        pods = podList.items || [];
      } catch (error) {
        console.warn('Could not fetch pods:', error.message);
      }
    }

    // Step 3: Get resource events
    console.log('📋 Fetching recent events...');
    let events = [];
    try {
      const { stdout: eventInfo } = await execAsync(
        `kubectl get events -n ${namespace} --field-selector involvedObject.name=${resourceName} --sort-by='.lastTimestamp' -o json`
      );
      const eventList = JSON.parse(eventInfo);
      events = (eventList.items || []).slice(-10); // Last 10 events
    } catch (error) {
      console.warn('Could not fetch events:', error.message);
    }

    // Step 4: Get logs from pods (if any)
    console.log('📜 Collecting recent logs...');
    const podLogs = [];
    for (const pod of pods.slice(0, 3)) { // Limit to first 3 pods
      try {
        const { stdout: logOutput } = await execAsync(
          `kubectl logs ${pod.metadata.name} -n ${namespace} --tail=50`
        );
        podLogs.push({
          podName: pod.metadata.name,
          logs: logOutput.trim()
        });
      } catch (error) {
        podLogs.push({
          podName: pod.metadata.name,
          logs: `Error fetching logs: ${error.message}`
        });
      }
    }

    // Step 5: Analyze health
    const healthAnalysis = analyzeResourceHealth(resource, pods, events);

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    return {
      success: true,
      message: `Status retrieved for ${resourceType}/${resourceName}`,
      data: {
        resource: {
          name: resourceName,
          type: resourceType,
          namespace: namespace,
          status: resource.status,
          spec: resource.spec,
          metadata: {
            creationTimestamp: resource.metadata.creationTimestamp,
            labels: resource.metadata.labels,
            annotations: resource.metadata.annotations
          }
        },
        pods: pods.map(pod => ({
          name: pod.metadata.name,
          status: pod.status.phase,
          ready: pod.status.conditions?.find(c => c.type === 'Ready')?.status === 'True',
          restarts: pod.status.containerStatuses?.[0]?.restartCount || 0,
          node: pod.spec.nodeName,
          ip: pod.status.podIP,
          createdAt: pod.metadata.creationTimestamp
        })),
        events: events.map(event => ({
          type: event.type,
          reason: event.reason,
          message: event.message,
          timestamp: event.lastTimestamp || event.firstTimestamp,
          count: event.count
        })),
        logs: podLogs,
        health: healthAnalysis,
        troubleshooting: generateTroubleshootingSteps(healthAnalysis, resourceType)
      },
      metadata: {
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        duration: duration,
        namespace: namespace,
        resourceType: resourceType,
        podCount: pods.length,
        eventCount: events.length
      }
    };

  } catch (error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    console.error(`❌ Status check failed: ${error.message}`);

    return {
      success: false,
      message: `Failed to get status for ${resourceName}: ${error.message}`,
      error: error.message,
      data: {
        resource: {
          name: resourceName,
          type: resourceType,
          namespace: namespace
        },
        troubleshooting: [
          'Verify the resource exists',
          'Check if you have kubectl access to the cluster',
          'Ensure the namespace is correct',
          `Try: kubectl get ${resourceType} -n ${namespace}`
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

function analyzeResourceHealth(resource: any, pods: any[], events: any[]): any {
  const health = {
    overall: 'unknown',
    issues: [],
    recommendations: []
  };

  // Analyze deployment health
  if (resource.kind === 'Deployment') {
    const status = resource.status || {};
    const desired = status.replicas || 0;
    const ready = status.readyReplicas || 0;
    const available = status.availableReplicas || 0;

    if (ready === desired && available === desired) {
      health.overall = 'healthy';
    } else if (ready > 0) {
      health.overall = 'degraded';
      health.issues.push(`Only ${ready}/${desired} replicas are ready`);
    } else {
      health.overall = 'unhealthy';
      health.issues.push('No replicas are ready');
    }

    // Check for rolling update issues
    const updatedReplicas = status.updatedReplicas || 0;
    if (updatedReplicas < desired) {
      health.issues.push('Rolling update in progress or stuck');
      health.recommendations.push('Check deployment rollout status');
    }
  }

  // Analyze pod health
  const unhealthyPods = pods.filter(pod => 
    pod.status.phase !== 'Running' || 
    !pod.status.conditions?.find(c => c.type === 'Ready' && c.status === 'True')
  );

  if (unhealthyPods.length > 0) {
    health.issues.push(`${unhealthyPods.length} pods are not healthy`);
    health.recommendations.push('Check pod logs and events');
  }

  // Analyze recent error events
  const errorEvents = events.filter(event => 
    event.type === 'Warning' && 
    new Date(event.lastTimestamp) > new Date(Date.now() - 30 * 60 * 1000) // Last 30 minutes
  );

  if (errorEvents.length > 0) {
    health.issues.push(`${errorEvents.length} warning events in last 30 minutes`);
    health.recommendations.push('Review recent warning events');
  }

  return health;
}

function generateTroubleshootingSteps(health: any, resourceType: string): string[] {
  const steps = [];

  if (health.overall === 'unhealthy' || health.overall === 'degraded') {
    steps.push(`kubectl describe ${resourceType} <resource-name> -n <namespace>`);
    steps.push('kubectl get pods -n <namespace> -l <selector>');
    steps.push('kubectl logs <pod-name> -n <namespace>');
    steps.push('kubectl get events -n <namespace> --sort-by=.lastTimestamp');
  }

  if (health.issues.some(issue => issue.includes('replicas'))) {
    steps.push('kubectl rollout status deployment/<resource-name> -n <namespace>');
    steps.push('kubectl rollout history deployment/<resource-name> -n <namespace>');
  }

  if (health.issues.some(issue => issue.includes('pods'))) {
    steps.push('kubectl describe pod <pod-name> -n <namespace>');
    steps.push('kubectl logs <pod-name> -n <namespace> --previous');
  }

  return steps;
}