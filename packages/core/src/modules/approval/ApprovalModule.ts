import { BaseModule } from '../base/SimpleBaseModule';
import { ModuleRequest, ModuleResponse, PlatformAction, RequestContext } from '../../types';
import { CorrelationLogger } from '../../shared/logger/Logger';
import { ApprovalStorage, ApprovalRequest, ApprovalRequirements, ApprovalRecord } from './ApprovalStorage';
import { z } from 'zod';

/**
 * Approval Module - Handles human-in-the-loop approval workflows
 * This module will become the standalone Workflow Agent in Phase 2
 */
export class ApprovalModule extends BaseModule {
  private logger: CorrelationLogger;
  private storage: ApprovalStorage;
  private approvalHandlers: Map<string, ApprovalHandler>;

  constructor() {
    super();
    this.logger = new CorrelationLogger('approval-module', '');
    this.storage = new ApprovalStorage();
    this.approvalHandlers = new Map();
  }

  async initialize(): Promise<void> {
    // Initialize persistent storage
    await this.storage.initialize();
    
    // Initialize approval handlers
    this.approvalHandlers.set('slack', new SlackApprovalHandler());
    this.approvalHandlers.set('email', new EmailApprovalHandler());
    this.approvalHandlers.set('console', new ConsoleApprovalHandler());

    // Initialize handlers
    for (const handler of this.approvalHandlers.values()) {
      await handler.initialize();
    }

    this.logger.info('Approval module initialized', {
      handlers: Array.from(this.approvalHandlers.keys()),
      storageInitialized: true
    });
  }

  getCapabilities(): string[] {
    return [
      'request-approval',
      'check-approval',
      'approve',
      'reject',
      'list-pending',
      'escalate',
      'timeout-check'
    ];
  }

  async process(request: ModuleRequest): Promise<ModuleResponse> {
    const startTime = Date.now();
    this.logger = CorrelationLogger.fromRequest(
      request.context.sessionId,
      request.context.userId,
      'ApprovalModule'
    );

    this.logger.info('Processing approval request', {
      action: request.action,
      parameters: request.parameters
    });

    try {
      const response = await this.handleApprovalAction(request);

      const duration = Date.now() - startTime;
      this.logger.info('Approval request completed', {
        action: request.action,
        success: response.success,
        duration
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Approval request failed', {
        action: request.action,
        error,
        duration
      });

      return this.createErrorResponse(
        request.requestId,
        `Approval operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          module: 'approval',
          action: request.action,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );
    }
  }

  private async handleApprovalAction(request: ModuleRequest): Promise<ModuleResponse> {
    const { action, parameters } = request;

    switch (action) {
      case 'request-approval':
        return this.requestApproval(request.requestId, parameters, request.context);
      case 'check-approval':
        return this.checkApproval(request.requestId, parameters.approvalId);
      case 'approve':
        return this.approveRequest(request.requestId, parameters.approvalId, parameters.approverId, parameters.comments);
      case 'reject':
        return this.rejectRequest(request.requestId, parameters.approvalId, parameters.approverId, parameters.reason);
      case 'list-pending':
        return this.listPendingApprovals(request.requestId, request.context);
      case 'escalate':
        return this.escalateApproval(request.requestId, parameters.approvalId, parameters.reason);
      case 'timeout-check':
        return this.checkTimeouts();
      default:
        throw new Error(`Unsupported approval action: ${action}`);
    }
  }

  async requestApproval(requestId: string, params: any, context: RequestContext): Promise<ModuleResponse> {
    const { platformAction, riskLevel, justification, urgency = 'normal', confidence = 0.85 } = params;

    // Generate unique approval ID
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Determine approval requirements based on risk and action
    const approvalRequirements = this.determineApprovalRequirements(platformAction, riskLevel, context);

    // Create approval request
    const approvalRequest: ApprovalRequest = {
      id: approvalId,
      platformAction,
      context,
      riskLevel,
      justification,
      urgency,
      confidence,
      requirements: approvalRequirements,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: this.calculateExpiration(urgency),
      approvals: [],
      rejections: [],
      metadata: {
        userAgent: 'AI-IDP',
        ipAddress: 'unknown',
        sessionId: context.sessionId
      }
    };

    // Store approval in persistent storage
    await this.storage.storeApproval(approvalRequest);

    // Send approval notifications
    const notifications = await this.sendApprovalNotifications(approvalRequest);

    this.logger.info('Approval request created', {
      approvalId,
      action: platformAction.action,
      resource: platformAction.resourceName,
      riskLevel,
      approvers: approvalRequirements.approvers
    });

    return this.createSuccessResponse(
      requestId,
      {
        approvalId,
        status: 'pending',
        requirements: approvalRequirements,
        expiresAt: approvalRequest.expiresAt,
        notifications
      },
      {
        module: 'approval',
        action: 'request-approval'
      },
      `Approval request created for ${platformAction.action} operation`
    );
  }

  async checkApproval(requestId: string, approvalId: string): Promise<ModuleResponse> {
    const approval = await this.storage.getApproval(approvalId);

    if (!approval) {
      return this.createErrorResponse(
        requestId,
        `Approval request ${approvalId} not found`,
        {
          module: 'approval',
          action: 'check-approval'
        }
      );
    }

    // Check if approval has expired
    if (new Date() > new Date(approval.expiresAt)) {
      approval.status = 'expired';
      approval.expiredAt = new Date().toISOString();
      await this.storage.updateApproval(approval);
      this.logger.info('Approval request expired', { approvalId });
    }

    // Check if approval requirements are met
    const isApproved = this.checkApprovalRequirements(approval);
    if (isApproved && approval.status === 'pending') {
      approval.status = 'approved';
      approval.approvedAt = new Date().toISOString();
      await this.storage.updateApproval(approval);
      this.logger.info('Approval requirements met', { approvalId });
    }

    return this.createSuccessResponse(
      requestId,
      {
        approvalId,
        status: approval.status,
        approvals: approval.approvals,
        rejections: approval.rejections,
        expiresAt: approval.expiresAt,
        approvedAt: approval.approvedAt,
        progress: this.calculateApprovalProgress(approval)
      },
      `Approval status: ${approval.status}`,
      {
        module: 'approval',
        action: 'check-approval'
      }
    );
  }

  async approveRequest(requestId: string, approvalId: string, approverId: string, comments?: string): Promise<ModuleResponse> {
    const approval = await this.storage.getApproval(approvalId);

    if (!approval) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Cannot approve request with status: ${approval.status}`);
    }

    // Check if approver is authorized
    if (!approval.requirements.approvers.includes(approverId)) {
      throw new Error(`${approverId} is not authorized to approve this request`);
    }

    // Check if already approved by this user
    if (approval.approvals.some(a => a.approverId === approverId)) {
      throw new Error(`${approverId} has already approved this request`);
    }

    // Add approval
    const approvalRecord: ApprovalRecord = {
      approverId,
      timestamp: new Date().toISOString(),
      comments,
      type: 'approval'
    };

    approval.approvals.push(approvalRecord);

    // Check if all requirements are met
    const isFullyApproved = this.checkApprovalRequirements(approval);
    if (isFullyApproved) {
      approval.status = 'approved';
      approval.approvedAt = new Date().toISOString();

      // Send approval completion notifications
      await this.sendApprovalCompletionNotification(approval);
    }

    // Update approval in storage
    await this.storage.updateApproval(approval);

    this.logger.info('Approval received', {
      approvalId,
      approverId,
      isFullyApproved,
      totalApprovals: approval.approvals.length
    });

    return this.createSuccessResponse(
      requestId,
      {
        approvalId,
        status: approval.status,
        approverId,
        totalApprovals: approval.approvals.length,
        requiredApprovals: approval.requirements.requiredCount,
        isFullyApproved
      },
      isFullyApproved
        ? 'Request fully approved and ready for execution'
        : `Approval received from ${approverId}`,
      {
        module: 'approval',
        action: 'approve'
      }
    );
  }

  async rejectRequest(approvalId: string, approverId: string, reason?: string): Promise<ModuleResponse> {
    const approval = await this.storage.getApproval(approvalId);

    if (!approval) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    if (approval.status !== 'pending') {
      throw new Error(`Cannot reject request with status: ${approval.status}`);
    }

    // Add rejection
    const rejectionRecord: ApprovalRecord = {
      approverId,
      timestamp: new Date().toISOString(),
      comments: reason,
      type: 'rejection'
    };

    approval.rejections.push(rejectionRecord);
    approval.status = 'rejected';
    approval.rejectedAt = new Date().toISOString();

    // Update approval in storage
    await this.storage.updateApproval(approval);

    // Send rejection notifications
    await this.sendRejectionNotification(approval, approverId, reason);

    this.logger.info('Approval request rejected', {
      approvalId,
      approverId,
      reason
    });

    return {
      success: true,
      message: `Request rejected by ${approverId}`,
      timestamp: new Date().toISOString(),
      data: {
        approvalId,
        status: 'rejected',
        rejectedBy: approverId,
        reason,
        rejectedAt: approval.rejectedAt
      },
      metadata: {
        module: 'approval',
        action: 'reject'
      }
    };
  }

  async listPendingApprovals(context: RequestContext): Promise<ModuleResponse> {
    const allPendingApprovals = await this.storage.getPendingApprovals();
    
    const pendingApprovals = allPendingApprovals.map(approval => ({
      id: approval.id,
      action: approval.platformAction.action,
      resource: approval.platformAction.resourceName,
      environment: approval.platformAction.environment,
      riskLevel: approval.riskLevel,
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
      requiredApprovals: approval.requirements.requiredCount,
      currentApprovals: approval.approvals.length,
      approvers: approval.requirements.approvers,
      justification: approval.justification
    }));

    return {
      success: true,
      message: `Found ${pendingApprovals.length} pending approvals`,
      timestamp: new Date().toISOString(),
      data: {
        pendingApprovals,
        total: pendingApprovals.length
      },
      metadata: {
        module: 'approval',
        action: 'list-pending'
      }
    };
  }

  async escalateApproval(approvalId: string, reason?: string): Promise<ModuleResponse> {
    const approval = await this.storage.getApproval(approvalId);

    if (!approval) {
      throw new Error(`Approval request ${approvalId} not found`);
    }

    // Add escalation approvers
    const escalationApprovers = this.getEscalationApprovers(approval);
    approval.requirements.approvers.push(...escalationApprovers);

    // Update approval in storage
    await this.storage.updateApproval(approval);

    // Send escalation notifications
    await this.sendEscalationNotifications(approval, escalationApprovers, reason);

    this.logger.info('Approval escalated', {
      approvalId,
      escalationApprovers,
      reason
    });

    return {
      success: true,
      message: `Approval escalated to ${escalationApprovers.join(', ')}`,
      timestamp: new Date().toISOString(),
      data: {
        approvalId,
        escalatedTo: escalationApprovers,
        reason,
        totalApprovers: approval.requirements.approvers.length
      },
      metadata: {
        module: 'approval',
        action: 'escalate'
      }
    };
  }

  async checkTimeouts(): Promise<ModuleResponse> {
    // Use storage's built-in expired approval processing
    const expiredIds = await this.storage.processExpiredApprovals();
    
    // Send timeout notifications for each expired approval
    for (const approvalId of expiredIds) {
      const approval = await this.storage.getApproval(approvalId);
      if (approval) {
        await this.sendTimeoutNotification(approval);
        this.logger.info('Approval request expired', { approvalId });
      }
    }

    return {
      success: true,
      message: `Processed ${expiredIds.length} expired approvals`,
      timestamp: new Date().toISOString(),
      data: {
        expiredCount: expiredIds.length,
        expiredIds
      },
      metadata: {
        module: 'approval',
        action: 'timeout-check'
      }
    };
  }

  // Helper methods
  private determineApprovalRequirements(action: PlatformAction, riskLevel: string, context: RequestContext): ApprovalRequirements {
    const requirements: ApprovalRequirements = {
      requiredCount: 1,
      approvers: [],
      timeoutMinutes: 60
    };

    // Determine approvers based on environment and risk
    if (action.environment === 'production') {
      requirements.approvers.push('production-admin', 'tech-lead');
      requirements.requiredCount = 2;
      requirements.timeoutMinutes = 30; // Shorter timeout for production
    } else if (action.environment === 'staging') {
      requirements.approvers.push('staging-admin', 'team-lead');
      requirements.requiredCount = 1;
    } else {
      requirements.approvers.push('dev-lead');
      requirements.requiredCount = 1;
    }

    // Adjust based on risk level
    if (riskLevel === 'critical' || riskLevel === 'high') {
      requirements.approvers.push('security-admin', 'cto');
      requirements.requiredCount = Math.max(requirements.requiredCount, 2);
      requirements.timeoutMinutes = 120; // Longer timeout for high-risk
    }

    // Special handling for delete operations
    if (action.action === 'delete') {
      requirements.approvers.push('senior-admin');
      requirements.requiredCount = Math.max(requirements.requiredCount, 2);
    }

    return requirements;
  }

  private async sendApprovalNotifications(approval: ApprovalRequest): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const [type, handler] of this.approvalHandlers.entries()) {
      try {
        const result = await handler.sendApprovalRequest(approval);
        results.push({ type, success: true, message: result });
      } catch (error) {
        results.push({
          type,
          success: false,
          message: `Failed to send ${type} notification: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        this.logger.error(`Failed to send ${type} notification`, { error, approvalId: approval.id });
      }
    }

    return results;
  }

  private async sendApprovalCompletionNotification(approval: ApprovalRequest): Promise<void> {
    const message = `✅ Approval completed for ${approval.platformAction.action} operation on ${approval.platformAction.resourceName}`;

    for (const handler of this.approvalHandlers.values()) {
      try {
        await handler.sendNotification(approval.context.userId, message);
      } catch (error) {
        this.logger.error('Failed to send completion notification', { error, approvalId: approval.id });
      }
    }
  }

  private async sendRejectionNotification(approval: ApprovalRequest, approverId: string, reason?: string): Promise<void> {
    const message = `❌ Request rejected by ${approverId}${reason ? `: ${reason}` : ''}`;

    for (const handler of this.approvalHandlers.values()) {
      try {
        await handler.sendNotification(approval.context.userId, message);
      } catch (error) {
        this.logger.error('Failed to send rejection notification', { error, approvalId: approval.id });
      }
    }
  }

  private async sendEscalationNotifications(approval: ApprovalRequest, escalationApprovers: string[], reason?: string): Promise<void> {
    const message = `⬆️ Approval escalated for ${approval.platformAction.action} operation${reason ? `: ${reason}` : ''}`;

    for (const approverId of escalationApprovers) {
      for (const handler of this.approvalHandlers.values()) {
        try {
          await handler.sendNotification(approverId, message);
        } catch (error) {
          this.logger.error('Failed to send escalation notification', { error, approverId });
        }
      }
    }
  }

  private async sendTimeoutNotification(approval: ApprovalRequest): Promise<void> {
    const message = `⏰ Approval request timed out for ${approval.platformAction.action} operation`;

    for (const handler of this.approvalHandlers.values()) {
      try {
        await handler.sendNotification(approval.context.userId, message);
      } catch (error) {
        this.logger.error('Failed to send timeout notification', { error, approvalId: approval.id });
      }
    }
  }

  private checkApprovalRequirements(approval: ApprovalRequest): boolean {
    return approval.approvals.length >= approval.requirements.requiredCount;
  }

  private calculateApprovalProgress(approval: ApprovalRequest): { current: number; required: number; percentage: number } {
    const current = approval.approvals.length;
    const required = approval.requirements.requiredCount;
    const percentage = Math.round((current / required) * 100);

    return { current, required, percentage };
  }

  private calculateExpiration(urgency: string): string {
    const now = new Date();
    const timeouts = {
      low: 24 * 60, // 24 hours
      normal: 4 * 60, // 4 hours
      high: 2 * 60, // 2 hours
      critical: 30 // 30 minutes
    };

    const timeoutMinutes = timeouts[urgency as keyof typeof timeouts] || timeouts.normal;
    now.setMinutes(now.getMinutes() + timeoutMinutes);

    return now.toISOString();
  }

  private getEscalationApprovers(approval: ApprovalRequest): string[] {
    // Return higher-level approvers for escalation
    return ['cto', 'security-director', 'operations-director'];
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    // Check storage health
    const storageHealth = await this.storage.getHealth();
    
    // Check handler health
    const handlerHealth = await Promise.all(
      Array.from(this.approvalHandlers.entries()).map(async ([type, handler]) => ({
        type,
        health: await handler.getHealth()
      }))
    );

    const unhealthyHandlers = handlerHealth.filter(h => h.health.status === 'unhealthy');

    // Overall health determination
    if (storageHealth.status === 'unhealthy') {
      return {
        status: 'unhealthy',
        message: `Approval storage unhealthy: ${storageHealth.message}`
      };
    } else if (unhealthyHandlers.length === handlerHealth.length) {
      return {
        status: 'unhealthy',
        message: 'All approval handlers are unhealthy'
      };
    } else if (storageHealth.status === 'degraded' || unhealthyHandlers.length > 0) {
      return {
        status: 'degraded',
        message: `Storage: ${storageHealth.status}, ${unhealthyHandlers.length}/${handlerHealth.length} handlers unhealthy`
      };
    }

    // Get pending count from storage
    const pendingApprovals = await this.storage.getPendingApprovals();

    return {
      status: 'healthy',
      message: `Approval module operational with ${pendingApprovals.length} pending approvals`
    };
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Approval module');

    // Shutdown handlers
    for (const handler of this.approvalHandlers.values()) {
      await handler.shutdown();
    }

    // Shutdown storage
    await this.storage.shutdown();
  }
}

// Approval handler implementations
abstract class ApprovalHandler {
  abstract initialize(): Promise<void>;
  abstract sendApprovalRequest(approval: ApprovalRequest): Promise<string>;
  abstract sendNotification(recipient: string, message: string): Promise<void>;
  abstract getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }>;
  abstract shutdown(): Promise<void>;
}

class SlackApprovalHandler extends ApprovalHandler {
  async initialize(): Promise<void> {
    // Initialize Slack integration
    // In real implementation, this would set up Slack bot
  }

  async sendApprovalRequest(approval: ApprovalRequest): Promise<string> {
    // Simulate Slack approval request
    const message = this.formatSlackApprovalMessage(approval);
    console.log(`[SLACK] ${message}`);
    return 'Slack approval request sent';
  }

  async sendNotification(recipient: string, message: string): Promise<void> {
    console.log(`[SLACK] @${recipient}: ${message}`);
  }

  private formatSlackApprovalMessage(approval: ApprovalRequest): string {
    return `
🤖 *Approval Required*
• *Action*: ${approval.platformAction.action}
• *Resource*: ${approval.platformAction.resourceName}
• *Environment*: ${approval.platformAction.environment}
• *Risk Level*: ${approval.riskLevel}
• *Justification*: ${approval.justification}
• *Expires*: ${new Date(approval.expiresAt).toLocaleString()}

React with ✅ to approve or ❌ to reject
`;
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    return { status: 'healthy', message: 'Slack handler operational (simulated)' };
  }

  async shutdown(): Promise<void> {
    // Cleanup Slack connections
  }
}

class EmailApprovalHandler extends ApprovalHandler {
  async initialize(): Promise<void> {
    // Initialize email service
  }

  async sendApprovalRequest(approval: ApprovalRequest): Promise<string> {
    console.log(`[EMAIL] Approval request sent for ${approval.platformAction.action}`);
    return 'Email approval request sent';
  }

  async sendNotification(recipient: string, message: string): Promise<void> {
    console.log(`[EMAIL] ${recipient}: ${message}`);
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    return { status: 'healthy', message: 'Email handler operational (simulated)' };
  }

  async shutdown(): Promise<void> {
    // Cleanup email connections
  }
}

class ConsoleApprovalHandler extends ApprovalHandler {
  async initialize(): Promise<void> {
    // No initialization needed for console output
  }

  async sendApprovalRequest(approval: ApprovalRequest): Promise<string> {
    console.log(`
╭─── 🤖 APPROVAL REQUIRED ───╮
│ Action: ${approval.platformAction.action}
│ Resource: ${approval.platformAction.resourceName}
│ Environment: ${approval.platformAction.environment}
│ Risk Level: ${approval.riskLevel}
│ Expires: ${new Date(approval.expiresAt).toLocaleString()}
│ Approval ID: ${approval.id}
╰────────────────────────────╯
`);
    return 'Console approval request displayed';
  }

  async sendNotification(recipient: string, message: string): Promise<void> {
    console.log(`[NOTIFICATION] ${recipient}: ${message}`);
  }

  async getHealth(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string }> {
    return { status: 'healthy', message: 'Console handler operational' };
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
  }
}

interface NotificationResult {
  type: string;
  success: boolean;
  message: string;
}