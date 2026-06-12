import { text } from './utils/fetch.mjs';
import Setting from './utils/setting.mjs';

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

        // No custom local tracks — seed from today's featured show on phish.in.
        // Falls back silently to default ambient tracks if the API is unavailable.
        const hasCustomTracks = playlist.availableFiles.some((f) => !f.startsWith('default/'));
        if (!hasCustomTracks) {
                try {
                        const r = await fetch('/api/phish/on-this-day');
                        if (r.ok) {
                                const data = await r.json();
                                const phishTracks = (data?.featured?.tracks ?? [])
                                        .map((t) => t.mp3_url)
                                        .filter(Boolean);
                                if (phishTracks.length > 0) {
                                        playlist = { availableFiles: phishTracks };
                                }
                        }
                } catch { /* stay with default ambient tracks */ }
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
		// randomize the list
		randomizePlaylist();
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
	// roll over and re-randomize the tracks
	if (currentTrack >= playlist.availableFiles.length) {
		randomizePlaylist();
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
        document.getElementById('musicTrack').innerHTML = trackName;
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
