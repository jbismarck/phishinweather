import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

const VIEW_HEIGHT = 270;
const SCROLL_PX_PER_SEC = 30;
const SCROLL_DELAY_MS = 1500;

class VenueGuide extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Venue Guide', true);
		this.timing.baseDelay = 10000;
		this.okToDrawCurrentConditions = true;
	}

	async getData(weatherParameters, refresh) {
		if (!super.getData(weatherParameters, refresh)) return;

		let status;
		try {
			status = await json('/api/phish/show-status');
		} catch (e) {
			console.error('VenueGuide fetch failed:', e);
			this.setStatus(STATUS.failed);
			return;
		}

		if (!status || status.phase !== 'pre-show') {
			this.setStatus(STATUS.noData);
			return;
		}

		this.data = status;
		this.buildContent();
		this.setStatus(STATUS.loaded);
	}

	buildContent() {
		const container = this.elem.querySelector('.vg-container');
		container.innerHTML = '';
		container.style.cssText = '';

		const { venue, city, state, shakedown, policy, food } = this.data;

		const addRow = (label, value) => {
			if (!value) return;
			const labelEl = document.createElement('div');
			labelEl.className = 'vg-label';
			labelEl.textContent = label;
			container.append(labelEl);
			const valueEl = document.createElement('div');
			valueEl.className = 'vg-value';
			valueEl.textContent = value;
			container.append(valueEl);
		};

		const addSection = (title) => {
			const el = document.createElement('div');
			el.className = 'vg-section';
			el.textContent = title;
			container.append(el);
		};

		addSection(`${venue.toUpperCase()}  ·  ${city}, ${state}`);

		if (shakedown) {
			addRow('SHAKEDOWN', shakedown.location);
			addRow('PARKING', shakedown.parking);
			if (shakedown.tip) addRow('TIP', shakedown.tip);
		}

		if (policy) {
			addSection('VENUE POLICY');
			addRow('WATER', policy.water_bottles);
			addRow('POSTER TUBES', policy.poster_tubes);
			if (policy.water_station) addRow('WATER STATION', policy.water_station);
		}

		if (food?.length) {
			addSection('NEARBY');
			food.slice(0, 2).forEach((f) => {
				addRow(f.name.toUpperCase(), f.note);
			});
		}

		const contentHeight = container.scrollHeight || 1200;
		const scrollDist = Math.max(0, contentHeight - VIEW_HEIGHT);
		const scrollSecs = scrollDist / SCROLL_PX_PER_SEC;
		this.timing.baseDelay = Math.round((scrollSecs + SCROLL_DELAY_MS / 1000 + 2) * 1000);
		this.timing.totalScreens = 1;
		this.calcNavTiming();
	}

	async drawCanvas() {
		super.drawCanvas();
		const container = this.elem.querySelector('.vg-container');
		const contentHeight = container.scrollHeight;
		const scrollDist = Math.max(0, contentHeight - VIEW_HEIGHT);

		container.style.animation = 'none';
		void container.offsetHeight;

		if (scrollDist > 0) {
			const scrollSecs = scrollDist / SCROLL_PX_PER_SEC;
			const delaySecs = SCROLL_DELAY_MS / 1000;
			container.style.setProperty('--vg-scroll-dist', `-${scrollDist}px`);
			container.style.animation = `vg-scroll ${scrollSecs.toFixed(1)}s ${delaySecs}s linear forwards`;
		}

		this.finishDraw();
	}
}

const venueGuide = new VenueGuide(31, 'venue-guide');
registerDisplay(venueGuide);
venueGuide.getData();
