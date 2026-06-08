import { locationCleanup } from './utils/string.mjs';
import { elemForEach } from './utils/elem.mjs';
import getCurrentWeather from './currentweather.mjs';
import { currentDisplay } from './navigation.mjs';
import getHazards from './hazards.mjs';

const degree = String.fromCharCode(176);
const SCROLL_SPEED = 60; // pixels/second — medium crawl
const SEPARATOR = '   •   ';

let loopActive = false;

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

	// build the scroll element
	const scrollArea = document.createElement('div');
	scrollArea.classList.add('scroll-area');
	scrollArea.textContent = text;
	scrollArea.style.left = '0px';

	// mount to all fixed containers
	elemForEach('.weather-display .scroll .fixed', (el) => {
		el.innerHTML = '';
		el.append(scrollArea.cloneNode(true));
	});

	// measure from first mounted copy
	const firstFixed = document.querySelector('.weather-display .scroll .fixed');
	if (!firstFixed) return;
	const firstArea = firstFixed.querySelector('.scroll-area');
	const scrollDistance = Math.max(firstArea.scrollWidth - firstFixed.clientWidth, 0);

	if (scrollDistance === 0) {
		// content fits without scrolling — show briefly then loop
		setTimeout(runLoop, 5000);
		return;
	}

	const duration = scrollDistance / SCROLL_SPEED;
	elemForEach('.weather-display .scroll .fixed .scroll-area', (el) => {
		el.style.transition = `left linear ${duration.toFixed(1)}s`;
	});

	// double rAF so browser paints the initial position before triggering the transition
	requestAnimationFrame(() => requestAnimationFrame(() => {
		if (!loopActive) return;
		elemForEach('.weather-display .scroll .fixed .scroll-area', (el) => {
			el.style.left = `-${scrollDistance}px`;
		});
		firstArea.addEventListener('transitionend', runLoop, { once: true });
	}));
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
