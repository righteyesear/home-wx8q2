const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = {
    console: { log() {}, warn() {}, error() {} },
    window: {},
    document: {
        documentElement: { style: { setProperty() {} } },
        getElementById() { return null; },
        querySelector() { return null; }
    },
    weatherData: null,
    actualPrecipState: null,
    currentAlerts: [],
    lastConditionKey: '',
    lastComment: '',
    summaryData: {},
    recentData: [],
    weeklyData: []
};
context.window = context;
vm.createContext(context);
for (const relativePath of ['js/ui.js', 'js/comments.js']) {
    vm.runInContext(
        fs.readFileSync(path.join(root, relativePath), 'utf8'),
        context,
        { filename: relativePath }
    );
}

function scenario({
    temp = 20,
    humidity = 50,
    code = 0,
    hour = 13,
    month = 7,
    day = 31,
    wind = 1,
    gust = 2,
    visibility = 30000,
    precipProb = 0,
    yahooAvailable = false,
    yahooRaining = false,
    yahooType = 'rain',
    rainfall = 0,
    yahooForecast = false,
    alerts = [],
    uv = 3,
    tempIn3Hours = temp,
    temp1hAgo = null,
    temp3hAgo = null,
    tempYesterday = null,
    willWorsen = false,
    maxFuturePrecipProb = 0,
    gridTemp = null
} = {}) {
    const now = new Date(
        `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        + `T${String(hour).padStart(2, '0')}:00:00+09:00`
    );
    context.weatherData = {
        weatherCode: code,
        cloudCover: code <= 1 ? 5 : code === 2 ? 55 : 90,
        precipProb,
        windSpeed: wind,
        windGusts: gust,
        visibility,
        uvIndex: uv,
        cape: code >= 95 ? 1200 : 0,
        sunrise: null,
        sunset: null,
        willWorsen,
        willImprove: false,
        maxFuturePrecipProb,
        tempIn3Hours,
        groundTemp: gridTemp
    };
    context.actualPrecipState = {
        observationAvailable: yahooAvailable,
        isRaining: yahooRaining,
        precipType: yahooType,
        rainfall,
        consecutiveMinutes: yahooRaining ? 20 : 0,
        hasForecastPrecip: yahooForecast,
        forecastPrecipType: yahooType
    };
    context.currentAlerts = alerts;
    context.weeklyData = [];
    context.recentData = [
        [1, temp1hAgo],
        [3, temp3hAgo],
        [24, tempYesterday]
    ].filter(([, value]) => value !== null).map(([hoursAgo, value]) => ({
        date: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
        temperature: value,
        humidity
    }));
    const weatherContext = context.buildWeatherCommentContext(temp, humidity, now);
    return {
        context: weatherContext,
        text: context.composeWeatherComment(weatherContext),
        parts: context.selectWeatherCommentParts(weatherContext)
    };
}

const actualRain = scenario({
    code: 0,
    yahooAvailable: true,
    yahooRaining: true,
    rainfall: 6
}).text;
assert.match(actualRain, /降水実況では、本降りの雨/);
assert.doesNotMatch(actualRain, /晴れ/);

const radarDry = scenario({
    code: 65,
    yahooAvailable: true,
    yahooRaining: false
});
assert.strictEqual(radarDry.context.wmo.key, 'overcast');
assert.doesNotMatch(radarDry.text, /雨が降っています|本降り|激しい雨/);

const noYahoo = scenario({
    code: 65,
    yahooAvailable: false
}).text;
assert.match(noYahoo, /激しい雨/);

const level5 = scenario({
    temp: 22,
    code: 0,
    alerts: [{ name: 'レベル5 大雨特別警報', level: 5, status: '発表' }]
}).text;
assert.match(level5, /^🆘/);
assert.match(level5, /命を守る行動/);

const level4 = scenario({
    alerts: [{ name: 'レベル4 土砂災害危険警報', level: 4 }]
}).text;
assert.match(level4, /^🚨/);
assert.match(level4, /避難/);

const level3 = scenario({
    alerts: [{ name: 'レベル3 大雨警報', level: 3 }]
}).text;
assert.match(level3, /^⚠️/);
assert.match(level3, /早めに行動/);

const advisoryDuringHeat = scenario({
    temp: 40,
    humidity: 50,
    alerts: [{ name: 'レベル2 雷注意報', level: 2 }]
}).text;
assert.match(advisoryDuringHeat, /^🆘 命の危険/);
assert.doesNotMatch(advisoryDuringHeat, /雷注意報/);

const thunder = scenario({ code: 95, yahooAvailable: true }).text;
assert.match(thunder, /^⛈️/);
assert.match(thunder, /丈夫な建物/);

const freezing = scenario({ temp: 1, code: 66 }).text;
assert.match(freezing, /^🧊/);
assert.match(freezing, /凍結性/);

const actualRainBeatsForecastFreezingRain = scenario({
    temp: 3,
    code: 66,
    yahooAvailable: true,
    yahooRaining: true,
    yahooType: 'rain',
    rainfall: 2
}).text;
assert.match(actualRainBeatsForecastFreezingRain, /降水実況では、.*雨/);
assert.doesNotMatch(actualRainBeatsForecastFreezingRain, /凍結性/);

const slightShower = scenario({ code: 80 }).text;
assert.match(slightShower, /弱い雨/);
assert.doesNotMatch(slightShower, /激しい|非常に激しい/);

const heatWithRain = scenario({
    temp: 38,
    humidity: 65,
    code: 0,
    yahooAvailable: true,
    yahooRaining: true,
    rainfall: 8
}).text;
assert.match(heatWithRain, /降水実況では、本降りの雨/);
assert.match(heatWithRain, /危険な暑さ/);

const stableInput = {
    temp: 23,
    humidity: 55,
    code: 2,
    hour: 13,
    month: 7,
    day: 31
};
assert.strictEqual(scenario(stableInput).text, scenario(stableInput).text);
assert.strictEqual(scenario({ code: 0, hour: 1 }).context.emoji, '🌙');

const calm = scenario({ temp: 21, humidity: 55, code: 1, hour: 13 });
assert.strictEqual(calm.parts.length, 1);

const humidNight = scenario({ temp: 27, humidity: 85, code: 2, hour: 22 });
assert.match(humidNight.text, /夜.*蒸し暑|夜も.*湿/);
assert.strictEqual(humidNight.parts.length, 1);

const dryHeat = scenario({ temp: 29, humidity: 25, code: 0, hour: 13 });
assert.match(dryHeat.text, /乾いた暑さ|空気は比較的乾/);

const windyChill = scenario({ temp: 11, humidity: 60, wind: 12, gust: 13 });
assert.match(windyChill.text, /風.*肌寒|冷たい風.*体感/);

const rapidWarming = scenario({ temp: 22, humidity: 55, temp1hAgo: 19 });
assert.match(rapidWarming.text, /この1時間で気温が約3\.0°C上/);

const coolingOutlook = scenario({ temp: 22, humidity: 55, tempIn3Hours: 16 });
assert.strictEqual(coolingOutlook.parts.length, 2);
assert.match(coolingOutlook.text, /3時間後.*約6°C下がる見込み/);

const gridBasedCooling = scenario({
    temp: 24,
    humidity: 55,
    gridTemp: 21,
    tempIn3Hours: 18
});
assert.strictEqual(gridBasedCooling.context.forecastTempDelta, -3);
assert.match(gridBasedCooling.text, /3時間後.*約3°C下がる見込み/);

const dangerousCompound = scenario({
    temp: 38,
    humidity: 65,
    code: 95,
    gust: 22,
    alerts: [{ name: 'レベル4 大雨危険警報', level: 4 }]
});
assert.strictEqual(dangerousCompound.parts.length, 3);
assert.match(dangerousCompound.text, /大雨危険警報/);
assert.match(dangerousCompound.text, /雷/);
assert.match(dangerousCompound.text, /危険な暑さ/);

const temperatures = [-10, 0, 5, 10, 15, 20, 25, 28, 32, 35, 40];
const humidities = [10, 30, 50, 65, 80, 95];
const codes = [0, 2, 3, 45, 51, 56, 61, 65, 66, 71, 75, 80, 82, 95, 99];
const hours = [1, 7, 13, 19];
let count = 0;

for (const temp of temperatures) {
    for (const humidity of humidities) {
        for (const code of codes) {
            for (const hour of hours) {
                const scenarioResult = scenario({ temp, humidity, code, hour });
                const result = scenarioResult.text;
                count++;
                assert(scenarioResult.parts.length >= 1);
                assert(scenarioResult.parts.length <= 3);
                assert(result.length >= 10, `too short: ${result}`);
                assert(result.length <= 280, `too long: ${result}`);
                assert.doesNotMatch(result, /<[^>]+>/);
                assert.doesNotMatch(result, /undefined|NaN|null/);
                assert.doesNotMatch(result, /[。！？]{2,}/);
                assert.doesNotMatch(result, /\s{2,}/);
                if (temp >= 30 && ![71, 75].includes(code)) {
                    assert.doesNotMatch(
                        result,
                        /かなり冷え|氷点下の厳しい寒さ|暖かい上着が必要/
                    );
                }
                if (temp <= 5) {
                    assert.doesNotMatch(
                        result,
                        /命の危険がある暑さ|危険な暑さ|厳しい暑さ/
                    );
                }
                if (code === 80) {
                    assert.doesNotMatch(result, /激しい雨|非常に激しい雨/);
                }
            }
        }
    }
}

console.log(`comment engine tests: ok (${count} matrix cases)`);
