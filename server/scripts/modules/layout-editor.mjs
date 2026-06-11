// Layout editor — visual drag tool for positioning card content.
// Toggle with Shift+L. Escape to close.
// Drag the yellow handle to set translateY on the active card's content element.

import { currentDisplay } from './navigation.mjs';

const CONTENT_MAP = {
	'social-instagram-html': '.social-inner',
	'social-youtube-html':   '.social-inner',
	'social-reddit-html':    '.social-inner',
	'social-onlyfans-html':  '.social-inner',
	'support-html':          '.support-inner',
	'feature-vote-html':     '.fv-inner',
};

const HEADER_H    = 60;
const CONTENT_H   = 310;
const CONTENT_MID = HEADER_H + Math.round(CONTENT_H / 2); // 215
const CONTENT_TOP = HEADER_H;
const SCROLL_TOP  = HEADER_H + CONTENT_H; // 370
const DISPLAY_H   = 480;
const DISPLAY_W   = 640;
const HIT_HALF    = 16; // px above/below the visual line that accepts clicks

let overlayElem = null;
let isOpen = false;

// ── helpers ────────────────────────────────────────────────────────────────

function getTranslateY(elem) {
	const t = window.getComputedStyle(elem).transform;
	if (!t || t === 'none') return 0;
	return Math.round(new DOMMatrix(t).m42);
}

function setTranslateY(elem, y) {
	elem.style.transform = `translateY(${y}px)`;
}

function getContainerScale() {
	const c = document.getElementById('container');
	return c ? c.getBoundingClientRect().width / DISPLAY_W : 1;
}

function getActiveInfo() {
	const disp = currentDisplay();
	if (!disp) return null;
	const elemId = disp.elemId + '-html';
	const sel = CONTENT_MAP[elemId];
	const elem = sel ? disp.elem?.querySelector(sel) : null;
	return { name: disp.name ?? disp.elemId, elem: elem ?? null };
}

function el(tag, styles = {}, text = '') {
	const e = document.createElement(tag);
	Object.assign(e.style, styles);
	if (text) e.textContent = text;
	return e;
}

// ── overlay background ─────────────────────────────────────────────────────

function buildBackground() {
	const wrap = el('div', {
		position: 'absolute', top: '0', left: '0',
		width: `${DISPLAY_W}px`, height: `${DISPLAY_H}px`,
		pointerEvents: 'none', zIndex: '9400',
		fontFamily: "'Star4000 Small', monospace",
	});

	const zones = [
		{ y: 0,          h: HEADER_H,  bg: 'rgba(255,220,0,0.07)', label: `HEADER  ${HEADER_H}px` },
		{ y: CONTENT_TOP, h: CONTENT_H, bg: 'rgba(0,180,255,0.05)', label: `CONTENT  ${CONTENT_H}px` },
		{ y: SCROLL_TOP, h: 70,         bg: 'rgba(255,80,0,0.07)',  label: `SCROLL  70px` },
	];

	zones.forEach(z => {
		const band = el('div', {
			position: 'absolute', left: '0', width: `${DISPLAY_W}px`,
			top: `${z.y}px`, height: `${z.h}px`,
			background: z.bg, borderTop: '1px solid rgba(255,255,255,0.1)',
			boxSizing: 'border-box',
		});
		band.append(el('div', {
			position: 'absolute', right: '6px', top: '4px',
			fontSize: '9px', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)',
		}, z.label));
		wrap.append(band);
	});

	// hard boundary lines
	[CONTENT_TOP, SCROLL_TOP].forEach(y => {
		wrap.append(el('div', {
			position: 'absolute', left: '0', width: `${DISPLAY_W}px`,
			top: `${y}px`, height: '1px', background: 'rgba(255,255,255,0.2)',
		}));
	});

	// ruler ticks every 30px
	for (let y = 0; y <= DISPLAY_H; y += 30) {
		wrap.append(el('div', {
			position: 'absolute', left: '0', width: '12px',
			top: `${y}px`, height: '1px', background: 'rgba(255,255,255,0.18)',
		}));
		wrap.append(el('div', {
			position: 'absolute', left: '15px', top: `${y - 7}px`,
			fontSize: '8px', color: 'rgba(255,255,255,0.22)',
		}, `${y}`));
	}

	return wrap;
}

// ── draggable handle ───────────────────────────────────────────────────────

function buildHandle(centerY, contentElem, cardName) {
	// Outer hit zone — 32px tall, centered on centerY, easy to click
	const hit = el('div', {
		position: 'absolute', left: '0', width: `${DISPLAY_W}px`,
		top: `${centerY - HIT_HALF}px`, height: `${HIT_HALF * 2}px`,
		pointerEvents: 'auto', cursor: 'ns-resize', zIndex: '9500',
		background: 'transparent',
	});
	hit.id = 'layout-editor-handle';

	// Visual 2px yellow line in the center of the hit zone
	hit.append(el('div', {
		position: 'absolute', left: '0', width: '100%',
		top: `${HIT_HALF - 1}px`, height: '2px',
		background: 'rgba(255,220,0,0.9)', pointerEvents: 'none',
	}));

	// Left grip — obvious drag target so user knows where to click
	const grip = el('div', {
		position: 'absolute', left: '6px',
		top: `${HIT_HALF - 10}px`, width: '20px', height: '20px',
		background: 'rgba(255,220,0,0.95)', borderRadius: '2px',
		display: 'flex', alignItems: 'center', justifyContent: 'center',
		cursor: 'ns-resize', pointerEvents: 'none',
		fontSize: '10px', color: '#000', lineHeight: '1',
	}, '⠿'); // braille dots as a drag grip icon

	hit.append(grip);

	// Value badge
	const badge = el('div', {
		position: 'absolute', left: '34px',
		top: `${HIT_HALF - 10}px`,
		padding: '2px 8px',
		background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,220,0,0.6)',
		color: 'rgba(255,220,0,0.9)', fontSize: '11px', letterSpacing: '0.05em',
		whiteSpace: 'nowrap', pointerEvents: 'none',
	});
	badge.id = 'layout-editor-badge';
	hit.append(badge);

	// Copy button
	const copyBtn = el('div', {
		position: 'absolute', right: '12px',
		top: `${HIT_HALF - 10}px`,
		padding: '2px 8px',
		background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,220,0,0.4)',
		color: 'rgba(255,220,0,0.7)', fontSize: '10px',
		cursor: 'pointer', userSelect: 'none', pointerEvents: 'auto',
	}, 'COPY');
	copyBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const ty = centerYToTranslateY(parseInt(hit.style.top, 10) + HIT_HALF);
		navigator.clipboard?.writeText(`transform: translateY(${ty}px);`);
		copyBtn.textContent = 'COPIED';
		setTimeout(() => { copyBtn.textContent = 'COPY'; }, 1500);
	});
	hit.append(copyBtn);

	updateBadge(centerY, cardName);
	makeDraggable(hit, contentElem, cardName);
	return hit;
}

function centerYToTranslateY(centerY) {
	return centerY - CONTENT_MID;
}

function updateBadge(centerY, cardName) {
	const badge = document.getElementById('layout-editor-badge');
	if (!badge) return;
	const ty = centerYToTranslateY(centerY);
	badge.textContent = `${cardName}  ·  translateY(${ty}px)  ·  y=${centerY}`;
}

function makeDraggable(hit, contentElem, cardName) {
	let dragging = false;
	let startClientY = 0;
	let startCenterY = 0;

	hit.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return;
		dragging = true;
		startClientY = e.clientY;
		startCenterY = parseInt(hit.style.top, 10) + HIT_HALF;
		e.preventDefault();
		e.stopPropagation();
	});

	const onMove = (e) => {
		if (!dragging) return;
		const scale = getContainerScale();
		const newCenter = Math.round(startCenterY + (e.clientY - startClientY) / scale);
		const clamped = Math.max(CONTENT_TOP, Math.min(SCROLL_TOP, newCenter));
		hit.style.top = `${clamped - HIT_HALF}px`;
		setTranslateY(contentElem, centerYToTranslateY(clamped));
		updateBadge(clamped, cardName);
	};

	const onUp = () => { dragging = false; };

	document.addEventListener('mousemove', onMove);
	document.addEventListener('mouseup', onUp);

	hit._cleanup = () => {
		document.removeEventListener('mousemove', onMove);
		document.removeEventListener('mouseup', onUp);
	};
}

// ── status message when no content elem is mapped ─────────────────────────

function buildStatusMsg(text) {
	const msg = el('div', {
		position: 'absolute', bottom: '80px', left: '0', width: `${DISPLAY_W}px`,
		padding: '8px 0', textAlign: 'center', pointerEvents: 'none',
		background: 'rgba(0,0,0,0.6)', color: 'rgba(255,220,0,0.7)',
		fontSize: '11px', letterSpacing: '0.08em',
	}, text);
	msg.style.zIndex = '9401';
	return msg;
}

// ── open / close ───────────────────────────────────────────────────────────

function open() {
	close();
	const container = document.getElementById('container');
	if (!container) return;

	const bg = buildBackground();
	container.append(bg);

	const info = getActiveInfo();
	if (info?.elem) {
		const ty = getTranslateY(info.elem);
		const centerY = CONTENT_MID + ty;
		const handle = buildHandle(centerY, info.elem, info.name ?? '');
		container.append(handle);
		overlayElem = { bg, handle };
	} else {
		const msg = info
			? `${(info.name ?? '').toUpperCase()}  —  navigate to a supported card to edit`
			: 'Navigate to a supported card to edit its position';
		bg.append(buildStatusMsg(msg));
		overlayElem = { bg, handle: null };
	}

	isOpen = true;
}

function close() {
	if (!overlayElem) { isOpen = false; return; }
	overlayElem.handle?._cleanup?.();
	overlayElem.handle?.remove();
	overlayElem.bg?.remove();
	overlayElem = null;
	isOpen = false;
}

export function toggleLayoutEditor() {
	isOpen ? close() : open();
}

// ── keyboard ───────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
	if (e.shiftKey && e.key === 'L') { e.preventDefault(); toggleLayoutEditor(); }
	if (e.key === 'Escape' && isOpen) close();
});
