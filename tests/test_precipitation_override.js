const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'js', 'precipitation.js'),
    'utf8'
);
const context = {
    console: { log() {} },
    weatherData: { weatherCode: 65, groundTemp: 20 },
    recentData: [],
    document: { getElementById() { return null; } },
    Date,
    Chart: function Chart() {}
};
vm.createContext(context);
vm.runInContext(`${source}
globalThis.__precipTest = {
    state: actualPrecipState,
    updateActualPrecipState,
    getWeatherOverride,
    getCurrentWeatherOverride
};`, context);

const api = context.__precipTest;

// Yahoo取得前はOpen-Meteoを抑制しない。
assert.strictEqual(api.getWeatherOverride(), null);

// Yahoo実測0mmなら、Open-Meteoの雨表示を曇りへ補正する。
api.updateActualPrecipState([
    { type: 'observation', rainfall: 0, time: '12:00' }
]);
assert.strictEqual(api.state.observationAvailable, true);
assert.deepStrictEqual(
    JSON.parse(JSON.stringify(api.getWeatherOverride())),
    { icon: '☁️', condition: '曇り' }
);
assert.strictEqual(api.getCurrentWeatherOverride().condition, '曇り');

// 雨量0でも雷雨コードは安全上そのまま表示する。
context.weatherData.weatherCode = 95;
assert.strictEqual(api.getWeatherOverride(), null);
assert.strictEqual(api.getCurrentWeatherOverride(), null);

// Yahoo実測雨はOpen-Meteoの晴れより優先する。
context.weatherData.weatherCode = 0;
api.updateActualPrecipState([
    { type: 'observation', rainfall: 3, time: '12:05' }
]);
const actualRain = api.getCurrentWeatherOverride();
assert.strictEqual(actualRain.isActive, true);
assert.strictEqual(actualRain.precipType, 'rain');
assert.match(actualRain.condition, /雨/);

console.log('precipitation override tests: ok');
