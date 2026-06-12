#!/usr/bin/env bash
# vps-stream.sh — capture phishinweather.com and push to YouTube Live
# Managed by systemd (vps-setup.sh installs the unit).
# Env vars: YOUTUBE_STREAM_KEY, STREAM_URL
set -e

DISPLAY_NUM=99
DISPLAY=":${DISPLAY_NUM}"
SCREEN_RES="640x480"

# Ensure PulseAudio finds the correct runtime socket (needed under systemd)
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
mkdir -p "$XDG_RUNTIME_DIR"

YOUTUBE_RTMP="rtmp://a.rtmp.youtube.com/live2//${YOUTUBE_STREAM_KEY}"
PAGE_LOAD_WAIT=25   # seconds to let the page fully load before FFmpeg starts

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
sleep 2
PULSE_PID=$(pgrep pulseaudio || true)

pactl load-module module-null-sink \
  sink_name=vstream \
  sink_properties=device.description=VirtualStreamSink 2>/dev/null || true
pactl set-default-sink vstream 2>/dev/null || true
export PULSE_SINK=vstream

# ── 3. Chrome ─────────────────────────────────────────────────────────────────
echo "Starting Chromium → $STREAM_URL"
DISPLAY="${DISPLAY}" PULSE_SINK=vstream chromium \
  --no-sandbox \
  --test-type \
  --disable-dev-shm-usage \
  --disable-gpu \
  --disable-infobars \
  --disable-extensions \
  --disable-blink-features=AutomationControlled \
  --autoplay-policy=no-user-gesture-required \
  --remote-debugging-port=9222 \
  --kiosk \
  --window-size="${SCREEN_RES/x/,}" \
  --window-position=0,0 \
  --app="$STREAM_URL" \
  2>/dev/null &
CHROME_PID=$!

echo "Waiting ${PAGE_LOAD_WAIT}s for page to load..."
sleep "$PAGE_LOAD_WAIT"

# ── 4. Click the media button via remote debugging ───────────────────────────
echo "Triggering media playback..."
python3 - <<'PYEOF'
import urllib.request, json, time, socket, base64, struct

try:
    pages = json.loads(urllib.request.urlopen('http://localhost:9222/json', timeout=5).read())
    if not pages:
        print("No pages found")
        exit(0)
    ws_url = pages[0]['webSocketDebuggerUrl']
    path = ws_url.split('localhost:9222')[1]

    s = socket.socket()
    s.connect(('localhost', 9222))
    s.settimeout(5)
    key = base64.b64encode(b'phishinweather!1').decode()
    s.send(f'GET {path} HTTP/1.1\r\nHost: localhost:9222\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
    s.recv(4096)  # consume handshake response

    def ws_send(sock, msg):
        data = json.dumps(msg).encode()
        mask = b'\x00\x00\x00\x00'
        length = len(data)
        if length < 126:
            header = bytes([0x81, 0x80 | length]) + mask
        else:
            header = bytes([0x81, 0x80 | 126, length >> 8, length & 0xff]) + mask
        sock.sendall(header + data)

    ws_send(s, {'id': 1, 'method': 'Runtime.evaluate', 'params': {
        'expression': 'document.getElementById("ToggleMedia").click()'
    }})
    time.sleep(0.5)
    print("Media button clicked")
except Exception as e:
    print(f"Could not click media button: {e}")
PYEOF

# ── 5. FFmpeg → YouTube ───────────────────────────────────────────────────────
echo "Starting FFmpeg stream..."
ffmpeg \
  -f x11grab \
    -framerate 24 \
    -video_size "${SCREEN_RES}" \
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
