import { z } from "zod";

// Fail loudly at boot rather than mysteriously at 2am on a webhook.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  APP_URL: z.string().url(),

  MESHAPI_BASE_URL: z.string().url(),
  MESHAPI_KEY: z.string().default(""),
  MODEL_CHAT: z.string().min(1),
  MODEL_UTILITY: z.string().min(1),

  WAHA_URL: z.string().url().optional(),
  WAHA_API_KEY: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  MAX_COST_USD_PER_CONVERSATION: z.coerce.number().positive().default(0.5),
  MAX_COST_USD_PER_ORG_PER_DAY: z.coerce.number().positive().default(25),
  MAX_AGENT_STEPS: z.coerce.number().int().positive().default(8),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment.\n${missing}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;
