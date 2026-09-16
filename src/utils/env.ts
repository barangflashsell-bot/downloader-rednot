import { z } from 'zod';

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  WEBHOOK_SECRET: z.string().min(1, 'WEBHOOK_SECRET is required'),
  BLOB_READ_WRITE_TOKEN: z.string().min(1, 'BLOB_READ_WRITE_TOKEN is required'),
  WEBHOOK_URL: z.string().url().optional(),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(50),
  TELEGRAM_MAX_FILE_SIZE_MB: z.coerce.number().positive().default(20),
  MAX_CONCURRENT_DOWNLOADS: z.coerce.number().int().positive().default(2),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates runtime environment variables.
 * Returns the parsed configuration or throws an informative error at runtime.
 */
export function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorMessages = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    throw new Error(`Environment validation failed: ${errorMessages}`);
  }
  return result.data;
}

/**
 * Non-throwing safe check to see if required environment variables are set.
 */
export function isEnvConfigured(): boolean {
  const result = envSchema.safeParse(process.env);
  return result.success;
}
