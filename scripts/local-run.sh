#!/usr/bin/env bash
# Pocket local scheduler runner (macOS launchd / manual).
# Usage: scripts/local-run.sh <task>
# Tasks: articles-generate | articles-notify | invest-generate | invest-notify

set -euo pipefail

TASK="${1:-}"
if [[ -z "$TASK" ]]; then
  echo "Usage: $0 <articles-generate|articles-notify|invest-generate|invest-notify>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${POCKET_LOG_DIR:-$ROOT/logs}"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y-%m-%dT%H-%M-%S)"
LOG_FILE="$LOG_DIR/${TASK}-${STAMP}.log"
LOCK_DIR="$LOG_DIR/.locks"
mkdir -p "$LOCK_DIR"
LOCK_FILE="$LOCK_DIR/${TASK}.lock"

# Keep machine awake for the duration of this run (display may sleep).
if command -v caffeinate >/dev/null 2>&1 && [[ "${POCKET_INNER:-}" != "1" ]]; then
  export POCKET_INNER=1
  exec caffeinate -i -- "$0" "$TASK"
fi

# Ensure Node/npm are on PATH (launchd has a minimal env; interactive shells often already have nvm).
if [[ -n "${POCKET_NODE_BIN:-}" ]]; then
  export PATH="$POCKET_NODE_BIN:$PATH"
elif ! command -v npm >/dev/null 2>&1; then
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # nvm.sh touches MANPATH; with `set -u` an unset MANPATH aborts the script.
    export MANPATH="${MANPATH:-}"
    set +u
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    nvm use default >/dev/null 2>&1 || true
    set -u
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found in PATH=$PATH" >&2
  exit 1
fi

# Secrets come from .env via the CLI (dotenv). Do not `source` .env here.

# Capture stdout/stderr into a dated log (launchd also has StandardOut/Err paths).
exec >>"$LOG_FILE" 2>&1

echo "=== pocket local-run ==="
echo "task=$TASK"
echo "root=$ROOT"
echo "started=$(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "node=$(command -v node) ($(node -v))"
echo "npm=$(command -v npm)"
echo "log=$LOG_FILE"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "error: another $TASK run is in progress (lock $LOCK_FILE)"
    exit 1
  fi
else
  # macOS often lacks flock; use mkdir as a simple lock.
  if ! mkdir "$LOCK_FILE.d" 2>/dev/null; then
    echo "error: another $TASK run is in progress (lock $LOCK_FILE.d)"
    exit 1
  fi
  trap 'rmdir "$LOCK_FILE.d" 2>/dev/null || true' EXIT
fi

sync_notes_and_site() {
  local msg="$1"
  # Default on: keep GitHub notes + Pages in sync with local runs.
  if [[ "${POCKET_LOCAL_SYNC:-1}" != "1" ]]; then
    echo "skip sync (POCKET_LOCAL_SYNC=${POCKET_LOCAL_SYNC:-})"
    return 0
  fi

  if ! command -v git >/dev/null 2>&1; then
    echo "warning: git not found; skip sync"
    return 0
  fi

  git add notes || true
  if git diff --staged --quiet; then
    echo "No note changes to commit"
  else
    git -c user.name="${POCKET_GIT_USER_NAME:-pocket bot}" \
      -c user.email="${POCKET_GIT_USER_EMAIL:-pocket@users.noreply.github.com}" \
      commit -m "$msg"
    git push
    echo "pushed notes"
  fi

  if [[ "${POCKET_LOCAL_DEPLOY_PAGES:-1}" == "1" ]]; then
    if [[ ! -d "$ROOT/site" ]]; then
      echo "warning: site/ missing; skip Pages deploy"
      return 0
    fi
    echo "deploying site/ → gh-pages"
    npx --yes gh-pages@6 -d site --dotfiles -m "chore: deploy site $(date -u +%Y-%m-%d)"
    echo "deployed Pages"
  else
    echo "skip Pages deploy (POCKET_LOCAL_DEPLOY_PAGES=0)"
  fi
}

case "$TASK" in
  articles-generate)
    npm run run:job -- --all --app articles --skip-delivery
    npm run site
    sync_notes_and_site "chore: add daily notes $(date -u +%Y-%m-%d) (local)"
    ;;
  articles-notify)
    npm run notify -- --all --app articles
    ;;
  invest-generate)
    npm run run:job -- --job invest-daily --skip-delivery
    npm run site
    sync_notes_and_site "chore: add invest brief $(date -u +%Y-%m-%d) (local)"
    ;;
  invest-notify)
    npm run notify -- --job invest-daily
    ;;
  *)
    echo "error: unknown task '$TASK'" >&2
    exit 2
    ;;
esac

echo "finished=$(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=== ok ==="
