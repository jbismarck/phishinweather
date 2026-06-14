#!/usr/bin/env bash
# stream-pause.sh — stop the Pi stream before going live in OBS
PI="pi@192.168.50.164"

echo "Pausing Pi stream..."
ssh "$PI" "sudo systemctl stop phishinweather-stream"
echo "Done — Pi stream stopped. OBS is clear to go live."
