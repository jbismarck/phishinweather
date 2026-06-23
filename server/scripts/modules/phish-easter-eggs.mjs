import { currentDisplay, displayNavMessage, msg } from './navigation.mjs';
import { gamehendgeWeather } from './gamehendge-weather.mjs';
import { addScreen } from './currentweatherscroll.mjs';
import { whenMediaReady, getCurrentTrackUrl } from './media.mjs';

let HFB = [];
fetch('/api/hfb-quotes').then((r) => r.json()).then((q) => { HFB = q; }).catch(() => {});

let shoutouts = [];
const fetchShoutouts = () => {
	fetch('/api/shoutouts').then((r) => r.json()).then((s) => { shoutouts = s; }).catch(() => {});
};
fetchShoutouts();
setInterval(fetchShoutouts, 5 * 60 * 1000);

let hfbIdx = 0;
let nowPlayingDate = '';
let titleByUrl = new Map();

const formatShowDate = (d) => {
	const [yr, mm, dd] = d.split('-');
	const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][+mm - 1];
	return `${mon} ${+dd} ${yr}`;
};

// Fetch track metadata for the now-playing scroller display.
// media.mjs already loaded the phish.in playlist — don't inject again or it aborts play().
whenMediaReady(async () => {
	try {
		const r = await fetch('/api/phish/on-this-day');
		const data = await r.json();
		if (data.featured?.tracks?.length) {
			nowPlayingDate = data.featured.date;
			titleByUrl = new Map(data.featured.tracks.map(({ mp3, title }) => [mp3, title]));
		}
	} catch (e) {
		console.error('Daily music fetch failed:', e);
	}
});

// Inject HFB quotes into the main weather scroll cycle (every ~4 screens)
addScreen(() => ({ type: 'scroll', text: HFB[hfbIdx++ % HFB.length] }));
addScreen(() => ({ type: 'scroll', text: HFB[hfbIdx++ % HFB.length] }));

// Ko-fi supporter shoutouts — rotate through list, one per scroller cycle
let shoutoutIdx = 0;
addScreen(() => {
	if (!shoutouts.length) return false;
	const s = shoutouts[shoutoutIdx++ % shoutouts.length];
	return { type: 'scroll', text: `♥ ${s.name}: ${s.message}` };
});

// Now-playing screen: show date + current track title
addScreen(() => {
	if (!document.getElementById('ToggleMedia')?.classList.contains('playing')) return false;
	const url = getCurrentTrackUrl();
	const title = url ? titleByUrl.get(url) : null;
	if (!title || !nowPlayingDate) return false;
	return { type: 'scroll', text: `♪ ${formatShowDate(nowPlayingDate)}  ${title.toUpperCase()}` };
});

// Used by the Gamehendge overlay (Shift+G) which doesn't go through the main scroller
export const setHFBScroll = (elem) => {
	setTimeout(() => {
		const fixed = elem?.querySelector('.scroll .fixed');
		if (!fixed) return;
		const text = HFB[hfbIdx++ % HFB.length];

		const scrollEl = document.createElement('div');
		scrollEl.classList.add('scroll-area');
		scrollEl.textContent = text;
		scrollEl.style.left = '0px';

		fixed.innerHTML = '';
		fixed.append(scrollEl);

		const scrollDistance = Math.max(scrollEl.scrollWidth - fixed.clientWidth, 0);
		const scrollTime = scrollDistance / 75;
		scrollEl.style.transition = `left linear ${scrollTime.toFixed(1)}s`;

		setTimeout(() => {
			scrollEl.style.left = `-${scrollDistance.toFixed(0)}px`;
		}, 1000);
	}, 150);
};

// ── 5:55 overlay ──────────────────────────────────────────────────────────────

let lastFiredKey = '';

const build555 = () => {
	const el = document.createElement('div');
	el.id = 'phish-555-overlay';
	el.innerHTML = '<div class="o-num">5:55</div><div class="o-sub">&#9654;&#9654; FIVE FIFTY FIVE &#9664;&#9664;</div>';
	el.addEventListener('click', () => el.classList.remove('active'));
	document.body.append(el);
	return el;
};

const show555 = () => {
	const el = document.getElementById('phish-555-overlay') ?? build555();
	el.classList.add('active');
	setTimeout(() => el.classList.remove('active'), 30000);
};

setInterval(() => {
	const now = new Date();
	const h = now.getHours();
	const m = now.getMinutes();
	const key = `${now.getDate()}-${h}-${m}`;
	if ((h === 5 || h === 17) && m === 55 && key !== lastFiredKey) {
		lastFiredKey = key;
		show555();
	}
}, 10000);

// ── Gamehendge toggle (Shift+G) ───────────────────────────────────────────────

document.addEventListener('keydown', async (e) => {
	if (e.shiftKey && e.key === 'G') {
		if (gamehendgeWeather.active) {
			gamehendgeWeather.hideCanvas();
			displayNavMessage({ type: msg.response.next });
		} else {
			currentDisplay()?.hideCanvas();
			gamehendgeWeather.showCanvas();
			await gamehendgeWeather.drawCanvas();
			setHFBScroll(gamehendgeWeather.elem);
		}
	}

	if (e.key === 'Escape') {
		document.getElementById('phish-555-overlay')?.classList.remove('active');
	}
});
