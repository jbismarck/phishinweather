import STATUS from './status.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

class SocialReddit extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Reddit', true);
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

const socialReddit = new SocialReddit(27, 'social-reddit');
registerDisplay(socialReddit);
socialReddit.getData();
