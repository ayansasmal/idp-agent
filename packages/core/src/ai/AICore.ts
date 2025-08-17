import { AnthropicProvider } from './providers/AnthropicProvider';
import { AIError, IntentAnalysis, RequestContext } from '@/types';

export interface AIConfig {
  primaryProvider?: 'anthropic';
  anthropic?: {
    apiKey?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    maxRetries?: number;
  };
  fallbackProviders?: string[];
  retryConfig?: {
    maxRetries?: number;
    backoffMs?: number;
  };
}

/**
 * AI Core - LLM-agnostic interface for AI operations
 * Currently supports Anthropic Claude with LangChain integration
 * Designed for easy provider switching and extensibility
 */
export class AICore {
  private providers = new Map<string, any>();
  private config: AIConfig;
  private currentProvider?: AnthropicProvider;

  constructor(config: AIConfig) {
    this.config = config;
    this.initializeProviders();
  }

  /**
   * Initialize AI providers based on configuration
   */
  private initializeProviders(): void {
    // Initialize Anthropic provider
    if (this.config.anthropic?.apiKey) {
      const provider = new AnthropicProvider(
        this.config.anthropic.apiKey,
        this.config.anthropic.model || 'claude-sonnet-4-20250514',
        {
          temperature: this.config.anthropic.temperature,
          maxTokens: this.config.anthropic.maxTokens,
          maxRetries: this.config.anthropic.maxRetries,
        }
      );

      this.providers.set('anthropic', provider);
      this.currentProvider = provider;
    }

    // Validate primary provider exists
    if (!this.providers.has(this.config.primaryProvider)) {
      throw new AIError(
        `Primary provider '${this.config.primaryProvider}' not configured`,
        this.config.primaryProvider,
        'PROVIDER_NOT_CONFIGURED'
      );
    }
  }

  /**
   * Initialize the AI agent with tools
   */
  async initialize(tools: any[] = []) {
    if (!this.currentProvider) {
      throw new AIError('No provider available', 'none', 'NO_PROVIDER');
    }

    try {
      await this.currentProvider.initializeAgent(tools);
    } catch (error) {
      throw new AIError(
        `Failed to initialize AI agent: ${error instanceof Error ? error.message : String(error)}`,
        this.config.primaryProvider,
        'INITIALIZATION_ERROR',
        { error }
      );
    }
  }

  /**
   * Parse user intent from natural language input
   */
  async parseIntent(
    userInput: string,
    context: RequestContext
  ): Promise<IntentAnalysis> {
    if (!this.currentProvider) {
      throw new AIError('No provider available', 'none', 'NO_PROVIDER');
    }

    try {
      const result = await this.executeWithRetry(async () => {
        return await this.currentProvider!.parseIntent(userInput, {
          userId: context.userId,
          environment: context.environment,
          permissions: context.permissions,
        });
      });

      // Validate the result
      if (!result.platformAction) {
        throw new AIError(
          'Invalid intent analysis result',
          this.config.primaryProvider,
          'INVALID_RESULT'
        );
      }

      return {
        platformAction: result.platformAction,
        confidence: result.platformAction.confidence,
        requiresValidation: result.requiresValidation,
        requiresApproval: result.requiresApproval,
        additionalContext: result.additionalContext,
      };
    } catch (error) {
      if (error instanceof AIError) throw error;

      throw new AIError(
        `Intent parsing failed: ${error instanceof Error ? error.message : String(error)}`,
        this.config.primaryProvider,
        'INTENT_PARSE_ERROR',
        { userInput, context, error }
      );
    }
  }

  /**
   * Generate approval summary for human review
   */
  async generateApprovalSummary(action: any): Promise<string> {
    if (!this.currentProvider) {
      throw new AIError('No provider available', 'none', 'NO_PROVIDER');
    }

    try {
      return await this.executeWithRetry(async () => {
        return await this.currentProvider!.generateApprovalSummary(action);
      });
    } catch (error) {
      if (error instanceof AIError) throw error;

      throw new AIError(
        `Failed to generate approval summary: ${error instanceof Error ? error.message : String(error)}`,
        this.config.primaryProvider,
        'APPROVAL_SUMMARY_ERROR',
        { action, error }
      );
    }
  }

  /**
   * Chat with the AI agent
   */
  async chat(input: string, context: Record<string, any> = {}): Promise<string> {
    if (!this.currentProvider) {
      throw new AIError('No provider available', 'none', 'NO_PROVIDER');
    }

    try {
      return await this.executeWithRetry(async () => {
        return await this.currentProvider!.chat(input, context);
      });
    } catch (error) {
      if (error instanceof AIError) throw error;

      throw new AIError(
        `Chat failed: ${error instanceof Error ? error.message : String(error)}`,
        this.config.primaryProvider,
        'CHAT_ERROR',
        { input, context, error }
      );
    }
  }

  /**
   * Stream chat responses
   */
  async *streamChat(input: string, context: Record<string, any> = {}) {
    if (!this.currentProvider) {
      throw new AIError('No provider available', 'none', 'NO_PROVIDER');
    }

    try {
      for await (const chunk of this.currentProvider.streamChat(input, context)) {
        yield chunk;
      }
    } catch (error) {
      throw new AIError(
        `Stream chat failed: ${error instanceof Error ? error.message : String(error)}`,
        this.config.primaryProvider,
        'STREAM_CHAT_ERROR',
        { input, context, error }
      );
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxRetries = this.config.retryConfig?.maxRetries || 3;
    const backoffMs = this.config.retryConfig?.backoffMs || 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) throw error;

        // Don't retry certain error types
        if (error instanceof AIError && error.errorCode === 'INVALID_API_KEY') {
          throw error;
        }

        // Wait before retry with exponential backoff
        await this.delay(backoffMs * Math.pow(2, attempt - 1));
      }
    }

    throw new Error('All retry attempts failed');
  }

  /**
   * Validate all configured providers
   */
  async validateProviders(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [name, provider] of this.providers) {
      try {
        results[name] = await provider.validateApiKey();
      } catch (error) {
        results[name] = false;
      }
    }

    return results;
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get current provider information
   */
  getCurrentProviderInfo() {
    if (!this.currentProvider) {
      return null;
    }

    return this.currentProvider.getModelInfo();
  }

  /**
   * Check if AI is ready to use
   */
  isReady(): boolean {
    return this.currentProvider !== undefined;
  }

  /**
   * Delay utility for retry backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}