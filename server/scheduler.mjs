// server/scheduler.mjs — server-authoritative broadcast scheduler
// One clock drives two SSE channels (stream / site). Clients tune in and obey.

export const DISPLAY_NAMES = {
	1: 'Current Weather', 2: 'Latest Observations', 3: 'Hourly Forecast',
	4: 'Hourly Graph', 5: 'Travel Forecast', 7: 'Local Forecast',
	8: 'Extended Forecast', 9: 'Almanac', 10: 'SPC Outlook', 11: 'Radar',
	20: 'Phish History', 21: 'Phish Tour', 22: 'Phish Countdown',
	24: 'Ko-fi Support', 25: 'Instagram', 26: 'YouTube',
	27: 'Reddit', 29: 'Feature Vote', 30: 'Live Setlist',
};

// ms each screen holds — used by site channel and as fallback
const DURATIONS = {
	1: 12000, 2: 14000, 3: 24000, 4: 14000, 5: 24000,
	7: 14000, 8: 14000, 9: 12000, 10: 12000, 11: 14000,
	20: 42000, 21: 45000, 22: 12000,
	24: 12000, 25: 12000, 26: 12000, 27: 12000, 29: 14000, 30: 25000,
};

// Social cards run 5 s on stream (bumps between content blocks), full length on site
const STREAM_DURATIONS = { 24: 5000, 25: 5000, 26: 5000, 27: 5000 };

const getDuration = (channel, navId) =>
	(channel === 'stream' && STREAM_DURATIONS[navId] !== undefined)
		? STREAM_DURATIONS[navId]
		: (DURATIONS[navId] ?? 12000);

// Stream: content blocks separated by 5-second social bumps
export const STREAM_PLAYLIST = [
	1, 2, 7, 8,   // weather block
	25,            // Instagram bump
	9, 11, 20,    // more weather + phish history
	26,            // YouTube bump
	21, 22, 30,   // phish tour / countdown / live setlist
	27,            // Reddit bump
	24,            // Ko-fi bump
];

// Site: full rotation, social cards at full 12-second duration
export const SITE_PLAYLIST = [1, 2, 3, 4, 7, 8, 9, 20, 21, 22, 30, 24, 25, 26, 27, 29];

// Per-navId eligibility guards (skip if condition unmet)
const ELIGIBILITY = {
	30: () => !!process.env.PHISHNET_API_KEY,
};

const eligible = (navId) => (ELIGIBILITY[navId] ? ELIGIBILITY[navId]() : true);

// Per-channel clock state
const ch = {
	stream: { idx: 0, navId: null, startedAt: 0, endsAt: 0 },
	site:   { idx: 0, navId: null, startedAt: 0, endsAt: 0 },
};

// Single override slot — one at a time, applies to both channels
let override = null; // { mode: 'pin'|'push'|'queue', navId, expiresAt }

// SSE client response sets
const clients = { stream: new Set(), site: new Set() };

const getPlaylist = (channel) => (channel === 'stream' ? STREAM_PLAYLIST : SITE_PLAYLIST);

const nextIdx = (channel, from) => {
	const pl = getPlaylist(channel);
	for (let i = 1; i <= pl.length; i++) {
		const idx = (from + i) % pl.length;
		if (eligible(pl[idx])) return idx;
	}
	return from;
};

const advance = (channel, forceNavId) => {
	const s = ch[channel];
	const pl = getPlaylist(channel);
	let navId = forceNavId ?? null;
	let newIdx = s.idx;

	if (navId === null && override) {
		navId = override.navId;
		if (override.mode !== 'pin') override = null; // consume push/queue
	}
	if (navId === null) {
		newIdx = nextIdx(channel, s.idx);
		navId = pl[newIdx];
	}

	const duration = getDuration(channel, navId);
	const now = Date.now();
	s.navId = navId;
	s.idx = newIdx;
	s.startedAt = now;
	s.endsAt = now + duration;
	return { navId, startedAt: now, endsAt: now + duration };
};

const broadcast = (channel, payload) => {
	const msg = `data: ${JSON.stringify(payload)}\n\n`;
	for (const res of clients[channel]) {
		try { res.write(msg); }
		catch { clients[channel].delete(res); }
	}
};

const tick = () => {
	const now = Date.now();
	// expire push/queue overrides past their window
	if (override?.mode !== 'pin' && override?.expiresAt && now > override.expiresAt) {
		override = null;
	}
	for (const channel of ['stream', 'site']) {
		if (now >= ch[channel].endsAt) {
			broadcast(channel, advance(channel));
		}
	}
};

const init = () => {
	advance('stream');
	advance('site');
	setInterval(tick, 500);
};

const getState = (channel) => ({ ...ch[channel] });

const setOverride = (mode, navId) => {
	const duration = DURATIONS[navId] ?? 12000; // override uses site-length duration
	override = {
		mode,
		navId,
		expiresAt: mode === 'pin' ? null : Date.now() + duration,
	};
	// pin and push take effect immediately on both channels
	if (mode === 'pin' || mode === 'push') {
		for (const channel of ['stream', 'site']) {
			broadcast(channel, advance(channel, navId));
		}
	}
	// queue: waits for the current screen to end naturally
};

const clearOverride = () => { override = null; };
const getOverride = () => (override ? { ...override } : null);
const addClient = (channel, res) => clients[channel].add(res);
const removeClient = (channel, res) => clients[channel].delete(res);

export {
	init, getState, setOverride, clearOverride, getOverride,
	addClient, removeClient, DURATIONS,
};
