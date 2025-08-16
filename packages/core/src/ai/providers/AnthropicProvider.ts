import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { z } from 'zod';

import { AIError } from '@/types';

/**
 * Anthropic provider using LangChain integration
 * Provides tool-calling capabilities with structured output
 */
export class AnthropicProvider {
  private model: ChatAnthropic;
  private executor?: AgentExecutor;

  constructor(
    private apiKey: string,
    private modelName: string = 'claude-sonnet-4-20250514',
    private options: {
      temperature?: number;
      maxTokens?: number;
      maxRetries?: number;
    } = {}
  ) {
    this.model = new ChatAnthropic({
      model: this.modelName,
      apiKey: this.apiKey,
      temperature: this.options.temperature ?? 0,
      maxTokens: this.options.maxTokens ?? 4096,
      maxRetries: this.options.maxRetries ?? 3,
    });
  }

  /**
   * Initialize the agent with platform-specific tools
   */
  async initializeAgent(tools: any[] = []) {
    try {
      // Create platform analysis tool for intent parsing
      const analyzePlatformIntent = tool(
        async ({ userInput, context }) => {
          // This will be processed by structured output
          return `Analyzing: ${userInput} in context: ${JSON.stringify(context)}`;
        },
        {
          name: 'analyze_platform_intent',
          description: 'Analyze user input for platform operations intent',
          schema: z.object({
            userInput: z.string().describe('The user\'s natural language request'),
            context: z.object({
              environment: z.string(),
              userId: z.string(),
              permissions: z.array(z.string()),
            }).describe('Request context'),
          }),
        }
      );

      // Combine platform tool with any additional tools
      const allTools = [analyzePlatformIntent, ...tools];

      // Create agent prompt with required placeholders
      const prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `You are an AI-powered platform engineering assistant. Your role is to help developers manage infrastructure through natural language conversations.

CORE RESPONSIBILITIES:
1. Parse user requests and determine platform actions
2. Assess risk levels conservatively (when in doubt, mark as higher risk)
3. Provide detailed explanations and rollback plans
4. Only suggest actions you're confident about
5. Never invent resources that don't exist

AVAILABLE ACTIONS: deploy, scale, status, logs, delete, rollback
AVAILABLE RESOURCE TYPES: application, database, service, ingress
AVAILABLE ENVIRONMENTS: development, staging, production

RISK ASSESSMENT RULES:
- development environment: generally low-medium risk
- staging environment: medium risk
- production environment: high-critical risk
- delete operations: always high-critical risk
- scale down operations: medium-high risk
- scale up operations: low-medium risk

SAFETY REQUIREMENTS:
- Always provide detailed rollback plans
- Include estimated impact assessment
- Be explicit about what will change
- Ask for clarification if request is ambiguous

Context: {context}`,
        ],
        ['human', '{input}'],
        new MessagesPlaceholder('agent_scratchpad'),
      ]);

      // Create tool-calling agent
      const agent = await createToolCallingAgent({
        llm: this.model.bindTools(allTools),
        tools: allTools,
        prompt,
      });

      // Create executor
      this.executor = new AgentExecutor({
        agent,
        tools: allTools,
        maxIterations: 5,
        returnIntermediateSteps: false,
        handleParsingErrors: true,
      });

      return this.executor;
    } catch (error) {
      throw new AIError(
        `Failed to initialize Anthropic agent: ${error instanceof Error ? error.message : String(error)}`,
        'anthropic',
        'AGENT_INIT_ERROR',
        { modelName: this.modelName, error }
      );
    }
  }

  /**
   * Parse user intent with structured output
   */
  async parseIntent(
    userInput: string,
    context: {
      userId: string;
      environment: string;
      permissions: string[];
    }
  ) {
    try {
      // Schema for platform action analysis
      const platformActionSchema = z.object({
        action: z.enum(['deploy', 'scale', 'status', 'logs', 'delete', 'rollback']),
        resourceType: z.enum(['application', 'database', 'service', 'ingress']),
        resourceName: z.string().describe('Name of the resource to operate on'),
        environment: z.enum(['development', 'staging', 'production']),
        parameters: z.record(z.any()).describe('Additional parameters for the action'),
        explanation: z.string().describe('Clear explanation of what this action will do'),
        rollbackPlan: z.string().describe('Detailed plan for rolling back this change'),
        riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
        estimatedImpact: z.string().describe('Assessment of impact this change will have'),
        confidence: z.number().min(0).max(1).describe('Confidence in this interpretation'),
      });

      // Use structured output to ensure reliable parsing
      const structuredModel = this.model.withStructuredOutput(platformActionSchema);

      const result = await structuredModel.invoke([
        {
          role: 'system',
          content: `Analyze the user's request and extract a structured platform action. Be conservative with risk assessment - when in doubt, assign higher risk levels.

Environment context: ${context.environment}
User permissions: ${context.permissions.join(', ')}

Rules:
- Only return actions you're confident about
- If the request is unclear, set confidence < 0.7
- Production operations should generally be high/critical risk
- Delete operations are always high/critical risk
- Include specific, actionable rollback plans`,
        },
        {
          role: 'user',
          content: userInput,
        },
      ]);

      return {
        platformAction: result,
        requiresValidation: true,
        requiresApproval: result.riskLevel === 'high' || result.riskLevel === 'critical',
        additionalContext: { originalInput: userInput, context },
      };
    } catch (error) {
      throw new AIError(
        `Failed to parse intent: ${error instanceof Error ? error.message : String(error)}`,
        'anthropic',
        'INTENT_PARSE_ERROR',
        { userInput, context, error }
      );
    }
  }

  /**
   * Generate approval summary for human review
   */
  async generateApprovalSummary(action: any): Promise<string> {
    try {
      const result = await this.model.invoke([
        {
          role: 'system',
          content: `Generate a clear, concise summary for human approval of a platform action. Focus on:
1. What will happen
2. What could go wrong
3. How to rollback if needed
4. Impact assessment

Be specific and actionable. Use bullet points for clarity.`,
        },
        {
          role: 'user',
          content: `Please summarize this platform action for approval:\n${JSON.stringify(action, null, 2)}`,
        },
      ]);

      return result.content as string;
    } catch (error) {
      throw new AIError(
        `Failed to generate approval summary: ${error instanceof Error ? error.message : String(error)}`,
        'anthropic',
        'APPROVAL_SUMMARY_ERROR',
        { action, error }
      );
    }
  }

  /**
   * Chat with the agent using tools
   */
  async chat(input: string, context: Record<string, any> = {}): Promise<string> {
    if (!this.executor) {
      throw new AIError('Agent not initialized. Call initializeAgent() first.', 'anthropic', 'NOT_INITIALIZED');
    }

    try {
      const result = await this.executor.invoke({
        input,
        context: JSON.stringify(context),
      });

      return result.output;
    } catch (error) {
      throw new AIError(
        `Chat failed: ${error instanceof Error ? error.message : String(error)}`,
        'anthropic',
        'CHAT_ERROR',
        { input, context, error }
      );
    }
  }

  /**
   * Stream chat responses
   */
  async *streamChat(input: string, context: Record<string, any> = {}) {
    if (!this.executor) {
      throw new AIError('Agent not initialized. Call initializeAgent() first.', 'anthropic', 'NOT_INITIALIZED');
    }

    try {
      const stream = await this.executor.streamEvents(
        {
          input,
          context: JSON.stringify(context),
        },
        { version: 'v2' }
      );

      for await (const event of stream) {
        if (event.event === 'on_chat_model_stream') {
          yield event.data.chunk?.content ?? '';
        }
      }
    } catch (error) {
      throw new AIError(
        `Stream chat failed: ${error instanceof Error ? error.message : String(error)}`,
        'anthropic',
        'STREAM_CHAT_ERROR',
        { input, context, error }
      );
    }
  }

  /**
   * Validate API key
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.model.invoke([
        {
          role: 'user',
          content: 'Test connection',
        },
      ]);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      provider: 'anthropic',
      model: this.modelName,
      features: {
        toolCalling: true,
        streaming: true,
        structuredOutput: true,
        multimodal: true,
      },
    };
  }
}