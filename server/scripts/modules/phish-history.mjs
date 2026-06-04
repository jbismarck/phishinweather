import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

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

		// measure visible area from container's parent
		this.pageHeight = this.elem.querySelector('.scroll-container').offsetHeight;

		// round each show block up to a multiple of pageHeight so screens align cleanly
		container.querySelectorAll('.show').forEach((showBlock) => {
			const rounded = Math.ceil(showBlock.scrollHeight / this.pageHeight) * this.pageHeight;
			showBlock.style.minHeight = `${rounded}px`;
		});

		this.timing.totalScreens = Math.round(container.scrollHeight / this.pageHeight);
		this.calcNavTiming();
	}

	async drawCanvas() {
		super.drawCanvas();
		const top = -this.screenIndex * this.pageHeight;
		this.elem.querySelector('.shows-container').style.top = `${top}px`;
		this.finishDraw();
	}
}

registerDisplay(new PhishHistory(20, 'phish-history'));
