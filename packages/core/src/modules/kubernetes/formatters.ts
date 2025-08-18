/**
 * Response Formatters for Different Actions
 * Creates rich markdown content from module responses
 */

export interface FormatterResult {
  detailedResponse: string;
  enhancedData?: any;
}

/**
 * Format Kubernetes deployment status into readable markdown
 */
export function formatKubernetesStatus(data: any): FormatterResult {
  const { deployment, pods, replicas } = data;
  
  const markdown = `## 🚀 Deployment Status

**Service:** ${deployment?.metadata?.name || 'Unknown'}  
**Namespace:** ${deployment?.metadata?.namespace || 'default'}  
**Replicas:** ${replicas?.ready || 0}/${replicas?.desired || 0} ready (${replicas?.available || 0} available)

### 📊 Pod Status
${pods?.length > 0 ? 
  pods.map((pod: any) => {
    const name = pod.metadata?.name || 'unknown';
    const phase = pod.status?.phase || 'Unknown';
    const emoji = phase === 'Running' ? '✅' : phase === 'Pending' ? '⏳' : '❌';
    return `- **${name}**: ${phase} ${emoji}`;
  }).join('\n')
  : '- No pods found'
}

### ⚙️ Deployment Details
- **Strategy:** ${deployment?.spec?.strategy?.type || 'Unknown'}
- **Created:** ${deployment?.metadata?.creationTimestamp ? new Date(deployment.metadata.creationTimestamp).toLocaleString() : 'Unknown'}
- **Image:** ${deployment?.spec?.template?.spec?.containers?.[0]?.image || 'Unknown'}

### 🔍 Health Conditions
${deployment?.status?.conditions?.length > 0 ? 
  deployment.status.conditions.map((condition: any) => {
    const emoji = condition.status === 'True' ? '✅' : '❌';
    return `- **${condition.type}**: ${condition.status} ${emoji}`;
  }).join('\n')
  : '- No conditions available'
}`;

  return {
    detailedResponse: markdown,
    enhancedData: {
      summary: {
        totalPods: pods?.length || 0,
        runningPods: pods?.filter((p: any) => p.status?.phase === 'Running').length || 0,
        healthy: replicas?.ready === replicas?.desired
      }
    }
  };
}

/**
 * Format Kubernetes logs into readable markdown
 */
export function formatKubernetesLogs(data: any, resourceName: string): FormatterResult {
  const { logs, podName } = data;
  
  const markdown = `## 📋 Service Logs

**Service:** ${resourceName}  
**Pod:** ${podName || 'Unknown'}  
**Retrieved:** ${new Date().toLocaleString()}

### 🔍 Recent Logs
\`\`\`
${logs || 'No logs available'}
\`\`\`

${logs ? `**Total lines:** ${logs.split('\n').length}` : ''}`;

  return {
    detailedResponse: markdown,
    enhancedData: {
      logCount: logs?.split('\n').length || 0,
      hasErrors: logs?.toLowerCase().includes('error') || false
    }
  };
}

/**
 * Format deployment result into readable markdown
 */
export function formatDeploymentResult(data: any, resourceName: string, namespace: string): FormatterResult {
  const { manifest, deployment } = data;
  
  const markdown = `## 🚀 Deployment Complete

**Service:** ${resourceName}  
**Namespace:** ${namespace}  
**Status:** Successfully deployed ✅

### 📦 Deployment Configuration
- **Image:** ${manifest?.spec?.template?.spec?.containers?.[0]?.image || 'Unknown'}
- **Replicas:** ${manifest?.spec?.replicas || 1}
- **Port:** ${manifest?.spec?.template?.spec?.containers?.[0]?.ports?.[0]?.containerPort || 'Unknown'}

### 🔍 Kubernetes Details
- **API Version:** ${manifest?.apiVersion || 'Unknown'}
- **Kind:** ${manifest?.kind || 'Unknown'}
- **Labels:** ${manifest?.metadata?.labels ? Object.entries(manifest.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ') : 'None'}

### ⚡ Next Steps
- Monitor deployment: \`kubectl get pods -n ${namespace}\`
- Check logs: \`kubectl logs -f deployment/${resourceName} -n ${namespace}\`
- Scale if needed: \`kubectl scale deployment ${resourceName} --replicas=N -n ${namespace}\``;

  return {
    detailedResponse: markdown,
    enhancedData: {
      deployed: true,
      resourceType: 'deployment',
      monitoringCommands: [
        `kubectl get pods -n ${namespace}`,
        `kubectl logs -f deployment/${resourceName} -n ${namespace}`
      ]
    }
  };
}

/**
 * Format scaling result into readable markdown
 */
export function formatScalingResult(data: any, resourceName: string, namespace: string, replicas: number): FormatterResult {
  const markdown = `## ⚖️ Scaling Complete

**Service:** ${resourceName}  
**Namespace:** ${namespace}  
**New Replica Count:** ${replicas} ✅

### 📊 Scaling Details
- **Previous replicas:** Unknown (check deployment history)
- **Target replicas:** ${replicas}
- **Status:** Scaling in progress

### 🔍 Monitoring
The deployment is now scaling to ${replicas} replicas. Monitor progress with:
\`\`\`bash
kubectl get deployment ${resourceName} -n ${namespace} -w
\`\`\`

### ⏱️ Expected Timeline
- **Small changes (1-2 replicas):** 30-60 seconds
- **Large changes (5+ replicas):** 2-5 minutes
- **Check status:** \`kubectl rollout status deployment/${resourceName} -n ${namespace}\``;

  return {
    detailedResponse: markdown,
    enhancedData: {
      scaled: true,
      targetReplicas: replicas,
      monitoringCommand: `kubectl get deployment ${resourceName} -n ${namespace} -w`
    }
  };
}

/**
 * Format resource list into readable markdown
 */
export function formatResourceList(data: any, namespace: string): FormatterResult {
  const { deployments } = data;
  
  const markdown = `## 📋 Resources in ${namespace}

**Namespace:** ${namespace}  
**Total Deployments:** ${deployments?.length || 0}

### 🚀 Deployments
${deployments?.length > 0 ? 
  deployments.map((dep: any) => {
    const statusEmoji = dep.status === 'Running' ? '✅' : dep.status === 'NotReady' ? '⏳' : '❌';
    return `- **${dep.name}**: ${dep.replicas} ${statusEmoji} ${dep.status}`;
  }).join('\n')
  : '- No deployments found'
}

### 📊 Summary
- **Total services:** ${deployments?.length || 0}
- **Running:** ${deployments?.filter((d: any) => d.status === 'Running').length || 0}
- **Issues:** ${deployments?.filter((d: any) => d.status !== 'Running').length || 0}`;

  return {
    detailedResponse: markdown,
    enhancedData: {
      totalDeployments: deployments?.length || 0,
      runningDeployments: deployments?.filter((d: any) => d.status === 'Running').length || 0,
      hasIssues: deployments?.some((d: any) => d.status !== 'Running') || false
    }
  };
}

/**
 * Format deletion result into readable markdown
 */
export function formatDeletionResult(data: any, resourceName: string, namespace: string): FormatterResult {
  const markdown = `## 🗑️ Resource Deleted

**Service:** ${resourceName}  
**Namespace:** ${namespace}  
**Status:** Successfully deleted ✅

### ⚠️ Deletion Details
- **Resource type:** Deployment
- **Deleted at:** ${new Date().toLocaleString()}
- **Cascade:** All related pods and replica sets will be terminated

### 🔍 Verification
Confirm deletion with:
\`\`\`bash
kubectl get deployment ${resourceName} -n ${namespace}
# Should return: Error from server (NotFound)
\`\`\`

### 📝 Recovery
If you need to restore this service:
1. Redeploy using the same configuration
2. Check backup manifests if available
3. Restore from version control`;

  return {
    detailedResponse: markdown,
    enhancedData: {
      deleted: true,
      deletedAt: new Date().toISOString(),
      verificationCommand: `kubectl get deployment ${resourceName} -n ${namespace}`
    }
  };
}

/**
 * Master formatter dispatcher
 */
export function formatKubernetesResponse(
  action: string, 
  data: any, 
  resourceName?: string, 
  namespace?: string,
  additionalParams?: any
): FormatterResult {
  try {
    switch (action) {
      case 'status':
        return formatKubernetesStatus(data);
      
      case 'logs':
        return formatKubernetesLogs(data, resourceName || 'unknown');
      
      case 'deploy':
        return formatDeploymentResult(data, resourceName || 'unknown', namespace || 'default');
      
      case 'scale':
        return formatScalingResult(data, resourceName || 'unknown', namespace || 'default', additionalParams?.replicas || 1);
      
      case 'list':
        return formatResourceList(data, namespace || 'default');
      
      case 'delete':
        return formatDeletionResult(data, resourceName || 'unknown', namespace || 'default');
      
      case 'rollback':
        return {
          detailedResponse: `## ↩️ Rollback Complete\n\n**Service:** ${resourceName}\n**Namespace:** ${namespace}\n**Status:** Rollback initiated ✅\n\nThe deployment is rolling back to the previous version. Monitor progress with:\n\`\`\`bash\nkubectl rollout status deployment/${resourceName} -n ${namespace}\n\`\`\``,
          enhancedData: { rolledBack: true }
        };
      
      case 'describe':
        return {
          detailedResponse: `## 🔍 Resource Description\n\n**Service:** ${resourceName}\n**Namespace:** ${namespace}\n\n### Raw Configuration\n\`\`\`yaml\n${JSON.stringify(data.description, null, 2)}\n\`\`\``,
          enhancedData: data
        };
      
      default:
        return {
          detailedResponse: `## ℹ️ Operation Complete\n\n**Action:** ${action}\n**Service:** ${resourceName || 'Unknown'}\n**Namespace:** ${namespace || 'default'}\n\n### Raw Data\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
          enhancedData: data
        };
    }
  } catch (error) {
    return {
      detailedResponse: `## ❌ Formatting Error\n\nCould not format response for action: ${action}\n\n### Raw Data\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
      enhancedData: { error: error instanceof Error ? error.message : 'Unknown error', rawData: data }
    };
  }
}