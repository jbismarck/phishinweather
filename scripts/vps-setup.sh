#!/usr/bin/env bash
# vps-setup.sh — one-time setup on Raspberry Pi OS (Bookworm/Bullseye) or Ubuntu 22.04
# Run as root: bash scripts/vps-setup.sh
set -e

STREAM_SCRIPT_DIR="/opt/phishinweather"
SERVICE_NAME="phishinweather-stream"

echo "==> Updating apt..."
apt-get update -qq

echo "==> Installing dependencies..."
apt-get install -y --no-install-recommends \
  xvfb \
  pulseaudio \
  ffmpeg \
  curl \
  ca-certificates \
  xdg-utils

echo "==> Installing Chromium..."
if ! command -v chromium-browser &>/dev/null; then
  apt-get install -y chromium-browser
else
  echo "    Chromium already installed, skipping."
fi

echo "==> Copying stream script to $STREAM_SCRIPT_DIR..."
mkdir -p "$STREAM_SCRIPT_DIR"
cp "$(dirname "$0")/vps-stream.sh" "$STREAM_SCRIPT_DIR/vps-stream.sh"
chmod +x "$STREAM_SCRIPT_DIR/vps-stream.sh"

echo "==> Creating env file at /etc/${SERVICE_NAME}.env..."
if [ ! -f "/etc/${SERVICE_NAME}.env" ]; then
  cat > "/etc/${SERVICE_NAME}.env" <<EOF
# YouTube stream key — get it from YouTube Studio → Go Live → Stream
YOUTUBE_STREAM_KEY=paste-your-key-here

# URL to stream (change to http://localhost:8080 if running phishinweather locally)
STREAM_URL=https://phishinweather.com
EOF
  echo "    Created. Edit /etc/${SERVICE_NAME}.env and set your YOUTUBE_STREAM_KEY before starting."
else
  echo "    Env file already exists, leaving it alone."
fi

echo "==> Installing systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=PhishinWeather YouTube Live Stream
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/${SERVICE_NAME}.env
ExecStart=${STREAM_SCRIPT_DIR}/vps-stream.sh
Restart=always
RestartSec=30
KillMode=control-group

# Redirect logs — view with: journalctl -u ${SERVICE_NAME} -f
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo ""
echo "============================================================"
echo "  Setup complete."
echo ""
echo "  Next steps:"
echo "  1. Edit your stream key:"
echo "     nano /etc/${SERVICE_NAME}.env"
echo ""
echo "  2. Start the stream:"
echo "     systemctl start ${SERVICE_NAME}"
echo ""
echo "  3. Watch the logs:"
echo "     journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "  4. Stop the stream:"
echo "     systemctl stop ${SERVICE_NAME}"
echo "============================================================"
