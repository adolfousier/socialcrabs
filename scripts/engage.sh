#!/bin/bash
# LinkedIn Engagement Runner
# Uses ClawSocial CLI with human-like delays

set -e
cd "$(dirname "$0")/.."

STATE_FILE="db/linkedin_state.json"
DELAY_LOG="db/delay_log.txt"

# Min/max delay in seconds (10-25 minutes)
MIN_DELAY=600
MAX_DELAY=1500

# Generate unique random delay
get_delay() {
    while true; do
        delay=$((RANDOM % (MAX_DELAY - MIN_DELAY + 1) + MIN_DELAY))
        delay=$((delay + RANDOM % 60))
        
        if ! grep -q "^$delay$" "$DELAY_LOG" 2>/dev/null; then
            echo "$delay" >> "$DELAY_LOG"
            echo "$delay"
            return
        fi
    done
}

# Comment templates
COMMENTS=(
    "Great insights here! This is exactly what the community needs."
    "Solid breakdown. The technical depth is appreciated."
    "Thanks for sharing this perspective. Really helpful!"
    "Interesting take on the AI agent ecosystem. Well articulated."
    "Appreciate the analysis here. Bookmarked for reference."
    "Good overview! Would love to see more deep dives like this."
    "This is a helpful resource. The ecosystem is evolving fast."
)

get_comment() {
    echo "${COMMENTS[$RANDOM % ${#COMMENTS[@]}]}"
}

echo "========================================"
echo "LinkedIn Engagement Session"
echo "========================================"
echo ""

# Get pending articles (hash:url pairs)
PENDING=$(jq -r '.articles | to_entries[] | select(.value.commented == false) | "\(.key)|\(.value.url)|\(.value.title)"' "$STATE_FILE" 2>/dev/null)

if [ -z "$PENDING" ]; then
    echo "No pending articles to engage with."
    exit 0
fi

COUNT=$(echo "$PENDING" | wc -l)
echo "Found $COUNT articles pending engagement"
echo ""

MAX_COMMENTS=7
DONE=0

echo "$PENDING" | while IFS='|' read -r HASH URL TITLE; do
    if [ $DONE -ge $MAX_COMMENTS ]; then
        echo "Reached max comments ($MAX_COMMENTS). Stopping."
        break
    fi
    
    echo "[$((DONE + 1))/$MAX_COMMENTS] ${TITLE:0:50}..."
    echo "  URL: $URL"
    
    # Like the post
    echo "  → Liking..."
    LIKE_OUT=$(npx tsx src/cli.ts linkedin like "$URL" 2>&1) || true
    if echo "$LIKE_OUT" | grep -q -i "error\|failed"; then
        echo "  ✗ Like failed: $LIKE_OUT"
    else
        echo "  ✓ Liked"
        # Update state - mark as liked
        jq --arg hash "$HASH" '.articles[$hash].liked = true' "$STATE_FILE" > tmp.$$.json && mv tmp.$$.json "$STATE_FILE"
    fi
    
    # Small delay before commenting (5-15 sec)
    sleep $((5 + RANDOM % 10))
    
    # Comment
    COMMENT=$(get_comment)
    echo "  → Commenting: ${COMMENT:0:50}..."
    COMMENT_OUT=$(npx tsx src/cli.ts linkedin comment "$URL" "$COMMENT" 2>&1) || true
    if echo "$COMMENT_OUT" | grep -q -i "error\|failed"; then
        echo "  ✗ Comment failed: $COMMENT_OUT"
    else
        echo "  ✓ Commented"
        DONE=$((DONE + 1))
        # Update state
        jq --arg hash "$HASH" '.articles[$hash].commented = true' "$STATE_FILE" > tmp.$$.json && mv tmp.$$.json "$STATE_FILE"
        jq --arg url "$URL" --arg comment "$COMMENT" --arg ts "$(date -Iseconds)" \
            '.comments_made += [{"url": $url, "comment": $comment, "timestamp": $ts}]' \
            "$STATE_FILE" > tmp.$$.json && mv tmp.$$.json "$STATE_FILE"
    fi
    
    # Wait before next (unless done)
    REMAINING=$((COUNT - DONE - 1))
    if [ $DONE -lt $MAX_COMMENTS ] && [ $REMAINING -gt 0 ]; then
        DELAY=$(get_delay)
        MINS=$((DELAY / 60))
        SECS=$((DELAY % 60))
        echo ""
        echo "  ⏳ Waiting ${MINS}m ${SECS}s before next..."
        sleep $DELAY
    fi
    
    echo ""
done

FINAL_DONE=$(jq '[.articles[] | select(.commented == true)] | length' "$STATE_FILE")
echo "========================================"
echo "Session complete!"
echo "  Total commented: $FINAL_DONE"
echo "========================================"
