/**
 * Resolves public GitHub Pages URLs for published notes.
 */

/**
 * Returns the configured Pages origin (no trailing slash), or undefined when unset.
 *
 * Precedence:
 * 1. `PAGES_BASE_URL`
 * 2. Derived from `GITHUB_REPOSITORY` (`owner/repo` → `https://owner.github.io/repo`)
 */
export function resolvePagesBaseUrl(): string | undefined {
  const explicit = process.env.PAGES_BASE_URL?.trim().replace(/\/+$/, "");
  if (explicit) {
    return explicit;
  }

  const repo = process.env.GITHUB_REPOSITORY?.trim();
  if (!repo) {
    return undefined;
  }

  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    return undefined;
  }

  // User/org site repo (owner.github.io) publishes at the domain root.
  if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${owner}.github.io`;
  }

  return `https://${owner}.github.io/${name}`;
}

/**
 * Builds the absolute URL for one published note page.
 */
export function resolveNotePageUrl(topicLabel: string, date: string): string | undefined {
  const base = resolvePagesBaseUrl();
  if (!base) {
    return undefined;
  }
  return `${base}/${topicLabel}/${date}.html`;
}
