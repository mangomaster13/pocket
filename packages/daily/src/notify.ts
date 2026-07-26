import { push, resolveTitle } from "@pocket/bark";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AppConfig, JobConfig } from "./config.js";
import { resolveNotePageUrl } from "./site/urls.js";
import { getTopic } from "./topics/registry.js";
import { shortDateLabel, todayInTimeZone } from "./utils/date.js";
import { buildBarkPreview, buildBarkTeaser } from "./utils/text.js";

export interface NotifyJobOptions {
  /** Override note date (YYYY-MM-DD). */
  date?: string;
  /** Working directory root. */
  cwd?: string;
}

export interface NotifyJobResult {
  jobId: string;
  date: string;
  notePath: string;
  pageUrl?: string;
  title: string;
  preview: string;
}

/**
 * Pushes an existing note via Bark (used after GitHub Pages deploy).
 */
export async function notifyJob(
  config: AppConfig,
  job: JobConfig,
  options: NotifyJobOptions = {},
): Promise<NotifyJobResult> {
  const cwd = options.cwd ?? process.cwd();
  const date = options.date ?? todayInTimeZone(job.schedule?.timezone ?? "Asia/Shanghai");
  const notesDir = resolve(cwd, process.env.NOTES_DIR ?? config.defaults.notesDir);
  const topic = getTopic(job.topic);
  const notePath = resolve(notesDir, topic.label, `${date}.md`);
  const noteBody = readFileSync(notePath, "utf8");

  const pageUrl = resolveNotePageUrl(topic.label, date);
  const preview = pageUrl
    ? buildBarkTeaser(noteBody)
    : buildBarkPreview(noteBody, config.defaults.barkMaxChars);
  const dateLabel = shortDateLabel(date);
  const titlePrefix = job.delivery.titlePrefix ?? topic.label;
  const title = resolveJobTitle(job, dateLabel, titlePrefix);

  if (job.delivery.type === "none") {
    throw new Error(`Job "${job.id}" has delivery.type=none`);
  }

  await push({
    title,
    body: preview,
    url: pageUrl,
    targets: job.delivery.targets,
  });

  return {
    jobId: job.id,
    date,
    notePath,
    pageUrl,
    title,
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
    const base = resolveTitle({ preset: job.delivery.titlePreset });
    return job.delivery.appendDate === false ? base : `${base} · ${dateLabel}`;
  }
  return `${titlePrefix} · ${dateLabel}`;
}
