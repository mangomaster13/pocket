import type { JobConfig } from "./config.js";
import { getTopic } from "./topics/registry.js";
import type { AppId } from "./types.js";

/**
 * Resolves the notes/site category folder for a job.
 * Prefers explicit `job.category`, otherwise falls back to the topic label.
 */
export function resolveJobCategory(job: JobConfig): string {
  const explicit = job.category?.trim();
  if (explicit) {
    return explicit;
  }
  return getTopic(job.topic).label;
}

/**
 * Resolves which Pocket Hub app a job belongs to.
 */
export function resolveJobApp(job: JobConfig): AppId {
  return job.app ?? "articles";
}
