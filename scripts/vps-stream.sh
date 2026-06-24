#!/usr/bin/env bash
# vps-stream.sh — capture phishinweather.com and push to YouTube Live
# Managed by systemd (vps-setup.sh installs the unit).
# Env vars: YOUTUBE_STREAM_KEY, STREAM_URL
set -e

DISPLAY_NUM=99
DISPLAY=":${DISPLAY_NUM}"
# Match Xvfb exactly to the WeatherStar display size.
# --kiosk fills the full display so no black bars are possible.
SCREEN_RES="640x480"
CAPTURE_RES="640x480"

# Ensure PulseAudio/PipeWire finds the correct runtime socket (needed under systemd)
export XDG_RUNTIME_DIR="/tmp/xdg-runtime-stream"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

YOUTUBE_RTMP="rtmp://a.rtmp.youtube.com/live2//${YOUTUBE_STREAM_KEY}"
PAGE_LOAD_WAIT=45   # seconds to let the page fully load before streaming

# ── Validate env ─────────────────────────────────────────────────────────────
if [ -z "$YOUTUBE_STREAM_KEY" ] || [ "$YOUTUBE_STREAM_KEY" = "paste-your-key-here" ]; then
  echo "ERROR: YOUTUBE_STREAM_KEY is not set. Edit /etc/phishinweather-stream.env"
  exit 1
fi

# settings-mediaPlaying-boolean=true auto-starts audio (no nav bar click needed).
# --autoplay-policy=no-user-gesture-required lets Chromium honour it.
STREAM_URL="${STREAM_URL:-https://phishinweather.com?mode=stream&settings-scanLines-checkbox=true&settings-mediaPlaying-boolean=true}"

# Strip only the site kiosk CSS param — it hides nav elements we may still need.
NAV_URL=$(echo "$STREAM_URL" \
  | sed 's/[?&]kiosk=true//g' \
  | sed 's/[?&]settings-kiosk-checkbox=true//g')
echo "Streaming: $NAV_URL → YouTube"

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo "Shutting down..."
  kill "$FFMPEG_PID"    2>/dev/null || true
  pkill -u "$(id -un)" -x ffmpeg 2>/dev/null || true
  kill "$WATCHDOG_PID"  2>/dev/null || true
  kill "$CHROME_PID"    2>/dev/null || true
  kill "$PULSE_PID"     2>/dev/null || true
  kill "$XVFB_PID"      2>/dev/null || true
  rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── 1. Virtual display ────────────────────────────────────────────────────────
echo "Starting Xvfb ${DISPLAY} (${SCREEN_RES})..."
pkill -f "Xvfb ${DISPLAY}" 2>/dev/null || true
pkill -u "$(id -un)" chromium 2>/dev/null || true
sleep 1
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}" 2>/dev/null || true
Xvfb "${DISPLAY}" -screen 0 "${SCREEN_RES}x24" -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 2

# ── 2. Virtual audio sink ─────────────────────────────────────────────────────
echo "Starting audio..."
PULSE_SOCKET="/tmp/pw-stream.socket"
export PULSE_SERVER="unix:${PULSE_SOCKET}"
rm -f "${PULSE_SOCKET}"
pulseaudio --kill 2>/dev/null || pkill -u "$(id -un)" pulseaudio 2>/dev/null || true
sleep 1
pulseaudio --daemonize=yes --exit-idle-time=-1 -n \
  --load="module-native-protocol-unix auth-anonymous=1 socket=${PULSE_SOCKET}" \
  --load="module-null-sink sink_name=vstream sink_properties=device.description=VirtualStreamSink"
sleep 2
PULSE_PID=$(pgrep -u "$(id -un)" pulseaudio 2>/dev/null || true)

echo "Audio server: $(PULSE_SERVER="${PULSE_SERVER}" pactl info 2>/dev/null | grep 'Server Name' || echo 'unknown')"
PULSE_SERVER="${PULSE_SERVER}" pactl set-default-sink vstream 2>/dev/null || true
export PULSE_SINK=vstream

# ── 3. Chromium ───────────────────────────────────────────────────────────────
# --kiosk fills the full 640x480 Xvfb display with no browser chrome.
# No WM needed — kiosk mode locks the window to display dimensions.
# Audio auto-starts via settings-mediaPlaying-boolean=true in the URL.
echo "Starting Chromium → $NAV_URL"
DISPLAY="${DISPLAY}" \
PULSE_SERVER="${PULSE_SERVER}" \
PULSE_SINK=vstream \
chromium \
  --no-sandbox \
  --test-type \
  --disable-dev-shm-usage \
  --disable-gpu \
  --disable-infobars \
  --disable-extensions \
  --disable-blink-features=AutomationControlled \
  --autoplay-policy=no-user-gesture-required \
  --force-device-scale-factor=1 \
  --hide-scrollbars \
  --kiosk \
  --user-data-dir=/tmp/chromium-stream \
  "$NAV_URL" \
  2>/dev/null &
CHROME_PID=$!

echo "Waiting ${PAGE_LOAD_WAIT}s for page to load..."
sleep "$PAGE_LOAD_WAIT"

echo "Sink inputs after load:"
pactl list sink-inputs short 2>/dev/null || true

# ── 4. FFmpeg → YouTube (reconnect loop) ─────────────────────────────────────
echo "Starting FFmpeg stream (capturing ${CAPTURE_RES})..."
(
  while true; do
    ffmpeg \
      -f x11grab \
        -framerate 30 \
        -video_size "${CAPTURE_RES}" \
        -i "${DISPLAY}.0+0,0" \
      -f pulse \
        -i vstream.monitor \
      -c:v libx264 \
        -preset ultrafast \
        -tune zerolatency \
        -b:v 2000k \
        -minrate 2000k \
        -maxrate 2000k \
        -bufsize 4000k \
        -x264-params "nal-hrd=cbr:force-cfr=1" \
        -pix_fmt yuv420p \
        -g 60 \
      -c:a aac \
        -b:a 128k \
        -ar 44100 \
      -f flv \
      "$YOUTUBE_RTMP" || true
    echo "FFmpeg disconnected from YouTube — reconnecting in 5s..."
    sleep 5
  done
) &
FFMPEG_PID=$!

echo "Stream live. FFmpeg loop PID: $FFMPEG_PID"

# ── 5. YouTube live watchdog ──────────────────────────────────────────────────
# Every 5min after a 10min grace period — if the channel isn't live,
# kills FFmpeg so the reconnect loop forces a fresh RTMP handshake.
(
  yt_check_counter=0
  startup_ts=$(date +%s)
  while kill -0 "$FFMPEG_PID" 2>/dev/null; do
    yt_check_counter=$((yt_check_counter + 1))
    now_ts=$(date +%s)
    if [ $((yt_check_counter % 5)) -eq 0 ] && [ $((now_ts - startup_ts)) -gt 600 ]; then
      final_url=$(curl -sL --max-time 15 -o /dev/null -w "%{url_effective}" \
        "https://www.youtube.com/@phishinweather/live" 2>/dev/null)
      if echo "$final_url" | grep -q "watch"; then
        echo "Watchdog: YouTube live OK"
      else
        echo "Watchdog: YouTube not live (resolved: ${final_url}) — restarting FFmpeg..."
        pkill -u "$(id -un)" -x ffmpeg 2>/dev/null || true
        sleep 10
      fi
    fi
    sleep 60
  done
) &
WATCHDOG_PID=$!

wait "$FFMPEG_PID"
