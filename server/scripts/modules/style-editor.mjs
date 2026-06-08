// Dev-only floating style editor for Phish displays. Toggle with Shift+E.

const H  = '.weather-display .main.phish-history';
const CD = '.weather-display .main.phish-countdown';
const PT = '.weather-display .main.phish-tour';

// unit:'' → line-height (step 0.05), 'pt' → step 0.5, 'px' → step 1
const fs  = (id, label, sel, def, min = 8, max = 36) => ({ id, label, sel, prop: 'font-size',     unit: 'pt', def, min, max });
const lh  = (id, label, sel, def)                     => ({ id, label, sel, prop: 'line-height',   unit: '',   def, min: 0.7, max: 2.5 });
const mt  = (id, label, sel, def, min = -10, max = 40) => ({ id, label, sel, prop: 'margin-top',    unit: 'px', def, min, max });
const mb  = (id, label, sel, def, min = 0, max = 40)  => ({ id, label, sel, prop: 'margin-bottom', unit: 'px', def, min, max });
const pt  = (id, label, sel, def, min = 0, max = 40)  => ({ id, label, sel, prop: 'padding-top',   unit: 'px', def, min, max });
const pl  = (id, label, sel, def, min = 0, max = 60)  => ({ id, label, sel, prop: 'padding-left',  unit: 'px', def, min, max });
const wd  = (id, label, sel, def, min = 20, max = 240) => ({ id, label, sel, prop: 'width',         unit: 'px', def, min, max });

const GROUPS = [
	// ── PHISH HISTORY ──────────────────────────────────────────────────────
	{
		label: 'HISTORY',
		controls: [
			fs('h-year-fs',   'Year fs',        `${H} .year`,       16),
			lh('h-year-lh',   'Year line-ht',   `${H} .year`,       1.1),
			fs('h-venue-fs',  'Venue fs',       `${H} .venue`,      16),
			lh('h-venue-lh',  'Venue line-ht',  `${H} .venue`,      1.2),
			fs('h-loc-fs',    'Location fs',    `${H} .location`,   14),
			lh('h-loc-lh',    'Location line-ht', `${H} .location`, 1.2),
			mb('h-loc-mb',    'Location gap ↓', `${H} .location`,   6),
			fs('h-seth-fs',   'Set Header fs',  `${H} .set-header`, 16),
			lh('h-seth-lh',   'Set Hdr line-ht', `${H} .set-header`, 1.3),
			mt('h-seth-mt',   'Set Hdr gap ↑',  `${H} .set-header`, 4, 0),
			fs('h-song-fs',   'Song fs',        `${H} .song`,       16),
			lh('h-song-lh',   'Song line-ht',   `${H} .song`,       1.3),
			pl('h-song-ind',  'Song indent',    `${H} .song`,       18),
			mb('h-hdr-mb',    'Header gap ↓',   `${H} .show-header`, 4),
			pt('h-show-pt',   'Show pad top',   `${H} .show`,       6),
			pl('h-show-pl',   'Show pad sides', `${H} .show`,       20),
		],
	},

	// ── PHISH COUNTDOWN — SHARED ───────────────────────────────────────────
	{
		label: 'COUNTDOWN — SHARED',
		controls: [
			pt('cd-pad-top',  'Container top',  CD,                 30),
			pl('cd-pad-side', 'Container sides', CD,                20),
			fs('cd-name-fs',  'Event Name fs',  `${CD} .event-name`, 23, 10, 60),
			lh('cd-name-lh',  'Event Name lh',  `${CD} .event-name`, 1.2),
			mb('cd-name-mb',  'Event Name gap', `${CD} .event-name`, 40),
			fs('cd-dates-fs', 'Dates fs',       `${CD} .event-dates`, 16),
			mt('cd-dates-mt', 'Dates gap ↑',    `${CD} .event-dates`, 1, 0),
			fs('cd-note-fs',  'Note fs',        `${CD} .event-note`, 14.5),
			lh('cd-note-lh',  'Note line-ht',   `${CD} .event-note`, 0.7),
			mt('cd-note-mt',  'Note gap ↑',     `${CD} .event-note`, 4, 0),
			mb('cd-div-mt',   'Divider spacing', `${CD} .divider-bar`, 23),
		],
	},

	// ── PHISH COUNTDOWN — DATE CARD ────────────────────────────────────────
	{
		label: 'COUNTDOWN — DATE CARD',
		controls: [
			mt('cd-blk-mt',   'Count block top',   `${CD} .count-block`,  6, 0),
			fs('cd-val-fs',   'Numbers fs',         `${CD} .count-val`,   48, 20, 100),
			lh('cd-val-lh',   'Numbers lh',         `${CD} .count-val`,   1.0),
			fs('cd-lbl-fs',   'Labels fs',          `${CD} .count-lbl`,   12, 6, 24),
			mt('cd-lbl-mt',   'Labels gap ↑',       `${CD} .count-lbl`,   2, 0),
		],
	},

	// ── PHISH COUNTDOWN — TONIGHT ──────────────────────────────────────────
	{
		label: 'COUNTDOWN — TONIGHT',
		controls: [
			fs('cd-tn-fs',    'TONIGHT! fs',      `${CD} .tonight-banner`, 50, 20, 80),
			lh('cd-tn-lh',    'TONIGHT! lh',      `${CD} .tonight-banner`, 1.1),
			mt('cd-tn-mt',    'TONIGHT! top',     `${CD} .tonight-banner`, 16, 0),
			mb('cd-tn-mb',    'TONIGHT! bottom',  `${CD} .tonight-banner`, 10),
		],
	},

	// ── PHISH COUNTDOWN — TBA CARD ─────────────────────────────────────────
	{
		label: 'COUNTDOWN — TBA CARD',
		controls: [
			fs('cd-tba-lbl-fs',  'TBA Label fs',    `${CD} .tba-label`,    18, 10, 40),
			mt('cd-tba-lbl-mt',  'TBA Label top',   `${CD} .tba-label`,    10, 0),
			mb('cd-tba-lbl-mb',  'TBA Label bottom', `${CD} .tba-label`,   4),
			fs('cd-tba-exp-fs',  'Expected text fs', `${CD} .tba-expected`, 13),
			lh('cd-tba-exp-lh',  'Expected lh',     `${CD} .tba-expected`, 1.35),
		],
	},

	// ── PHISH TOUR — INFO CARD ─────────────────────────────────────────────
	{
		label: 'TOUR — INFO CARD',
		controls: [
			pt('pt-pad-top',    'Container top',   PT,                      4),
			pl('pt-pad-side',   'Container sides', PT,                      16),
			fs('pt-date-fs',    'Show Date fs',    `${PT} .show-date`,      20),
			lh('pt-date-lh',    'Show Date lh',    `${PT} .show-date`,      1.2),
			mt('pt-date-mt',    'Show Date top',   `${PT} .show-date`,      8, 0),
			fs('pt-cntdn-fs',   'Countdown fs',    `${PT} .show-countdown`, 16),
			mt('pt-cntdn-mt',   'Countdown top',   `${PT} .show-countdown`, 2, 0),
			fs('pt-venue-fs',   'Venue fs',        `${PT} .show-venue`,     19),
			lh('pt-venue-lh',   'Venue lh',        `${PT} .show-venue`,     1.25),
			mt('pt-venue-mt',   'Venue top',       `${PT} .show-venue`,     10, 0),
			fs('pt-city-fs',    'City fs',         `${PT} .show-city`,      17),
			lh('pt-city-lh',    'City lh',         `${PT} .show-city`,      1.3),
			mt('pt-city-mt',    'City top',        `${PT} .show-city`,      3, 0),
			mt('pt-pol-mt',     'Policy row top',  `${PT} .policy-row`,     6, 0),
			fs('pt-pol-lbl-fs', 'Policy label fs', `${PT} .policy-label`,   12),
			wd('pt-pol-lbl-w',  'Policy label w',  `${PT} .policy-label`,   72),
			fs('pt-pol-val-fs', 'Policy value fs', `${PT} .policy-bottles, ${PT} .policy-tubes`, 13),
			fs('pt-ctr-fs',     'Show counter fs', `${PT} .show-counter`,   13),
			mt('pt-ctr-mt',     'Counter top',     `${PT} .show-counter`,   8, 0),
		],
	},

	// ── PHISH TOUR — FORECAST CARD ─────────────────────────────────────────
	{
		label: 'TOUR — FORECAST CARD',
		controls: [
			fs('pt-fc-date-fs',  'Day name fs',     `${PT} .fp-date`,         24),
			fs('pt-fc-cond-fs',  'Condition fs',    `${PT} .fp-condition`,    24),
			fs('pt-fc-lbl2-fs',  'Hi/Lo labels fs', `${PT} .fp-label`,        24),
			fs('pt-fc-val-fs',   'Hi/Lo values fs', `${PT} .fp-value`,        24),
			wd('pt-fc-pan-w',    'Panel width',     `${PT} .forecast-panel`,  155, 100, 220),
		],
	},

	// ── PHISH TOUR — EATS CARD ─────────────────────────────────────────────
	{
		label: 'TOUR — EATS CARD',
		controls: [
			fs('pt-eh-fs',    'Header fs',       `${PT} .eats-header`,  26),
			mt('pt-eh-mt',    'Header top',      `${PT} .eats-header`,  24, 0),
			mb('pt-eh-mb',    'Header bottom',   `${PT} .eats-header`,  35),
			fs('pt-ev-fs',    'City tag fs',     `${PT} .eats-venue`,   14),
			mb('pt-ei-mb',    'Item gap ↓',      `${PT} .eat-item`,     8),
			fs('pt-enm-fs',   'Eat name fs',     `${PT} .eat-name`,     15),
			lh('pt-enm-lh',   'Eat name lh',     `${PT} .eat-name`,     1.2),
			fs('pt-ety-fs',   'Eat type fs',     `${PT} .eat-type`,     15),
			fs('pt-ent-fs',   'Eat note fs',     `${PT} .eat-note`,     12),
			lh('pt-ent-lh',   'Eat note lh',     `${PT} .eat-note`,     1.2),
			pl('pt-ent-pl',   'Note indent',     `${PT} .eat-note`,     10),
		],
	},

	// ── PHISH TOUR — SHAKEDOWN CARD ────────────────────────────────────────
	{
		label: 'TOUR — SHAKEDOWN CARD',
		controls: [
			fs('pt-sd-ttl-fs',  'Title fs',        `${PT} .shakedown-title`,       16, 10, 40),
			lh('pt-sd-ttl-lh',  'Title lh',        `${PT} .shakedown-title`,       1.35),
			mt('pt-sd-ttl-mt',  'Title top',       `${PT} .shakedown-title`,       25, 0),
			fs('pt-sd-ven-fs',  'Venue fs',        `${PT} .sd-venue`,              18.5),
			lh('pt-sd-ven-lh',  'Venue lh',        `${PT} .sd-venue`,              1.25),
			mb('pt-sd-ven-mb',  'Venue gap ↓',     `${PT} .sd-venue`,              28),
			fs('pt-sd-lbl-fs',  'Label fs',        `${PT} .sd-label`,              13),
			wd('pt-sd-lbl-w',   'Label width',     `${PT} .sd-label`,              90),
			fs('pt-sd-loc-fs',  'Location fs',     `${PT} .sd-location, ${PT} .sd-parking`, 15),
			lh('pt-sd-loc-lh',  'Location lh',     `${PT} .sd-location, ${PT} .sd-parking`, 1.3),
			mb('pt-sd-row-mb',  'Row gap ↓',       `${PT} .sd-row`,                8),
			mt('pt-sd-tip-mt',  'Tip section top', `${PT} .sd-tip-wrap`,           12, 0),
			fs('pt-sd-tip-fs',  'Tip fs',          `${PT} .sd-tip`,                14),
			lh('pt-sd-tip-lh',  'Tip lh',          `${PT} .sd-tip`,                1.4),
		],
	},
];

// ── Scale Groups (compound proportional controls) ─────────────────────────────
const SCALE_GROUPS = [
	{
		id: 'sg-countdown',
		label: 'Countdown Numbers',
		targets: [
			{ id: 'cd-num-fs',  base: 60 },
			{ id: 'cd-unit-fs', base: 22 },
			{ id: 'cd-sub-fs',  base: 16 },
		],
	},
	{
		id: 'sg-history',
		label: 'History Text',
		targets: [
			{ id: 'h-year-fs',  base: 16 },
			{ id: 'h-venue-fs', base: 16 },
			{ id: 'h-loc-fs',   base: 14 },
			{ id: 'h-seth-fs',  base: 16 },
			{ id: 'h-song-fs',  base: 16 },
		],
	},
	{
		id: 'sg-tour-info',
		label: 'Tour Info Text',
		targets: [
			{ id: 'pt-date-fs',  base: 20 },
			{ id: 'pt-venue-fs', base: 19 },
			{ id: 'pt-city-fs',  base: 17 },
		],
	},
];

// ── Selector → control map (for inspect mode) ─────────────────────────────────
const selectorMap = [];
for (const g of GROUPS) {
	for (const c of g.controls) {
		c.sel.split(',').map((s) => s.trim()).forEach((s) => {
			selectorMap.push({ sel: s, ctrl: c, groupLabel: g.label });
		});
	}
}

// ── Engine ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'phish-style-editor-v2';
const STYLE_ID    = 'phish-style-editor-overrides';

let panel      = null;
let overlay    = null;
let visible    = false;
let inspecting = false;
let values     = {};

const STALE_KEYS = [
	'cd-num-fs', 'cd-num-lh',
	'cd-unit-fs', 'cd-unit-mt',
	'cd-sub-fs', 'cd-sub-mt',
];

const load = () => {
	try { values = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { values = {}; }
	let dirty = false;
	STALE_KEYS.forEach((k) => { if (k in values) { delete values[k]; dirty = true; } });
	if (dirty) localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
};
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
const val  = (c) => values[c.id] ?? c.def;

const step = (c) => c.unit === '' ? 0.05 : c.unit === 'pt' ? 0.5 : 1;

const applyStyles = () => {
	let css = '';
	for (const g of GROUPS) {
		for (const c of g.controls) {
			if (val(c) !== c.def) css += `${c.sel} { ${c.prop}: ${val(c)}${c.unit} !important; }\n`;
		}
	}
	let tag = document.getElementById(STYLE_ID);
	if (!tag) { tag = document.createElement('style'); tag.id = STYLE_ID; document.head.append(tag); }
	tag.textContent = css;
};

const syncInputs = (el, c, v) => {
	el.querySelector(`#se-${c.id}-r`).value = v;
	el.querySelector(`#se-${c.id}-n`).value = v;
};

// Shared update logic; call applyStyles() after all batch updates
const updateCtrlValue = (el, c, v) => {
	const s = step(c);
	const clamped = Math.round(Math.min(c.max, Math.max(c.min, parseFloat(v) || c.def)) / s) * s;
	const rounded = Math.round(clamped * 1000) / 1000;
	el.querySelector(`#se-${c.id}-r`).value = rounded;
	el.querySelector(`#se-${c.id}-n`).value = rounded;
	if (rounded !== c.def) values[c.id] = rounded;
	else delete values[c.id];
	return rounded;
};

// ── Inspect mode helpers ─────────────────────────────────────────────────────

const findInspectMatch = (target) => {
	let el = target;
	while (el && el !== document.body) {
		for (const entry of selectorMap) {
			try {
				if (el.matches(entry.sel)) return { el, ...entry };
			} catch { /* ignore invalid selectors */ }
		}
		el = el.parentElement;
	}
	return null;
};

const hideOverlay = () => { if (overlay) overlay.style.display = 'none'; };

const showOverlayAt = (matchEl, label) => {
	const r = matchEl.getBoundingClientRect();
	overlay.style.cssText = `display:block;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
	overlay.querySelector('.se-overlay-label').textContent = label;
};

// ── Build HTML ───────────────────────────────────────────────────────────────

const rowHTML = (c) => `
<div class="se-row" id="se-${c.id}-row">
	<label title="${c.prop}: ${c.def}${c.unit}">${c.label}</label>
	<input type="range"  id="se-${c.id}-r" min="${c.min}" max="${c.max}" step="${step(c)}" value="${val(c)}" />
	<input type="number" id="se-${c.id}-n" min="${c.min}" max="${c.max}" step="${step(c)}" value="${val(c)}" />
	<span class="se-unit">${c.unit || 'x'}</span>
	<button class="se-1r" data-id="${c.id}" title="Reset to ${c.def}${c.unit}">↩</button>
</div>`;

const groupHTML = (g) => `
<details>
	<summary>${g.label} <span class="se-gcnt">(${g.controls.length})</span></summary>
	<div class="se-group">${g.controls.map(rowHTML).join('')}</div>
</details>`;

const scaleGroupsHTML = () => {
	const scaleVal = (sg) => values[sg.id] ?? 1.0;
	const rows = SCALE_GROUPS.map((sg) => `
<div class="se-row" data-sg="${sg.id}">
	<label title="Scales ${sg.targets.map((t) => t.id).join(', ')}">${sg.label}</label>
	<input type="range"  id="${sg.id}-r" min="0.5" max="2.0" step="0.05" value="${scaleVal(sg)}" />
	<input type="number" id="${sg.id}-n" min="0.5" max="2.0" step="0.05" value="${scaleVal(sg)}" />
	<span class="se-unit">×</span>
	<button class="se-1r" data-sg="${sg.id}" title="Reset scale">↩</button>
</div>`).join('');
	return `
<details>
	<summary>SCALE GROUPS <span class="se-gcnt">(${SCALE_GROUPS.length})</span></summary>
	<div class="se-group">${rows}</div>
</details>`;
};

// ── Styles ───────────────────────────────────────────────────────────────────

const PANEL_CSS = `
#phish-style-editor {
	position:fixed; top:60px; right:12px; width:340px; max-height:84vh;
	background:#1a1a1a; border:1px solid #484848; color:#eee;
	font-family:monospace; font-size:12px; z-index:99999;
	border-radius:4px; box-shadow:0 4px 28px rgba(0,0,0,.9);
	display:flex; flex-direction:column;
}
#phish-style-editor .se-header {
	display:flex; justify-content:space-between; align-items:center;
	padding:7px 10px; background:#212121; border-bottom:1px solid #3a3a3a;
	cursor:grab; border-radius:4px 4px 0 0;
	font-weight:bold; letter-spacing:1.5px; color:#f0c040; font-size:11px;
	user-select:none;
}
#phish-style-editor .se-header:active { cursor:grabbing; }
#phish-style-editor .se-header-right { display:flex; gap:4px; align-items:center; }
#phish-style-editor .se-inspect {
	background:none; border:1px solid #444; color:#777; cursor:pointer;
	font-size:10px; padding:2px 5px; border-radius:2px; line-height:1;
	font-family:monospace; letter-spacing:0.5px;
}
#phish-style-editor .se-inspect:hover { color:#f0c040; border-color:#f0c040; }
#phish-style-editor .se-inspect.active { color:#f0c040; border-color:#f0c040; background:rgba(240,192,64,.12); }
#phish-style-editor .se-close {
	background:none; border:none; color:#777; cursor:pointer; font-size:14px; padding:0 2px; line-height:1;
}
#phish-style-editor .se-close:hover { color:#fff; }
#phish-style-editor .se-body { overflow-y:auto; flex:1; }
#phish-style-editor details { border-bottom:1px solid #252525; }
#phish-style-editor summary {
	padding:5px 10px; cursor:pointer;
	color:#f0c040; letter-spacing:0.8px; font-size:10px; font-weight:bold;
	list-style:none; display:flex; align-items:center; gap:4px;
	user-select:none;
}
#phish-style-editor summary::-webkit-details-marker { display:none; }
#phish-style-editor summary::before { content:'▶'; font-size:7px; flex-shrink:0; transition:transform .12s; }
#phish-style-editor details[open] summary::before { transform:rotate(90deg); }
#phish-style-editor summary:hover { background:#222; }
#phish-style-editor .se-gcnt { color:#555; font-weight:normal; margin-left:auto; font-size:9px; }
#phish-style-editor .se-group { padding:2px 8px 8px; }
#phish-style-editor .se-row {
	display:grid; grid-template-columns:90px 1fr 42px 16px 16px;
	align-items:center; gap:3px; margin-bottom:3px;
}
#phish-style-editor .se-row label {
	font-size:10px; color:#aaa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:default;
}
#phish-style-editor input[type=range] { width:100%; cursor:pointer; accent-color:#f0c040; }
#phish-style-editor input[type=number] {
	width:100%; background:#111; border:1px solid #3a3a3a; color:#eee;
	font-size:11px; padding:1px 3px; text-align:right;
	-moz-appearance:textfield; border-radius:2px;
}
#phish-style-editor input[type=number]::-webkit-inner-spin-button { display:none; }
#phish-style-editor .se-unit { font-size:9px; color:#555; text-align:left; }
#phish-style-editor .se-1r {
	background:none; border:none; color:#444; cursor:pointer; font-size:11px; padding:0; line-height:1;
}
#phish-style-editor .se-1r:hover { color:#f0c040; }
#phish-style-editor .se-footer {
	display:flex; gap:6px; padding:7px 10px; border-top:1px solid #2a2a2a;
}
#phish-style-editor .se-footer button {
	flex:1; padding:5px; background:#1e1e1e; border:1px solid #3a3a3a;
	color:#bbb; cursor:pointer; font-family:monospace; font-size:11px; border-radius:2px;
}
#phish-style-editor .se-footer button:hover { border-color:#f0c040; color:#f0c040; }
#phish-style-editor .se-copy.copied { border-color:#4f4 !important; color:#4f4 !important; }
#phish-style-editor .se-hint {
	padding:3px 10px 5px; font-size:10px; color:#444; text-align:center;
}
@keyframes se-flash {
	0%, 100% { background: transparent; }
	50% { background: rgba(240,192,64,.22); }
}
#phish-style-editor .se-row.se-flash { animation: se-flash .65s ease 2; border-radius:2px; }

#se-overlay {
	display:none; position:fixed; pointer-events:none; z-index:99998;
	border:2px solid #f0c040; background:rgba(240,192,64,.08);
	box-sizing:border-box;
}
#se-overlay .se-overlay-label {
	position:absolute; bottom:3px; left:4px;
	background:rgba(0,0,0,.8); color:#f0c040;
	font-size:10px; font-family:monospace; padding:1px 5px;
	border-radius:2px; pointer-events:none;
	max-width:calc(100% - 8px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
body.se-inspecting .weather-display { cursor:crosshair !important; }
body.se-inspecting .weather-display * { cursor:crosshair !important; }
`;

// ── Build & wire panel ────────────────────────────────────────────────────────

const buildPanel = () => {
	const styleTag = document.createElement('style');
	styleTag.textContent = PANEL_CSS;
	document.head.append(styleTag);

	// create overlay (appended to body, outside panel)
	overlay = document.createElement('div');
	overlay.id = 'se-overlay';
	overlay.innerHTML = '<div class="se-overlay-label"></div>';
	document.body.append(overlay);

	const el = document.createElement('div');
	el.id = 'phish-style-editor';
	el.innerHTML = `
		<div class="se-header">
			<span>✦ STYLE EDITOR</span>
			<div class="se-header-right">
				<button class="se-inspect" title="Inspect mode — hover elements to find controls">INSPECT</button>
				<button class="se-close" title="Close (Shift+E)">✕</button>
			</div>
		</div>
		<div class="se-body">${scaleGroupsHTML()}${GROUPS.map(groupHTML).join('')}</div>
		<div class="se-footer">
			<button class="se-reset-all">Reset All</button>
			<button class="se-copy">Copy SCSS</button>
		</div>
		<div class="se-hint">Shift+E to toggle · hover label for default</div>
	`;
	return el;
};

const wirePanel = (el) => {
	el.querySelector('.se-close').addEventListener('click', toggle);

	// ── Inspect mode ────────────────────────────────────────────────────────
	const inspectBtn = el.querySelector('.se-inspect');
	inspectBtn.addEventListener('click', () => {
		inspecting = !inspecting;
		inspectBtn.classList.toggle('active', inspecting);
		document.body.classList.toggle('se-inspecting', inspecting);
		if (!inspecting) hideOverlay();
	});

	document.addEventListener('mousemove', (e) => {
		if (!inspecting) return;
		if (e.target.closest('#phish-style-editor') || e.target.closest('#se-overlay')) {
			hideOverlay();
			return;
		}
		const match = findInspectMatch(e.target);
		if (match) {
			showOverlayAt(match.el, `${match.ctrl.label} · ${match.groupLabel}`);
		} else {
			hideOverlay();
		}
	});

	document.addEventListener('click', (e) => {
		if (!inspecting) return;
		if (e.target.closest('#phish-style-editor')) return;
		e.preventDefault();
		e.stopPropagation();

		const match = findInspectMatch(e.target);
		if (!match) return;

		// Open the matching group details
		const details = [...el.querySelectorAll('details')].find((d) =>
			d.querySelector('summary')?.textContent.trim().startsWith(match.groupLabel),
		);
		if (details) {
			details.open = true;
			const row = el.querySelector(`#se-${match.ctrl.id}-row`);
			if (row) {
				row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
				row.classList.add('se-flash');
				setTimeout(() => row.classList.remove('se-flash'), 1500);
			}
		}
	}, true); // capture phase so we get it before nav handlers

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && inspecting) {
			inspecting = false;
			inspectBtn.classList.remove('active');
			document.body.classList.remove('se-inspecting');
			hideOverlay();
		}
	});

	// ── Reset All ───────────────────────────────────────────────────────────
	el.querySelector('.se-reset-all').addEventListener('click', () => {
		values = {};
		save();
		applyStyles();
		for (const g of GROUPS) for (const c of g.controls) syncInputs(el, c, c.def);
		for (const sg of SCALE_GROUPS) {
			el.querySelector(`#${sg.id}-r`).value = 1.0;
			el.querySelector(`#${sg.id}-n`).value = 1.0;
		}
	});

	// ── Copy SCSS ───────────────────────────────────────────────────────────
	el.querySelector('.se-copy').addEventListener('click', () => {
		const lines = [];
		for (const g of GROUPS) {
			const changed = g.controls.filter((c) => val(c) !== c.def);
			if (!changed.length) continue;
			lines.push(`// ${g.label}`);
			for (const c of changed) lines.push(`${c.sel} { ${c.prop}: ${val(c)}${c.unit}; }`);
		}
		const text = lines.length ? lines.join('\n') : '// no changes from defaults';
		navigator.clipboard.writeText(text);
		const btn = el.querySelector('.se-copy');
		btn.textContent = 'Copied!';
		btn.classList.add('copied');
		setTimeout(() => { btn.textContent = 'Copy SCSS'; btn.classList.remove('copied'); }, 1600);
	});

	// ── Individual controls ─────────────────────────────────────────────────
	for (const g of GROUPS) {
		for (const c of g.controls) {
			const range = el.querySelector(`#se-${c.id}-r`);
			const num   = el.querySelector(`#se-${c.id}-n`);
			const resetBtn = el.querySelector(`.se-1r[data-id="${c.id}"]`);

			const update = (v) => {
				updateCtrlValue(el, c, v);
				save();
				applyStyles();
			};

			range.addEventListener('input', () => update(range.value));
			num.addEventListener('change', () => update(num.value));
			num.addEventListener('keydown', (e) => { if (e.key === 'Enter') update(num.value); });
			resetBtn.addEventListener('click', () => {
				delete values[c.id];
				save();
				applyStyles();
				syncInputs(el, c, c.def);
			});
		}
	}

	// ── Scale group controls ────────────────────────────────────────────────
	const allControls = GROUPS.flatMap((g) => g.controls);

	const applyScale = (sg, multiplier) => {
		values[sg.id] = multiplier;
		for (const t of sg.targets) {
			const ctrl = allControls.find((c) => c.id === t.id);
			if (!ctrl) continue;
			const newVal = Math.round(t.base * multiplier * 10) / 10;
			updateCtrlValue(el, ctrl, newVal);
		}
		save();
		applyStyles();
	};

	for (const sg of SCALE_GROUPS) {
		const range = el.querySelector(`#${sg.id}-r`);
		const num   = el.querySelector(`#${sg.id}-n`);
		const resetBtn = el.querySelector(`.se-1r[data-sg="${sg.id}"]`);

		const updateScale = (v) => {
			const m = Math.round(Math.min(2.0, Math.max(0.5, parseFloat(v) || 1.0)) * 20) / 20;
			range.value = m;
			num.value   = m;
			applyScale(sg, m);
		};

		range.addEventListener('input', () => updateScale(range.value));
		num.addEventListener('change', () => updateScale(num.value));
		num.addEventListener('keydown', (e) => { if (e.key === 'Enter') updateScale(num.value); });
		resetBtn.addEventListener('click', () => {
			delete values[sg.id];
			range.value = 1.0;
			num.value   = 1.0;
			// Individual controls retain their values; scale just resets to neutral
			save();
		});
	}
};

const makeDraggable = (el) => {
	const header = el.querySelector('.se-header');
	let ox = 0; let oy = 0; let dragging = false;
	header.addEventListener('mousedown', (e) => {
		if (e.target.closest('.se-header-right')) return;
		dragging = true;
		const r = el.getBoundingClientRect();
		ox = e.clientX - r.left;
		oy = e.clientY - r.top;
		e.preventDefault();
	});
	document.addEventListener('mousemove', (e) => {
		if (!dragging) return;
		el.style.left  = `${e.clientX - ox}px`;
		el.style.top   = `${e.clientY - oy}px`;
		el.style.right = 'auto';
	});
	document.addEventListener('mouseup', () => { dragging = false; });
};

const toggle = () => {
	visible = !visible;
	if (visible) {
		if (!panel) {
			panel = buildPanel();
			wirePanel(panel);
			makeDraggable(panel);
			document.body.append(panel);
		} else {
			panel.style.display = 'flex';
		}
	} else {
		if (panel) panel.style.display = 'none';
		if (inspecting) {
			inspecting = false;
			document.body.classList.remove('se-inspecting');
			hideOverlay();
		}
	}
};

// ── Init ─────────────────────────────────────────────────────────────────────

load();
applyStyles();

document.addEventListener('keydown', (e) => {
	if (e.shiftKey && e.key === 'E') { e.preventDefault(); toggle(); }
});
