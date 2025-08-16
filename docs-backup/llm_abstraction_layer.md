# LLM-Agnostic AI Abstraction Layer

## Design Philosophy

Create a unified AI interface that abstracts away LLM provider differences, making it trivial to switch between Anthropic Claude, OpenAI GPT, or any future LLM without changing application code.

## Core Abstraction Interface

### Base AI Provider Interface

```typescript
// packages/core/src/ai/providers/BaseAIProvider.ts
export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    metadata?: Record<string, any>;
}

export interface AIFunction {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
}

export interface AIRequest {
    messages: AIMessage[];
    functions?: AIFunction[];
    functionCall?: 'auto' | 'none' | { name: string };
    temperature?: number;
    maxTokens?: number;
    model?: string;
}

export interface AIResponse {
    content: string;
    functionCall?: {
        name: string;
        arguments: string; // JSON string
    };
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model: string;
    provider: string;
}

export abstract class BaseAIProvider {
    abstract readonly name: string;
    abstract readonly models: string[];
    abstract readonly supportsStreaming: boolean;
    abstract readonly supportsFunctions: boolean;
    
    abstract chat(request: AIRequest): Promise<AIResponse>;
    abstract chatStream?(request: AIRequest): AsyncIterable<Partial<AIResponse>>;
    abstract validateApiKey(): Promise<boolean>;
    abstract getDefaultModel(): string;
}
```

### Anthropic Provider Implementation

```typescript
// packages/core/src/ai/providers/AnthropicProvider.ts
import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider extends BaseAIProvider {
    readonly name = 'anthropic';
    readonly models = [
        'claude-3-5-sonnet-20241022',
        'claude-3-haiku-20240307',
        'claude-3-opus-20240229'
    ];
    readonly supportsStreaming = true;
    readonly supportsFunctions = true;
    
    private client: Anthropic;
    
    constructor(apiKey: string) {
        super();
        this.client = new Anthropic({ apiKey });
    }
    
    async chat(request: AIRequest): Promise<AIResponse> {
        try {
            // Convert our format to Anthropic format
            const anthropicRequest = this.convertToAnthropicFormat(request);
            
            const response = await this.client.messages.create(anthropicRequest);
            
            // Convert Anthropic response back to our format
            return this.convertFromAnthropicFormat(response);
        } catch (error) {
            throw new AIProviderError(`Anthropic request failed: ${error.message}`, error);
        }
    }
    
    async *chatStream(request: AIRequest): AsyncIterable<Partial<AIResponse>> {
        const anthropicRequest = this.convertToAnthropicFormat(request);
        
        const stream = await this.client.messages.create({
            ...anthropicRequest,
            stream: true
        });
        
        for await (const chunk of stream) {
            yield this.convertStreamChunk(chunk);
        }
    }
    
    private convertToAnthropicFormat(request: AIRequest): Anthropic.MessageCreateParams {
        // Extract system messages
        const systemMessages = request.messages.filter(m => m.role === 'system');
        const conversationMessages = request.messages.filter(m => m.role !== 'system');
        
        const systemPrompt = systemMessages.map(m => m.content).join('\n\n');
        
        // Convert messages to Anthropic format
        const messages: Anthropic.MessageParam[] = conversationMessages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
        }));
        
        // Handle function calling with Claude's tool use
        const tools: Anthropic.Tool[] | undefined = request.functions?.map(func => ({
            name: func.name,
            description: func.description,
            input_schema: func.parameters
        }));
        
        return {
            model: request.model || this.getDefaultModel(),
            max_tokens: request.maxTokens || 4096,
            temperature: request.temperature || 0,
            system: systemPrompt || undefined,
            messages,
            tools,
            tool_choice: this.convertFunctionCallPreference(request.functionCall)
        };
    }
    
    private convertFromAnthropicFormat(response: Anthropic.Message): AIResponse {
        let content = '';
        let functionCall: AIResponse['functionCall'] | undefined;
        
        // Handle text content
        const textContent = response.content.find(c => c.type === 'text');
        if (textContent && 'text' in textContent) {
            content = textContent.text;
        }
        
        // Handle tool use (function calls)
        const toolUse = response.content.find(c => c.type === 'tool_use');
        if (toolUse && 'name' in toolUse && 'input' in toolUse) {
            functionCall = {
                name: toolUse.name,
                arguments: JSON.stringify(toolUse.input)
            };
        }
        
        return {
            content,
            functionCall,
            usage: response.usage ? {
                promptTokens: response.usage.input_tokens,
                completionTokens: response.usage.output_tokens,
                totalTokens: response.usage.input_tokens + response.usage.output_tokens
            } : undefined,
            model: response.model,
            provider: this.name
        };
    }
    
    private convertFunctionCallPreference(
        preference?: AIRequest['functionCall']
    ): Anthropic.MessageCreateParams['tool_choice'] {
        if (!preference || preference === 'none') return undefined;
        if (preference === 'auto') return { type: 'auto' };
        if (typeof preference === 'object') {
            return { type: 'tool', name: preference.name };
        }
        return undefined;
    }
    
    async validateApiKey(): Promise<boolean> {
        try {
            await this.client.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hi' }]
            });
            return true;
        } catch (error) {
            return false;
        }
    }
    
    getDefaultModel(): string {
        return 'claude-3-5-sonnet-20241022';
    }
}
```

### OpenAI Provider Implementation

```typescript
// packages/core/src/ai/providers/OpenAIProvider.ts
import OpenAI from 'openai';

export class OpenAIProvider extends BaseAIProvider {
    readonly name = 'openai';
    readonly models = [
        'gpt-4-turbo-preview',
        'gpt-4-1106-preview',
        'gpt-3.5-turbo-1106'
    ];
    readonly supportsStreaming = true;
    readonly supportsFunctions = true;
    
    private client: OpenAI;
    
    constructor(apiKey: string) {
        super();
        this.client = new OpenAI({ apiKey });
    }
    
    async chat(request: AIRequest): Promise<AIResponse> {
        try {
            const openaiRequest = this.convertToOpenAIFormat(request);
            
            const response = await this.client.chat.completions.create(openaiRequest);
            
            return this.convertFromOpenAIFormat(response);
        } catch (error) {
            throw new AIProviderError(`OpenAI request failed: ${error.message}`, error);
        }
    }
    
    async *chatStream(request: AIRequest): AsyncIterable<Partial<AIResponse>> {
        const openaiRequest = this.convertToOpenAIFormat(request);
        
        const stream = await this.client.chat.completions.create({
            ...openaiRequest,
            stream: true
        });
        
        for await (const chunk of stream) {
            yield this.convertStreamChunk(chunk);
        }
    }
    
    private convertToOpenAIFormat(request: AIRequest): OpenAI.ChatCompletionCreateParams {
        return {
            model: request.model || this.getDefaultModel(),
            messages: request.messages.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            functions: request.functions?.map(func => ({
                name: func.name,
                description: func.description,
                parameters: func.parameters
            })),
            function_call: request.functionCall,
            temperature: request.temperature || 0,
            max_tokens: request.maxTokens || 4096
        };
    }
    
    private convertFromOpenAIFormat(response: OpenAI.ChatCompletion): AIResponse {
        const choice = response.choices[0];
        
        return {
            content: choice.message.content || '',
            functionCall: choice.message.function_call ? {
                name: choice.message.function_call.name,
                arguments: choice.message.function_call.arguments
            } : undefined,
            usage: response.usage ? {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens
            } : undefined,
            model: response.model,
            provider: this.name
        };
    }
    
    async validateApiKey(): Promise<boolean> {
        try {
            await this.client.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 5
            });
            return true;
        } catch (error) {
            return false;
        }
    }
    
    getDefaultModel(): string {
        return 'gpt-4-turbo-preview';
    }
}
```

### AI Core with Provider Management

```typescript
// packages/core/src/ai/AICore.ts
export interface AIConfig {
    primaryProvider: string;
    fallbackProviders?: string[];
    anthropic?: {
        apiKey: string;
        defaultModel?: string;
    };
    openai?: {
        apiKey: string;
        defaultModel?: string;
    };
    retryConfig?: {
        maxRetries: number;
        backoffMs: number;
    };
}

export class AICore {
    private providers = new Map<string, BaseAIProvider>();
    private config: AIConfig;
    private logger = new Logger('AICore');
    
    constructor(config: AIConfig) {
        this.config = config;
        this.initializeProviders();
    }
    
    private initializeProviders(): void {
        // Initialize Anthropic if configured
        if (this.config.anthropic?.apiKey) {
            this.providers.set('anthropic', new AnthropicProvider(this.config.anthropic.apiKey));
        }
        
        // Initialize OpenAI if configured
        if (this.config.openai?.apiKey) {
            this.providers.set('openai', new OpenAIProvider(this.config.openai.apiKey));
        }
        
        // Validate primary provider exists
        if (!this.providers.has(this.config.primaryProvider)) {
            throw new Error(`Primary provider '${this.config.primaryProvider}' not configured`);
        }
    }
    
    async chat(request: AIRequest, options?: { provider?: string }): Promise<AIResponse> {
        const providerName = options?.provider || this.config.primaryProvider;
        const provider = this.getProvider(providerName);
        
        this.logger.info('Sending AI request', {
            provider: providerName,
            model: request.model || provider.getDefaultModel(),
            functions: request.functions?.length || 0
        });
        
        try {
            const response = await this.executeWithRetry(provider, request);
            
            this.logger.info('AI request completed', {
                provider: providerName,
                usage: response.usage
            });
            
            return response;
        } catch (error) {
            this.logger.error('AI request failed', {
                provider: providerName,
                error: error.message
            });
            
            // Try fallback providers
            return await this.tryFallbackProviders(request, [providerName]);
        }
    }
    
    private async executeWithRetry(provider: BaseAIProvider, request: AIRequest): Promise<AIResponse> {
        const maxRetries = this.config.retryConfig?.maxRetries || 3;
        const backoffMs = this.config.retryConfig?.backoffMs || 1000;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await provider.chat(request);
            } catch (error) {
                if (attempt === maxRetries) throw error;
                
                this.logger.warn(`AI request attempt ${attempt} failed, retrying`, {
                    provider: provider.name,
                    error: error.message,
                    nextAttemptIn: backoffMs * attempt
                });
                
                await this.delay(backoffMs * attempt);
            }
        }
        
        throw new Error('All retry attempts failed');
    }
    
    private async tryFallbackProviders(
        request: AIRequest, 
        triedProviders: string[]
    ): Promise<AIResponse> {
        const fallbackProviders = this.config.fallbackProviders || [];
        
        for (const providerName of fallbackProviders) {
            if (triedProviders.includes(providerName)) continue;
            
            const provider = this.providers.get(providerName);
            if (!provider) continue;
            
            this.logger.info('Trying fallback provider', { provider: providerName });
            
            try {
                return await provider.chat(request);
            } catch (error) {
                this.logger.warn('Fallback provider failed', {
                    provider: providerName,
                    error: error.message
                });
                triedProviders.push(providerName);
            }
        }
        
        throw new Error('All providers failed');
    }
    
    private getProvider(name: string): BaseAIProvider {
        const provider = this.providers.get(name);
        if (!provider) {
            throw new Error(`Provider '${name}' not found`);
        }
        return provider;
    }
    
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
    
    getAvailableProviders(): string[] {
        return Array.from(this.providers.keys());
    }
    
    switchPrimaryProvider(providerName: string): void {
        if (!this.providers.has(providerName)) {
            throw new Error(`Provider '${providerName}' not available`);
        }
        
        this.config.primaryProvider = providerName;
        this.logger.info('Switched primary provider', { provider: providerName });
    }
    
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
```

### Platform-Specific AI Operations

```typescript
// packages/core/src/ai/PlatformAI.ts
export class PlatformAI {
    private aiCore: AICore;
    private structuredResponseValidator: StructuredResponseValidator;
    
    constructor(aiCore: AICore) {
        this.aiCore = aiCore;
        this.structuredResponseValidator = new StructuredResponseValidator();
    }
    
    async parseIntent(userInput: string, context: RequestContext): Promise<IntentAnalysis> {
        const functions: AIFunction[] = [{
            name: 'analyze_platform_intent',
            description: 'Analyze user intent for platform operations',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['deploy', 'scale', 'status', 'logs', 'delete', 'rollback']
                    },
                    resourceType: {
                        type: 'string',
                        enum: ['application', 'database', 'service', 'ingress']
                    },
                    resourceName: { type: 'string' },
                    environment: {
                        type: 'string',
                        enum: ['development', 'staging', 'production']
                    },
                    parameters: { type: 'object' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    explanation: { type: 'string' },
                    riskLevel: {
                        type: 'string',
                        enum: ['low', 'medium', 'high', 'critical']
                    }
                },
                required: ['action', 'resourceType', 'environment', 'confidence', 'explanation', 'riskLevel']
            }
        }];
        
        const messages: AIMessage[] = [
            {
                role: 'system',
                content: this.buildSystemPrompt(context)
            },
            {
                role: 'user',
                content: userInput
            }
        ];
        
        const response = await this.aiCore.chat({
            messages,
            functions,
            functionCall: { name: 'analyze_platform_intent' },
            temperature: 0.1
        });
        
        if (!response.functionCall) {
            throw new Error('AI did not provide structured intent analysis');
        }
        
        // Validate and parse the structured response
        const intentData = JSON.parse(response.functionCall.arguments);
        return this.structuredResponseValidator.validateIntentAnalysis(intentData);
    }
    
    async generateApprovalSummary(action: PlatformAction): Promise<string> {
        const messages: AIMessage[] = [
            {
                role: 'system',
                content: 'Generate a clear, concise summary for human approval of a platform action. Focus on impact, risks, and what will change.'
            },
            {
                role: 'user',
                content: `Please summarize this platform action for approval:\n${JSON.stringify(action, null, 2)}`
            }
        ];
        
        const response = await this.aiCore.chat({
            messages,
            temperature: 0.3,
            maxTokens: 500
        });
        
        return response.content;
    }
    
    async generateRollbackPlan(action: PlatformAction): Promise<string> {
        const messages: AIMessage[] = [
            {
                role: 'system',
                content: 'Generate a detailed rollback plan for a platform action. Include specific steps and commands.'
            },
            {
                role: 'user',
                content: `Generate rollback plan for:\n${JSON.stringify(action, null, 2)}`
            }
        ];
        
        const response = await this.aiCore.chat({
            messages,
            temperature: 0.1,
            maxTokens: 1000
        });
        
        return response.content;
    }
    
    private buildSystemPrompt(context: RequestContext): string {
        return `You are an AI assistant for a Kubernetes platform. Your role is to analyze user requests and provide structured responses for platform operations.

Context:
- User: ${context.userId}
- Environment permissions: ${context.permissions.join(', ')}
- Current environment context: ${context.environment}

Rules:
1. Only suggest actions you're confident about
2. Assess risk conservatively - when in doubt, mark as higher risk
3. Never invent resources that don't exist
4. Provide clear explanations for your decisions
5. Consider environment-specific constraints (production is high-risk)

Available actions: deploy, scale, status, logs, delete, rollback
Available resource types: application, database, service, ingress
Available environments: development, staging, production`;
    }
}
```

### Easy Provider Switching Configuration

```typescript
// packages/core/src/config/ai.config.ts
export const createAIConfig = (): AIConfig => {
    const config: AIConfig = {
        // Primary provider - easily changeable
        primaryProvider: process.env.AI_PRIMARY_PROVIDER || 'anthropic',
        
        // Fallback providers for reliability
        fallbackProviders: ['openai', 'anthropic'].filter(p => p !== process.env.AI_PRIMARY_PROVIDER),
        
        // Provider configurations
        anthropic: process.env.ANTHROPIC_API_KEY ? {
            apiKey: process.env.ANTHROPIC_API_KEY,
            defaultModel: process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-3-5-sonnet-20241022'
        } : undefined,
        
        openai: process.env.OPENAI_API_KEY ? {
            apiKey: process.env.OPENAI_API_KEY,
            defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4-turbo-preview'
        } : undefined,
        
        // Retry configuration
        retryConfig: {
            maxRetries: parseInt(process.env.AI_MAX_RETRIES || '3'),
            backoffMs: parseInt(process.env.AI_BACKOFF_MS || '1000')
        }
    };
    
    return config;
};
```

### Environment Configuration

```bash
# .env file for easy provider switching

# Primary AI provider (anthropic, openai)
AI_PRIMARY_PROVIDER=anthropic

# Anthropic configuration
ANTHROPIC_API_KEY=your_anthropic_key_here
ANTHROPIC_DEFAULT_MODEL=claude-3-5-sonnet-20241022

# OpenAI configuration (for fallback)
OPENAI_API_KEY=your_openai_key_here
OPENAI_DEFAULT_MODEL=gpt-4-turbo-preview

# Retry configuration
AI_MAX_RETRIES=3
AI_BACKOFF_MS=1000
```

## Usage Examples

### Easy Provider Switching
```typescript
// Switch providers at runtime
const aiCore = new AICore(createAIConfig());

// Use default (Anthropic)
const response1 = await aiCore.chat({ messages: [...] });

// Force specific provider
const response2 = await aiCore.chat({ messages: [...] }, { provider: 'openai' });

// Switch default provider
aiCore.switchPrimaryProvider('openai');
```

### Configuration-based Switching
```typescript
// Development: Use Anthropic
process.env.AI_PRIMARY_PROVIDER = 'anthropic';

// Production: Use OpenAI with Anthropic fallback
process.env.AI_PRIMARY_PROVIDER = 'openai';

// Both configurations work with zero code changes
const aiCore = new AICore(createAIConfig());
```

## Benefits of This Approach

1. **Zero Code Changes**: Switch providers by changing environment variables
2. **Automatic Fallback**: If primary provider fails, automatically try fallbacks
3. **Provider-Specific Optimization**: Each provider uses its native features optimally
4. **Type Safety**: Strong TypeScript types prevent runtime errors
5. **Extensible**: Easy to add new LLM providers
6. **Testing**: Mock providers for unit testing
7. **Cost Optimization**: Choose providers based on cost/performance needs
8. **Vendor Independence**: Never locked into a single LLM provider

This abstraction layer ensures that the choice of LLM provider is purely a configuration decision, not an architectural constraint.