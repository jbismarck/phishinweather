import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

class TonightPoster extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, "Tonight's Poster", true);
		this.timing.baseDelay = 15000;
		this.timing.totalScreens = 1;
		this.okToDrawCurrentConditions = true;
	}

	async getData(weatherParameters, refresh) {
		if (!super.getData(weatherParameters, refresh)) return;

		let status;
		try {
			status = await json('/api/phish/show-status');
		} catch (e) {
			console.error('TonightPoster fetch failed:', e);
			this.setStatus(STATUS.failed);
			return;
		}

		if (!status || status.phase !== 'pre-show' || !status.poster_url) {
			this.setStatus(STATUS.noData);
			return;
		}

		this.data = status;
		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();

		const img = this.elem.querySelector('.tp-poster');
		const caption = this.elem.querySelector('.tp-caption');

		img.src = this.data.poster_url;
		img.alt = `${this.data.venue} — ${this.data.showDate}`;

		if (caption) {
			caption.textContent = `${this.data.venue.toUpperCase()}  ·  ${this.data.city}, ${this.data.state}`;
		}

		this.finishDraw();
	}
}

const tonightPoster = new TonightPoster(32, 'tonight-poster');
registerDisplay(tonightPoster);
tonightPoster.getData();
