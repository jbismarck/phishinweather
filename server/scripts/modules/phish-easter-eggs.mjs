import { currentDisplay, displayNavMessage, msg } from './navigation.mjs';
import { gamehendgeWeather } from './gamehendge-weather.mjs';

const HFB = [
	'ICCULUS IS WATCHING — SEEK AND YE SHALL FIND THE HELPING FRIENDLY BOOK',
	"IT'S ICE. ALL ICE. EVERYTHING IS ICE. BRILLIANT.",
	'THE LIZARDS ARE THE MASTERS OF THE WIND AND SKY — BOW DOWN',
	'WASH UFFIZE DRIVE ME TO FIRENZE',
	'YOU CAN FEEL GOOD ABOUT HOOD',
	'SIMPLE — SOMETIMES THE ANSWER IS SO SIMPLE',
	'WILSON! YOUR EVIL WAYS ARE KNOWN THROUGHOUT THE LAND',
	'WHAT IS THIS FATE? WHAT STRANGE DESIGN? THE HELPING FRIENDLY BOOK IS MINE',
	'46 DAYS — FORTY SIX DAYS UNTIL THE GREAT WENT',
	'THE HELPING FRIENDLY BOOK CONTAINS ALL THE KNOWLEDGE OF THE UNIVERSE',
	'RHOMBUS — NEVER FORGET THE RHOMBUS',
	'GAMEHENDGE: A PLACE BEYOND THE RANGES OF IMAGINATION',
];

let hfbIdx = 0;

export const setHFBScroll = (elem) => {
	setTimeout(() => {
		const fixed = elem?.querySelector('.scroll .fixed');
		if (fixed) fixed.textContent = HFB[hfbIdx++ % HFB.length];
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
