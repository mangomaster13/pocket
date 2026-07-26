import type { SourceDocument, TopicDefinition } from "../types.js";

/**
 * Finance briefing topic (ready to enable via jobs.yaml).
 */
export const financeBriefTopic: TopicDefinition = {
  id: "finance-brief",
  label: "finance",

  /**
   * Builds prompts for a short markets/business briefing.
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
      "You are a concise finance briefing assistant.",
      "Focus on what happened, why it matters, and key terms.",
      "Use Markdown. Mix Chinese explanations with English terms where natural.",
      "Do not give personalized investment advice.",
    ].join(" ");

    const userPrompt = [
      `Date: ${context.date}`,
      `Job: ${context.jobId}`,
      "",
      "Produce a note with EXACTLY these sections:",
      "",
      `# Finance Brief · ${context.date}`,
      "",
      "## Headlines",
      "- 3-5 bullet points",
      "",
      "## Why It Matters",
      "- short analysis in Chinese (with key English terms)",
      "",
      "## Key Terms",
      "- 3-5 terms: English term / Chinese gloss / one-line context",
      "",
      "## Watch Next",
      "- 1-3 follow-up signals or dates to watch",
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
    return `# Finance Brief · ${context.date}\n\n${text}\n`;
  },
};
