import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const sourceSchema = z.object({
  type: z.enum(["inbox", "rss", "inbox-or-rss"]),
  inboxFile: z.string().optional(),
  rssUrl: z.string().url().optional(),
  rssItemCount: z.number().int().positive().optional(),
  /**
   * When true, an empty source skips the job instead of failing
   * (useful for inbox-only categories like music / horror).
   */
  optional: z.boolean().optional(),
});

const llmSchema = z.object({
  provider: z.enum(["cursor-cloud-agent", "openai-compatible"]),
  model: z.string().optional(),
});

const deliverySchema = z.object({
  type: z.enum(["bark", "none"]),
  titlePrefix: z.string().optional(),
  /** Title preset id from config/bark-presets.yaml (e.g. english, stranger). */
  titlePreset: z.string().min(1).optional(),
  /** When true with titlePreset, append " · MMDD" after the preset title. */
  appendDate: z.boolean().optional(),
  /** Bark aliases from env (e.g. daj, lzx). Empty/omit = all devices. */
  targets: z.array(z.string().min(1)).optional(),
});

const scheduleSchema = z
  .object({
    timezone: z.string().optional(),
    runAt: z.string().optional(),
    pushAt: z.string().optional(),
  })
  .optional();

const jobSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  description: z.string().optional(),
  /**
   * Notes/site category folder (e.g. world, tech).
   * Falls back to the topic label when omitted.
   */
  category: z.string().min(1).optional(),
  schedule: scheduleSchema,
  topic: z.enum(["english-vocab", "finance-brief"]),
  source: sourceSchema,
  llm: llmSchema,
  delivery: deliverySchema,
});

const configSchema = z.object({
  defaults: z
    .object({
      notesDir: z.string().default("notes"),
      inboxDir: z.string().default("inbox"),
      barkMaxChars: z.number().int().positive().default(850),
    })
    .default({}),
  jobs: z.array(jobSchema).min(1),
});

export type AppConfig = z.infer<typeof configSchema>;
export type JobConfig = z.infer<typeof jobSchema>;

/**
 * Loads and validates jobs.yaml from disk.
 */
export function loadConfig(configPath = process.env.CONFIG_PATH ?? "config/jobs.yaml"): AppConfig {
  const absolute = resolve(process.cwd(), configPath);
  const raw = readFileSync(absolute, "utf8");
  const parsed = parseYaml(raw);
  return configSchema.parse(parsed);
}

/**
 * Returns a job by id or throws a clear error.
 */
export function getJob(config: AppConfig, jobId: string): JobConfig {
  const job = config.jobs.find((item) => item.id === jobId);
  if (!job) {
    const known = config.jobs.map((item) => item.id).join(", ");
    throw new Error(`Unknown job "${jobId}". Known jobs: ${known}`);
  }
  return job;
}

/**
 * Lists enabled jobs (or all jobs when includeDisabled is true).
 */
export function listJobs(config: AppConfig, includeDisabled = false): JobConfig[] {
  return includeDisabled ? config.jobs : config.jobs.filter((job) => job.enabled);
}
