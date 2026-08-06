// Embeddable per-venue mini weather widget (WeatherBug-style sticker in the
// WeatherStar look). Served at GET /widget?d=YYYY-MM-DD — resolves the show's
// venue via the tour DB, fetches a live Open-Meteo forecast (server-side, so no
// NWS headless issue), and renders views/widget.ejs. Designed to be iframe-
// embedded by allow-listed origins (see WIDGET_FRAME_ORIGINS in index.mjs).

import { getShowByDate } from './db.mjs';

// WMO weather-code → icon/label, kept in sync with phish-tour.mjs so the widget
// matches the Tour card's forecast rendering.
const WMO_ICON = {
	0: 'Sunny.gif', 1: 'Sunny.gif', 2: 'Partly-Cloudy.gif', 3: 'Cloudy.gif',
	45: 'Fog.gif', 48: 'Fog.gif',
	51: 'Rain.gif', 53: 'Rain.gif', 55: 'Rain.gif',
	61: 'Rain.gif', 63: 'Rain.gif', 65: 'Rain.gif',
	71: 'Light-Snow.gif', 73: 'Light-Snow.gif', 75: 'Heavy-Snow.gif', 77: 'Light-Snow.gif',
	80: 'Shower.gif', 81: 'Shower.gif', 82: 'Shower.gif',
	85: 'Light-Snow.gif', 86: 'Heavy-Snow.gif',
	95: 'Scattered-Thunderstorms-Day.gif', 96: 'Scattered-Thunderstorms-Day.gif',
	99: 'Thunderstorm.gif',
};
const WMO_DESC = {
	0: 'CLEAR', 1: 'MAINLY CLEAR', 2: 'PARTLY CLOUDY', 3: 'OVERCAST',
	45: 'FOG', 48: 'FREEZING FOG',
	51: 'DRIZZLE', 53: 'DRIZZLE', 55: 'HEAVY DRIZZLE',
	61: 'LIGHT RAIN', 63: 'RAIN', 65: 'HEAVY RAIN',
	71: 'LIGHT SNOW', 73: 'SNOW', 75: 'HEAVY SNOW',
	80: 'SHOWERS', 81: 'SHOWERS', 82: 'HEAVY SHOWERS',
	95: 'TSTORMS', 96: 'TSTORMS W/ HAIL', 99: 'TSTORMS W/ HAIL',
};

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const ICON_BASE = 'images/icons/current-conditions/';
const iconFor = (code) => ICON_BASE + (WMO_ICON[code] ?? 'Sunny.gif');
const descFor = (code) => WMO_DESC[code] ?? 'UNKNOWN';

const formatShowDate = (iso) => {
	const [, m, d] = iso.split('-').map(Number);
	return `${MONTH_NAMES[m - 1]} ${d}`;
};
const dayName = (iso) => DAY_NAMES[new Date(`${iso}T12:00:00`).getDay()];

// Hourly in-memory cache keyed by venue coords → raw Open-Meteo payload. Keeps
// us well under Open-Meteo's rate limits when a widget gets embedded widely.
const wxCache = new Map();

const fetchWeather = async (lat, lon) => {
	const now = new Date();
	const key = `${lat},${lon}-${now.toISOString().slice(0, 13)}`;
	if (wxCache.has(key)) return wxCache.get(key);

	const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
		+ '&current_weather=true&daily=temperature_2m_max,temperature_2m_min,weathercode'
		+ '&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto&forecast_days=4';

	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 4000);
	try {
		const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
		const data = await r.json();
		if (wxCache.size > 300) wxCache.clear();
		wxCache.set(key, data);
		return data;
	} finally {
		clearTimeout(timer);
	}
};

export const widgetView = async (req, res) => {
	const dateParam = typeof req.query.d === 'string' ? req.query.d.trim() : '';
	let show = null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
		try { show = getShowByDate(dateParam); } catch { show = null; }
	}

	if (!show || !show.lat || !show.lon) {
		return res.render('widget', {
			data: {
				error: dateParam ? 'NO SHOW ON THIS DATE' : 'NO SHOW DATE PROVIDED',
				venue: '', city: '', state: '', date: dateParam, iso: '', current: null, days: [],
			},
		});
	}

	let payload = null;
	try { payload = await fetchWeather(show.lat, show.lon); } catch { payload = null; }

	const cw = payload?.current_weather;
	const daily = payload?.daily;
	let current = null;
	const days = [];
	if (cw && daily?.time?.length) {
		current = {
			temp: Math.round(cw.temperature),
			icon: iconFor(cw.weathercode),
			desc: descFor(cw.weathercode),
		};
		for (let i = 0; i < Math.min(3, daily.time.length); i += 1) {
			days.push({
				name: dayName(daily.time[i]),
				icon: iconFor(daily.weathercode[i]),
				hi: Math.round(daily.temperature_2m_max[i]),
				lo: Math.round(daily.temperature_2m_min[i]),
			});
		}
	}

	res.render('widget', {
		data: {
			error: current ? null : 'FORECAST UNAVAILABLE',
			venue: show.venue,
			city: show.city,
			state: show.state,
			date: formatShowDate(show.date),
			iso: show.date,
			current,
			days,
		},
	});
};
