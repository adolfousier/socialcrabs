#!/bin/bash
# Remote Browser Script - Opens browser you can control remotely
# 
# Usage:
#   ./scripts/remote-browser.sh          # Opens Instagram login page
#   ./scripts/remote-browser.sh "URL"    # Opens custom URL
#
# Then on YOUR machine, run:
#   ssh -L 9222:localhost:9222 your-server
#   Open Chrome and go to: chrome://inspect

URL="${1:-https://www.instagram.com/accounts/login/}"

echo "🌐 Starting remote browser..."
echo "📍 URL: $URL"
echo ""
echo "To connect from your machine:"
echo "  1. SSH tunnel: ssh -L 9222:localhost:9222 $(hostname)"
echo "  2. Open Chrome → chrome://inspect"
echo "  3. Click 'Configure' → Add 'localhost:9222'"
echo "  4. Your browser will appear under 'Remote Target'"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")/.."

# Launch Chromium with remote debugging
npx playwright launch --browser=chromium --channel=chrome \
  --headed=false \
  --remote-debugging-port=9222 \
  "$URL" 2>/dev/null || \
npx playwright install chromium && \
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--remote-debugging-port=9222']
  });
  const page = await browser.newPage();
  await page.goto('$URL');
  console.log('Browser ready! Connect via chrome://inspect');
  // Keep running
  await new Promise(() => {});
})();
"
