import Database from 'better-sqlite3';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH  = process.env.DB_PATH  ?? join(__dirname, 'data/phishinweather.db');
const JSON_PATH = join(__dirname, 'data/tour.json');

// Derive a tour leg id (e.g. "fall-2026") from a show date. Aligns with the
// event types in phish-events.json (summer/fall/yemsg/mexico/spring). Sphere
// residencies and one-off festivals aren't date-derivable — tag those by hand.
const legForDate = (dateStr) => {
	const [y, m, d] = dateStr.split('-').map(Number);
	let type;
	if (m === 12 && d >= 27) type = 'yemsg';                 // New Year's run (Dec 27-31)
	else if (m <= 2) type = 'mexico';                        // Riviera Maya (Jan-Feb)
	else if (m <= 5) type = 'spring';                        // Spring tour (Mar-May)
	else if (m < 9 || (m === 9 && d <= 15)) type = 'summer'; // Summer (Jun - mid-Sep, incl. Dick's)
	else type = 'fall';                                      // Fall (mid-Sep - Nov)
	return `${type}-${y}`;
};

let db;

const getDb = () => db;

const initDb = () => {
	const dbDir = dirname(DB_PATH);
	if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
	console.log(`show db: opening ${DB_PATH}`);
	db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');

	db.exec(`
		CREATE TABLE IF NOT EXISTS venues (
			slug                   TEXT PRIMARY KEY,
			name                   TEXT NOT NULL,
			city                   TEXT NOT NULL,
			state                  TEXT NOT NULL,
			lat                    REAL,
			lon                    REAL,
			phishnet_venue_id      INTEGER,
			shakedown_location     TEXT,
			shakedown_parking      TEXT,
			shakedown_tip          TEXT,
			policy_water_bottles   TEXT,
			policy_poster_tubes    TEXT,
			policy_water_station   TEXT,
			policy_last_updated    TEXT
		);

		CREATE TABLE IF NOT EXISTS food (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			venue_slug   TEXT NOT NULL REFERENCES venues(slug) ON DELETE CASCADE,
			name         TEXT NOT NULL,
			type         TEXT,
			note         TEXT,
			sort_order   INTEGER DEFAULT 0
		);

		CREATE TABLE IF NOT EXISTS shows (
			date           TEXT PRIMARY KEY,
			venue_slug     TEXT NOT NULL REFERENCES venues(slug),
			showtime_local TEXT NOT NULL DEFAULT '20:00',
			poster_url     TEXT,
			leg            TEXT
		);
	`);

	// Persistent DBs created before the leg column need it added — CREATE TABLE
	// IF NOT EXISTS won't alter an existing table.
	const hasLeg = db.prepare('PRAGMA table_info(shows)').all().some((c) => c.name === 'leg');
	if (!hasLeg) db.exec('ALTER TABLE shows ADD COLUMN leg TEXT');

	// Idempotent seed on every boot: every insert is ON CONFLICT DO NOTHING and
	// food is skipped when the venue already has rows, so this only ADDS shows
	// newly committed to tour.json — curated DB data (admin edits) is
	// never overwritten. Previously gated on count===0, which meant new shows
	// (e.g. a fall-tour announcement) never reached the persistent prod DB after
	// the initial seed, so they were invisible despite being in the JSON.
	seedFromJson();
};

const seedFromJson = () => {
	let tourData;
	try { tourData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')); }
	catch { console.warn('show db: could not read tour.json for seeding'); return; }

	const upsertVenue = db.prepare(`
		INSERT INTO venues (slug, name, city, state, lat, lon, phishnet_venue_id,
			shakedown_location, shakedown_parking, shakedown_tip,
			policy_water_bottles, policy_poster_tubes, policy_water_station, policy_last_updated)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(slug) DO NOTHING
	`);
	const insertFood = db.prepare(`
		INSERT INTO food (venue_slug, name, type, note, sort_order) VALUES (?,?,?,?,?)
		ON CONFLICT DO NOTHING
	`);
	const insertShow = db.prepare(`
		INSERT INTO shows (date, venue_slug, showtime_local, poster_url, leg) VALUES (?,?,?,?,?)
		ON CONFLICT(date) DO UPDATE SET leg = excluded.leg WHERE shows.leg IS NULL
	`);

	db.transaction(() => {
		for (const show of tourData.shows) {
			const slug = show.phishin_venue_slug;
			upsertVenue.run(
				slug, show.venue, show.city, show.state,
				show.lat ?? null, show.lon ?? null,
				show.phishnet_venue_id ?? null,
				show.shakedown?.location ?? null,
				show.shakedown?.parking ?? null,
				show.shakedown?.tip ?? null,
				show.policy?.water_bottles ?? null,
				show.policy?.poster_tubes ?? null,
				show.policy?.water_station ?? null,
				show.policy?.last_updated ?? null,
			);
			const existing = db.prepare('SELECT COUNT(*) as n FROM food WHERE venue_slug = ?').get(slug).n;
			if (existing === 0) {
				(show.food ?? []).forEach((f, i) => insertFood.run(slug, f.name, f.type ?? null, f.note ?? null, i));
			}
			insertShow.run(show.date, slug, show.showtime_local ?? '20:00', show.poster_url ?? null, show.leg ?? legForDate(show.date));
		}
	})();

	console.log(`show db: seeded ${tourData.shows.length} shows from tour.json`);
};

// Write current DB state back to tour.json so git stays current.
const flushToJson = () => {
	const rows = db.prepare(`
		SELECT s.date, s.showtime_local, s.poster_url, s.leg,
		       v.slug AS phishin_venue_slug, v.phishnet_venue_id,
		       v.name AS venue, v.city, v.state, v.lat, v.lon,
		       v.shakedown_location, v.shakedown_parking, v.shakedown_tip,
		       v.policy_water_bottles, v.policy_poster_tubes, v.policy_water_station, v.policy_last_updated
		FROM shows s JOIN venues v ON s.venue_slug = v.slug
		ORDER BY s.date
	`).all();

	const foodMap = {};
	db.prepare('SELECT * FROM food ORDER BY venue_slug, sort_order').all().forEach((f) => {
		(foodMap[f.venue_slug] ??= []).push({ name: f.name, type: f.type, note: f.note });
	});

	const shows = rows.map((s) => {
		const out = {
			date: s.date, venue: s.venue, city: s.city, state: s.state,
			lat: s.lat, lon: s.lon,
			phishin_venue_slug: s.phishin_venue_slug,
			phishnet_venue_id: s.phishnet_venue_id,
			leg: s.leg ?? null,
		};
		if (s.showtime_local && s.showtime_local !== '20:00') out.showtime_local = s.showtime_local;
		if (s.poster_url) out.poster_url = s.poster_url;
		if (s.shakedown_location || s.shakedown_parking || s.shakedown_tip) {
			out.shakedown = {};
			if (s.shakedown_location) out.shakedown.location = s.shakedown_location;
			if (s.shakedown_parking)  out.shakedown.parking  = s.shakedown_parking;
			if (s.shakedown_tip)      out.shakedown.tip       = s.shakedown_tip;
		}
		if (s.policy_water_bottles || s.policy_poster_tubes || s.policy_water_station) {
			out.policy = {};
			if (s.policy_water_bottles) out.policy.water_bottles  = s.policy_water_bottles;
			if (s.policy_poster_tubes)  out.policy.poster_tubes   = s.policy_poster_tubes;
			if (s.policy_water_station) out.policy.water_station  = s.policy_water_station;
			if (s.policy_last_updated)  out.policy.last_updated   = s.policy_last_updated;
		}
		if (foodMap[s.phishin_venue_slug]) out.food = foodMap[s.phishin_venue_slug];
		return out;
	});

	fs.writeFileSync(JSON_PATH, JSON.stringify({ shows }, null, 2), 'utf8');
};

// ── Query helpers ─────────────────────────────────────────────────────────────

const SHOW_JOIN = `
	SELECT s.date, s.showtime_local, s.poster_url, s.leg,
	       v.slug AS phishin_venue_slug, v.phishnet_venue_id,
	       v.name AS venue, v.city, v.state, v.lat, v.lon,
	       v.shakedown_location, v.shakedown_parking, v.shakedown_tip,
	       v.policy_water_bottles, v.policy_poster_tubes, v.policy_water_station, v.policy_last_updated
	FROM shows s JOIN venues v ON s.venue_slug = v.slug
`;

const shapeShow = (row, food = []) => {
	if (!row) return null;
	const out = {
		date: row.date, venue: row.venue, city: row.city, state: row.state,
		lat: row.lat, lon: row.lon,
		phishin_venue_slug: row.phishin_venue_slug,
		phishnet_venue_id:  row.phishnet_venue_id,
		leg:                row.leg ?? null,
		showtime_local:     row.showtime_local,
		poster_url:         row.poster_url ?? null,
	};
	if (row.shakedown_location || row.shakedown_parking || row.shakedown_tip) {
		out.shakedown = {
			location: row.shakedown_location ?? '',
			parking:  row.shakedown_parking  ?? '',
			tip:      row.shakedown_tip      ?? '',
		};
	}
	if (row.policy_water_bottles || row.policy_poster_tubes || row.policy_water_station) {
		out.policy = {
			water_bottles:  row.policy_water_bottles  ?? '',
			poster_tubes:   row.policy_poster_tubes   ?? '',
			water_station:  row.policy_water_station  ?? '',
			last_updated:   row.policy_last_updated   ?? null,
		};
	}
	if (food.length) out.food = food;
	return out;
};

const getShowByDate = (date) => {
	const row = db.prepare(SHOW_JOIN + 'WHERE s.date = ?').get(date);
	if (!row) return null;
	const food = db.prepare('SELECT name, type, note FROM food WHERE venue_slug = ? ORDER BY sort_order').all(row.phishin_venue_slug);
	return shapeShow(row, food);
};

const getAllShows = () => {
	const rows = db.prepare(SHOW_JOIN + 'ORDER BY s.date').all();
	const foodMap = {};
	db.prepare('SELECT * FROM food ORDER BY venue_slug, sort_order').all().forEach((f) => {
		(foodMap[f.venue_slug] ??= []).push({ name: f.name, type: f.type, note: f.note });
	});
	return rows.map((r) => shapeShow(r, foodMap[r.phishin_venue_slug] ?? []));
};

const updateShow = (date, { poster_url, showtime_local } = {}) => {
	if (poster_url     !== undefined) db.prepare('UPDATE shows SET poster_url     = ? WHERE date = ?').run(poster_url,     date);
	if (showtime_local !== undefined) db.prepare('UPDATE shows SET showtime_local = ? WHERE date = ?').run(showtime_local, date);
	flushToJson();
};

const updateVenuePolicy = (slug, { water_bottles, poster_tubes, water_station } = {}) => {
	const today = new Date().toISOString().slice(0, 10);
	if (water_bottles !== undefined) db.prepare('UPDATE venues SET policy_water_bottles = ? WHERE slug = ?').run(water_bottles, slug);
	if (poster_tubes  !== undefined) db.prepare('UPDATE venues SET policy_poster_tubes  = ? WHERE slug = ?').run(poster_tubes,  slug);
	if (water_station !== undefined) db.prepare('UPDATE venues SET policy_water_station = ? WHERE slug = ?').run(water_station, slug);
	db.prepare('UPDATE venues SET policy_last_updated = ? WHERE slug = ?').run(today, slug);
	flushToJson();
};

// Insert new shows (and their venues) from the phish.net tour-sync. Skips any
// date/venue that already exists — never overwrites curated data (policy, food,
// shakedown, poster). Those are left null for the admin to fill later. Returns
// the number of shows actually added, and flushes to JSON so git is the source
// of truth.
const addShows = (incoming) => {
	const upsertVenue = db.prepare(`
		INSERT INTO venues (slug, name, city, state, lat, lon, phishnet_venue_id)
		VALUES (?,?,?,?,?,?,?)
		ON CONFLICT(slug) DO NOTHING
	`);
	const insertShow = db.prepare(`
		INSERT INTO shows (date, venue_slug, showtime_local, poster_url, leg) VALUES (?,?,'20:00',NULL,?)
		ON CONFLICT(date) DO NOTHING
	`);
	let added = 0;
	db.transaction(() => {
		for (const s of incoming) {
			upsertVenue.run(s.slug, s.venue, s.city, s.state, s.lat ?? null, s.lon ?? null, s.phishnet_venue_id ?? null);
			added += insertShow.run(s.date, s.slug, s.leg ?? legForDate(s.date)).changes;
		}
	})();
	if (added) flushToJson();
	return added;
};

export {
	initDb, getDb, legForDate,
	getShowByDate, getAllShows,
	updateShow, updateVenuePolicy, addShows,
	flushToJson,
};
