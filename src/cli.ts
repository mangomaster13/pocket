#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { getJob, listJobs, loadConfig } from "./config.js";
import { pushToDevice } from "./delivery/bark.js";
import { resolveBarkDevices, selectBarkDevices } from "./delivery/bark-devices.js";
import { runJob } from "./pipeline.js";

loadEnv();

/**
 * CLI entrypoint for listing and running digest jobs.
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
 * Runs one or more jobs.
 *
 * Usage:
 *   npm run run:job -- --job english-morning
 *   npm run run:job -- --all
 *   npm run run:job -- --job english-morning --skip-delivery
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
    console.log(`  delivered: ${result.delivered}`);
  }
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
 *
 * Usage:
 *   npm run bark -- --to daj --body "hello"
 *   npm run bark -- --to all --title ping --body "test"
 *   npm run bark -- --list
 */
async function barkCommand(args: string[]): Promise<void> {
  const flags = parseBarkFlags(args);
  if (flags.list) {
    for (const device of resolveBarkDevices()) {
      console.log(`${device.alias.padEnd(12)} ${device.server}`);
    }
    return;
  }

  if (!flags.body) {
    throw new Error('Bark push requires --body "..."');
  }

  const targets =
    !flags.to || flags.to === "all" ? undefined : flags.to.split(",").map((item) => item.trim());
  const devices = selectBarkDevices(targets);
  const title = flags.title ?? "daily-sub";

  for (const device of devices) {
    await pushToDevice(device, { title, body: flags.body });
    console.log(`bark ok → ${device.alias}`);
  }
}

interface BarkCliFlags {
  to?: string;
  title?: string;
  body?: string;
  list: boolean;
}

/**
 * Parses flags for the bark subcommand.
 */
function parseBarkFlags(args: string[]): BarkCliFlags {
  const flags: BarkCliFlags = { list: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--list") {
      flags.list = true;
    } else if (arg === "--to") {
      flags.to = args[i + 1];
      i += 1;
    } else if (arg === "--title") {
      flags.title = args[i + 1];
      i += 1;
    } else if (arg === "--body") {
      flags.body = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--to=")) {
      flags.to = arg.slice("--to=".length);
    } else if (arg.startsWith("--title=")) {
      flags.title = arg.slice("--title=".length);
    } else if (arg.startsWith("--body=")) {
      flags.body = arg.slice("--body=".length);
    }
  }
  return flags;
}

/**
 * Prints CLI usage.
 */
function printHelp(): void {
  console.log(`daily-sub — configurable daily digest pipeline

Commands:
  list                          List jobs from config/jobs.yaml
  run --job <id>                Run one job
  run --all                     Run all enabled jobs
  run --job <id> --skip-delivery
  run --job <id> --date YYYY-MM-DD
  bark --list                   List Bark device aliases
  bark --to <alias|all> --body "..." [--title "..."]

Examples:
  npm run run:job -- --job english-morning --skip-delivery
  npm run run:job -- --job english-morning
  npm run bark -- --to daj --body "daj我爱你"
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError: ${message}`);
  process.exitCode = 1;
});
