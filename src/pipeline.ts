import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AppConfig, JobConfig } from "./config.js";
import { resolveNotificationTitle } from "./delivery/bark-presets.js";
import { createDelivery } from "./delivery/registry.js";
import { createLlmProvider } from "./providers/registry.js";
import { getSourceProvider } from "./sources/registry.js";
import { getTopic } from "./topics/registry.js";
import type { PipelineResult } from "./types.js";
import { shortDateLabel, todayInTimeZone } from "./utils/date.js";
import { buildBarkPreview } from "./utils/text.js";

export interface RunJobOptions {
  /** Override date folder/name (YYYY-MM-DD). */
  date?: string;
  /** Skip Bark/other delivery. */
  skipDelivery?: boolean;
  /** Working directory root. */
  cwd?: string;
}

/**
 * Runs one configured job end-to-end: source → topic prompts → LLM → note → delivery.
 */
export async function runJob(
  config: AppConfig,
  job: JobConfig,
  options: RunJobOptions = {},
): Promise<PipelineResult> {
  const cwd = options.cwd ?? process.cwd();
  const date = options.date ?? todayInTimeZone(job.schedule?.timezone ?? "Asia/Shanghai");
  const notesDir = resolve(cwd, process.env.NOTES_DIR ?? config.defaults.notesDir);
  const inboxDir = resolve(cwd, process.env.INBOX_DIR ?? config.defaults.inboxDir);

  const source = getSourceProvider(job.source.type);
  const docs = await source.fetch(job, { cwd, inboxDir, notesDir });
  if (docs.length === 0) {
    throw new Error(`Job "${job.id}" produced no source documents`);
  }

  const topic = getTopic(job.topic);
  const prompts = topic.buildPrompts(docs, { jobId: job.id, date });
  if (job.llm.model) {
    prompts.model = job.llm.model;
  }

  const llm = createLlmProvider(job.llm.provider, { model: job.llm.model });
  const llmResult = await llm.generate(prompts);
  const noteBody = topic.finalize
    ? topic.finalize(llmResult.text, { jobId: job.id, date })
    : `${llmResult.text.trim()}\n`;

  const notePath = resolve(notesDir, topic.label, `${date}.md`);
  mkdirSync(dirname(notePath), { recursive: true });
  writeFileSync(notePath, noteBody, "utf8");

  const preview = buildBarkPreview(noteBody, config.defaults.barkMaxChars);
  const dateLabel = shortDateLabel(date);
  const titlePrefix = job.delivery.titlePrefix ?? topic.label;
  const title = resolveJobTitle(job, dateLabel, titlePrefix);

  let delivered = false;
  const deliveryType = options.skipDelivery ? "none" : job.delivery.type;
  const delivery = createDelivery(deliveryType, {
    targets: job.delivery.targets,
  });
  if (deliveryType !== "none") {
    try {
      await delivery.deliver({ title, body: preview });
      delivered = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  warning: delivery failed, note was still saved.\n  ${message}`);
    }
  }

  return {
    jobId: job.id,
    date,
    notePath,
    sourceIds: docs.map((doc) => doc.id),
    delivered,
    preview,
  };
}

/**
 * Builds the Bark title for a job (preset preferred over titlePrefix).
 */
function resolveJobTitle(
  job: JobConfig,
  dateLabel: string,
  titlePrefix: string,
): string {
  if (job.delivery.titlePreset) {
    const base = resolveNotificationTitle({ preset: job.delivery.titlePreset });
    return job.delivery.appendDate === false ? base : `${base} · ${dateLabel}`;
  }
  return `${titlePrefix} · ${dateLabel}`;
}
