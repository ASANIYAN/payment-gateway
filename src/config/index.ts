import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(65535))
    .default(3000),

  DATABASE_URL: z.url().startsWith("postgresql://", {
    message: "DATABASE_URL must be a PostgreSQL connection string",
  }),
  DB_MAX_CONNECTIONS: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(20),

  // Bank API
  BANK_API_URL: z.url(),
  BANK_API_TIMEOUT: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(10000),
  BANK_API_MAX_RETRIES: z
    .string()
    .transform(Number)
    .pipe(z.number().nonnegative())
    .default(3),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Background jobs
  COMPLETER_INTERVAL_MS: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(120000),
  REAPER_INTERVAL_MS: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(3600000),
  STUCK_PAYMENT_THRESHOLD_MS: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(300000),
  CLEANUP_AGE_HOURS: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .default(72),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    result.error.issues.forEach((err) => {
      console.error(`${err.path.join(".")}: ${err.message}`);
    });
    process.exit(1);
  }

  return result.data;
}

const env = parseEnv();

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,

  database: {
    url: env.DATABASE_URL,
    maxConnections: env.DB_MAX_CONNECTIONS,
  },

  bank: {
    url: env.BANK_API_URL,
    timeout: env.BANK_API_TIMEOUT,
    maxRetries: env.BANK_API_MAX_RETRIES,
  },

  logging: {
    level: env.LOG_LEVEL,
  },

  jobs: {
    completerIntervalMs: env.COMPLETER_INTERVAL_MS,
    reaperIntervalMs: env.REAPER_INTERVAL_MS,
    stuckPaymentThresholdMs: env.STUCK_PAYMENT_THRESHOLD_MS,
    cleanupAgeHours: env.CLEANUP_AGE_HOURS,
  },
} as const;

export type Config = typeof config;

export const isDevelopment = config.nodeEnv === "development";
export const isProduction = config.nodeEnv === "production";
