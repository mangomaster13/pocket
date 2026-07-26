import type { JobConfig } from "../config.js";
import type { SourceDocument } from "../types.js";

/** Fetches raw documents for a job. */
export interface SourceProvider {
  fetch(job: JobConfig, paths: SourcePaths): Promise<SourceDocument[]>;
}

/** Resolved filesystem locations for inbox/notes. */
export interface SourcePaths {
  cwd: string;
  inboxDir: string;
  notesDir: string;
}
