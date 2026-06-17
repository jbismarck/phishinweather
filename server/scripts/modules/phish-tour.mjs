import STATUS from './status.mjs';
import { json } from './utils/fetch.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

const WMO_DESC = {
	0: 'CLEAR', 1: 'MAINLY CLEAR', 2: 'PARTLY CLOUDY', 3: 'OVERCAST',
	45: 'FOG', 48: 'FREEZING FOG',
	51: 'DRIZZLE', 53: 'DRIZZLE', 55: 'HEAVY DRIZZLE',
	61: 'LIGHT RAIN', 63: 'RAIN', 65: 'HEAVY RAIN',
	71: 'LIGHT SNOW', 73: 'SNOW', 75: 'HEAVY SNOW',
	80: 'SHOWERS', 81: 'SHOWERS', 82: 'HEAVY SHOWERS',
	95: 'TSTORMS', 96: 'TSTORMS W/ HAIL', 99: 'TSTORMS W/ HAIL',
};

const WMO_ICON = {
	0: 'Sunny.gif', 1: 'Sunny.gif', 2: 'Partly-Cloudy.gif', 3: 'Cloudy.gif',
	45: 'Fog.gif', 48: 'Fog.gif',
	51: 'Rain.gif', 53: 'Rain.gif', 55: 'Rain.gif',
	61: 'Rain.gif', 63: 'Rain.gif', 65: 'Rain.gif',
	71: 'Light-Snow.gif', 73: 'Light-Snow.gif', 75: 'Heavy-Snow.gif', 77: 'Light-Snow.gif',
	80: 'Shower.gif', 81: 'Shower.gif', 82: 'Shower.gif',
	85: 'Light-Snow.gif', 86: 'Heavy-Snow.gif',
	95: 'Scattered-Thunderstorms-Day.gif', 96: 'Scattered-Thunderstorms-Day.gif',
	99: 'Thunderstorm.gif',
};

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const CARDS_PER_SHOW = 4;
const CARD_SUBTITLES = ['SHOW INFO', 'FORECAST', 'LOT EATS', 'SHAKEDOWN'];

const VENUE_SHORT = {
	'Madison Square Garden': 'MSG',
	"Dick's Sporting Goods Park": "DICK'S",
	'Fenway Park': 'FENWAY',
	'Merriweather Post Pavilion': 'MERRIWEATHER',
	'Kohl Center': 'KOHL',
	'Enmarket Arena': 'ENMARKET',
	'Ruoff Music Center': 'RUOFF',
	'Coastal Credit Union Music Park at Walnut Creek': 'WALNUT CREEK',
	'Empower FCU Amphitheater at Lakeview': 'LAKEVIEW',
};

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

const formatDayName = (dateStr) => {
	const d = new Date(`${dateStr}T12:00:00`);
	return DAY_NAMES[d.getDay()];
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
		this.mockWeather = false;
	}

	async getData(weatherParameters, refresh) {
		if (!super.getData(weatherParameters, refresh)) return;

		let data;
		try {
			data = await json(`/api/phish/summer-tour${this.mockWeather ? '?mock=1' : ''}`);
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

		const isMSG = show.venue === 'Madison Square Garden';

		// update header title + subtitle
		const headerTop = this.elem.querySelector('.title .top');
		const headerBottom = this.elem.querySelector('.title .bottom');
		if (headerTop) headerTop.textContent = cardIndex === 0
			? (VENUE_SHORT[show.venue] ?? show.venue.split(' ')[0].toUpperCase())
			: 'PHISH';
		if (headerBottom) {
			let subtitle;
			if (cardIndex === 0 && isMSG) {
				subtitle = 'YEMSG';
			} else if (cardIndex === 0) {
				const [, mm, dd] = show.date.split('-');
				subtitle = `${show.city.toUpperCase()}, ${show.state}  ·  ${MONTH_NAMES[parseInt(mm) - 1]} ${parseInt(dd)}`;
			} else if (cardIndex === 1) {
				subtitle = `${show.city.toUpperCase()}, ${show.state}`;
			} else {
				subtitle = CARD_SUBTITLES[cardIndex];
			}
			headerBottom.textContent = subtitle;
		}

		// show only the active card
		this.elem.querySelectorAll('.card').forEach((c) => c.classList.remove('active'));
		const cardClasses = ['card-info', 'card-forecast', 'card-eats', 'card-shakedown'];
		this.elem.querySelector(`.${cardClasses[cardIndex]}`).classList.add('active');

		// swap background per card type
		const BG_CLASSES = ['bg-info', 'bg-forecast', 'bg-eats', 'bg-shakedown'];
		this.elem.classList.remove(...BG_CLASSES);
		this.elem.classList.add(BG_CLASSES[cardIndex]);

		// show/counter
		const DICKS_NIGHTS = ['2026-09-04', '2026-09-05', '2026-09-06'];
		const isDicks = show.venue.includes("Dick's");
		const dicksNight = DICKS_NIGHTS.indexOf(show.date) + 1;
		const counter = this.elem.querySelector('.show-counter');
		if (isDicks) {
			counter.innerHTML = `LABOR DAY RUN &nbsp;&middot;&nbsp; NIGHT ${dicksNight} OF 3`;
			counter.classList.add('dicks');
		} else {
			counter.innerHTML = `SHOW <span class="show-num">${showIndex + 1}</span> OF <span class="show-total">${this.data.shows.length}</span>`;
			counter.classList.remove('dicks');
		}

		if (cardIndex === 0) this.lastShowIndex = showIndex;

		switch (cardIndex) {
			case 0: this.renderInfo(show, isMSG); break;
			case 1: this.renderForecast(show); break;
			case 2: this.renderEats(show); break;
			case 3: this.renderShakedown(show); break;
			default: break;
		}

		this.finishDraw();
	}

	renderInfo(show, isMSG = false) {
		const card = this.elem.querySelector('.card-info');
		card.querySelector('.show-date').textContent = formatShowDate(show.date);
		const venueElem = card.querySelector('.show-venue');
		venueElem.textContent = show.venue;
		venueElem.classList.toggle('msg-glow', isMSG);
		card.querySelector('.show-city').textContent = `${show.city}, ${show.state}`;

		const policy = show.policy ?? {};
		card.querySelector('.policy-bottles').textContent = policy.water_bottles ?? 'Check venue website';
		card.querySelector('.policy-tubes').textContent = policy.poster_tubes ?? 'Check venue website';
		card.querySelector('.policy-water-station').textContent = policy.water_station ?? 'Check venue website';

		const BOTTLE_SPRITE = {
			'Factory-sealed only': 'policy-bottles-sealed.png',
			'Empty reusable or factory-sealed': 'policy-bottles-personal.png',
			'Factory-sealed or empty reusable (1 liter max)': 'policy-bottles-personal.png',
		};
		const WATER_SPRITE = {
			'Available': 'policy-water-station.png',
			'Water fountains': 'policy-water-fountain.png',
			'Water bottle filler': 'policy-water-filler.png',
		};
		const panels = card.querySelectorAll('.policy-panel');
		const setSpriteImg = (panel, filename) => {
			const img = panel?.querySelector('.pp-sprite img');
			if (!img) return;
			if (filename) {
				img.src = `images/icons/sprites/${filename}`;
				img.style.display = '';
			} else {
				img.style.display = 'none';
			}
		};
		setSpriteImg(panels[0], BOTTLE_SPRITE[policy.water_bottles]);
		setSpriteImg(panels[2], WATER_SPRITE[policy.water_station]);

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
		const panelsContainer = card.querySelector('.forecast-panels');
		panelsContainer.innerHTML = '';

		const noForecast = card.querySelector('.no-forecast');
		const fcst = show.forecast;

		if (!fcst?.length) {
			const daysOut = daysUntil(show.date);
			const daysUntilForecast = Math.max(0, daysOut - 14);
			noForecast.textContent = daysUntilForecast > 0
				? `FORECAST AVAILABLE IN ~${daysUntilForecast} DAYS`
				: 'FORECAST UNAVAILABLE';
			noForecast.style.display = '';
			return;
		}
		noForecast.style.display = 'none';

		fcst.forEach((day) => {
			const iconFile = WMO_ICON[day.wmo] ?? 'Sunny.gif';
			const block = this.fillTemplate('forecast-panel', {
				'fp-date': formatDayName(day.date),
				'fp-icon': { type: 'img', src: `images/icons/current-conditions/${iconFile}` },
				'fp-condition': WMO_DESC[day.wmo] ?? 'UNKNOWN',
				'fp-hi': Math.round(day.tempMax),
				'fp-lo': Math.round(day.tempMin),
			});
			panelsContainer.append(block);
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

const phishTour = new PhishTour(21, 'phish-tour');
registerDisplay(phishTour);
phishTour.getData();

// Dev: Shift+W toggles mock weather data for testing the forecast card layout
document.addEventListener('keydown', async (e) => {
	if (e.shiftKey && e.key === 'W') {
		phishTour.mockWeather = !phishTour.mockWeather;
		console.log(`[PhishTour] Mock weather: ${phishTour.mockWeather ? 'ON ✓' : 'OFF'}`);
		try {
			const data = await json(`/api/phish/summer-tour${phishTour.mockWeather ? '?mock=1' : ''}`);
			if (data?.shows?.length) {
				phishTour.data = data;
				// stay on current show's forecast card (cardIndex=1) to see the result immediately
				const showIndex = Math.floor(phishTour.screenIndex / CARDS_PER_SHOW);
				phishTour.screenIndex = showIndex * CARDS_PER_SHOW + 1;
				phishTour.drawCanvas();
			}
		} catch (err) {
			console.error('[PhishTour] Mock toggle fetch failed:', err);
		}
	}
});
