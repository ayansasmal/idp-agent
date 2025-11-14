import { Anthropic } from '@anthropic-ai/sdk';
import { OpenAI } from 'openai';
import { z } from 'zod';
import { createLogger, Logger } from '@ai-idp/utils';
import type {
  AgentIntent,
  ConversationContext,
  VectorSearchResult
} from '@ai-idp/types';

// Intent classification schema
const IntentSchema = z.object({
  agent: z.enum(['infrastructure', 'security', 'workflow', 'observability', 'cicd']),
  action: z.string(),
  confidence: z.number().min(0).max(1),
  parameters: z.record(z.string(), z.any()),
  reasoning: z.string()
});

/**
 * Intent Classifier - Routes user requests to appropriate focused agents
 * 
 * Uses LLM-based classification with context awareness to determine:
 * 1. Which agent should handle the request
 * 2. What specific action to perform
 * 3. Required parameters for the action
 */
export class IntentClassifier {
  private anthropic?: Anthropic;
  private openai?: OpenAI;
  private logger: Logger;

  constructor(anthropic?: Anthropic, openai?: OpenAI, logger?: Logger) {
    this.anthropic = anthropic;
    this.openai = openai;
    this.logger = logger ? logger.child({ component: 'IntentClassifier' }) : createLogger({
      service: 'meta-agent-intent-classifier',
      level: 'info',
      environment: (process.env.NODE_ENV as any) || 'development'
    });
  }

  /**
   * Classify user intent and route to appropriate agent
   */
  async classifyIntent(
    userInput: string,
    context: ConversationContext,
    relevantContext?: VectorSearchResult[]
  ): Promise<AgentIntent> {
    this.logger.info({
      input: userInput.substring(0, 100),
      conversationId: context.conversationId,
      contextItems: relevantContext?.length || 0
    }, 'Classifying user intent');

    try {
      // Build classification prompt with context
      const prompt = this.buildClassificationPrompt(userInput, context, relevantContext);

      // Use primary LLM (Anthropic preferred)
      let intentResult: any;
      if (this.anthropic) {
        intentResult = await this.classifyWithAnthropic(prompt);
      } else if (this.openai) {
        intentResult = await this.classifyWithOpenAI(prompt);
      } else {
        throw new Error('No AI provider available for intent classification');
      }

      // DEBUG: Log raw AI response
      this.logger.debug({
        rawAIResponse: JSON.stringify(intentResult, null, 2),
        userInput
      }, 'Raw AI response for intent classification');

      // Validate and parse result
      const parsedIntent = IntentSchema.parse(intentResult);

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
        parameters: Object.keys(intent.parameters),
        reasoning: parsedIntent.reasoning
      }, 'Intent classified successfully');

      return intent;

    } catch (error) {
      this.logger.error({
        error: error.message,
        userInput: userInput.substring(0, 100)
      }, 'Intent classification failed');

      // Return fallback intent
      return {
        agent: 'infrastructure', // Default to infrastructure for safety
        action: 'status',
        confidence: 0.1,
        parameters: { query: userInput },
        context: []
      };
    }
  }

  /**
   * Build comprehensive classification prompt
   */
  private buildClassificationPrompt(
    userInput: string,
    context: ConversationContext,
    relevantContext?: VectorSearchResult[]
  ): string {
    const contextInfo = relevantContext
      ?.slice(0, 3) // Limit to top 3 relevant contexts
      .map(ctx => `- ${ctx.payload.type}: ${ctx.payload.content.substring(0, 200)}`)
      .join('\n') || 'None';

    const conversationHistory = context.history
      .slice(-3) // Last 3 messages for immediate context
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    return `
You are an AI intent classifier for a multi-agent Infrastructure Developer Platform (IDP). 
Your task is to analyze user requests and route them to the appropriate specialized agent.

AVAILABLE AGENTS:
1. **infrastructure** - Kubernetes deployments, scaling, cloud resources, container orchestration
2. **security** - Vulnerability scanning, policy compliance, risk assessment, threat detection  
3. **workflow** - Approval processes, CI/CD pipelines, notifications, multi-step orchestration
4. **observability** - Metrics, logs, traces, monitoring, alerting, performance analysis
5. **cicd** - Build pipelines, deployments, releases, artifact management

AGENT CAPABILITIES:

Infrastructure Agent:
- deployApplication, scaleResource, getResourceStatus, getResourcelogs, rollbackDeployment
- provisionDatabase, createStorage, deployFunction, manageSecrets
- Kubernetes operations, cloud provisioning, container management

IMPORTANT PARAMETER REQUIREMENTS:

For deployApplication action:
- resourceName (REQUIRED): Extract application/service name from user input
- containerImage (REQUIRED): Default to "{serviceName}:latest" if image not specified
- namespace: default to "default"
- replicas: default to 1
- port: default to 80 for web services, 8080 for apps
- environment: extract from context or default to "development"

Example extractions:
- "deploy nginx" → resourceName: "nginx", containerImage: "nginx:latest"
- "deploy my app called myservice" → resourceName: "myservice", containerImage: "myservice:latest"
- "deploy postgres database" → resourceName: "postgres", containerImage: "postgres:latest"

Security Agent:
- scanContainerImage, analyzeDependencies, validatePolicy, assessRisk
- enforceCompliance, detectThreats, analyzeAnomalies, respondToIncident
- CVE scanning, policy enforcement, risk assessment

Workflow Agent:
- createApproval, processApprovalDecision, executeWorkflow, trackWorkflowProgress
- sendNotification, triggerPipeline, createIncident
- Human approvals, process orchestration, notifications

Observability Agent:
- collectMetrics, queryMetrics, createAlert, analyzeLogs, searchLogs
- traceRequest, analyzeLatency, findBottlenecks, predictAnomalies
- Monitoring, alerting, performance optimization

CI/CD Agent:
- triggerPipeline, monitorPipeline, createBuild, deployApplication
- createRelease, generateReleaseNotes, uploadArtifact
- Build management, release orchestration

CONTEXT FROM PREVIOUS INTERACTIONS:
${contextInfo}

RECENT CONVERSATION:
${conversationHistory}

USER REQUEST: "${userInput}"

Analyze the user request and respond with ONLY a JSON object in this exact format:
{
  "agent": "infrastructure|security|workflow|observability|cicd",
  "action": "specific_action_name",
  "confidence": 0.0-1.0,
  "parameters": {
    "key": "value",
    "extracted_from_user_input": "..."
  },
  "reasoning": "Brief explanation of why this agent/action was chosen"
}

CLASSIFICATION RULES:
- Match user intent to most appropriate agent based on domain
- ALWAYS extract specific parameters from user input - never leave them empty or undefined
- For deployApplication: ALWAYS provide resourceName and containerImage (use defaults if not explicit)
- Use context to inform classification decisions
- Confidence should reflect certainty (0.9+ for clear intent, 0.5-0.8 for moderate, <0.5 for unclear)
- Action should be the most specific tool available for the task
- If multiple agents could handle it, choose the most specialized one
- CRITICAL: Parameters object must never contain undefined or null values - use sensible defaults

Examples with parameter extraction:
- "Deploy nginx" → {agent: "infrastructure", action: "deployApplication", parameters: {resourceName: "nginx", containerImage: "nginx:latest"}}
- "Deploy my app called myservice with 3 replicas" → {agent: "infrastructure", action: "deployApplication", parameters: {resourceName: "myservice", containerImage: "myservice:latest", replicas: 3}}
- "Deploy postgres database" → {agent: "infrastructure", action: "deployApplication", parameters: {resourceName: "postgres", containerImage: "postgres:latest"}}
- "Scan nginx image for vulnerabilities" → {agent: "security", action: "scanContainerImage", parameters: {image: "nginx"}}
- "Show me error logs for myapp" → {agent: "observability", action: "analyzeLogs", parameters: {service: "myapp", logLevel: "error"}}
`.trim();
  }

  /**
   * Classify intent using Anthropic Claude
   */
  private async classifyWithAnthropic(prompt: string): Promise<any> {
    const response = await this.anthropic!.messages.create({
      model: 'claude-3-7-sonnet-latest',
      max_tokens: 1024,
      temperature: 0.1, // Low temperature for consistent classification
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
   * Classify intent using OpenAI GPT
   */
  private async classifyWithOpenAI(prompt: string): Promise<any> {
    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{
        role: 'user',
        content: prompt
      }],
      max_tokens: 1024,
      temperature: 0.1, // Low temperature for consistent classification
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI');
    }

    return JSON.parse(content);
  }

  /**
   * Validate if agent can handle the classified intent
   */
  validateIntentCapability(intent: AgentIntent, availableAgents: string[]): boolean {
    return availableAgents.includes(intent.agent);
  }

  /**
   * Suggest alternative agents if primary choice is unavailable
   */
  suggestAlternativeAgent(intent: AgentIntent, availableAgents: string[]): string | null {
    // Fallback mapping for common scenarios
    const fallbacks: Record<string, string[]> = {
      'infrastructure': ['observability', 'workflow'],
      'security': ['workflow', 'infrastructure'],
      'workflow': ['infrastructure', 'observability'],
      'observability': ['infrastructure', 'workflow'],
      'cicd': ['workflow', 'infrastructure']
    };

    const alternatives = fallbacks[intent.agent] || [];
    return alternatives.find(alt => availableAgents.includes(alt)) || null;
  }
}