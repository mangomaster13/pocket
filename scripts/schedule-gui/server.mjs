#!/usr/bin/env node
/**
 * Pocket Schedule GUI — dispatch GitHub Actions from localhost buttons.
 * Usage: npm run schedule:gui
 */

import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const RUNNER = path.join(ROOT, "scripts/local-run.sh");
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.POCKET_GUI_PORT || 8787);
const HOST = process.env.POCKET_GUI_HOST || "127.0.0.1";
const LABEL_PREFIX = "com.pocket";

/** @typedef {{ id: string, title: string, schedule: string, workflow: string, summary: string }} TaskDef */

/** @type {TaskDef[]} */
const TASKS = [
  {
    id: "articles-generate",
    title: "Articles Generate",
    schedule: "07:30",
    workflow: "daily.yml",
    summary: "Generate Articles notes → site → Pages",
  },
  {
    id: "articles-notify",
    title: "Articles Notify",
    schedule: "08:00",
    workflow: "articles-notify.yml",
    summary: "Bark push for today's Articles",
  },
  {
    id: "invest-generate",
    title: "Invest Generate",
    schedule: "14:30",
    workflow: "invest.yml",
    summary: "Generate Invest brief → site → Pages",
  },
  {
    id: "invest-notify",
    title: "Invest Notify",
    schedule: "14:40",
    workflow: "invest-notify.yml",
    summary: "Bark push for today's Invest note",
  },
];

/** @type {Set<string>} */
const dispatching = new Set();

/**
 * @param {string} file
 * @param {string[]} args
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
function run(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof err.code === "number" ? err.code : err ? 1 : 0;
      resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

/**
 * Read selected keys from .env without printing secrets.
 * @returns {Promise<Record<string, string>>}
 */
async function readEnvKeys() {
  /** @type {Record<string, string>} */
  const out = {};
  try {
    const text = await fs.readFile(path.join(ROOT, ".env"), "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[m[1]] = val;
    }
  } catch {
    /* missing .env */
  }
  return out;
}

/**
 * @returns {Promise<string>}
 */
async function resolveRepo() {
  const env = await readEnvKeys();
  if (env.POCKET_GITHUB_REPO?.trim()) return env.POCKET_GITHUB_REPO.trim();
  const { stdout } = await run("git", ["remote", "get-url", "origin"]);
  const url = stdout.trim();
  const m = url.match(/github\.com[:/]+([^/]+)\/([^/.]+)(?:\.git)?$/i);
  if (m) return `${m[1]}/${m[2]}`;
  return "mangomaster13/pocket";
}

/**
 * @returns {Promise<Record<string, { loaded: boolean, lastExit: number | null }>>}
 */
async function launchdStatus() {
  const { stdout } = await run("launchctl", ["list"]);
  /** @type {Record<string, { loaded: boolean, lastExit: number | null }>} */
  const out = {};
  for (const task of TASKS) {
    out[task.id] = { loaded: false, lastExit: null };
  }
  for (const line of stdout.split("\n")) {
    if (!line.includes(LABEL_PREFIX)) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [, exitRaw, label] = parts;
    const taskId = label.replace(`${LABEL_PREFIX}.`, "");
    if (!out[taskId]) continue;
    out[taskId] = {
      loaded: true,
      lastExit: exitRaw === "-" ? null : Number(exitRaw),
    };
  }
  return out;
}

/**
 * Run local-run.sh and wait until workflow_dispatch finishes.
 * @param {string} taskId
 */
async function dispatchTask(taskId) {
  const def = TASKS.find((t) => t.id === taskId);
  if (!def) {
    throw Object.assign(new Error(`unknown task: ${taskId}`), { status: 400 });
  }
  if (dispatching.has(taskId)) {
    throw Object.assign(new Error(`already dispatching: ${taskId}`), { status: 409 });
  }

  const env = await readEnvKeys();
  if (!env.GITHUB_TOKEN && !env.GH_TOKEN) {
    throw Object.assign(
      new Error("GITHUB_TOKEN missing in .env (classic PAT: repo + workflow)"),
      { status: 400 },
    );
  }

  dispatching.add(taskId);
  try {
    // local-run.sh writes details to logs/; exit 0 means workflow_dispatch succeeded.
    const { code } = await run("/bin/bash", [RUNNER, taskId]);
    const repo = await resolveRepo();
    const actionsUrl = `https://github.com/${repo}/actions`;
    const workflowUrl = `https://github.com/${repo}/actions/workflows/${def.workflow}`;
    if (code !== 0) {
      const hint = await latestErrorHint(taskId);
      throw Object.assign(new Error(hint || `dispatch failed (exit ${code})`), {
        status: 500,
        actionsUrl,
        workflowUrl,
      });
    }
    return {
      ok: true,
      taskId,
      workflow: def.workflow,
      actionsUrl,
      workflowUrl,
      message: `Dispatched ${def.workflow}`,
    };
  } finally {
    dispatching.delete(taskId);
  }
}

/**
 * Best-effort error line from the newest local dispatch log.
 * @param {string} taskId
 */
async function latestErrorHint(taskId) {
  try {
    const logDir = process.env.POCKET_LOG_DIR || path.join(ROOT, "logs");
    const names = (await fs.readdir(logDir))
      .filter((n) => n.startsWith(`${taskId}-`) && n.endsWith(".log") && !n.includes("launchd"))
      .sort()
      .reverse();
    if (!names[0]) return "";
    const text = await fs.readFile(path.join(logDir, names[0]), "utf8");
    const errLine = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("error:") || /^http=\d+/.test(l))
      .slice(-3);
    return errLine.join(" · ");
  } catch {
    return "";
  }
}

/**
 * @returns {Promise<object>}
 */
async function buildStatus() {
  const [agents, repo, env] = await Promise.all([
    launchdStatus(),
    resolveRepo(),
    readEnvKeys(),
  ]);
  const actionsUrl = `https://github.com/${repo}/actions`;
  const tasks = TASKS.map((def) => ({
    ...def,
    agent: agents[def.id],
    busy: dispatching.has(def.id),
    workflowUrl: `https://github.com/${repo}/actions/workflows/${def.workflow}`,
  }));
  return {
    root: ROOT,
    repo,
    actionsUrl,
    hasToken: Boolean(env.GITHUB_TOKEN || env.GH_TOKEN),
    now: new Date().toISOString(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tasks,
  };
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 */
async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/status") {
    return json(res, await buildStatus());
  }

  const runMatch = pathname.match(/^\/api\/run\/([^/]+)$/);
  if (req.method === "POST" && runMatch) {
    const taskId = decodeURIComponent(runMatch[1]);
    try {
      return json(res, await dispatchTask(taskId));
    } catch (e) {
      const err = /** @type {Error & { status?: number, actionsUrl?: string, workflowUrl?: string }} */ (
        e
      );
      return json(
        res,
        {
          error: err.message,
          actionsUrl: err.actionsUrl,
          workflowUrl: err.workflowUrl,
        },
        err.status ?? 400,
      );
    }
  }

  if (req.method === "POST" && pathname === "/api/schedule/install") {
    const { code, stdout, stderr } = await run("bash", [
      path.join(ROOT, "scripts/install-local-schedule.sh"),
    ]);
    return json(res, { code, stdout, stderr }, code === 0 ? 200 : 500);
  }

  if (req.method === "POST" && pathname === "/api/schedule/uninstall") {
    const { code, stdout, stderr } = await run("bash", [
      path.join(ROOT, "scripts/uninstall-local-schedule.sh"),
    ]);
    return json(res, { code, stdout, stderr }, code === 0 ? 200 : 500);
  }

  return json(res, { error: "not found" }, 404);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {unknown} body
 * @param {number} [status]
 */
function json(res, body, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body, null, 2));
}

/**
 * @param {string} filePath
 */
function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} filePath
 */
async function serveFile(res, filePath) {
  const data = await fs.readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-store",
  });
  res.end(data);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }
    if (pathname === "/") pathname = "/index.html";
    const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(PUBLIC_DIR, safe);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      json(res, { error: "forbidden" }, 403);
      return;
    }
    await serveFile(res, filePath);
  } catch (e) {
    const err = /** @type {NodeJS.ErrnoException} */ (e);
    if (err.code === "ENOENT") {
      json(res, { error: "not found" }, 404);
      return;
    }
    console.error(err);
    json(res, { error: "internal error", detail: String(err.message) }, 500);
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`Pocket Schedule GUI → ${url}`);
  if (process.platform === "darwin" && process.env.POCKET_GUI_NO_OPEN !== "1") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  }
});
