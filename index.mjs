import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import playlist from './src/playlist.mjs';
import OVERRIDES from './src/overrides.mjs';


const app = express();
const port = process.env.PORT ?? process.env.WS4KP_PORT ?? 8080;

// template engine
app.set('view engine', 'ejs');

// version
const { version } = JSON.parse(fs.readFileSync('package.json'));

// read and parse environment variables to append to the query string
// use the permalink (share) button on the web app to generate a starting point for your configuration
// then take each key/value in the querystring and append WSQS_ to the beginning, and then replace any
// hyphens with underscores in the key name
// environment variables are read from the command line and .env file via the dotenv package

const qsVars = {};

Object.entries(process.env).forEach(([key, value]) => {
	// test for key matching pattern described above
	if (key.match(/^WSQS_[A-Za-z0-9_]+$/)) {
		// convert the key to a querystring formatted key
		const formattedKey = key.replace(/^WSQS_/, '').replaceAll('_', '-');
		qsVars[formattedKey] = value;
	}
});

// single flag to determine if environment variables are present
const hasQsVars = Object.entries(qsVars).length > 0;

// turn the environment query string into search params
const defaultSearchParams = (new URLSearchParams(qsVars)).toString();

const index = (req, res) => {
	// test for no query string in request and if environment query string values were provided
	if (hasQsVars && Object.keys(req.query).length === 0) {
		// redirect the user to the query-string appended url
		const url = new URL(`${req.protocol}://${req.host}${req.url}`);
		url.search = defaultSearchParams;
		res.redirect(307, url.toString());
		return;
	}
	// return the standard page
	res.render('index', {
		production: false,
		version,
		OVERRIDES,
	});
};

const geoip = (req, res) => {
	res.set({
		'x-geoip-city': 'Orlando',
		'x-geoip-country': 'US',
		'x-geoip-country-name': 'United States',
		'x-geoip-country-region': 'FL',
		'x-geoip-country-region-name': 'Florida',
		'x-geoip-latitude': '28.52135',
		'x-geoip-longitude': '-81.41079',
		'x-geoip-postal-code': '32789',
		'x-geoip-time-zone': 'America/New_York',
		'content-type': 'application/json',
	});
	res.json({});
};

const PHISH_CACHE_FILE = './server/data/phish-cache.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Disk-backed cache: survives process restarts within the same deploy
const loadDiskCache = () => {
	try {
		const raw = fs.readFileSync(PHISH_CACHE_FILE, 'utf8');
		return JSON.parse(raw);
	} catch {
		return {};
	}
};

const saveDiskCache = (data) => {
	try {
		fs.writeFileSync(PHISH_CACHE_FILE, JSON.stringify(data), 'utf8');
	} catch (e) {
		console.error('Failed to write phish cache:', e.message);
	}
};

// In-memory cache (warm path — avoids disk read on every request)
let phishCache = null;
let phishCacheDate = null;
// Show list cached separately for 7 days — it barely changes
let allShowsCache = null;
let allShowsCacheDate = null;

const phishOnThisDay = async (req, res) => {
	const today = new Date();
	const mm = String(today.getMonth() + 1).padStart(2, '0');
	const dd = String(today.getDate()).padStart(2, '0');
	const monthDay = `${mm}-${dd}`;
	const todayKey = `${today.getFullYear()}-${monthDay}`;

	// 1. In-memory hit
	if (phishCache && phishCacheDate === todayKey) {
		return res.json(phishCache);
	}

	// 2. Disk hit (survives restarts)
	const disk = loadDiskCache();
	if (disk.date === todayKey && disk.payload) {
		phishCache = disk.payload;
		phishCacheDate = todayKey;
		return res.json(phishCache);
	}

	try {
		// 3. Fetch full show list — cached for 7 days to avoid paginated burst
		const weekKey = `${today.getFullYear()}-W${Math.floor((today - new Date(today.getFullYear(), 0, 1)) / 6048e5)}`;
		if (!allShowsCache || allShowsCacheDate !== weekKey) {
			const allShows = [];
			let page = 1;
			let totalPages = 1;
			while (page <= totalPages) {
				// eslint-disable-next-line no-await-in-loop
				const r = await fetch(`https://phish.in/api/v2/shows?sort_attr=date&sort_dir=asc&per_page=300&page=${page}`, {
					headers: { Accept: 'application/json' },
				});
				// eslint-disable-next-line no-await-in-loop
				const data = await r.json();
				totalPages = data.total_pages;
				allShows.push(...data.shows);
				page += 1;
				if (page <= totalPages) await sleep(150);
			}
			allShowsCache = allShows;
			allShowsCacheDate = weekKey;
		}

		// Filter to today's month/day across all years
		const todayShows = allShowsCache.filter((s) => s.date.slice(5) === monthDay);

		// Fetch track details serially with a small delay — avoids bursting phish.in
		const shows = [];
		for (const show of todayShows) {
			// eslint-disable-next-line no-await-in-loop
			const r = await fetch(`https://phish.in/api/v2/shows/${show.date}`, {
				headers: { Accept: 'application/json' },
			});
			// eslint-disable-next-line no-await-in-loop
			const detail = await r.json();

			const sets = {};
			const tracks = [];
			(detail.tracks || []).forEach(({ set_name: setName, title, mp3_url: mp3 }) => {
				if (!sets[setName]) sets[setName] = [];
				sets[setName].push(title);
				if (mp3) tracks.push({ mp3, title });
			});

			shows.push({
				date: show.date,
				year: show.date.slice(0, 4),
				venue: show.venue_name,
				location: show.venue?.location || '',
				sets,
				tracks,
			});
			// eslint-disable-next-line no-await-in-loop
			await sleep(150);
		}

		// Featured show: most recent on-this-day show with recordings
		const withTracks = shows.filter((s) => s.tracks.length > 0);
		let featured = null;
		if (withTracks.length > 0) {
			withTracks.sort((a, b) => a.date.localeCompare(b.date));
			const pick = withTracks[withTracks.length - 1];
			featured = { date: pick.date, venue: pick.venue, tracks: pick.tracks };
		} else {
			// Fallback: random show from 50 most recent on phish.in
			try {
				const poolR = await fetch('https://phish.in/api/v2/shows?sort_attr=date&sort_dir=desc&per_page=50', {
					headers: { Accept: 'application/json' },
				});
				const poolData = await poolR.json();
				const pool = poolData.shows ?? [];
				if (pool.length > 0) {
					await sleep(150);
					const pick = pool[Math.floor(Math.random() * pool.length)];
					const detailR = await fetch(`https://phish.in/api/v2/shows/${pick.date}`, {
						headers: { Accept: 'application/json' },
					});
					const randomDetail = await detailR.json();
					const randomTracks = (randomDetail.tracks || [])
						.filter((t) => t.mp3_url)
						.map((t) => ({ mp3: t.mp3_url, title: t.title }));
					featured = { date: pick.date, venue: pick.venue_name, tracks: randomTracks, isRandom: true };
				}
			} catch (e) {
				console.error('Daily music fallback failed:', e.message);
			}
		}

		phishCache = { shows, monthDay, featured };
		phishCacheDate = todayKey;
		saveDiskCache({ date: todayKey, payload: phishCache });
		return res.json(phishCache);
	} catch (err) {
		console.error('Phish history error:', err.message);
		return res.status(500).json({ error: 'Failed to fetch Phish history' });
	}
};

// ── Phish Summer Tour ────────────────────────────────────────────────────────
let tourCache = null;
let tourCacheHour = null;

const phishSummerTour = async (req, res) => {
	const now = new Date();
	const mock = req.query.mock === '1';
	const hourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getHours()}-${mock ? 'mock' : 'live'}`;

	if (tourCache && tourCacheHour === hourKey) {
		return res.json(tourCache);
	}

	try {
		const tourData = JSON.parse(fs.readFileSync('./server/data/summer-tour.json'));
		const { shows: allShows } = tourData;

		// Filter to current + next venue only
		const todayStr = new Date().toISOString().slice(0, 10);
		const firstIdx = allShows.findIndex((s) => s.date >= todayStr);
		const shows = [];
		if (firstIdx >= 0) {
			const venuesSeen = new Set();
			for (const s of allShows.slice(firstIdx)) {
				const wouldAdd = venuesSeen.size + (venuesSeen.has(s.venue) ? 0 : 1);
				if (wouldAdd > 2) break;
				venuesSeen.add(s.venue);
				shows.push(s);
			}
		}

		// Fetch Open-Meteo forecast for each unique venue (deduped by lat/lon)
		const venueKeys = new Set();
		const uniqueVenues = shows.filter((s) => {
			const key = `${s.lat},${s.lon}`;
			if (venueKeys.has(key)) return false;
			venueKeys.add(key);
			return true;
		});

		const weatherByKey = {};
		await Promise.all(uniqueVenues.map(async (show) => {
			const key = `${show.lat},${show.lon}`;
			try {
				const r = await fetch(
					`https://api.open-meteo.com/v1/forecast?latitude=${show.lat}&longitude=${show.lon}&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`,
					{ headers: { Accept: 'application/json' } },
				);
				const data = await r.json();
				weatherByKey[key] = data.daily ?? null;
			} catch {
				weatherByKey[key] = null;
			}
		}));

		// Fetch phish.in recordings for each unique venue slug (deduped)
		const slugsSeen = new Set();
		const uniqueSlugs = shows.filter((s) => {
			if (slugsSeen.has(s.phishin_venue_slug)) return false;
			slugsSeen.add(s.phishin_venue_slug);
			return true;
		});

		const tracksBySlug = {};
		await Promise.all(uniqueSlugs.map(async (show) => {
			const { phishin_venue_slug: slug } = show;
			try {
				const listR = await fetch(
					`https://phish.in/api/v2/shows?venue_slug=${encodeURIComponent(slug)}&sort_attr=date&sort_dir=desc&per_page=1`,
					{ headers: { Accept: 'application/json' } },
				);
				const listData = await listR.json();
				const recentShow = listData.shows?.[0];
				if (!recentShow) { tracksBySlug[slug] = []; return; }

				const detailR = await fetch(
					`https://phish.in/api/v2/shows/${recentShow.date}`,
					{ headers: { Accept: 'application/json' } },
				);
				const detail = await detailR.json();
				tracksBySlug[slug] = (detail.tracks || [])
					.filter((t) => t.mp3)
					.map((t) => t.mp3);
			} catch {
				tracksBySlug[slug] = [];
			}
		}));

		// Enrich each show with forecast + music tracks
		const MOCK_WMO = [0, 2, 63, 3, 80, 95, 1, 71, 45, 61];
		shows.forEach((show, i) => {
			if (mock) {
				// synthetic forecast cycling through varied WMO codes for UI testing
				show.forecast = [0, 1, 2].map((offset) => ({
					date: show.date,
					wmo: MOCK_WMO[(i + offset) % MOCK_WMO.length],
					tempMax: 72 + Math.round(Math.sin(i + offset) * 14),
					tempMin: 52 + Math.round(Math.cos(i + offset) * 10),
				}));
			} else {
				const weatherKey = `${show.lat},${show.lon}`;
				const daily = weatherByKey[weatherKey];
				if (daily) {
					const idx = daily.time?.findIndex((t) => t === show.date);
					if (idx !== undefined && idx >= 0) {
						show.forecast = Array.from({ length: Math.min(3, daily.time.length - idx) }, (_, i2) => ({
							date: daily.time[idx + i2],
							wmo: daily.weathercode[idx + i2],
							tempMax: daily.temperature_2m_max[idx + i2],
							tempMin: daily.temperature_2m_min[idx + i2],
						}));
					} else {
						show.forecast = [];
					}
				} else {
					show.forecast = [];
				}
			}
			show.musicTracks = tracksBySlug[show.phishin_venue_slug] ?? [];
		});

		tourCache = { tour: tourData.tour, shows };
		tourCacheHour = hourKey;
		return res.json(tourCache);
	} catch (err) {
		console.error('Phish tour error:', err.message);
		return res.status(500).json({ error: 'Failed to build tour data' });
	}
};

const MONTHLY_BURN = [
	{ name: 'Railway Hobby', monthly: 5.00 },
	{ name: 'Porkbun domain (phishinweather.com)', monthly: 10.00 / 12 },
];

const adminDashboard = (_req, res) => {
	const totalMonthly = MONTHLY_BURN.reduce((sum, e) => sum + e.monthly, 0);
	const totalAnnual = totalMonthly * 12;
	const rows = MONTHLY_BURN.map((e) => `<tr><td>${e.name}</td><td>$${e.monthly.toFixed(2)}/mo</td></tr>`).join('');
	res.send(`<!DOCTYPE html><html><head><title>phishinweather admin</title>
<style>body{font-family:monospace;max-width:600px;margin:40px auto;padding:0 20px}
table{border-collapse:collapse;width:100%}td{padding:6px 12px;border:1px solid #ccc}
h2{margin-top:2em}.green{color:green}.red{color:#c00}</style></head><body>
<h1>phishinweather admin</h1>
<h2>Monthly Burn</h2>
<table>${rows}
<tr><td><strong>Total</strong></td><td><strong>$${totalMonthly.toFixed(2)}/mo ($${totalAnnual.toFixed(0)}/yr)</strong></td></tr>
</table>
<h2>Break-even</h2>
<p>Need <strong>$${totalMonthly.toFixed(2)}/month</strong> to cover costs.</p>
<h2>Links</h2>
<ul>
<li><a href="https://railway.com/project/f58ae63c-29c0-49e4-8cc0-fb90b0e73ef3" target="_blank">Railway dashboard</a></li>
<li><a href="https://porkbun.com" target="_blank">Porkbun (domain)</a></li>
<li><a href="https://ko-fi.com/phishinweather" target="_blank">Ko-fi dashboard</a></li>
<li><a href="https://uptimerobot.com" target="_blank">UptimeRobot</a></li>
</ul>
<h2>Revenue tracking</h2>
<p>Check Ko-fi and Shopify dashboards directly for current revenue.</p>
</body></html>`);
};

// debugging
if (process.env?.DIST === '1') {
	// distribution
	app.use('/scripts', express.static('./server/scripts'));
	app.use('/geoip', geoip);
	app.use('/', express.static('./dist'));
} else {
	// debugging
	app.get('/index.html', index);
	app.use('/geoip', geoip);
	app.use('/resources', express.static('./server/scripts/modules'));
	app.get('/', index);
	app.get('/api/phish/on-this-day', phishOnThisDay);
	app.get('/api/phish/summer-tour', phishSummerTour);
	app.get('/admin', adminDashboard);
	app.get('*name', express.static('./server'));
	// cors pass-thru to api.weather.gov
	app.get('/playlist.json', playlist);
}

const server = app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
});

// graceful shutdown
const gracefulShutdown = () => {
	server.close(() => {
		console.log('Server closed');
	});
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
