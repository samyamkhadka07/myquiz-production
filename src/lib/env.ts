import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  CRON_SECRET: z.string().min(32).optional(),
  META_GRAPH_ACCESS_TOKEN: z.string().min(20).optional(),
  AI_PROVIDER: z.enum(["disabled","openai","openrouter","ollama"]).default("disabled"),
  AI_API_KEY: z.string().min(20).optional(),
  OPENROUTER_API_KEY: z.string().min(20).optional(),
  OLLAMA_BASE_URL: z.url().optional(),
  OLLAMA_MODEL: z.string().min(1).max(200).optional(),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export function getEnv() { return serverSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  META_GRAPH_ACCESS_TOKEN: process.env.META_GRAPH_ACCESS_TOKEN,
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_API_KEY: process.env.AI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
}); }
