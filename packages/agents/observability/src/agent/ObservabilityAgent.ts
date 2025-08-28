import { QdrantContextClient } from '@ai-idp/qdrant-client';
import { createLogger, validateData, type Logger } from '@ai-idp/utils';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Ollama } from 'ollama';
import { OpenAI } from 'openai';
import type {
  AgentCapabilities,
  ToolDefinition,
  ConversationContext,
  AgentResponse
} from '@ai-idp/types';
import { MonitoringOperations } from '../monitoring/MonitoringOperations';
import { IncidentManagement } from '../incident/IncidentManagement';
import { MetricsAnalysis } from '../metrics/MetricsAnalysis';
import { LoggingOperations } from '../logging/LoggingOperations';

/**
 * Configuration interface for Observability Agent
 * 
 * Defines configuration for the Observability Agent including SLM settings,
 * observability tool connections (Prometheus, Grafana, AlertManager), and
 * vector database integration for pattern recognition and incident history.
 * 
 * @interface ObservabilityAgentConfig
 * @since 1.0.0
 */
export interface ObservabilityAgentConfig {
  /** Unique agent identifier within the AI-IDP system */
  agentId: string;

  /** Human-readable agent name */
  name: string;

  /** Small Language Model configuration for intelligent observability operations */
  slm: {
    /** SLM provider (ollama or openai) */
    provider: 'ollama' | 'openai';
    /** Model name (e.g., 'llama3.2', 'gpt-4o-mini') */
    model: string;
    /** Base URL for Ollama (if using ollama provider) */
    baseUrl?: string;
    /** API key for OpenAI (if using openai provider) */
    apiKey?: string;
    /** Maximum tokens for SLM responses */
    maxTokens?: number;
    /** Temperature for response creativity (0.0-1.0) */
    temperature?: number;
  };

  /** Prometheus configuration for metrics collection */
  prometheus?: {
    /** Prometheus server URL */
    url: string;
    /** Optional basic auth credentials */
    auth?: {
      username: string;
      password: string;
    };
    /** Request timeout in milliseconds */
    timeout?: number;
  };

  /** Grafana configuration for dashboard management */
  grafana?: {
    /** Grafana server URL */
    url: string;
    /** Grafana API key */
    apiKey: string;
    /** Request timeout in milliseconds */
    timeout?: number;
  };

  /** AlertManager configuration for alert management */
  alertManager?: {
    /** AlertManager server URL */
    url: string;
    /** Request timeout in milliseconds */
    timeout?: number;
  };

  /** Elasticsearch configuration for log analysis */
  elasticsearch?: {
    /** Elasticsearch cluster URL */
    url: string;
    /** Optional authentication */
    auth?: {
      username: string;
      password: string;
    };
    /** Default index pattern for log queries */
    indexPattern?: string;
  };

  /** Optional Qdrant vector database configuration for pattern recognition */
  qdrant?: {
    /** Qdrant cluster URL */
    url: string;
    /** Qdrant API key for authentication */
    apiKey?: string;
    /** Collection name for observability context storage */
    collectionName: string;
    /** Vector dimension size for embeddings */
    vectorSize?: number;
    /** Request timeout in milliseconds */
    timeout?: number;
  };
}

/**
 * Observability Agent - SLM-Powered Monitoring and Incident Management
 * 
 * The ObservabilityAgent serves as a specialized focused agent that uses Small Language Models
 * to provide intelligent observability capabilities including:
 * 
 * - **Intelligent Monitoring**: SLM-powered analysis of metrics, logs, and traces
 * - **Alert Analysis**: Pattern recognition and correlation of alerts across systems
 * - **Incident Management**: Automated incident detection, classification, and response
 * - **Query Generation**: Intelligent PromQL, LogQL, and dashboard query generation
 * - **Root Cause Analysis**: SLM-assisted problem diagnosis and solution recommendations
 * - **Pattern Recognition**: Historical incident analysis and predictive alerting
 * 
 * Unlike the Meta-Agent which uses full LLMs for orchestration, this agent uses smaller,
 * cost-effective models optimized for observability domain tasks while maintaining
 * intelligent decision-making capabilities.
 * 
 * @class ObservabilityAgent
 * @since 1.0.0
 * @version 1.0.0
 * 
 * @example Basic Usage
 * ```typescript
 * const config: ObservabilityAgentConfig = {
 *   agentId: 'observability',
 *   name: 'Observability Agent',
 *   slm: {
 *     provider: 'ollama',
 *     model: 'llama3.2:3b',
 *     baseUrl: 'http://localhost:11434'
 *   },
 *   prometheus: {
 *     url: 'http://localhost:9090'
 *   }
 * };
 * 
 * const agent = new ObservabilityAgent(config, logger);
 * await agent.initialize();
 * 
 * // Analyze metrics with SLM assistance
 * const analysis = await agent.analyzeMetrics({
 *   query: 'cpu_usage_percentage > 80',
 *   duration: '5m',
 *   context
 * });
 * ```
 * 
 * @example Incident Management
 * ```typescript
 * // SLM-powered incident analysis
 * const incident = await agent.analyzeIncident({
 *   alertId: 'high-cpu-alert-123',
 *   symptoms: ['High CPU usage', 'Slow response times'],
 *   context
 * });
 * 
 * console.log(incident.rootCause); // "Memory leak in payment service causing CPU spike"
 * console.log(incident.recommendations); // ["Restart payment pods", "Scale replicas to 5"]
 * ```
 */
export class ObservabilityAgent {
  private config: ObservabilityAgentConfig;
  private logger: Logger;
  private slmClient: Ollama | OpenAI | null = null;
  private contextClient: QdrantContextClient | null = null;
  
  // Operations modules
  private monitoring: MonitoringOperations;
  private incident: IncidentManagement;
  private metrics: MetricsAnalysis;
  private logging: LoggingOperations;

  constructor(config: ObservabilityAgentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'ObservabilityAgent' });
    
    // Initialize operations modules
    this.monitoring = new MonitoringOperations(config, this.logger);
    this.incident = new IncidentManagement(config, this.logger);
    this.metrics = new MetricsAnalysis(config, this.logger);
    this.logging = new LoggingOperations(config, this.logger);
  }

  /**
   * Initialize the Observability Agent
   * Sets up SLM client, vector database connection, and validates observability tool connections
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info({ agentId: this.config.agentId }, 'Initializing Observability Agent');

      // Initialize SLM client
      await this.initializeSLM();

      // Initialize vector database if configured
      if (this.config.qdrant) {
        this.contextClient = new QdrantContextClient(this.config.qdrant, this.logger);
        await this.contextClient.initialize();
      }

      // Initialize operations modules
      await this.monitoring.initialize();
      await this.incident.initialize();
      await this.metrics.initialize();
      await this.logging.initialize();

      this.logger.info({ agentId: this.config.agentId }, 'Observability Agent initialized successfully');
    } catch (error) {
      this.logger.error(error, 'Failed to initialize Observability Agent');
      throw error;
    }
  }

  /**
   * Initialize Small Language Model client based on configuration
   * @private
   */
  private async initializeSLM(): Promise<void> {
    const { slm } = this.config;
    
    try {
      if (slm.provider === 'ollama') {
        this.slmClient = new Ollama({
          host: slm.baseUrl || 'http://localhost:11434'
        });
        
        // Test Ollama connection and model availability
        const models = await this.slmClient.list();
        const modelExists = models.models.some(m => m.name === slm.model);
        
        if (!modelExists) {
          this.logger.warn({ model: slm.model }, 'SLM model not found, pulling from Ollama');
          await this.slmClient.pull({ model: slm.model });
        }
        
        this.logger.info({ 
          provider: slm.provider, 
          model: slm.model,
          baseUrl: slm.baseUrl 
        }, 'Ollama SLM client initialized');
        
      } else if (slm.provider === 'openai') {
        if (!slm.apiKey) {
          throw new Error('OpenAI API key required for openai SLM provider');
        }
        
        this.slmClient = new OpenAI({
          apiKey: slm.apiKey
        });
        
        this.logger.info({ 
          provider: slm.provider, 
          model: slm.model 
        }, 'OpenAI SLM client initialized');
      } else {
        throw new Error(`Unsupported SLM provider: ${slm.provider}`);
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to initialize SLM client');
      throw error;
    }
  }

  /**
   * Get agent capabilities and available tools
   */
  getCapabilities(): AgentCapabilities {
    return {
      agentId: this.config.agentId,
      name: this.config.name,
      description: 'SLM-powered observability agent for monitoring, incident management, and analytics',
      version: '1.0.0',
      specializations: [
        'monitoring',
        'incident-management', 
        'metrics-analysis',
        'log-analysis',
        'alerting',
        'dashboards',
        'root-cause-analysis'
      ],
      tools: this.getToolDefinitions(),
      endpoints: {
        health: `http://localhost:${process.env.OBSERVABILITY_AGENT_PORT || 3004}/health`,
        mcp: `http://localhost:${process.env.OBSERVABILITY_AGENT_PORT || 3004}/mcp`,
        capabilities: `http://localhost:${process.env.OBSERVABILITY_AGENT_PORT || 3004}/capabilities`
      }
    };
  }

  /**
   * Get tool definitions for all available observability operations
   * @private
   */
  private getToolDefinitions(): ToolDefinition[] {
    return [
      // Metrics Analysis Tools
      {
        name: 'analyzeMetrics',
        description: 'Analyze metrics using SLM-powered pattern recognition and anomaly detection',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'PromQL query or metric pattern' },
            duration: { type: 'string', description: 'Time range (e.g., "5m", "1h", "1d")' },
            threshold: { type: 'number', description: 'Anomaly detection threshold' },
            context: { type: 'object', description: 'Conversation context' }
          },
          required: ['query', 'duration', 'context']
        }
      },
      
      // Incident Management Tools
      {
        name: 'analyzeIncident',
        description: 'Perform SLM-powered incident analysis and root cause identification',
        parameters: {
          type: 'object',
          properties: {
            alertId: { type: 'string', description: 'Alert or incident identifier' },
            symptoms: { type: 'array', items: { type: 'string' }, description: 'Observed symptoms' },
            timeRange: { type: 'string', description: 'Incident time window' },
            context: { type: 'object', description: 'Conversation context' }
          },
          required: ['alertId', 'symptoms', 'context']
        }
      },
      
      // Log Analysis Tools
      {
        name: 'analyzeLogs',
        description: 'Intelligent log analysis with SLM-powered pattern recognition',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Log search query or pattern' },
            timeRange: { type: 'string', description: 'Log search time range' },
            logLevel: { type: 'string', description: 'Log level filter (error, warn, info, debug)' },
            service: { type: 'string', description: 'Service or component filter' },
            context: { type: 'object', description: 'Conversation context' }
          },
          required: ['query', 'timeRange', 'context']
        }
      },
      
      // Dashboard Management Tools
      {
        name: 'createDashboard',
        description: 'Generate intelligent dashboards based on SLM analysis of requirements',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Dashboard name' },
            description: { type: 'string', description: 'Dashboard purpose and scope' },
            services: { type: 'array', items: { type: 'string' }, description: 'Services to monitor' },
            metrics: { type: 'array', items: { type: 'string' }, description: 'Key metrics to display' },
            context: { type: 'object', description: 'Conversation context' }
          },
          required: ['name', 'description', 'context']
        }
      },
      
      // Alert Configuration Tools
      {
        name: 'configureAlerts',
        description: 'Set up intelligent alerting rules with SLM-optimized thresholds',
        parameters: {
          type: 'object',
          properties: {
            ruleName: { type: 'string', description: 'Alert rule name' },
            condition: { type: 'string', description: 'Alert condition or pattern' },
            severity: { type: 'string', description: 'Alert severity (critical, warning, info)' },
            notification: { type: 'object', description: 'Notification configuration' },
            context: { type: 'object', description: 'Conversation context' }
          },
          required: ['ruleName', 'condition', 'severity', 'context']
        }
      }
    ];
  }

  // Tool implementation methods will be added next...
  // (analyzeMetrics, analyzeIncident, analyzeLogs, createDashboard, configureAlerts)

  /**
   * Health check for the Observability Agent
   */
  async healthCheck(): Promise<{ healthy: boolean; details: Record<string, any> }> {
    const details: Record<string, any> = {
      agent: this.config.agentId,
      slm: { provider: this.config.slm.provider, model: this.config.slm.model }
    };

    try {
      // Check SLM connectivity
      if (this.slmClient) {
        if (this.config.slm.provider === 'ollama') {
          const models = await (this.slmClient as Ollama).list();
          details.slm.available = models.models.length > 0;
        } else {
          details.slm.available = true; // OpenAI client doesn't have a simple health check
        }
      }

      // Check observability tools connectivity
      details.tools = {
        prometheus: await this.monitoring.healthCheck(),
        grafana: await this.monitoring.healthCheck(), // Will implement specific health checks
        alertManager: await this.incident.healthCheck(),
        elasticsearch: await this.logging.healthCheck()
      };

      // Check vector database
      if (this.contextClient) {
        details.qdrant = await this.contextClient.healthCheck();
      }

      const allHealthy = Object.values(details).every(check => 
        typeof check === 'object' ? Object.values(check).every(v => v !== false) : check !== false
      );

      return { healthy: allHealthy, details };
    } catch (error) {
      this.logger.error(error, 'Health check failed');
      return { 
        healthy: false, 
        details: { ...details, error: error.message } 
      };
    }
  }

  /**
   * Cleanup resources and connections
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up Observability Agent');
    
    try {
      if (this.contextClient) {
        await this.contextClient.cleanup();
      }
      
      // Cleanup operation modules
      await Promise.all([
        this.monitoring.cleanup(),
        this.incident.cleanup(), 
        this.metrics.cleanup(),
        this.logging.cleanup()
      ]);
      
      this.logger.info('Observability Agent cleanup completed');
    } catch (error) {
      this.logger.error(error, 'Error during cleanup');
    }
  }
}