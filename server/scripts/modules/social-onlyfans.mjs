import STATUS from './status.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

class SocialOnlyfans extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'OnlyFans', true);
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

const socialOnlyfans = new SocialOnlyfans(28, 'social-onlyfans');
registerDisplay(socialOnlyfans);
socialOnlyfans.getData();
