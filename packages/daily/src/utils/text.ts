/**
 * Truncates text for push notifications without cutting mid-surrogate pair roughly.
 */
export function truncateForPush(text: string, maxChars: number): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/**
 * Builds a short Bark preview from a full markdown note.
 */
export function buildBarkPreview(markdown: string, maxChars: number): string {
  const preferred = preferTeaserSections(markdown);
  if (preferred) {
    return truncateForPush(preferred, maxChars);
  }

  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  const picked: string[] = [];
  for (const line of lines) {
    picked.push(line.replace(/^[-*]\s+/, ""));
    if (picked.join("\n").length >= maxChars) {
      break;
    }
  }

  return truncateForPush(picked.join("\n") || markdown, maxChars);
}

/**
 * Prefers 中文摘要 / Lead for notification teasers.
 */
function preferTeaserSections(markdown: string): string {
  const zh = sectionText(markdown, "中文摘要");
  const lead = sectionText(markdown, "Lead");
  const parts = [zh, lead].filter(Boolean);
  return parts.join("\n");
}

/**
 * Returns plain text for a ## section body.
 */
function sectionText(markdown: string, heading: string): string {
  const needle = heading.toLowerCase();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => {
    const normalized = line.trim().toLowerCase();
    return normalized.startsWith("## ") && normalized.slice(3).includes(needle);
  });
  if (start < 0) {
    return "";
  }
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      break;
    }
    const trimmed = lines[i].trim();
    if (trimmed) {
      body.push(trimmed.replace(/^[-*]\s+/, ""));
    }
  }
  return body.join(" ").trim();
}

/**
 * Builds a compact Bark teaser when the full note is available via URL.
 */
export function buildBarkTeaser(markdown: string, maxChars = 320): string {
  const preview = buildBarkPreview(markdown, maxChars);
  const hint = "👉 点击通知查看全文";
  if (preview.includes(hint)) {
    return preview;
  }
  return `${preview}\n\n${hint}`;
}
