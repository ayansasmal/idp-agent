import { createLogger, type Logger } from '@ai-idp/utils';
import { z } from 'zod';
import axios, { type AxiosInstance } from 'axios';
import type { ObservabilityAgentConfig } from '../agent/ObservabilityAgent';
import type { ConversationContext, AgentResponse } from '@ai-idp/types';

/**
 * Prometheus query result interface
 */
interface PrometheusQueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value?: [number, string];
      values?: Array<[number, string]>;
    }>;
  };
}

/**
 * Monitoring Operations for Observability Agent
 * 
 * Handles integration with Prometheus for metrics collection,
 * Grafana for dashboard management, and other monitoring tools.
 * Works with SLM for intelligent query generation and analysis.
 * 
 * @class MonitoringOperations
 * @since 1.0.0
 */
export class MonitoringOperations {
  private config: ObservabilityAgentConfig;
  private logger: Logger;
  private prometheusClient: AxiosInstance | null = null;
  private grafanaClient: AxiosInstance | null = null;

  constructor(config: ObservabilityAgentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'MonitoringOperations' });
  }

  /**
   * Initialize monitoring clients and connections
   */
  async initialize(): Promise<void> {
    try {
      // Initialize Prometheus client
      if (this.config.prometheus) {
        this.prometheusClient = axios.create({
          baseURL: this.config.prometheus.url,
          timeout: this.config.prometheus.timeout || 30000,
          auth: this.config.prometheus.auth
        });
        
        this.logger.info({ url: this.config.prometheus.url }, 'Prometheus client initialized');
      }

      // Initialize Grafana client
      if (this.config.grafana) {
        this.grafanaClient = axios.create({
          baseURL: this.config.grafana.url,
          timeout: this.config.grafana.timeout || 30000,
          headers: {
            'Authorization': `Bearer ${this.config.grafana.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        this.logger.info({ url: this.config.grafana.url }, 'Grafana client initialized');
      }

      this.logger.info('Monitoring operations initialized');
    } catch (error) {
      this.logger.error(error, 'Failed to initialize monitoring operations');
      throw error;
    }
  }

  /**
   * Execute Prometheus query
   */
  async executePrometheusQuery(
    query: string, 
    time?: string,
    start?: string,
    end?: string,
    step?: string
  ): Promise<PrometheusQueryResult> {
    if (!this.prometheusClient) {
      throw new Error('Prometheus client not initialized');
    }

    try {
      const params: any = { query };
      
      if (time) params.time = time;
      if (start && end) {
        params.start = start;
        params.end = end;
        if (step) params.step = step;
      }
      
      const endpoint = (start && end) ? '/api/v1/query_range' : '/api/v1/query';
      const response = await this.prometheusClient.get(endpoint, { params });
      
      this.logger.debug({ query, endpoint }, 'Prometheus query executed');
      return response.data;
    } catch (error) {
      this.logger.error({ query, error: error.message }, 'Prometheus query failed');
      throw error;
    }
  }

  /**
   * Get Prometheus metrics metadata
   */
  async getMetricsMetadata(): Promise<Record<string, any>> {
    if (!this.prometheusClient) {
      throw new Error('Prometheus client not initialized');
    }

    try {
      const response = await this.prometheusClient.get('/api/v1/metadata');
      return response.data;
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to get metrics metadata');
      throw error;
    }
  }

  /**
   * Get Prometheus targets status
   */
  async getTargetsStatus(): Promise<any> {
    if (!this.prometheusClient) {
      throw new Error('Prometheus client not initialized');
    }

    try {
      const response = await this.prometheusClient.get('/api/v1/targets');
      return response.data;
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to get targets status');
      throw error;
    }
  }

  /**
   * Create Grafana dashboard
   */
  async createGrafanaDashboard(dashboard: any): Promise<any> {
    if (!this.grafanaClient) {
      throw new Error('Grafana client not initialized');
    }

    try {
      const response = await this.grafanaClient.post('/api/dashboards/db', {
        dashboard,
        overwrite: false
      });
      
      this.logger.info({ dashboardId: response.data.id }, 'Grafana dashboard created');
      return response.data;
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to create Grafana dashboard');
      throw error;
    }
  }

  /**
   * Search Grafana dashboards
   */
  async searchGrafanaDashboards(query?: string): Promise<any[]> {
    if (!this.grafanaClient) {
      throw new Error('Grafana client not initialized');
    }

    try {
      const params = query ? { query } : {};
      const response = await this.grafanaClient.get('/api/search', { params });
      return response.data;
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to search Grafana dashboards');
      throw error;
    }
  }

  /**
   * Health check for monitoring services
   */
  async healthCheck(): Promise<boolean> {
    try {
      const checks: boolean[] = [];

      // Check Prometheus
      if (this.prometheusClient) {
        try {
          await this.prometheusClient.get('/api/v1/status/flags');
          checks.push(true);
          this.logger.debug('Prometheus health check passed');
        } catch (error) {
          checks.push(false);
          this.logger.warn({ error: error.message }, 'Prometheus health check failed');
        }
      }

      // Check Grafana
      if (this.grafanaClient) {
        try {
          await this.grafanaClient.get('/api/health');
          checks.push(true);
          this.logger.debug('Grafana health check passed');
        } catch (error) {
          checks.push(false);
          this.logger.warn({ error: error.message }, 'Grafana health check failed');
        }
      }

      return checks.length === 0 || checks.some(check => check);
    } catch (error) {
      this.logger.error({ error: error.message }, 'Monitoring health check failed');
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up monitoring operations');
    // Cleanup any persistent connections or resources if needed
  }
}