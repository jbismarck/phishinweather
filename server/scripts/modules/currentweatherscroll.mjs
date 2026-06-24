import { locationCleanup } from './utils/string.mjs';
import { elemForEach } from './utils/elem.mjs';
import getCurrentWeather from './currentweather.mjs';
import { currentDisplay } from './navigation.mjs';
import getHazards from './hazards.mjs';

const degree = String.fromCharCode(176);
const SCROLL_SPEED = 60; // pixels/second — medium crawl
const SEPARATOR = '   •   ';
const DATA_REFRESH_MS = 5 * 60 * 1000; // refresh weather data every 5 min

let loopActive = false;
let currentLoopId = 0; // incremented each runLoop call to cancel stale animation closures

// ── Screen definitions ────────────────────────────────────────────────────────

const screens = [
	// hazards — returns object with text or false
	(data) => {
		if (!data.hazards?.length) return false;
		return { text: `⚠ ${data.hazards[0].properties.event}: ${data.hazards[0].properties.description}` };
	},
	// station name
	(data) => `Conditions at ${locationCleanup(data.station.properties.name).substr(0, 20)}`,
	// temperature
	(data) => {
		let text = `Temp: ${data.Temperature}${degree}${data.TemperatureUnit}`;
		if (data.observations.heatIndex.value) {
			text += `    Heat Index: ${data.HeatIndex}${degree}${data.TemperatureUnit}`;
		} else if (data.observations.windChill.value) {
			text += `    Wind Chill: ${data.WindChill}${degree}${data.TemperatureUnit}`;
		}
		return text;
	},
	// humidity
	(data) => `Humidity: ${data.Humidity}%   Dewpoint: ${data.DewPoint}${degree}${data.TemperatureUnit}`,
	// barometric pressure
	(data) => `Barometric Pressure: ${data.Pressure} ${data.PressureDirection}`,
	// wind
	(data) => {
		let text = data.WindSpeed > 0
			? `Wind: ${data.WindDirection} ${data.WindSpeed} ${data.WindUnit}`
			: 'Wind: Calm';
		if (data.WindGust > 0) text += `  Gusts to ${data.WindGust}`;
		return text;
	},
	// visibility
	(data) => {
		const distance = `${data.Ceiling} ${data.CeilingUnit}`;
		return `Visib: ${data.Visibility} ${data.VisibilityUnit}  Ceiling: ${data.Ceiling === 0 ? 'Unlimited' : distance}`;
	},
];

const originalScreens = screens.length;
let lastScreen = originalScreens;

const addScreen = (screen) => {
	screens.push(screen);
	lastScreen += 1;
};

const reset = () => {
	lastScreen = originalScreens;
};

// ── Text builder ──────────────────────────────────────────────────────────────

const buildScrollText = (data) => {
	const items = [];
	for (let i = 0; i < lastScreen; i++) {
		const result = screens[i](data);
		if (!result) continue;
		const text = typeof result === 'object' ? result.text : result;
		if (text) items.push(text);
	}
	return items.join(SEPARATOR);
};

// ── Continuous scroll loop ────────────────────────────────────────────────────

const runLoop = async () => {
	if (!loopActive) return;
	const loopId = ++currentLoopId;

	const data = await getCurrentWeather();
	if (!data) {
		setTimeout(runLoop, 2000);
		return;
	}
	data.hazards = await getHazards(() => {});

	const text = buildScrollText(data);
	if (!text) {
		setTimeout(runLoop, 3000);
		return;
	}

	// hazard class on the bar for the full loop if any active
	const hasHazard = data.hazards?.length > 0;
	elemForEach('.weather-display .scroll', (el) => {
		el.classList.forEach((cls) => { if (cls !== 'scroll') el.classList.remove(cls); });
		if (hasHazard) el.classList.add('hazard');
	});

	// clear header
	elemForEach('.weather-display .scroll .scroll-header', (el) => { el.innerHTML = ''; });

	const firstFixed = document.querySelector('.weather-display .scroll .fixed');
	if (!firstFixed) return;

	// measure one copy's rendered width in the correct font context
	const tempEl = document.createElement('div');
	tempEl.classList.add('scroll-area');
	tempEl.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;top:-9999px';
	tempEl.textContent = text + SEPARATOR;
	firstFixed.appendChild(tempEl);
	const oneCopyWidth = tempEl.scrollWidth;
	firstFixed.removeChild(tempEl);

	if (oneCopyWidth === 0) return;

	// duplicate content: at left:-oneCopyWidth the view is identical to left:0
	const scrollArea = document.createElement('div');
	scrollArea.classList.add('scroll-area');
	scrollArea.textContent = text + SEPARATOR + text;
	scrollArea.style.left = '0px';

	elemForEach('.weather-display .scroll .fixed', (el) => {
		el.innerHTML = '';
		el.append(scrollArea.cloneNode(true));
	});

	const firstArea = firstFixed.querySelector('.scroll-area');
	const duration = oneCopyWidth / SCROLL_SPEED;

	const animate = () => {
		if (!loopActive || currentLoopId !== loopId) return;

		// Reset in rAF1, animate in rAF2 — avoids a synchronous forced reflow
		// that would stall the main thread and cause audio glitches every loop.
		requestAnimationFrame(() => {
			if (!loopActive || currentLoopId !== loopId) return;
			elemForEach('.weather-display .scroll .fixed .scroll-area', (el) => {
				el.style.transition = 'none';
				el.style.left = '0px';
			});
			requestAnimationFrame(() => {
				if (!loopActive || currentLoopId !== loopId) return;
				elemForEach('.weather-display .scroll .fixed .scroll-area', (el) => {
					el.style.transition = `left linear ${duration.toFixed(1)}s`;
					el.style.left = `-${oneCopyWidth}px`;
				});
				firstArea.addEventListener('transitionend', animate, { once: true });
			});
		});
	};

	animate();

	// refresh weather data after 5 minutes without interrupting the visual loop
	setTimeout(runLoop, DATA_REFRESH_MS);
};

// ── Public API ────────────────────────────────────────────────────────────────

const start = () => {
	const display = currentDisplay();
	if (!display?.okToDrawCurrentConditions) return;
	if (loopActive) return;
	loopActive = true;
	runLoop();
};

const stop = () => {
	loopActive = false;
};

// ── Message bridge ────────────────────────────────────────────────────────────

const parseMessage = (event) => {
	if (event?.data?.type === 'current-weather-scroll') {
		if (event.data?.method === 'start') start();
		if (event.data?.method === 'reload') stop();
	}
};

window.addEventListener('message', parseMessage);

window.CurrentWeatherScroll = { addScreen, reset, start };

export { addScreen, reset, start };
