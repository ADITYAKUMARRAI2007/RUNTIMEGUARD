#!/bin/bash
# Screen recorder for RuntimeGuard AI demo
# Records the entire screen for N seconds, then saves as MP4

DURATION=${1:-120}   # default 2 minutes, pass a number to override
OUTPUT="runtimeguard-demo-$(date +%Y%m%d-%H%M%S).mp4"

echo "Recording screen for ${DURATION}s → $OUTPUT"
echo "Press Ctrl+C to stop early."
echo ""
echo "Open http://localhost:5173 in your browser now."
echo "Starting in 3 seconds..."
sleep 3

# Use ffmpeg to record screen (avfoundation on macOS)
ffmpeg -f avfoundation \
  -framerate 30 \
  -i "1:0" \
  -t "$DURATION" \
  -vcodec libx264 \
  -preset ultrafast \
  -crf 23 \
  -movflags +faststart \
  "$OUTPUT" 2>/dev/null

echo ""
echo "Saved: $OUTPUT"
