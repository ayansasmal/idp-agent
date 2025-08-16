import { z } from 'zod';
import 'dotenv/config';

// ============================================================================
// Configuration Schemas
// ============================================================================

const EnvironmentSchema = z.enum(['development', 'staging', 'production', 'test']);

const DatabaseConfigSchema = z.object({
  url: z.string().url(),
  maxConnections: z.number().default(10),
  connectionTimeout: z.number().default(30000),
});

const RedisConfigSchema = z.object({
  url: z.string(),
  maxRetries: z.number().default(3),
  retryDelay: z.number().default(1000),
});

const AIConfigSchema = z.object({
  primaryProvider: z.literal('anthropic'),
  anthropic: z.object({
    apiKey: z.string().min(1, 'Anthropic API key is required'),
    model: z.string().default('claude-sonnet-4-20250514'),
    temperature: z.number().min(0).max(2).default(0),
    maxTokens: z.number().positive().default(4096),
    maxRetries: z.number().positive().default(3),
  }),
  retryConfig: z.object({
    maxRetries: z.number().positive().default(3),
    backoffMs: z.number().positive().default(1000),
  }).optional(),
});

const KubernetesConfigSchema = z.object({
  kubeconfig: z.string().optional(),
  namespace: z.string().default('ai-idp'),
  timeout: z.number().default(30000),
});

const SlackConfigSchema = z.object({
  botToken: z.string().optional(),
  appToken: z.string().optional(),
  signingSecret: z.string().optional(),
  approvalChannel: z.string().default('#platform-approvals'),
}).optional();

const SecurityConfigSchema = z.object({
  jwtSecret: z.string().min(32, 'JWT secret must be at least 32 characters'),
  sessionSecret: z.string().min(32, 'Session secret must be at least 32 characters'),
  encryptionKey: z.string().length(32, 'Encryption key must be exactly 32 characters'),
});

const AppConfigSchema = z.object({
  nodeEnv: EnvironmentSchema,
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  port: z.number().default(3000),
  apiPort: z.number().default(3001),
  webPort: z.number().default(3002),
  slackPort: z.number().default(3003),
});

const MonitoringConfigSchema = z.object({
  prometheus: z.object({
    enabled: z.boolean().default(true),
    port: z.number().default(9090),
  }),
  sentry: z.object({
    dsn: z.string().optional(),
    environment: z.string().optional(),
  }).optional(),
});

// Main configuration schema
const ConfigSchema = z.object({
  app: AppConfigSchema,
  database: DatabaseConfigSchema,
  redis: RedisConfigSchema,
  ai: AIConfigSchema,
  kubernetes: KubernetesConfigSchema,
  slack: SlackConfigSchema,
  security: SecurityConfigSchema,
  monitoring: MonitoringConfigSchema,
});

export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Configuration Manager
// ============================================================================

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfig(): Config {
    const rawConfig = {
      app: {
        nodeEnv: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info',
        port: parseInt(process.env.PORT || '3000'),
        apiPort: parseInt(process.env.API_PORT || '3001'),
        webPort: parseInt(process.env.WEB_PORT || '3002'),
        slackPort: parseInt(process.env.SLACK_PORT || '3003'),
      },
      database: {
        url: process.env.DATABASE_URL || 'postgresql://ai_idp:password@localhost:5432/ai_idp',
        maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10'),
        connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '30000'),
      },
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
        retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000'),
      },
      ai: {
        primaryProvider: 'anthropic' as const,
        anthropic: {
          apiKey: process.env.ANTHROPIC_API_KEY || '',
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
          temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE || '0'),
          maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '4096'),
          maxRetries: parseInt(process.env.AI_MAX_RETRIES || '3'),
        },
        retryConfig: {
          maxRetries: parseInt(process.env.AI_MAX_RETRIES || '3'),
          backoffMs: parseInt(process.env.AI_BACKOFF_MS || '1000'),
        },
      },
      kubernetes: {
        kubeconfig: process.env.KUBECONFIG,
        namespace: process.env.KUBERNETES_NAMESPACE || 'ai-idp',
        timeout: parseInt(process.env.KUBERNETES_TIMEOUT || '30000'),
      },
      slack: process.env.SLACK_BOT_TOKEN ? {
        botToken: process.env.SLACK_BOT_TOKEN,
        appToken: process.env.SLACK_APP_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        approvalChannel: process.env.SLACK_APPROVAL_CHANNEL || '#platform-approvals',
      } : undefined,
      security: {
        jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-must-be-32-chars-minimum',
        sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-must-be-32-chars-minimum',
        encryptionKey: process.env.ENCRYPTION_KEY || '12345678901234567890123456789012', // 32 chars
      },
      monitoring: {
        prometheus: {
          enabled: process.env.PROMETHEUS_ENABLED !== 'false',
          port: parseInt(process.env.PROMETHEUS_PORT || '9090'),
        },
        sentry: process.env.SENTRY_DSN ? {
          dsn: process.env.SENTRY_DSN,
          environment: process.env.NODE_ENV,
        } : undefined,
      },
    };

    try {
      return ConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        throw new Error(`Configuration validation failed:\n${errorMessages.join('\n')}`);
      }
      throw error;
    }
  }

  /**
   * Get the full configuration
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * Get app configuration
   */
  getAppConfig() {
    return this.config.app;
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    return this.config.database;
  }

  /**
   * Get Redis configuration
   */
  getRedisConfig() {
    return this.config.redis;
  }

  /**
   * Get AI configuration
   */
  getAIConfig() {
    return this.config.ai;
  }

  /**
   * Get Kubernetes configuration
   */
  getKubernetesConfig() {
    return this.config.kubernetes;
  }

  /**
   * Get Slack configuration (if available)
   */
  getSlackConfig() {
    return this.config.slack;
  }

  /**
   * Get security configuration
   */
  getSecurityConfig() {
    return this.config.security;
  }

  /**
   * Get monitoring configuration
   */
  getMonitoringConfig() {
    return this.config.monitoring;
  }

  /**
   * Check if running in development mode
   */
  isDevelopment(): boolean {
    return this.config.app.nodeEnv === 'development';
  }

  /**
   * Check if running in production mode
   */
  isProduction(): boolean {
    return this.config.app.nodeEnv === 'production';
  }

  /**
   * Check if Slack is configured
   */
  isSlackConfigured(): boolean {
    return this.config.slack !== undefined && !!this.config.slack.botToken;
  }

  /**
   * Validate configuration (useful for startup checks)
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required environment variables
    if (!process.env.ANTHROPIC_API_KEY) {
      errors.push('ANTHROPIC_API_KEY environment variable is required');
    }

    if (!process.env.DATABASE_URL) {
      errors.push('DATABASE_URL environment variable is required');
    }

    // Validate security settings in production
    if (this.isProduction()) {
      if (this.config.security.jwtSecret.includes('your-super-secret')) {
        errors.push('JWT_SECRET must be changed from default value in production');
      }

      if (this.config.security.sessionSecret.includes('your-session-secret')) {
        errors.push('SESSION_SECRET must be changed from default value in production');
      }

      if (this.config.security.encryptionKey === '12345678901234567890123456789012') {
        errors.push('ENCRYPTION_KEY must be changed from default value in production');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance();