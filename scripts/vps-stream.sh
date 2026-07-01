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
export XDG_RUNTIME_DIR="/tmp/xdg-runtime-stream"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

YOUTUBE_RTMP="rtmp://a.rtmp.youtube.com/live2//${YOUTUBE_STREAM_KEY}"
PAGE_LOAD_WAIT=45   # seconds to let the page fully load before clicking / streaming

# ── Validate env ─────────────────────────────────────────────────────────────
if [ -z "$YOUTUBE_STREAM_KEY" ] || [ "$YOUTUBE_STREAM_KEY" = "paste-your-key-here" ]; then
  echo "ERROR: YOUTUBE_STREAM_KEY is not set. Edit /etc/phishinweather-stream.env"
  exit 1
fi

STREAM_URL="${STREAM_URL:-https://phishinweather.com?mode=stream}"

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
  kill "$FFMPEG_PID"    2>/dev/null || true
  pkill -u "$(id -un)" -x ffmpeg 2>/dev/null || true   # kill inner FFmpeg if loop is mid-sleep
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

# ── 5. FFmpeg → YouTube (reconnect loop) ─────────────────────────────────────
# Runs FFmpeg in a loop so a YouTube RTMP disconnect (broken pipe) reconnects
# in 5s without restarting Xvfb, PulseAudio, or Chromium.
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
        -maxrate 2000k \
        -bufsize 4000k \
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

# ── 6. Audio + YouTube live watchdog ─────────────────────────────────────────
# Audio: every 60s — if phish.in stops playing, clicks ToggleMedia to restart.
# YouTube: every 5min after a 10min grace period — if the channel isn't live,
#          kills FFmpeg so the reconnect loop forces a fresh RTMP handshake.
#          A fresh handshake usually triggers YouTube to resume broadcasting.
(
  sleep 30  # give phish.in time to fully load before first check
  yt_check_counter=0
  startup_ts=$(date +%s)
  while kill -0 "$FFMPEG_PID" 2>/dev/null; do
    # Audio check
    if ! PULSE_SERVER="${PULSE_SERVER}" pactl list sink-inputs short 2>/dev/null | grep -q .; then
      echo "Watchdog: no audio sink input — clicking ToggleMedia to restart..."
      DISPLAY="${DISPLAY}" xdotool mousemove 490 487
      sleep 0.3
      DISPLAY="${DISPLAY}" xdotool click 1
      sleep 5  # wait for playback to resume before next check
    fi

    # YouTube live check — every 30 min (30 × 60s ticks), skip first 15 min
    # Checks @phishinweather/live redirect; only restarts FFmpeg if confident
    # the stream is genuinely down (not a CDN/cache false positive).
    yt_check_counter=$((yt_check_counter + 1))
    now_ts=$(date +%s)
    if [ $((yt_check_counter % 30)) -eq 0 ] && [ $((now_ts - startup_ts)) -gt 900 ]; then
      final_url=$(curl -sL --max-time 15 -o /dev/null -w "%{url_effective}" \
        "https://www.youtube.com/@phishinweather/live" 2>/dev/null)
      # Confirm twice before acting — one CDN miss shouldn't kill the stream
      if ! echo "$final_url" | grep -q "watch"; then
        sleep 30
        final_url2=$(curl -sL --max-time 15 -o /dev/null -w "%{url_effective}" \
          "https://www.youtube.com/@phishinweather/live" 2>/dev/null)
        if ! echo "$final_url2" | grep -q "watch"; then
          echo "Watchdog: YouTube not live (confirmed twice: ${final_url2}) — restarting FFmpeg..."
          pkill -u "$(id -un)" -x ffmpeg 2>/dev/null || true
          sleep 10
        else
          echo "Watchdog: YouTube live OK on second check (first was false positive)"
        fi
      else
        echo "Watchdog: YouTube live OK"
      fi
    fi

    sleep 60
  done
) &
WATCHDOG_PID=$!

wait "$FFMPEG_PID"
