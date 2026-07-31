#!/usr/bin/env bash
# Pocket local alarm clock: dispatch GitHub Actions workflows on time.
# Usage: scripts/local-run.sh <task>
# Tasks: articles-generate | articles-notify | invest-generate | invest-notify
#
# Requires GITHUB_TOKEN (or GH_TOKEN) in .env — classic PAT with repo + workflow.

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

# Brief wake lock so sleep does not interrupt the HTTP call.
if command -v caffeinate >/dev/null 2>&1 && [[ "${POCKET_INNER:-}" != "1" ]]; then
  export POCKET_INNER=1
  exec caffeinate -i -- "$0" "$TASK"
fi

# Load selected keys from .env without requiring Node.
load_dotenv_keys() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[2]}"
      val="${BASH_REMATCH[3]}"
      if [[ "$val" =~ ^\"(.*)\"$ ]]; then
        val="${BASH_REMATCH[1]}"
      elif [[ "$val" =~ ^\'(.*)\'$ ]]; then
        val="${BASH_REMATCH[1]}"
      fi
      case "$key" in
        GITHUB_TOKEN | GH_TOKEN | POCKET_GITHUB_REPO | POCKET_GITHUB_REF)
          export "${key}=${val}"
          ;;
      esac
    fi
  done <"$file"
}

load_dotenv_keys "$ROOT/.env"

resolve_repo() {
  if [[ -n "${POCKET_GITHUB_REPO:-}" ]]; then
    echo "$POCKET_GITHUB_REPO"
    return 0
  fi
  local url
  url="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
  if [[ "$url" =~ github\.com[:/]+([^/]+)/([^/.]+)(\.git)?$ ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
    return 0
  fi
  echo "mangomaster13/pocket"
}

# Capture stdout/stderr into a dated log (launchd also has StandardOut/Err paths).
exec >>"$LOG_FILE" 2>&1

echo "=== pocket dispatch ==="
echo "task=$TASK"
echo "root=$ROOT"
echo "started=$(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "log=$LOG_FILE"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "error: another $TASK run is in progress (lock $LOCK_FILE)"
    exit 1
  fi
else
  if ! mkdir "$LOCK_FILE.d" 2>/dev/null; then
    echo "error: another $TASK run is in progress (lock $LOCK_FILE.d)"
    exit 1
  fi
  trap 'rmdir "$LOCK_FILE.d" 2>/dev/null || true' EXIT
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl not found"
  exit 1
fi

TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  echo "error: GITHUB_TOKEN (or GH_TOKEN) missing in .env"
  echo "Create a classic PAT with scopes: repo, workflow"
  echo "https://github.com/settings/tokens"
  exit 1
fi

REPO="$(resolve_repo)"
REF="${POCKET_GITHUB_REF:-master}"

dispatch_workflow() {
  local workflow_file="$1"
  local url="https://api.github.com/repos/${REPO}/actions/workflows/${workflow_file}/dispatches"
  local body_file
  body_file="$(mktemp -t pocket-dispatch.XXXXXX)"
  local code
  code="$(
    curl -sS -o "$body_file" -w "%{http_code}" \
      -X POST \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "$url" \
      -d "{\"ref\":\"${REF}\"}"
  )"
  echo "POST $url"
  echo "ref=$REF http=$code"
  if [[ "$code" != "204" ]]; then
    echo "error: workflow_dispatch failed"
    cat "$body_file" || true
    rm -f "$body_file"
    exit 1
  fi
  rm -f "$body_file"
  echo "dispatched ${workflow_file} → https://github.com/${REPO}/actions"
}

case "$TASK" in
  articles-generate) dispatch_workflow "daily.yml" ;;
  articles-notify) dispatch_workflow "articles-notify.yml" ;;
  invest-generate) dispatch_workflow "invest.yml" ;;
  invest-notify) dispatch_workflow "invest-notify.yml" ;;
  *)
    echo "error: unknown task '$TASK'" >&2
    exit 2
    ;;
esac

echo "finished=$(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=== ok ==="
