/**
 * Action Manager Service
 * 
 * Central service for managing distributed action tracking with DynamoDB persistence.
 * Provides CRUD operations, status updates, and action lifecycle management.
 */

import { 
  DynamoDBClient, 
  PutItemCommand, 
  GetItemCommand, 
  UpdateItemCommand, 
  DeleteItemCommand,
  QueryCommand,
  ScanCommand,
  BatchGetItemCommand 
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { 
  ActionRecord, 
  ActionStatus, 
  ActionType, 
  AgentName, 
  ActionIntent,
  CreateActionRequest,
  UpdateActionRequest,
  ActionQueryOptions,
  ActionResult
} from '../types/ActionTypes';
import { ActionRegistry } from '../registry/ActionRegistry';

/**
 * Configuration interface for ActionManager
 */
export interface ActionManagerConfig {
  dynamoDbClient: DynamoDBClient;
  tableName: string;
  ttlDays?: number;
}

/**
 * ActionManager - Central service for distributed action tracking
 */
export class ActionManager {
  private dynamoDb: DynamoDBClient;
  private tableName: string;
  private ttlDays: number;

  constructor(config: ActionManagerConfig) {
    this.dynamoDb = config.dynamoDbClient;
    this.tableName = config.tableName;
    this.ttlDays = config.ttlDays || 30; // Default 30 days TTL
  }

  /**
   * Create a new action record
   * @param request - Action creation request
   * @returns Created action record
   */
  async createAction(request: CreateActionRequest): Promise<ActionRecord> {
    const actionId = uuidv4();
    const now = new Date().toISOString();
    
    // Get action definition from registry
    const actionDefinition = ActionRegistry.getActionDefinition(
      request.agentName, 
      request.toolName
    );

    if (!actionDefinition) {
      throw new Error(
        `Action definition not found for agent: ${request.agentName}, tool: ${request.toolName}`
      );
    }

    // Calculate TTL (30 days from now)
    const ttl = Math.floor(Date.now() / 1000) + (this.ttlDays * 24 * 60 * 60);

    const actionRecord: ActionRecord = {
      actionId,
      userId: request.userId,
      sessionId: request.sessionId,
      conversationId: request.conversationId,
      actionType: actionDefinition.actionType,
      agentName: request.agentName,
      toolName: request.toolName,
      intent: request.intent,
      status: ActionStatus.PENDING,
      progress: 0,
      startTime: now,
      lastUpdate: now,
      executionMetadata: {
        toolParameters: request.toolParameters,
        environment: request.environment,
        priority: request.priority || 'normal',
        retryCount: 0,
        estimatedDuration: actionDefinition.estimatedDuration
      },
      completionCriteria: actionDefinition.completionCriteria,
      parentActionId: request.parentActionId,
      childActionIds: [],
      ttl
    };

    // Store in DynamoDB
    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(actionRecord),
      ConditionExpression: 'attribute_not_exists(actionId)' // Prevent overwrite
    });

    try {
      await this.dynamoDb.send(command);
      return actionRecord;
    } catch (error) {
      console.error('Failed to create action:', error);
      throw new Error(`Failed to create action: ${error}`);
    }
  }

  /**
   * Get action by ID
   * @param actionId - Unique action identifier
   * @returns Action record or null if not found
   */
  async getAction(actionId: string): Promise<ActionRecord | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ actionId })
    });

    try {
      const response = await this.dynamoDb.send(command);
      if (!response.Item) {
        return null;
      }
      return unmarshall(response.Item) as ActionRecord;
    } catch (error) {
      console.error(`Failed to get action ${actionId}:`, error);
      throw new Error(`Failed to get action: ${error}`);
    }
  }

  /**
   * Update action status and metadata
   * @param actionId - Action identifier
   * @param updates - Update parameters
   * @returns Updated action record
   */
  async updateAction(actionId: string, updates: UpdateActionRequest): Promise<ActionRecord> {
    const now = new Date().toISOString();
    
    // Build update expression dynamically
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Always update lastUpdate
    updateExpressions.push('#lastUpdate = :lastUpdate');
    expressionAttributeNames['#lastUpdate'] = 'lastUpdate';
    expressionAttributeValues[':lastUpdate'] = now;

    // Handle status update
    if (updates.status !== undefined) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = updates.status;

      // Set completedTime if status is completed or failed
      if (updates.status === ActionStatus.COMPLETED || updates.status === ActionStatus.FAILED) {
        updateExpressions.push('completedTime = :completedTime');
        expressionAttributeValues[':completedTime'] = now;
      }
    }

    // Handle progress update
    if (updates.progress !== undefined) {
      updateExpressions.push('progress = :progress');
      expressionAttributeValues[':progress'] = updates.progress;
    }

    // Handle result update
    if (updates.result !== undefined) {
      updateExpressions.push('#result = :result');
      expressionAttributeNames['#result'] = 'result';
      expressionAttributeValues[':result'] = updates.result;
    }

    // Handle execution metadata updates
    if (updates.executionMetadata) {
      for (const [key, value] of Object.entries(updates.executionMetadata)) {
        const attrName = `#exec_${key}`;
        const attrValue = `:exec_${key}`;
        updateExpressions.push(`executionMetadata.${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
      }
    }

    // Handle child action IDs
    if (updates.addChildActionId) {
      updateExpressions.push('childActionIds = list_append(if_not_exists(childActionIds, :empty_list), :childId)');
      expressionAttributeValues[':empty_list'] = [];
      expressionAttributeValues[':childId'] = [updates.addChildActionId];
    }

    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ actionId }),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(expressionAttributeValues),
      ReturnValues: 'ALL_NEW'
    });

    try {
      const response = await this.dynamoDb.send(command);
      if (!response.Attributes) {
        throw new Error('Action not found');
      }
      return unmarshall(response.Attributes) as ActionRecord;
    } catch (error) {
      console.error(`Failed to update action ${actionId}:`, error);
      throw new Error(`Failed to update action: ${error}`);
    }
  }

  /**
   * Get actions by session ID
   * @param sessionId - Session identifier
   * @param options - Query options
   * @returns Array of action records
   */
  async getActionsBySession(sessionId: string, options?: ActionQueryOptions): Promise<ActionRecord[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'SessionIndex',
      KeyConditionExpression: 'sessionId = :sessionId',
      ExpressionAttributeValues: marshall({
        ':sessionId': sessionId
      }),
      ScanIndexForward: false, // Latest first
      Limit: options?.limit
    });

    try {
      const response = await this.dynamoDb.send(command);
      if (!response.Items) {
        return [];
      }
      return response.Items.map(item => unmarshall(item) as ActionRecord);
    } catch (error) {
      console.error(`Failed to get actions for session ${sessionId}:`, error);
      throw new Error(`Failed to get actions by session: ${error}`);
    }
  }

  /**
   * Get actions by user ID
   * @param userId - User identifier
   * @param options - Query options
   * @returns Array of action records
   */
  async getActionsByUser(userId: string, options?: ActionQueryOptions): Promise<ActionRecord[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'UserIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: marshall({
        ':userId': userId
      }),
      ScanIndexForward: false, // Latest first
      Limit: options?.limit
    });

    try {
      const response = await this.dynamoDb.send(command);
      if (!response.Items) {
        return [];
      }
      return response.Items.map(item => unmarshall(item) as ActionRecord);
    } catch (error) {
      console.error(`Failed to get actions for user ${userId}:`, error);
      throw new Error(`Failed to get actions by user: ${error}`);
    }
  }

  /**
   * Get actions by status
   * @param status - Action status
   * @param options - Query options
   * @returns Array of action records
   */
  async getActionsByStatus(status: ActionStatus, options?: ActionQueryOptions): Promise<ActionRecord[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: marshall({
        ':status': status
      }),
      ScanIndexForward: false, // Latest first
      Limit: options?.limit
    });

    try {
      const response = await this.dynamoDb.send(command);
      if (!response.Items) {
        return [];
      }
      return response.Items.map(item => unmarshall(item) as ActionRecord);
    } catch (error) {
      console.error(`Failed to get actions with status ${status}:`, error);
      throw new Error(`Failed to get actions by status: ${error}`);
    }
  }

  /**
   * Get actions by agent
   * @param agentName - Agent name
   * @param options - Query options
   * @returns Array of action records
   */
  async getActionsByAgent(agentName: AgentName, options?: ActionQueryOptions): Promise<ActionRecord[]> {
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'AgentTimeIndex',
      KeyConditionExpression: 'agentName = :agentName',
      ExpressionAttributeValues: marshall({
        ':agentName': agentName
      }),
      ScanIndexForward: false, // Latest first
      Limit: options?.limit
    });

    try {
      const response = await this.dynamoDb.send(command);
      if (!response.Items) {
        return [];
      }
      return response.Items.map(item => unmarshall(item) as ActionRecord);
    } catch (error) {
      console.error(`Failed to get actions for agent ${agentName}:`, error);
      throw new Error(`Failed to get actions by agent: ${error}`);
    }
  }

  /**
   * Get multiple actions by IDs
   * @param actionIds - Array of action IDs
   * @returns Array of action records
   */
  async getBatchActions(actionIds: string[]): Promise<ActionRecord[]> {
    if (actionIds.length === 0) {
      return [];
    }

    // DynamoDB BatchGetItem has a limit of 100 items
    const batches = [];
    for (let i = 0; i < actionIds.length; i += 100) {
      batches.push(actionIds.slice(i, i + 100));
    }

    const allActions: ActionRecord[] = [];

    for (const batch of batches) {
      const command = new BatchGetItemCommand({
        RequestItems: {
          [this.tableName]: {
            Keys: batch.map(id => marshall({ actionId: id }))
          }
        }
      });

      try {
        const response = await this.dynamoDb.send(command);
        if (response.Responses && response.Responses[this.tableName]) {
          const batchActions = response.Responses[this.tableName].map(
            item => unmarshall(item) as ActionRecord
          );
          allActions.push(...batchActions);
        }
      } catch (error) {
        console.error('Failed to get batch actions:', error);
        throw new Error(`Failed to get batch actions: ${error}`);
      }
    }

    return allActions;
  }

  /**
   * Get pending actions that need processing
   * @returns Array of pending action records
   */
  async getPendingActions(): Promise<ActionRecord[]> {
    return this.getActionsByStatus(ActionStatus.PENDING);
  }

  /**
   * Get running actions that need monitoring
   * @returns Array of running action records
   */
  async getRunningActions(): Promise<ActionRecord[]> {
    return this.getActionsByStatus(ActionStatus.RUNNING);
  }

  /**
   * Mark action as failed with error details
   * @param actionId - Action identifier
   * @param error - Error information
   * @returns Updated action record
   */
  async markActionFailed(actionId: string, error: string): Promise<ActionRecord> {
    const result: ActionResult = {
      success: false,
      error,
      data: null,
      executionTime: 0,
      resourcesCreated: []
    };

    return this.updateAction(actionId, {
      status: ActionStatus.FAILED,
      progress: 100,
      result
    });
  }

  /**
   * Mark action as completed with result data
   * @param actionId - Action identifier
   * @param result - Success result
   * @returns Updated action record
   */
  async markActionCompleted(actionId: string, result: ActionResult): Promise<ActionRecord> {
    return this.updateAction(actionId, {
      status: ActionStatus.COMPLETED,
      progress: 100,
      result
    });
  }

  /**
   * Delete action record (soft delete by setting TTL to immediate expiry)
   * @param actionId - Action identifier
   */
  async deleteAction(actionId: string): Promise<void> {
    const command = new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ actionId }),
      UpdateExpression: 'SET #ttl = :ttl',
      ExpressionAttributeNames: {
        '#ttl': 'ttl'
      },
      ExpressionAttributeValues: marshall({
        ':ttl': Math.floor(Date.now() / 1000) + 60 // Expire in 1 minute
      })
    });

    try {
      await this.dynamoDb.send(command);
    } catch (error) {
      console.error(`Failed to delete action ${actionId}:`, error);
      throw new Error(`Failed to delete action: ${error}`);
    }
  }

  /**
   * Get action statistics for monitoring
   * @returns Action statistics
   */
  async getActionStatistics(): Promise<{
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    byAgent: Record<AgentName, number>;
  }> {
    const command = new ScanCommand({
      TableName: this.tableName,
      ProjectionExpression: '#status, agentName',
      ExpressionAttributeNames: {
        '#status': 'status'
      }
    });

    try {
      const response = await this.dynamoDb.send(command);
      const items = response.Items || [];

      const stats = {
        total: items.length,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        byAgent: {} as Record<AgentName, number>
      };

      for (const item of items) {
        const record = unmarshall(item) as Pick<ActionRecord, 'status' | 'agentName'>;
        
        // Count by status
        switch (record.status) {
          case ActionStatus.PENDING:
            stats.pending++;
            break;
          case ActionStatus.RUNNING:
            stats.running++;
            break;
          case ActionStatus.COMPLETED:
            stats.completed++;
            break;
          case ActionStatus.FAILED:
            stats.failed++;
            break;
        }

        // Count by agent
        if (!stats.byAgent[record.agentName]) {
          stats.byAgent[record.agentName] = 0;
        }
        stats.byAgent[record.agentName]++;
      }

      return stats;
    } catch (error) {
      console.error('Failed to get action statistics:', error);
      throw new Error(`Failed to get action statistics: ${error}`);
    }
  }
}