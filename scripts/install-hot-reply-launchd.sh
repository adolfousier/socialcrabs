#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LABEL="com.socialcrabs.hot-reply"
DOMAIN="gui/$(id -u)"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
PATH_VALUE="/usr/local/bin:/opt/homebrew/bin:/Users/openai/.hermes/node/bin:/Users/openai/.hermes/hermes-agent/venv/bin:/Users/openai/.hermes/node:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$HOME/Library/LaunchAgents" logs
chmod +x scripts/run-hot-reply-watchdog-foreground.sh

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT_DIR}/scripts/run-hot-reply-watchdog-foreground.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH_VALUE}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${ROOT_DIR}/logs/opentwitter-hot-reply-watchdog.log</string>
  <key>StandardErrorPath</key>
  <string>${ROOT_DIR}/logs/opentwitter-hot-reply-watchdog.log</string>
</dict>
</plist>
PLIST

plutil -lint "$PLIST"

# Avoid duplicate manual nohup watchers before launchd takes ownership.
OLD_PIDS="$(pgrep -f 'node dist/scripts/opentwitter-hot-reply\.js' || true)"
if [[ -n "$OLD_PIDS" ]]; then
  printf '[%s] stopping manual hot-reply watcher pid(s): %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$OLD_PIDS" | tee -a logs/opentwitter-hot-reply-watchdog.log
  # shellcheck disable=SC2086 # intentional pid word-splitting
  kill $OLD_PIDS 2>/dev/null || true
  sleep 2
fi

launchctl bootout "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/${LABEL}"
launchctl kickstart -k "$DOMAIN/${LABEL}"

sleep "${HOT_REPLY_VERIFY_WAIT_SECONDS:-5}"
launchctl print "$DOMAIN/${LABEL}" | sed -n '1,80p'
printf '\n--- running watcher ---\n'
pgrep -af 'node dist/scripts/opentwitter-hot-reply\.js' || true
printf '\nplist=%s\nlabel=%s\ndomain=%s\n' "$PLIST" "$LABEL" "$DOMAIN"
