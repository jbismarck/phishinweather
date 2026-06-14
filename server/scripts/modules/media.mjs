import { text } from './utils/fetch.mjs';
import Setting from './utils/setting.mjs';

// A Live One (1995) — one track per source show, disc 1 → disc 2 order
const A_LIVE_ONE = [
	{ mp3: 'https://phish.in/blob/d3powwkr6jzeisx2du2n7dmb6jlb.mp3', title: 'Bouncing Around the Room (12/31/94)' },
	{ mp3: 'https://phish.in/blob/wquyi4a36p68f5wjbx380e7jrjlh.mp3', title: 'Stash (7/8/94)' },
	{ mp3: 'https://phish.in/blob/iwyekfo5d8qewcmku86dvdf37q3m.mp3', title: 'Gumbo (12/2/94)' },
	{ mp3: 'https://phish.in/blob/3pxpewkp4rad96a2c5pa1536jz7t.mp3', title: 'Tweezer > Montana (11/28/94)' },
	{ mp3: 'https://phish.in/blob/fcg3nhknda2ont07cmg2w03dvmtf.mp3', title: 'You Enjoy Myself (12/7/94)' },
	{ mp3: 'https://phish.in/blob/muahryzmb492q5z0et4bw7qbu3fy.mp3', title: 'Chalk Dust Torture (11/16/94)' },
	{ mp3: 'https://phish.in/blob/ko6r0b5g0aggswieeph3dm8z6dmv.mp3', title: 'Slave to the Traffic Light (11/26/94)' },
	{ mp3: 'https://phish.in/blob/f3touiq9is0r02wl5cp81luel5bp.mp3', title: 'Wilson (12/30/94)' },
	{ mp3: 'https://phish.in/blob/ejma2p7g604cqz3rdqkb8xdxohce.mp3', title: 'Tweezer (11/2/94)' },
	{ mp3: 'https://phish.in/blob/ge5ebfencfjm0nqcidts0vgfztfh.mp3', title: 'Simple (12/10/94)' },
	{ mp3: 'https://phish.in/blob/9vtanzkje44n80haz2o746p6hmxh.mp3', title: 'Harry Hood (10/23/94)' },
	{ mp3: 'https://phish.in/blob/v01onxzm936add0kg6sxhifeupvm.mp3', title: 'The Squirming Coil (10/23/94)' },
];

let playlist;
let currentTrack = 0;
let player;
let mediaReady = false;
const mediaReadyQueue = [];

const mediaPlaying = new Setting('mediaPlaying', {
	name: 'Media Playing',
	type: 'boolean',
	defaultValue: false,
	sticky: true,
});

document.addEventListener('DOMContentLoaded', () => {
	// add the event handler to the page
	document.getElementById('ToggleMedia').addEventListener('click', toggleMedia);
	// get the playlist
	getMedia();
});

const scanMusicDirectory = async () => {
        const parseDirectory = async (path, prefix = "") => {
                const listing = await text(path);
                const matches = [...listing.matchAll(/href="([^\"]+\.mp3)"/gi)];
                return matches.map((m) => `${prefix}${m[1]}`);
        };

        try {
                let files = await parseDirectory("music/");
                if (files.length === 0) {
                        files = await parseDirectory("music/default/", "default/");
                }
                return { availableFiles: files };
        } catch (e) {
                console.error("Unable to scan music directory");
                console.error(e);
                return { availableFiles: [] };
        }
};


const getMedia = async () => {
        try {
                const response = await fetch('playlist.json');
                if (response.ok) {
                        playlist = await response.json();
                } else if (response.status === 404
                        && response.headers.get('X-Weatherstar') === 'true') {
                        console.warn("Couldn't get playlist.json, falling back to directory scan");
                        playlist = await scanMusicDirectory();
                } else {
                        console.warn(`Couldn't get playlist.json: ${response.status} ${response.statusText}`);
                        playlist = { availableFiles: [] };
                }
        } catch (e) {
                console.warn("Couldn't get playlist.json, falling back to directory scan");
                playlist = await scanMusicDirectory();
        }

        // No custom local tracks — play today-in-history shows in full, in order.
        // Falls back to A Live One if no shows exist for today's date.
        const hasCustomTracks = playlist.availableFiles.some((f) => !f.startsWith('default/'));
        if (!hasCustomTracks) {
                try {
                        const r = await fetch('/api/phish/on-this-day');
                        if (r.ok) {
                                const data = await r.json();
                                // All shows for today, oldest → newest, tracks in set order
                                const todayTracks = (data?.shows ?? [])
                                        .filter((s) => s.tracks.length > 0)
                                        .sort((a, b) => a.date.localeCompare(b.date))
                                        .flatMap((s) => s.tracks.map((t) => ({ mp3: t.mp3, title: t.title })));
                                const tracks = todayTracks.length > 0 ? todayTracks : A_LIVE_ONE;
                                playlist = { availableFiles: tracks.map((t) => t.mp3), sequential: true };
                        } else {
                                playlist = { availableFiles: A_LIVE_ONE.map((t) => t.mp3), sequential: true };
                        }
                } catch { playlist = { availableFiles: A_LIVE_ONE.map((t) => t.mp3), sequential: true }; }
        }

        enableMediaPlayer();
};

const enableMediaPlayer = () => {
	// notify any waiting callbacks (e.g. easter-eggs music injection)
	mediaReady = true;
	mediaReadyQueue.forEach((cb) => cb());
	mediaReadyQueue.length = 0;

	// see if files are available
	if (playlist?.availableFiles?.length > 0) {
		if (!playlist.sequential) randomizePlaylist();
		// enable the icon
		const icon = document.getElementById('ToggleMedia');
		icon.classList.add('available');
		// set the button type
		setIcon();
		// if we're already playing (sticky option) then try to start playing
		if (mediaPlaying.value === true) {
			startMedia();
		}
		// add the volume control to the page
		const settingsSection = document.querySelector('#settings');
		settingsSection.append(mediaVolume.generate());
	}
};

const setIcon = () => {
	// get the icon
	const icon = document.getElementById('ToggleMedia');
	if (mediaPlaying.value === true) {
		icon.classList.add('playing');
	} else {
		icon.classList.remove('playing');
	}
};

const toggleMedia = (forcedState) => {
	// handle forcing
	if (typeof forcedState === 'boolean') {
		mediaPlaying.value = forcedState;
	} else {
		// toggle the state
		mediaPlaying.value = !mediaPlaying.value;
	}
	// handle the state change
	stateChanged();
};

const startMedia = async () => {
	try {
		if (!player) {
			await initializePlayer();
		} else {
			await player.play();
			setTrackName(playlist.availableFiles[currentTrack]);
		}
	} catch (e) {
		console.error('[media] Couldn\'t play music:', e.name, e.message);
		mediaPlaying.value = false;
		stateChanged();
		setTrackName('Not playing');
	}
};

const stopMedia = () => {
	if (!player) return;
	player.pause();
	setTrackName('Not playing');
};

const stateChanged = () => {
	// update the icon
	setIcon();
	// react to the new state
	if (mediaPlaying.value) {
		startMedia();
	} else {
		stopMedia();
	}
};

const randomizePlaylist = () => {
	let availableFiles = [...playlist.availableFiles];
	const randomPlaylist = [];
	while (availableFiles.length > 0) {
		// get a randon item from the available files
		const i = Math.floor(Math.random() * availableFiles.length);
		// add it to the final list
		randomPlaylist.push(availableFiles[i]);
		// remove the file from the available files
		availableFiles = availableFiles.filter((file, index) => index !== i);
	}
	playlist.availableFiles = randomPlaylist;
};

const setVolume = (newVolume) => {
	if (player) {
		player.volume = newVolume;
	}
};

const mediaVolume = new Setting('mediaVolume', {
	name: 'Volume',
	type: 'select',
	defaultValue: 0.75,
	values: [
		[1, '100%'],
		[0.75, '75%'],
		[0.50, '50%'],
		[0.25, '25%'],
	],
	changeAction: setVolume,
});

const getTrackUrl = (track) => (track.startsWith('http') ? track : `music/${track}`);

const initializePlayer = async () => {
	// basic sanity checks
	if (!playlist.availableFiles || playlist?.availableFiles.length === 0) {
		throw new Error('No playlist available');
	}
	if (player) {
		return;
	}
	// create the player
	player = new Audio();

	// reset the playlist index
	currentTrack = 0;

	// add event handlers
	player.addEventListener('ended', playerEnded);
	player.addEventListener('error', playerEnded);

	// get the first file
	player.src = getTrackUrl(playlist.availableFiles[currentTrack]);
	setTrackName(playlist.availableFiles[currentTrack]);
	player.type = 'audio/mpeg';
	setVolume(mediaVolume.value);

	// play() must be called within the user gesture context — don't wait for canplay
	await player.play();
};

const playerEnded = () => {
	// next track
	currentTrack += 1;
	if (currentTrack >= playlist.availableFiles.length) {
		if (!playlist.sequential) randomizePlaylist();
		currentTrack = 0;
	}
	// update the player source and continue playing
	const track = playlist.availableFiles[currentTrack];
	player.src = getTrackUrl(track);
	setTrackName(track);
	player.play().catch(() => {});
};

const setTrackName = (fileName) => {
        const baseName = fileName.split('/').pop();
        const trackName = decodeURIComponent(
                baseName.replace(/\.mp3/gi, '').replace(/(_-)/gi, '')
        );
        document.getElementById('musicTrack').textContent = trackName;
};

const whenMediaReady = (cb) => {
	if (mediaReady) { cb(); return; }
	mediaReadyQueue.push(cb);
};

const getCurrentTrackUrl = () => playlist?.availableFiles?.[currentTrack] ?? null;

export {
	toggleMedia,
	whenMediaReady,
	getCurrentTrackUrl,
};
