import type { ActionRecord, ActionStatus } from '@/lib/types';

export interface IntelligentPrompt {
  id: string;
  actionId: string;
  type: 'follow-up' | 'investigation' | 'continuation' | 'escalation';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  message: string;
  suggestedActions: string[];
  triggeredAt: Date;
  context: {
    actionDuration: number;
    expectedDuration?: number;
    relatedActions: string[];
    errorPattern?: string;
  };
}

export interface ObservabilityTrigger {
  id: string;
  actionId: string;
  type: 'timeout' | 'error_pattern' | 'performance_degradation' | 'resource_threshold';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  recommendedAction: string;
  triggeredAt: Date;
  metadata: Record<string, any>;
}

export class IntelligentPromptsService {
  private static instance: IntelligentPromptsService;
  private prompts: Map<string, IntelligentPrompt> = new Map();
  private triggers: Map<string, ObservabilityTrigger> = new Map();
  private callbacks: Set<(prompt: IntelligentPrompt) => void> = new Set();
  private triggerCallbacks: Set<(trigger: ObservabilityTrigger) => void> = new Set();

  static getInstance(): IntelligentPromptsService {
    if (!IntelligentPromptsService.instance) {
      IntelligentPromptsService.instance = new IntelligentPromptsService();
    }
    return IntelligentPromptsService.instance;
  }

  /**
   * Analyze an action and generate intelligent prompts based on its state and duration
   */
  analyzeAction(action: ActionRecord): IntelligentPrompt[] {
    const prompts: IntelligentPrompt[] = [];
    const currentTime = new Date();
    const startTime = new Date(action.startTime);
    const duration = currentTime.getTime() - startTime.getTime();
    const estimatedDuration = action.executionMetadata?.estimatedDuration || 60000; // Default 1 minute

    // Check for timeout scenarios
    if (action.status === 'running' && duration > estimatedDuration * 2) {
      prompts.push(this.createTimeoutPrompt(action, duration, estimatedDuration));
    }

    // Check for stuck pending actions
    if (action.status === 'pending' && duration > 30000) { // 30 seconds
      prompts.push(this.createStuckPendingPrompt(action, duration));
    }

    // Check for failed actions that might need investigation
    if (action.status === 'failed') {
      prompts.push(this.createFailureInvestigationPrompt(action));
    }

    // Check for successful actions that might need follow-up
    if (action.status === 'completed') {
      prompts.push(...this.createFollowUpPrompts(action));
    }

    return prompts;
  }

  /**
   * Create a timeout prompt for long-running actions
   */
  private createTimeoutPrompt(action: ActionRecord, duration: number, estimatedDuration: number): IntelligentPrompt {
    const overrunMinutes = Math.round((duration - estimatedDuration) / 60000);
    
    return {
      id: `timeout-${action.actionId}`,
      actionId: action.actionId,
      type: 'continuation',
      priority: overrunMinutes > 10 ? 'high' : 'medium',
      title: 'Long-running Operation',
      message: `Your ${action.toolName} operation has been running for ${Math.round(duration / 60000)} minutes, which is ${overrunMinutes} minutes longer than expected. Would you like to continue waiting or investigate?`,
      suggestedActions: [
        'Continue waiting for completion',
        'Check logs and current status',
        'Cancel the operation',
        `Investigate why ${action.toolName} is taking longer than expected`
      ],
      triggeredAt: new Date(),
      context: {
        actionDuration: duration,
        expectedDuration: estimatedDuration,
        relatedActions: [],
      }
    };
  }

  /**
   * Create a prompt for actions stuck in pending state
   */
  private createStuckPendingPrompt(action: ActionRecord, duration: number): IntelligentPrompt {
    return {
      id: `stuck-${action.actionId}`,
      actionId: action.actionId,
      type: 'investigation',
      priority: 'medium',
      title: 'Operation Stuck in Pending',
      message: `Your ${action.toolName} operation has been pending for ${Math.round(duration / 1000)} seconds. This might indicate a resource constraint or dependency issue.`,
      suggestedActions: [
        'Check cluster resource availability',
        'Verify dependencies are running',
        'Cancel and retry the operation',
        'Review operation logs'
      ],
      triggeredAt: new Date(),
      context: {
        actionDuration: duration,
        relatedActions: [],
      }
    };
  }

  /**
   * Create investigation prompt for failed actions
   */
  private createFailureInvestigationPrompt(action: ActionRecord): IntelligentPrompt {
    const errorMessage = action.result?.error || 'Unknown error occurred';
    
    return {
      id: `investigation-${action.actionId}`,
      actionId: action.actionId,
      type: 'investigation',
      priority: 'high',
      title: 'Operation Failed - Investigation Needed',
      message: `Your ${action.toolName} operation failed: ${errorMessage}. Let me help you investigate and resolve this issue.`,
      suggestedActions: [
        'Show me detailed error logs',
        'Check resource status and availability',
        'Retry the operation with different parameters',
        'Rollback to previous state if applicable'
      ],
      triggeredAt: new Date(),
      context: {
        actionDuration: new Date().getTime() - new Date(action.startTime).getTime(),
        relatedActions: [],
        errorPattern: errorMessage,
      }
    };
  }

  /**
   * Create follow-up prompts for completed actions
   */
  private createFollowUpPrompts(action: ActionRecord): IntelligentPrompt[] {
    const prompts: IntelligentPrompt[] = [];

    // Deployment follow-ups
    if (action.toolName === 'deployApplication') {
      prompts.push({
        id: `followup-deploy-${action.actionId}`,
        actionId: action.actionId,
        type: 'follow-up',
        priority: 'low',
        title: 'Deployment Complete - Next Steps',
        message: `Your application deployment completed successfully! Would you like me to help you with the next steps?`,
        suggestedActions: [
          'Check application health and status',
          'Set up monitoring and alerts',
          'Configure auto-scaling rules',
          'Run smoke tests on the deployment'
        ],
        triggeredAt: new Date(),
        context: {
          actionDuration: new Date().getTime() - new Date(action.startTime).getTime(),
          relatedActions: [],
        }
      });
    }

    // Scaling follow-ups
    if (action.toolName === 'scaleResource') {
      prompts.push({
        id: `followup-scale-${action.actionId}`,
        actionId: action.actionId,
        type: 'follow-up',
        priority: 'low',
        title: 'Scaling Complete - Monitor Performance',
        message: `Resource scaling completed successfully! I recommend monitoring the performance impact.`,
        suggestedActions: [
          'Monitor CPU and memory usage',
          'Check application response times',
          'Verify all instances are healthy',
          'Review cost impact of scaling'
        ],
        triggeredAt: new Date(),
        context: {
          actionDuration: new Date().getTime() - new Date(action.startTime).getTime(),
          relatedActions: [],
        }
      });
    }

    return prompts;
  }

  /**
   * Generate observability triggers based on action patterns and metrics
   */
  generateObservabilityTriggers(actions: ActionRecord[]): ObservabilityTrigger[] {
    const triggers: ObservabilityTrigger[] = [];

    // Detect high failure rate patterns
    const recentActions = actions.filter(a => {
      const actionTime = new Date(a.startTime);
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      return actionTime > fifteenMinutesAgo;
    });

    const failureRate = recentActions.length > 0 
      ? recentActions.filter(a => a.status === 'failed').length / recentActions.length 
      : 0;

    if (failureRate > 0.3 && recentActions.length >= 3) { // 30% failure rate with at least 3 actions
      triggers.push({
        id: `high-failure-rate-${Date.now()}`,
        actionId: 'system-wide',
        type: 'error_pattern',
        severity: 'warning',
        title: 'High Failure Rate Detected',
        description: `${Math.round(failureRate * 100)}% of recent operations are failing. This might indicate a system-wide issue.`,
        recommendedAction: 'Investigate infrastructure health and check for common failure patterns',
        triggeredAt: new Date(),
        metadata: {
          failureRate,
          totalActions: recentActions.length,
          failedActions: recentActions.filter(a => a.status === 'failed').length,
          timeWindow: '15 minutes'
        }
      });
    }

    // Detect resource threshold issues
    const longRunningActions = actions.filter(a => {
      if (a.status !== 'running') return false;
      const duration = new Date().getTime() - new Date(a.startTime).getTime();
      const estimatedDuration = a.executionMetadata?.estimatedDuration || 60000;
      return duration > estimatedDuration * 3; // 3x longer than expected
    });

    if (longRunningActions.length >= 2) {
      triggers.push({
        id: `resource-threshold-${Date.now()}`,
        actionId: 'system-wide',
        type: 'resource_threshold',
        severity: 'warning',
        title: 'Multiple Long-Running Operations',
        description: `${longRunningActions.length} operations are running significantly longer than expected. This might indicate resource constraints.`,
        recommendedAction: 'Check cluster resources (CPU, memory, storage) and consider scaling',
        triggeredAt: new Date(),
        metadata: {
          longRunningCount: longRunningActions.length,
          actions: longRunningActions.map(a => ({ id: a.actionId, tool: a.toolName, duration: new Date().getTime() - new Date(a.startTime).getTime() }))
        }
      });
    }

    return triggers;
  }

  /**
   * Subscribe to intelligent prompts
   */
  onPrompt(callback: (prompt: IntelligentPrompt) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Subscribe to observability triggers
   */
  onTrigger(callback: (trigger: ObservabilityTrigger) => void): () => void {
    this.triggerCallbacks.add(callback);
    return () => this.triggerCallbacks.delete(callback);
  }

  /**
   * Emit a prompt to all subscribers
   */
  private emitPrompt(prompt: IntelligentPrompt): void {
    this.prompts.set(prompt.id, prompt);
    this.callbacks.forEach(callback => callback(prompt));
  }

  /**
   * Emit a trigger to all subscribers
   */
  private emitTrigger(trigger: ObservabilityTrigger): void {
    this.triggers.set(trigger.id, trigger);
    this.triggerCallbacks.forEach(callback => callback(trigger));
  }

  /**
   * Process action updates and generate prompts/triggers as needed
   */
  processActionUpdate(action: ActionRecord, allActions: ActionRecord[]): void {
    // Generate prompts for this specific action
    const prompts = this.analyzeAction(action);
    prompts.forEach(prompt => {
      if (!this.prompts.has(prompt.id)) {
        this.emitPrompt(prompt);
      }
    });

    // Generate system-wide observability triggers
    const triggers = this.generateObservabilityTriggers(allActions);
    triggers.forEach(trigger => {
      if (!this.triggers.has(trigger.id)) {
        this.emitTrigger(trigger);
      }
    });
  }

  /**
   * Get all active prompts
   */
  getAllPrompts(): IntelligentPrompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Get all active triggers
   */
  getAllTriggers(): ObservabilityTrigger[] {
    return Array.from(this.triggers.values());
  }

  /**
   * Dismiss a prompt
   */
  dismissPrompt(promptId: string): void {
    this.prompts.delete(promptId);
  }

  /**
   * Dismiss a trigger
   */
  dismissTrigger(triggerId: string): void {
    this.triggers.delete(triggerId);
  }
}