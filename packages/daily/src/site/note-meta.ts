/**
 * Extracts archive-card fields from a note markdown body.
 */

export interface NoteMeta {
  title: string;
  /** English lead / teaser for the archive card. */
  lead: string;
  /** Chinese summary for the archive card (also exposed as `summary`). */
  summary: string;
  /** Outlet name when present (e.g. BBC World). */
  sourceName: string;
  /** Highlight vocabulary / keywords. */
  keywords: string[];
}

/**
 * Parses title, lead, summary, source, and vocabulary keywords from note markdown.
 */
export function extractNoteMeta(markdown: string, fallbackTitle: string): NoteMeta {
  const title = extractTitle(markdown) || fallbackTitle;
  const lead = extractLead(markdown);
  const summary = extractZhSummary(markdown);
  const sourceName = extractSourceName(markdown);
  const keywords = extractKeywords(markdown);
  return { title, lead, summary, sourceName, keywords };
}

/**
 * Extracts original long sentences marked as **Original:** / **原句：** in the note.
 */
export function extractOriginalSentences(markdown: string): string[] {
  const section =
    sectionBody(markdown, "长难句") ||
    sectionBody(markdown, "Long Sentences") ||
    sectionBody(markdown, "Long Sentences (2-3 items)") ||
    markdown;
  const found: string[] = [];
  const re = /\*\*(?:Original|原句)[:：]\*\*\s*(.+)$/gim;
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
 * Reads the English Lead section (or legacy English Summary bullet).
 */
function extractLead(markdown: string): string {
  const leadSection = sectionBody(markdown, "Lead");
  if (leadSection) {
    return firstParagraph(leadSection) || firstNonHeadingLine(leadSection);
  }

  const summary = sectionBody(markdown, "Summary");
  if (!summary) {
    return "";
  }
  const bullets = bulletLines(summary);
  const english = bullets.find((line) => !/[\u4e00-\u9fff]/.test(line));
  return english || "";
}

/**
 * Prefers ## 中文摘要; falls back to Chinese Summary bullet / first line.
 */
function extractZhSummary(markdown: string): string {
  const zh = sectionBody(markdown, "中文摘要");
  if (zh) {
    return firstParagraph(zh) || firstNonHeadingLine(zh);
  }

  const section = sectionBody(markdown, "Summary");
  if (!section) {
    return firstNonHeadingLine(markdown);
  }

  const bullets = bulletLines(section);
  if (bullets.length === 0) {
    return firstNonHeadingLine(section) || firstNonHeadingLine(markdown);
  }

  const chinese = bullets.find((line) => /[\u4e00-\u9fff]/.test(line));
  return chinese || bullets[0];
}

/**
 * Reads outlet name from the meta line under H1 (`BBC World · date · url`).
 */
function extractSourceName(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 2 || !/^#\s+/.test(lines[0])) {
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
      return trimmed.split("·")[0]?.trim() ?? "";
    }
  }
  return "";
}

/**
 * Pulls bold vocabulary headwords from the Vocabulary section.
 */
function extractKeywords(markdown: string): string[] {
  const section =
    sectionBody(markdown, "单词 Vocabulary") ||
    sectionBody(markdown, "Vocabulary") ||
    sectionBody(markdown, "Vocabulary (5 items)") ||
    "";
  const source = section || markdown;
  const found: string[] = [];
  const re = /^\s*[-*]\s+\*\*(.+?)\*\*/gm;
  let match: RegExpExecArray | null = re.exec(source);
  while (match) {
    const word = match[1]
      .replace(/^(?:原句|Original)[:：]\s*/i, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .trim();
    if (word && !/^(原句|Original)$/i.test(word) && !found.includes(word)) {
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
  const needle = heading.toLowerCase();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => {
    const normalized = line.trim().toLowerCase();
    if (!normalized.startsWith("## ")) {
      return false;
    }
    const title = normalized.slice(3).trim();
    return (
      title === needle ||
      title.startsWith(`${needle} `) ||
      title.startsWith(`${needle}(`) ||
      title.includes(needle)
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
 * Bullet lines without the leading marker.
 */
function bulletLines(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim());
}

/**
 * First non-empty paragraph (blank-line separated).
 */
function firstParagraph(text: string): string {
  const block = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find(Boolean);
  if (!block) {
    return "";
  }
  return block
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
    .join(" ");
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
    if (trimmed.includes("·") && /https?:\/\//i.test(trimmed)) {
      continue;
    }
    return trimmed.replace(/^[-*]\s+/, "");
  }
  return "";
}
