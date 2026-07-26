import { push, resolveTitle } from "@pocket/bark";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AppConfig, JobConfig } from "./config.js";
import { resolveJobCategory } from "./job-path.js";
import { createLlmProvider } from "./providers/registry.js";
import { buildSite } from "./site/build-site.js";
import { resolveNotePageUrl } from "./site/urls.js";
import {
  buildClosedMarketNote,
  resolveAshareSession,
} from "./sources/market-session.js";
import { getSourceProvider } from "./sources/registry.js";
import { getTopic } from "./topics/registry.js";
import type { PipelineResult, SourceDocument } from "./types.js";
import { shortDateLabel, todayInTimeZone } from "./utils/date.js";
import { buildBarkPreview, buildBarkTeaser } from "./utils/text.js";

export interface RunJobOptions {
  /** Override date folder/name (YYYY-MM-DD). */
  date?: string;
  /** Skip Bark/other delivery. */
  skipDelivery?: boolean;
  /** Working directory root. */
  cwd?: string;
}

/**
 * Runs one configured job end-to-end: source → topic prompts → LLM → note → site → Bark.
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
  const category = resolveJobCategory(job);

  // Invest: never invent buy/sell grades on weekends / holidays / stale tape.
  if (job.topic === "fund-watch") {
    const session = await resolveAshareSession(date);
    console.log(
      `  market  : ${session.isTradingDay ? "open" : "closed"} (${session.reason})`,
    );
    if (!session.isTradingDay) {
      const noteBody = buildClosedMarketNote(date, session);
      return persistAndMaybeDeliver({
        config,
        job,
        cwd,
        notesDir,
        date,
        category,
        noteBody,
        sourceIds: [`market:closed:${date}`],
        skipDelivery: options.skipDelivery,
      });
    }
  }

  const source = getSourceProvider(job.source.type);
  const docs = await source.fetch(job, { cwd, inboxDir, notesDir, date });
  if (docs.length === 0) {
    if (job.source.optional) {
      console.log(`  skipped : no source documents (optional)`);
      return {
        jobId: job.id,
        date,
        category,
        notePath: resolve(notesDir, category, `${date}.md`),
        sourceIds: [],
        delivered: false,
        preview: "",
        skipped: true,
      };
    }
    throw new Error(`Job "${job.id}" produced no source documents`);
  }

  // Double-check: fund source must mark live session for the job date.
  if (job.topic === "fund-watch" && !docsHaveLiveSession(docs, date)) {
    const session = await resolveAshareSession(date);
    const noteBody = buildClosedMarketNote(date, {
      ...session,
      isTradingDay: false,
      reason: session.isTradingDay
        ? "未拿到当日实时分时，今日不做买卖建议"
        : session.reason,
    });
    console.log("  market  : closed (no live session in fund payload)");
    return persistAndMaybeDeliver({
      config,
      job,
      cwd,
      notesDir,
      date,
      category,
      noteBody,
      sourceIds: docs.map((doc) => doc.id),
      skipDelivery: options.skipDelivery,
    });
  }

  const topic = getTopic(job.topic);
  const prompts = topic.buildPrompts(docs, { jobId: job.id, date });
  if (job.llm.model) {
    prompts.model = job.llm.model;
  }

  const llm = createLlmProvider(job.llm.provider, { model: job.llm.model });
  const llmResult = await llm.generate(prompts);
  const noteBody = topic.finalize
    ? topic.finalize(llmResult.text, { jobId: job.id, date, docs })
    : `${llmResult.text.trim()}\n`;

  return persistAndMaybeDeliver({
    config,
    job,
    cwd,
    notesDir,
    date,
    category,
    noteBody,
    sourceIds: docs.map((doc) => doc.id),
    skipDelivery: options.skipDelivery,
  });
}

/**
 * True when the funds source payload declares a live session for `date`.
 */
function docsHaveLiveSession(docs: SourceDocument[], date: string): boolean {
  return docs.some(
    (doc) =>
      doc.body.includes(`liveSession: yes`) && doc.body.includes(`sessionDate: ${date}`),
  );
}

interface PersistOptions {
  config: AppConfig;
  job: JobConfig;
  cwd: string;
  notesDir: string;
  date: string;
  category: string;
  noteBody: string;
  sourceIds: string[];
  skipDelivery?: boolean;
}

/**
 * Writes the note, rebuilds the site, and optionally pushes Bark.
 */
async function persistAndMaybeDeliver(options: PersistOptions): Promise<PipelineResult> {
  const { config, job, cwd, notesDir, date, category, noteBody, sourceIds } = options;

  const notePath = resolve(notesDir, category, `${date}.md`);
  mkdirSync(dirname(notePath), { recursive: true });
  writeFileSync(notePath, noteBody, "utf8");

  const site = buildSite({ cwd, notesDir });
  const page = site.notes.find((item) => item.topic === category && item.date === date);
  const pageUrl = resolveNotePageUrl(category, date);
  const pagePath = page?.htmlPath;

  const preview = pageUrl
    ? buildBarkTeaser(noteBody)
    : buildBarkPreview(noteBody, config.defaults.barkMaxChars);
  const dateLabel = shortDateLabel(date);
  const titlePrefix = job.delivery.titlePrefix ?? category;
  const title = resolveJobTitle(job, dateLabel, titlePrefix);

  let delivered = false;
  const shouldPush = !options.skipDelivery && job.delivery.type === "bark";
  if (shouldPush) {
    try {
      await push({
        title,
        body: preview,
        url: pageUrl,
        targets: job.delivery.targets,
      });
      delivered = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  warning: delivery failed, note was still saved.\n  ${message}`);
    }
  }

  return {
    jobId: job.id,
    date,
    category,
    notePath,
    pagePath,
    pageUrl,
    sourceIds,
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
    const base = resolveTitle({ preset: job.delivery.titlePreset });
    return job.delivery.appendDate === false ? base : `${base} · ${dateLabel}`;
  }
  return `${titlePrefix} · ${dateLabel}`;
}
