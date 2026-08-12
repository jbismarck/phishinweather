// Precompute per-venue song stats for the Phish Tour "Venue History" card.
//
// For each venue on the current tour it aggregates every show phish.in has on
// file at that venue and writes a static summary to server/data/venue-stats.json:
//   - most_played : top 5 songs by play count at this venue
//   - overdue     : core-repertoire songs Phish has NEVER played at this venue
//   - bustout     : the biggest-gap song ever performed at this venue
//   - total_songs : distinct songs ever played at this venue
//   - show_count / recent_date : mirrors the existing venueHistory fields
//
// This is intentionally a build-time generator, not a runtime fetch: venue song
// history is effectively static (it only moves when Phish plays the venue again),
// and aggregating MSG alone is ~90 setlist fetches — far too heavy for the live
// /api/phish/tour response. Re-run manually after a tour leg:
//
//   node datagenerators/venue-stats.mjs
//   git add server/data/venue-stats.json && git commit && git push
//
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import get from './https.mjs';
import { phishinSlug } from '../server/phishin-slugs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'server', 'data', 'venue-stats.json');
const TOUR = join(__dirname, '..', 'server', 'data', 'tour.json');

const API = 'https://phish.in/api/v2';
const OVERDUE_POOL_SIZE = 40; // top-N most-played songs all-time = "core repertoire"
const MOST_PLAYED_N = 5;
const OVERDUE_N = 6;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (url) => JSON.parse(await get(url));

// Phish's core repertoire: the most-played songs all-time. A song from this pool
// that has never been played at a venue is a notable "overdue" bust-out candidate.
const fetchOverduePool = async () => {
	const d = await getJson(`${API}/songs?sort=tracks_count:desc&per_page=${OVERDUE_POOL_SIZE}`);
	return (d.songs || []).map((s) => ({ slug: s.slug, title: s.title }));
};

const fetchVenueShowDates = async (slug) => {
	const d = await getJson(
		`${API}/shows?venue_slug=${encodeURIComponent(phishinSlug(slug))}&sort_attr=date&sort_dir=desc&per_page=300`,
	);
	return {
		total: d.total_entries ?? d.shows?.length ?? 0,
		recent: d.shows?.[0]?.date ?? null,
		dates: (d.shows || []).map((s) => s.date),
	};
};

const buildVenueStats = async (slug, overduePool) => {
	const { total, recent, dates } = await fetchVenueShowDates(slug);
	if (!dates.length) {
		return { show_count: total, recent_date: recent, total_songs: 0, most_played: [], overdue: [], bustout: null };
	}

	const counts = new Map();   // songSlug -> { title, count }
	const played = new Set();   // songSlug
	let bustout = null;         // { title, date, gap }

	for (const date of dates) {
		let detail;
		try {
			detail = await getJson(`${API}/shows/${date}`);
		} catch (e) {
			console.warn(`  ! skip ${slug} ${date}: ${e.message}`);
			await delay(150);
			continue;
		}
		for (const track of detail.tracks || []) {
			if (track.exclude_from_stats) continue;
			for (const song of track.songs || []) {
				if (!song.slug) continue;
				played.add(song.slug);
				const entry = counts.get(song.slug) || { title: song.title, count: 0 };
				entry.count += 1;
				counts.set(song.slug, entry);

				const gap = song.previous_performance_gap;
				if (typeof gap === 'number' && (!bustout || gap > bustout.gap)) {
					bustout = { title: song.title, date, gap };
				}
			}
		}
		await delay(150); // be polite to phish.in
	}

	const most_played = [...counts.values()]
		.sort((a, b) => b.count - a.count)
		.slice(0, MOST_PLAYED_N);

	const overdue = overduePool
		.filter((s) => !played.has(s.slug))
		.slice(0, OVERDUE_N)
		.map((s) => s.title);

	return {
		show_count: total,
		recent_date: recent,
		total_songs: played.size,
		most_played,
		overdue,
		bustout,
	};
};

const main = async () => {
	const tour = JSON.parse(readFileSync(TOUR, 'utf8'));
	const shows = Array.isArray(tour) ? tour : tour.shows || [];

	// Unique venue slugs on the tour, preserving first-seen order.
	const slugs = [...new Set(shows.map((s) => s.phishin_venue_slug).filter(Boolean))];

	console.log(`Fetching core-repertoire pool (top ${OVERDUE_POOL_SIZE} songs)…`);
	const overduePool = await fetchOverduePool();

	const out = {};
	for (const slug of slugs) {
		process.stdout.write(`Venue ${slug} … `);
		try {
			out[slug] = await buildVenueStats(slug, overduePool);
			const s = out[slug];
			console.log(`${s.show_count} shows, ${s.total_songs} songs, top="${s.most_played[0]?.title ?? '—'}"`);
		} catch (e) {
			console.error(`FAILED: ${e.message}`);
			out[slug] = null;
		}
	}

	writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
	console.log(`\nWrote ${OUT}`);
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
