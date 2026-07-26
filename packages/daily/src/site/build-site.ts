import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { marked } from "marked";
import { highlightNoteHtml } from "./highlight.js";
import { extractNoteMeta, extractOriginalSentences, getSectionBody } from "./note-meta.js";
import { resolvePagesBaseUrl } from "./urls.js";

/** Human labels for topic folder names. */
const TOPIC_LABELS: Record<string, string> = {
  world: "国际",
  business: "商业",
  tech: "科技",
  dev: "开发",
  music: "音乐",
  horror: "惊悚",
  english: "英语",
  finance: "财经",
  invest: "投资",
};

/** Notes folders that belong to the Articles app. */
const ARTICLE_TOPICS = new Set([
  "world",
  "business",
  "tech",
  "dev",
  "music",
  "horror",
  "english",
  "finance",
]);

/** Notes folders that belong to the Invest app. */
const INVEST_TOPICS = new Set(["invest"]);

export interface SiteNote {
  /** Topic folder name (e.g. english). */
  topic: string;
  /** Note date YYYY-MM-DD. */
  date: string;
  /** File stem without .md (e.g. 2026-07-26 or 2026-07-26-extra). */
  slug: string;
  /** Absolute path to the source markdown file. */
  markdownPath: string;
  /** Absolute path to the generated HTML file. */
  htmlPath: string;
  /** Site-relative path using forward slashes. */
  relativeHtmlPath: string;
  /** Extracted page title. */
  title: string;
  /** English lead for archive cards. */
  lead: string;
  /** Chinese summary for archive cards. */
  summary: string;
  /** Outlet name for archive cards. */
  sourceName: string;
  /** Highlight keywords / vocabulary. */
  keywords: string[];
}

export interface BuildSiteOptions {
  /** Working directory root. */
  cwd?: string;
  /** Notes directory relative to cwd. */
  notesDir?: string;
  /** Output site directory relative to cwd. */
  siteDir?: string;
}

export interface BuildSiteResult {
  siteDir: string;
  notes: SiteNote[];
  indexPath: string;
  pagesBaseUrl?: string;
}

/**
 * Rebuilds the static site under `site/` from every note markdown file.
 */
export function buildSite(options: BuildSiteOptions = {}): BuildSiteResult {
  const cwd = options.cwd ?? process.cwd();
  const notesDir = resolve(cwd, options.notesDir ?? process.env.NOTES_DIR ?? "notes");
  const siteDir = resolve(cwd, options.siteDir ?? process.env.SITE_DIR ?? "site");

  mkdirSync(siteDir, { recursive: true });
  writeFileSync(join(siteDir, ".nojekyll"), "", "utf8");

  const markdownFiles = listMarkdownNotes(notesDir);
  const notes: SiteNote[] = [];

  for (const markdownPath of markdownFiles) {
    const rel = relative(notesDir, markdownPath).replace(/\\/g, "/");
    const parts = rel.split("/");
    if (parts.length !== 2 || !parts[1].endsWith(".md")) {
      continue;
    }

    const topic = parts[0];
    const slug = basename(parts[1], ".md");
    const dateMatch = slug.match(/^(\d{4}-\d{2}-\d{2})(?:-.+)?$/);
    if (!dateMatch) {
      continue;
    }
    const date = dateMatch[1];

    const markdown = readFileSync(markdownPath, "utf8");
    const meta = extractNoteMeta(markdown, `${topicLabel(topic)} · ${date}`);
    const app = resolveNoteApp(topic);
    const articleMarkdown = stripChromeSections(markdown);
    const rawHtml = marked.parse(articleMarkdown, { async: false }) as string;
    // Invest: emphasize A–D grades (no English vocab highlighting).
    const bodyHtml =
      app === "invest"
        ? enhanceInvestHtml(rawHtml)
        : enhanceArticleHtml(
            highlightNoteHtml(
              rawHtml,
              meta.keywords,
              extractOriginalSentences(markdown),
            ),
          );
    const relativeHtmlPath = `${topic}/${slug}.html`;
    const htmlPath = join(siteDir, relativeHtmlPath);
    const metaLine = extractMetaLine(markdown);
    const sourceUrl = extractUrlFromMeta(metaLine) || extractUrlFromSource(markdown);

    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(
      htmlPath,
      renderNotePage({
        title: meta.title,
        date,
        topic,
        app,
        sourceName: meta.sourceName,
        sourceUrl,
        lead: meta.lead || getSectionBody(markdown, "Lead") || "",
        zhSummary: meta.summary,
        bodyHtml,
      }),
      "utf8",
    );

    notes.push({
      topic,
      date,
      slug,
      markdownPath,
      htmlPath,
      relativeHtmlPath,
      title: meta.title,
      lead: meta.lead,
      summary: meta.summary,
      sourceName: meta.sourceName,
      keywords: meta.keywords,
    });
  }

  notes.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    if (a.topic !== b.topic) {
      return a.topic.localeCompare(b.topic);
    }
    return a.slug.localeCompare(b.slug);
  });

  const articleNotes = notes.filter((note) => resolveNoteApp(note.topic) === "articles");
  const investNotes = notes.filter((note) => resolveNoteApp(note.topic) === "invest");

  copySiteIcon(cwd, siteDir);

  const indexPath = join(siteDir, "index.html");
  writeFileSync(
    indexPath,
    renderHubPage({
      articleCount: articleNotes.length,
      investCount: investNotes.length,
      latestArticleDate: articleNotes[0]?.date,
      latestInvestDate: investNotes[0]?.date,
    }),
    "utf8",
  );

  const articlesDir = join(siteDir, "articles");
  mkdirSync(articlesDir, { recursive: true });
  writeFileSync(
    join(articlesDir, "index.html"),
    renderArchivePage({
      app: "articles",
      notes: articleNotes,
      eyebrow: "Articles",
      title: articleNotes[0]?.date ?? "每日文章",
      subtitle: `${articleNotes.length} notes · newest first`,
    }),
    "utf8",
  );

  const investDir = join(siteDir, "invest");
  mkdirSync(investDir, { recursive: true });
  writeFileSync(
    join(investDir, "index.html"),
    renderArchivePage({
      app: "invest",
      notes: investNotes,
      eyebrow: "Invest",
      title: investNotes[0]?.date ?? "每日投资",
      subtitle: `${investNotes.length} briefs · newest first`,
    }),
    "utf8",
  );

  return {
    siteDir,
    notes,
    indexPath,
    pagesBaseUrl: resolvePagesBaseUrl(),
  };
}

/**
 * Resolves which Hub app a note topic belongs to.
 */
function resolveNoteApp(topic: string): "articles" | "invest" {
  if (INVEST_TOPICS.has(topic)) {
    return "invest";
  }
  if (ARTICLE_TOPICS.has(topic)) {
    return "articles";
  }
  return "articles";
}

/**
 * Copies the Pocket icon into site/assets for Hub branding.
 */
function copySiteIcon(cwd: string, siteDir: string): void {
  const source = resolve(cwd, "assets/icon.png");
  if (!existsSync(source)) {
    return;
  }
  const assetsDir = join(siteDir, "assets");
  mkdirSync(assetsDir, { recursive: true });
  copyFileSync(source, join(assetsDir, "icon.png"));
}

/**
 * Lists markdown note files under the notes directory (topic/*.md).
 */
function listMarkdownNotes(notesDir: string): string[] {
  if (!existsSync(notesDir)) {
    return [];
  }

  const files: string[] = [];
  for (const topic of readdirSync(notesDir, { withFileTypes: true })) {
    if (!topic.isDirectory() || topic.name.startsWith(".")) {
      continue;
    }
    const topicDir = join(notesDir, topic.name);
    for (const entry of readdirSync(topicDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(join(topicDir, entry.name));
      }
    }
  }
  return files;
}

/**
 * Returns a display label for a topic folder.
 */
function topicLabel(topic: string): string {
  return TOPIC_LABELS[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1);
}

/**
 * Escapes text for HTML text nodes and attributes.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escapes HTML then renders inline Markdown emphasis (**bold**).
 */
function formatInlineMarkdown(value: string): string {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * Removes H1 / Lead / 中文摘要 / Summary so they can be rendered as page chrome.
 */
function stripChromeSections(markdown: string): string {
  let text = markdown.replace(/\r\n/g, "\n");
  text = text.replace(/^#\s+.+$\n*/m, "");
  // Drop meta line under former H1.
  text = text.replace(/^[^\n#][^\n]*·[^\n]*\n+/m, "");
  text = removeSection(text, "Lead");
  text = removeSection(text, "中文摘要");
  text = removeSection(text, "Summary");
  return text.trim();
}

/**
 * Deletes one ## section by heading keyword.
 */
function removeSection(markdown: string, heading: string): string {
  const needle = heading.toLowerCase();
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => {
    const normalized = line.trim().toLowerCase();
    return normalized.startsWith("## ") && normalized.slice(3).includes(needle);
  });
  if (start < 0) {
    return markdown;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

/**
 * Reads the plain meta line under H1.
 */
function extractMetaLine(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  if (!/^#\s+/.test(lines[0] ?? "")) {
    return "";
  }
  for (let i = 1; i < Math.min(lines.length, 8); i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      break;
    }
    if (trimmed.includes("·")) {
      return trimmed;
    }
  }
  return "";
}

/**
 * Pulls the first URL from a meta line.
 */
function extractUrlFromMeta(metaLine: string): string {
  const match = metaLine.match(/https?:\/\/\S+/i);
  return match?.[0] ?? "";
}

/**
 * Fallback URL from source section.
 */
function extractUrlFromSource(markdown: string): string {
  const section =
    getSectionBody(markdown, "原文 Source") ||
    getSectionBody(markdown, "Source Article") ||
    "";
  const match = section.match(/https?:\/\/\S+/i);
  return match?.[0] ?? "";
}

/**
 * Wraps source section and lightly styles vocabulary / sentence blocks.
 */
function enhanceArticleHtml(html: string): string {
  return html.replace(
    /(<h2[^>]*>\s*(?:原文\s*Source|Source Article)\s*<\/h2>)([\s\S]*?)(?=<h2[\s>]|$)/i,
    (_all, heading: string, body: string) => `${heading}<div class="source-box">${body.trim()}</div>\n`,
  );
}

/**
 * Styles Invest grade badges / legend blocks for buy & sell A–D ratings.
 */
function enhanceInvestHtml(html: string): string {
  let next = html;

  // Wrap 「等级说明」 section in a callout box.
  next = next.replace(
    /(<h2[^>]*>\s*等级说明\s*<\/h2>)([\s\S]*?)(?=<h2[\s>]|$)/i,
    (_all, heading: string, body: string) =>
      `<section class="grade-legend">${heading}${enhanceGradeLegendBody(body.trim())}</section>\n`,
  );

  // Action rows: **买入等级**: C / **卖出等级**: A
  next = next.replace(
    /<li>\s*(?:<p>)?<strong>\s*(买入等级|卖出等级)\s*<\/strong>\s*[:：]\s*([ABCD])\s*(?:<\/p>)?\s*<\/li>/gi,
    (_all, kind: string, grade: string) => {
      const side = kind.includes("买") ? "buy" : "sell";
      const letter = grade.toUpperCase();
      return (
        `<li class="grade-row grade-row-${side}">` +
        `<span class="grade-label">${kind}</span>` +
        `<span class="grade-badge grade-${letter.toLowerCase()} grade-${side}" data-grade="${letter}">${letter}</span>` +
        `</li>`
      );
    },
  );

  // Fallback: bare letter after 买入等级 / 卖出等级 in any inline strong
  next = next.replace(
    /(<strong>\s*(买入等级|卖出等级)\s*<\/strong>\s*[:：]\s*)([ABCD])\b/gi,
    (_all, prefix: string, kind: string, grade: string) => {
      const side = kind.includes("买") ? "buy" : "sell";
      const letter = grade.toUpperCase();
      return (
        `${prefix}<span class="grade-badge grade-${letter.toLowerCase()} grade-${side}" data-grade="${letter}">${letter}</span>`
      );
    },
  );

  return next;
}

/**
 * Turns legend bullets like <strong>A</strong>：… into badge + text.
 */
function enhanceGradeLegendBody(body: string): string {
  return body.replace(
    /<li>\s*(?:<p>)?<strong>\s*([ABCD])\s*<\/strong>\s*[:：]\s*([^<]+?)(?:<\/p>)?\s*<\/li>/gi,
    (_all, grade: string, text: string) => {
      const letter = grade.toUpperCase();
      return (
        `<li class="grade-legend-item">` +
        `<span class="grade-badge grade-${letter.toLowerCase()} grade-legend-badge" data-grade="${letter}">${letter}</span>` +
        `<span class="grade-legend-text">${text.trim()}</span>` +
        `</li>`
      );
    },
  );
}

/**
 * Shared CSS for archive + note pages (teal + blue accents).
 */
function siteStyles(): string {
  return `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #111111;
  --muted: #8a8a8a;
  --line: #ececec;
  --soft: #f6f8f8;
  --chip: #eef6f5;
  --accent: #0f766e;
  --accent-soft: rgba(15, 118, 110, 0.12);
  --summary: #f5f8ff;
  --summary-border: #3b82f6;
  --card: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111111;
    --fg: #f3f3f3;
    --muted: #9a9a9a;
    --line: #2a2a2a;
    --soft: #1a1a1a;
    --chip: #163532;
    --accent: #5eead4;
    --accent-soft: rgba(94, 234, 212, 0.12);
    --summary: #152033;
    --summary-border: #60a5fa;
    --card: #161616;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.65;
  font-size: 15px;
}
a { color: var(--accent); }
.wrap {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}
.eyebrow {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0 0 0.35rem;
}
h1 {
  font-size: 1.7rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 0.65rem;
  line-height: 1.25;
}
.meta {
  color: var(--muted);
  font-size: 0.92rem;
  margin: 0 0 1rem;
}
.meta a { color: var(--muted); }
.meta a:hover { color: var(--accent); }
.lead {
  font-size: 1.02rem;
  color: var(--fg);
  margin: 0 0 1rem;
  padding: 0.85rem 0 0.85rem 0.9rem;
  border-left: 3px solid var(--accent);
  background: linear-gradient(90deg, var(--accent-soft), transparent 70%);
}
.zh-summary {
  margin: 0 0 1.4rem;
  padding: 0.85rem 1rem;
  background: var(--summary);
  border-left: 3px solid var(--summary-border);
  border-radius: 0 10px 10px 0;
}
.zh-summary .label {
  display: block;
  color: var(--summary-border);
  font-size: 0.8rem;
  font-weight: 650;
  margin-bottom: 0.3rem;
}
.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  align-items: center;
  color: var(--muted);
  font-size: 0.9rem;
  margin-bottom: 1.25rem;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 1.1rem;
  border-bottom: 1px solid var(--line);
  margin: 0 0 0.9rem;
  padding: 0;
  list-style: none;
}
.tabs button {
  appearance: none;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  padding: 0.55rem 0;
  font: inherit;
  color: var(--muted);
  cursor: pointer;
}
.tabs button.active {
  color: var(--fg);
  font-weight: 650;
  border-bottom-color: var(--accent);
}
.tabs .count { color: var(--muted); font-weight: 400; margin-left: 0.25rem; }
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  margin: 0 0 1.25rem;
}
.filters label {
  color: var(--muted);
  font-size: 0.88rem;
}
.filters select {
  font: inherit;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--fg);
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.9rem;
}
.list > li[hidden] { display: none; }
.card {
  display: block;
  text-decoration: none;
  color: inherit;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1rem 1.05rem 1.05rem;
  background: var(--card);
}
.card-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.45rem;
}
.pill {
  display: inline-block;
  font-size: 0.75rem;
  color: var(--accent);
  background: var(--chip);
  border-radius: 999px;
  padding: 0.14rem 0.6rem;
  font-weight: 600;
}
.card-meta {
  color: var(--muted);
  font-size: 0.86rem;
  white-space: nowrap;
}
.card-title {
  font-weight: 700;
  font-size: 1.05rem;
  margin: 0 0 0.4rem;
  line-height: 1.35;
}
.card-lead {
  color: var(--muted);
  font-size: 0.92rem;
  margin: 0 0 0.65rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-zh {
  margin: 0;
  padding: 0.65rem 0.8rem;
  background: var(--summary);
  border-left: 3px solid var(--summary-border);
  border-radius: 0 8px 8px 0;
  font-size: 0.92rem;
}
.card-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.7rem;
}
.card-keys span {
  font-size: 0.78rem;
  color: var(--accent);
  background: var(--chip);
  border-radius: 999px;
  padding: 0.16rem 0.5rem;
}
.empty {
  color: var(--muted);
  padding: 2rem 0;
}
.article-page .top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: baseline;
  margin-bottom: 1.25rem;
}
.article-page .brand {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.9rem;
}
.article-page .brand:hover { color: var(--accent); }
.article h1 { display: none; }
.article h2 {
  font-size: 1.05rem;
  margin: 1.75rem 0 0.65rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--line);
}
.article ul { padding-left: 1.15rem; }
.article li { margin: 0.3rem 0; }
.article code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}
.source-box {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 1rem 1.05rem;
}
.source-box > :first-child { margin-top: 0; }
.source-box > :last-child { margin-bottom: 0; }
mark.hl-kw {
  background: #fef3c7;
  color: inherit;
  padding: 0 0.15em;
  border-radius: 3px;
}
mark.hl-sent {
  background: #dbeafe;
  color: inherit;
  padding: 0.05em 0.15em;
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
@media (prefers-color-scheme: dark) {
  mark.hl-kw { background: #78350f; }
  mark.hl-sent { background: #1e3a5f; }
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  color: var(--muted);
  font-size: 0.82rem;
  margin: 0 0 1.1rem;
}
.legend span::before {
  content: "";
  display: inline-block;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 2px;
  margin-right: 0.35rem;
  vertical-align: -0.05rem;
}
.legend .kw::before { background: #fef3c7; }
.legend .sent::before { background: #dbeafe; }
@media (prefers-color-scheme: dark) {
  .legend .kw::before { background: #78350f; }
  .legend .sent::before { background: #1e3a5f; }
}
.hub-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}
.hub-brand img {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
}
.hub-apps {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
  display: grid;
  gap: 0.9rem;
}
.hub-apps a {
  display: block;
  text-decoration: none;
  color: inherit;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1rem 1.05rem 1.05rem;
  background: var(--card);
}
.hub-apps a:hover { border-color: var(--accent); }
.hub-apps .pill { margin-bottom: 0.45rem; }
.hub-apps h2 {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0 0 0.35rem;
  line-height: 1.35;
}
.hub-apps p {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}
.app-switch {
  display: flex;
  gap: 0.85rem;
  font-size: 0.9rem;
}
.app-switch a {
  color: var(--muted);
  text-decoration: none;
}
.app-switch a.active {
  color: var(--fg);
  font-weight: 650;
}
.app-switch a:hover { color: var(--accent); }

/* —— Invest grade badges (A–D) —— */
.invest-page .grade-legend {
  margin: 1.25rem 0 1.5rem;
  padding: 1rem 1.1rem 1.05rem;
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.invest-page .grade-legend > h2 {
  margin-top: 0;
}
.invest-page .grade-legend ul {
  list-style: none;
  padding: 0;
  margin: 0.55rem 0 0.9rem;
  display: grid;
  gap: 0.55rem;
}
.invest-page .grade-legend-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin: 0;
}
.invest-page .grade-legend-text {
  font-size: 0.98rem;
  line-height: 1.45;
}
.invest-page .grade-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.65rem 0;
  list-style: none;
}
.invest-page .grade-row::marker {
  content: "";
  font-size: 0;
}
.invest-page .grade-label {
  font-weight: 700;
  font-size: 1.05rem;
  min-width: 4.5em;
}
.invest-page .grade-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.1rem;
  height: 2.1rem;
  padding: 0 0.55rem;
  border-radius: 10px;
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
  border: 1.5px solid transparent;
}
.invest-page .grade-row .grade-badge {
  min-width: 2.55rem;
  height: 2.55rem;
  font-size: 1.75rem;
  border-radius: 12px;
}
.invest-page .grade-legend-badge {
  min-width: 1.9rem;
  height: 1.9rem;
  font-size: 1.2rem;
}
.invest-page .grade-a {
  color: #9f1239;
  background: #ffe4e6;
  border-color: #fb7185;
}
.invest-page .grade-b {
  color: #9a3412;
  background: #ffedd5;
  border-color: #fb923c;
}
.invest-page .grade-c {
  color: #854d0e;
  background: #fef9c3;
  border-color: #facc15;
}
.invest-page .grade-d {
  color: #334155;
  background: #e2e8f0;
  border-color: #94a3b8;
}
.invest-page .grade-buy.grade-a {
  color: #065f46;
  background: #d1fae5;
  border-color: #34d399;
}
.invest-page .grade-buy.grade-b {
  color: #0f766e;
  background: #ccfbf1;
  border-color: #2dd4bf;
}
.invest-page .grade-sell.grade-a {
  color: #9f1239;
  background: #ffe4e6;
  border-color: #fb7185;
}
.invest-page .grade-sell.grade-b {
  color: #9a3412;
  background: #ffedd5;
  border-color: #fb923c;
}
@media (prefers-color-scheme: dark) {
  .invest-page .grade-a {
    color: #fecdd3;
    background: #4c0519;
    border-color: #be123c;
  }
  .invest-page .grade-b {
    color: #fed7aa;
    background: #431407;
    border-color: #c2410c;
  }
  .invest-page .grade-c {
    color: #fef08a;
    background: #422006;
    border-color: #a16207;
  }
  .invest-page .grade-d {
    color: #cbd5e1;
    background: #1e293b;
    border-color: #64748b;
  }
  .invest-page .grade-buy.grade-a {
    color: #a7f3d0;
    background: #064e3b;
    border-color: #059669;
  }
  .invest-page .grade-buy.grade-b {
    color: #99f6e4;
    background: #134e4a;
    border-color: #0d9488;
  }
  .invest-page .grade-sell.grade-a {
    color: #fecdd3;
    background: #4c0519;
    border-color: #be123c;
  }
  .invest-page .grade-sell.grade-b {
    color: #fed7aa;
    background: #431407;
    border-color: #c2410c;
  }
}
`.trim();
}

/**
 * Client-side topic + date filtering for the archive page.
 */
function archiveScript(): string {
  return `
(function () {
  var topic = "all";
  var date = "all";
  var topicButtons = document.querySelectorAll("[data-topic-filter]");
  var dateSelect = document.querySelector("[data-date-filter]");
  var items = Array.prototype.slice.call(document.querySelectorAll("[data-note]"));
  var empty = document.querySelector("[data-empty]");

  function apply() {
    var visible = 0;
    items.forEach(function (item) {
      var okTopic = topic === "all" || item.getAttribute("data-topic") === topic;
      var okDate = date === "all" || item.getAttribute("data-date") === date;
      var show = okTopic && okDate;
      item.hidden = !show;
      if (show) visible += 1;
    });
    if (empty) empty.hidden = visible > 0;
  }

  topicButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      topic = btn.getAttribute("data-topic-filter") || "all";
      topicButtons.forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      apply();
    });
  });

  if (dateSelect) {
    dateSelect.addEventListener("change", function () {
      date = dateSelect.value || "all";
      apply();
    });
  }
})();
`.trim();
}

/**
 * Renders Pocket Hub landing page (app picker).
 */
function renderHubPage(input: {
  articleCount: number;
  investCount: number;
  latestArticleDate?: string;
  latestInvestDate?: string;
}): string {
  const articleMeta = input.latestArticleDate
    ? `最新 ${input.latestArticleDate} · ${input.articleCount} 篇`
    : `${input.articleCount} 篇`;
  const investMeta = input.latestInvestDate
    ? `最新 ${input.latestInvestDate} · ${input.investCount} 份`
    : `${input.investCount} 份`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pocket Hub</title>
  <style>${siteStyles()}</style>
</head>
<body>
  <main class="wrap">
    <p class="eyebrow">Pocket Hub</p>
    <div class="hub-brand">
      <img src="./assets/icon.png" alt="" width="40" height="40" />
      <h1>Pocket Hub</h1>
    </div>
    <p class="meta">选择一个子应用 · 每日文章或每日投资观察</p>
    <ul class="hub-apps">
      <li>
        <a href="./articles/">
          <span class="pill">Articles</span>
          <h2>每日文章</h2>
          <p>英语笔记归档 · ${escapeHtml(articleMeta)}</p>
        </a>
      </li>
      <li>
        <a href="./invest/">
          <span class="pill">Invest</span>
          <h2>每日投资</h2>
          <p>基金观察与买卖建议 · ${escapeHtml(investMeta)}</p>
        </a>
      </li>
    </ul>
  </main>
</body>
</html>
`;
}

/**
 * Renders one note HTML page.
 */
function renderNotePage(input: {
  title: string;
  date: string;
  topic: string;
  app: "articles" | "invest";
  sourceName: string;
  sourceUrl: string;
  lead: string;
  zhSummary: string;
  bodyHtml: string;
}): string {
  const outlet = input.sourceName || topicLabel(input.topic);
  const link = input.sourceUrl
    ? ` · <a href="${escapeHtml(input.sourceUrl)}">数据来源</a>`
    : "";
  const lead = input.lead.trim()
    ? `<p class="lead">${formatInlineMarkdown(input.lead.trim())}</p>`
    : "";
  const zh = input.zhSummary.trim()
    ? `<div class="zh-summary"><span class="label">中文摘要</span>${formatInlineMarkdown(input.zhSummary.trim())}</div>`
    : "";
  const archiveHref =
    input.app === "invest" ? "./index.html" : "../articles/index.html";
  const eyebrow =
    input.app === "invest" ? "Pocket Hub · Invest" : "Pocket Hub · Articles";
  const legend =
    input.app === "articles"
      ? `<div class="legend">
      <span class="kw">重点单词</span>
      <span class="sent">重点句子</span>
    </div>`
      : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>${siteStyles()}</style>
</head>
<body class="article-page${input.app === "invest" ? " invest-page" : ""}">
  <main class="wrap">
    <div class="top">
      <a class="brand" href="${archiveHref}">← 历史归档</a>
      <div class="eyebrow">${escapeHtml(topicLabel(input.topic))} · ${escapeHtml(input.date)}</div>
    </div>
    <p class="eyebrow">${eyebrow}</p>
    <h1>${escapeHtml(input.title)}</h1>
    <p class="meta">${escapeHtml(outlet)} · ${escapeHtml(input.date)}${link}</p>
    ${lead}
    ${zh}
    ${legend}
    <article class="article">
${input.bodyHtml}
    </article>
  </main>
</body>
</html>
`;
}

/**
 * Renders an app archive page with topic tabs and date filter.
 */
function renderArchivePage(input: {
  app: "articles" | "invest";
  notes: SiteNote[];
  eyebrow: string;
  title: string;
  subtitle: string;
}): string {
  const topics = [...new Set(input.notes.map((note) => note.topic))].sort();
  const dates = [...new Set(input.notes.map((note) => note.date))].sort((a, b) =>
    b.localeCompare(a),
  );

  const topicCounts = new Map<string, number>();
  for (const note of input.notes) {
    topicCounts.set(note.topic, (topicCounts.get(note.topic) ?? 0) + 1);
  }

  const showTopicTabs = input.app === "articles";
  const tabs = showTopicTabs
    ? [
        `<button type="button" class="active" data-topic-filter="all">全部<span class="count">${input.notes.length}</span></button>`,
        ...topics.map(
          (topic) =>
            `<button type="button" data-topic-filter="${escapeHtml(topic)}">${escapeHtml(topicLabel(topic))}<span class="count">${topicCounts.get(topic) ?? 0}</span></button>`,
        ),
      ].join("\n      ")
    : "";

  const dateOptions = [
    `<option value="all">全部日期</option>`,
    ...dates.map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`),
  ].join("\n        ");

  const items =
    input.notes.length === 0
      ? ""
      : input.notes
          .map((note) => {
            const metaParts = [note.sourceName || topicLabel(note.topic), note.date].filter(Boolean);
            const keys =
              note.keywords.length === 0
                ? ""
                : `<div class="card-keys">${note.keywords
                    .map((word) => `<span>${escapeHtml(word)}</span>`)
                    .join("")}</div>`;
            const lead = note.lead
              ? `<p class="card-lead">${formatInlineMarkdown(note.lead)}</p>`
              : "";
            const zh = note.summary
              ? `<p class="card-zh">${formatInlineMarkdown(note.summary)}</p>`
              : "";
            const href =
              input.app === "invest"
                ? `./${escapeHtml(note.slug)}.html`
                : `../${escapeHtml(note.relativeHtmlPath)}`;
            return `  <li data-note data-topic="${escapeHtml(note.topic)}" data-date="${escapeHtml(note.date)}">
    <a class="card" href="${href}">
      <div class="card-top">
        <span class="pill">${escapeHtml(topicLabel(note.topic))}</span>
        <span class="card-meta">${escapeHtml(metaParts.join(" · "))}</span>
      </div>
      <h3 class="card-title">${escapeHtml(note.title)}</h3>
      ${lead}
      ${zh}
      ${keys}
    </a>
  </li>`;
          })
          .join("\n");

  const pageTitle =
    input.app === "invest" ? "Pocket Hub · Invest" : "Pocket Hub · Articles";
  const switchArticles =
    input.app === "articles"
      ? `<a class="active" href="./">文章</a>`
      : `<a href="../articles/">文章</a>`;
  const switchInvest =
    input.app === "invest"
      ? `<a class="active" href="./">投资</a>`
      : `<a href="../invest/">投资</a>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>${siteStyles()}</style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <a class="brand" href="../">← Pocket Hub</a>
      <nav class="app-switch" aria-label="切换子应用">
        ${switchArticles}
        ${switchInvest}
      </nav>
    </div>
    <p class="eyebrow">${escapeHtml(input.eyebrow)}</p>
    <h1>${escapeHtml(input.title)}</h1>
    <div class="meta-row">
      <span>${escapeHtml(input.subtitle)}</span>
    </div>

    ${showTopicTabs ? `<div class="tabs" role="tablist">\n      ${tabs}\n    </div>` : ""}

    <div class="filters">
      <label for="date-filter">日期</label>
      <select id="date-filter" data-date-filter>
        ${dateOptions}
      </select>
    </div>

    <ul class="list">
${items}
    </ul>
    <p class="empty" data-empty ${input.notes.length === 0 ? "" : "hidden"}>没有符合筛选的笔记。</p>
  </main>
  <script>${archiveScript()}</script>
</body>
</html>
`;
}
