/**
 * Custom hook for polling deployment status after timeout
 * Provides intelligent follow-up options and automatic status updates
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface DeploymentStatus {
  resourceName: string;
  namespace: string;
  operationId: string;
  isReady: boolean;
  status: 'pending' | 'ready' | 'failed' | 'investigating';
  replicas: {
    desired: number;
    ready: number;
    current: number;
  };
  lastChecked: Date;
  pollCount: number;
}

export interface FollowUpAction {
  id: string;
  label: string;
  description: string;
  action: 'continue' | 'investigate' | 'manual-check';
  icon: string;
}

export interface UseDeploymentPollingProps {
  resourceName: string;
  namespace: string;
  operationId: string;
  sessionId: string;
  enabled: boolean;
  onStatusUpdate: (status: DeploymentStatus) => void;
  onFollowUpNeeded: (actions: FollowUpAction[]) => void;
  onDeploymentReady: (status: DeploymentStatus) => void;
}

export function useDeploymentPolling({
  resourceName,
  namespace,
  operationId,
  sessionId,
  enabled,
  onStatusUpdate,
  onFollowUpNeeded,
  onDeploymentReady
}: UseDeploymentPollingProps) {
  const [status, setStatus] = useState<DeploymentStatus>({
    resourceName,
    namespace,
    operationId,
    isReady: false,
    status: 'pending',
    replicas: { desired: 1, ready: 0, current: 0 },
    lastChecked: new Date(),
    pollCount: 0
  });

  const [isPolling, setIsPolling] = useState(false);
  const [shouldShowFollowUp, setShouldShowFollowUp] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check deployment status via API
  const checkStatus = useCallback(async (): Promise<DeploymentStatus | null> => {
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        },
        body: JSON.stringify({
          messages: [{ 
            content: `Check status of ${resourceName} deployment in ${namespace} namespace`,
            role: 'user'
          }],
          context: {
            userId: 'web-user',
            environment: namespace,
            permissions: ['read'],
            operationId: operationId,
            statusCheck: true // Flag to indicate this is an automated status check
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      const result = await response.json();
      
      // Parse deployment status from response
      if (result.rawData?.deployment) {
        const deployment = result.rawData.deployment;
        const newStatus: DeploymentStatus = {
          resourceName,
          namespace,
          operationId,
          isReady: deployment.replicas.ready === deployment.replicas.desired && deployment.replicas.ready > 0,
          status: deployment.replicas.ready === deployment.replicas.desired ? 'ready' : 'pending',
          replicas: deployment.replicas,
          lastChecked: new Date(),
          pollCount: status.pollCount + 1
        };

        return newStatus;
      }

      return null;
    } catch (error) {
      console.error('Status check failed:', error);
      return null;
    }
  }, [resourceName, namespace, operationId, sessionId, status.pollCount]);

  // Start polling
  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setIsPolling(true);
    
    // Initial check after 30 seconds
    setTimeout(async () => {
      const newStatus = await checkStatus();
      if (newStatus) {
        setStatus(newStatus);
        onStatusUpdate(newStatus);

        if (newStatus.isReady) {
          onDeploymentReady(newStatus);
          setIsPolling(false);
          return;
        }
      }
    }, 30000);

    // Then check every minute
    intervalRef.current = setInterval(async () => {
      const newStatus = await checkStatus();
      if (newStatus) {
        setStatus(newStatus);
        onStatusUpdate(newStatus);

        if (newStatus.isReady) {
          onDeploymentReady(newStatus);
          stopPolling();
          return;
        }

        // Show follow-up options after 2 minutes of polling (3 total minutes including initial timeout)
        if (newStatus.pollCount >= 2 && !shouldShowFollowUp) {
          setShouldShowFollowUp(true);
          
          const followUpActions: FollowUpAction[] = [
            {
              id: 'continue-waiting',
              label: 'Continue waiting for status update',
              description: 'Keep checking deployment status automatically',
              action: 'continue',
              icon: '⏳'
            },
            {
              id: 'investigate-delay',
              label: "Let's see why it's taking more time",
              description: 'Use AI to analyze deployment logs and identify issues',
              action: 'investigate',
              icon: '🔍'
            },
            {
              id: 'manual-check',
              label: 'Show me current deployment details',
              description: 'Get detailed status information and troubleshooting steps',
              action: 'manual-check',
              icon: '📊'
            }
          ];

          onFollowUpNeeded(followUpActions);
        }

        // Stop polling after 10 minutes total (to prevent infinite polling)
        if (newStatus.pollCount >= 10) {
          stopPolling();
        }
      }
    }, 60000); // Poll every minute

  }, [checkStatus, onStatusUpdate, onDeploymentReady, onFollowUpNeeded, shouldShowFollowUp]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Handle follow-up actions
  const handleFollowUpAction = useCallback(async (actionId: string) => {
    setShouldShowFollowUp(false);

    switch (actionId) {
      case 'continue-waiting':
        // Continue polling without showing follow-up again
        break;
        
      case 'investigate-delay':
        // Trigger observability agent investigation
        await fetch('/api/agent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId
          },
          body: JSON.stringify({
            messages: [{ 
              content: `Investigate why ${resourceName} deployment in ${namespace} is taking longer than expected. Analyze logs and identify potential issues.`,
              role: 'user'
            }],
            context: {
              userId: 'web-user',
              environment: namespace,
              permissions: ['read'],
              operationId: operationId,
              investigation: true,
              triggerObservability: true
            }
          })
        });
        
        setStatus(prev => ({ ...prev, status: 'investigating' }));
        stopPolling(); // Stop polling during investigation
        break;
        
      case 'manual-check':
        // Get detailed status information
        await fetch('/api/agent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-id': sessionId
          },
          body: JSON.stringify({
            messages: [{ 
              content: `Show detailed status and troubleshooting information for ${resourceName} deployment in ${namespace}`,
              role: 'user'
            }],
            context: {
              userId: 'web-user',
              environment: namespace,
              permissions: ['read'],
              operationId: operationId,
              detailedStatus: true
            }
          })
        });
        break;
    }
  }, [resourceName, namespace, operationId, sessionId, stopPolling]);

  // Start/stop polling based on enabled prop
  useEffect(() => {
    if (enabled && !isPolling && !status.isReady) {
      startPolling();
    } else if (!enabled && isPolling) {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [enabled, isPolling, status.isReady, startPolling, stopPolling]);

  return {
    status,
    isPolling,
    shouldShowFollowUp,
    handleFollowUpAction,
    startPolling,
    stopPolling
  };
}