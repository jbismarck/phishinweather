// Layout editor — visual drag tool for positioning card content.
// Toggle with Shift+L. Escape to close.
// Drag the yellow line to set translateY on the active card's content element.

import { currentDisplay } from './navigation.mjs';

// Maps display elem IDs → the content selector controlled by translateY
const CONTENT_MAP = {
	'social-instagram-html': '.social-inner',
	'social-youtube-html':   '.social-inner',
	'social-reddit-html':    '.social-inner',
	'social-onlyfans-html':  '.social-inner',
	'support-html':          '.support-inner',
	'feature-vote-html':     '.fv-inner',
};

const HEADER_H      = 60;
const CONTENT_H     = 310;
const CONTENT_TOP   = HEADER_H;
const CONTENT_MID   = HEADER_H + Math.round(CONTENT_H / 2); // 215
const SCROLL_TOP    = HEADER_H + CONTENT_H;                 // 370
const DISPLAY_H     = 480;
const DISPLAY_W     = 640;

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
	if (!c) return 1;
	return c.getBoundingClientRect().width / DISPLAY_W;
}

function getActiveInfo() {
	const disp = currentDisplay();
	if (!disp) return null;
	const elemId = disp.elemId + '-html';
	const sel = CONTENT_MAP[elemId];
	if (!sel) return { name: disp.title ?? disp.elemId, elem: null };
	const elem = disp.elem?.querySelector(sel);
	return { name: disp.title ?? disp.elemId, elem: elem ?? null };
}

// ── build overlay ──────────────────────────────────────────────────────────

function css(el, styles) {
	Object.assign(el.style, styles);
}

function el(tag, styles = {}, text = '') {
	const e = document.createElement(tag);
	css(e, styles);
	if (text) e.textContent = text;
	return e;
}

function buildOverlay() {
	const wrap = el('div', {
		position: 'absolute', top: '0', left: '0',
		width: `${DISPLAY_W}px`, height: `${DISPLAY_H}px`,
		pointerEvents: 'none', zIndex: '9500',
		fontFamily: "'Star4000 Small', monospace",
	});
	wrap.id = 'layout-editor-overlay';

	// ── zone bands ────────────────────────────────────────────────────────
	const zones = [
		{ y: 0,          h: HEADER_H,  bg: 'rgba(255,220,0,0.06)',  label: `HEADER · ${HEADER_H}px` },
		{ y: CONTENT_TOP, h: CONTENT_H, bg: 'rgba(0,180,255,0.05)', label: `CONTENT · ${CONTENT_H}px` },
		{ y: SCROLL_TOP, h: 70,         bg: 'rgba(255,80,0,0.06)',  label: `SCROLL · 70px` },
	];
	zones.forEach(z => {
		const band = el('div', {
			position: 'absolute', left: '0', width: `${DISPLAY_W}px`,
			top: `${z.y}px`, height: `${z.h}px`,
			background: z.bg,
			borderTop: '1px solid rgba(255,255,255,0.1)',
			boxSizing: 'border-box',
		});
		const lbl = el('div', {
			position: 'absolute', right: '6px', top: '4px',
			fontSize: '9px', letterSpacing: '0.08em',
			color: 'rgba(255,255,255,0.3)',
		}, z.label);
		band.append(lbl);
		wrap.append(band);
	});

	// ── fixed boundary lines ───────────────────────────────────────────────
	[CONTENT_TOP, SCROLL_TOP].forEach(y => {
		wrap.append(el('div', {
			position: 'absolute', left: '0', width: `${DISPLAY_W}px`,
			top: `${y}px`, height: '1px',
			background: 'rgba(255,255,255,0.2)',
		}));
	});

	// ── ruler marks every 30px on left edge ───────────────────────────────
	for (let y = 0; y <= DISPLAY_H; y += 30) {
		const tick = el('div', {
			position: 'absolute', left: '0', width: '14px',
			top: `${y}px`, height: '1px',
			background: 'rgba(255,255,255,0.18)',
		});
		const tickLbl = el('div', {
			position: 'absolute', left: '16px',
			top: `${y - 7}px`,
			fontSize: '8px', color: 'rgba(255,255,255,0.25)',
		}, `${y}`);
		wrap.append(tick, tickLbl);
	}

	return wrap;
}

function buildHandle(handleY, contentElem, cardName) {
	// horizontal draggable line
	const line = el('div', {
		position: 'absolute', left: '0', width: `${DISPLAY_W}px`,
		top: `${handleY}px`, height: '2px',
		background: 'rgba(255,220,0,0.95)',
		pointerEvents: 'auto', cursor: 'ns-resize', zIndex: '9501',
	});
	line.id = 'layout-editor-handle';

	// pill badge showing value + card name
	const badge = el('div', {
		position: 'absolute', left: '50px', top: '-22px',
		padding: '3px 10px', background: 'rgba(255,220,0,0.95)',
		color: '#000', fontSize: '11px', letterSpacing: '0.06em',
		whiteSpace: 'nowrap', cursor: 'ns-resize', userSelect: 'none',
		borderRadius: '2px',
	});
	badge.id = 'layout-editor-badge';
	line.append(badge);

	// copy button
	const copyBtn = el('div', {
		position: 'absolute', right: '12px', top: '-20px',
		padding: '2px 8px', background: 'rgba(0,0,0,0.7)',
		border: '1px solid rgba(255,220,0,0.6)',
		color: 'rgba(255,220,0,0.9)', fontSize: '10px',
		cursor: 'pointer', userSelect: 'none',
	}, 'COPY');
	copyBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		const ty = getTranslateY(contentElem);
		navigator.clipboard?.writeText(`transform: translateY(${ty}px);`);
		copyBtn.textContent = 'COPIED';
		setTimeout(() => { copyBtn.textContent = 'COPY'; }, 1500);
	});
	line.append(copyBtn);

	updateBadge(handleY, cardName);
	makeDraggable(line, contentElem, cardName);
	return line;
}

function updateBadge(handleY, cardName) {
	const badge = document.getElementById('layout-editor-badge');
	if (!badge) return;
	const ty = handleY - CONTENT_MID;
	badge.textContent = `${cardName}  ·  translateY(${ty}px)  ·  Y:${handleY}px`;
}

function makeDraggable(line, contentElem, cardName) {
	let dragging = false, startMouseY = 0, startHandleY = 0;

	line.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return;
		dragging = true;
		startMouseY  = e.clientY;
		startHandleY = parseInt(line.style.top, 10);
		e.preventDefault();
	});

	const onMove = (e) => {
		if (!dragging) return;
		const scale = getContainerScale();
		const dy = (e.clientY - startMouseY) / scale;
		const newY = Math.round(startHandleY + dy);
		const clamped = Math.max(CONTENT_TOP, Math.min(SCROLL_TOP, newY));
		line.style.top = `${clamped}px`;
		setTranslateY(contentElem, clamped - CONTENT_MID);
		updateBadge(clamped, cardName);
	};

	const onUp = () => { dragging = false; };

	document.addEventListener('mousemove', onMove);
	document.addEventListener('mouseup',   onUp);
	line._cleanup = () => {
		document.removeEventListener('mousemove', onMove);
		document.removeEventListener('mouseup',   onUp);
	};
}

// ── status bar (shown when no content elem is mapped) ─────────────────────

function buildStatusBar(message) {
	return el('div', {
		position: 'absolute', bottom: '80px', left: '0', width: `${DISPLAY_W}px`,
		padding: '8px 0', textAlign: 'center',
		background: 'rgba(0,0,0,0.6)',
		color: 'rgba(255,220,0,0.8)', fontSize: '11px', letterSpacing: '0.08em',
		pointerEvents: 'none',
	}, message);
}

// ── public API ─────────────────────────────────────────────────────────────

function open() {
	close();

	const container = document.getElementById('container');
	if (!container) return;

	overlayElem = buildOverlay();

	const info = getActiveInfo();
	if (info?.elem) {
		const ty = getTranslateY(info.elem);
		const handleY = CONTENT_MID + ty;
		overlayElem.append(buildHandle(handleY, info.elem, info.name ?? ''));
	} else {
		const msg = info?.name
			? `${info.name.toUpperCase()} — not mapped (navigate to a supported card)`
			: 'Navigate to a card to edit its position';
		overlayElem.append(buildStatusBar(msg));
	}

	container.append(overlayElem);
	isOpen = true;
}

function close() {
	const handle = document.getElementById('layout-editor-handle');
	handle?._cleanup?.();
	overlayElem?.remove();
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
