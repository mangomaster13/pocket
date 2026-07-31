#!/usr/bin/env bash
# Install macOS launchd agents that dispatch GitHub Actions workflows on time
# (Asia/Shanghai wall clock when the Mac timezone is China Standard Time).
#
# Usage:
#   npm run schedule:install
#   scripts/install-local-schedule.sh [--run-now]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL_PREFIX="com.pocket"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
RUNNER="$ROOT/scripts/local-run.sh"
RUN_NOW=0

for arg in "$@"; do
  case "$arg" in
    --run-now) RUN_NOW=1 ;;
    --no-sync | --no-pages)
      echo "note: --no-sync / --no-pages ignored (local runner only dispatches Actions now)"
      ;;
    -h | --help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

chmod +x "$RUNNER" "$ROOT/scripts/uninstall-local-schedule.sh" 2>/dev/null || true

PATH_VALUE="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "warning: $ROOT/.env missing — copy from .env.example and set GITHUB_TOKEN."
elif ! grep -Eq '^(GITHUB_TOKEN|GH_TOKEN)=' "$ROOT/.env" 2>/dev/null; then
  echo "warning: .env has no GITHUB_TOKEN / GH_TOKEN — dispatch will fail until you add a classic PAT (repo + workflow)."
fi

TZ_NAME="$(date +%Z)"
echo "Installing Pocket local schedule (dispatch → GitHub Actions)"
echo "  root:   $ROOT"
echo "  tz now: $(date '+%Y-%m-%d %H:%M:%S %Z') (launchd uses Mac local time)"
if [[ "$TZ_NAME" != "CST" && "$TZ_NAME" != "UTC+8" ]]; then
  echo "  note: Mac timezone is $TZ_NAME — set System Settings → Date & Time → Asia/Shanghai for Beijing wall clock."
fi

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
echo "Each tick only calls GitHub workflow_dispatch (work runs in Actions)."
echo "Manual test:  npm run schedule:run -- articles-notify"
echo "Logs:         $ROOT/logs/"
echo "Uninstall:    npm run schedule:uninstall"

if [[ "$RUN_NOW" == "1" ]]; then
  echo
  echo "Dispatching articles-generate once (--run-now)..."
  "$RUNNER" articles-generate
fi
