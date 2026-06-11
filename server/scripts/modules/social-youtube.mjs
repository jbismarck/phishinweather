import STATUS from './status.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

class SocialYoutube extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'YouTube', true);
		this.alwaysEnabled = true;
		this.okToDrawCurrentConditions = true;
		this.timing.baseDelay = 12000;
	}

	async getData(weatherParameters, refresh) {
		if (!super.getData(weatherParameters, refresh)) return;
		this.setStatus(STATUS.loaded);
	}

	async drawCanvas() {
		super.drawCanvas();
		this.finishDraw();
	}
}

const socialYoutube = new SocialYoutube(26, 'social-youtube');
registerDisplay(socialYoutube);
socialYoutube.getData();
