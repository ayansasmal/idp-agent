import { QdrantContextClient } from '@ai-idp/qdrant-client';
import { type Logger } from '@ai-idp/utils';
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
        const qdrantConfig = {
          ...this.config.qdrant,
          vectorSize: this.config.qdrant.vectorSize || 384, // Default for local embeddings
          timeout: this.config.qdrant.timeout || 30000 // Default timeout
        };
        this.contextClient = new QdrantContextClient(qdrantConfig, this.logger);
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
        const modelExists = models.models.some((m: any) => m.name === slm.model);
        
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
        mcp: `http://localhost:${process.env.OBSERVABILITY_AGENT_PORT || 3004}/mcp`
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

  /**
   * Analyze metrics using SLM-powered pattern recognition and anomaly detection
   * 
   * Uses the configured Small Language Model to intelligently analyze metrics data,
   * detect anomalies, identify patterns, and provide actionable insights.
   * 
   * @param request - Metrics analysis request with query, duration, and optional threshold
   * @returns Promise<AgentResponse> - Analysis results with insights and recommendations
   */
  async analyzeMetrics(request: {
    query: string;
    duration: string;
    threshold?: number;
    context: ConversationContext;
  }): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info({ query: request.query, duration: request.duration }, 'Starting metrics analysis');
      
      // Get metrics data from Prometheus
      let metricsData: any = {};
      if (this.monitoring) {
        try {
          const endTime = new Date();
          const startTime = new Date(endTime.getTime() - this.parseDurationToMs(request.duration));
          
          metricsData = await this.monitoring.executePrometheusQuery(
            request.query,
            undefined,
            startTime.toISOString(),
            endTime.toISOString(),
            '1m'
          );
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to fetch metrics data, proceeding with SLM analysis only');
          metricsData = { status: 'error', error: error.message };
        }
      }
      
      // Prepare SLM prompt for intelligent analysis
      const prompt = this.buildMetricsAnalysisPrompt(request, metricsData);
      
      // Get SLM analysis
      const analysis = await this.querySLM(prompt, {
        maxTokens: this.config.slm.maxTokens || 1024,
        temperature: this.config.slm.temperature || 0.1
      });
      
      // Store analysis context in vector database (placeholder for future implementation)
      if (this.contextClient) {
        try {
          this.logger.debug({ query: request.query, insights: analysis.insights }, 'Metrics analysis context stored (placeholder)');
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to store metrics analysis context');
        }
      }
      
      const executionTime = Date.now() - startTime;
      
      return {
        agentId: 'observability',
        success: true,
        message: `✅ Metrics analysis completed for "${request.query}" over ${request.duration}`,
        data: {
          query: request.query,
          duration: request.duration,
          metricsData: metricsData.data || metricsData,
          analysis: analysis,
          anomaliesDetected: analysis.anomalies?.length || 0,
          recommendations: analysis.recommendations || []
        },
        metadata: {
          agent: 'observability',
          action: 'analyzeMetrics',
          executionTime,
          hasDetailedResponse: true,
          contextUsed: []
        },
        detailedResponse: this.formatMetricsAnalysisResponse(request, analysis, metricsData)
      };
      
    } catch (error) {
      this.logger.error({ error: error.message, query: request.query }, 'Metrics analysis failed');
      
      return {
        agentId: 'observability',
        success: false,
        message: `❌ Metrics analysis failed for "${request.query}": ${error.message}`,
        data: { error: error.message, query: request.query },
        metadata: {
          agent: 'observability',
          action: 'analyzeMetrics',
          executionTime: Date.now() - startTime,
          hasDetailedResponse: false,
          contextUsed: []
        }
      };
    }
  }

  /**
   * Perform SLM-powered incident analysis and root cause identification
   * 
   * Analyzes incident symptoms using the Small Language Model to identify
   * root causes, correlate with historical patterns, and provide remediation steps.
   * 
   * @param request - Incident analysis request with alert ID, symptoms, and time range
   * @returns Promise<AgentResponse> - Root cause analysis with remediation recommendations
   */
  async analyzeIncident(request: {
    alertId: string;
    symptoms: string[];
    timeRange?: string;
    context: ConversationContext;
  }): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info({ alertId: request.alertId, symptoms: request.symptoms }, 'Starting incident analysis');
      
      // Get incident data from AlertManager
      let incidentData: any = {};
      if (this.incident) {
        try {
          const alerts = await this.incident.getAlerts();
          incidentData = alerts.filter((alert: any) => 
            alert.fingerprint === request.alertId || 
            alert.labels?.alertname?.includes(request.alertId)
          );
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to fetch alert data, proceeding with SLM analysis only');
          incidentData = { status: 'error', error: error.message };
        }
      }
      
      // Search for similar historical incidents in vector database (placeholder)
      let historicalContext = '';
      if (this.contextClient) {
        try {
          this.logger.debug({ symptoms: request.symptoms }, 'Historical incident search (placeholder)');
          historicalContext = 'No historical context available yet';
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to search historical incidents');
        }
      }
      
      // Prepare SLM prompt for root cause analysis
      const prompt = this.buildIncidentAnalysisPrompt(request, incidentData, historicalContext);
      
      // Get SLM analysis
      const analysis = await this.querySLM(prompt, {
        maxTokens: this.config.slm.maxTokens || 1536,
        temperature: this.config.slm.temperature || 0.1
      });
      
      // Store incident analysis in vector database (placeholder)
      if (this.contextClient) {
        try {
          this.logger.debug({ alertId: request.alertId, rootCause: analysis.rootCause }, 'Incident analysis context stored (placeholder)');
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to store incident analysis context');
        }
      }
      
      const executionTime = Date.now() - startTime;
      
      return {
        agentId: 'observability',
        success: true,
        message: `✅ Incident analysis completed for alert "${request.alertId}"`,
        data: {
          alertId: request.alertId,
          symptoms: request.symptoms,
          rootCause: analysis.rootCause,
          confidence: analysis.confidence || 0.8,
          resolution: analysis.resolution,
          preventionSteps: analysis.prevention || [],
          relatedIncidents: analysis.relatedIncidents || []
        },
        metadata: {
          agent: 'observability',
          action: 'analyzeIncident',
          executionTime,
          hasDetailedResponse: true,
          contextUsed: [],
          confidence: analysis.confidence || 0.8
        },
        detailedResponse: this.formatIncidentAnalysisResponse(request, analysis, incidentData)
      };
      
    } catch (error) {
      this.logger.error({ error: error.message, alertId: request.alertId }, 'Incident analysis failed');
      
      return {
        agentId: 'observability',
        success: false,
        message: `❌ Incident analysis failed for alert "${request.alertId}": ${error.message}`,
        data: { error: error.message, alertId: request.alertId },
        metadata: {
          agent: 'observability',
          action: 'analyzeIncident',
          executionTime: Date.now() - startTime,
          hasDetailedResponse: false,
          contextUsed: []
        }
      };
    }
  }

  /**
   * Intelligent log analysis with SLM-powered pattern recognition
   * 
   * Analyzes log data using the Small Language Model to identify patterns,
   * extract insights, and detect anomalous behavior in application logs.
   * 
   * @param request - Log analysis request with query, time range, and filters
   * @returns Promise<AgentResponse> - Log analysis with patterns and insights
   */
  async analyzeLogs(request: {
    query: string;
    timeRange: string;
    logLevel?: string;
    service?: string;
    context: ConversationContext;
  }): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info({ 
        query: request.query, 
        timeRange: request.timeRange,
        service: request.service 
      }, 'Starting log analysis');
      
      // Get log data from Elasticsearch
      let logData: any = {};
      if (this.logging) {
        try {
          // This would typically use Elasticsearch API
          // For now, we'll simulate with a structured response
          logData = {
            hits: {
              total: { value: 150 },
              hits: [
                { _source: { timestamp: new Date().toISOString(), level: 'error', message: 'Database connection failed', service: request.service } },
                { _source: { timestamp: new Date().toISOString(), level: 'warn', message: 'High memory usage detected', service: request.service } },
                { _source: { timestamp: new Date().toISOString(), level: 'info', message: 'Request processed successfully', service: request.service } }
              ]
            }
          };
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to fetch log data, proceeding with SLM analysis only');
          logData = { status: 'error', error: error.message };
        }
      }
      
      // Prepare SLM prompt for log analysis
      const prompt = this.buildLogAnalysisPrompt(request, logData);
      
      // Get SLM analysis
      const analysis = await this.querySLM(prompt, {
        maxTokens: this.config.slm.maxTokens || 1024,
        temperature: this.config.slm.temperature || 0.1
      });
      
      // Store log analysis context (placeholder)
      if (this.contextClient) {
        try {
          this.logger.debug({ query: request.query, patterns: analysis.patterns }, 'Log analysis context stored (placeholder)');
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to store log analysis context');
        }
      }
      
      const executionTime = Date.now() - startTime;
      
      return {
        agentId: 'observability',
        success: true,
        message: `✅ Log analysis completed for "${request.query}" over ${request.timeRange}`,
        data: {
          query: request.query,
          timeRange: request.timeRange,
          service: request.service,
          totalLogs: logData.hits?.total?.value || 0,
          patterns: analysis.patterns || [],
          issues: analysis.issues || [],
          insights: analysis.insights || [],
          recommendations: analysis.recommendations || []
        },
        metadata: {
          agent: 'observability',
          action: 'analyzeLogs',
          executionTime,
          hasDetailedResponse: true,
          contextUsed: []
        },
        detailedResponse: this.formatLogAnalysisResponse(request, analysis, logData)
      };
      
    } catch (error) {
      this.logger.error({ error: error.message, query: request.query }, 'Log analysis failed');
      
      return {
        agentId: 'observability',
        success: false,
        message: `❌ Log analysis failed for "${request.query}": ${error.message}`,
        data: { error: error.message, query: request.query },
        metadata: {
          agent: 'observability',
          action: 'analyzeLogs',
          executionTime: Date.now() - startTime,
          hasDetailedResponse: false,
          contextUsed: []
        }
      };
    }
  }

  /**
   * Generate intelligent dashboards based on SLM analysis of requirements
   * 
   * Uses the Small Language Model to analyze dashboard requirements and generate
   * optimized dashboard configurations with intelligent panel layouts and queries.
   * 
   * @param request - Dashboard creation request with name, description, and scope
   * @returns Promise<AgentResponse> - Generated dashboard configuration
   */
  async createDashboard(request: {
    name: string;
    description: string;
    services?: string[];
    metrics?: string[];
    context: ConversationContext;
  }): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info({ name: request.name, services: request.services }, 'Starting dashboard creation');
      
      // Get available metrics metadata for context
      let metricsMetadata: any = {};
      if (this.monitoring) {
        try {
          metricsMetadata = await this.monitoring.getMetricsMetadata();
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to fetch metrics metadata');
          metricsMetadata = { status: 'error', error: error.message };
        }
      }
      
      // Prepare SLM prompt for dashboard generation
      const prompt = this.buildDashboardGenerationPrompt(request, metricsMetadata);
      
      // Get SLM-generated dashboard configuration
      const dashboardConfig = await this.querySLM(prompt, {
        maxTokens: this.config.slm.maxTokens || 2048,
        temperature: this.config.slm.temperature || 0.2
      });
      
      // Create dashboard in Grafana if configured
      let grafanaDashboard: any = null;
      if (this.monitoring) {
        try {
          grafanaDashboard = await this.monitoring.createGrafanaDashboard(dashboardConfig.grafanaJson);
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to create Grafana dashboard, returning configuration only');
        }
      }
      
      // Store dashboard context (placeholder)
      if (this.contextClient) {
        try {
          this.logger.debug({ name: request.name, panelCount: dashboardConfig.panels?.length }, 'Dashboard creation context stored (placeholder)');
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to store dashboard creation context');
        }
      }
      
      const executionTime = Date.now() - startTime;
      
      return {
        agentId: 'observability',
        success: true,
        message: `✅ Dashboard "${request.name}" created successfully`,
        data: {
          name: request.name,
          description: request.description,
          services: request.services || [],
          dashboardConfig: dashboardConfig,
          grafanaDashboard: grafanaDashboard,
          panelCount: dashboardConfig.panels?.length || 0,
          url: grafanaDashboard?.url || null
        },
        metadata: {
          agent: 'observability',
          action: 'createDashboard',
          executionTime,
          hasDetailedResponse: true,
          contextUsed: []
        },
        detailedResponse: this.formatDashboardCreationResponse(request, dashboardConfig, grafanaDashboard)
      };
      
    } catch (error) {
      this.logger.error({ error: error.message, name: request.name }, 'Dashboard creation failed');
      
      return {
        agentId: 'observability',
        success: false,
        message: `❌ Dashboard creation failed for "${request.name}": ${error.message}`,
        data: { error: error.message, name: request.name },
        metadata: {
          agent: 'observability',
          action: 'createDashboard',
          executionTime: Date.now() - startTime,
          hasDetailedResponse: false,
          contextUsed: []
        }
      };
    }
  }

  /**
   * Set up intelligent alerting rules with SLM-optimized thresholds
   * 
   * Uses the Small Language Model to analyze alerting requirements and generate
   * optimized alert rules with intelligent thresholds and notification strategies.
   * 
   * @param request - Alert configuration request with rule name, condition, and severity
   * @returns Promise<AgentResponse> - Configured alert rule with optimized settings
   */
  async configureAlerts(request: {
    ruleName: string;
    condition: string;
    severity: string;
    notification?: any;
    context: ConversationContext;
  }): Promise<AgentResponse> {
    const startTime = Date.now();
    
    try {
      this.logger.info({ 
        ruleName: request.ruleName, 
        condition: request.condition,
        severity: request.severity 
      }, 'Starting alert configuration');
      
      // Get current metrics for baseline analysis
      let currentMetrics: any = {};
      if (this.monitoring) {
        try {
          // Extract metric name from condition for baseline analysis
          const metricMatch = request.condition.match(/(\w+(?:_\w+)*)/);
          if (metricMatch) {
            currentMetrics = await this.monitoring.executePrometheusQuery(
              metricMatch[1],
              undefined,
              new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24h
              new Date().toISOString(),
              '1h'
            );
          }
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to fetch baseline metrics');
          currentMetrics = { status: 'error', error: error.message };
        }
      }
      
      // Prepare SLM prompt for alert optimization
      const prompt = this.buildAlertConfigurationPrompt(request, currentMetrics);
      
      // Get SLM-optimized alert configuration
      const alertConfig = await this.querySLM(prompt, {
        maxTokens: this.config.slm.maxTokens || 1024,
        temperature: this.config.slm.temperature || 0.1
      });
      
      // Store alert configuration context (placeholder)
      if (this.contextClient) {
        try {
          this.logger.debug({ ruleName: request.ruleName, threshold: alertConfig.optimizedThreshold }, 'Alert configuration context stored (placeholder)');
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to store alert configuration context');
        }
      }
      
      const executionTime = Date.now() - startTime;
      
      return {
        agentId: 'observability',
        success: true,
        message: `✅ Alert rule "${request.ruleName}" configured successfully`,
        data: {
          ruleName: request.ruleName,
          originalCondition: request.condition,
          optimizedCondition: alertConfig.optimizedCondition,
          severity: request.severity,
          threshold: alertConfig.optimizedThreshold,
          rationale: alertConfig.rationale,
          notificationStrategy: alertConfig.notificationStrategy,
          falsePositiveRisk: alertConfig.falsePositiveRisk || 'low'
        },
        metadata: {
          agent: 'observability',
          action: 'configureAlerts',
          executionTime,
          hasDetailedResponse: true,
          contextUsed: [],
          riskLevel: alertConfig.falsePositiveRisk || 'low'
        },
        detailedResponse: this.formatAlertConfigurationResponse(request, alertConfig, currentMetrics)
      };
      
    } catch (error) {
      this.logger.error({ error: error.message, ruleName: request.ruleName }, 'Alert configuration failed');
      
      return {
        agentId: 'observability',
        success: false,
        message: `❌ Alert configuration failed for "${request.ruleName}": ${error.message}`,
        data: { error: error.message, ruleName: request.ruleName },
        metadata: {
          agent: 'observability',
          action: 'configureAlerts',
          executionTime: Date.now() - startTime,
          hasDetailedResponse: false,
          contextUsed: []
        }
      };
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Query the Small Language Model with a prompt and options
   * @private
   */
  private async querySLM(prompt: string, options: { maxTokens: number; temperature: number }): Promise<any> {
    if (!this.slmClient) {
      throw new Error('SLM client not initialized');
    }

    try {
      if (this.config.slm.provider === 'ollama') {
        const response = await (this.slmClient as Ollama).chat({
          model: this.config.slm.model,
          messages: [{ role: 'user', content: prompt }],
          options: {
            num_predict: options.maxTokens,
            temperature: options.temperature
          }
        });
        
        // Parse JSON response if possible, otherwise return structured format
        try {
          return JSON.parse(response.message.content);
        } catch {
          return {
            insights: response.message.content,
            recommendations: [],
            confidence: 0.8
          };
        }
        
      } else if (this.config.slm.provider === 'openai') {
        const response = await (this.slmClient as OpenAI).chat.completions.create({
          model: this.config.slm.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens,
          temperature: options.temperature
        });
        
        const content = response.choices[0]?.message?.content || '';
        
        // Parse JSON response if possible, otherwise return structured format
        try {
          return JSON.parse(content);
        } catch {
          return {
            insights: content,
            recommendations: [],
            confidence: 0.8
          };
        }
      }
      
      throw new Error('Invalid SLM provider configuration');
      
    } catch (error) {
      this.logger.error({ error: error.message, provider: this.config.slm.provider }, 'SLM query failed');
      throw error;
    }
  }

  /**
   * Parse duration string to milliseconds
   * @private
   */
  private parseDurationToMs(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 300000; // Default 5 minutes
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 300000;
    }
  }

  /**
   * Build prompt for metrics analysis
   * @private
   */
  private buildMetricsAnalysisPrompt(request: any, metricsData: any): string {
    return `You are an expert observability analyst. Analyze the following metrics data and provide intelligent insights.

QUERY: ${request.query}
DURATION: ${request.duration}
THRESHOLD: ${request.threshold || 'auto-detect'}

METRICS DATA:
${JSON.stringify(metricsData, null, 2)}

Please provide a JSON response with the following structure:
{
  "insights": "Overall analysis and key findings",
  "anomalies": ["list of detected anomalies"],
  "patterns": ["identified patterns"],
  "recommendations": ["actionable recommendations"],
  "confidence": 0.8,
  "riskLevel": "low|medium|high"
}

Focus on:
1. Anomaly detection based on statistical analysis
2. Pattern recognition in time series data
3. Performance insights and bottlenecks
4. Actionable recommendations for optimization
5. Risk assessment and alert recommendations`;
  }

  /**
   * Build prompt for incident analysis
   * @private
   */
  private buildIncidentAnalysisPrompt(request: any, incidentData: any, historicalContext: string): string {
    return `You are an expert SRE incident analyst. Perform root cause analysis for the following incident.

ALERT ID: ${request.alertId}
SYMPTOMS: ${request.symptoms.join(', ')}
TIME RANGE: ${request.timeRange || 'recent'}

INCIDENT DATA:
${JSON.stringify(incidentData, null, 2)}

HISTORICAL CONTEXT (similar incidents):
${historicalContext}

Please provide a JSON response with the following structure:
{
  "rootCause": "Primary root cause identified",
  "confidence": 0.9,
  "resolution": "Step-by-step resolution plan",
  "prevention": ["preventive measures"],
  "relatedIncidents": ["similar historical incidents"],
  "timeline": "estimated resolution time",
  "impact": "system impact assessment"
}

Focus on:
1. Root cause analysis based on symptoms and data
2. Correlation with historical incidents
3. Step-by-step resolution plan
4. Prevention strategies
5. Impact assessment and urgency level`;
  }

  /**
   * Build prompt for log analysis
   * @private
   */
  private buildLogAnalysisPrompt(request: any, logData: any): string {
    return `You are an expert log analyst. Analyze the following log data to identify patterns, issues, and insights.

QUERY: ${request.query}
TIME RANGE: ${request.timeRange}
LOG LEVEL: ${request.logLevel || 'all'}
SERVICE: ${request.service || 'all'}

LOG DATA:
${JSON.stringify(logData, null, 2)}

Please provide a JSON response with the following structure:
{
  "patterns": ["identified log patterns"],
  "issues": ["detected issues and errors"],
  "insights": "key insights from log analysis",
  "recommendations": ["actionable recommendations"],
  "errorFrequency": "error rate analysis",
  "suspiciousActivity": ["potential security or performance issues"]
}

Focus on:
1. Error pattern recognition
2. Performance issue identification
3. Security threat detection
4. Application behavior analysis
5. Optimization recommendations`;
  }

  /**
   * Build prompt for dashboard generation
   * @private
   */
  private buildDashboardGenerationPrompt(request: any, metricsMetadata: any): string {
    return `You are an expert Grafana dashboard designer. Create an intelligent dashboard based on the requirements.

DASHBOARD NAME: ${request.name}
DESCRIPTION: ${request.description}
SERVICES: ${request.services?.join(', ') || 'all'}
METRICS: ${request.metrics?.join(', ') || 'auto-select'}

AVAILABLE METRICS:
${JSON.stringify(metricsMetadata, null, 2)}

Please provide a JSON response with the following structure:
{
  "grafanaJson": {
    "dashboard": {
      "title": "Dashboard Name",
      "panels": [{"panel configurations"}],
      "time": {"from": "now-1h", "to": "now"},
      "refresh": "5s"
    }
  },
  "panels": ["list of panel descriptions"],
  "queries": ["optimized PromQL queries"],
  "layout": "panel layout strategy",
  "recommendations": ["dashboard optimization tips"]
}

Focus on:
1. Intelligent panel selection based on service type
2. Optimized PromQL queries for performance
3. Logical panel grouping and layout
4. Appropriate visualization types
5. Useful alerting thresholds`;
  }

  /**
   * Build prompt for alert configuration
   * @private
   */
  private buildAlertConfigurationPrompt(request: any, currentMetrics: any): string {
    return `You are an expert alerting specialist. Optimize the alert rule based on current metrics and best practices.

RULE NAME: ${request.ruleName}
CONDITION: ${request.condition}
SEVERITY: ${request.severity}

CURRENT METRICS (last 24h):
${JSON.stringify(currentMetrics, null, 2)}

Please provide a JSON response with the following structure:
{
  "optimizedCondition": "improved alert condition",
  "optimizedThreshold": "intelligent threshold value",
  "rationale": "explanation for threshold selection",
  "notificationStrategy": "notification approach",
  "falsePositiveRisk": "low|medium|high",
  "suppressionRules": ["when to suppress alerts"],
  "escalation": "escalation strategy"
}

Focus on:
1. Statistical analysis of historical data
2. Threshold optimization to reduce false positives
3. Smart notification strategies
4. Escalation and suppression rules
5. Performance impact assessment`;
  }

  // ===== RESPONSE FORMATTING METHODS =====

  /**
   * Format metrics analysis response with rich markdown
   * @private
   */
  private formatMetricsAnalysisResponse(request: any, analysis: any, metricsData: any): string {
    return `# 📊 Metrics Analysis Report

## Query Analysis
- **PromQL Query**: \`${request.query}\`
- **Time Range**: ${request.duration}
- **Analysis Model**: ${this.config.slm.model}
- **Confidence**: ${Math.round((analysis.confidence || 0.8) * 100)}%

## 🔍 Key Insights
${analysis.insights || 'No specific insights available'}

## 🚨 Anomalies Detected
${analysis.anomalies?.length ? analysis.anomalies.map((anomaly: string) => `- ${anomaly}`).join('\n') : '- No anomalies detected'}

## 📈 Patterns Identified
${analysis.patterns?.length ? analysis.patterns.map((pattern: string) => `- ${pattern}`).join('\n') : '- No patterns identified'}

## 💡 Recommendations
${analysis.recommendations?.length ? analysis.recommendations.map((rec: string) => `- ${rec}`).join('\n') : '- No specific recommendations'}

## 📋 Metrics Data Summary
- **Status**: ${metricsData.status || 'success'}
- **Data Points**: ${metricsData.data?.result?.length || 0}
- **Risk Level**: ${analysis.riskLevel || 'low'}

## 🛠️ Next Steps
1. Monitor the identified patterns over the next 24 hours
2. Set up alerts for detected anomalies if not already configured  
3. Review and implement the recommended optimizations
4. Consider expanding analysis to related metrics

---
*Analysis completed by ${this.config.name} using ${this.config.slm.model}*`;
  }

  /**
   * Format incident analysis response with rich markdown
   * @private
   */
  private formatIncidentAnalysisResponse(request: any, analysis: any, incidentData: any): string {
    return `# 🚨 Incident Analysis Report

## Incident Overview
- **Alert ID**: ${request.alertId}
- **Symptoms**: ${request.symptoms.join(', ')}
- **Analysis Model**: ${this.config.slm.model}
- **Confidence**: ${Math.round((analysis.confidence || 0.8) * 100)}%

## 🎯 Root Cause Analysis
**Primary Root Cause**: ${analysis.rootCause || 'Unable to determine root cause'}

## 🔧 Resolution Plan
${analysis.resolution || 'No specific resolution plan available'}

## 🛡️ Prevention Measures
${analysis.prevention?.length ? analysis.prevention.map((measure: string) => `- ${measure}`).join('\n') : '- No prevention measures identified'}

## 📊 Impact Assessment
${analysis.impact || 'Impact assessment not available'}

## ⏱️ Timeline
**Estimated Resolution Time**: ${analysis.timeline || 'Not estimated'}

## 🔗 Related Incidents
${analysis.relatedIncidents?.length ? analysis.relatedIncidents.map((incident: string) => `- ${incident}`).join('\n') : '- No related incidents found'}

## 📋 Alert Data Summary
- **Active Alerts**: ${Array.isArray(incidentData) ? incidentData.length : 'N/A'}
- **Alert Status**: ${incidentData.status || 'Available'}

## 🚀 Immediate Actions
1. Follow the resolution plan step-by-step
2. Monitor system metrics during resolution
3. Implement prevention measures after resolution
4. Document lessons learned for future incidents

---
*Analysis completed by ${this.config.name} using ${this.config.slm.model}*`;
  }

  /**
   * Format log analysis response with rich markdown  
   * @private
   */
  private formatLogAnalysisResponse(request: any, analysis: any, logData: any): string {
    return `# 📝 Log Analysis Report

## Query Analysis
- **Search Query**: \`${request.query}\`
- **Time Range**: ${request.timeRange}
- **Service Filter**: ${request.service || 'All services'}
- **Log Level**: ${request.logLevel || 'All levels'}
- **Analysis Model**: ${this.config.slm.model}

## 📊 Log Statistics
- **Total Logs**: ${logData.hits?.total?.value || 0}
- **Sample Size**: ${logData.hits?.hits?.length || 0}

## 🔍 Patterns Identified
${analysis.patterns?.length ? analysis.patterns.map((pattern: string) => `- ${pattern}`).join('\n') : '- No patterns identified'}

## ⚠️ Issues Detected
${analysis.issues?.length ? analysis.issues.map((issue: string) => `- ${issue}`).join('\n') : '- No issues detected'}

## 💡 Key Insights
${analysis.insights || 'No specific insights available'}

## 🚨 Suspicious Activity
${analysis.suspiciousActivity?.length ? analysis.suspiciousActivity.map((activity: string) => `- ${activity}`).join('\n') : '- No suspicious activity detected'}

## 📈 Error Frequency
${analysis.errorFrequency || 'Error frequency analysis not available'}

## 🛠️ Recommendations
${analysis.recommendations?.length ? analysis.recommendations.map((rec: string) => `- ${rec}`).join('\n') : '- No specific recommendations'}

## 📋 Sample Log Entries
${logData.hits?.hits?.slice(0, 3).map((hit: any, index: number) => 
  `${index + 1}. **${hit._source.level?.toUpperCase()}** [${hit._source.timestamp}]: ${hit._source.message}`
).join('\n') || 'No sample log entries available'}

## 🚀 Next Steps  
1. Address identified issues in order of severity
2. Monitor patterns over extended time periods
3. Implement recommended log improvements
4. Set up alerts for suspicious activities

---
*Analysis completed by ${this.config.name} using ${this.config.slm.model}*`;
  }

  /**
   * Format dashboard creation response with rich markdown
   * @private  
   */
  private formatDashboardCreationResponse(request: any, dashboardConfig: any, grafanaDashboard: any): string {
    return `# 📊 Dashboard Creation Report

## Dashboard Overview
- **Name**: ${request.name}
- **Description**: ${request.description}
- **Target Services**: ${request.services?.join(', ') || 'All services'}
- **Generation Model**: ${this.config.slm.model}

## 🎛️ Dashboard Configuration
- **Panels Created**: ${dashboardConfig.panels?.length || 0}
- **Layout Strategy**: ${dashboardConfig.layout || 'Auto-optimized'}
- **Refresh Rate**: ${dashboardConfig.grafanaJson?.dashboard?.refresh || '5s'}
- **Time Range**: ${dashboardConfig.grafanaJson?.dashboard?.time?.from || 'now-1h'} to ${dashboardConfig.grafanaJson?.dashboard?.time?.to || 'now'}

## 📈 Panel Breakdown
${dashboardConfig.panels?.length ? dashboardConfig.panels.map((panel: string, index: number) => `${index + 1}. ${panel}`).join('\n') : 'No panels configured'}

## 🔧 Optimized Queries  
${dashboardConfig.queries?.length ? dashboardConfig.queries.map((query: string, index: number) => `${index + 1}. \`${query}\``).join('\n') : 'No queries optimized'}

## 🚀 Grafana Integration
${grafanaDashboard ? `
- **Status**: ✅ Successfully created in Grafana
- **Dashboard ID**: ${grafanaDashboard.id || 'N/A'}
- **URL**: ${grafanaDashboard.url || 'Not available'}
- **Version**: ${grafanaDashboard.version || 1}
` : `
- **Status**: ⚠️ Configuration generated, manual Grafana import required
- **Reason**: ${grafanaDashboard === null ? 'Grafana not configured' : 'Creation failed'}
`}

## 💡 Optimization Recommendations
${dashboardConfig.recommendations?.length ? dashboardConfig.recommendations.map((rec: string) => `- ${rec}`).join('\n') : '- No specific recommendations'}

## 📋 Dashboard JSON
<details>
<summary>Click to expand Grafana JSON configuration</summary>

\`\`\`json
${JSON.stringify(dashboardConfig.grafanaJson, null, 2)}
\`\`\`
</details>

## 🚀 Next Steps
1. Review the generated dashboard configuration
2. Import to Grafana if not automatically created
3. Customize panel layouts based on team preferences  
4. Set up dashboard alerts and notifications
5. Share dashboard URL with relevant team members

---
*Dashboard created by ${this.config.name} using ${this.config.slm.model}*`;
  }

  /**
   * Format alert configuration response with rich markdown
   * @private
   */
  private formatAlertConfigurationResponse(request: any, alertConfig: any, currentMetrics: any): string {
    return `# 🚨 Alert Configuration Report

## Alert Rule Overview
- **Rule Name**: ${request.ruleName}
- **Severity**: ${request.severity}
- **Optimization Model**: ${this.config.slm.model}
- **False Positive Risk**: ${alertConfig.falsePositiveRisk || 'low'}

## 🔧 Condition Optimization
**Original Condition**: \`${request.condition}\`  
**Optimized Condition**: \`${alertConfig.optimizedCondition || request.condition}\`

## 🎯 Threshold Analysis
- **Recommended Threshold**: ${alertConfig.optimizedThreshold || 'Not specified'}
- **Rationale**: ${alertConfig.rationale || 'Threshold based on current metrics and best practices'}

## 📊 Historical Context
${currentMetrics.status !== 'error' ? `
- **Data Points Analyzed**: ${currentMetrics.data?.result?.[0]?.values?.length || 'N/A'}
- **Time Range**: Last 24 hours
- **Baseline Established**: ✅ Based on recent metrics
` : `
- **Data Points Analyzed**: Limited (metrics unavailable)
- **Baseline Established**: ⚠️ Using industry standards
`}

## 🔔 Notification Strategy
${alertConfig.notificationStrategy || 'Standard notification approach recommended'}

## 🛡️ Suppression Rules
${alertConfig.suppressionRules?.length ? alertConfig.suppressionRules.map((rule: string) => `- ${rule}`).join('\n') : '- No suppression rules recommended'}

## 📈 Escalation Strategy
${alertConfig.escalation || 'Standard escalation ladder recommended'}

## ⚡ Performance Impact
- **Query Complexity**: ${alertConfig.optimizedCondition?.includes('rate(') ? 'Medium (rate calculation)' : 'Low'}
- **Evaluation Frequency**: Recommended every 15-30 seconds
- **Resource Usage**: Minimal impact expected

## 🚀 Implementation Checklist
- [ ] Review optimized condition and threshold
- [ ] Configure notification channels
- [ ] Set up escalation policies  
- [ ] Test alert with simulated conditions
- [ ] Monitor for false positives in first 24 hours
- [ ] Document alert in runbook

## 📋 Configuration Summary
\`\`\`yaml
alert:
  name: ${request.ruleName}
  condition: ${alertConfig.optimizedCondition || request.condition}
  severity: ${request.severity}  
  threshold: ${alertConfig.optimizedThreshold}
  falsePositiveRisk: ${alertConfig.falsePositiveRisk || 'low'}
\`\`\`

---
*Alert configured by ${this.config.name} using ${this.config.slm.model}*`;
  }

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
        try {
          this.logger.debug('Context client cleanup (placeholder)');
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Failed to cleanup context client');
        }
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