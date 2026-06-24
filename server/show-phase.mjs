import { getShowByDate } from './db.mjs';

// US state → IANA timezone (covers all Phish tour states)
const STATE_TZ = {
	AL: 'America/Chicago',      AR: 'America/Chicago',      AZ: 'America/Phoenix',
	CA: 'America/Los_Angeles',  CO: 'America/Denver',       CT: 'America/New_York',
	DC: 'America/New_York',     DE: 'America/New_York',     FL: 'America/New_York',
	GA: 'America/New_York',     HI: 'Pacific/Honolulu',     IA: 'America/Chicago',
	ID: 'America/Denver',       IL: 'America/Chicago',      IN: 'America/Indiana/Indianapolis',
	KS: 'America/Chicago',      KY: 'America/New_York',     LA: 'America/Chicago',
	MA: 'America/New_York',     MD: 'America/New_York',     ME: 'America/New_York',
	MI: 'America/Detroit',      MN: 'America/Chicago',      MO: 'America/Chicago',
	MS: 'America/Chicago',      MT: 'America/Denver',       NC: 'America/New_York',
	ND: 'America/Chicago',      NE: 'America/Chicago',      NH: 'America/New_York',
	NJ: 'America/New_York',     NM: 'America/Denver',       NV: 'America/Los_Angeles',
	NY: 'America/New_York',     OH: 'America/New_York',     OK: 'America/Chicago',
	OR: 'America/Los_Angeles',  PA: 'America/New_York',     RI: 'America/New_York',
	SC: 'America/New_York',     SD: 'America/Chicago',      TN: 'America/Chicago',
	TX: 'America/Chicago',      UT: 'America/Denver',       VA: 'America/New_York',
	VT: 'America/New_York',     WA: 'America/Los_Angeles',  WI: 'America/Chicago',
	WV: 'America/New_York',     WY: 'America/Denver',
};

const PRE_SHOW_LEAD_MS  = 3   * 60 * 60 * 1000; // pre-show starts 3 hrs before
const LIVE_DURATION_MS  = 3.5 * 60 * 60 * 1000; // show runs ~3.5 hrs
const POST_SHOW_MS      = 2   * 60 * 60 * 1000; // post-show recap for 2 hrs

let cache = null;
let cacheTs = 0;
const CACHE_MS = 60_000;

// Convert a local time string ("20:00") on a given date in a given IANA timezone to a UTC Date.
// Uses a single-step Intl correction: compute naive UTC, measure local offset there, adjust.
const localToUtc = (dateStr, localTime, tz) => {
	const [y, mo, d] = dateStr.split('-').map(Number);
	const [h, m] = localTime.split(':').map(Number);
	const naive = Date.UTC(y, mo - 1, d, h, m);

	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		year: 'numeric', month: 'numeric', day: 'numeric',
		hour: 'numeric', minute: 'numeric',
		hour12: false,
	}).formatToParts(new Date(naive));

	const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
	const localH = get('hour') % 24; // guard against Intl returning "24"
	const localM = get('minute');
	const offsetMs = ((h - localH) * 60 + (m - localM)) * 60 * 1000;
	return new Date(naive + offsetMs);
};

const getShowPhase = () => {
	const now = Date.now();
	if (cache && now - cacheTs < CACHE_MS) return cache;

	const today = new Date().toISOString().slice(0, 10);
	const show = getShowByDate(today);

	if (!show) {
		cache = { phase: 'off', show: null };
		cacheTs = now;
		return cache;
	}

	const tz = STATE_TZ[show.state] ?? 'America/New_York';
	const showtime = localToUtc(show.date, show.showtime_local ?? '20:00', tz);
	const st = showtime.getTime();

	let phase;
	if      (now < st - PRE_SHOW_LEAD_MS)              phase = 'off';
	else if (now < st)                                  phase = 'pre-show';
	else if (now < st + LIVE_DURATION_MS)               phase = 'live';
	else if (now < st + LIVE_DURATION_MS + POST_SHOW_MS) phase = 'post-show';
	else                                                phase = 'off';

	const minutesUntilShow = Math.round((st - now) / 60_000);

	cache = { phase, show, showtimeUtc: showtime.toISOString(), minutesUntilShow };
	cacheTs = now;
	return cache;
};

export { getShowPhase };
