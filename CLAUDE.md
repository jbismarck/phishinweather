# Phishinweather — Developer Guide

Phishinweather is a heavily customized fork of the WeatherStar 4000+ project, rethemed for Phish tour travel. It is live at **phishinweather.com**, deployed via Railway from the `main` branch of the GitHub repo.

---

## Stack

| Layer | Tech |
|---|---|
| Server | Node.js + Express, EJS templates |
| Styles | SCSS → compiled to `server/styles/main.css` → bundled to `dist/resources/ws.min.css` |
| Scripts | ES modules (`server/scripts/modules/*.mjs`) → bundled to `dist/resources/ws.min.js` via Webpack/Gulp |
| Deploy | Railway — auto-deploys on every push to `main` via Nixpacks (runs `npm run build` then `node index.mjs`) |

---

## Dev Workflow

### Daily loop

```bash
# Make changes to SCSS or JS source
npm run build        # Recompile SCSS + bundle JS + copy CSS → dist/
npm start            # Serve on localhost:8080
```

`npm run build` now runs `build:css` automatically first, so SCSS is always compiled fresh.

For rapid style iteration only (skips the slow webpack step):

```bash
npm run build:css    # Recompile SCSS → server/styles/main.css only
# Refresh browser — dev mode reads main.css directly, no full build needed
```

### Feature branch workflow

```bash
git checkout -b my-feature
# ... do work, build, test ...
git checkout main
git merge my-feature
git push              # triggers Railway deploy (~1 min)
```

Push to `main` = immediate deploy to phishinweather.com. Work on a branch to avoid pushing half-finished changes to prod.

### Testing locally

- Open `http://localhost:8080` in a real browser — NWS blocks headless Chrome, so automated browser tests will stall on the progress bar
- Use real browser devtools for debugging navigation/display issues
- The `/poster` route (`localhost:8080/poster`) can be screenshot by headless tools since it makes no NWS calls

---

## Session Workflow

### Opening a bug session efficiently

Before asking Claude to debug, get a concrete symptom first:
- Open `localhost:8080` in real browser devtools
- Get an error message, a console stack trace, or a specific visual description
- "navigation.mjs:92 throws on second prev press" costs half the tokens of "nav seems broken"

### Opening a feature session efficiently

Batch related items — "add venue stats card + fix the nav bug" in one session amortizes setup cost. One small change per session wastes the orientation overhead.

### Checklist mindset

Ship → iterate. You can push a fix to phishinweather.com in 90 seconds. Polish-first is for teams that can't hotfix.

---

### CSS cache-busting

`ws.min.css` is served with `?_=<RAILWAY_GIT_COMMIT_SHA>` on Railway (first 8 chars of the commit SHA injected as env var). Every deploy busts the cache. Locally it uses the package version string.

---

## Project Structure

```
server/
  scripts/modules/     ← all display logic (.mjs ES modules)
  styles/scss/         ← SCSS source files
  styles/main.css      ← compiled output — COMMITTED TO GIT
  images/backgrounds/  ← display backgrounds (PNG, 640×480)
  images/              ← other assets (QR codes, icons, etc.)
views/
  index.ejs            ← main app shell — register scripts + display divs here
  partials/            ← one .ejs per display card
  poster.ejs           ← standalone print page (no nav chrome)
design/
  phishinweather.gpl   ← GIMP palette
  README.md            ← design spec (colors, backgrounds, fonts)
index.mjs              ← Express server + all route registration
gulpfile.mjs           ← build pipeline
```

---

## Display Card System

### navId assignments

| navId | Display |
|---|---|
| 0 | Hazards |
| 1 | Current Weather |
| 2 | Latest Observations |
| 3 | Hourly |
| 4 | Hourly Graph |
| 5 | Travel Forecast |
| 6 | Regional Forecast |
| 7 | Local Forecast |
| 8 | Extended Forecast |
| 9 | Almanac |
| 10 | SPC Outlook |
| 11 | Radar |
| 20 | Phish History |
| 21 | Phish Tour |
| 22 | Phish Countdown |
| 24 | Ko-fi Support |
| 25 | Instagram |
| 26 | YouTube |
| 27 | Reddit |
| 28 | OnlyFans (easter egg) |

Use 29+ for new cards.

### Adding a new display card

1. **Create `server/scripts/modules/my-card.mjs`** — copy `support.mjs`, change class name, navId, elemId. Set `this.timing.baseDelay` in ms.
2. **Create `views/partials/my-card.ejs`** — use `header.ejs` include, `.main.my-card` div, `scroll.ejs` include.
3. **Create `server/styles/scss/_my-card.scss`** — add background and layout rules.
4. **`server/styles/scss/main.scss`** — add `@use 'my-card';`
5. **`views/index.ejs`** — add `<script type="module" src="scripts/modules/my-card.mjs">` and `<div id="my-card-html" class="weather-display"><%- include('partials/my-card.ejs') %></div>`
6. Run `npm run build && npm start` and test.

The build auto-discovers all `.mjs` files in `server/scripts/modules/` — no `mjsSources` edit needed.

For static/placeholder cards (no API), the `support.mjs` pattern is the simplest template. For multi-card data-driven displays, see `phish-tour.mjs` (CARDS_PER_SHOW × shows = totalScreens).

---

## Bottom Scroller

`server/scripts/modules/currentweatherscroll.mjs`

Runs a continuous loop: gathers all active screen texts, joins them with `   •   ` separators, scrolls the full string at 60px/s, restarts on `transitionend` with fresh weather data. Speed is `SCROLL_SPEED = 60`.

- `addScreen(fn)` — add a new item to the rotation. Called by `phish-easter-eggs.mjs` for HFB quotes and now-playing.
- `start()` / `stop()` — called via postMessage from `navigation.mjs` and `weatherdisplay.mjs`.

---

## Phish-Specific Features

### APIs

| Route | Source | Caching |
|---|---|---|
| `/api/phish/on-this-day` | phish.in | daily disk cache |
| `/api/phish/summer-tour` | phish.in | weekly disk cache |

Rate limiting: serial fetches with 150ms delay between requests. Cache stored in `server/data/phish-cache.json` (gitignored).

### Easter eggs

| Trigger | Effect |
|---|---|
| `Shift+W` | Mock weather — renders forecast cards out-of-season |
| `Shift+E` | Floating style editor with inspect mode |
| `Shift+G` | Gamehendge Weather overlay |
| 46-day period | Special "46 Days" scroller message |
| 5:55 AM/PM | Overlay fires once per clock hit |
| Dick's Labor Day | Countdown card specific to Dick's |
| MSG show | Glow/YEMSG easter egg |

HFB (Helping Friendly Book) quotes cycle in the bottom scroller on all Phish displays.

---

## Styles & Design

- **Palette**: `#102080` (top gradient) → `#001040` (bottom), `#ffff00` (yellow accent), `#26235a` (panel overlay)
- **Fonts**: Star4000, Star4000 Large, Star4000 Small, Star4000 Extended — in `server/fonts/`
- **Backgrounds**: 640×480 PNG in `server/images/backgrounds/`. Do NOT bake scanlines into PNGs — CSS applies them at runtime via `_scanlines.scss`.
- **New backgrounds**: Create in GIMP using `design/phishinweather.gpl`, save to `server/images/backgrounds/`, reference in SCSS as `background-image: url('../images/backgrounds/filename.png')`.

---

## Poster (`/poster`)

Standalone brand poster page for screen printing. Opens at `localhost:8080/poster` or `phishinweather.com/poster`.

- 18×24" layout via `@media print { @page { size: 18in 24in; } }`
- To print: Cmd+P in Chrome → Save as PDF → custom 18×24" paper size
- QR placeholder box — replace with actual QR image once accounts are live: add `<img src="images/pw-qr.png">` inside `.poster-qr-wrap` in `views/poster.ejs` and drop the image in `server/images/`
- SCSS: `server/styles/scss/_poster.scss`

---

## Commit & Deploy

```bash
git add <files>
git commit -m "Short description

Longer context if needed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push   # → Railway deploys in ~60s
```

Always include compiled `server/styles/main.css` and `server/styles/main.css.map` in commits when SCSS changed.

---

## Architecture Gotchas

### Sparse displays array
`displays[]` in `navigation.mjs` is **sparse** — navIds 12–19 are holes. `displays.length` returns 23+ while only 15 entries actually exist. Always use:
- `displays.filter(Boolean).length` not `displays.length` for counts
- `displays[n]?.property` not `displays[n].property` for access

**navId 0 is hardcoded** in the navigation status logic (~lines 92–107). Do not renumber it — status reporting breaks silently.

### alwaysEnabled cards
navIds 24–28 (Ko-fi, Instagram, YouTube, Reddit, OnlyFans) are `alwaysEnabled = true` in their constructors. They are excluded from the settings checkbox panel and are always in rotation. New ad/social cards should follow this pattern.

### Gamehendge (navId 23) is intentionally unregistered
`gamehendge-weather.mjs` does NOT call `registerDisplay()`. It never appears in the settings menu or normal rotation — Shift+G only. `isEnabled = true` is force-set in the constructor to bypass the base class getData check.

### isEnabled init chain
For all other displays: `isEnabled` is set in `generateCheckbox()` → called from `registerDisplay()` → called from `init()` on DOMContentLoaded. A display that skips `registerDisplay()` stays permanently disabled.

---

## Style Editor → SCSS Transfer

The style editor (Shift+E) is for tuning values interactively. Once finalized, **transfer into SCSS source** — `localStorage` is ephemeral, browser-scoped, and doesn't deploy.

1. Get current values: open Shift+E or run `localStorage.getItem('phish-style-editor-v2')` in console
2. Write values into the relevant SCSS file (`_phish-countdown.scss`, `_phish-tour.scss`, etc.)
3. Update the matching `def` values in the `GROUPS` array in `style-editor.mjs` — this ensures `applyStyles()` sees `val(c) === c.def` and injects no `!important` override
4. Run `npm run build`, commit SCSS + recompiled `main.css` + `style-editor.mjs`

After this, the display is correct in any browser, any device, with or without localStorage.

---

## Production Debugging

### Verifying what Railway is actually serving
Fetch the asset URL directly to bypass browser cache:
```
https://phishinweather.com/styles/main.css
https://phishinweather.com/resources/ws.min.css
```

### Safari cache
`Ctrl+Option+R` does NOT clear the CSS cache — it just reloads. To verify a production CSS fix:
- Develop → Empty Caches (`Cmd+Option+E`), then reload
- Or use Private Browsing (`Cmd+Shift+N`) — always starts fresh

### Railway env var drift
Setting or editing any Railway variable triggers a full redeploy. `DIST=1` has been accidentally dropped this way before, causing a broken production deploy. After any variable change, verify `DIST=1` and `NODE_ENV=production` are still set. The startup assertion will throw immediately if they're missing — check Railway deploy logs.

---

## phish.in API Notes

- Track URL field is **`mp3_url`** (not `mp3`) — double-check this on any new API work
- `whenMediaReady(cb)` in `media.mjs` — fires after `enableMediaPlayer()` completes (local playlist loaded). Use this to inject phish.in tracks so they override local tracks
- `getCurrentTrackUrl()` — returns URL of the currently queued track (used by scroller)
- `injectTracks(urls)` — replaces playlist with new URL array, randomizes, starts playing

### Autoplay gesture window
`player.play()` must be called **directly inside** the user gesture handler (click/keydown), not deferred to an async event like `canplay` or `loadedmetadata`. Deferring closes the gesture window and causes a silent failure or AbortError. Call it synchronously, let the browser buffer after.
