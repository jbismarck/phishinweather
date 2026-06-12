#!/usr/bin/env bash
# vps-stream.sh — capture phishinweather.com and push to YouTube Live
# Managed by systemd (vps-setup.sh installs the unit).
# Env vars: YOUTUBE_STREAM_KEY, STREAM_URL
set -e

DISPLAY_NUM=99
DISPLAY=":${DISPLAY_NUM}"
# Extra 80px below the 640×480 display area so the nav bar renders in normal
# document flow and xdotool can click it (kiosk CSS hides nav children when
# the window is exactly 480px tall).
SCREEN_RES="640x560"
CAPTURE_RES="640x480"   # FFmpeg only grabs the top 480px; nav bar stays off-stream

# Ensure PulseAudio/PipeWire finds the correct runtime socket (needed under systemd)
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
mkdir -p "$XDG_RUNTIME_DIR"

YOUTUBE_RTMP="rtmp://a.rtmp.youtube.com/live2//${YOUTUBE_STREAM_KEY}"
PAGE_LOAD_WAIT=45   # seconds to let the page fully load before clicking / streaming

# ── Validate env ─────────────────────────────────────────────────────────────
if [ -z "$YOUTUBE_STREAM_KEY" ] || [ "$YOUTUBE_STREAM_KEY" = "paste-your-key-here" ]; then
  echo "ERROR: YOUTUBE_STREAM_KEY is not set. Edit /etc/phishinweather-stream.env"
  exit 1
fi

STREAM_URL="${STREAM_URL:-https://phishinweather.com}"

# Strip kiosk and mediaPlaying params — we click the button ourselves below.
# Kiosk CSS hides nav children (display:none) so xdotool can't reach them.
NAV_URL=$(echo "$STREAM_URL" \
  | sed 's/[?&]kiosk=true//g' \
  | sed 's/[?&]settings-kiosk-checkbox=true//g' \
  | sed 's/[?&]settings-mediaPlaying-boolean=true//g')
echo "Streaming: $NAV_URL → YouTube"

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
echo "Starting Xvfb ${DISPLAY} (${SCREEN_RES})..."
pkill -f "Xvfb ${DISPLAY}" 2>/dev/null || true
pkill -u "$(id -un)" chromium 2>/dev/null || true   # kill stale Chromium windows
sleep 1
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}" 2>/dev/null || true
Xvfb "${DISPLAY}" -screen 0 "${SCREEN_RES}x24" -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 2

# ── 2. Virtual audio sink ─────────────────────────────────────────────────────
echo "Starting audio..."
# Use a fixed socket path so both pactl and Chromium can find the server
PULSE_SOCKET="/tmp/pw-stream.socket"
export PULSE_SERVER="unix:${PULSE_SOCKET}"
rm -f "${PULSE_SOCKET}"
# Kill any stale PulseAudio before starting fresh
pulseaudio --kill 2>/dev/null || pkill -u "$(id -un)" pulseaudio 2>/dev/null || true
sleep 1
# -n = no default config; only load null sink + socket at our fixed path
pulseaudio --daemonize=yes --exit-idle-time=-1 -n \
  --load="module-native-protocol-unix auth-anonymous=1 socket=${PULSE_SOCKET}" \
  --load="module-null-sink sink_name=vstream sink_properties=device.description=VirtualStreamSink"
sleep 2
PULSE_PID=$(pgrep -u "$(id -un)" pulseaudio 2>/dev/null || true)

echo "Audio server: $(PULSE_SERVER="${PULSE_SERVER}" pactl info 2>/dev/null | grep 'Server Name' || echo 'unknown')"
PULSE_SERVER="${PULSE_SERVER}" pactl set-default-sink vstream 2>/dev/null || true
export PULSE_SINK=vstream

# ── 3. Chromium ───────────────────────────────────────────────────────────────
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
  --window-size=640,560 \
  --window-position=0,0 \
  --hide-scrollbars \
  --user-data-dir=/tmp/chromium-stream \
  --app="$NAV_URL" \
  2>/dev/null &
CHROME_PID=$!

echo "Waiting ${PAGE_LOAD_WAIT}s for page to load..."
sleep "$PAGE_LOAD_WAIT"

# ── 4. Click ToggleMedia (volume button) ──────────────────────────────────────
# Nav bar renders below the 480px display in normal document flow.
# #divTwcBottomRight is right-aligned; ToggleMedia is its first (leftmost) button.
# Screenshot-verified position: volume icon at approximately x=490, y=487.
echo "Clicking ToggleMedia (audio on)..."
DISPLAY="${DISPLAY}" xdotool mousemove 490 487
sleep 0.3
DISPLAY="${DISPLAY}" xdotool click 1
sleep 2

echo "Sink inputs after click:"
pactl list sink-inputs short 2>/dev/null || true

# ── 5. FFmpeg → YouTube ───────────────────────────────────────────────────────
echo "Starting FFmpeg stream (capturing ${CAPTURE_RES})..."
ffmpeg \
  -f x11grab \
    -framerate 24 \
    -video_size "${CAPTURE_RES}" \
    -i "${DISPLAY}.0+0,0" \
  -f pulse \
    -i vstream.monitor \
  -c:v libx264 \
    -preset ultrafast \
    -tune zerolatency \
    -b:v 1000k \
    -maxrate 1200k \
    -bufsize 2000k \
    -pix_fmt yuv420p \
    -g 48 \
  -c:a aac \
    -b:a 96k \
    -ar 44100 \
  -f flv \
  "$YOUTUBE_RTMP" &
FFMPEG_PID=$!

echo "Stream live. FFmpeg PID: $FFMPEG_PID"
wait "$FFMPEG_PID"
