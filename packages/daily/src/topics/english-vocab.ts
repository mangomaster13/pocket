import type { SourceDocument, TopicDefinition } from "../types.js";

/**
 * English learning notes: vocab + long sentences from source articles.
 */
export const englishVocabTopic: TopicDefinition = {
  id: "english-vocab",
  label: "english",

  /**
   * Builds prompts that enforce a compact, review-friendly note format.
   */
  buildPrompts(docs: SourceDocument[], context) {
    const primary = docs[0];
    const articleTitle = primary?.title?.trim() || `English Notes · ${context.date}`;
    const sources = docs
      .map(
        (doc, index) =>
          `### Source ${index + 1}: ${doc.title}\n` +
          (doc.url ? `URL: ${doc.url}\n` : "") +
          `\n${doc.body}`,
      )
      .join("\n\n---\n\n");

    const systemPrompt = [
      "You are an English learning assistant for a busy professional.",
      "Extract high-value vocabulary and long sentences from the provided sources.",
      "Write in clear Markdown. Keep Chinese explanations concise.",
      "Do not invent quotations that are not grounded in the sources.",
      "The H1 title MUST be the real article/source title, never a generic label like English Notes.",
    ].join(" ");

    const userPrompt = [
      `Date: ${context.date}`,
      `Job: ${context.jobId}`,
      `Primary article title: ${articleTitle}`,
      "",
      "Produce a note with EXACTLY these sections and headings:",
      "",
      `# ${articleTitle}`,
      "",
      "## Summary",
      "- 1 Chinese sentence",
      "- 1 English sentence",
      "",
      "## Source Article",
      "- Paste the full original article text verbatim (clean body only, no inbox instructions).",
      "- Keep paragraph breaks.",
      "",
      "## Vocabulary (5 items)",
      "For each item:",
      "- **word/phrase** (part of speech)",
      "- English gloss",
      "- Chinese gloss",
      "- one example sentence from or closely adapted from the source",
      "- one short memory tip in Chinese",
      "",
      "## Long Sentences (2-3 items)",
      "For each item:",
      "- **Original:** exact sentence from the source",
      "- Structure: clause breakdown",
      "- Chinese: translation",
      "- Imitation: one sentence by you",
      "",
      "## Useful Chunks (1-2 items)",
      "- collocation or discourse marker + brief usage note",
      "",
      "## Mini Task",
      "- Ask the learner to write 40-60 English words using 3 of today's words.",
      "",
      "Sources:",
      sources,
    ].join("\n");

    return { systemPrompt, userPrompt };
  },

  /**
   * Ensures article title + original source section are present.
   */
  finalize(rawText, context) {
    const docs = context.docs ?? [];
    const primary = docs[0];
    const articleTitle =
      primary?.title?.trim() && !isGenericTitle(primary.title)
        ? primary.title.trim()
        : undefined;

    let text = rawText.trim();
    if (!text.startsWith("#")) {
      text = `# ${articleTitle ?? `English Notes · ${context.date}`}\n\n${text}`;
    }

    if (articleTitle) {
      text = text.replace(/^#\s+.+$/m, `# ${articleTitle}`);
    } else if (/^#\s*English Notes\b/i.test(text)) {
      // Keep as-is when we truly have no better title.
    }

    if (primary) {
      const sourceBody = cleanSourceBody(primary.body);
      if (sourceBody) {
        text = upsertSourceArticleSection(text, sourceBody, primary.url);
      }
    }

    return `${text.trim()}\n`;
  },
};

/**
 * True when a title is a placeholder rather than an article headline.
 */
function isGenericTitle(title: string): boolean {
  return /^(english notes?|inbox\b|sample article)\b/i.test(title.trim());
}

/**
 * Strips inbox instructions and leading H1 from source body text.
 */
function cleanSourceBody(body: string): string {
  let text = body.replace(/\r\n/g, "\n").trim();
  if (text.includes("\n---\n")) {
    text = text.split("\n---\n").slice(1).join("\n---\n").trim();
  }
  text = text.replace(/^#\s+.+?\n+/, "").trim();
  return text;
}

/**
 * Inserts or replaces the ## Source Article section with the original text.
 */
function upsertSourceArticleSection(markdown: string, sourceBody: string, url?: string): string {
  const urlLine = url ? `\n\nSource: ${url}` : "";
  const block = `## Source Article\n\n${sourceBody}${urlLine}`;
  const replaced = markdown.replace(
    /##\s+Source Article\b[\s\S]*?(?=\n##\s+|$)/i,
    `${block}\n\n`,
  );
  if (replaced !== markdown) {
    return replaced;
  }

  // Insert after Summary when possible; otherwise after H1.
  if (/##\s+Summary\b/i.test(markdown)) {
    return markdown.replace(
      /(##\s+Summary\b[\s\S]*?)(?=\n##\s+)/i,
      `$1\n\n${block}\n\n`,
    );
  }
  return markdown.replace(/^(#\s+.+)\n+/, `$1\n\n${block}\n\n`);
}
