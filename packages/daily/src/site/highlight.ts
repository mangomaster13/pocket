/**
 * Highlights vocabulary and key sentences inside rendered note HTML.
 */

/**
 * Wraps keyword / sentence matches in <mark> inside HTML text nodes only.
 */
export function highlightNoteHtml(
  html: string,
  keywords: string[],
  sentences: string[],
): string {
  const orderedSentences = uniqueByLength(sentences);
  const orderedKeywords = uniqueByLength(keywords);
  if (orderedSentences.length === 0 && orderedKeywords.length === 0) {
    return html;
  }

  const parts = html.split(/(<[^>]+>)/);
  let inSkipTag = false;

  return parts
    .map((part) => {
      if (part.startsWith("<")) {
        const close = part.match(/^<\/\s*([a-z0-9]+)/i);
        const open = part.match(/^<\s*([a-z0-9]+)/i);
        const name = (close?.[1] || open?.[1] || "").toLowerCase();
        if (close && (name === "script" || name === "style" || name === "mark")) {
          inSkipTag = false;
        } else if (
          open &&
          !part.endsWith("/>") &&
          (name === "script" || name === "style" || name === "mark")
        ) {
          inSkipTag = true;
        }
        return part;
      }

      if (inSkipTag || !part.trim()) {
        return part;
      }

      let text = part;
      for (const sentence of orderedSentences) {
        text = replaceFlexible(text, sentence, (matched) => `<mark class="hl-sent">${matched}</mark>`);
      }
      for (const keyword of orderedKeywords) {
        text = replacePlainText(text, keyword, (matched) => `<mark class="hl-kw">${matched}</mark>`);
      }
      return text;
    })
    .join("");
}

/**
 * Dedupes strings and sorts longer first to avoid partial overlaps.
 */
function uniqueByLength(values: string[]): string[] {
  const seen = new Set<string>();
  const cleaned = values
    .map((value) => value.trim())
    .filter((value) => value.length >= 2)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  return cleaned.sort((a, b) => b.length - a.length);
}

/**
 * Replaces plain-text needle occurrences, skipping text already inside <mark>.
 */
function replacePlainText(
  text: string,
  needle: string,
  wrap: (matched: string) => string,
): string {
  if (!needle) {
    return text;
  }

  const chunks = text.split(/(<mark\b[^>]*>.*?<\/mark>)/gi);
  return chunks
    .map((chunk) => {
      if (/^<mark\b/i.test(chunk)) {
        return chunk;
      }
      const pattern = new RegExp(escapeRegExp(needle), "gi");
      return chunk.replace(pattern, (matched) => wrap(matched));
    })
    .join("");
}

/**
 * Like replacePlainText, but allows flexible whitespace inside multi-word needles.
 */
function replaceFlexible(
  text: string,
  needle: string,
  wrap: (matched: string) => string,
): string {
  if (!needle) {
    return text;
  }

  const parts = needle.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (parts.length === 0) {
    return text;
  }
  const pattern = new RegExp(parts.join("\\s+"), "gi");
  const chunks = text.split(/(<mark\b[^>]*>.*?<\/mark>)/gi);
  return chunks
    .map((chunk) => {
      if (/^<mark\b/i.test(chunk)) {
        return chunk;
      }
      return chunk.replace(pattern, (matched) => wrap(matched));
    })
    .join("");
}

/**
 * Escapes a string for safe RegExp usage.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
