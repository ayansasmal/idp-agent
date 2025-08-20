import { dynamoDBService } from '../../shared/storage/DynamoDBService';
import { config } from '../../shared/config/ConfigManager';
import { Logger } from '../../shared/logger/Logger';
import { PlatformAction, RequestContext } from '../../types';

/**
 * ApprovalStorage - Handles persistent storage of approval requests using DynamoDB
 * Provides CRUD operations for approval requests with proper indexing
 */
export class ApprovalStorage {
  private logger = new Logger('ApprovalStorage');
  private tableName: string;

  constructor() {
    this.tableName = config.getAWSConfig().dynamodb.approvalsTableName;
  }

  /**
   * Initialize storage (ensures DynamoDB service is ready)
   */
  async initialize(): Promise<void> {
    await dynamoDBService.initialize();
    this.logger.info('Approval storage initialized', { tableName: this.tableName });
  }

  /**
   * Store a new approval request
   */
  async storeApproval(approval: ApprovalRequest): Promise<void> {
    try {
      // Convert the approval request to DynamoDB format
      const item = this.toDynamoDBItem(approval);
      
      await dynamoDBService.putItem(this.tableName, item);
      
      this.logger.info('Approval request stored', { 
        approvalId: approval.id, 
        action: approval.platformAction.action,
        environment: approval.platformAction.environment
      });
    } catch (error) {
      this.logger.error('Failed to store approval request', error, { approvalId: approval.id });
      throw new Error(`Failed to store approval: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve an approval request by ID
   */
  async getApproval(approvalId: string): Promise<ApprovalRequest | null> {
    try {
      const item = await dynamoDBService.getItem(this.tableName, { id: approvalId });
      
      if (!item) {
        this.logger.debug('Approval request not found', { approvalId });
        return null;
      }

      const approval = this.fromDynamoDBItem(item);
      this.logger.debug('Approval request retrieved', { approvalId });
      
      return approval;
    } catch (error) {
      this.logger.error('Failed to retrieve approval request', error, { approvalId });
      throw new Error(`Failed to retrieve approval: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an approval request
   */
  async updateApproval(approval: ApprovalRequest): Promise<void> {
    try {
      const item = this.toDynamoDBItem(approval);
      
      // Use the current timestamp for updates
      item.updatedAt = new Date().toISOString();
      
      await dynamoDBService.putItem(this.tableName, item);
      
      this.logger.info('Approval request updated', { 
        approvalId: approval.id,
        status: approval.status
      });
    } catch (error) {
      this.logger.error('Failed to update approval request', error, { approvalId: approval.id });
      throw new Error(`Failed to update approval: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete an approval request
   */
  async deleteApproval(approvalId: string): Promise<void> {
    try {
      await dynamoDBService.deleteItem(this.tableName, { id: approvalId });
      
      this.logger.info('Approval request deleted', { approvalId });
    } catch (error) {
      this.logger.error('Failed to delete approval request', error, { approvalId });
      throw new Error(`Failed to delete approval: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all pending approval requests
   */
  async getPendingApprovals(): Promise<ApprovalRequest[]> {
    try {
      const items = await dynamoDBService.queryItems(
        this.tableName,
        '#status = :status',
        { ':status': 'pending' },
        {
          indexName: 'StatusIndex',
          expressionAttributeNames: { '#status': 'status' },
          scanIndexForward: false // Most recent first
        }
      );

      const approvals = items.map(item => this.fromDynamoDBItem(item));
      
      this.logger.debug('Retrieved pending approvals', { count: approvals.length });
      
      return approvals;
    } catch (error) {
      this.logger.error('Failed to retrieve pending approvals', error);
      throw new Error(`Failed to retrieve pending approvals: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get approval requests for a specific user
   */
  async getApprovalsByUser(userId: string): Promise<ApprovalRequest[]> {
    try {
      const items = await dynamoDBService.queryItems(
        this.tableName,
        'userId = :userId',
        { ':userId': userId },
        {
          indexName: 'UserIndex',
          scanIndexForward: false // Most recent first
        }
      );

      const approvals = items.map(item => this.fromDynamoDBItem(item));
      
      this.logger.debug('Retrieved user approvals', { userId, count: approvals.length });
      
      return approvals;
    } catch (error) {
      this.logger.error('Failed to retrieve user approvals', error, { userId });
      throw new Error(`Failed to retrieve user approvals: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all approval requests (with optional filters)
   */
  async getAllApprovals(options: {
    status?: 'pending' | 'approved' | 'rejected' | 'expired';
    limit?: number;
  } = {}): Promise<ApprovalRequest[]> {
    try {
      let items: any[];

      if (options.status) {
        // Use status index for efficient filtering
        items = await dynamoDBService.queryItems(
          this.tableName,
          '#status = :status',
          { ':status': options.status },
          {
            indexName: 'StatusIndex',
            expressionAttributeNames: { '#status': 'status' },
            limit: options.limit,
            scanIndexForward: false
          }
        );
      } else {
        // Scan all items (use with caution in production)
        items = await dynamoDBService.scanItems(
          this.tableName,
          {
            limit: options.limit
          }
        );
      }

      const approvals = items.map(item => this.fromDynamoDBItem(item));
      
      this.logger.debug('Retrieved all approvals', { 
        status: options.status,
        count: approvals.length 
      });
      
      return approvals;
    } catch (error) {
      this.logger.error('Failed to retrieve all approvals', error, { options });
      throw new Error(`Failed to retrieve approvals: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check expired approvals and update their status
   */
  async processExpiredApprovals(): Promise<string[]> {
    try {
      const pendingApprovals = await this.getPendingApprovals();
      const now = new Date();
      const expiredIds: string[] = [];

      for (const approval of pendingApprovals) {
        if (new Date(approval.expiresAt) <= now) {
          approval.status = 'expired';
          approval.expiredAt = now.toISOString();
          
          await this.updateApproval(approval);
          expiredIds.push(approval.id);
        }
      }

      if (expiredIds.length > 0) {
        this.logger.info('Processed expired approvals', { 
          expiredCount: expiredIds.length,
          expiredIds 
        });
      }

      return expiredIds;
    } catch (error) {
      this.logger.error('Failed to process expired approvals', error);
      throw new Error(`Failed to process expired approvals: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get storage health status
   */
  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    try {
      // Test basic connectivity
      await dynamoDBService.getItem(this.tableName, { id: 'health-check' });
      
      return {
        status: 'healthy',
        message: 'Approval storage operational'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Approval storage error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Convert ApprovalRequest to DynamoDB item format
   */
  private toDynamoDBItem(approval: ApprovalRequest): any {
    return {
      id: approval.id,
      status: approval.status,
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
      approvedAt: approval.approvedAt,
      rejectedAt: approval.rejectedAt,
      expiredAt: approval.expiredAt,
      userId: approval.context.userId,
      sessionId: approval.context.sessionId,
      
      // Platform Action (nested object)
      platformAction: {
        action: approval.platformAction.action,
        resourceType: approval.platformAction.resourceType,
        resourceName: approval.platformAction.resourceName,
        environment: approval.platformAction.environment,
        parameters: approval.platformAction.parameters || {},
        explanation: approval.platformAction.explanation,
        rollbackPlan: approval.platformAction.rollbackPlan,
        riskLevel: approval.platformAction.riskLevel,
        estimatedImpact: approval.platformAction.estimatedImpact
      },
      
      // Request Context (flattened for indexing)
      contextEnvironment: approval.context.environment,
      contextPermissions: approval.context.permissions,
      
      // Approval Details
      riskLevel: approval.riskLevel,
      justification: approval.justification,
      urgency: approval.urgency,
      confidence: approval.confidence || 0.85,
      
      // Requirements
      requirements: {
        requiredCount: approval.requirements.requiredCount,
        approvers: approval.requirements.approvers,
        timeoutMinutes: approval.requirements.timeoutMinutes
      },
      
      // Records
      approvals: approval.approvals || [],
      rejections: approval.rejections || [],
      
      // Metadata
      metadata: approval.metadata,
      
      // Timestamps for tracking
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Convert DynamoDB item to ApprovalRequest format
   */
  private fromDynamoDBItem(item: any): ApprovalRequest {
    return {
      id: item.id,
      platformAction: {
        action: item.platformAction.action,
        resourceType: item.platformAction.resourceType,
        resourceName: item.platformAction.resourceName,
        environment: item.platformAction.environment,
        parameters: item.platformAction.parameters || {},
        explanation: item.platformAction.explanation,
        rollbackPlan: item.platformAction.rollbackPlan,
        riskLevel: item.platformAction.riskLevel,
        estimatedImpact: item.platformAction.estimatedImpact
      },
      context: {
        userId: item.userId,
        sessionId: item.sessionId,
        originalRequest: item.originalRequest || '',
        environment: item.contextEnvironment,
        permissions: item.contextPermissions || [],
        auditTrail: []
      },
      riskLevel: item.riskLevel,
      justification: item.justification,
      urgency: item.urgency,
      confidence: item.confidence || 0.85,
      requirements: {
        requiredCount: item.requirements.requiredCount,
        approvers: item.requirements.approvers,
        timeoutMinutes: item.requirements.timeoutMinutes
      },
      status: item.status,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt,
      approvedAt: item.approvedAt,
      rejectedAt: item.rejectedAt,
      expiredAt: item.expiredAt,
      approvals: item.approvals || [],
      rejections: item.rejections || [],
      metadata: item.metadata
    };
  }

  /**
   * Shutdown storage connection
   */
  async shutdown(): Promise<void> {
    this.logger.info('Approval storage shutting down');
    // DynamoDB service handles its own cleanup
  }
}

// Export types for approval system
export interface ApprovalRequest {
  id: string;
  platformAction: PlatformAction;
  context: RequestContext;
  riskLevel: string;
  justification: string;
  urgency: string;
  confidence: number;
  requirements: ApprovalRequirements;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  expiresAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  expiredAt?: string;
  approvals: ApprovalRecord[];
  rejections: ApprovalRecord[];
  metadata: {
    userAgent: string;
    ipAddress: string;
    sessionId: string;
  };
}

export interface ApprovalRequirements {
  requiredCount: number;
  approvers: string[];
  timeoutMinutes: number;
}

export interface ApprovalRecord {
  approverId: string;
  timestamp: string;
  comments?: string;
  type: 'approval' | 'rejection';
}