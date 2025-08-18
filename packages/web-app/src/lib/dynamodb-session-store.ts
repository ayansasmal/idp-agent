/**
 * DynamoDB-based persistent session storage for chat conversations
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  UpdateCommand, 
  QueryCommand, 
  DeleteCommand,
  ScanCommand 
} from "@aws-sdk/lib-dynamodb";

export interface PersistentConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: any;
}

export interface PersistentResourceReference {
  name: string;
  type: string;
  namespace: string;
  status: string;
  deployedAt: string;
  lastChecked?: string;
}

export interface PersistentSessionContext {
  sessionId: string;
  userId: string;
  title: string; // User-friendly session title
  messages: PersistentConversationMessage[];
  deployedResources: PersistentResourceReference[];
  createdAt: string;
  lastActivity: string;
  environment: string;
  permissions: string[];
  isActive: boolean;
  messageCount: number;
  resourceCount: number;
}

export class DynamoDBSessionStore {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    // Configure DynamoDB client for LocalStack in development
    const dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT || 'http://localhost:4566', // LocalStack endpoint
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    });

    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = process.env.CHAT_SESSIONS_TABLE_NAME || 'ai-idp-chat-sessions';
  }

  /**
   * Create or update a session
   */
  async saveSession(session: PersistentSessionContext): Promise<void> {
    try {
      await this.client.send(new PutCommand({
        TableName: this.tableName,
        Item: {
          ...session,
          updatedAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
        }
      }));
    } catch (error) {
      console.error('Failed to save session to DynamoDB:', error);
      throw new Error(`Failed to save session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve a session by ID
   */
  async getSession(sessionId: string): Promise<PersistentSessionContext | null> {
    try {
      const result = await this.client.send(new GetCommand({
        TableName: this.tableName,
        Key: { sessionId }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as PersistentSessionContext;
    } catch (error) {
      console.error('Failed to get session from DynamoDB:', error);
      throw new Error(`Failed to get session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add a message to a session
   */
  async addMessage(sessionId: string, message: PersistentConversationMessage): Promise<void> {
    try {
      // Get current session to generate title if needed
      const session = await this.getSession(sessionId);
      const isFirstUserMessage = session && session.messages.length === 0 && message.role === 'user';
      
      let updateExpression = 'SET messages = list_append(if_not_exists(messages, :empty_list), :message), lastActivity = :lastActivity, messageCount = if_not_exists(messageCount, :zero) + :one';
      let expressionAttributeValues: any = {
        ':message': [message],
        ':lastActivity': new Date().toISOString(),
        ':empty_list': [],
        ':zero': 0,
        ':one': 1
      };

      // Generate title from first user message
      if (isFirstUserMessage) {
        const title = this.generateSessionTitle(message.content);
        updateExpression += ', title = :title';
        expressionAttributeValues[':title'] = title;
      }

      await this.client.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { sessionId },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues
      }));
    } catch (error) {
      console.error('Failed to add message to session:', error);
      throw new Error(`Failed to add message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add or update a deployed resource
   */
  async addDeployedResource(sessionId: string, resource: Omit<PersistentResourceReference, 'deployedAt'>): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const resourceWithTimestamp = {
        ...resource,
        deployedAt: new Date().toISOString(),
        lastChecked: new Date().toISOString()
      };

      // Update or add resource
      const existingResources = session.deployedResources || [];
      const existingIndex = existingResources.findIndex(
        r => r.name === resource.name && r.namespace === resource.namespace
      );

      let updatedResources;
      if (existingIndex >= 0) {
        updatedResources = [...existingResources];
        updatedResources[existingIndex] = resourceWithTimestamp;
      } else {
        updatedResources = [...existingResources, resourceWithTimestamp];
      }

      await this.client.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { sessionId },
        UpdateExpression: 'SET deployedResources = :resources, lastActivity = :lastActivity, resourceCount = :resourceCount',
        ExpressionAttributeValues: {
          ':resources': updatedResources,
          ':lastActivity': new Date().toISOString(),
          ':resourceCount': updatedResources.length
        }
      }));
    } catch (error) {
      console.error('Failed to add deployed resource:', error);
      throw new Error(`Failed to add resource: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get recent sessions for a user
   */
  async getRecentSessions(userId: string, limit: number = 10): Promise<PersistentSessionContext[]> {
    try {
      const result = await this.client.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'userId = :userId AND isActive = :isActive',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':isActive': true
        },
        Limit: limit
      }));

      const sessions = (result.Items || []) as PersistentSessionContext[];
      
      // Sort by last activity (most recent first)
      return sessions.sort((a, b) => 
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      );
    } catch (error) {
      console.error('Failed to get recent sessions:', error);
      throw new Error(`Failed to get recent sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark a session as inactive (soft delete)
   */
  async deactivateSession(sessionId: string): Promise<void> {
    try {
      await this.client.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { sessionId },
        UpdateExpression: 'SET isActive = :isActive, lastActivity = :lastActivity',
        ExpressionAttributeValues: {
          ':isActive': false,
          ':lastActivity': new Date().toISOString()
        }
      }));
    } catch (error) {
      console.error('Failed to deactivate session:', error);
      throw new Error(`Failed to deactivate session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a session permanently
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.client.send(new DeleteCommand({
        TableName: this.tableName,
        Key: { sessionId }
      }));
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw new Error(`Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update session activity timestamp
   */
  async updateActivity(sessionId: string): Promise<void> {
    try {
      await this.client.send(new UpdateCommand({
        TableName: this.tableName,
        Key: { sessionId },
        UpdateExpression: 'SET lastActivity = :lastActivity',
        ExpressionAttributeValues: {
          ':lastActivity': new Date().toISOString()
        }
      }));
    } catch (error) {
      console.error('Failed to update session activity:', error);
      // Don't throw error for activity updates to avoid disrupting chat flow
    }
  }

  /**
   * Generate conversation context for AI from stored session
   */
  async generateContextPrompt(sessionId: string): Promise<string> {
    const session = await this.getSession(sessionId);
    if (!session) return '';
    
    const resources = session.deployedResources || [];
    const recentMessages = session.messages.slice(-5); // Last 5 messages for context
    
    let contextPrompt = '';
    
    if (resources.length > 0) {
      contextPrompt += '## Previously Deployed Resources:\n';
      resources.forEach(resource => {
        contextPrompt += `- **${resource.name}** (${resource.type}) in namespace "${resource.namespace}" - Status: ${resource.status}\n`;
      });
      contextPrompt += '\n';
    }
    
    if (recentMessages.length > 0) {
      contextPrompt += '## Recent Conversation:\n';
      recentMessages.forEach(msg => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        contextPrompt += `**${role}**: ${msg.content}\n`;
      });
      contextPrompt += '\n';
    }
    
    if (contextPrompt) {
      contextPrompt += '## Current Request:\n';
      contextPrompt += 'When the user refers to "it", "this", "that", or uses pronouns, refer to the context above. ';
      contextPrompt += 'If they mention a resource name that was previously deployed, use that context.\n\n';
    }
    
    return contextPrompt;
  }

  /**
   * Find resources by partial name for context resolution
   */
  async findResourcesByName(sessionId: string, partialName: string): Promise<PersistentResourceReference[]> {
    const session = await this.getSession(sessionId);
    if (!session) return [];
    
    const resources = session.deployedResources || [];
    const lowerQuery = partialName.toLowerCase();
    
    return resources.filter(resource => 
      resource.name.toLowerCase().includes(lowerQuery) ||
      resource.type.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get the most recently deployed resource of a type
   */
  async getRecentResource(sessionId: string, type?: string): Promise<PersistentResourceReference | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    
    const resources = session.deployedResources || [];
    
    let filtered = resources;
    if (type) {
      filtered = resources.filter(r => r.type.toLowerCase() === type.toLowerCase());
    }
    
    if (filtered.length === 0) return null;
    
    // Sort by deployment time and return most recent
    return filtered.sort((a, b) => 
      new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime()
    )[0];
  }

  /**
   * Generate a user-friendly session title from the first message
   */
  private generateSessionTitle(firstMessage: string): string {
    // Extract key actions/resources for title
    const message = firstMessage.toLowerCase();
    
    if (message.includes('deploy')) {
      const match = message.match(/deploy\s+(\w+)/);
      return match ? `Deploy ${match[1]}` : 'Deployment';
    }
    
    if (message.includes('scale')) {
      const match = message.match(/scale\s+(\w+)/);
      return match ? `Scale ${match[1]}` : 'Scaling';
    }
    
    if (message.includes('status')) {
      const match = message.match(/status.*?(\w+)/);
      return match ? `Status of ${match[1]}` : 'Status Check';
    }
    
    if (message.includes('logs')) {
      const match = message.match(/logs.*?(\w+)/);
      return match ? `Logs for ${match[1]}` : 'Log Review';
    }
    
    // Fallback: Use first few words
    const words = firstMessage.split(' ').slice(0, 4).join(' ');
    return words.length > 30 ? words.substring(0, 30) + '...' : words;
  }

  /**
   * Health check for DynamoDB connection
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; message: string }> {
    try {
      // Simple health check by trying to scan with limit 1
      await this.client.send(new ScanCommand({
        TableName: this.tableName,
        Limit: 1
      }));
      
      return {
        status: 'healthy',
        message: 'DynamoDB session store is healthy'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `DynamoDB session store error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Export singleton instance
export const dynamoSessionStore = new DynamoDBSessionStore();