#!/usr/bin/env bash
# Remove Pocket macOS launchd agents installed by install-local-schedule.sh.

set -euo pipefail

LABEL_PREFIX="com.pocket"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"

labels=(
  "${LABEL_PREFIX}.articles-generate"
  "${LABEL_PREFIX}.articles-notify"
  "${LABEL_PREFIX}.invest-generate"
  "${LABEL_PREFIX}.invest-notify"
)

for label in "${labels[@]}"; do
  plist="$LAUNCH_AGENTS/${label}.plist"
  launchctl bootout "gui/${UID_NUM}/${label}" 2>/dev/null || true
  launchctl unload "$plist" 2>/dev/null || true
  if [[ -f "$plist" ]]; then
    rm -f "$plist"
    echo "removed $plist"
  else
    echo "skip (not installed): $label"
  fi
done

echo "Pocket local schedule uninstalled."
