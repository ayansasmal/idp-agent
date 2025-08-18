/**
 * Session Manager for handling conversation context and memory
 */

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: any;
}

export interface SessionContext {
  sessionId: string;
  userId: string;
  messages: ConversationMessage[];
  deployedResources: ResourceReference[];
  lastActivity: string;
  environment: string;
  permissions: string[];
}

export interface ResourceReference {
  name: string;
  type: string;
  namespace: string;
  status: string;
  deployedAt: string;
  lastChecked?: string;
}

class SessionManager {
  private sessions: Map<string, SessionContext> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  /**
   * Get or create a session
   */
  getSession(sessionId: string, userId: string = 'web-user'): SessionContext {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      session = {
        sessionId,
        userId,
        messages: [],
        deployedResources: [],
        lastActivity: new Date().toISOString(),
        environment: 'development',
        permissions: ['read', 'write', 'deploy']
      };
      this.sessions.set(sessionId, session);
    } else {
      session.lastActivity = new Date().toISOString();
    }
    
    return session;
  }

  /**
   * Add a message to the conversation history
   */
  addMessage(sessionId: string, message: ConversationMessage): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.lastActivity = new Date().toISOString();
      
      // Keep only last 50 messages to prevent memory bloat
      if (session.messages.length > 50) {
        session.messages = session.messages.slice(-50);
      }
    }
  }

  /**
   * Get conversation history for context
   */
  getConversationHistory(sessionId: string, limit: number = 10): ConversationMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    
    // Return last N messages for context
    return session.messages.slice(-limit);
  }

  /**
   * Add or update a deployed resource reference
   */
  addDeployedResource(sessionId: string, resource: Omit<ResourceReference, 'deployedAt'>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const existingIndex = session.deployedResources.findIndex(
        r => r.name === resource.name && r.namespace === resource.namespace
      );
      
      const resourceWithTimestamp = {
        ...resource,
        deployedAt: new Date().toISOString(),
        lastChecked: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        session.deployedResources[existingIndex] = resourceWithTimestamp;
      } else {
        session.deployedResources.push(resourceWithTimestamp);
      }
      
      session.lastActivity = new Date().toISOString();
    }
  }

  /**
   * Get deployed resources for context resolution
   */
  getDeployedResources(sessionId: string): ResourceReference[] {
    const session = this.sessions.get(sessionId);
    return session?.deployedResources || [];
  }

  /**
   * Find resources by partial name for context resolution
   */
  findResourcesByName(sessionId: string, partialName: string): ResourceReference[] {
    const resources = this.getDeployedResources(sessionId);
    const lowerQuery = partialName.toLowerCase();
    
    return resources.filter(resource => 
      resource.name.toLowerCase().includes(lowerQuery) ||
      resource.type.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get the most recently deployed resource of a type
   */
  getRecentResource(sessionId: string, type?: string): ResourceReference | null {
    const resources = this.getDeployedResources(sessionId);
    
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
   * Cleanup expired sessions
   */
  cleanup(): void {
    const now = Date.now();
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivity = new Date(session.lastActivity).getTime();
      if (now - lastActivity > this.SESSION_TIMEOUT) {
        expiredSessions.push(sessionId);
      }
    }
    
    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId);
    });
  }

  /**
   * Generate conversation context for AI
   */
  generateContextPrompt(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '';
    
    const resources = session.deployedResources;
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
   * Get session statistics
   */
  getStats(): { activeSessions: number; totalMessages: number; totalResources: number } {
    let totalMessages = 0;
    let totalResources = 0;
    
    for (const session of this.sessions.values()) {
      totalMessages += session.messages.length;
      totalResources += session.deployedResources.length;
    }
    
    return {
      activeSessions: this.sessions.size,
      totalMessages,
      totalResources
    };
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  sessionManager.cleanup();
}, 5 * 60 * 1000);