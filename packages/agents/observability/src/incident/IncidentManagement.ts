import { createLogger, type Logger } from '@ai-idp/utils';
import axios, { type AxiosInstance } from 'axios';
import type { ObservabilityAgentConfig } from '../agent/ObservabilityAgent';
import type { ConversationContext, AgentResponse } from '@ai-idp/types';

/**
 * Incident Management Operations for Observability Agent
 * 
 * Handles AlertManager integration, incident correlation,
 * and SLM-powered root cause analysis.
 * 
 * @class IncidentManagement
 * @since 1.0.0
 */
export class IncidentManagement {
  private config: ObservabilityAgentConfig;
  private logger: Logger;
  private alertManagerClient: AxiosInstance | null = null;

  constructor(config: ObservabilityAgentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'IncidentManagement' });
  }

  async initialize(): Promise<void> {
    if (this.config.alertManager) {
      this.alertManagerClient = axios.create({
        baseURL: this.config.alertManager.url,
        timeout: this.config.alertManager.timeout || 30000
      });
      this.logger.info({ url: this.config.alertManager.url }, 'AlertManager client initialized');
    }
    this.logger.info('Incident management initialized');
  }

  async getAlerts(): Promise<any[]> {
    if (!this.alertManagerClient) {
      throw new Error('AlertManager client not initialized');
    }
    
    const response = await this.alertManagerClient.get('/api/v1/alerts');
    return response.data;
  }

  async healthCheck(): Promise<boolean> {
    if (this.alertManagerClient) {
      try {
        await this.alertManagerClient.get('/api/v1/status');
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up incident management');
  }
}