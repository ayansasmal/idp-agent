import { z, type ZodSchema, type ZodError } from 'zod';
import { ValidationError, type ValidationErrorDetail, type ServiceErrorContext } from '../errors/index.js';

export function validateData<T>(
  data: unknown,
  schema: ZodSchema<T>,
  context: ServiceErrorContext
): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = formatZodErrors(error);
      throw new ValidationError(
        `Validation failed: ${details.map(d => d.message).join(', ')}`,
        details,
        context
      );
    }
    throw error;
  }
}

export function validateDataSafe<T>(
  data: unknown,
  schema: ZodSchema<T>
): { success: true; data: T } | { success: false; errors: ValidationErrorDetail[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: formatZodErrors(result.error) };
  }
}

export function formatZodErrors(error: ZodError): ValidationErrorDetail[] {
  return error.issues.map(err => ({
    field: err.path.join('.') || 'root',
    message: err.message,
    code: err.code,
    value: err.code !== 'invalid_type' ? (err as any).received : undefined
  }));
}

// Common validation schemas
export const commonSchemas = {
  email: z.string().email('Must be a valid email address'),
  url: z.string().url('Must be a valid URL'),
  uuid: z.string().uuid('Must be a valid UUID'),
  port: z.number().int().min(1).max(65535),
  nonEmptyString: z.string().min(1, 'Cannot be empty'),
  positiveNumber: z.number().positive(),
  
  // Environment validation
  environment: z.enum(['development', 'staging', 'production']),
  
  // Common API patterns
  paginationParams: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20)
  }),
  
  // Resource identifiers
  resourceName: z.string()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Must be lowercase alphanumeric with hyphens')
    .min(1)
    .max(63),
    
  namespace: z.string()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Must be lowercase alphanumeric with hyphens')
    .min(1)
    .max(63)
};

// Configuration validation helpers
export function getRequiredEnv(key: string, context: ServiceErrorContext): string {
  const value = process.env[key];
  if (!value) {
    throw new ValidationError(
      `Required environment variable ${key} is not set`,
      [{ field: key, message: 'Environment variable is required' }],
      { ...context, metadata: { configKey: key } }
    );
  }
  return value;
}

export function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export function getNumberEnv(key: string, defaultValue: number, context: ServiceErrorContext): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ValidationError(
      `Environment variable ${key} must be a valid number`,
      [{ field: key, message: 'Must be a valid number', value }],
      { ...context, metadata: { configKey: key } }
    );
  }
  
  return parsed;
}

export function getBooleanEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  
  return value.toLowerCase() === 'true' || value === '1';
}