/**
 * Extracts archive-card fields from a note markdown body.
 */

export interface NoteMeta {
  title: string;
  /** Short Chinese/English summary for the archive card. */
  summary: string;
  /** Highlight vocabulary / keywords. */
  keywords: string[];
}

/**
 * Parses title, summary, and vocabulary keywords from note markdown.
 */
export function extractNoteMeta(markdown: string, fallbackTitle: string): NoteMeta {
  const title = extractTitle(markdown) || fallbackTitle;
  const summary = extractSummary(markdown);
  const keywords = extractKeywords(markdown);
  return { title, summary, keywords };
}

/**
 * Extracts original long sentences marked as **Original:** in the note.
 */
export function extractOriginalSentences(markdown: string): string[] {
  const section =
    sectionBody(markdown, "Long Sentences") ||
    sectionBody(markdown, "Long Sentences (2-3 items)") ||
    markdown;
  const found: string[] = [];
  const re = /\*\*Original:\*\*\s*(.+)$/gm;
  let match: RegExpExecArray | null = re.exec(section);
  while (match) {
    const sentence = match[1].trim();
    if (sentence && !found.includes(sentence)) {
      found.push(sentence);
    }
    match = re.exec(section);
  }
  return found;
}

/**
 * Returns the body of a ## Section until the next ## heading.
 */
export function getSectionBody(markdown: string, heading: string): string | undefined {
  return sectionBody(markdown, heading);
}

/**
 * Extracts the first Markdown H1 as the page title.
 */
function extractTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

/**
 * Prefers the first Chinese Summary bullet; falls back to the English one.
 */
function extractSummary(markdown: string): string {
  const section = sectionBody(markdown, "Summary");
  if (!section) {
    return firstNonHeadingLine(markdown);
  }

  const bullets = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim());

  if (bullets.length === 0) {
    return firstNonHeadingLine(section) || firstNonHeadingLine(markdown);
  }

  const chinese = bullets.find((line) => /[\u4e00-\u9fff]/.test(line));
  return chinese || bullets[0];
}

/**
 * Pulls bold vocabulary headwords from the Vocabulary section.
 */
function extractKeywords(markdown: string): string[] {
  const section =
    sectionBody(markdown, "Vocabulary") ||
    sectionBody(markdown, "Vocabulary (5 items)") ||
    "";
  const source = section || markdown;
  const found: string[] = [];
  const re = /^\s*[-*]\s+\*\*(.+?)\*\*/gm;
  let match: RegExpExecArray | null = re.exec(source);
  while (match) {
    const word = match[1].replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (word && !found.includes(word)) {
      found.push(word);
    }
    match = re.exec(source);
  }
  return found.slice(0, 6);
}

/**
 * Returns the body of a ## Section until the next ## heading.
 */
function sectionBody(markdown: string, heading: string): string | undefined {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => {
    const normalized = line.trim().toLowerCase();
    return (
      normalized === `## ${heading.toLowerCase()}` ||
      normalized.startsWith(`## ${heading.toLowerCase()} `) ||
      normalized.startsWith(`## ${heading.toLowerCase()}(`)
    );
  });
  if (start < 0) {
    return undefined;
  }

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      break;
    }
    body.push(lines[i]);
  }
  return body.join("\n").trim();
}

/**
 * First meaningful non-heading line as a last-resort summary.
 */
function firstNonHeadingLine(markdown: string): string {
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    return trimmed.replace(/^[-*]\s+/, "");
  }
  return "";
}
