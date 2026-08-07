// Purge the Cloudflare cache so a deploy's asset changes go live immediately
// instead of being stuck behind the edge's 7-day TTL (sprites, backgrounds,
// etc. are served with max-age=604800 and aren't cache-busted, so without this
// an updated image can stay stale at the edge for up to a week).
//
// Called once per deploy from index.mjs on server startup, and runnable
// manually via `npm run purge`. No-ops safely when the token/zone aren't
// configured (e.g. local dev), so it never breaks startup.
//
// Requires two Railway env vars:
//   CLOUDFLARE_PURGE_TOKEN — API token with Zone > Cache Purge > Purge for the zone
//   CLOUDFLARE_ZONE_ID     — the phishinweather.com zone id (CF > Overview > API)

const CF_API = 'https://api.cloudflare.com/client/v4';

export const purgeCloudflare = async () => {
	const token = process.env.CLOUDFLARE_PURGE_TOKEN;
	const zone = process.env.CLOUDFLARE_ZONE_ID;
	if (!token || !zone) {
		console.warn('Cloudflare purge skipped — CLOUDFLARE_PURGE_TOKEN / CLOUDFLARE_ZONE_ID not set');
		return false;
	}

	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), 10_000);
	try {
		const res = await fetch(`${CF_API}/zones/${zone}/purge_cache`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			// purge_everything works on all Cloudflare plans (prefix purge is
			// Enterprise-only). It just empties the edge; assets re-fill from
			// origin on the next request. Fine for a low-traffic site.
			body: JSON.stringify({ purge_everything: true }),
			signal: ctrl.signal,
		});
		const data = await res.json().catch(() => ({}));
		if (res.ok && data.success) {
			console.log('✓ Cloudflare cache purged');
			return true;
		}
		console.error('Cloudflare purge failed:', res.status, JSON.stringify(data.errors ?? data));
		return false;
	} catch (err) {
		console.error('Cloudflare purge error:', err.message);
		return false;
	} finally {
		clearTimeout(timer);
	}
};

// Allow running standalone: `node scripts/purge-cloudflare.mjs` / `npm run purge`
if (import.meta.url === `file://${process.argv[1]}`) {
	purgeCloudflare().then((ok) => process.exit(ok ? 0 : 1));
}
