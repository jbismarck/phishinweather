// navigation handles progress, next/previous and initial load messages from the parent frame
import noSleep from './utils/nosleep.mjs';
import STATUS from './status.mjs';
import { wrap } from './utils/calc.mjs';
import { json } from './utils/fetch.mjs';
import { getPoint } from './utils/weather.mjs';
import settings from './settings.mjs';

document.addEventListener('DOMContentLoaded', () => {
	init();
});

const displays = [];
let playing = false;
let progress;
const weatherParameters = {};

// ── Broadcast scheduler (SSE) ─────────────────────────────────────────────────
// Detect channel from URL: ?mode=stream → stream channel, else site
const schedChannel = new URLSearchParams(window.location.search).get('mode') === 'stream' ? 'stream' : 'site';
const schedStream = schedChannel === 'stream'; // true = locked to server, no manual browsing
let sseConnected = false;
let browsing = false;    // site mode: user has manually navigated away from live
let serverNavId = null;  // most recent navId the server said to show

const jumpToDisplay = (navId) => {
	const d = displays[navId];
	if (!d || d.status !== STATUS.loaded || !(d.timing?.totalScreens > 0)) return false;
	hideAllCanvases();
	d.showCanvas(msg.command.firstFrame);
	return true;
};

const updateBackToLiveBtn = () => {
	const btn = document.getElementById('btnBackToLive');
	if (btn) btn.style.display = (browsing && serverNavId !== null) ? '' : 'none';
};

const backToLive = () => {
	browsing = false;
	updateBackToLiveBtn();
	if (serverNavId !== null) jumpToDisplay(serverNavId);
};

const connectSSE = () => {
	const es = new EventSource(`/api/sse/${schedChannel}`);
	es.onopen = () => { sseConnected = true; };
	es.onmessage = (e) => {
		const { navId } = JSON.parse(e.data);
		serverNavId = navId;
		if (schedStream || !browsing) {
			jumpToDisplay(navId);
		}
		updateBackToLiveBtn();
	};
	es.onerror = () => {
		sseConnected = false;
		es.close();
		setTimeout(connectSSE, 3000); // reconnect after 3 s
	};
};

const init = async () => {
	// set up resize handler
	window.addEventListener('resize', resize);
	resize();

	generateCheckboxes();
	connectSSE();
};

const message = (data) => {
	// dispatch event
	if (!data.type) return false;
	if (data.type === 'navButton') return handleNavButton(data.message);
	return console.error(`Unknown event ${data.type}`);
};

const getWeather = async (latLon, haveDataCallback) => {
	// get initial weather data
	const point = await getPoint(latLon.lat, latLon.lon);

	if (typeof haveDataCallback === 'function') haveDataCallback(point);

	// get stations
	const stations = await json(point.properties.observationStations);

	const StationId = stations.features[0].properties.stationIdentifier;

	let { city } = point.properties.relativeLocation.properties;
	const { state } = point.properties.relativeLocation.properties;

	if (StationId in StationInfo) {
		city = StationInfo[StationId].city;
		[city] = city.split('/');
		city = city.replace(/\s+$/, '');
	}

	// populate the weather parameters
	weatherParameters.latitude = latLon.lat;
	weatherParameters.longitude = latLon.lon;
	weatherParameters.zoneId = point.properties.forecastZone.substr(-6);
	weatherParameters.radarId = point.properties.radarStation.substr(-3);
	weatherParameters.stationId = StationId;
	weatherParameters.weatherOffice = point.properties.cwa;
	weatherParameters.city = city;
	weatherParameters.state = state;
	weatherParameters.timeZone = point.properties.timeZone;
	weatherParameters.forecast = point.properties.forecast;
	weatherParameters.forecastGridData = point.properties.forecastGridData;
	weatherParameters.stations = stations.features;

	// update the main process for display purposes
	populateWeatherParameters(weatherParameters);

	// reset the scroll
	postMessage({ type: 'current-weather-scroll', method: 'reload' });

	// draw the progress canvas and hide others
	hideAllCanvases();
	document.querySelector('#loading').style.display = 'none';
	const locationSet = document.querySelector('#divLocationSet');
	if (locationSet) {
		const { city, state } = weatherParameters;
		document.querySelector('#locationSetCity').textContent = city && state ? `${city}, ${state}` : city || state;
		locationSet.style.display = 'block';
	}
	if (progress) {
		await progress.drawCanvas();
		progress.showCanvas();
	}

	// call for new data on each display
	displays.forEach((display) => display.getData(weatherParameters));
};

// receive a status update from a module {id, value}
const updateStatus = (value) => {
	if (value.id < 0) return;
	if (!progress) return;
	progress.drawCanvas(displays, countLoadedDisplays());

	// first display is hazards and it must load before evaluating the first display
	if (displays[0].status === STATUS.loading) return;

	// calculate first enabled display
	const firstDisplayIndex = displays.findIndex((display) => display?.enabled && display?.timing?.totalScreens > 0);

	// value.id = 0 is hazards, if they fail to load hot-wire a new value.id to the current display to see if it needs to be loaded
	// typically this plays out as current conditions loads, then hazards fails.
	if (value.id === 0 && (value.status === STATUS.failed || value.status === STATUS.retrying)) {
		value.id = firstDisplayIndex;
		value.status = displays[firstDisplayIndex]?.status;
	}

	// if hazards data arrives after the firstDisplayIndex loads, then we need to hot wire this to the first display
	if (value.id === 0 && value.status === STATUS.loaded && displays[0].timing.totalScreens === 0) {
		value.id = firstDisplayIndex;
		value.status = displays[firstDisplayIndex]?.status;
	}

	// when a display finishes loading: if SSE is active try to jump to what the server wants,
	// otherwise fall back to the original "start at first display" behaviour
	if (value.status === STATUS.loaded && !currentDisplay()) {
		if (sseConnected && !browsing && serverNavId !== null) {
			if (!jumpToDisplay(serverNavId) && isPlaying() && value.id === firstDisplayIndex) {
				navTo(msg.command.firstFrame); // server's display not ready yet — start naturally
			}
		} else if (isPlaying() && value.id === firstDisplayIndex) {
			navTo(msg.command.firstFrame);
		}
	}
};

// note: a display that is "still waiting"/"retrying" is considered loaded intentionally
// the weather.gov api has long load times for some products when you are the first
// requester for the product after the cache expires
const countLoadedDisplays = () => displays.reduce((acc, display) => {
	if (display.status !== STATUS.loading) return acc + 1;
	return acc;
}, 0);

const hideAllCanvases = () => {
	displays.forEach((display) => display.hideCanvas());
};

// is playing interface
const isPlaying = () => playing;

// navigation message constants
const msg = {
	response: {	// display to navigation
		previous: Symbol('previous'),		// already at first frame, calling function should switch to previous canvas
		inProgress: Symbol('inProgress'),	// have data to display, calling function should do nothing
		next: Symbol('next'),				// end of frames reached, calling function should switch to next canvas
	},
	command: {	// navigation to display
		firstFrame: Symbol('firstFrame'),
		previousFrame: Symbol('previousFrame'),
		nextFrame: Symbol('nextFrame'),
		lastFrame: Symbol('lastFrame'),	// used when navigating backwards from the begining of the next canvas
	},
};

// receive navigation messages from displays
const displayNavMessage = (myMessage) => {
	// In SSE mode the server drives advancement — suppress client-side auto-advance.
	// The current display simply holds its last frame until the server fires the next event.
	if (sseConnected && (schedStream || !browsing)) return;
	if (myMessage.type === msg.response.previous) loadDisplay(-1);
	if (myMessage.type === msg.response.next) loadDisplay(1);
};

// navigate to next or previous
const navTo = (direction) => {
	// test for a current display
	const current = currentDisplay();
	progress.hideCanvas();
	if (!current) {
		// special case for no active displays (typically on progress screen)
		// find the first ready display
		let firstDisplay;
		let displayCount = 0;
		do {
			if (displays[displayCount]?.status === STATUS.loaded && displays[displayCount]?.timing?.totalScreens > 0) firstDisplay = displays[displayCount];
			displayCount += 1;
		} while (!firstDisplay && displayCount < displays.length);

		if (!firstDisplay) return;

		firstDisplay.navNext(msg.command.firstFrame);
		firstDisplay.showCanvas();
		return;
	}
	if (direction === msg.command.nextFrame) currentDisplay().navNext();
	if (direction === msg.command.previousFrame) currentDisplay().navPrev();
};

// find the next or previous available display
const loadDisplay = (direction) => {
	const totalDisplays = displays.length;
	const curIdx = currentDisplayIndex();
	let idx;
	for (let i = 0; i < totalDisplays; i += 1) {
		// convert form simple 0-10 to start at current display index +/-1 and wrap
		idx = wrap(curIdx + (i + 1) * direction, totalDisplays);
		if (displays[idx]?.status === STATUS.loaded && displays[idx]?.timing?.totalScreens > 0) break;
	}
	const newDisplay = displays[idx];
	// hide all displays
	hideAllCanvases();
	// show the new display and navigate to an appropriate display
	if (direction < 0) newDisplay.showCanvas(msg.command.lastFrame);
	if (direction > 0) newDisplay.showCanvas(msg.command.firstFrame);
};

// get the current display index or value
const currentDisplayIndex = () => displays.findIndex((display) => display?.active);
const currentDisplay = () => displays[currentDisplayIndex()];

const setPlaying = (newValue) => {
	playing = newValue;
	const playButton = document.querySelector('#NavigatePlay');
	localStorage.setItem('play', playing);

	if (playing) {
		noSleep(true);
		playButton.title = 'Pause';
		playButton.src = 'images/nav/ic_pause_white_24dp_2x.png';
	} else {
		noSleep(false);
		playButton.title = 'Play';
		playButton.src = 'images/nav/ic_play_arrow_white_24dp_2x.png';
	}
	// if we're playing and on the progress screen jump to the next screen
	if (!progress) return;
	if (playing && !currentDisplay()) navTo(msg.command.firstFrame);
};

// handle all navigation buttons
const handleNavButton = (button) => {
	switch (button) {
		case 'play':
			browsing = false;
			updateBackToLiveBtn();
			setPlaying(true);
			if (sseConnected && serverNavId !== null) jumpToDisplay(serverNavId);
			break;
		case 'playToggle':
			if (!playing) { browsing = false; updateBackToLiveBtn(); }
			setPlaying(!playing);
			if (!playing && sseConnected && serverNavId !== null) jumpToDisplay(serverNavId);
			break;
		case 'stop':
			setPlaying(false);
			break;
		case 'next':
			if (schedStream) break; // stream mode: ignore manual nav
			browsing = true;
			updateBackToLiveBtn();
			setPlaying(false);
			navTo(msg.command.nextFrame);
			break;
		case 'previous':
			if (schedStream) break; // stream mode: ignore manual nav
			browsing = true;
			updateBackToLiveBtn();
			setPlaying(false);
			navTo(msg.command.previousFrame);
			break;
		case 'menu':
			setPlaying(false);
			progress.showCanvas();
			hideAllCanvases();
			break;
		default:
			console.error(`Unknown navButton ${button}`);
	}
};

// return the specificed display
const getDisplay = (index) => displays[index];

// resize the container on a page resize
const resize = () => {
	const targetWidth = settings.wide.value ? 640 + 107 + 107 : 640;
	const widthZoomPercent = (document.querySelector('#divTwcBottom').getBoundingClientRect().width) / targetWidth;
	const heightZoomPercent = (window.innerHeight) / 480;

	const scale = Math.min(widthZoomPercent, heightZoomPercent);
	if (scale < 1.0 || document.fullscreenElement || settings.kiosk) {
		document.querySelector('#container').style.zoom = scale;
	} else {
		document.querySelector('#container').style.zoom = 'unset';
	}
};

// reset all statuses to loading on all displays, used to keep the progress bar accurate during refresh
const resetStatuses = () => {
	displays.forEach((display) => { display.status = STATUS.loading; });
};

// allow displays to register themselves
const registerDisplay = (display) => {
	if (displays[display.navId]) console.warn(`Display nav ID ${display.navId} already in use`);
	displays[display.navId] = display;

	// generate checkboxes
	generateCheckboxes();
};

const generateCheckboxes = () => {
	const availableDisplays = document.querySelector('#enabledDisplays');

	if (!availableDisplays) return;
	// generate checkboxes
	const checkboxes = displays.map((d) => d.generateCheckbox(d.defaultEnabled)).filter((d) => d);

	// write to page
	availableDisplays.innerHTML = '';
	availableDisplays.append(...checkboxes);
};

// special registration method for progress display
const registerProgress = (_progress) => {
	progress = _progress;
};

const populateWeatherParameters = (params) => {
	document.querySelector('#spanCity').textContent = `${params.city}, `;
	document.querySelector('#spanState').textContent = params.state;
	document.querySelector('#spanStationId').textContent = params.stationId;
	document.querySelector('#spanRadarId').textContent = params.radarId;
	document.querySelector('#spanZoneId').textContent = params.zoneId;
};

const latLonReceived = (data, haveDataCallback) => {
	getWeather(data, haveDataCallback).catch((err) => {
		console.error('Failed to load weather data:', err);
		document.querySelector('#loading').style.display = 'flex';
	});
};

const timeZone = () => weatherParameters.timeZone;

export {
	updateStatus,
	displayNavMessage,
	resetStatuses,
	isPlaying,
	resize,
	registerDisplay,
	registerProgress,
	currentDisplay,
	getDisplay,
	msg,
	message,
	latLonReceived,
	hideAllCanvases,
	timeZone,
	backToLive,
};
