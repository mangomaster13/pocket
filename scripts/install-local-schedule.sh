#!/usr/bin/env bash
# Install macOS launchd agents for Pocket daily schedules (Asia/Shanghai wall clock
# when the Mac timezone is China Standard Time).
#
# Usage:
#   npm run schedule:install
#   scripts/install-local-schedule.sh [--no-sync] [--no-pages] [--run-now]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL_PREFIX="com.pocket"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
RUNNER="$ROOT/scripts/local-run.sh"

SYNC=1
DEPLOY_PAGES=1
RUN_NOW=0

for arg in "$@"; do
  case "$arg" in
    --no-sync) SYNC=0 ;;
    --no-pages) DEPLOY_PAGES=0 ;;
    --run-now) RUN_NOW=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

chmod +x "$RUNNER" "$ROOT/scripts/uninstall-local-schedule.sh" 2>/dev/null || true

# Resolve absolute Node bin dir (nvm-friendly) so launchd does not need a login shell.
resolve_node_bin() {
  if command -v npm >/dev/null 2>&1; then
    dirname "$(command -v npm)"
    return 0
  fi
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    export MANPATH="${MANPATH:-}"
    set +u
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    nvm use default >/dev/null 2>&1 || true
    set -u
    if command -v npm >/dev/null 2>&1; then
      dirname "$(command -v npm)"
      return 0
    fi
  fi
  echo "error: cannot find npm. Install Node or open a shell where nvm works, then retry." >&2
  exit 1
}

NODE_BIN="$(resolve_node_bin)"
PATH_VALUE="$NODE_BIN:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "warning: $ROOT/.env missing — copy from .env.example and fill keys before the first scheduled run."
fi

TZ_NAME="$(date +%Z)"
echo "Installing Pocket local schedule"
echo "  root:     $ROOT"
echo "  node bin: $NODE_BIN"
echo "  tz now:   $(date '+%Y-%m-%d %H:%M:%S %Z') (launchd uses Mac local time)"
if [[ "$TZ_NAME" != "CST" && "$TZ_NAME" != "UTC+8" ]]; then
  echo "  note: Mac timezone is $TZ_NAME — set System Settings → Date & Time → Asia/Shanghai for Beijing wall clock."
fi
echo "  sync:     POCKET_LOCAL_SYNC=$SYNC"
echo "  pages:    POCKET_LOCAL_DEPLOY_PAGES=$DEPLOY_PAGES"

mkdir -p "$LAUNCH_AGENTS" "$ROOT/logs"

write_plist() {
  local label="$1"
  local task="$2"
  local hour="$3"
  local minute="$4"
  local plist="$LAUNCH_AGENTS/${label}.plist"

  cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER}</string>
    <string>${task}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH_VALUE}</string>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>POCKET_NODE_BIN</key>
    <string>${NODE_BIN}</string>
    <key>POCKET_LOCAL_SYNC</key>
    <string>${SYNC}</string>
    <key>POCKET_LOCAL_DEPLOY_PAGES</key>
    <string>${DEPLOY_PAGES}</string>
    <key>LANG</key>
    <string>en_US.UTF-8</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${ROOT}/logs/${task}-launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${ROOT}/logs/${task}-launchd.err.log</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

  launchctl bootout "gui/$(id -u)/${label}" 2>/dev/null || true
  launchctl unload "$plist" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  launchctl enable "gui/$(id -u)/${label}" 2>/dev/null || true
  echo "  loaded $label  →  ${hour}:$(printf '%02d' "$minute")  ($task)"
}

# Beijing wall clock (Mac must be on Asia/Shanghai / CST).
write_plist "${LABEL_PREFIX}.articles-generate" "articles-generate" 7 30
write_plist "${LABEL_PREFIX}.articles-notify" "articles-notify" 8 0
write_plist "${LABEL_PREFIX}.invest-generate" "invest-generate" 14 30
write_plist "${LABEL_PREFIX}.invest-notify" "invest-notify" 14 40

echo
echo "Done. Agents:"
launchctl list | grep "$LABEL_PREFIX" || true
echo
echo "Manual test:"
echo "  npm run schedule:run -- articles-generate"
echo "Logs:"
echo "  $ROOT/logs/"
echo
echo "Tip: disable GitHub Actions schedule triggers (or the whole workflows) to avoid double runs."
echo "Uninstall: npm run schedule:uninstall"

if [[ "$RUN_NOW" == "1" ]]; then
  echo
  echo "Running articles-generate once (--run-now)..."
  "$RUNNER" articles-generate
fi
