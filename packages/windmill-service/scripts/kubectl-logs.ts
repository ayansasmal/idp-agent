// Windmill TypeScript Script: kubectl-logs.ts
// Description: Retrieve and analyze logs from Kubernetes resources

export async function main(
  resourceName: string,
  namespace: string = 'default',
  lines: number = 100,
  follow: boolean = false,
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

  if (lines > 10000) {
    lines = 10000; // Cap to prevent excessive output
    console.warn('⚠️ Line count capped at 10,000 to prevent excessive output');
  }

  try {
    console.log(`📜 Retrieving logs for ${resourceType}/${resourceName}...`);

    // Step 1: Get pods associated with the resource
    let pods = [];
    let selector = '';
    
    if (resourceType.toLowerCase() === 'pod') {
      // Direct pod logs
      pods = [{ metadata: { name: resourceName } }];
    } else {
      // Get pods from deployment/service
      console.log(`🔍 Finding pods for ${resourceType}/${resourceName}...`);
      
      if (resourceType.toLowerCase() === 'deployment') {
        selector = `app=${resourceName}`;
      } else if (resourceType.toLowerCase() === 'service') {
        // Get service selector first
        const { stdout: svcInfo } = await execAsync(
          `kubectl get service ${resourceName} -n ${namespace} -o json`
        );
        const service = JSON.parse(svcInfo);
        const selectorObj = service.spec?.selector || {};
        selector = Object.entries(selectorObj)
          .map(([key, value]) => `${key}=${value}`)
          .join(',');
      } else {
        selector = `app=${resourceName}`;
      }

      const { stdout: podList } = await execAsync(
        `kubectl get pods -n ${namespace} -l ${selector} -o json`
      );
      const podData = JSON.parse(podList);
      pods = podData.items || [];
    }

    if (pods.length === 0) {
      throw new Error(`No pods found for ${resourceType}/${resourceName} with selector ${selector}`);
    }

    console.log(`📦 Found ${pods.length} pod(s)`);

    // Step 2: Collect logs from all pods
    const podLogs = [];
    
    for (const pod of pods) {
      const podName = pod.metadata.name;
      console.log(`📖 Getting logs from pod: ${podName}`);
      
      try {
        // Get current logs
        const logCommand = `kubectl logs ${podName} -n ${namespace} --tail=${lines}${follow ? ' -f' : ''}`;
        const { stdout: logOutput } = await execAsync(logCommand);
        
        // Get previous logs if container restarted
        let previousLogs = '';
        try {
          const { stdout: prevLogOutput } = await execAsync(
            `kubectl logs ${podName} -n ${namespace} --previous --tail=50`
          );
          previousLogs = prevLogOutput;
        } catch {
          // No previous logs available
        }

        // Analyze log content
        const logAnalysis = analyzeLogContent(logOutput);
        
        podLogs.push({
          podName: podName,
          current: {
            content: logOutput.trim(),
            lines: logOutput.split('\n').length,
            size: logOutput.length
          },
          previous: {
            content: previousLogs.trim(),
            available: previousLogs.length > 0
          },
          analysis: logAnalysis,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        podLogs.push({
          podName: podName,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Step 3: Aggregate log analysis
    const overallAnalysis = aggregateLogAnalysis(podLogs);

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    return {
      success: true,
      message: `Retrieved logs from ${pods.length} pod(s) for ${resourceName}`,
      data: {
        resource: {
          name: resourceName,
          type: resourceType,
          namespace: namespace,
          podCount: pods.length
        },
        logs: podLogs,
        summary: {
          totalLines: podLogs.reduce((sum, log) => sum + (log.current?.lines || 0), 0),
          totalSize: podLogs.reduce((sum, log) => sum + (log.current?.size || 0), 0),
          podsWithErrors: podLogs.filter(log => log.error).length,
          podsWithPreviousLogs: podLogs.filter(log => log.previous?.available).length
        },
        analysis: overallAnalysis,
        commands: {
          follow: `kubectl logs -l ${selector} -n ${namespace} -f --tail=${lines}`,
          allPods: pods.map(pod => `kubectl logs ${pod.metadata.name} -n ${namespace} --tail=${lines}`),
          previous: pods.map(pod => `kubectl logs ${pod.metadata.name} -n ${namespace} --previous`)
        }
      },
      metadata: {
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        duration: duration,
        namespace: namespace,
        linesRequested: lines,
        follow: follow
      }
    };

  } catch (error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    console.error(`❌ Log retrieval failed: ${error.message}`);

    return {
      success: false,
      message: `Failed to retrieve logs for ${resourceName}: ${error.message}`,
      error: error.message,
      data: {
        resource: {
          name: resourceName,
          type: resourceType,
          namespace: namespace
        },
        troubleshooting: [
          'Check if the resource exists and has running pods',
          'Verify you have permissions to read logs',
          'Ensure pods are in Running state',
          `Try: kubectl get pods -n ${namespace} -l app=${resourceName}`,
          `Try: kubectl describe pod <pod-name> -n ${namespace}`
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

function analyzeLogContent(logContent: string): any {
  const lines = logContent.split('\n').filter(line => line.trim());
  const analysis = {
    levels: { error: 0, warn: 0, info: 0, debug: 0 },
    keywords: { startup: false, shutdown: false, crash: false, oom: false },
    patterns: [],
    summary: ''
  };

  // Count log levels
  lines.forEach(line => {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('error') || lowerLine.includes('exception') || lowerLine.includes('failed')) {
      analysis.levels.error++;
    } else if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
      analysis.levels.warn++;
    } else if (lowerLine.includes('info')) {
      analysis.levels.info++;
    } else if (lowerLine.includes('debug')) {
      analysis.levels.debug++;
    }

    // Check for important keywords
    if (lowerLine.includes('starting') || lowerLine.includes('started')) {
      analysis.keywords.startup = true;
    }
    if (lowerLine.includes('stopping') || lowerLine.includes('shutdown')) {
      analysis.keywords.shutdown = true;
    }
    if (lowerLine.includes('crash') || lowerLine.includes('panic')) {
      analysis.keywords.crash = true;
    }
    if (lowerLine.includes('out of memory') || lowerLine.includes('oom')) {
      analysis.keywords.oom = true;
    }
  });

  // Generate summary
  const totalLines = lines.length;
  if (totalLines === 0) {
    analysis.summary = 'No logs available';
  } else {
    const errorRate = (analysis.levels.error / totalLines) * 100;
    const warnRate = (analysis.levels.warn / totalLines) * 100;
    
    if (errorRate > 10) {
      analysis.summary = `High error rate (${errorRate.toFixed(1)}%) - investigate issues`;
    } else if (warnRate > 20) {
      analysis.summary = `Many warnings (${warnRate.toFixed(1)}%) - review configuration`;
    } else if (analysis.keywords.crash || analysis.keywords.oom) {
      analysis.summary = 'Application stability issues detected';
    } else if (analysis.keywords.startup) {
      analysis.summary = 'Application appears to be starting normally';
    } else {
      analysis.summary = 'Normal operation detected';
    }
  }

  return analysis;
}

function aggregateLogAnalysis(podLogs: any[]): any {
  const aggregate = {
    healthStatus: 'unknown',
    commonIssues: [],
    recommendations: []
  };

  const errorPods = podLogs.filter(log => 
    log.analysis?.levels?.error > 0 || log.error
  ).length;

  const totalPods = podLogs.length;
  const errorRate = (errorPods / totalPods) * 100;

  // Determine health status
  if (errorRate === 0) {
    aggregate.healthStatus = 'healthy';
  } else if (errorRate < 50) {
    aggregate.healthStatus = 'degraded';
  } else {
    aggregate.healthStatus = 'unhealthy';
  }

  // Identify common issues
  let crashCount = 0;
  let oomCount = 0;
  let highErrorCount = 0;

  podLogs.forEach(log => {
    if (log.analysis) {
      if (log.analysis.keywords.crash) crashCount++;
      if (log.analysis.keywords.oom) oomCount++;
      if (log.analysis.levels.error > 10) highErrorCount++;
    }
  });

  if (crashCount > 0) {
    aggregate.commonIssues.push(`${crashCount} pod(s) showing crash indicators`);
    aggregate.recommendations.push('Investigate application crashes and resource limits');
  }
  if (oomCount > 0) {
    aggregate.commonIssues.push(`${oomCount} pod(s) showing OOM indicators`);
    aggregate.recommendations.push('Review and increase memory limits');
  }
  if (highErrorCount > 0) {
    aggregate.commonIssues.push(`${highErrorCount} pod(s) with high error rates`);
    aggregate.recommendations.push('Review application logic and error handling');
  }

  if (aggregate.commonIssues.length === 0) {
    aggregate.commonIssues.push('No significant issues detected in logs');
    aggregate.recommendations.push('Continue monitoring for any emerging patterns');
  }

  return aggregate;
}