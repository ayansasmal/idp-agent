/**
 * Session Manager for handling conversation context and memory
 * Now uses DynamoDB for persistent storage across sessions
 */

import { 
  dynamoSessionStore, 
  PersistentSessionContext, 
  PersistentConversationMessage, 
  PersistentResourceReference 
} from './dynamodb-session-store';

// Export types for compatibility
export type ConversationMessage = PersistentConversationMessage;
export type ResourceReference = PersistentResourceReference;
export type SessionContext = PersistentSessionContext;

class SessionManager {
  private store = dynamoSessionStore;
  private readonly SESSION_TIMEOUT = 30 * 24 * 60 * 60 * 1000; // 30 days for persistent sessions

  /**
   * Get or create a session
   */
  async getSession(sessionId: string, userId: string = 'web-user'): Promise<SessionContext> {
    try {
      let session = await this.store.getSession(sessionId);
      
      if (!session) {
        session = {
          sessionId,
          userId,
          title: 'New Chat',
          messages: [],
          deployedResources: [],
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          environment: 'development',
          permissions: ['read', 'write', 'deploy'],
          isActive: true,
          messageCount: 0,
          resourceCount: 0
        };
        await this.store.saveSession(session);
      } else {
        // Update activity timestamp
        await this.store.updateActivity(sessionId);
      }
      
      return session;
    } catch (error) {
      console.error('Failed to get/create session:', error);
      // Fallback to in-memory session for this request
      return {
        sessionId,
        userId,
        title: 'Temporary Chat',
        messages: [],
        deployedResources: [],
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        environment: 'development',
        permissions: ['read', 'write', 'deploy'],
        isActive: true,
        messageCount: 0,
        resourceCount: 0
      };
    }
  }

  /**
   * Add a message to the conversation history
   */
  async addMessage(sessionId: string, message: ConversationMessage): Promise<void> {
    try {
      await this.store.addMessage(sessionId, message);
    } catch (error) {
      console.error('Failed to add message to session:', error);
      // Continue without throwing to avoid disrupting chat flow
    }
  }

  /**
   * Get conversation history for context
   */
  async getConversationHistory(sessionId: string, limit: number = 10): Promise<ConversationMessage[]> {
    try {
      const session = await this.store.getSession(sessionId);
      if (!session) return [];
      
      // Return last N messages for context
      return session.messages.slice(-limit);
    } catch (error) {
      console.error('Failed to get conversation history:', error);
      return [];
    }
  }

  /**
   * Add or update a deployed resource reference
   */
  async addDeployedResource(sessionId: string, resource: Omit<ResourceReference, 'deployedAt'>): Promise<void> {
    try {
      await this.store.addDeployedResource(sessionId, resource);
    } catch (error) {
      console.error('Failed to add deployed resource:', error);
      // Continue without throwing to avoid disrupting operations
    }
  }

  /**
   * Get deployed resources for context resolution
   */
  async getDeployedResources(sessionId: string): Promise<ResourceReference[]> {
    try {
      const session = await this.store.getSession(sessionId);
      return session?.deployedResources || [];
    } catch (error) {
      console.error('Failed to get deployed resources:', error);
      return [];
    }
  }

  /**
   * Find resources by partial name for context resolution
   */
  async findResourcesByName(sessionId: string, partialName: string): Promise<ResourceReference[]> {
    try {
      return await this.store.findResourcesByName(sessionId, partialName);
    } catch (error) {
      console.error('Failed to find resources by name:', error);
      return [];
    }
  }

  /**
   * Get the most recently deployed resource of a type
   */
  async getRecentResource(sessionId: string, type?: string): Promise<ResourceReference | null> {
    try {
      return await this.store.getRecentResource(sessionId, type);
    } catch (error) {
      console.error('Failed to get recent resource:', error);
      return null;
    }
  }

  /**
   * Generate conversation context for AI
   */
  async generateContextPrompt(sessionId: string): Promise<string> {
    try {
      return await this.store.generateContextPrompt(sessionId);
    } catch (error) {
      console.error('Failed to generate context prompt:', error);
      return '';
    }
  }

  /**
   * Get recent sessions for a user
   */
  async getRecentSessions(userId: string, limit: number = 10): Promise<SessionContext[]> {
    try {
      return await this.store.getRecentSessions(userId, limit);
    } catch (error) {
      console.error('Failed to get recent sessions:', error);
      return [];
    }
  }

  /**
   * Deactivate a session (soft delete)
   */
  async deactivateSession(sessionId: string): Promise<void> {
    try {
      await this.store.deactivateSession(sessionId);
    } catch (error) {
      console.error('Failed to deactivate session:', error);
      throw error;
    }
  }

  /**
   * Delete a session permanently
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.store.deleteSession(sessionId);
    } catch (error) {
      console.error('Failed to delete session:', error);
      throw error;
    }
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{ activeSessions: number; totalMessages: number; totalResources: number }> {
    // This would require additional queries in a real implementation
    // For now, return basic stats
    return {
      activeSessions: 0, // Would need to scan all sessions
      totalMessages: 0, // Would need to sum all message counts
      totalResources: 0 // Would need to sum all resource counts
    };
  }

  /**
   * Health check for the session store
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; message: string }> {
    try {
      return await this.store.healthCheck();
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Session store health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();

// Note: DynamoDB TTL handles automatic cleanup of expired sessions