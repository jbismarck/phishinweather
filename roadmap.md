# phishinweather — Roadmap

## Pending

### Railway env vars needed
| Var | Source | Enables |
|---|---|---|
| `PHISHNET_API_KEY` | phish.net ToS acceptance form | Live Setlist card (navId 30) |
| `KOFI_WEBHOOK_TOKEN` | Ko-fi → Settings → API → Webhooks | Ko-fi shoutout scroller validation |
| `CF_WEB_ANALYTICS_TOKEN` | Cloudflare → Web Analytics → Manage site | Browser analytics beacon |
| `DISCORD_INVITE_URL` | Permanent Discord invite (server not yet created) | `/discord` redirect |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (Analytics:Read) | CF analytics table on `/admin` |

### Stream ops — tech debt
- **YouTube streams default to Private** — fix in YouTube Studio → Settings → Channel → Advanced → Default broadcast privacy → Public
- **Stream startup nudge + nav click-coords are a band-aid** (2026-08-11) — real fix is `index.mjs` play-on-load timing: fire `play` *after* `loadStreamTourLocation`/`loadData` complete so it doesn't land on the menu. That makes the 270,114 "Current Conditions" nudge AND the hardcoded ToggleMedia coord (506,503) unnecessary. The coords are fragile — they drift whenever the nav layout changes (they moved once already when the logo menu shipped).
- **Merge `feature/stream-refresh-stagger`** — stagger card auto-refresh + keep cards loaded during silence (stream stability; relevant after today's outage).
- **A truly-ended YouTube broadcast still needs a manual Studio "Go Live"** — the Pi can feed the ingest but can't start the broadcast session. Known limitation, not fixable from the Pi.

### Content / UX
- **Poster product photo** — ChatGPT prompt ready (session 2026-06-11). Generate image, drop as `server/images/poster-thumb.png`, swap `.shop-product-placeholder` in `views/shop.ejs` for `<img>`
- **QR code for poster** — generate QR for phishinweather.com, add to `views/poster.ejs`
- **Reddit** — no dedicated subreddit; post to r/phish and related subs directly
- **Social card backgrounds** — currently `1.png`; need venue-specific PNGs in GIMP
- **Venue-specific backgrounds** — MSG and Dick's first; user working in GIMP/Aseprite
- **Venue page layout redesign** — initial restyle shipped 2026-08-11 (halved gap, `1.png` social-card background, vertical centering, 4ch shift); any further mockup-based rework still open
- **Wire the countdown to synced tour data** — the Countdown card reads the manual `phish-events.json`, so each tour announcement needs a hand-edit. Consider deriving countdown dates from the synced show data (now that each show has a `leg` tag) so it self-updates.
- **Display the `leg` tag on the tour card** — e.g. a "FALL TOUR" / "SUMMER TOUR" header, or grouping in a full-schedule view. The data's there (added 2026-08-11); nothing surfaces it yet.
- **New weather icon animations** — user exploring Aseprite; reference icons in `server/images/icons/current-conditions/`
- **Policy panel centering** — improved (flexbox `space-around`) but not pixel-perfect; needs final devtools tuning
- **Policy sprites — tubes + venue policy data** — `policy-tubes-clear.png` in sprites folder, not yet wired in JS. **philm (phish.in) dependency dropped 2026-08-11** (unresponsive) — source policy ourselves from venue sites/phish.net/Reddit + crowdsource via the admin panel. Researched 2026-08-11 for Dick's + all 4 fall venues: water-bottle rules, water stations, and re-entry (all **no re-entry**) were found; **poster-tube policy is unstated at every venue** (none address tubes explicitly; Allianz/Dick's lean no), so treat "tubes" as *call-ahead / uncertain* rather than a hard sprite. See per-venue data in session notes / [[project-phishinweather]].
- **Policy sprites — remaining** — no-water-station, tubes-none, tubes-soft, tubes-all sprites still needed
- **Contact method for shop** — `hello@phishinweather.com` doesn't exist; currently "DM on Instagram or Reddit"
- **Discord server** — create server, get permanent invite link, set `DISCORD_INVITE_URL` Railway var; update feature-vote card to mention Discord
- **Poster artist commission** — top candidates: AJ Masthay (most prolific active Phish poster artist), Todd Slater (retro/graphic style suits phishinweather), Jim Pollock (most iconic, less likely for fan projects)

### New features
- **Traffic reports card (navId 33)** — drive-time conditions for the route to the venue. API options: Google Maps Routes API (most accurate, paid), HERE Traffic API (free tier), or TomTom Traffic Flow API (free tier 2500 req/day). Show current travel time from user's location to venue, incident alerts, and a simple congestion indicator. Cache aggressively (5-min TTL). Only show when a show is within 24h. `TRAFFIC_API_KEY` Railway env var.
- **Tour expense builder** — standalone page at `/budget` (site only, not stream). User inputs: # of nights, driving miles, # of people splitting, ticket cost. Outputs: estimated gas, hotel, food, total per-person. Submissions stored server-side (anonymized). Feeds a display card (navId 34) — **"AVG COST OF TOUR"** — that shows crowd-sourced averages across all submissions (avg total, avg per-person, avg miles driven). No API needed for v1 — static rate tables for gas/hotel. Stretch: pull avg gas price by region from GasBuddy or EIA API.

### Open bugs
- **Phish displays unreachable via prev/next** — suspected: display stays STATUS.loading if NWS times out before getData; debug at localhost:8080 with real browser devtools (NWS blocks headless)

### Monetization / outreach
- **YouTube stream non-monetized** — no ads; revenue via QR → affiliate links + shop
- **Phish management outreach** — reach out to Phish management + Julia Mordant for blessing; frame as non-monetized fan ambient channel for tour travelers; offer 15% of gross shop revenue to Divided Sky Foundation — **DO NOT send until**: phishinweather.com live with full travel planner, stream running with real viewership, Shopify store live, business model fully documented
- **2.0 milestone** — when shop has real product photo + at least one social account live (Instagram live ✅, YouTube live ✅)

---

## Completed

### 2026-08-11 — stream recovery + music robustness + fall countdown + venue restyle + logo menu
- **Stream outage fixed** (`vps-stream.sh`, commit 9693079) — removed the YouTube-live watchdog that was SIGTERM-ing a *healthy* FFmpeg on false positives (the `/@phishinweather/live` redirect check gives false negatives); the reconnect gap had been ending the YouTube broadcast. Genuine RTMP disconnects are still handled by the reconnect loop.
- **Stream audio + menu-stall fixed** — the logo-menu nav redesign shifted the bottom nav, so the ToggleMedia click coord moved **490,487 → 506,503**; added a startup nudge (click "Current Conditions" at 270,114) because a fresh load fires `play` before tour data loads and stalls on the menu. **Follow-up tech debt below.**
- **Music robustness** (`media.mjs`, commit 8fc1f8b) — retry `/api/phish/on-this-day` 4×/5s before falling back to *A Live One* (Railway wipes the daily cache on every deploy → cold-cache loads were stranding the stream on the compilation); start playback at a **random offset** so restarts don't replay from track 1.
- **Fall Tour 2026 countdown** (commit 4f76f44) — set real announced dates in `phish-events.json` (**Oct 2–11**: Boardwalk Hall AC, Allianz Richmond, VyStar Jacksonville, Orion Huntsville). Was stuck on "DATES NOT YET ANNOUNCED". Note: the countdown reads `phish-events.json` (manual), separate from `tour-sync.mjs` (show data).
- **Venue song stats restyle** (`_phish-tour.scss`, commits 698cacc→fba03f3) — halved the name→number gap (`.mp-row` max-width 60%), switched to the social-card background `1.png`, roomier vertically-centered layout, shifted the assembly `4ch` right.
- **Logo dropdown menu** (commit 65af17e, merged e29e30a) — the corner logo is now a button that opens a centered dropdown holding Selected Displays / Settings / Sharing / Forecast Info; disabled in stream mode (`body.stream-mode .logo { pointer-events: none }`).
- **Merged `feature/phishnet-tour-sync` + added the 8 fall shows** (18142ef, 491281e) — ran the tool to pull announced shows from phish.net; applied only the new fall shows surgically (the tool's full DB flush would have reverted 12 curated shakedown tips). Fall run now in the tour card.
- **Fixed persistent-DB seed** (f2c66fc) — `seedFromJson` was gated on `count===0`, so shows committed to the JSON never reached the persistent prod DB. Now runs idempotently every boot (adds only new shows, never overwrites curated data).
- **Fixed 7-day cache on `/data/*.json`** (40850bb) — dynamic tour data was long-cached with no SHA buster, so updates were invisible for up to a week (the fall countdown appeared to "roll back"). Now `no-cache` + ETag revalidation.
- **Renamed `summer-tour` → `tour` + per-show `leg`** (842c191) — `tour.json`, `/api/phish/tour` (with `/summer-tour` legacy alias); each show tagged `summer-2026`/`fall-2026` (single file, aligned with `phish-events.json` types); `leg` column + ALTER migration on the persistent DB.

### 2026-07-20 — venue song stats + slug bug fix
- Venue History card (tour card 4) enriched with song-level stats: **most-played here (top 5)** with dot-leader counts, **rarest bustout** (biggest previous-performance gap ever played here), **never-played-here** (core-repertoire songs missing at this venue). Show/song counts + last-show folded into one subtitle line.
- Precomputed via `datagenerators/venue-stats.mjs` → committed `server/data/venue-stats.json` (keyed by venue slug). Build-time, not runtime — aggregating MSG alone is ~91 setlist fetches. Re-run after each tour leg: `node datagenerators/venue-stats.mjs` then commit.
- Merged into `/api/phish/summer-tour` server-side (`show.venueStats`); rendered by `phish-tour.mjs renderVenueHistory`.
- **Fixed pre-existing slug bug**: `phishin_venue_slug` mismatched phish.in for 4 renamed venues (Deer Creek, Dick's, Walnut Creek, Lakeview) — the live venue-history + venue-music-track fetches had been silently returning 0 shows / no tracks for them. New `server/phishin-slugs.mjs` translates our stable DB slug → phish.in slug only at the API boundary (no DB re-key / prod migration needed).

### 2026-06-24 — stream rotation debugging
- libx264 CBR encoder (replaced h264_v4l2m2m, eliminates YouTube quality switching)
- Scanlines forced on for stream via URL param
- `playing=false` init bug fixed — `setPlaying(true)` called on init when `schedStream=true`
- `displayNavMessage()` suppression fixed — only suppressed in site mode now
- Stream capture simplified — Xvfb 640×480, `--kiosk`, audio auto-starts via URL param; removed xdotool/openbox complexity
- 10s AbortController timeout in `fetch.mjs` — lets Hazards fail fast so rotation can resume
- Pi env confirmed: `STREAM_URL` with Madison WI coords in `/etc/phishinweather-stream.env`

### 2026-06-23 — scheduler, phish.net, feature expansion
- phish.net venue IDs added to `summer-tour.json` (`phishnet_venue_id` on all 21 shows)
- phish.net attribution on Live Setlist card; `permalink` field in API response; 10-min in-memory cache
- Server-authoritative broadcast scheduler (`server/scheduler.mjs`); SSE clock drives stream + site channels; pin/push/queue override slot
- Stream playlist — 5s social bumps between content blocks; `STREAM_DURATIONS` override
- Site channel — SSE-synced by default; manual nav sets `browsing=true`; red ◉ LIVE button snaps back to broadcast
- Admin scheduler panel + ELI10 guide at `/admin/scheduler-guide`
- Live Setlist card (navId 30) — phish.net v5 polling, 10-min cache, TONIGHT or LAST SHOW
- Venue History (5th tour card) — `CARDS_PER_SHOW` 4→5; total show count + last show date
- Ko-fi shoutout scroller — webhook stores messages in `shoutouts.json`; ticker shows `♥ Name: message`
- Discord redirect — `GET /discord` → 301 from `DISCORD_INVITE_URL` env var
- PWA manifest fixed — `image/png` type, `short_name`, `theme_color`, `apple-touch-icon`
- Cloudflare Web Analytics beacon — auto-injects when `CF_WEB_ANALYTICS_TOKEN` set
- Admin backends for HFB quotes and tour policy fields; `last_updated` timestamps
- `/stream` redirect → YouTube live; FFmpeg reconnect loop; YouTube live watchdog
- 7-day cache TTL on dist static assets; Reddit card updated; @phishinweather live on Instagram + YouTube

### 2026-06-17 — venue card + stream
- Policy panel centering improved (`justify-content:space-around`)
- 6 policy sprites added and doubled in size; tubes panel pending philm data
- Show date moved to header top line (`MSG · JUL 7` format)

### 2026-06-14 — stream hardware + music
- Pi re-flashed after SD corruption; fan moved to 3.3V rail; 5V/3A wall adapter
- Stream bitrate 24fps/1000k → 30fps/2000k/128k
- Audio watchdog, player error handler (advance on failed phish.in load)
- Music playback: all today-in-history shows play chronologically; A Live One fallback
- OBS hybrid workflow; `scripts/stream-pause.sh` + `scripts/stream-resume.sh`
- SSH key auth + passwordless sudo on Pi (systemctl only)
- XSS/injection sanitization — `innerHTML → textContent` for all user-derived content

### 2026-06-11 — dev workflow + phish history
- Zip search moved inside branded 640×480 splash screen
- npm audit clean — 41 vulnerabilities resolved
- Pre-push git hook — runs `npm audit` + `npm run build` before every push
- Smoke test script (`scripts/smoke.sh`) — curls 6 live endpoints
- Phish History redesigned as single-page vertical auto-scroll (CSS `@keyframes`, ~35px/s)
- Layout editor (Shift+L) — overlay with zone bands, pixel ruler, draggable yellow line
- Poster image prompt written for ChatGPT/DALL-E

### 2026-06-10 — venue card + design tooling
- Cloudflare Analytics on `/admin` via CF GraphQL API
- Aseprite added to stack for weather icon GIFs
- Venue info card redesigned — short venue name in header, policy panels expanded, sprite slots added
- `okToDrawCurrentConditions = true` on all 6 alwaysEnabled modules
- Backgrounds updated to `1.png` for support, social, feature-vote cards
- Content shifted up 70px on social/support/feature-vote cards
- UI sections redesigned as `<details>/<summary>` collapsible accordions
- Page footer reworked — logo + minimal text at 30% opacity

### 2026-06-11 — code review + bug fixes
- Location bar double-comma fixed
- Reset button now hides location bar
- Orphaned `</div>` removed from `views/index.ejs`
- `getWeather()` error recovery — `.catch()` restores `#loading` for retry
- "Change" button hides canvas and clears GPS flag

### 2026-06-09 — ops dashboard + analytics
- Ops dashboard (`dashboard.html`) — all services linked; global `/ops-dashboard` skill
- Feature vote card (navId 29) — alwaysEnabled, points to Patreon polls + Ko-fi goals
- Patreon added (patreon.com/c/phishinweather)
- Cloudflare Analytics active; GA4 removed (didn't fire through CF proxy)
- Cache buster fixed — `RAILWAY_GIT_COMMIT_SHA` read in Gulp at build time
- www redirect via Cloudflare Redirect Rule (301)

### 2026-06-09 — security
- Full security review — 4 of 5 findings ruled false positives
- Admin fail-open fixed — `/admin` returns 503 when `ADMIN_PASSWORD` missing

### 2026-06-08 — security + ops
- `express-rate-limit` on `/api/phish/*` (10 req/min per IP)
- Startup assertion throws if `NODE_ENV=production` and `DIST!='1'`
- Security headers: `X-Frame-Options: DENY` + full CSP
- phish.in fetch timeouts: 8s AbortController via `phishFetch()`
- Phish API routes registered unconditionally (were silently 404ing in prod)
- `phish-events.json` added to `otherFiles` in gulp — fixes Countdown in prod
- Committed Phish mp3s removed (26MB); music now streams from phish.in
- City data consolidated — `server/scripts/data/cities.js` (116 cities, unified schema)
- Dead code removed: `qrcode` dep, `nginx.conf`
- Startup warnings for missing `ADMIN_PASSWORD` and stale `summer-tour.json`
- Progress menu reworked — two-column layout, 12pt font
- Ad cards always-enabled — navIds 24–28 `alwaysEnabled`, removed from checkbox panel
- Bottom scroller seamless loop — duplicate content, scroll one copy width, 5-min data refresh
- HFB quotes expanded 12 → 34 (lore-accurate Gamehendge content)

### 2026-06-08 — music + console
- Music fixed end-to-end — CSP `media-src https://phish.in` added; `player.play()` moved inside gesture handler; double-injection race removed
- Console errors cleared — `.map` 404, `custom.js` 404, `settings.refreshTime` crash, stale preload hint

### 2026-06-08 — CSS + style editor
- All display values permanently baked into SCSS (countdown, shakedown, eats card)
- Style editor `def` values updated to match SCSS source

### Pre-2026-06-08 — core build-out
- phishinweather.com live on Railway; custom domains wired up
- All 6 Phish easter eggs (46-day, 5:55, Gamehendge, HFB scroller, MSG Glow/YEMSG, Dick's counter)
- `design/` folder with GIMP palette, color reference, asset notes
- Tour scope filter — server-side dedup limits API to current + next venue
- Countdown redesigned as horizontal 3-column row
- Music: on-this-day show from phish.in; random fallback from last 50 shows; now-playing in scroller
- Progress bar sparse array bug fixed (`filter(Boolean).length`)
- Phish Tour card — compact header + 3 policy panels, 2-column layout
- Ko-fi (24), Instagram (25), YouTube (26), Reddit (27), OnlyFans easter egg (28) cards
- Brand poster at `/poster` — 18×24" print-ready
- `/admin` dashboard — service registry with Basic Auth
- Stripe Checkout store at `/shop` — physical poster $30, US shipping, success page
- phish.in rate limiting — serial fetches (150ms delay), disk-backed daily + weekly cache
