// Tour sync: pull announced Phish shows from phish.net and add any that aren't
// already in the schedule. phish.in can't supply this — it's a recording archive
// (a show only appears after it's played and taped), so announced-but-unplayed
// dates aren't there. phish.net lists upcoming shows, so it's the right source.
//
// Fields phish.net gives us — date, venue, city, state, phishnet_venue_id — are
// filled automatically; lat/lon are geocoded (ArcGIS); policy/food/shakedown are
// left blank for the admin to curate later (never overwritten).
//
// Meant to run LOCALLY as a CLI, because the schedule's source of truth is the
// git-committed summer-tour.json:
//   PHISHNET_API_KEY=xxx node server/tour-sync.mjs --dry-run   # preview only
//   PHISHNET_API_KEY=xxx node server/tour-sync.mjs             # write + flush JSON
// then review the summer-tour.json diff, commit, and push (deploy re-seeds).

import { initDb, getShowByDate, addShows } from './db.mjs';

const PHISHNET = 'https://api.phish.net/v5';
const ARCGIS = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const round4 = (n) => Math.round(n * 1e4) / 1e4;

// Generate our venue slug from the venue name (kebab-case, apostrophes dropped),
// matching the existing hand-authored slugs (e.g. "Dick's Sporting Goods Park"
// -> "dicks-sporting-goods-park", "Kohl Center" -> "kohl-center").
const slugify = (name) => name
	.toLowerCase()
	.replace(/['’]/g, '')
	.replace(/[^a-z0-9]+/g, '-')
	.replace(/^-+|-+$/g, '');

const fetchJson = async (url, timeoutMs = 10_000) => {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
		return await r.json();
	} finally {
		clearTimeout(timer);
	}
};

// Geocode "venue, city, state" -> {lat, lon} via ArcGIS (same service the site's
// location search uses; public, no key). Returns nulls on failure — a show with
// no coords just won't resolve weather until coords are added by hand.
const geocode = async (venue, city, state) => {
	const q = encodeURIComponent(`${venue}, ${city}, ${state}, USA`);
	try {
		const d = await fetchJson(`${ARCGIS}?f=json&singleLine=${q}&maxLocations=1&countryCode=USA&outFields=`);
		const loc = d.candidates?.[0]?.location;
		if (loc && Number.isFinite(loc.x) && Number.isFinite(loc.y)) {
			return { lat: round4(loc.y), lon: round4(loc.x) };
		}
	} catch { /* fall through to nulls */ }
	return { lat: null, lon: null };
};

// Pull upcoming/announced US Phish shows from phish.net (this year + next).
const fetchUpcomingShows = async (apiKey) => {
	const year = new Date().getFullYear();
	const today = new Date().toISOString().slice(0, 10);
	const all = [];
	for (const yr of [year, year + 1]) {
		const d = await fetchJson(`${PHISHNET}/shows/showyear/${yr}.json?apikey=${apiKey}`);
		if (d.error) throw new Error(`phish.net: ${d.error_message || 'error'}`);
		all.push(...(d.data ?? []));
	}
	return all.filter((s) => s.artist_name === 'Phish' && s.country === 'USA' && s.showdate >= today);
};

export const syncTour = async ({ dryRun = false } = {}) => {
	const apiKey = process.env.PHISHNET_API_KEY;
	if (!apiKey) throw new Error('PHISHNET_API_KEY not configured');

	const upcoming = await fetchUpcomingShows(apiKey);

	// Only shows we don't already have (dedupe by date), unique by date.
	const seen = new Set();
	const fresh = upcoming.filter((s) => {
		if (seen.has(s.showdate) || getShowByDate(s.showdate)) return false;
		seen.add(s.showdate);
		return true;
	});

	const toAdd = [];
	for (const s of fresh) {
		const { lat, lon } = await geocode(s.venue, s.city, s.state);
		toAdd.push({
			date: s.showdate,
			venue: s.venue,
			city: s.city,
			state: s.state,
			slug: slugify(s.venue),
			lat,
			lon,
			phishnet_venue_id: Number(s.venueid) || null,
		});
		await sleep(150); // be gentle on the geocoder
	}

	const added = dryRun ? 0 : addShows(toAdd);
	return {
		found: upcoming.length,
		new: toAdd.length,
		added,
		dryRun,
		shows: toAdd.map((s) => `${s.date}  ${s.venue} (${s.city}, ${s.state})  ${s.lat ? '' : '⚠ NO COORDS'}`),
	};
};

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
	const dryRun = process.argv.includes('--dry-run');
	initDb();
	syncTour({ dryRun })
		.then((r) => {
			console.log(`\nphish.net upcoming US shows: ${r.found} | not yet in schedule: ${r.new}`);
			r.shows.forEach((line) => console.log('  ' + line));
			console.log(dryRun
				? `\nDRY RUN — nothing written. Re-run without --dry-run to add ${r.new} show(s).`
				: `\n✓ Added ${r.added} show(s) and flushed to summer-tour.json. Review the diff, commit, and push.`);
			process.exit(0);
		})
		.catch((e) => { console.error('Tour sync failed:', e.message); process.exit(1); });
}
