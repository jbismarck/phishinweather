import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import Stripe from 'stripe';
import playlist from './src/playlist.mjs';
import OVERRIDES from './src/overrides.mjs';
import rateLimit from 'express-rate-limit';

// ── TASK 2: production guard ─────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production' && process.env.DIST !== '1') {
	throw new Error(
		'Production mode requires DIST=1. Bundled assets are missing — set DIST=1 in Railway environment variables.',
	);
}

const app = express();
app.use(express.urlencoded({ extended: false }));

// ── TASK 5: security headers ─────────────────────────────────────────────────
app.use((req, res, next) => {
	res.set('X-Frame-Options', 'DENY');
	// script-src includes 'unsafe-inline' because the OVERRIDES global is inlined
	// in views/index.ejs at render time and cannot be externalized without a nonce refactor.
	res.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: blob: https://mesonet.agron.iastate.edu https://www.spc.noaa.gov",
			"connect-src 'self' https://api.weather.gov https://phish.in https://api.open-meteo.com https://mesonet.agron.iastate.edu https://www.spc.noaa.gov https://www.cpc.ncep.noaa.gov https://geocode.arcgis.com https://www.google-analytics.com https://region1.google-analytics.com",
			"media-src 'self' https://phish.in",
			"worker-src 'self'",
			"font-src 'self'",
			"frame-ancestors 'none'",
			"frame-src 'none'",
		].join('; '),
	);
	next();
});

// ── TASK 1: phish API rate limiter (10 req/min per IP) ───────────────────────
const phishRateLimit = rateLimit({
	windowMs: 60 * 1000,
	limit: 10,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
});

const port = process.env.PORT ?? process.env.WS4KP_PORT ?? 8080;

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const POSTER_PRICE_CENTS = 3000; // $30.00

// template engine
app.set('view engine', 'ejs');

// version
const { version } = JSON.parse(fs.readFileSync('package.json'));
const buildHash = process.env.DIST === '1'
	? (process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) ?? version)
	: false;

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
		production: buildHash,
		cssHash: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) ?? Date.now(),
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

// Wraps phish.in fetches with a hard timeout — prevents hung requests from
// piling up if phish.in stops responding without closing the connection.
const PHISH_TIMEOUT_MS = 8000;
const phishFetch = (url) => {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), PHISH_TIMEOUT_MS);
	return fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal })
		.finally(() => clearTimeout(id));
};

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
				const r = await phishFetch(`https://phish.in/api/v2/shows?sort_attr=date&sort_dir=asc&per_page=300&page=${page}`);
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
			const r = await phishFetch(`https://phish.in/api/v2/shows/${show.date}`);
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
				const poolR = await phishFetch('https://phish.in/api/v2/shows?sort_attr=date&sort_dir=desc&per_page=50');
				const poolData = await poolR.json();
				const pool = poolData.shows ?? [];
				if (pool.length > 0) {
					await sleep(150);
					const pick = pool[Math.floor(Math.random() * pool.length)];
					const detailR = await phishFetch(`https://phish.in/api/v2/shows/${pick.date}`);
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
				const listR = await phishFetch(
					`https://phish.in/api/v2/shows?venue_slug=${encodeURIComponent(slug)}&sort_attr=date&sort_dir=desc&per_page=1`,
				);
				const listData = await listR.json();
				const recentShow = listData.shows?.[0];
				if (!recentShow) { tracksBySlug[slug] = []; return; }

				const detailR = await phishFetch(`https://phish.in/api/v2/shows/${recentShow.date}`);
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

const SERVICES = [
	{
		category: 'Infrastructure',
		items: [
			{
				name: 'Railway',
				url: 'https://railway.com/project/f58ae63c-29c0-49e4-8cc0-fb90b0e73ef3',
				does: 'Hosts the Node server. Auto-deploys on every push to main.',
				breaks: 'Entire site offline. Nothing works.',
				cost: '$5/mo',
				critical: true,
			},
			{
				name: 'GitHub — jbismarck/phishinweather',
				url: 'https://github.com/jbismarck/phishinweather',
				does: 'Source code. Pushing to main triggers Railway deploy.',
				breaks: 'Can\'t deploy new code. Site keeps running on last deploy.',
				cost: 'Free',
				critical: false,
			},
			{
				name: 'Porkbun — phishinweather.com',
				url: 'https://porkbun.com',
				does: 'Domain registrar. DNS points phishinweather.com → Railway.',
				breaks: 'Site unreachable at phishinweather.com. Railway URL still works.',
				cost: '~$0.83/mo',
				critical: true,
			},
		],
	},
	{
		category: 'Monitoring',
		items: [
			{
				name: 'UptimeRobot',
				url: 'https://uptimerobot.com',
				does: 'Pings phishinweather.com every 5 min. Emails on downtime.',
				breaks: 'No downtime alerts. Site unaffected.',
				cost: 'Free',
				critical: false,
			},
		],
	},
	{
		category: 'Revenue',
		items: [
			{
				name: 'Ko-fi — phishinweather',
				url: 'https://ko-fi.com/phishinweather',
				does: 'Donation page. QR code on the support display card.',
				breaks: 'No donations. Site unaffected.',
				cost: 'Free (Ko-fi takes 0% on donations)',
				critical: false,
			},
			{
				name: 'Stripe',
				url: 'https://dashboard.stripe.com',
				does: 'Payment processing. Currently used by Ko-fi for payouts. Will power /shop directly.',
				breaks: 'Ko-fi payouts pause. Future /shop revenue stops.',
				cost: '2.9% + 30¢ per transaction',
				critical: false,
			},
		],
	},
	{
		category: 'Data APIs (free, no auth required)',
		items: [
			{
				name: 'NWS — api.weather.gov',
				url: 'https://www.weather.gov/documentation/services-web-api',
				does: 'Current conditions, hourly/extended forecasts, alerts, radar stations.',
				breaks: 'All weather displays show Failed. Phish tour forecast card fails. Core site is broken.',
				cost: 'Free',
				critical: true,
			},
			{
				name: 'SPC — spc.noaa.gov',
				url: 'https://www.spc.noaa.gov',
				does: 'Storm Prediction Center outlook (SPC display).',
				breaks: 'SPC Outlook display fails only.',
				cost: 'Free',
				critical: false,
			},
			{
				name: 'phish.in API',
				url: 'https://phish.in',
				does: 'Show history, setlists, tour dates, venue data, audio tracks.',
				breaks: 'Phish History/Tour/Countdown displays fail. Music stops. On-this-day feature breaks.',
				cost: 'Free',
				critical: true,
			},
			{
				name: 'Open-Meteo',
				url: 'https://open-meteo.com',
				does: 'Venue weather forecasts for Phish Tour card.',
				breaks: 'Tour forecast card shows no weather. Other displays unaffected.',
				cost: 'Free',
				critical: false,
			},
			{
				name: 'Iowa State Mesonet (radar)',
				url: 'https://mesonet.agron.iastate.edu',
				does: 'Doppler radar tile images.',
				breaks: 'Radar display fails only.',
				cost: 'Free',
				critical: false,
			},
		],
	},
	{
		category: 'Social (accounts to create)',
		items: [
			{
				name: 'Instagram — @phishinweather',
				url: 'https://instagram.com',
				does: 'Social presence. Placeholder card in display rotation.',
				breaks: 'N/A until created.',
				cost: 'Free',
				critical: false,
			},
			{
				name: 'YouTube — @phishinweather',
				url: 'https://youtube.com',
				does: 'Ambient tour stream. Placeholder card in display rotation.',
				breaks: 'N/A until created.',
				cost: 'Free',
				critical: false,
			},
			{
				name: 'Reddit — r/phishinweather',
				url: 'https://reddit.com',
				does: 'Community hub. Placeholder card in display rotation.',
				breaks: 'N/A until created.',
				cost: 'Free',
				critical: false,
			},
		],
	},
];

const adminDashboard = (req, res) => {
	const password = process.env.ADMIN_PASSWORD;
	if (password) {
		const auth = req.headers.authorization ?? '';
		if (!auth.startsWith('Basic ')) {
			res.set('WWW-Authenticate', 'Basic realm="phishinweather admin"');
			return res.status(401).send('Unauthorized');
		}
		const decoded = Buffer.from(auth.slice(6), 'base64').toString();
		const pass = decoded.slice(decoded.indexOf(':') + 1);
		if (pass !== password) {
			res.set('WWW-Authenticate', 'Basic realm="phishinweather admin"');
			return res.status(401).send('Unauthorized');
		}
	}

	const totalMonthly = MONTHLY_BURN.reduce((sum, e) => sum + e.monthly, 0);
	const totalAnnual = totalMonthly * 12;

	const serviceHTML = SERVICES.map(({ category, items }) => `
		<h2>${category}</h2>
		${items.map(({ name, url, does, breaks, cost, critical }) => `
		<div class="svc ${critical ? 'critical' : ''}">
			<div class="svc-name"><a href="${url}" target="_blank">${name}</a> <span class="cost">${cost}</span>${critical ? ' <span class="tag">CRITICAL</span>' : ''}</div>
			<div class="svc-row"><span class="label">Does</span><span>${does}</span></div>
			<div class="svc-row ${critical ? 'break-critical' : 'break-minor'}"><span class="label">If down</span><span>${breaks}</span></div>
		</div>`).join('')}
	`).join('');

	const burnRows = MONTHLY_BURN.map((e) => `<tr><td>${e.name}</td><td>$${e.monthly.toFixed(2)}/mo</td></tr>`).join('');

	res.send(`<!DOCTYPE html><html><head><title>phishinweather admin</title>
<style>
  body { font-family: monospace; max-width: 800px; margin: 40px auto; padding: 0 20px; background: #0a0a0a; color: #ccc; }
  h1 { color: #ff0; } h2 { color: #ff0; margin-top: 2em; border-bottom: 1px solid #333; padding-bottom: 4px; }
  a { color: #6af; }
  .svc { border: 1px solid #333; padding: 12px 16px; margin-bottom: 10px; border-radius: 4px; }
  .svc.critical { border-color: #a33; }
  .svc-name { font-weight: bold; font-size: 1.05em; margin-bottom: 8px; }
  .svc-row { display: flex; gap: 12px; margin: 3px 0; font-size: 0.9em; }
  .label { color: #888; min-width: 60px; flex-shrink: 0; }
  .cost { color: #888; font-size: 0.85em; }
  .tag { background: #a33; color: #fff; font-size: 0.7em; padding: 1px 5px; border-radius: 2px; vertical-align: middle; }
  .break-critical span:last-child { color: #f88; }
  .break-minor span:last-child { color: #888; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 6px 12px; border: 1px solid #333; }
  .total { color: #ff0; }
</style></head><body>
<h1>phishinweather /admin</h1>

<h2>Monthly Burn</h2>
<table>${burnRows}
<tr class="total"><td><strong>Total</strong></td><td><strong>$${totalMonthly.toFixed(2)}/mo ($${totalAnnual.toFixed(0)}/yr)</strong></td></tr>
</table>
<p style="color:#888">Break-even: $${totalMonthly.toFixed(2)}/month. Check <a href="https://ko-fi.com/phishinweather" target="_blank">Ko-fi</a> and <a href="https://dashboard.stripe.com" target="_blank">Stripe</a> for revenue.</p>

${serviceHTML}
</body></html>`);
};

app.get('/admin', adminDashboard);
app.get('/poster', (req, res) => res.render('poster', { version }));

// shop
app.get('/shop', (_req, res) => {
	res.render('shop', { version, stripeEnabled: !!stripe });
});

app.post('/shop/checkout', async (req, res) => {
	if (!stripe) return res.status(503).send('Store is not configured.');
	const origin = `${req.protocol}://${req.get('host')}`;
	const session = await stripe.checkout.sessions.create({
		payment_method_types: ['card'],
		line_items: [{
			price_data: {
				currency: 'usd',
				product_data: {
					name: 'Phishinweather Tour Poster',
					description: '18×24" archival print — ships in a protective tube',
				},
				unit_amount: POSTER_PRICE_CENTS,
			},
			quantity: 1,
		}],
		mode: 'payment',
		shipping_address_collection: { allowed_countries: ['US'] },
		success_url: `${origin}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${origin}/shop`,
	});
	res.redirect(303, session.url);
});

app.get('/shop/success', async (req, res) => {
	let email = null;
	if (stripe && req.query.session_id) {
		try {
			const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
			email = session.customer_details?.email ?? null;
		} catch (_) { /* session lookup is best-effort */ }
	}
	res.render('shop-success', { version, email });
});

// phish API routes — registered unconditionally so they work in both dev and production
app.use('/api/phish', phishRateLimit);
app.get('/api/phish/on-this-day', phishOnThisDay);
app.get('/api/phish/summer-tour', phishSummerTour);

if (process.env?.DIST === '1') {
	// distribution
	app.use('/scripts', express.static('./server/scripts'));
	app.use('/styles', express.static('./server/styles'));
	app.use('/geoip', geoip);
	app.use('/', express.static('./dist'));
} else {
	// debugging
	app.get('/index.html', index);
	app.use('/geoip', geoip);
	app.use('/resources', express.static('./server/scripts/modules'));
	app.get('/', index);
	app.get('*name', express.static('./server'));
	// cors pass-thru to api.weather.gov
	app.get('/playlist.json', playlist);
}

const server = app.listen(port, () => {
	console.log(`Server listening on port ${port}`);

	if (!process.env.ADMIN_PASSWORD) {
		console.warn('WARNING: ADMIN_PASSWORD not set — /admin is open to anyone');
	}

	try {
		const tourData = JSON.parse(fs.readFileSync('./server/data/summer-tour.json', 'utf8'));
		const lastShow = tourData.shows?.at(-1);
		if (lastShow) {
			const daysSince = Math.floor((Date.now() - new Date(lastShow.date)) / 86_400_000);
			if (daysSince > 30) {
				console.warn(`WARNING: summer-tour.json last show was ${daysSince} days ago (${lastShow.date}) — update for next tour`);
			}
		}
	} catch {
		console.warn('WARNING: summer-tour.json missing or unreadable');
	}
});

// graceful shutdown
const gracefulShutdown = () => {
	server.close(() => {
		console.log('Server closed');
	});
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
