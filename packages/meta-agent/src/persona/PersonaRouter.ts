/**
 * Persona-Based Agent Router
 *
 * Revolutionary routing system inspired by Claude's subagent approach.
 * Uses markdown personas to intelligently route requests to specialized agents.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { Anthropic } from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { createLogger, Logger } from '@ai-idp/utils';
import type {
  AgentIntent,
  ConversationContext,
  VectorSearchResult
} from '@ai-idp/types';

// Persona-based routing schema
const PersonaRoutingSchema = z.object({
  agent: z.enum(['infrastructure', 'observability', 'security', 'workflow', 'cicd']),
  action: z.string(),
  confidence: z.number().min(0).max(1),
  parameters: z.record(z.string(), z.any()),
  reasoning: z.string(),
  modelPreference: z.object({
    primary: z.string(),
    fallback: z.string().optional(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional()
  }).optional()
});

interface PersonaConfig {
  name: string;
  filePath: string;
  url: string;
  enabled: boolean;
}

/**
 * Persona-based agent router that uses markdown files to define agent capabilities
 * and intelligent routing decisions
 */
export class PersonaRouter {
  private anthropic?: Anthropic;
  private openai?: OpenAI;
  private logger: Logger;
  private personaCache: Map<string, string> = new Map();
  private agentConfigs: Map<string, PersonaConfig>;

  constructor(
    agentConfigs: Map<string, PersonaConfig>,
    anthropic?: Anthropic,
    openai?: OpenAI,
    logger?: Logger
  ) {
    this.agentConfigs = agentConfigs;
    this.anthropic = anthropic;
    this.openai = openai;
    this.logger = logger ? logger.child({ component: 'PersonaRouter' }) : createLogger({
      service: 'meta-agent-persona-router',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development'
    });
  }

  /**
   * Load persona markdown file with caching
   */
  private async loadPersona(agentName: string): Promise<string> {
    const cacheKey = agentName;

    if (this.personaCache.has(cacheKey)) {
      return this.personaCache.get(cacheKey)!;
    }

    const config = this.agentConfigs.get(agentName);
    if (!config) {
      throw new Error(`No configuration found for agent: ${agentName}`);
    }

    try {
      const personaContent = await readFile(config.filePath, 'utf-8');
      this.personaCache.set(cacheKey, personaContent);

      this.logger.debug({
        agent: agentName,
        filePath: config.filePath,
        contentLength: personaContent.length
      }, 'Loaded persona file');

      return personaContent;
    } catch (error) {
      this.logger.error({
        agent: agentName,
        filePath: config.filePath,
        error: error.message
      }, 'Failed to load persona file');
      throw new Error(`Failed to load persona for ${agentName}: ${error.message}`);
    }
  }

  /**
   * Intelligent persona-based routing using LLM analysis
   */
  async routeWithPersona(
    userInput: string,
    context: ConversationContext,
    relevantContext?: VectorSearchResult[]
  ): Promise<AgentIntent> {
    this.logger.info({
      input: userInput.substring(0, 100),
      conversationId: context.conversationId,
      availableAgents: Array.from(this.agentConfigs.keys())
    }, 'Starting persona-based routing');

    try {
      // Load all available personas
      const personas = new Map<string, string>();
      for (const [agentName, config] of this.agentConfigs) {
        if (config.enabled) {
          try {
            personas.set(agentName, await this.loadPersona(agentName));
          } catch (error) {
            this.logger.warn({
              agent: agentName,
              error: error.message
            }, 'Skipping agent due to persona load failure');
          }
        }
      }

      if (personas.size === 0) {
        throw new Error('No valid personas available for routing');
      }

      // Build persona-aware routing prompt
      const prompt = this.buildPersonaRoutingPrompt(userInput, context, personas, relevantContext);

      // Use LLM for intelligent routing
      let routingResult: any;
      if (this.anthropic) {
        routingResult = await this.routeWithAnthropic(prompt);
      } else if (this.openai) {
        routingResult = await this.routeWithOpenAI(prompt);
      } else {
        throw new Error('No AI provider available for persona-based routing');
      }

      // Normalize action names and parameter keys to match expected conventions
      this.normalizeRouterResponse(routingResult);

      // Validate and parse result
      const parsedIntent = PersonaRoutingSchema.parse(routingResult);

      const intent: AgentIntent = {
        agent: parsedIntent.agent,
        action: parsedIntent.action,
        confidence: parsedIntent.confidence,
        parameters: parsedIntent.parameters,
        context: relevantContext?.map(r => r.id) || []
      };

      this.logger.info({
        agent: intent.agent,
        action: intent.action,
        confidence: intent.confidence,
        parameterCount: Object.keys(intent.parameters).length,
        reasoning: parsedIntent.reasoning,
        modelPreference: parsedIntent.modelPreference
      }, 'Persona-based routing completed successfully');

      return intent;

    } catch (error) {
      this.logger.error({
        error: error.message,
        userInput: userInput.substring(0, 100)
      }, 'Persona-based routing failed');

      // Intelligent fallback based on keywords
      return this.intelligentFallback(userInput, context);
    }
  }

  /**
   * Build persona-aware routing prompt
   */
  private buildPersonaRoutingPrompt(
    userInput: string,
    context: ConversationContext,
    personas: Map<string, string>,
    relevantContext?: VectorSearchResult[]
  ): string {
    const contextInfo = relevantContext
      ?.slice(0, 3)
      .map(ctx => `- ${ctx.payload.type}: ${ctx.payload.content.substring(0, 200)}`)
      .join('\\n') || 'None';

    const conversationHistory = context.history
      .slice(-3)
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\\n');

    // Build personas section
    const personasSection = Array.from(personas.entries())
      .map(([agentName, personaContent]) => {
        // Extract key sections from persona markdown
        const sections = this.extractPersonaSections(personaContent);
        return `### ${agentName.toUpperCase()} AGENT
**Domain Expertise:** ${sections.domainExpertise}
**Available Tools:** ${sections.availableTools}
**Parameter Examples:** ${sections.classificationExamples}
**Model Config:** ${sections.modelConfiguration}`;
      })
      .join('\\n\\n');

    return `
You are a Meta-Agent persona router for an AI Infrastructure Developer Platform (IDP).
Your task is to analyze user requests and route them to the most appropriate specialized agent using their persona definitions.

AVAILABLE AGENT PERSONAS:

${personasSection}

CONTEXT FROM PREVIOUS INTERACTIONS:
${contextInfo}

RECENT CONVERSATION:
${conversationHistory}

USER REQUEST: "${userInput}"

ROUTING INSTRUCTIONS:
1. **Persona Matching**: Compare the user's request against each agent's domain expertise
2. **Tool Alignment**: Match required actions with available tools
3. **Parameter Extraction**: Use persona-specific extraction rules for precise parameters
4. **Model Selection**: Consider the agent's preferred model configuration
5. **Confidence Scoring**: High confidence (0.9+) for clear matches, moderate (0.5-0.8) for reasonable matches

Respond with ONLY a JSON object in this exact format:
{
  "agent": "infrastructure|observability|security|workflow|cicd",
  "action": "specific_tool_name_from_persona",
  "confidence": 0.0-1.0,
  "parameters": {
    "extracted_parameter": "value",
    "another_parameter": "value"
  },
  "reasoning": "Brief explanation of persona-based routing decision",
  "modelPreference": {
    "primary": "model_name_from_persona",
    "fallback": "fallback_model_from_persona",
    "temperature": 0.1,
    "maxTokens": 512
  }
}

CRITICAL REQUIREMENTS:
- ALWAYS extract specific parameters based on the chosen agent's persona rules
- NEVER leave parameters empty or undefined - use persona defaults
- Match the action to exact tool names from the agent's persona
- Include model preferences from the selected agent's configuration
- Provide clear reasoning based on persona domain expertise
`.trim();
  }

  /**
   * Extract key sections from persona markdown
   */
  private extractPersonaSections(personaContent: string): {
    domainExpertise: string;
    availableTools: string;
    classificationExamples: string;
    modelConfiguration: string;
  } {
    const sections = {
      domainExpertise: 'Not specified',
      availableTools: 'Not specified',
      classificationExamples: 'Not specified',
      modelConfiguration: 'Not specified'
    };

    // Extract Domain Expertise section
    const expertiseMatch = personaContent.match(/## Domain Expertise\\s*([\\s\\S]*?)(?=##|$)/);
    if (expertiseMatch) {
      sections.domainExpertise = expertiseMatch[1].trim().substring(0, 200);
    }

    // Extract Available Tools section
    const toolsMatch = personaContent.match(/## Available Tools\\s*([\\s\\S]*?)(?=##|$)/);
    if (toolsMatch) {
      sections.availableTools = toolsMatch[1].trim().substring(0, 300);
    }

    // Extract Classification Examples section
    const examplesMatch = personaContent.match(/## Classification Examples\\s*([\\s\\S]*?)(?=##|$)/);
    if (examplesMatch) {
      sections.classificationExamples = examplesMatch[1].trim().substring(0, 400);
    }

    // Extract Model Configuration section
    const modelMatch = personaContent.match(/## Model Configuration\\s*([\\s\\S]*?)(?=##|$)/);
    if (modelMatch) {
      sections.modelConfiguration = modelMatch[1].trim().substring(0, 200);
    }

    return sections;
  }

  /**
   * Route using Anthropic Claude
   */
  private async routeWithAnthropic(prompt: string): Promise<any> {
    const response = await this.anthropic!.messages.create({
      model: 'claude-3-7-sonnet-latest',
      max_tokens: 1024,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Invalid response type from Anthropic');
    }

    return JSON.parse(content.text);
  }

  /**
   * Route using OpenAI GPT
   */
  private async routeWithOpenAI(prompt: string): Promise<any> {
    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: 1024,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI');
    }

    return JSON.parse(content);
  }

  /**
   * Intelligent keyword-based fallback routing
   */
  private intelligentFallback(userInput: string, context: ConversationContext): AgentIntent {
    this.logger.info({ userInput }, 'Using intelligent fallback routing');

    const input = userInput.toLowerCase();

    // Infrastructure keywords
    if (input.includes('deploy') || input.includes('scale') || input.includes('k8s') ||
        input.includes('kubernetes') || input.includes('container') || input.includes('pod')) {
      return {
        agent: 'infrastructure',
        action: input.includes('deploy') ? 'deployApplication' : 'getResourceStatus',
        confidence: 0.6,
        parameters: this.extractBasicParameters(userInput, 'infrastructure'),
        context: []
      };
    }

    // Observability keywords
    if (input.includes('logs') || input.includes('metrics') || input.includes('monitor') ||
        input.includes('alert') || input.includes('dashboard') || input.includes('incident')) {
      return {
        agent: 'observability',
        action: input.includes('logs') ? 'analyzeLogs' : 'analyzeMetrics',
        confidence: 0.6,
        parameters: this.extractBasicParameters(userInput, 'observability'),
        context: []
      };
    }

    // Default to infrastructure with low confidence
    return {
      agent: 'infrastructure',
      action: 'getResourceStatus',
      confidence: 0.3,
      parameters: { query: userInput },
      context: []
    };
  }

  /**
   * Extract basic parameters for fallback routing
   */
  private extractBasicParameters(userInput: string, agent: string): Record<string, any> {
    const params: Record<string, any> = {};

    if (agent === 'infrastructure') {
      // Extract resource name from deploy commands
      const deployMatch = userInput.match(/deploy\\s+(\\w+)/i);
      if (deployMatch) {
        params.resourceName = deployMatch[1];
        params.containerImage = `${deployMatch[1]}:latest`;
      }

      // Extract replica count
      const replicaMatch = userInput.match(/(\\d+)\\s+replica/i);
      if (replicaMatch) {
        params.replicas = parseInt(replicaMatch[1], 10);
      }
    } else if (agent === 'observability') {
      // Extract service names
      const serviceMatch = userInput.match(/\\b(\\w+)\\s+(logs|metrics|status)/i);
      if (serviceMatch) {
        params.service = serviceMatch[1];
      }

      // Extract time ranges
      const timeMatch = userInput.match(/last\\s+(\\d+)\\s+(minute|hour|day)/i);
      if (timeMatch) {
        params.timeRange = `${timeMatch[1]}${timeMatch[2][0]}`;
      }
    }

    return params;
  }

  /**
   * Clear persona cache (useful for hot reloading during development)
   */
  clearCache(): void {
    this.personaCache.clear();
    this.logger.info('Persona cache cleared');
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    cachedPersonas: string[];
    availableAgents: string[];
    enabledAgents: string[];
  } {
    return {
      cachedPersonas: Array.from(this.personaCache.keys()),
      availableAgents: Array.from(this.agentConfigs.keys()),
      enabledAgents: Array.from(this.agentConfigs.entries())
        .filter(([, config]) => config.enabled)
        .map(([name]) => name)
    };
  }

  /**
   * Normalize action names and parameter keys to match expected conventions
   */
  private normalizeRouterResponse(response: any): void {
    if (!response || typeof response !== 'object') return;

    // Normalize agent names
    if (response.agent) {
      response.agent = response.agent.toLowerCase();
    }

    // Normalize action names
    if (response.action) {
      // Infrastructure agent action mappings
      const actionMappings: Record<string, string> = {
        // Infrastructure agent
        'deploy': 'deployApplication',
        'scale_service': 'scaleResource',
        'scale': 'scaleResource',
        'check_service_status': 'getResourceStatus',
        'status': 'getResourceStatus',
        'check_status': 'getResourceStatus',
        'get_logs': 'getResourceLogs',
        'logs': 'getResourceLogs',
        'generate_kubectl': 'generateKubectlCommand',
        'kubectl': 'generateKubectlCommand',

        // Observability agent
        'metrics_query': 'analyzeMetrics',
        'metrics_analysis': 'analyzeMetrics',
        'monitor_metrics': 'analyzeMetrics',
        'analyze_metrics': 'analyzeMetrics',
        'query_metrics': 'analyzeMetrics',
        'check_metrics': 'analyzeMetrics',
        'incident_analysis': 'analyzeIncident',
        'analyze_incident': 'analyzeIncident',
        'log_analysis': 'analyzeLogs',
        'analyze_logs': 'analyzeLogs',
        'create_monitoring_dashboard': 'createDashboard',
        'create_dashboard': 'createDashboard',
        'configure_alert': 'configureAlerts',
        'alert_configuration': 'configureAlerts'
      };

      response.action = actionMappings[response.action] || response.action;
    }

    // Normalize parameter keys
    if (response.parameters && typeof response.parameters === 'object') {
      const paramMappings: Record<string, string> = {
        'service_name': 'resourceName',
        'service': 'resourceName',
        'applicationName': 'resourceName',
        'application': 'resourceName',
        'app_name': 'resourceName',
        'appName': 'resourceName',
        'app': 'resourceName',
        'name': 'resourceName',
        'service_type': 'resourceName',
        'dashboard_name': 'name',
        'dashboard_title': 'name',
        'dashboard_type': 'name',
        'instance_count': 'replicas',
        'instances': 'replicas',
        'image': 'containerImage',
        'container_image': 'containerImage',
        'docker_image': 'containerImage',
        'namespace_name': 'namespace',
        'ns': 'namespace',
        'env': 'environment',
        'time_range': 'timeRange',
        'timeframe': 'timeRange',
        'time_frame': 'timeRange',
        'log_type': 'logLevel',
        'log_level': 'logLevel',
        'level': 'logLevel',
        'metric_type': 'query',
        'metric': 'query'
      };

      const newParams: Record<string, any> = {};

      // Map parameter keys to expected names
      Object.entries(response.parameters).forEach(([key, value]) => {
        const normalizedKey = paramMappings[key] || key;
        newParams[normalizedKey] = value;
      });

      // Special case handling for containerImage
      if (newParams.resourceName && !newParams.containerImage) {
        newParams.containerImage = `${newParams.resourceName}:latest`;
      }

      // Special case for service[] to resourceName
      if (Array.isArray(newParams.services) && newParams.services.length > 0 && !newParams.resourceName) {
        newParams.resourceName = newParams.services[0];
      }

      // Special case for service_type to name for createDashboard
      if (newParams.service_type && response.action === 'createDashboard' && !newParams.name) {
        newParams.name = newParams.service_type;
      }

      // Special case for service_type to services[] for createDashboard
      if (newParams.service_type && response.action === 'createDashboard' && !newParams.services) {
        newParams.services = [newParams.service_type];
      }

      // Special case for time ranges
      if (newParams.timeRange) {
        // Convert "30 minutes" to "30m", "1 hour" to "1h", etc.
        const timeMatch = newParams.timeRange.match(/([\d.]+)\s*(minute|minutes|min|hour|hours|h|day|days|d)/i);
        if (timeMatch) {
          const amount = timeMatch[1];
          const unit = timeMatch[2].toLowerCase();
          if (unit.includes('minute') || unit === 'min') {
            newParams.timeRange = `${amount}m`;
          } else if (unit.includes('hour') || unit === 'h') {
            newParams.timeRange = `${amount}h`;
          } else if (unit.includes('day') || unit === 'd') {
            newParams.timeRange = `${amount}d`;
          }
        }
      }

      // Special case for log analysis
      if (response.action === 'analyzeLogs') {
        // Set service parameter
        if (newParams.resourceName && !newParams.service) {
          newParams.service = newParams.resourceName;
        }
      }

      // Special case for metrics analysis - create combined query
      if (response.action === 'analyzeMetrics' && newParams.resourceName === 'database' && newParams.query === 'cpu') {
        newParams.query = 'database CPU';
        newParams.service = 'database';
      }

      // Set service parameter from resourceName for analyzeMetrics
      if (response.action === 'analyzeMetrics' && newParams.resourceName && !newParams.service) {
        newParams.service = newParams.resourceName;
      }

      // Special case for dashboard creation
      if (response.action === 'createDashboard') {
        // If resourceName exists but name doesn't, use resourceName as the name
        if (newParams.resourceName && !newParams.name) {
          newParams.name = newParams.resourceName;
        }

        // Ensure services array exists
        if (!newParams.services && newParams.resourceName) {
          newParams.services = [newParams.resourceName];
        }

        // If name is "monitoring" and resourceName is set, swap them
        if (newParams.name === 'monitoring' && newParams.resourceName !== 'monitoring') {
          newParams.name = newParams.resourceName;
        }
      }

      // Special handling for status checks - force to infrastructure agent
      if (response.action === 'getResourceStatus' || response.action === 'check_service_status') {
        response.agent = 'infrastructure';
      }

      response.parameters = newParams;
    }
  }
}