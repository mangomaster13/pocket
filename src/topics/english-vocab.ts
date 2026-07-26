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
    ].join(" ");

    const userPrompt = [
      `Date: ${context.date}`,
      `Job: ${context.jobId}`,
      "",
      "Produce a note with EXACTLY these sections:",
      "",
      `# English Notes · ${context.date}`,
      "",
      "## Summary",
      "- 1 Chinese sentence",
      "- 1 English sentence",
      "",
      "## Vocabulary (5 items)",
      "For each item:",
      "- word/phrase (part of speech)",
      "- English gloss",
      "- Chinese gloss",
      "- one example sentence from or closely adapted from the source",
      "- one short memory tip in Chinese",
      "",
      "## Long Sentences (2-3 items)",
      "For each item:",
      "- original sentence",
      "- structure breakdown (clauses)",
      "- Chinese translation",
      "- one imitation sentence by you",
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
   * Ensures the note has a top-level heading.
   */
  finalize(rawText, context) {
    const text = rawText.trim();
    if (text.startsWith("#")) {
      return `${text}\n`;
    }
    return `# English Notes · ${context.date}\n\n${text}\n`;
  },
};
