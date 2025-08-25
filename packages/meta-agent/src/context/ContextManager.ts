import { QdrantContextClient } from '@ai-idp/qdrant-client';
import { Logger } from 'pino';
import type {
  ConversationContext,
  VectorSearchResult,
  UserResponse,
  AgentResponse
} from '@ai-idp/types';

/**
 * Context Manager - Handles context storage and retrieval using Qdrant
 * 
 * Responsibilities:
 * - Store conversation interactions for learning
 * - Retrieve relevant historical context
 * - Manage context patterns and insights
 * - Enable cross-agent context sharing
 */
export class ContextManager {
  private qdrantClient: QdrantContextClient;
  private logger: Logger;

  constructor(qdrantClient: QdrantContextClient, logger: Logger) {
    this.qdrantClient = qdrantClient;
    this.logger = logger.child({ component: 'ContextManager' });
  }

  /**
   * Initialize context management
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Context Manager');
    // Qdrant client is already initialized by Meta-Agent
  }

  /**
   * Retrieve relevant context for user request
   */
  async retrieveRelevantContext(
    userInput: string,
    context: ConversationContext,
    limit: number = 5
  ): Promise<VectorSearchResult[]> {
    try {
      this.logger.info('Retrieving relevant context', {
        query: userInput.substring(0, 50),
        conversationId: context.conversationId,
        limit
      });

      // Build enhanced query with conversation context
      const enhancedQuery = this.enhanceQueryWithContext(userInput, context);

      // Retrieve context from Qdrant
      const results = await this.qdrantClient.retrieveContext({
        query: enhancedQuery,
        limit,
        scoreThreshold: 0.7 // Only high-relevance contexts
      });

      // Filter and rank results
      const filteredResults = this.filterContextResults(results, context);

      this.logger.info('Context retrieval completed', {
        totalResults: results.length,
        filteredResults: filteredResults.length,
        topScore: filteredResults[0]?.score
      });

      return filteredResults;

    } catch (error) {
      this.logger.error('Context retrieval failed', {
        error: error.message,
        userInput: userInput.substring(0, 100)
      });
      return []; // Return empty context on failure
    }
  }

  /**
   * Store interaction for future context retrieval
   */
  async storeInteraction(
    context: ConversationContext,
    userInput: string,
    userResponse: UserResponse,
    agentResponses: AgentResponse[]
  ): Promise<void> {
    try {
      this.logger.info('Storing interaction context', {
        conversationId: context.conversationId,
        agentCount: agentResponses.length,
        success: userResponse.success
      });

      // Store main conversation context
      await this.qdrantClient.storeConversationContext(
        context.conversationId,
        context,
        {
          agentId: 'meta-agent',
          success: userResponse.success,
          message: userResponse.message,
          data: userResponse.data || {},
          metadata: {
            agent: 'meta-agent',
            action: 'processRequest',
            hasDetailedResponse: !!userResponse.detailedResponse,
            executionTime: userResponse.metadata.totalExecutionTime,
            contextUsed: []
          }
        }
      );

      // Store each agent response for cross-agent learning
      for (const agentResponse of agentResponses) {
        await this.qdrantClient.storeConversationContext(
          `${context.conversationId}_${agentResponse.agentId}`,
          context,
          agentResponse
        );
      }

      // Store patterns if successful interaction
      if (userResponse.success && agentResponses.length > 0) {
        await this.storeSuccessPattern(userInput, agentResponses, context);
      }

      this.logger.info('Interaction context stored successfully');

    } catch (error) {
      this.logger.error('Failed to store interaction context', {
        error: error.message,
        conversationId: context.conversationId
      });
      // Don't throw error to avoid breaking user interaction
    }
  }

  /**
   * Store decision context for approval workflows
   */
  async storeDecisionContext(
    decisionId: string,
    agent: string,
    decision: string,
    reasoning: string,
    outcome: any,
    context: ConversationContext
  ): Promise<void> {
    try {
      await this.qdrantClient.storeDecisionContext(
        decisionId,
        agent,
        decision,
        reasoning,
        outcome
      );

      this.logger.info('Decision context stored', {
        decisionId,
        agent,
        decision: decision.substring(0, 50)
      });

    } catch (error) {
      this.logger.error('Failed to store decision context', {
        error: error.message,
        decisionId
      });
    }
  }

  /**
   * Get historical patterns for similar requests
   */
  async getHistoricalPatterns(
    query: string,
    agent?: string,
    limit: number = 3
  ): Promise<VectorSearchResult[]> {
    try {
      const patterns = await this.qdrantClient.findSimilarPatterns(
        query,
        agent,
        limit
      );

      this.logger.info('Retrieved historical patterns', {
        query: query.substring(0, 50),
        agent,
        patternCount: patterns.length
      });

      return patterns;

    } catch (error) {
      this.logger.error('Failed to retrieve historical patterns', {
        error: error.message,
        query: query.substring(0, 50)
      });
      return [];
    }
  }

  /**
   * Get decision history for approval context
   */
  async getDecisionHistory(
    decisionContext: string,
    agent?: string,
    limit: number = 5
  ): Promise<VectorSearchResult[]> {
    try {
      const decisions = await this.qdrantClient.getHistoricalDecisions(
        decisionContext,
        agent,
        limit
      );

      this.logger.info('Retrieved decision history', {
        context: decisionContext.substring(0, 50),
        agent,
        decisionCount: decisions.length
      });

      return decisions;

    } catch (error) {
      this.logger.error('Failed to retrieve decision history', {
        error: error.message,
        context: decisionContext.substring(0, 50)
      });
      return [];
    }
  }

  /**
   * Analyze context trends and provide insights
   */
  async analyzeContextTrends(
    timeRange: { start: Date; end: Date },
    agent?: string
  ): Promise<{
    totalInteractions: number;
    successRate: number;
    commonPatterns: string[];
    topAgents: string[];
    insights: string[];
  }> {
    // This is a simplified implementation
    // In production, you'd want more sophisticated analytics
    
    this.logger.info('Analyzing context trends', {
      timeRange,
      agent
    });

    // For now, return mock data
    // TODO: Implement actual trend analysis using Qdrant aggregations
    return {
      totalInteractions: 0,
      successRate: 0.0,
      commonPatterns: [],
      topAgents: [],
      insights: ['Trend analysis not yet implemented']
    };
  }

  /**
   * Enhance user query with conversation context
   */
  private enhanceQueryWithContext(
    userInput: string,
    context: ConversationContext
  ): string {
    // Get recent conversation for context
    const recentMessages = context.history
      .slice(-2) // Last 2 messages
      .map(msg => msg.content)
      .join(' ');

    // Combine user input with recent context
    const enhancedQuery = `${userInput} ${recentMessages}`.trim();

    this.logger.debug('Enhanced query with context', {
      original: userInput.substring(0, 50),
      enhanced: enhancedQuery.substring(0, 100)
    });

    return enhancedQuery;
  }

  /**
   * Filter and rank context results
   */
  private filterContextResults(
    results: VectorSearchResult[],
    context: ConversationContext
  ): VectorSearchResult[] {
    return results
      // Filter out very low scores
      .filter(result => result.score >= 0.7)
      // Filter out results from current conversation (avoid circular context)
      .filter(result => 
        !result.payload.metadata?.conversationId || 
        result.payload.metadata.conversationId !== context.conversationId
      )
      // Sort by score (highest first)
      .sort((a, b) => b.score - a.score)
      // Limit to top results
      .slice(0, 5);
  }

  /**
   * Store successful interaction patterns for learning
   */
  private async storeSuccessPattern(
    userInput: string,
    agentResponses: AgentResponse[],
    context: ConversationContext
  ): Promise<void> {
    try {
      const pattern = this.extractPattern(userInput, agentResponses);
      
      await this.qdrantClient.storeExecutionPattern(
        `pattern_${Date.now()}`,
        agentResponses[0]?.agentId || 'unknown',
        pattern,
        {
          userInput,
          agentCount: agentResponses.length,
          agents: agentResponses.map(r => r.agentId),
          actions: agentResponses.map(r => r.metadata.action),
          executionTime: agentResponses.reduce((sum, r) => sum + r.metadata.executionTime, 0)
        },
        true // Success = true
      );

    } catch (error) {
      this.logger.warn('Failed to store success pattern', {
        error: error.message
      });
    }
  }

  /**
   * Extract pattern from successful interaction
   */
  private extractPattern(
    userInput: string,
    agentResponses: AgentResponse[]
  ): string {
    const agents = agentResponses.map(r => r.agentId).join(', ');
    const actions = agentResponses.map(r => r.metadata.action).join(', ');
    
    return `User intent: ${userInput.substring(0, 100)} → Agents: ${agents} → Actions: ${actions}`;
  }

  /**
   * Cleanup old context data
   */
  async cleanupOldContext(retentionDays: number = 30): Promise<void> {
    try {
      this.logger.info('Cleaning up old context data', { retentionDays });

      await this.qdrantClient.cleanupOldContext(retentionDays);

      this.logger.info('Context cleanup completed');

    } catch (error) {
      this.logger.error('Context cleanup failed', { error });
    }
  }
}