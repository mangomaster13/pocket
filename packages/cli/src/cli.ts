#!/usr/bin/env node
import { listDevices, listPresets, push, resolveTitle } from "@pocket/bark";
import {
  buildSite,
  getJob,
  listJobs,
  loadConfig,
  notifyJob,
  resolvePagesBaseUrl,
  runJob,
} from "@pocket/daily";
import { config as loadEnv } from "dotenv";

loadEnv();

/**
 * CLI entrypoint — routes commands to @pocket/bark or @pocket/daily.
 */
async function main(): Promise<void> {
  const [, , command = "help", ...rest] = process.argv;

  switch (command) {
    case "list":
      await listCommand();
      return;
    case "run":
      await runCommand(rest);
      return;
    case "site":
      await siteCommand();
      return;
    case "notify":
      await notifyCommand(rest);
      return;
    case "bark":
      await barkCommand(rest);
      return;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exitCode = 1;
  }
}

/**
 * Prints available jobs from config/jobs.yaml.
 */
async function listCommand(): Promise<void> {
  const config = loadConfig();
  for (const job of listJobs(config, true)) {
    const flag = job.enabled ? "on " : "off";
    console.log(`${flag}  ${job.id.padEnd(20)}  topic=${job.topic}  llm=${job.llm.provider}`);
    if (job.description) {
      console.log(`      ${job.description}`);
    }
  }
}

/**
 * Runs one or more daily jobs.
 */
async function runCommand(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const config = loadConfig();

  const jobs = flags.all
    ? listJobs(config)
    : flags.job
      ? [getJob(config, flags.job)]
      : null;

  if (!jobs || jobs.length === 0) {
    throw new Error('Specify --job <id> or --all. Use "list" to see jobs.');
  }

  for (const job of jobs) {
    console.log(`\n▶ Running job: ${job.id}`);
    const result = await runJob(config, job, {
      date: flags.date,
      skipDelivery: flags.skipDelivery,
    });
    console.log(`  sources : ${result.sourceIds.join(", ")}`);
    console.log(`  note    : ${result.notePath}`);
    if (result.pagePath) {
      console.log(`  page    : ${result.pagePath}`);
    }
    if (result.pageUrl) {
      console.log(`  url     : ${result.pageUrl}`);
    }
    console.log(`  delivered: ${result.delivered}`);
  }
}

/**
 * Rebuilds the static site from notes/.
 */
async function siteCommand(): Promise<void> {
  const result = buildSite();
  console.log(`site    : ${result.siteDir}`);
  console.log(`notes   : ${result.notes.length}`);
  console.log(`index   : ${result.indexPath}`);
  if (result.pagesBaseUrl) {
    console.log(`public  : ${result.pagesBaseUrl}`);
  } else {
    console.log("public  : (set PAGES_BASE_URL to enable Bark deep links)");
  }
}

/**
 * Pushes an existing note via Bark (typically after Pages deploy).
 */
async function notifyCommand(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  if (!flags.job) {
    throw new Error('Specify --job <id>. Example: npm run notify -- --job english-morning');
  }

  const config = loadConfig();
  const job = getJob(config, flags.job);
  console.log(`\n▶ Notify job: ${job.id}`);
  const result = await notifyJob(config, job, { date: flags.date });
  console.log(`  note    : ${result.notePath}`);
  console.log(`  title   : ${result.title}`);
  if (result.pageUrl) {
    console.log(`  url     : ${result.pageUrl}`);
  } else {
    console.log(`  url     : (missing PAGES_BASE_URL / GITHUB_REPOSITORY)`);
  }
  console.log(`  base    : ${resolvePagesBaseUrl() ?? "(unset)"}`);
  console.log("  delivered: true");
}

interface CliFlags {
  job?: string;
  all: boolean;
  skipDelivery: boolean;
  date?: string;
}

/**
 * Parses simple CLI flags from argv rest args.
 */
function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = { all: false, skipDelivery: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--all") {
      flags.all = true;
    } else if (arg === "--skip-delivery" || arg === "--dry-run") {
      flags.skipDelivery = true;
    } else if (arg === "--job") {
      flags.job = args[i + 1];
      i += 1;
    } else if (arg === "--date") {
      flags.date = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--job=")) {
      flags.job = arg.slice("--job=".length);
    } else if (arg.startsWith("--date=")) {
      flags.date = arg.slice("--date=".length);
    }
  }
  return flags;
}

/**
 * Sends an ad-hoc Bark push (for connectivity tests / one-off messages).
 */
async function barkCommand(args: string[]): Promise<void> {
  const flags = parseBarkFlags(args);
  if (flags.list) {
    for (const device of listDevices()) {
      console.log(`${device.alias.padEnd(12)} ${device.server}`);
    }
    return;
  }

  if (flags.listPresets) {
    for (const preset of listPresets()) {
      const desc = preset.description ? `  ${preset.description}` : "";
      console.log(`${preset.id.padEnd(12)} ${preset.title}${desc}`);
    }
    return;
  }

  if (!flags.body) {
    throw new Error('Bark push requires --body "..."');
  }

  const targets =
    !flags.to || flags.to === "all" ? undefined : flags.to.split(",").map((item) => item.trim());
  const title = resolveTitle({
    title: flags.title,
    preset: flags.preset,
    fallback: "Pocket",
  });

  await push({ title, body: flags.body, url: flags.url, targets });
  console.log(`bark sent  title="${title}"`);
}

interface BarkCliFlags {
  to?: string;
  title?: string;
  preset?: string;
  body?: string;
  url?: string;
  list: boolean;
  listPresets: boolean;
}

/**
 * Parses flags for the bark subcommand.
 */
function parseBarkFlags(args: string[]): BarkCliFlags {
  const flags: BarkCliFlags = { list: false, listPresets: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--list") {
      flags.list = true;
    } else if (arg === "--presets" || arg === "--list-presets") {
      flags.listPresets = true;
    } else if (arg === "--to") {
      flags.to = args[i + 1];
      i += 1;
    } else if (arg === "--title") {
      flags.title = args[i + 1];
      i += 1;
    } else if (arg === "--preset") {
      flags.preset = args[i + 1];
      i += 1;
    } else if (arg === "--body") {
      flags.body = args[i + 1];
      i += 1;
    } else if (arg === "--url") {
      flags.url = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--to=")) {
      flags.to = arg.slice("--to=".length);
    } else if (arg.startsWith("--title=")) {
      flags.title = arg.slice("--title=".length);
    } else if (arg.startsWith("--preset=")) {
      flags.preset = arg.slice("--preset=".length);
    } else if (arg.startsWith("--body=")) {
      flags.body = arg.slice("--body=".length);
    } else if (arg.startsWith("--url=")) {
      flags.url = arg.slice("--url=".length);
    }
  }
  return flags;
}

/**
 * Prints CLI usage.
 */
function printHelp(): void {
  console.log(`Pocket — personal toolkit (monorepo: @pocket/bark + @pocket/daily)

Commands:
  list                          List jobs from config/jobs.yaml
  run --job <id>                Run one daily job (note + site + Bark)
  run --all                     Run all enabled jobs
  run --job <id> --skip-delivery
  run --job <id> --date YYYY-MM-DD
  site                          Rebuild site/ HTML from notes/
  notify --job <id>             Bark-push an existing note (after Pages deploy)
  bark --list                   List Bark device aliases
  bark --presets                List title presets
  bark --to <alias|all> --body "..." [--preset id | --title "..."] [--url "..."]

Examples:
  npm run run:job -- --job english-morning --skip-delivery
  npm run site
  npm run notify -- --job english-morning
  npm run bark -- --to daj --preset stranger --body "在吗"
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError: ${message}`);
  process.exitCode = 1;
});
