# Ideas Pool

Proposed but not yet built. Add anything discussed mid-session that didn't become a task.
Remove when built or explicitly killed.

---

2026-06-11 — Add /api/ideas POST endpoint to phishinweather (or station) so the stop hook can write captured ideas directly to ideas.md without manual copy-paste

2026-08-11 — Persist music playback position (localStorage) as an alternative to the new random-start, so a plain `systemctl restart` resumes where it left off instead of jumping. Caveat: profile-wipe restarts (`rm -rf /tmp/chromium-stream`, used by the stuck-menu fix) would erase it, so it only helps for clean restarts.

2026-08-11 — Alert when the YouTube broadcast needs a manual "Go Live". The Pi can feed the ingest but can't start a truly-ended broadcast session — today that meant the stream was silently down until we noticed. Add a check (FFmpeg pushing but channel not live for >N min) that fires a notification so it doesn't sit dark unattended.

2026-08-11 — Housekeeping: add a `.gitignore` for `.DS_Store`, `server/data/*.db-shm`/`*.db-wal`, and stray root `*.mp3` downloads — they clutter `git status` every session.

---

# Show Night Runbook

## Before the show (day-of prep)

1. **Add the poster** — find tonight's poster image URL, add `"poster_url": "https://..."` to that show's entry in `server/data/summer-tour.json`, commit and push. Railway deploys in ~60s. If no poster URL, the Poster card silently skips — no harm done.
2. **Verify Railway env vars** — open Railway dashboard and confirm `PHISHNET_API_KEY`, `DIST=1`, and `NODE_ENV=production` are all present. Adding or editing any variable can silently drop others.
3. **Check the Pi stream is live** — open `phishinweather.com/stream` and confirm the YouTube stream is broadcasting. If not: `ssh pi@192.168.50.164` → `sudo systemctl restart phishinweather-stream` → give it 60s to reconnect.

## Showtime automation (no action needed)

The stream switches playlists automatically based on `server/show-phase.mjs`:

| When | Phase | Stream plays |
|---|---|---|
| 3 hrs before showtime | `pre-show` | Countdown → Venue Guide → Tonight's Poster → Tour → Weather |
| Showtime | `live` | Setlist → Weather → Setlist → Forecast → History |
| ~3.5 hrs after showtime | `post-show` | Setlist recap → History → Almanac → Weather → Tour |
| ~5.5 hrs after showtime | `off` | Normal rotation resumes |

Showtime defaults to 8:00 PM local. Override per show with `"showtime_local": "19:30"` in summer-tour.json if doors are earlier.

## If you want to go live yourself (OBS)

```bash
# Pause the Pi stream before going live in OBS
./scripts/stream-pause.sh

# After your OBS segment ends, resume Pi stream
./scripts/stream-resume.sh
# Takes ~60s to reconnect to YouTube
```

## If something breaks mid-show

**Live Setlist card not showing** → `PHISHNET_API_KEY` is missing or phish.net is slow. Card shows `STATUS.noData` and silently skips — stream keeps running.

**Audio died** → SSH to Pi and check: `journalctl -u phishinweather-stream -f`. The watchdog checks every 60s and clicks ToggleMedia to restart. If it doesn't recover in 2 min: `sudo systemctl restart phishinweather-stream`.

**Stream went offline** → The FFmpeg reconnect loop retries every 5s automatically for RTMP disconnects. If YouTube shows offline while FFmpeg is still pushing, the *broadcast session* ended: `sudo systemctl restart phishinweather-stream`, and if it's still not live, click **Go Live** in YouTube Studio (the Pi can feed the ingest but can't start the broadcast). Note: the old YouTube-live watchdog that auto-killed FFmpeg was **removed 2026-08-11** — it gave false positives and ended healthy broadcasts.

**Phase stuck on `off` when it should be `pre-show`** → Show date or state may be wrong in summer-tour.json, or the timezone lookup failed. Check `curl phishinweather.com/api/phish/show-status`.

## Post-show

Nothing required. Post-show recap playlist runs automatically for ~2 hours, then normal rotation resumes. Setlist data stays cached and the Live Setlist card shows "LAST SHOW" for the next 24 hours.
