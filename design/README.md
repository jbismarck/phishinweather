# Phishin Weather — Design Assets

Working directory for creating and reverse-engineering visual assets in the WeatherStar 4000 style, Phish-flavored.

## Files

| File | Purpose |
|---|---|
| `phishinweather.gpl` | GIMP palette — import once, colors available in picker |
| `colors.html` | Printable color reference — open in browser, File → Print → Save as PDF |

## GIMP Setup

1. Open GIMP
2. **Windows → Dockable Dialogs → Palettes**
3. Right-click anywhere in the Palettes panel → **Import Palette**
4. Point it at `phishinweather.gpl`
5. All 12 app colors are now in your palette

## Background Recipe

- **Canvas size**: 640 × 480 px
- **Base gradient**: `#102080` (top) → `#001040` (bottom), linear, vertical
- **Panel/card overlay**: `#26235a` at 30–60% opacity
- **Venue silhouettes**: shapes filled with `#001040` at 30–50% opacity — shadow detail, not illustration
- **Text-safe zone**: inner ~560 × 320 px (leave outer edges for background texture/detail)
- **DO NOT** bake scanlines into PNGs — CSS applies them as an overlay at runtime

## Typography

The app uses the **Star4000** font family. Weights available:
- `Star4000` — standard body text
- `Star4000 Large` — big numbers, headlines
- `Star4000 Small` — captions, labels
- `Star4000 Extended` — wide display text

Font files are in `server/styles/fonts/`.

## Source Files

| Resource | Location |
|---|---|
| Color variables | `server/styles/scss/shared/_colors.scss` |
| Existing backgrounds | `server/images/backgrounds/` |
| Weather icons | `server/images/icons/current-conditions/` |
| Display SCSS | `server/styles/scss/_phish-*.scss` |

## Background Naming Convention

New backgrounds should follow the existing naming pattern and be added to `server/images/backgrounds/`:

```
7.png          — general new background
7-wide.png     — widescreen variant if needed
msg.png        — Madison Square Garden specific
dicks.png      — Dick's Sporting Goods Park specific
```

Then reference in SCSS:
```scss
#phish-tour-html.weather-display.bg-msg {
  background-image: url('../images/backgrounds/msg.png');
}
```
