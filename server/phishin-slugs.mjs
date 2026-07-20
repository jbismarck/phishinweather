// Our venue keys (venues.slug in the DB) don't always match phish.in's venue
// slug — some venues were renamed (Deer Creek → Ruoff, Lakeview → Empower FCU)
// or spelled differently (British "-theatre" vs phish.in's "-theater"). We keep
// our own slug as the stable DB primary key and translate ONLY at the phish.in
// API boundary. Verified against https://phish.in/api/v2/venues (2026-07-20).
const PHISHIN_SLUG_FIX = {
	'deer-creek-music-center': 'deer-creek',
	'dicks-sporting-goods-park': 'dick-s-sporting-goods-park',
	'walnut-creek-amphitheatre': 'walnut-creek-amphitheater',
	'amphitheater-at-lakeview': 'lakeview-amphitheater',
};

// Translate one of our venue keys to the slug phish.in expects.
const phishinSlug = (slug) => PHISHIN_SLUG_FIX[slug] ?? slug;

export { PHISHIN_SLUG_FIX, phishinSlug };
