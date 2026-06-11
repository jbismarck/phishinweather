#!/usr/bin/env bash
# vps-stream.sh — capture phishinweather.com and push to YouTube Live
# Managed by systemd (vps-setup.sh installs the unit).
# Env vars: YOUTUBE_STREAM_KEY, STREAM_URL
set -e

DISPLAY_NUM=99
DISPLAY=":${DISPLAY_NUM}"
SCREEN_RES="640x480"
YOUTUBE_RTMP="rtmp://a.rtmp.youtube.com/live2//${YOUTUBE_STREAM_KEY}"
PAGE_LOAD_WAIT=20   # seconds to let the page fully load before FFmpeg starts

# ── Validate env ─────────────────────────────────────────────────────────────
if [ -z "$YOUTUBE_STREAM_KEY" ] || [ "$YOUTUBE_STREAM_KEY" = "paste-your-key-here" ]; then
  echo "ERROR: YOUTUBE_STREAM_KEY is not set. Edit /etc/phishinweather-stream.env"
  exit 1
fi

STREAM_URL="${STREAM_URL:-https://phishinweather.com}"
echo "Streaming: $STREAM_URL → YouTube"

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo "Shutting down..."
  kill "$FFMPEG_PID"  2>/dev/null || true
  kill "$CHROME_PID"  2>/dev/null || true
  kill "$PULSE_PID"   2>/dev/null || true
  kill "$XVFB_PID"    2>/dev/null || true
  rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── 1. Virtual display ────────────────────────────────────────────────────────
echo "Starting Xvfb ${DISPLAY}..."
rm -f "/tmp/.X${DISPLAY_NUM}-lock" 2>/dev/null || true
Xvfb "${DISPLAY}" -screen 0 "${SCREEN_RES}x24" -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 2

# ── 2. Virtual audio sink ─────────────────────────────────────────────────────
echo "Starting PulseAudio..."
pulseaudio --start --exit-idle-time=-1 2>/dev/null || true
sleep 1
PULSE_PID=$(pgrep pulseaudio || true)

pactl load-module module-null-sink \
  sink_name=vstream \
  sink_properties=device.description=VirtualStreamSink 2>/dev/null || true
pactl set-default-sink vstream 2>/dev/null || true

# ── 3. Chrome ─────────────────────────────────────────────────────────────────
echo "Starting Chromium → $STREAM_URL"
DISPLAY="${DISPLAY}" chromium-browser \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --disable-infobars \
  --disable-extensions \
  --disable-blink-features=AutomationControlled \
  --autoplay-policy=no-user-gesture-required \
  --kiosk \
  --window-size="${SCREEN_RES/x/,}" \
  --window-position=0,0 \
  --app="$STREAM_URL" \
  2>/dev/null &
CHROME_PID=$!

echo "Waiting ${PAGE_LOAD_WAIT}s for page to load..."
sleep "$PAGE_LOAD_WAIT"

# ── 4. FFmpeg → YouTube ───────────────────────────────────────────────────────
echo "Starting FFmpeg stream..."
ffmpeg \
  -f x11grab \
    -framerate 30 \
    -video_size "${SCREEN_RES}" \
    -i "${DISPLAY}.0+0,0" \
  -f pulse \
    -i vstream.monitor \
  -c:v libx264 \
    -preset ultrafast \
    -tune zerolatency \
    -b:v 2000k \
    -maxrate 2500k \
    -bufsize 4000k \
    -pix_fmt yuv420p \
    -g 60 \
  -c:a aac \
    -b:a 128k \
    -ar 44100 \
  -f flv \
  "$YOUTUBE_RTMP" &
FFMPEG_PID=$!

echo "Stream live. FFmpeg PID: $FFMPEG_PID"
wait "$FFMPEG_PID"
