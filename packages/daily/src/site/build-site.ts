import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { marked } from "marked";
import { resolvePagesBaseUrl } from "./urls.js";

export interface SiteNote {
  /** Topic folder name (e.g. english). */
  topic: string;
  /** Note date YYYY-MM-DD. */
  date: string;
  /** Absolute path to the source markdown file. */
  markdownPath: string;
  /** Absolute path to the generated HTML file. */
  htmlPath: string;
  /** Site-relative path using forward slashes (e.g. english/2026-07-26.html). */
  relativeHtmlPath: string;
  /** Extracted page title. */
  title: string;
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
    const date = basename(parts[1], ".md");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }

    const markdown = readFileSync(markdownPath, "utf8");
    const title = extractTitle(markdown) || `${topic} · ${date}`;
    const bodyHtml = marked.parse(markdown, { async: false }) as string;
    const relativeHtmlPath = `${topic}/${date}.html`;
    const htmlPath = join(siteDir, relativeHtmlPath);

    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(
      htmlPath,
      renderNotePage({
        title,
        date,
        topic,
        bodyHtml,
        pagesBaseUrl: resolvePagesBaseUrl(),
      }),
      "utf8",
    );

    notes.push({
      topic,
      date,
      markdownPath,
      htmlPath,
      relativeHtmlPath,
      title,
    });
  }

  notes.sort((a, b) => {
    if (a.date === b.date) {
      return a.topic.localeCompare(b.topic);
    }
    return b.date.localeCompare(a.date);
  });

  const indexPath = join(siteDir, "index.html");
  writeFileSync(
    indexPath,
    renderIndexPage({
      notes,
      pagesBaseUrl: resolvePagesBaseUrl(),
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
 * Lists markdown note files under the notes directory (topic/date.md).
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
 * Extracts the first Markdown H1 as the page title.
 */
function extractTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
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
 * Shared CSS for the published notes site.
 */
function siteStyles(): string {
  return `
:root {
  color-scheme: light dark;
  --bg: #f7f4ef;
  --fg: #1c1917;
  --muted: #78716c;
  --card: #fffdf9;
  --line: #e7e0d5;
  --accent: #0f766e;
  --link: #0f766e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141210;
    --fg: #f5f0e8;
    --muted: #a8a29e;
    --card: #1c1917;
    --line: #292524;
    --accent: #5eead4;
    --link: #5eead4;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif;
  background:
    radial-gradient(1200px 500px at 10% -10%, rgba(15, 118, 110, 0.12), transparent 55%),
    radial-gradient(900px 400px at 100% 0%, rgba(180, 83, 9, 0.08), transparent 50%),
    var(--bg);
  color: var(--fg);
  line-height: 1.65;
}
a { color: var(--link); }
.wrap {
  max-width: 42rem;
  margin: 0 auto;
  padding: 2.5rem 1.25rem 4rem;
}
.top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: baseline;
  margin-bottom: 1.75rem;
}
.brand {
  font-family: "Avenir Next", "Segoe UI", sans-serif;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.85rem;
  color: var(--accent);
  text-decoration: none;
}
.meta { color: var(--muted); font-size: 0.92rem; }
h1 {
  font-size: 1.85rem;
  line-height: 1.25;
  margin: 0 0 0.75rem;
}
.article, .card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 1.4rem 1.35rem;
}
.article h1 { display: none; }
.article h2 {
  font-size: 1.15rem;
  margin-top: 1.6rem;
  border-bottom: 1px solid var(--line);
  padding-bottom: 0.35rem;
}
.article ul { padding-left: 1.2rem; }
.article li { margin: 0.35rem 0; }
.article code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.92em;
}
.list { list-style: none; padding: 0; margin: 0; }
.list li + li { margin-top: 0.65rem; }
.list a {
  display: block;
  text-decoration: none;
  color: inherit;
  padding: 0.9rem 1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--card);
}
.list a:hover { border-color: var(--accent); }
.list .title { font-weight: 600; }
.list .sub { color: var(--muted); font-size: 0.9rem; margin-top: 0.2rem; }
.empty { color: var(--muted); }
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
  pagesBaseUrl?: string;
}): string {
  const homeHref = "../index.html";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <style>${siteStyles()}</style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <a class="brand" href="${homeHref}">Pocket</a>
      <div class="meta">${escapeHtml(input.topic)} · ${escapeHtml(input.date)}</div>
    </div>
    <h1>${escapeHtml(input.title)}</h1>
    <article class="article">
${input.bodyHtml}
    </article>
  </main>
</body>
</html>
`;
}

/**
 * Renders the archive index page.
 */
function renderIndexPage(input: {
  notes: SiteNote[];
  pagesBaseUrl?: string;
}): string {
  const items =
    input.notes.length === 0
      ? `<p class="empty">No notes yet.</p>`
      : `<ul class="list">
${input.notes
  .map(
    (note) => `  <li>
    <a href="./${escapeHtml(note.relativeHtmlPath)}">
      <div class="title">${escapeHtml(note.title)}</div>
      <div class="sub">${escapeHtml(note.topic)} · ${escapeHtml(note.date)}</div>
    </a>
  </li>`,
  )
  .join("\n")}
</ul>`;

  const baseHint = input.pagesBaseUrl
    ? `<p class="meta">Public site: ${escapeHtml(input.pagesBaseUrl)}</p>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pocket Notes</title>
  <style>${siteStyles()}</style>
</head>
<body>
  <main class="wrap">
    <div class="top">
      <span class="brand">Pocket</span>
      <div class="meta">${input.notes.length} note${input.notes.length === 1 ? "" : "s"}</div>
    </div>
    <h1>Notes archive</h1>
    ${baseHint}
    <div class="card" style="margin-top: 1rem; border: 0; padding: 0; background: transparent;">
${items}
    </div>
  </main>
</body>
</html>
`;
}
