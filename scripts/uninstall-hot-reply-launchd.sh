#!/usr/bin/env bash
set -euo pipefail

LABEL="com.socialcrabs.hot-reply"
DOMAIN="gui/$(id -u)"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

launchctl bootout "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
printf 'uninstalled %s from %s\n' "$LABEL" "$DOMAIN"
