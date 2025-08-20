// Windmill TypeScript Script: kubectl-deploy.ts
// Description: Deploy applications to Kubernetes with comprehensive validation

export async function main(
  resourceName: string,
  containerImage: string,
  namespace: string = 'default',
  replicas: number = 1,
  port: number = 8080,
  environment: string = 'development'
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
  
  if (!containerImage) {
    throw new Error('Container image is required');
  }

  // Validate resource name format
  const nameRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  if (!nameRegex.test(resourceName)) {
    throw new Error('Resource name must contain only lowercase letters, numbers, and hyphens');
  }

  try {
    console.log(`🚀 Deploying ${resourceName} with image ${containerImage}...`);

    // Step 1: Check if namespace exists, create if needed
    console.log(`📁 Checking namespace ${namespace}...`);
    try {
      await execAsync(`kubectl get namespace ${namespace}`);
      console.log(`✅ Namespace ${namespace} exists`);
    } catch (error) {
      console.log(`📁 Creating namespace ${namespace}...`);
      await execAsync(`kubectl create namespace ${namespace}`);
      console.log(`✅ Namespace ${namespace} created`);
    }

    // Step 2: Generate deployment manifest
    const deploymentManifest = generateDeploymentManifest(
      resourceName, 
      containerImage, 
      namespace, 
      replicas, 
      port, 
      environment
    );

    // Step 3: Apply deployment
    console.log(`⚙️ Applying deployment manifest...`);
    const { stdout: applyOutput } = await execAsync(
      `echo '${JSON.stringify(deploymentManifest)}' | kubectl apply -f -`
    );
    console.log(applyOutput);

    // Step 4: Create service if needed
    console.log(`🌐 Creating service...`);
    const serviceManifest = generateServiceManifest(resourceName, namespace, port);
    const { stdout: serviceOutput } = await execAsync(
      `echo '${JSON.stringify(serviceManifest)}' | kubectl apply -f -`
    );
    console.log(serviceOutput);

    // Step 5: Wait for rollout to complete
    console.log(`⏳ Waiting for deployment to be ready...`);
    await execAsync(`kubectl rollout status deployment/${resourceName} -n ${namespace} --timeout=300s`);

    // Step 6: Get final status
    const { stdout: statusOutput } = await execAsync(
      `kubectl get deployment ${resourceName} -n ${namespace} -o json`
    );
    const deployment = JSON.parse(statusOutput);
    
    const { stdout: podOutput } = await execAsync(
      `kubectl get pods -n ${namespace} -l app=${resourceName} -o json`
    );
    const pods = JSON.parse(podOutput);

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    return {
      success: true,
      message: `Successfully deployed ${resourceName} to ${namespace}`,
      data: {
        deployment: {
          name: resourceName,
          image: containerImage,
          namespace: namespace,
          replicas: {
            desired: replicas,
            ready: deployment.status.readyReplicas || 0,
            available: deployment.status.availableReplicas || 0
          },
          status: deployment.status.conditions?.find(c => c.type === 'Progressing')?.status === 'True' ? 'Ready' : 'Pending'
        },
        service: {
          name: resourceName,
          namespace: namespace,
          port: port,
          selector: `app=${resourceName}`
        },
        pods: (pods.items || []).map(pod => ({
          name: pod.metadata.name,
          status: pod.status.phase,
          ready: pod.status.conditions?.find(c => c.type === 'Ready')?.status === 'True',
          node: pod.spec.nodeName,
          created: pod.metadata.creationTimestamp
        })),
        access: {
          internal: `http://${resourceName}.${namespace}.svc.cluster.local:${port}`,
          portForward: `kubectl port-forward -n ${namespace} service/${resourceName} 8080:${port}`
        },
        nextSteps: [
          `Check status: kubectl get deployment ${resourceName} -n ${namespace}`,
          `View logs: kubectl logs -l app=${resourceName} -n ${namespace}`,
          `Port-forward: kubectl port-forward -n ${namespace} service/${resourceName} 8080:${port}`,
          `Scale: kubectl scale deployment ${resourceName} --replicas=3 -n ${namespace}`
        ]
      },
      metadata: {
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        duration: duration,
        namespace: namespace,
        environment: environment
      }
    };

  } catch (error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    console.error(`❌ Deployment failed: ${error.message}`);

    return {
      success: false,
      message: `Failed to deploy ${resourceName}: ${error.message}`,
      error: error.message,
      data: {
        deployment: {
          name: resourceName,
          image: containerImage,
          namespace: namespace
        },
        troubleshooting: [
          'Check if the container image exists and is accessible',
          'Verify you have permissions to create resources in the namespace',
          'Check cluster connectivity and kubectl configuration',
          `Try: kubectl describe deployment ${resourceName} -n ${namespace}`,
          'Review deployment events for more details'
        ]
      },
      metadata: {
        startedAt: startTime.toISOString(),
        completedAt: endTime.toISOString(),
        duration: duration,
        namespace: namespace,
        environment: environment
      }
    };
  }
}

function generateDeploymentManifest(
  name: string, 
  image: string, 
  namespace: string, 
  replicas: number, 
  port: number,
  environment: string
) {
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: name,
      namespace: namespace,
      labels: {
        app: name,
        environment: environment,
        'managed-by': 'ai-idp'
      }
    },
    spec: {
      replicas: replicas,
      selector: {
        matchLabels: {
          app: name
        }
      },
      template: {
        metadata: {
          labels: {
            app: name,
            environment: environment
          }
        },
        spec: {
          containers: [{
            name: name,
            image: image,
            ports: [{
              containerPort: port,
              name: 'http'
            }],
            env: [{
              name: 'ENVIRONMENT',
              value: environment
            }],
            resources: {
              requests: {
                memory: '64Mi',
                cpu: '50m'
              },
              limits: {
                memory: '256Mi',
                cpu: '200m'
              }
            },
            livenessProbe: {
              httpGet: {
                path: '/health',
                port: 'http'
              },
              initialDelaySeconds: 30,
              periodSeconds: 10,
              failureThreshold: 3
            },
            readinessProbe: {
              httpGet: {
                path: '/ready',
                port: 'http'
              },
              initialDelaySeconds: 5,
              periodSeconds: 5,
              failureThreshold: 3
            }
          }]
        }
      }
    }
  };
}

function generateServiceManifest(name: string, namespace: string, port: number) {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: name,
      namespace: namespace,
      labels: {
        app: name,
        'managed-by': 'ai-idp'
      }
    },
    spec: {
      selector: {
        app: name
      },
      ports: [{
        port: port,
        targetPort: 'http',
        protocol: 'TCP',
        name: 'http'
      }],
      type: 'ClusterIP'
    }
  };
}