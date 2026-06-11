import STATUS from './status.mjs';
import WeatherDisplay from './weatherdisplay.mjs';
import { registerDisplay } from './navigation.mjs';

class FeatureVote extends WeatherDisplay {
	constructor(navId, elemId) {
		super(navId, elemId, 'Feature Vote', true);
		this.alwaysEnabled = true;
		this.okToDrawCurrentConditions = true;
		this.timing.baseDelay = 14000;
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

const featureVote = new FeatureVote(29, 'feature-vote');
registerDisplay(featureVote);
featureVote.getData();
