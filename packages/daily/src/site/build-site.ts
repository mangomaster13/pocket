import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { marked } from "marked";
import { highlightNoteHtml } from "./highlight.js";
import { extractNoteMeta, extractOriginalSentences } from "./note-meta.js";
import { resolvePagesBaseUrl } from "./urls.js";

/** Human labels for topic folder names. */
const TOPIC_LABELS: Record<string, string> = {
  world: "World",
  business: "Business",
  tech: "Tech",
  dev: "Dev",
  music: "Music",
  horror: "Horror",
  english: "English",
  finance: "Finance",
};

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
  /** Short summary for archive cards. */
  summary: string;
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
    const sentences = extractOriginalSentences(markdown);
    const rawHtml = marked.parse(markdown, { async: false }) as string;
    const bodyHtml = highlightNoteHtml(rawHtml, meta.keywords, sentences);
    const relativeHtmlPath = `${topic}/${slug}.html`;
    const htmlPath = join(siteDir, relativeHtmlPath);

    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(
      htmlPath,
      renderNotePage({
        title: meta.title,
        date,
        topic,
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
      summary: meta.summary,
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

  const indexPath = join(siteDir, "index.html");
  writeFileSync(indexPath, renderIndexPage({ notes }), "utf8");

  return {
    siteDir,
    notes,
    indexPath,
    pagesBaseUrl: resolvePagesBaseUrl(),
  };
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
 * Shared minimal CSS for archive + note pages.
 */
function siteStyles(): string {
  return `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #111111;
  --muted: #8a8a8a;
  --line: #ececec;
  --soft: #f5f5f5;
  --chip: #efefef;
  --accent: #111111;
  --summary: #f7f7f7;
  --summary-border: #3b82f6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111111;
    --fg: #f3f3f3;
    --muted: #9a9a9a;
    --line: #2a2a2a;
    --soft: #1a1a1a;
    --chip: #242424;
    --accent: #f3f3f3;
    --summary: #1a1a1a;
    --summary-border: #60a5fa;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.6;
  font-size: 15px;
}
a { color: inherit; }
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
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 0.75rem;
  line-height: 1.25;
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
.meta-row a {
  color: var(--muted);
  text-decoration: none;
}
.meta-row a:hover { color: var(--fg); text-decoration: underline; }
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
  border-bottom-color: var(--fg);
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
.list { list-style: none; padding: 0; margin: 0; }
.item {
  padding: 1.05rem 0 1.15rem;
  border-bottom: 1px solid var(--line);
}
.item[hidden] { display: none; }
.item a.item-link {
  text-decoration: none;
  color: inherit;
  display: block;
}
.item-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: baseline;
  margin-bottom: 0.35rem;
}
.item-title {
  font-weight: 650;
  font-size: 1.02rem;
}
.item-date { color: var(--muted); font-size: 0.86rem; white-space: nowrap; }
.item-topic {
  display: inline-block;
  font-size: 0.75rem;
  color: var(--muted);
  background: var(--chip);
  border-radius: 999px;
  padding: 0.12rem 0.55rem;
  margin-bottom: 0.45rem;
}
.item-summary {
  margin: 0.55rem 0 0;
  padding: 0.7rem 0.85rem;
  background: var(--summary);
  border-left: 3px solid var(--summary-border);
  border-radius: 0 8px 8px 0;
  color: var(--fg);
  font-size: 0.92rem;
}
.keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.65rem;
}
.keywords span {
  font-size: 0.78rem;
  color: var(--fg);
  background: var(--chip);
  border-radius: 999px;
  padding: 0.18rem 0.55rem;
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
.article-page .brand:hover { color: var(--fg); text-decoration: underline; }
.article h1 { display: none; }
.article h2 {
  font-size: 1.05rem;
  margin: 1.6rem 0 0.55rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--line);
}
.article ul { padding-left: 1.15rem; }
.article li { margin: 0.3rem 0; }
.article code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}
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
 * Renders one note HTML page.
 */
function renderNotePage(input: {
  title: string;
  date: string;
  topic: string;
  bodyHtml: string;
}): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>${siteStyles()}</style>
</head>
<body class="article-page">
  <main class="wrap">
    <div class="top">
      <a class="brand" href="../index.html">← 历史归档</a>
      <div class="eyebrow">${escapeHtml(topicLabel(input.topic))} · ${escapeHtml(input.date)}</div>
    </div>
    <p class="eyebrow">Pocket</p>
    <h1>${escapeHtml(input.title)}</h1>
    <div class="legend">
      <span class="kw">重点单词</span>
      <span class="sent">重点句子</span>
    </div>
    <article class="article">
${input.bodyHtml}
    </article>
  </main>
</body>
</html>
`;
}

/**
 * Renders the archive index page with topic tabs and date filter.
 */
function renderIndexPage(input: { notes: SiteNote[] }): string {
  const topics = [...new Set(input.notes.map((note) => note.topic))].sort();
  const dates = [...new Set(input.notes.map((note) => note.date))].sort((a, b) =>
    b.localeCompare(a),
  );
  const latestDate = dates[0] ?? "—";

  const topicCounts = new Map<string, number>();
  for (const note of input.notes) {
    topicCounts.set(note.topic, (topicCounts.get(note.topic) ?? 0) + 1);
  }

  const tabs = [
    `<button type="button" class="active" data-topic-filter="all">全部<span class="count">${input.notes.length}</span></button>`,
    ...topics.map(
      (topic) =>
        `<button type="button" data-topic-filter="${escapeHtml(topic)}">${escapeHtml(topicLabel(topic))}<span class="count">${topicCounts.get(topic) ?? 0}</span></button>`,
    ),
  ].join("\n      ");

  const dateOptions = [
    `<option value="all">全部日期</option>`,
    ...dates.map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`),
  ].join("\n        ");

  const items =
    input.notes.length === 0
      ? ""
      : input.notes
          .map((note) => {
            const keywords =
              note.keywords.length === 0
                ? ""
                : `<div class="keywords">${note.keywords
                    .map((word) => `<span>${escapeHtml(word)}</span>`)
                    .join("")}</div>`;
            const summary = note.summary
              ? `<p class="item-summary">${escapeHtml(note.summary)}</p>`
              : "";
            return `  <li class="item" data-note data-topic="${escapeHtml(note.topic)}" data-date="${escapeHtml(note.date)}">
    <a class="item-link" href="./${escapeHtml(note.relativeHtmlPath)}">
      <div class="item-topic">${escapeHtml(topicLabel(note.topic))}</div>
      <div class="item-top">
        <div class="item-title">${escapeHtml(note.title)}</div>
        <div class="item-date">${escapeHtml(note.date)}</div>
      </div>
      ${summary}
      ${keywords}
    </a>
  </li>`;
          })
          .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pocket — Notes</title>
  <style>${siteStyles()}</style>
</head>
<body>
  <main class="wrap">
    <p class="eyebrow">Pocket 笔记</p>
    <h1>${escapeHtml(latestDate)}</h1>
    <div class="meta-row">
      <span>${input.notes.length} notes · newest first</span>
    </div>

    <div class="tabs" role="tablist">
      ${tabs}
    </div>

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
