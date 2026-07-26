import type { SourceDocument, TopicDefinition } from "../types.js";

/** Rough threshold: below this, treat source as excerpt and keep LLM rewrite. */
const FULL_TEXT_MIN_WORDS = 180;

/**
 * English learning notes: vocab + long sentences from source articles.
 */
export const englishVocabTopic: TopicDefinition = {
  id: "english-vocab",
  label: "english",

  /**
   * Builds prompts that enforce the review-friendly note format.
   */
  buildPrompts(docs: SourceDocument[], context) {
    const primary = docs[0];
    const rawTitle = primary?.title?.trim() ?? "";
    const hasRealTitle = Boolean(rawTitle) && !isGenericTitle(rawTitle);
    const titleHint = hasRealTitle
      ? rawTitle
      : "(no reliable title — invent a short English headline, max 12 words)";
    const sourceMode = primary && hasSubstantialBody(cleanSourceBody(primary.body))
      ? "full"
      : "rewrite";
    const sources = docs
      .map(
        (doc, index) =>
          `### Source ${index + 1}: ${doc.title || "(untitled)"}\n` +
          (doc.sourceName ? `Outlet: ${doc.sourceName}\n` : "") +
          (doc.url ? `URL: ${doc.url}\n` : "") +
          `Body mode hint: ${hasSubstantialBody(cleanSourceBody(doc.body)) ? "full text available" : "excerpt only — rewrite required"}\n` +
          `\n${doc.body}`,
      )
      .join("\n\n---\n\n");

    const systemPrompt = [
      "You are an English learning assistant for a busy professional.",
      "Extract high-value vocabulary and long sentences from the provided sources.",
      "Write clear Markdown. Learning content (lead, rewrite, examples, imitation) must be in English;",
      "use Chinese only for 中文摘要, 中文释义, 中文翻译, 记忆提示, and 长难句/结构 labels as specified.",
      "Do not invent facts that are not grounded in the sources.",
      "Never use placeholder titles like Inbox, English Notes, or a job id.",
      "Never include part-of-speech tags in parentheses after vocabulary headwords.",
      "Never add a Mini Task / 小练习 section.",
    ].join(" ");

    const userPrompt = [
      `Date: ${context.date}`,
      `Job: ${context.jobId}`,
      `Primary article title hint: ${titleHint}`,
      `Primary source outlet: ${primary?.sourceName ?? "(unknown)"}`,
      `Required source mode for primary: ${sourceMode}`,
      "",
      "Produce a note with EXACTLY these sections and headings:",
      "",
      "# <English title, max 12 words — real headline if known, else your short invented title>",
      "",
      "<outlet> · <YYYY-MM-DD> · <url or (no link)>",
      "(one plain line right under H1, e.g. BBC World · 2026-07-26 · https://...)",
      "",
      "## Lead",
      "- 1–3 English sentences summarizing the story for learners (not a Chinese line).",
      "",
      "## 中文摘要",
      "- 1–2 concise Chinese sentences.",
      "",
      "## 原文 Source",
      sourceMode === "full"
        ? [
            "- Mode tag line: `模式：全文`",
            "- Paste the full original article text verbatim (clean body only).",
            "- Keep paragraph breaks.",
            "- Do NOT paste inbox instructions or RSS boilerplate labels.",
          ].join("\n")
        : [
            "- Mode tag line: `模式：英文改写 + 中文翻译`",
            "- Include `原文链接：` plus the URL when available.",
            "- Then `### 英文改写 Readable rewrite`",
            "- Write a readable English rewrite of about 250–400 words (3–5 paragraphs) for intensive reading.",
            "- Ground every fact in the source excerpt; do not invent major events.",
            "- Then `### 中文全文翻译` with a full Chinese translation of that rewrite.",
          ].join("\n"),
      "",
      "## 单词 Vocabulary",
      "Exactly 5 items. For each item use this shape:",
      "- **word/phrase**",
      "  - 英文释义: ...",
      "  - 中文释义: ...",
      "  - 例句: one English example from or closely adapted from the source",
      "  - 记忆提示: short tip in Chinese",
      "",
      "## 长难句",
      "2–3 items. For each item:",
      "- **原句：** exact English sentence from the source or rewrite",
      "  - 结构: brief clause breakdown (Chinese ok)",
      "  - 中文: translation",
      "  - 仿写: one original English imitation sentence",
      "",
      "Do not add any other top-level ## sections.",
      "",
      "Sources:",
      sources,
    ].join("\n");

    return { systemPrompt, userPrompt };
  },

  /**
   * Ensures title, meta line, and full-text source section when available.
   */
  finalize(rawText, context) {
    const docs = context.docs ?? [];
    const primary = docs[0];
    let text = rawText.trim();

    const preferredTitle = resolveNoteTitle(text, primary, context.date);
    if (!text.startsWith("#")) {
      text = `# ${preferredTitle}\n\n${text}`;
    } else {
      text = text.replace(/^#\s+.+$/m, `# ${preferredTitle}`);
    }

    text = upsertMetaLine(text, {
      sourceName: primary?.sourceName,
      date: context.date,
      url: primary?.url,
    });

    if (primary) {
      const sourceBody = cleanSourceBody(primary.body);
      if (sourceBody && hasSubstantialBody(sourceBody)) {
        text = upsertFullSourceSection(text, sourceBody, primary.url);
      } else if (primary.url) {
        text = ensureSourceUrlMention(text, primary.url);
      }
    }

    // Drop legacy practice section if a model still emits it.
    text = text.replace(/\n##\s*(Mini Task|小练习)\b[\s\S]*$/i, "\n");

    return `${text.trim()}\n`;
  },
};

/**
 * Picks a real headline, else a short LLM H1, else a dated fallback.
 */
function resolveNoteTitle(
  markdown: string,
  primary: SourceDocument | undefined,
  date: string,
): string {
  const fromSource = primary?.title?.trim();
  if (fromSource && !isGenericTitle(fromSource)) {
    return clipTitle(fromSource);
  }

  const fromModel = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (fromModel && !isGenericTitle(fromModel)) {
    return clipTitle(fromModel);
  }

  return `Daily Notes · ${date}`;
}

/**
 * Caps title length for archive cards and Bark.
 */
function clipTitle(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 12) {
    return words.join(" ");
  }
  return `${words.slice(0, 12).join(" ")}…`;
}

/**
 * True when a title is a placeholder rather than an article headline.
 */
function isGenericTitle(title: string): boolean {
  const t = title.trim();
  if (!t) {
    return true;
  }
  return /^(english notes?|daily notes?|inbox\b|untitled|sample article)\b/i.test(t);
}

/**
 * Strips inbox instructions and RSS boilerplate from source body text.
 */
export function cleanSourceBody(body: string): string {
  let text = body.replace(/\r\n/g, "\n").trim();
  if (text.includes("\n---\n")) {
    text = text.split("\n---\n").slice(1).join("\n---\n").trim();
  }
  text = text.replace(/^#\s+.+?\n+/, "").trim();
  text = text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      if (/^(title|url|outlet|body mode hint)\s*:/i.test(trimmed)) {
        return false;
      }
      if (/^#{1,3}\s+source\s+\d+/i.test(trimmed)) {
        return false;
      }
      if (
        /paste (a |an |the )?(world|business|tech|article)/i.test(trimmed) ||
        /optional\)?\s*article title/i.test(trimmed) ||
        /after the line below/i.test(trimmed) ||
        /inbox instructions?/i.test(trimmed)
      ) {
        return false;
      }
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

/**
 * True when cleaned body looks like a full article, not an RSS teaser.
 */
export function hasSubstantialBody(body: string): boolean {
  const words = body
    .replace(/https?:\/\/\S+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length >= FULL_TEXT_MIN_WORDS;
}

/**
 * Inserts or refreshes the outlet · date · url line under H1.
 */
function upsertMetaLine(
  markdown: string,
  meta: { sourceName?: string; date: string; url?: string },
): string {
  const outlet = meta.sourceName?.trim() || "Source";
  const link = meta.url?.trim() || "(no link)";
  const line = `${outlet} · ${meta.date} · ${link}`;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 0 || !/^#\s+/.test(lines[0])) {
    return markdown;
  }

  let i = 1;
  while (i < lines.length && lines[i].trim() === "") {
    i += 1;
  }
  if (i < lines.length && isMetaLine(lines[i])) {
    lines[i] = line;
    return lines.join("\n");
  }
  lines.splice(1, 0, "", line, "");
  return lines.join("\n");
}

/**
 * Detects the plain meta line under the title.
 */
function isMetaLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^##\s+/.test(trimmed)) {
    return false;
  }
  return /·/.test(trimmed) || /^https?:\/\//i.test(trimmed) || /\(no link\)/i.test(trimmed);
}

/**
 * Replaces ## 原文 Source / ## Source Article with cleaned full text.
 */
function upsertFullSourceSection(markdown: string, sourceBody: string, url?: string): string {
  const urlBlock = url ? `\n\n原文链接：${url}` : "";
  const block =
    `## 原文 Source\n\n` +
    `模式：全文\n\n` +
    `${sourceBody}${urlBlock}`;

  const replaced = markdown.replace(
    /##\s+(原文\s*Source|Source Article)\b[\s\S]*?(?=\n##\s+|$)/i,
    `${block}\n\n`,
  );
  if (replaced !== markdown) {
    return replaced;
  }

  if (/##\s+中文摘要\b/i.test(markdown)) {
    return markdown.replace(/(##\s+中文摘要\b[\s\S]*?)(?=\n##\s+)/i, `$1\n\n${block}\n\n`);
  }
  if (/##\s+Lead\b/i.test(markdown)) {
    return markdown.replace(/(##\s+Lead\b[\s\S]*?)(?=\n##\s+)/i, `$1\n\n${block}\n\n`);
  }
  return markdown.replace(/^(#\s+.+)\n+/, `$1\n\n${block}\n\n`);
}

/**
 * Ensures the rewrite-mode source section mentions the article URL.
 */
function ensureSourceUrlMention(markdown: string, url: string): string {
  if (markdown.includes(url)) {
    return markdown;
  }
  return markdown.replace(
    /(##\s+(原文\s*Source|Source Article)\b\s*\n)/i,
    `$1\n原文链接：${url}\n\n`,
  );
}
