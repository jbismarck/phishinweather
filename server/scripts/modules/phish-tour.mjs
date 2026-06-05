import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';
import { injectTracks } from './media.mjs';

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
const CARDS_PER_SHOW = 4;
const CARD_SUBTITLES = ['SHOW INFO', 'FORECAST', 'LOT EATS', 'SHAKEDOWN'];

const formatShowDate = (dateStr) => {
	// "2026-06-17" → "WED  JUN 17  2026"
	const d = new Date(`${dateStr}T12:00:00`);
	return `${DAY_NAMES[d.getDay()]}  ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}  ${d.getFullYear()}`;
};

const formatForecastDate = (dateStr) => {
	// "2026-06-17" → "WED JUN 17"
	const d = new Date(`${dateStr}T12:00:00`);
	return `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
};

const daysUntil = (dateStr) => {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const show = new Date(`${dateStr}T12:00:00`);
	show.setHours(0, 0, 0, 0);
	return Math.round((show - today) / 86400000);
};

class PhishTour extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Phish Summer Tour', true);
		this.timing.baseDelay = 8000;
		this.lastShowIndex = -1;
	}

	async getData(weatherParameters, refresh) {
		if (!super.getData(weatherParameters, refresh)) return;

		let data;
		try {
			data = await json('/api/phish/summer-tour');
		} catch (e) {
			console.error('PhishTour fetch failed:', e);
			this.setStatus(STATUS.failed);
			return;
		}

		if (!data?.shows?.length) {
			this.setStatus(STATUS.failed);
			return;
		}

		this.data = data;
		this.timing.totalScreens = data.shows.length * CARDS_PER_SHOW;
		this.timing.delay = Array(this.timing.totalScreens).fill(1);
		this.calcNavTiming();
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();

		const showIndex = Math.floor(this.screenIndex / CARDS_PER_SHOW);
		const cardIndex = this.screenIndex % CARDS_PER_SHOW;
		const show = this.data.shows[showIndex];

		// update header subtitle to reflect current card type
		const headerBottom = this.elem.querySelector('.title .bottom');
		if (headerBottom) headerBottom.textContent = CARD_SUBTITLES[cardIndex];

		// show only the active card
		this.elem.querySelectorAll('.card').forEach((c) => c.classList.remove('active'));
		const cardClasses = ['card-info', 'card-forecast', 'card-eats', 'card-shakedown'];
		this.elem.querySelector(`.${cardClasses[cardIndex]}`).classList.add('active');

		// show/counter
		this.elem.querySelector('.show-num').textContent = showIndex + 1;
		this.elem.querySelector('.show-total').textContent = this.data.shows.length;

		// swap music when entering a new show's info card
		if (cardIndex === 0 && showIndex !== this.lastShowIndex) {
			this.lastShowIndex = showIndex;
			if (show.musicTracks?.length) injectTracks(show.musicTracks);
		}

		switch (cardIndex) {
			case 0: this.renderInfo(show); break;
			case 1: this.renderForecast(show); break;
			case 2: this.renderEats(show); break;
			case 3: this.renderShakedown(show); break;
			default: break;
		}

		this.finishDraw();
	}

	renderInfo(show) {
		const card = this.elem.querySelector('.card-info');
		card.querySelector('.show-date').textContent = formatShowDate(show.date);
		card.querySelector('.show-venue').textContent = show.venue;
		card.querySelector('.show-city').textContent = `${show.city}, ${show.state}`;

		const policy = show.policy ?? {};
		card.querySelector('.policy-bottles').textContent = policy.water_bottles ?? 'Check venue website';
		card.querySelector('.policy-tubes').textContent = policy.poster_tubes ?? 'Check venue website';

		const days = daysUntil(show.date);
		const countdownElem = card.querySelector('.show-countdown');
		if (days === 0) {
			countdownElem.textContent = 'TONIGHT!';
			countdownElem.classList.add('tonight');
		} else if (days < 0) {
			countdownElem.textContent = 'SHOW COMPLETE';
			countdownElem.classList.remove('tonight');
		} else {
			countdownElem.textContent = `IN ${days} DAY${days !== 1 ? 'S' : ''}`;
			countdownElem.classList.remove('tonight');
		}
	}

	renderForecast(show) {
		const card = this.elem.querySelector('.card-forecast');
		card.querySelector('.forecast-city').textContent = `${show.city.toUpperCase()}, ${show.state}`;

		const daysContainer = card.querySelector('.forecast-days');
		daysContainer.innerHTML = '';

		const noForecast = card.querySelector('.no-forecast');
		const fcst = show.forecast;

		if (!fcst?.length) {
			noForecast.style.display = '';
			return;
		}
		noForecast.style.display = 'none';

		fcst.forEach((day) => {
			const block = this.fillTemplate('forecast-day', {
				'f-date': formatForecastDate(day.date),
				'f-condition': WMO_DESC[day.wmo] ?? 'UNKNOWN',
				'f-hi': `HI ${Math.round(day.tempMax)}°`,
				'f-lo': `LO ${Math.round(day.tempMin)}°`,
			});
			daysContainer.append(block);
		});
	}

	renderEats(show) {
		const card = this.elem.querySelector('.card-eats');
		card.querySelector('.eats-venue').textContent = `>> ${show.city.toUpperCase()}`;

		const list = card.querySelector('.eats-list');
		list.innerHTML = '';

		(show.food || []).forEach((item) => {
			const block = this.fillTemplate('eat-item', {
				'eat-name': item.name.toUpperCase(),
				'eat-type': item.type.toUpperCase(),
				'eat-note': item.note,
			});
			list.append(block);
		});
	}

	renderShakedown(show) {
		const card = this.elem.querySelector('.card-shakedown');
		const sd = show.shakedown;
		card.querySelector('.sd-venue').textContent = show.venue.toUpperCase();
		card.querySelector('.sd-location').textContent = sd.location;
		card.querySelector('.sd-parking').textContent = sd.parking;
		card.querySelector('.sd-tip').textContent = `>> ${sd.tip}`;
	}
}

registerDisplay(new PhishTour(21, 'phish-tour'));
