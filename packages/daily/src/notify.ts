import { push, resolveTitle } from "@pocket/bark";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AppConfig, JobConfig } from "./config.js";
import { resolveJobCategory } from "./job-path.js";
import { resolveNotePageUrl, resolvePagesBaseUrl } from "./site/urls.js";
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
  category: string;
  notePath: string;
  pageUrl?: string;
  title: string;
  preview: string;
  skipped?: boolean;
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
  const category = resolveJobCategory(job);
  const notePath = resolve(notesDir, category, `${date}.md`);

  if (!existsSync(notePath)) {
    return {
      jobId: job.id,
      date,
      category,
      notePath,
      title: "",
      preview: "",
      skipped: true,
    };
  }

  const noteBody = readFileSync(notePath, "utf8");
  const pageUrl = resolveNotePageUrl(category, date);
  const preview = pageUrl
    ? buildBarkTeaser(noteBody)
    : buildBarkPreview(noteBody, config.defaults.barkMaxChars);
  const dateLabel = shortDateLabel(date);
  const titlePrefix = job.delivery.titlePrefix ?? category;
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
    category,
    notePath,
    pageUrl,
    title,
    preview,
  };
}

/**
 * Sends one Bark summary for all notes generated on a date (link to archive index).
 */
export async function notifyDailySummary(
  config: AppConfig,
  jobs: JobConfig[],
  options: NotifyJobOptions = {},
): Promise<{ date: string; categories: string[]; pageUrl?: string }> {
  const cwd = options.cwd ?? process.cwd();
  const date =
    options.date ??
    todayInTimeZone(jobs[0]?.schedule?.timezone ?? "Asia/Shanghai");
  const notesDir = resolve(cwd, process.env.NOTES_DIR ?? config.defaults.notesDir);

  const categories: string[] = [];
  for (const job of jobs) {
    if (job.delivery.type === "none") {
      continue;
    }
    const category = resolveJobCategory(job);
    const notePath = resolve(notesDir, category, `${date}.md`);
    if (existsSync(notePath) && !categories.includes(category)) {
      categories.push(category);
    }
  }

  if (categories.length === 0) {
    throw new Error(`No notes found for ${date} to notify`);
  }

  const dateLabel = shortDateLabel(date);
  const title = resolveTitle({ preset: "english", fallback: "Pocket" });
  const titled = `${title} · ${dateLabel}`;
  const pageUrl = resolvePagesBaseUrl();
  const preview = [
    `今日更新 ${categories.length} 篇：${categories.join(", ")}`,
    "",
    "👉 点击通知查看归档",
  ].join("\n");

  await push({
    title: titled,
    body: preview,
    url: pageUrl,
  });

  return { date, categories, pageUrl };
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
