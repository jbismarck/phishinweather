// server/scheduler.mjs — server-authoritative broadcast scheduler
// One clock drives two SSE channels (stream / site). Clients tune in and obey.

import { getShowPhase } from './show-phase.mjs';

export const DISPLAY_NAMES = {
	1: 'Current Weather', 2: 'Latest Observations', 3: 'Hourly Forecast',
	4: 'Hourly Graph', 5: 'Travel Forecast', 7: 'Local Forecast',
	8: 'Extended Forecast', 9: 'Almanac', 10: 'SPC Outlook', 11: 'Radar',
	20: 'Phish History', 21: 'Phish Tour', 22: 'Phish Countdown',
	24: 'Ko-fi Support', 25: 'Instagram', 26: 'YouTube',
	27: 'Reddit', 29: 'Feature Vote', 30: 'Live Setlist',
	31: 'Venue Guide', 32: "Tonight's Poster",
};

// ms each screen holds — used by site channel and as fallback
const DURATIONS = {
	1: 12000, 2: 14000, 3: 24000, 4: 14000, 5: 24000,
	7: 14000, 8: 14000, 9: 12000, 10: 12000, 11: 14000,
	20: 42000, 21: 45000, 22: 12000,
	24: 12000, 25: 12000, 26: 12000, 27: 12000, 29: 14000, 30: 25000,
	31: 20000, 32: 15000,
};

// Social cards run 5 s on stream (bumps between content blocks), full length on site
const STREAM_DURATIONS = { 24: 5000, 25: 5000, 26: 5000, 27: 5000 };

const getDuration = (channel, navId) =>
	(channel === 'stream' && STREAM_DURATIONS[navId] !== undefined)
		? STREAM_DURATIONS[navId]
		: (DURATIONS[navId] ?? 12000);

// Stream: content blocks separated by 5-second social bumps (off-tour default)
export const STREAM_PLAYLIST = [
	1, 2, 7, 8,   // weather block
	25,            // Instagram bump
	9, 11, 20,    // more weather + phish history
	26,            // YouTube bump
	21, 22, 30,   // phish tour / countdown / live setlist
	27,            // Reddit bump
	24,            // Ko-fi bump
];

// Show-night playlists (stream channel only)
const PRE_SHOW_STREAM_PLAYLIST  = [22, 31, 32, 21, 1, 25, 7, 24];
// countdown → venue guide → poster → tour → weather → instagram bump → forecast → ko-fi bump

const LIVE_STREAM_PLAYLIST      = [30, 1, 30, 7, 20, 26];
// setlist → weather → setlist again → forecast → history → youtube bump

const POST_SHOW_STREAM_PLAYLIST = [30, 20, 9, 1, 21, 24];
// setlist recap → history → almanac → weather → tour → ko-fi bump

// Site: full rotation, social cards at full 12-second duration (never changes with show phase)
export const SITE_PLAYLIST = [1, 2, 3, 4, 7, 8, 9, 20, 21, 22, 30, 24, 25, 26, 27, 29];

// Per-navId eligibility guards (skip if condition unmet)
const ELIGIBILITY = {
	30: () => !!process.env.PHISHNET_API_KEY,
};

const eligible = (navId) => (ELIGIBILITY[navId] ? ELIGIBILITY[navId]() : true);

// Per-channel clock state
const ch = {
	stream: { idx: 0, navId: null, startedAt: 0, endsAt: 0, playlist: null },
	site:   { idx: 0, navId: null, startedAt: 0, endsAt: 0, playlist: null },
};

// Single override slot — one at a time, applies to both channels
let override = null; // { mode: 'pin'|'push'|'queue', navId, expiresAt }

// Stream page override — navigates Pi's Chromium to a special URL
let streamPageOverride = null; // { url, expiresAt: number|null }

// SSE client response sets
const clients = { stream: new Set(), site: new Set() };

const getStreamPlaylist = () => {
	const { phase } = getShowPhase();
	switch (phase) {
		case 'pre-show':  return PRE_SHOW_STREAM_PLAYLIST;
		case 'live':      return LIVE_STREAM_PLAYLIST;
		case 'post-show': return POST_SHOW_STREAM_PLAYLIST;
		default:          return STREAM_PLAYLIST;
	}
};

const getPlaylist = (channel) => (channel === 'stream' ? getStreamPlaylist() : SITE_PLAYLIST);

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

const broadcast = (channel, payload, eventName = null) => {
	const msg = eventName
		? `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`
		: `data: ${JSON.stringify(payload)}\n\n`;
	for (const res of clients[channel]) {
		try { res.write(msg); }
		catch { clients[channel].delete(res); }
	}
};

const tick = () => {
	const now = Date.now();
	if (override?.mode !== 'pin' && override?.expiresAt && now > override.expiresAt) {
		override = null;
	}
	if (streamPageOverride?.expiresAt && now > streamPageOverride.expiresAt) {
		streamPageOverride = null;
		broadcast('stream', { url: null }, 'stream-page');
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

const setStreamPage = (url, durationMs = 0) => {
	streamPageOverride = { url, expiresAt: durationMs > 0 ? Date.now() + durationMs : null };
	broadcast('stream', { url }, 'stream-page');
};
const clearStreamPage = () => {
	streamPageOverride = null;
	broadcast('stream', { url: null }, 'stream-page');
};
const getStreamPage = () => (streamPageOverride ? { ...streamPageOverride } : null);

const addClient = (channel, res) => clients[channel].add(res);
const removeClient = (channel, res) => clients[channel].delete(res);

export {
	init, getState, setOverride, clearOverride, getOverride,
	setStreamPage, clearStreamPage, getStreamPage,
	addClient, removeClient, DURATIONS,
};
