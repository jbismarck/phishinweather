import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

const VIEW_HEIGHT = 270;
const SCROLL_PX_PER_SEC = 35;
const SCROLL_DELAY_MS = 1500;
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const formatShowDate = (dateStr) => {
	const d = new Date(`${dateStr}T12:00:00`);
	return `${DAY_NAMES[d.getDay()]}  ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}  ${d.getFullYear()}`;
};

class PhishLiveSetlist extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Phish Setlist', true);
		this.timing.baseDelay = 8000;
		this.okToDrawCurrentConditions = true;
	}

	async getData(weatherParameters, refresh) {
		if (!super.getData(weatherParameters, refresh)) return;

		let data;
		try {
			data = await json('/api/phish/live-setlist');
		} catch (e) {
			console.error('PhishLiveSetlist fetch failed:', e);
			this.setStatus(STATUS.failed);
			return;
		}

		if (!data || data.error || data.noShow) {
			this.setStatus(STATUS.failed);
			return;
		}

		this.data = data;
		this.buildContent();
		this.setStatus(STATUS.loaded);
	}

	buildContent() {
		const container = this.elem.querySelector('.setlist-container');
		container.innerHTML = '';
		container.style.cssText = '';

		const {
			showdate, venue, city, state, sets = [], notes,
		} = this.data;

		const venueEl = document.createElement('div');
		venueEl.className = 'sl-venue';
		venueEl.textContent = venue.toUpperCase();
		container.append(venueEl);

		const dateEl = document.createElement('div');
		dateEl.className = 'sl-date';
		dateEl.textContent = `${city.toUpperCase()}, ${state}  ·  ${formatShowDate(showdate)}`;
		container.append(dateEl);

		sets.forEach((set) => {
			const setHeader = document.createElement('div');
			setHeader.className = 'sl-set-header';
			setHeader.textContent = set.name;
			container.append(setHeader);

			const songsEl = document.createElement('div');
			songsEl.className = 'sl-songs';
			songsEl.textContent = set.songs;
			container.append(songsEl);
		});

		if (notes) {
			const notesEl = document.createElement('div');
			notesEl.className = 'sl-notes';
			notesEl.textContent = notes;
			container.append(notesEl);
		}

		const attrEl = document.createElement('div');
		attrEl.className = 'sl-attribution';
		attrEl.textContent = 'SETLIST DATA: PHISH.NET';
		container.append(attrEl);

		const contentHeight = container.scrollHeight || 1000;
		const scrollDist = Math.max(0, contentHeight - VIEW_HEIGHT);
		const scrollSecs = scrollDist / SCROLL_PX_PER_SEC;
		this.timing.baseDelay = Math.round((scrollSecs + SCROLL_DELAY_MS / 1000 + 2) * 1000);
		this.timing.totalScreens = 1;
		this.calcNavTiming();
	}

	async drawCanvas() {
		super.drawCanvas();

		const headerBottom = this.elem.querySelector('.title .bottom');
		if (headerBottom) {
			headerBottom.textContent = this.data?.isToday ? 'TONIGHT' : 'LAST SHOW';
		}

		const container = this.elem.querySelector('.setlist-container');
		const contentHeight = container.scrollHeight;
		const scrollDist = Math.max(0, contentHeight - VIEW_HEIGHT);

		container.style.animation = 'none';
		void container.offsetHeight;

		if (scrollDist > 0) {
			const scrollSecs = scrollDist / SCROLL_PX_PER_SEC;
			const delaySecs = SCROLL_DELAY_MS / 1000;
			container.style.setProperty('--sl-scroll-dist', `-${scrollDist}px`);
			container.style.animation = `sl-scroll ${scrollSecs.toFixed(1)}s ${delaySecs}s linear forwards`;
		}

		this.finishDraw();
	}
}

const phishLiveSetlist = new PhishLiveSetlist(30, 'phish-live-setlist');
registerDisplay(phishLiveSetlist);
phishLiveSetlist.getData();
