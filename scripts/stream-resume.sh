#!/usr/bin/env bash
# stream-resume.sh — hand stream back to Pi after OBS segment ends
PI="pi@192.168.50.164"

echo "Resuming Pi stream..."
ssh "$PI" "sudo systemctl start phishinweather-stream"
echo "Done — Pi stream resuming. Takes ~60s to go live on YouTube."
