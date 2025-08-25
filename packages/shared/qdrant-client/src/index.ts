import { QdrantClient } from '@qdrant/js-client-rest';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { Logger } from 'pino';
import type { 
  ContextVector, 
  VectorSearchResult, 
  ContextRetrievalQuery,
  QdrantConfig,
  ConversationContext,
  AgentResponse 
} from '@ai-idp/types';

// Configuration schema
const QdrantConfigSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().optional(),
  collectionName: z.string().default('agent_context'),
  vectorSize: z.number().default(1536), // OpenAI ada-002 embedding size
  timeout: z.number().default(30000)
});

// Context payload schemas
const ContextPayloadSchema = z.object({
  type: z.enum(['conversation', 'decision', 'execution', 'pattern']),
  agent: z.string(),
  timestamp: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.any())
});

export class QdrantContextClient {
  private qdrant: QdrantClient;
  private openai: OpenAI;
  private config: z.infer<typeof QdrantConfigSchema>;
  private logger: Logger;

  constructor(config: QdrantConfig, openaiApiKey: string, logger: Logger) {
    this.config = QdrantConfigSchema.parse(config);
    this.logger = logger;
    
    this.qdrant = new QdrantClient({
      url: this.config.url,
      apiKey: this.config.apiKey,
    });

    this.openai = new OpenAI({
      apiKey: openaiApiKey,
    });
  }

  /**
   * Initialize the Qdrant collection for context storage
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info(`Initializing Qdrant collection: ${this.config.collectionName}`);
      
      // Check if collection exists
      const collections = await this.qdrant.getCollections();
      const collectionExists = collections.collections.some(
        collection => collection.name === this.config.collectionName
      );

      if (!collectionExists) {
        // Create collection with vector configuration
        await this.qdrant.createCollection(this.config.collectionName, {
          vectors: {
            size: this.config.vectorSize,
            distance: 'Cosine'
          },
          optimizers_config: {
            default_segment_number: 2
          },
          replication_factor: 1
        });
        this.logger.info(`Created Qdrant collection: ${this.config.collectionName}`);
      } else {
        this.logger.info(`Qdrant collection already exists: ${this.config.collectionName}`);
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Qdrant collection');
      throw error;
    }
  }

  /**
   * Generate embedding for text using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error({ error, text: text.substring(0, 100) }, 'Failed to generate embedding');
      throw error;
    }
  }

  /**
   * Store conversation context in Qdrant
   */
  async storeConversationContext(
    conversationId: string,
    context: ConversationContext,
    agentResponse: AgentResponse
  ): Promise<void> {
    try {
      // Create contextual content for embedding
      const contextContent = `
        Conversation: ${conversationId}
        User: ${context.history[context.history.length - 1]?.content || ''}
        Agent: ${agentResponse.agentId}
        Action: ${agentResponse.metadata.action}
        Response: ${agentResponse.message}
        Success: ${agentResponse.success}
      `.trim();

      const embedding = await this.generateEmbedding(contextContent);

      const contextVector: ContextVector = {
        id: `conv_${conversationId}_${Date.now()}`,
        vector: embedding,
        payload: {
          type: 'conversation',
          agent: agentResponse.agentId,
          timestamp: new Date().toISOString(),
          content: contextContent,
          metadata: {
            conversationId,
            userId: context.userId,
            sessionId: context.sessionId,
            action: agentResponse.metadata.action,
            success: agentResponse.success,
            executionTime: agentResponse.metadata.executionTime,
            ...agentResponse.metadata
          }
        }
      };

      await this.qdrant.upsert(this.config.collectionName, {
        wait: true,
        points: [
          {
            id: contextVector.id,
            vector: contextVector.vector,
            payload: contextVector.payload
          }
        ]
      });

      this.logger.info({ 
        id: contextVector.id, 
        agent: agentResponse.agentId,
        conversationId 
      }, 'Stored conversation context');
    } catch (error) {
      this.logger.error({ error, conversationId }, 'Failed to store conversation context');
      throw error;
    }
  }

  /**
   * Store agent decision context
   */
  async storeDecisionContext(
    decisionId: string,
    agent: string,
    decision: string,
    reasoning: string,
    outcome: any
  ): Promise<void> {
    try {
      const decisionContent = `
        Decision: ${decision}
        Reasoning: ${reasoning}
        Outcome: ${JSON.stringify(outcome)}
        Agent: ${agent}
      `.trim();

      const embedding = await this.generateEmbedding(decisionContent);

      const contextVector: ContextVector = {
        id: `decision_${decisionId}`,
        vector: embedding,
        payload: {
          type: 'decision',
          agent: agent,
          timestamp: new Date().toISOString(),
          content: decisionContent,
          metadata: {
            decisionId,
            decision,
            reasoning,
            outcome
          }
        }
      };

      await this.qdrant.upsert(this.config.collectionName, {
        wait: true,
        points: [{
          id: contextVector.id,
          vector: contextVector.vector,
          payload: contextVector.payload
        }]
      });

      this.logger.info({ id: contextVector.id, agent, decisionId }, 'Stored decision context');
    } catch (error) {
      this.logger.error({ error, decisionId }, 'Failed to store decision context');
      throw error;
    }
  }

  /**
   * Store execution pattern for learning
   */
  async storeExecutionPattern(
    patternId: string,
    agent: string,
    pattern: string,
    context: Record<string, any>,
    success: boolean
  ): Promise<void> {
    try {
      const patternContent = `
        Pattern: ${pattern}
        Agent: ${agent}
        Success: ${success}
        Context: ${JSON.stringify(context)}
      `.trim();

      const embedding = await this.generateEmbedding(patternContent);

      const contextVector: ContextVector = {
        id: `pattern_${patternId}`,
        vector: embedding,
        payload: {
          type: 'pattern',
          agent: agent,
          timestamp: new Date().toISOString(),
          content: patternContent,
          metadata: {
            patternId,
            pattern,
            context,
            success
          }
        }
      };

      await this.qdrant.upsert(this.config.collectionName, {
        wait: true,
        points: [{
          id: contextVector.id,
          vector: contextVector.vector,
          payload: contextVector.payload
        }]
      });

      this.logger.info({ id: contextVector.id, agent, patternId }, 'Stored execution pattern');
    } catch (error) {
      this.logger.error({ error, patternId }, 'Failed to store execution pattern');
      throw error;
    }
  }

  /**
   * Retrieve relevant context based on semantic search
   */
  async retrieveContext(query: ContextRetrievalQuery): Promise<VectorSearchResult[]> {
    try {
      this.logger.info({ query: query.query.substring(0, 100) }, 'Retrieving context');

      const queryEmbedding = await this.generateEmbedding(query.query);

      // Build filter conditions
      const filter: any = {};
      if (query.type) {
        filter.type = query.type;
      }
      if (query.agent) {
        filter.agent = query.agent;
      }

      const searchResult = await this.qdrant.search(this.config.collectionName, {
        vector: queryEmbedding,
        limit: query.limit || 5,
        score_threshold: query.scoreThreshold || 0.7,
        filter: Object.keys(filter).length > 0 ? { must: [{ key: 'payload', match: filter }] } : undefined,
        with_payload: true
      });

      const results: VectorSearchResult[] = searchResult.map(point => ({
        id: point.id.toString(),
        score: point.score || 0,
        payload: point.payload as ContextVector['payload']
      }));

      this.logger.info({ 
        resultCount: results.length,
        topScore: results[0]?.score 
      }, 'Retrieved context results');

      return results;
    } catch (error) {
      this.logger.error({ error, query }, 'Failed to retrieve context');
      throw error;
    }
  }

  /**
   * Find similar patterns for learning and recommendations
   */
  async findSimilarPatterns(
    pattern: string,
    agent?: string,
    limit: number = 3
  ): Promise<VectorSearchResult[]> {
    return this.retrieveContext({
      query: pattern,
      type: 'pattern',
      agent,
      limit,
      scoreThreshold: 0.8
    });
  }

  /**
   * Get historical decisions for approval workflows
   */
  async getHistoricalDecisions(
    decisionContext: string,
    agent?: string,
    limit: number = 5
  ): Promise<VectorSearchResult[]> {
    return this.retrieveContext({
      query: decisionContext,
      type: 'decision',
      agent,
      limit,
      scoreThreshold: 0.75
    });
  }

  /**
   * Health check for Qdrant connection
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const collections = await this.qdrant.getCollections();
      const collectionExists = collections.collections.some(
        collection => collection.name === this.config.collectionName
      );

      return {
        healthy: collectionExists,
        details: {
          url: this.config.url,
          collectionName: this.config.collectionName,
          collectionExists,
          collections: collections.collections.length
        }
      };
    } catch (error) {
      this.logger.error({ error }, 'Qdrant health check failed');
      return {
        healthy: false,
        details: { error: error.message }
      };
    }
  }

  /**
   * Clean up old context data (retention policy)
   */
  async cleanupOldContext(retentionDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Note: This is a simplified cleanup. In production, you'd want batch processing
      const result = await this.qdrant.delete(this.config.collectionName, {
        filter: {
          must: [{
            key: 'timestamp',
            range: {
              lt: cutoffDate.toISOString()
            }
          }]
        }
      });

      this.logger.info({ 
        retentionDays, 
        cutoffDate: cutoffDate.toISOString()
      }, 'Cleaned up old context data');

      return 0; // Qdrant doesn't return count in delete operation
    } catch (error) {
      this.logger.error({ error, retentionDays }, 'Failed to cleanup old context');
      throw error;
    }
  }
}

export * from '@ai-idp/types';