import STATUS from './status.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

class SocialInstagram extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Instagram', true);
		this.alwaysEnabled = true;
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

const socialInstagram = new SocialInstagram(25, 'social-instagram');
registerDisplay(socialInstagram);
socialInstagram.getData();
