import { createLogger } from '@ai-idp/utils';
import type { Logger } from 'pino';
import type {
  AgentResponse,
  UserResponse,
  AgentIntent
} from '@ai-idp/types';

/**
 * Response Coordinator - Synthesizes responses from multiple agents
 * 
 * Responsibilities:
 * - Aggregate responses from multiple focused agents
 * - Format responses for user-friendly presentation
 * - Handle error scenarios and partial failures
 * - Maintain response consistency across agents
 */
export class ResponseCoordinator {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ? logger.child({ component: 'ResponseCoordinator' }) : createLogger({
      service: 'meta-agent-response-coordinator',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development'
    });
  }

  /**
   * Synthesize responses from multiple agents into cohesive user response
   */
  async synthesizeResponse(
    agentResponses: AgentResponse[],
    intent: AgentIntent,
    userInput: string
  ): Promise<UserResponse> {
    this.logger.info({
      responseCount: agentResponses.length,
      intent: intent.action,
      targetAgent: intent.agent
    }, 'Synthesizing agent responses');
    this.logger.info({
      agentCount: agentResponses.length,
      intent: intent.action,
      userInput: userInput.substring(0, 100)
    }, 'Synthesizing agent responses');

    try {
      // Determine overall success
      const overallSuccess = agentResponses.length > 0 && agentResponses.every(r => r.success);

      // Get successful and failed responses
      const successfulResponses = agentResponses.filter(r => r.success);
      const failedResponses = agentResponses.filter(r => !r.success);

      // Create main response message
      const message = this.createMainMessage(
        agentResponses,
        intent,
        overallSuccess
      );

      // Create detailed response if available
      const detailedResponse = this.createDetailedResponse(
        agentResponses,
        intent,
        userInput
      );

      // Aggregate response data
      const responseData = this.aggregateResponseData(agentResponses);

      // Extract standardized fields from successful agent responses
      const successfulResponse = successfulResponses[0]; // Use first successful response
      const approvalId = successfulResponse?.metadata?.approvalId;
      const confidence = successfulResponse?.metadata?.confidence;
      const riskLevel = successfulResponse?.metadata?.riskLevel;

      // Create user response with standardized fields
      const userResponse: UserResponse = {
        success: overallSuccess,
        message,
        detailedResponse: detailedResponse || undefined,
        data: responseData,
        // Top-level standardized fields for web app compatibility
        approvalId,
        confidence,
        riskLevel,
        metadata: {
          agentsInvolved: agentResponses.map(r => r.agentId),
          totalExecutionTime: agentResponses.reduce(
            (sum, r) => sum + r.metadata.executionTime,
            0
          ),
          contextStored: true, // Will be set by Meta-Agent
          // Standardized fields in metadata as well for backward compatibility
          approvalId,
          confidence,
          riskLevel
        }
      };

      this.logger.info({
        success: overallSuccess,
        messageLength: message.length,
        hasDetailedResponse: !!detailedResponse,
        dataKeys: Object.keys(responseData).length
      }, 'Response synthesis completed');
      this.logger.info({
        agentCount: agentResponses.length,
        message: userResponse.message
      }, 'Response synthesis completed');

      return userResponse;

    } catch (error) {
      this.logger.error({
        error: error.message,
        responseCount: agentResponses.length
      }, 'Response synthesis failed');
      this.logger.error({
        error: error?.message || error
      }, 'Response synthesis failed');

      // Return error response
      return {
        success: false,
        message: `I encountered an error processing your request: ${error.message}`,
        metadata: {
          agentsInvolved: agentResponses.map(r => r.agentId),
          totalExecutionTime: 0,
          contextStored: false
        }
      };
    }
  }

  /**
   * Create main response message
   */
  private createMainMessage(
    responses: AgentResponse[],
    intent: AgentIntent,
    overallSuccess: boolean
  ): string {
    if (responses.length === 0) {
      return "I wasn't able to process your request. No agents responded.";
    }

    if (responses.length === 1) {
      // Single agent response
      const response = responses[0];
      return this.formatSingleAgentMessage(response, intent);
    }

    // Multiple agent responses
    return this.formatMultiAgentMessage(responses, intent, overallSuccess);
  }

  /**
   * Format message for single agent response
   */
  private formatSingleAgentMessage(
    response: AgentResponse,
    intent: AgentIntent
  ): string {
    const agentEmoji = this.getAgentEmoji(response.agentId);
    const statusEmoji = response.success ? '✅' : '❌';

    if (response.success) {
      return `${statusEmoji} ${agentEmoji} ${response.message}`;
    } else {
      const errorContext = response.errors?.length ?
        ` (${response.errors[0]})` : '';
      return `${statusEmoji} ${agentEmoji} ${response.message}${errorContext}`;
    }
  }

  /**
   * Format message for multiple agent responses
   */
  private formatMultiAgentMessage(
    responses: AgentResponse[],
    intent: AgentIntent,
    overallSuccess: boolean
  ): string {
    const successCount = responses.filter(r => r.success).length;
    const totalCount = responses.length;

    if (overallSuccess) {
      return `✅ Successfully completed your request using ${totalCount} specialized agents.`;
    } else {
      return `⚠️ Partially completed your request (${successCount}/${totalCount} agents succeeded).`;
    }
  }

  /**
   * Create detailed response with rich information
   */
  private createDetailedResponse(
    responses: AgentResponse[],
    intent: AgentIntent,
    userInput: string
  ): string | null {
    const detailedResponses = responses
      .filter(r => r.detailedResponse)
      .map(r => r.detailedResponse);

    if (detailedResponses.length === 0) {
      return this.createSyntheticDetailedResponse(responses, intent, userInput);
    }

    if (detailedResponses.length === 1) {
      return detailedResponses[0]!;
    }

    // Multiple detailed responses - combine them
    return this.combineDetailedResponses(responses, intent);
  }

  /**
   * Create synthetic detailed response when agents don't provide one
   */
  private createSyntheticDetailedResponse(
    responses: AgentResponse[],
    intent: AgentIntent,
    userInput: string
  ): string {
    const sections: string[] = [];

    // Add operation summary
    sections.push(`## Operation Summary`);
    sections.push(`**Request**: ${userInput}`);
    sections.push(`**Primary Agent**: ${this.getAgentEmoji(intent.agent)} ${this.getAgentDisplayName(intent.agent)}`);
    sections.push(`**Action**: ${intent.action}`);
    sections.push('');

    // Add agent results
    sections.push(`## Agent Results`);
    for (const response of responses) {
      const emoji = this.getAgentEmoji(response.agentId);
      const status = response.success ? '✅' : '❌';
      const displayName = this.getAgentDisplayName(response.agentId);

      sections.push(`### ${emoji} ${displayName} ${status}`);
      sections.push(`**Action**: ${response.metadata.action}`);
      sections.push(`**Result**: ${response.message}`);
      sections.push(`**Execution Time**: ${response.metadata.executionTime}ms`);

      if (response.errors?.length) {
        sections.push(`**Errors**: ${response.errors.join(', ')}`);
      }

      if (response.warnings?.length) {
        sections.push(`**Warnings**: ${response.warnings.join(', ')}`);
      }

      sections.push('');
    }

    // Add next steps if successful
    if (responses.some(r => r.success)) {
      sections.push(`## Next Steps`);
      sections.push(this.generateNextSteps(responses, intent));
    }

    return sections.join('\n');
  }

  /**
   * Combine multiple detailed responses
   */
  private combineDetailedResponses(
    responses: AgentResponse[],
    intent: AgentIntent
  ): string {
    const sections: string[] = [];

    sections.push(`## Multi-Agent Operation Results`);
    sections.push(`**Operation**: ${intent.action}`);
    sections.push('');

    for (const response of responses) {
      if (response.detailedResponse) {
        const emoji = this.getAgentEmoji(response.agentId);
        const displayName = this.getAgentDisplayName(response.agentId);

        sections.push(`### ${emoji} ${displayName} Details`);
        sections.push(response.detailedResponse);
        sections.push('');
      }
    }

    return sections.join('\n');
  }

  /**
   * Aggregate data from all agent responses
   */
  private aggregateResponseData(responses: AgentResponse[]): Record<string, any> {
    const aggregatedData: Record<string, any> = {};

    for (const response of responses) {
      if (response.data && typeof response.data === 'object') {
        // Namespace data by agent to avoid conflicts
        aggregatedData[response.agentId] = response.data;
      }
    }

    // Add summary information
    aggregatedData._summary = {
      totalAgents: responses.length,
      successfulAgents: responses.filter(r => r.success).length,
      totalExecutionTime: responses.reduce((sum, r) => sum + r.metadata.executionTime, 0),
      agents: responses.map(r => ({
        agentId: r.agentId,
        action: r.metadata.action,
        success: r.success,
        executionTime: r.metadata.executionTime
      }))
    };

    return aggregatedData;
  }

  /**
   * Generate next steps based on successful operations
   */
  private generateNextSteps(
    responses: AgentResponse[],
    intent: AgentIntent
  ): string {
    const nextSteps: string[] = [];

    // Agent-specific next steps
    for (const response of responses.filter(r => r.success)) {
      const steps = this.getAgentNextSteps(response, intent);
      nextSteps.push(...steps);
    }

    // Generic next steps if none provided
    if (nextSteps.length === 0) {
      nextSteps.push('Monitor the operation status');
      nextSteps.push('Check logs if any issues arise');
      nextSteps.push('Use the chat interface for additional operations');
    }

    return nextSteps.map(step => `• ${step}`).join('\n');
  }

  /**
   * Get next steps for specific agent types
   */
  private getAgentNextSteps(response: AgentResponse, intent: AgentIntent): string[] {
    switch (response.agentId) {
      case 'infrastructure':
        return [
          'Check deployment status in Kubernetes dashboard',
          'Monitor resource utilization and scaling',
          'Verify service endpoints are accessible'
        ];

      case 'security':
        return [
          'Review security scan results',
          'Monitor compliance dashboard',
          'Address any security findings promptly'
        ];

      case 'workflow':
        return [
          'Track approval status in workflow dashboard',
          'Check notification channels for updates',
          'Monitor workflow execution progress'
        ];

      case 'observability':
        return [
          'Review monitoring dashboards',
          'Set up alerts for key metrics',
          'Check log aggregation and analysis'
        ];

      case 'cicd':
        return [
          'Monitor pipeline execution status',
          'Review build and test results',
          'Track deployment progression'
        ];

      default:
        return [];
    }
  }

  /**
   * Get emoji for agent type
   */
  private getAgentEmoji(agentId: string): string {
    const emojiMap: Record<string, string> = {
      'infrastructure': '🔧',
      'security': '🛡️',
      'workflow': '⚡',
      'observability': '📊',
      'cicd': '🚀',
      'meta-agent': '🧠'
    };
    return emojiMap[agentId] || '🤖';
  }

  /**
   * Get display name for agent type
   */
  private getAgentDisplayName(agentId: string): string {
    const displayNameMap: Record<string, string> = {
      'infrastructure': 'Infrastructure Agent',
      'security': 'Security Agent',
      'workflow': 'Workflow Agent',
      'observability': 'Observability Agent',
      'cicd': 'CI/CD Agent',
      'meta-agent': 'Meta-Agent'
    };
    return displayNameMap[agentId] || agentId;
  }
}