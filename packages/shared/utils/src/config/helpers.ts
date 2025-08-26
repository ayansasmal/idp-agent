import { z, type ZodSchema } from 'zod';
import { validateData } from '../validation/index.js';
import { type ServiceErrorContext } from '../errors/index.js';
import { ConfigurationError } from '../errors/index.js';

export interface ConfigOptions {
  prefix?: string;
  required?: boolean;
  defaults?: Record<string, any>;
}

export function loadConfig<T>(
  schema: ZodSchema<T>,
  context: ServiceErrorContext,
  options: ConfigOptions = {}
): T {
  const { prefix = '', required = true, defaults = {} } = options;
  
  try {
    // Collect environment variables with optional prefix
    const envVars: Record<string, any> = {};
    
    // Add defaults first
    Object.assign(envVars, defaults);
    
    // Override with environment variables
    Object.keys(process.env).forEach(key => {
      const envKey = prefix ? key.replace(new RegExp(`^${prefix}_?`), '') : key;
      const value = process.env[key];
      
      if (value !== undefined) {
        // Try to parse as JSON for complex types, fall back to string
        try {
          envVars[envKey.toLowerCase()] = JSON.parse(value);
        } catch {
          // Handle boolean strings
          if (value.toLowerCase() === 'true') envVars[envKey.toLowerCase()] = true;
          else if (value.toLowerCase() === 'false') envVars[envKey.toLowerCase()] = false;
          // Handle number strings
          else if (!isNaN(Number(value)) && value.trim() !== '') {
            envVars[envKey.toLowerCase()] = Number(value);
          }
          else envVars[envKey.toLowerCase()] = value;
        }
      }
    });

    return validateData(envVars, schema, context);
  } catch (error) {
    if (error instanceof Error) {
      throw new ConfigurationError(
        `Configuration validation failed: ${error.message}`,
        context,
        prefix || 'root'
      );
    }
    throw error;
  }
}

export function getConfigValue<T>(
  key: string,
  schema: ZodSchema<T>,
  context: ServiceErrorContext,
  options: {
    prefix?: string;
    defaultValue?: T;
    required?: boolean;
  } = {}
): T {
  const { prefix, defaultValue, required = true } = options;
  const envKey = prefix ? `${prefix}_${key}` : key;
  const value = process.env[envKey];

  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    if (required) {
      throw new ConfigurationError(
        `Required configuration value ${envKey} is not set`,
        context,
        envKey
      );
    }
    return undefined as any;
  }

  try {
    // Try to parse as JSON first
    let parsedValue: any;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      // Handle special string cases
      if (value.toLowerCase() === 'true') parsedValue = true;
      else if (value.toLowerCase() === 'false') parsedValue = false;
      else if (!isNaN(Number(value)) && value.trim() !== '') parsedValue = Number(value);
      else parsedValue = value;
    }

    return validateData(parsedValue, schema, context);
  } catch (error) {
    if (error instanceof Error) {
      throw new ConfigurationError(
        `Invalid configuration value for ${envKey}: ${error.message}`,
        context,
        envKey
      );
    }
    throw error;
  }
}

// Common configuration schemas
export const configSchemas = {
  port: z.number().int().min(1).max(65535),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
  environment: z.enum(['development', 'staging', 'production']),
  url: z.string().url(),
  boolean: z.boolean(),
  nonEmptyString: z.string().min(1),
  timeout: z.number().positive(),
  
  // Database configurations
  database: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    database: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    ssl: z.boolean().default(false),
    maxConnections: z.number().int().positive().default(10)
  }),

  // HTTP client configurations
  httpClient: z.object({
    timeout: z.number().positive().default(30000),
    maxRetries: z.number().int().min(0).default(3),
    retryDelay: z.number().positive().default(1000),
    userAgent: z.string().default('AI-IDP/1.0.0')
  }),

  // Logging configurations
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    service: z.string().min(1),
    environment: z.enum(['development', 'staging', 'production']).default('development')
  }),

  // MCP configurations
  mcp: z.object({
    serverPort: z.number().int().min(1).max(65535).default(3001),
    clientTimeout: z.number().positive().default(30000),
    maxRetries: z.number().int().min(0).default(3),
    retryDelay: z.number().positive().default(1000)
  })
};