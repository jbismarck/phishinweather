import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

const VIEW_HEIGHT = 250; // visible scroll window: Y=100 to Y=350
const SCROLL_PX_PER_SEC = 35;
const SCROLL_DELAY_MS = 1500; // pause at top before scrolling

class PhishHistory extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Phish History', true);
		this.timing.baseDelay = 8000;
	}

	async getData(weatherParameters, refresh) {
		if (!super.getData(weatherParameters, refresh)) return;

		let data;
		try {
			data = await json('/api/phish/on-this-day');
		} catch (e) {
			console.error('PhishHistory fetch failed:', e);
			this.setStatus(STATUS.failed);
			return;
		}

		if (!data?.shows?.length) {
			this.setStatus(STATUS.failed);
			return;
		}

		this.data = data;
		this.buildScreens();
		this.setStatus(STATUS.loaded);
	}

	buildScreens() {
		const container = this.elem.querySelector('.shows-container');
		container.innerHTML = '';
		container.style.cssText = '';

		this.data.shows.forEach((show) => {
			const block = this.fillTemplate('show', {
				year: show.year,
				venue: show.venue,
				location: show.location,
			});

			const setlistElem = block.querySelector('.setlist');
			Object.entries(show.sets).forEach(([setName, songs]) => {
				const setHeader = document.createElement('div');
				setHeader.className = 'set-header';
				setHeader.textContent = setName.toUpperCase();
				setlistElem.append(setHeader);

				songs.forEach((title) => {
					const songElem = document.createElement('div');
					songElem.className = 'song';
					songElem.textContent = title;
					setlistElem.append(songElem);
				});
			});

			container.append(block);
		});

		// estimate content height to set baseDelay before calcNavTiming
		// scrollHeight works even when hidden; use it if non-zero, else estimate
		const contentHeight = container.scrollHeight || 1200;
		const scrollDist = Math.max(0, contentHeight - VIEW_HEIGHT);
		const scrollSecs = scrollDist / SCROLL_PX_PER_SEC;
		this.timing.baseDelay = Math.round((scrollSecs + SCROLL_DELAY_MS / 1000 + 2) * 1000);
		this.timing.totalScreens = 1;
		this.calcNavTiming();
	}

	async drawCanvas() {
		super.drawCanvas();
		const container = this.elem.querySelector('.shows-container');
		const contentHeight = container.scrollHeight;
		const scrollDist = Math.max(0, contentHeight - VIEW_HEIGHT);

		container.style.animation = 'none';
		void container.offsetHeight; // force reflow to reset animation

		if (scrollDist > 0) {
			const scrollSecs = scrollDist / SCROLL_PX_PER_SEC;
			const delaySecs = SCROLL_DELAY_MS / 1000;
			container.style.setProperty('--ph-scroll-dist', `-${scrollDist}px`);
			container.style.animation = `ph-scroll ${scrollSecs.toFixed(1)}s ${delaySecs}s linear forwards`;
		}

		this.finishDraw();
	}
}

const phishHistory = new PhishHistory(20, 'phish-history');
registerDisplay(phishHistory);
phishHistory.getData();
