/**
 * Pocket Schedule GUI — one-click GitHub Actions dispatch.
 */

/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;

const el = {
  meta: document.getElementById("meta"),
  hint: document.getElementById("hint"),
  tasks: document.getElementById("tasks"),
  linkActions: /** @type {HTMLAnchorElement} */ (document.getElementById("link-actions")),
  toast: document.getElementById("toast"),
};

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function api(path, init) {
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    // @ts-expect-error attach urls
    err.actionsUrl = data.actionsUrl;
    // @ts-expect-error attach urls
    err.workflowUrl = data.workflowUrl;
    throw err;
  }
  return data;
}

/**
 * @param {string} msg
 */
function toast(msg) {
  el.toast.hidden = false;
  el.toast.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.toast.hidden = true;
  }, 3600);
}
toast._t = 0;

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * @param {object} status
 */
function render(status) {
  el.linkActions.href = status.actionsUrl;
  const tokenBadge = status.hasToken ? "token ok" : "missing GITHUB_TOKEN";
  el.meta.textContent = `${status.repo} · ${status.tz} · ${tokenBadge}`;
  el.hint.textContent = status.hasToken
    ? "点击 Trigger 调用 GitHub workflow_dispatch；日志请到 Actions 查看。"
    : "请先在项目 .env 写入 GITHUB_TOKEN（classic PAT：repo + workflow）。";

  el.tasks.innerHTML = "";
  for (const task of status.tasks) {
    const agentBadge = task.agent?.loaded
      ? `<span class="badge ok">timer on</span>`
      : `<span class="badge warn">timer off</span>`;

    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="card-top">
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <p class="summary">${escapeHtml(task.summary)}</p>
          <p class="workflow">${escapeHtml(task.workflow)}</p>
        </div>
        <div class="badges">
          <span class="badge">${escapeHtml(task.schedule)}</span>
          ${agentBadge}
        </div>
      </div>
      <div class="card-actions">
        <button type="button" class="btn primary" data-run="${escapeHtml(task.id)}" ${
          task.busy ? "disabled" : ""
        }>
          ${task.busy ? "Dispatching…" : "Trigger on GitHub"}
        </button>
        <a class="btn ghost" href="${escapeHtml(task.workflowUrl)}" target="_blank" rel="noreferrer">
          Open workflow
        </a>
      </div>
    `;
    el.tasks.appendChild(card);
  }

  el.tasks.querySelectorAll("[data-run]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-run");
      if (!id) return;
      btn.setAttribute("disabled", "true");
      const label = btn.textContent;
      btn.textContent = "Dispatching…";
      try {
        const result = await api(`/api/run/${encodeURIComponent(id)}`, { method: "POST" });
        toast(result.message || "Dispatched");
        if (result.actionsUrl) {
          window.open(result.actionsUrl, "_blank", "noopener,noreferrer");
        }
        await refresh();
      } catch (e) {
        const err = /** @type {Error & { actionsUrl?: string }} */ (e);
        toast(err.message);
        btn.removeAttribute("disabled");
        btn.textContent = label || "Trigger on GitHub";
      }
    });
  });
}

async function refresh() {
  render(await api("/api/status"));
}

document.getElementById("btn-refresh")?.addEventListener("click", () => {
  void refresh().then(() => toast("Refreshed"));
});

document.getElementById("btn-install")?.addEventListener("click", async () => {
  try {
    const result = await api("/api/schedule/install", { method: "POST" });
    toast(result.code === 0 ? "Daily timer installed" : "Install failed");
    await refresh();
  } catch (e) {
    toast(String(/** @type {Error} */ (e).message));
  }
});

document.getElementById("btn-uninstall")?.addEventListener("click", async () => {
  if (!confirm("Unload and remove all Pocket launchd timers?")) return;
  try {
    const result = await api("/api/schedule/uninstall", { method: "POST" });
    toast(result.code === 0 ? "Timers uninstalled" : "Uninstall failed");
    await refresh();
  } catch (e) {
    toast(String(/** @type {Error} */ (e).message));
  }
});

async function boot() {
  await refresh();
  pollTimer = setInterval(() => {
    void refresh().catch(() => {});
  }, 8000);
}

void boot();
