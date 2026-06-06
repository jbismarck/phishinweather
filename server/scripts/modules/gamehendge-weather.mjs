import WeatherDisplay from './weatherdisplay.mjs';

class GamehendgeWeather extends WeatherDisplay {
	constructor() {
		super(23, 'gamehendge-weather', 'Gamehendge Weather', false);
		this.isEnabled = true;
		this.okToDrawCurrentConditions = false;
		this.timing.totalScreens = 1;
		this.timing.baseDelay = 30000;
	}

	// not registered — hidden from normal rotation and settings menu
	generateCheckbox() { return false; }

	async drawCanvas() {
		super.drawCanvas();
		this.finishDraw();
	}
}

export const gamehendgeWeather = new GamehendgeWeather();
