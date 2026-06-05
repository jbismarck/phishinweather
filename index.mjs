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

// Phish "on this day" — in-memory cache keyed by calendar date
let phishCache = null;
let phishCacheDate = null;

const phishOnThisDay = async (req, res) => {
	const today = new Date();
	const mm = String(today.getMonth() + 1).padStart(2, '0');
	const dd = String(today.getDate()).padStart(2, '0');
	const monthDay = `${mm}-${dd}`;
	const todayKey = `${today.getFullYear()}-${monthDay}`;

	if (phishCache && phishCacheDate === todayKey) {
		return res.json(phishCache);
	}

	try {
		// Fetch all show pages from phish.in
		const allShows = [];
		let page = 1;
		let totalPages = 1;
		while (page <= totalPages) {
			// eslint-disable-next-line no-await-in-loop
			const r = await fetch(`https://phish.in/api/v2/shows?sort_attr=date&sort_dir=asc&per_page=300&page=${page}`, {
				headers: { Accept: 'application/json' },
			});
			const data = await r.json();
			totalPages = data.total_pages;
			allShows.push(...data.shows);
			page += 1;
		}

		// Filter to today's month/day across all years
		const todayShows = allShows.filter((s) => s.date.slice(5) === monthDay);

		// Fetch track details for each matching show
		const shows = await Promise.all(todayShows.map(async (show) => {
			const r = await fetch(`https://phish.in/api/v2/shows/${show.date}`, {
				headers: { Accept: 'application/json' },
			});
			const detail = await r.json();

			const sets = {};
			(detail.tracks || []).forEach(({ set_name: setName, title }) => {
				if (!sets[setName]) sets[setName] = [];
				sets[setName].push(title);
			});

			return {
				date: show.date,
				year: show.date.slice(0, 4),
				venue: show.venue_name,
				location: show.venue?.location || '',
				sets,
			};
		}));

		phishCache = { shows, monthDay };
		phishCacheDate = todayKey;
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
	const hourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getHours()}`;

	if (tourCache && tourCacheHour === hourKey) {
		return res.json(tourCache);
	}

	try {
		const tourData = JSON.parse(fs.readFileSync('./server/data/summer-tour.json'));
		const { shows } = tourData;

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
		shows.forEach((show) => {
			const weatherKey = `${show.lat},${show.lon}`;
			const daily = weatherByKey[weatherKey];
			if (daily) {
				const idx = daily.time?.findIndex((t) => t === show.date);
				if (idx !== undefined && idx >= 0) {
					show.forecast = Array.from({ length: Math.min(3, daily.time.length - idx) }, (_, i) => ({
						date: daily.time[idx + i],
						wmo: daily.weathercode[idx + i],
						tempMax: daily.temperature_2m_max[idx + i],
						tempMin: daily.temperature_2m_min[idx + i],
					}));
				} else {
					show.forecast = [];
				}
			} else {
				show.forecast = [];
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
