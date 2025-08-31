/**
 * Central registry of all actions across the AI-IDP platform
 * Maps user intents to trackable actions with completion criteria
 */

import { ActionDefinition, ActionType, AgentName } from '../types/ActionTypes';

/**
 * Infrastructure Agent Action Definitions
 */
const INFRASTRUCTURE_ACTIONS: Record<string, ActionDefinition> = {
  deploy: {
    actionType: ActionType.DEPLOY,
    tool: 'deployApplication',
    defaultTimeout: 600000, // 10 minutes
    completionCriteria: {
      type: 'resource_ready',
      validationCommand: 'kubectl get deployment {resourceName} -n {namespace} -o json',
      checkInterval: 30000 // Check every 30 seconds
    },
    rollback: {
      type: 'delete_resource',
      command: 'kubectl delete deployment {resourceName} -n {namespace}'
    },
    retryPolicy: {
      maxRetries: 2,
      retryDelay: 60000, // 1 minute
      backoffMultiplier: 2,
      retryableErrors: ['timeout', 'resource-busy', 'network-error']
    },
    estimatedDuration: 300000, // 5 minutes average
    resourceRequirements: {
      cpu: 'low',
      memory: 'low'
    }
  },

  scale: {
    actionType: ActionType.SCALE,
    tool: 'scaleResource',
    defaultTimeout: 300000, // 5 minutes
    completionCriteria: {
      type: 'resource_ready',
      validationCommand: 'kubectl get deployment {resourceName} -n {namespace} -o json',
      checkInterval: 15000 // Check every 15 seconds
    },
    rollback: {
      type: 'revert_config',
      toolName: 'scaleResource',
      parameters: { replicas: '{previousReplicas}' }
    },
    retryPolicy: {
      maxRetries: 3,
      retryDelay: 30000,
      backoffMultiplier: 1.5,
      retryableErrors: ['timeout', 'insufficient-resources']
    },
    estimatedDuration: 120000, // 2 minutes average
    resourceRequirements: {
      cpu: 'minimal',
      memory: 'minimal'
    }
  },

  'status-check': {
    actionType: ActionType.STATUS_CHECK,
    tool: 'getResourceStatus',
    defaultTimeout: 30000, // 30 seconds
    completionCriteria: {
      type: 'immediate' // No validation needed, immediate response
    },
    retryPolicy: {
      maxRetries: 1,
      retryDelay: 5000,
      backoffMultiplier: 1,
      retryableErrors: ['network-error']
    },
    estimatedDuration: 5000, // 5 seconds
    resourceRequirements: {
      cpu: 'minimal',
      memory: 'minimal'
    }
  },

  'get-logs': {
    actionType: ActionType.GET_LOGS,
    tool: 'getResourceLogs', 
    defaultTimeout: 60000, // 1 minute
    completionCriteria: {
      type: 'immediate'
    },
    retryPolicy: {
      maxRetries: 2,
      retryDelay: 10000,
      backoffMultiplier: 1,
      retryableErrors: ['network-error', 'resource-not-ready']
    },
    estimatedDuration: 10000, // 10 seconds
    resourceRequirements: {
      cpu: 'minimal',
      memory: 'low'
    }
  },

  'provision-db': {
    actionType: ActionType.PROVISION_DB,
    tool: 'provisionDatabase',
    defaultTimeout: 900000, // 15 minutes
    completionCriteria: {
      type: 'resource_ready',
      validationCommand: 'kubectl get postgresql {resourceName} -n {namespace} -o json',
      checkInterval: 45000 // Check every 45 seconds
    },
    rollback: {
      type: 'delete_resource',
      command: 'kubectl delete postgresql {resourceName} -n {namespace}'
    },
    retryPolicy: {
      maxRetries: 1,
      retryDelay: 120000, // 2 minutes
      backoffMultiplier: 1,
      retryableErrors: ['resource-busy']
    },
    estimatedDuration: 600000, // 10 minutes average
    resourceRequirements: {
      cpu: 'medium',
      memory: 'medium',
      storage: 'high'
    }
  }
};

/**
 * Observability Agent Action Definitions  
 */
const OBSERVABILITY_ACTIONS: Record<string, ActionDefinition> = {
  'analyze-logs': {
    actionType: ActionType.ANALYZE_LOGS,
    tool: 'analyzeLogs',
    defaultTimeout: 300000, // 5 minutes
    completionCriteria: {
      type: 'analysis_complete',
      validationCommand: 'check_analysis_status {analysisId}',
      checkInterval: 20000 // Check every 20 seconds
    },
    retryPolicy: {
      maxRetries: 2,
      retryDelay: 60000,
      backoffMultiplier: 2,
      retryableErrors: ['analysis-timeout', 'llm-unavailable']
    },
    estimatedDuration: 180000, // 3 minutes average
    resourceRequirements: {
      cpu: 'high', // SLM processing
      memory: 'high'
    }
  },

  'monitor-metrics': {
    actionType: ActionType.MONITOR_METRICS,
    tool: 'monitorMetrics',
    defaultTimeout: 120000, // 2 minutes
    completionCriteria: {
      type: 'resource_ready',
      validationCommand: 'check_monitoring_rule {ruleId}',
      checkInterval: 10000
    },
    retryPolicy: {
      maxRetries: 2,
      retryDelay: 30000,
      backoffMultiplier: 1.5,
      retryableErrors: ['metrics-unavailable', 'prometheus-down']
    },
    estimatedDuration: 60000, // 1 minute
    resourceRequirements: {
      cpu: 'low',
      memory: 'low'
    }
  },

  'investigate-incident': {
    actionType: ActionType.INVESTIGATE_INCIDENT,
    tool: 'investigateIncident',
    defaultTimeout: 600000, // 10 minutes
    completionCriteria: {
      type: 'analysis_complete',
      validationCommand: 'get_investigation_report {investigationId}',
      checkInterval: 30000
    },
    retryPolicy: {
      maxRetries: 1,
      retryDelay: 120000,
      backoffMultiplier: 1,
      retryableErrors: ['analysis-timeout']
    },
    estimatedDuration: 400000, // 6-7 minutes average  
    resourceRequirements: {
      cpu: 'high', // AI analysis
      memory: 'high'
    }
  },

  'health-check': {
    actionType: ActionType.HEALTH_CHECK,
    tool: 'performHealthCheck',
    defaultTimeout: 180000, // 3 minutes
    completionCriteria: {
      type: 'analysis_complete',
      validationCommand: 'get_health_status {resourceName}',
      checkInterval: 15000
    },
    retryPolicy: {
      maxRetries: 2,
      retryDelay: 45000,
      backoffMultiplier: 1.5,
      retryableErrors: ['health-check-timeout', 'resource-unreachable']
    },
    estimatedDuration: 90000, // 1.5 minutes
    resourceRequirements: {
      cpu: 'medium',
      memory: 'medium'
    }
  }
};

/**
 * Meta Agent Action Definitions
 */
const META_ACTIONS: Record<string, ActionDefinition> = {
  orchestrate: {
    actionType: ActionType.ORCHESTRATE,
    tool: 'processRequest',
    defaultTimeout: 1200000, // 20 minutes (for complex workflows)
    completionCriteria: {
      type: 'analysis_complete',
      validationCommand: 'check_child_actions_status {actionId}',
      checkInterval: 60000 // Check every minute
    },
    retryPolicy: {
      maxRetries: 1,
      retryDelay: 300000, // 5 minutes
      backoffMultiplier: 1,
      retryableErrors: ['child-action-failed']
    },
    estimatedDuration: 600000, // 10 minutes average
    resourceRequirements: {
      cpu: 'low', // Orchestration is lightweight
      memory: 'low'
    }
  },

  'request-approval': {
    actionType: ActionType.REQUEST_APPROVAL,
    tool: 'requestApproval',
    defaultTimeout: 3600000, // 1 hour
    completionCriteria: {
      type: 'analysis_complete',
      validationCommand: 'get_approval_status {approvalId}',
      checkInterval: 30000
    },
    retryPolicy: {
      maxRetries: 0, // No retries for approval requests
      retryDelay: 0,
      backoffMultiplier: 1,
      retryableErrors: []
    },
    estimatedDuration: 1800000, // 30 minutes average (human response time)
    resourceRequirements: {
      cpu: 'minimal',
      memory: 'minimal'
    }
  }
};

/**
 * Complete Action Registry - All platform actions
 */
export const ACTION_REGISTRY = {
  infrastructure: INFRASTRUCTURE_ACTIONS,
  observability: OBSERVABILITY_ACTIONS,
  meta: META_ACTIONS
} as const;

/**
 * Action Registry Helper Functions
 */
export class ActionRegistry {
  
  /**
   * Get action definition by agent and tool name
   */
  static getActionDefinition(agentName: AgentName, toolName: string): ActionDefinition | null {
    const agentActions = ACTION_REGISTRY[agentName];
    if (!agentActions) return null;
    
    // Find by tool name instead of action type
    for (const [actionType, definition] of Object.entries(agentActions)) {
      if (definition.tool === toolName) {
        return definition;
      }
    }
    
    return null;
  }

  /**
   * Get all actions for a specific agent
   */
  static getAgentActions(agentName: AgentName): Record<string, ActionDefinition> {
    return ACTION_REGISTRY[agentName] || {};
  }

  /**
   * Get all action types across all agents
   */
  static getAllActionTypes(): ActionType[] {
    const allTypes: ActionType[] = [];
    
    Object.values(ACTION_REGISTRY).forEach(agentActions => {
      Object.keys(agentActions).forEach(actionType => {
        if (!allTypes.includes(actionType as ActionType)) {
          allTypes.push(actionType as ActionType);
        }
      });
    });
    
    return allTypes;
  }

  /**
   * Find which agent handles a specific action type
   */
  static findAgentForAction(actionType: ActionType): AgentName | null {
    for (const [agentName, actions] of Object.entries(ACTION_REGISTRY)) {
      if (actions[actionType]) {
        return agentName as AgentName;
      }
    }
    return null;
  }

  /**
   * Get default timeout for an action
   */
  static getActionTimeout(agentName: AgentName, actionType: ActionType): number {
    const definition = this.getActionDefinition(agentName, actionType);
    return definition?.defaultTimeout || 300000; // 5 minutes default
  }

  /**
   * Get estimated duration for an action
   */
  static getEstimatedDuration(agentName: AgentName, actionType: ActionType): number {
    const definition = this.getActionDefinition(agentName, actionType);
    return definition?.estimatedDuration || 120000; // 2 minutes default
  }

  /**
   * Check if action should be retried for a specific error
   */
  static shouldRetryForError(agentName: AgentName, actionType: ActionType, error: string): boolean {
    const definition = this.getActionDefinition(agentName, actionType);
    if (!definition?.retryPolicy) return false;
    
    return definition.retryPolicy.retryableErrors.some(pattern => 
      error.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Get validation command template for an action
   */
  static getValidationCommand(agentName: AgentName, actionType: ActionType): string | null {
    const definition = this.getActionDefinition(agentName, actionType);
    return definition?.completionCriteria.validationCommand || null;
  }

  /**
   * Replace placeholders in validation command
   */
  static buildValidationCommand(
    template: string, 
    parameters: Record<string, any>
  ): string {
    let command = template;
    
    // Replace common placeholders
    Object.entries(parameters).forEach(([key, value]) => {
      command = command.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    });
    
    return command;
  }

  /**
   * Get action statistics for monitoring
   */
  static getRegistryStats(): {
    totalActions: number;
    actionsByAgent: Record<string, number>;
    averageTimeout: number;
    actionTypes: string[];
  } {
    let totalActions = 0;
    let totalTimeout = 0;
    const actionsByAgent: Record<string, number> = {};
    const actionTypes = new Set<string>();

    Object.entries(ACTION_REGISTRY).forEach(([agentName, actions]) => {
      const agentActionCount = Object.keys(actions).length;
      actionsByAgent[agentName] = agentActionCount;
      totalActions += agentActionCount;

      Object.entries(actions).forEach(([actionType, definition]) => {
        actionTypes.add(actionType);
        totalTimeout += definition.defaultTimeout;
      });
    });

    return {
      totalActions,
      actionsByAgent,
      averageTimeout: totalTimeout / totalActions,
      actionTypes: Array.from(actionTypes)
    };
  }
}

/**
 * Export types for external use
 */
export type ActionRegistryType = typeof ACTION_REGISTRY;
export type InfrastructureActionType = keyof typeof INFRASTRUCTURE_ACTIONS;
export type ObservabilityActionType = keyof typeof OBSERVABILITY_ACTIONS; 
export type MetaActionType = keyof typeof META_ACTIONS;