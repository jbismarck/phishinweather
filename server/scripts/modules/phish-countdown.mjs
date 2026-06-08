import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

const msUntil = (dateStr) => {
	const target = new Date(`${dateStr}T00:00:00`);
	return target - Date.now();
};

const daysUntilDate = (dateStr) => Math.floor(msUntil(dateStr) / 86400000);

const parseCountdown = (dateStr) => {
	const total = Math.max(0, msUntil(dateStr));
	const totalSecs = Math.floor(total / 1000);
	const days = Math.floor(totalSecs / 86400);
	const hrs = Math.floor((totalSecs % 86400) / 3600);
	const min = Math.floor((totalSecs % 3600) / 60);
	return { days, hrs, min };
};

class PhishCountdown extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Phish Countdown', true);
		this.timing.baseDelay = 12000;
		this.countdownInterval = null;
		this.events = [];
	}

	async getData(weatherParameters, refresh) {
		if (!super.getData(weatherParameters, refresh)) return;

		let data;
		try {
			data = await json('/data/phish-events.json');
		} catch (e) {
			console.error('PhishCountdown fetch failed:', e);
			this.setStatus(STATUS.failed);
			return;
		}

		if (!data?.events?.length) {
			this.setStatus(STATUS.failed);
			return;
		}

		// filter out events where date is set and more than 1 day in the past
		this.events = data.events.filter((ev) => {
			if (!ev.date) return true;
			return daysUntilDate(ev.date) >= -1;
		});

		if (!this.events.length) {
			this.setStatus(STATUS.failed);
			return;
		}

		this.timing.totalScreens = this.events.length;
		this.timing.delay = Array(this.events.length).fill(1);
		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();
		const event = this.events[this.screenIndex];
		if (!event) { this.finishDraw(); return; }

		const headerBottom = this.elem.querySelector('.title .bottom');
		if (headerBottom) headerBottom.textContent = event.short;

		this.renderEvent(event);
		this.finishDraw();
	}

	renderEvent(event) {
		// hide all cards
		this.elem.querySelectorAll('.crd').forEach((c) => c.classList.remove('active'));

		if (!event.date) {
			this.renderTba(event);
			return;
		}

		const days = daysUntilDate(event.date);
		if (days <= 0 && days >= -1) {
			this.renderTonight(event);
		} else {
			this.renderCountdown(event);
		}
	}

	renderCountdown(event) {
		const card = this.elem.querySelector('.crd-date');
		card.classList.add('active');
		card.querySelector('.event-name').textContent = event.name.toUpperCase();
		card.querySelector('.event-dates').textContent = event.dateDisplay ?? '';
		card.querySelector('.event-note').textContent = event.note ?? '';
		const days = daysUntilDate(event.date);
		card.classList.toggle('forty-six', days === 46);
		this.updateCountdownNums(event.date);
	}

	renderTonight(event) {
		const card = this.elem.querySelector('.crd-tonight');
		card.classList.add('active');
		card.querySelector('.event-name').textContent = event.name.toUpperCase();
		card.querySelector('.event-dates').textContent = event.dateDisplay ?? '';
		card.querySelector('.event-note').textContent = event.note ?? '';
	}

	renderTba(event) {
		const card = this.elem.querySelector('.crd-tba');
		card.classList.add('active');
		card.querySelector('.event-name').textContent = event.name.toUpperCase();
		card.querySelector('.tba-expected').textContent = (event.expected ?? '').toUpperCase();
		card.querySelector('.event-dates').textContent = event.dateDisplay ?? '';
		card.querySelector('.event-note').textContent = (event.note ?? '').toUpperCase();
	}

	updateCountdownNums(dateStr) {
		const card = this.elem.querySelector('.crd-date');
		if (!card?.classList.contains('active')) return;
		const { days, hrs, min } = parseCountdown(dateStr);
		card.querySelector('.count-num').textContent = days;
		card.querySelector('.count-unit').textContent = days === 46 ? 'FORTY SIX DAYS' : 'DAYS';
		card.classList.toggle('forty-six', days === 46);
		card.querySelector('.count-hrs').textContent = String(hrs).padStart(2, '0');
		card.querySelector('.count-min').textContent = String(min).padStart(2, '0');
	}

	showCanvas(navCmd) {
		super.showCanvas(navCmd);
		if (!this.countdownInterval) {
			this.countdownInterval = setInterval(() => {
				const event = this.events[this.screenIndex];
				if (event?.date) this.updateCountdownNums(event.date);
			}, 1000);
		}
	}

	hideCanvas() {
		super.hideCanvas();
		clearInterval(this.countdownInterval);
		this.countdownInterval = null;
	}
}

const phishCountdown = new PhishCountdown(22, 'phish-countdown');
registerDisplay(phishCountdown);
phishCountdown.getData();
