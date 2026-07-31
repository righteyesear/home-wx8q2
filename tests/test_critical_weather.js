const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const RealDate = Date;
const elements = new Map();

function createElement() {
    return {
        innerHTML: '',
        textContent: '',
        dataset: {},
        style: { setProperty() {} },
        classList: { add() {}, remove() {} },
        offsetWidth: 1,
        parentElement: { style: {} }
    };
}

const context = {
    console,
    Math: Object.create(Math),
    window: {},
    weatherData: null,
    summaryData: {},
    recentData: [],
    weeklyData: [],
    currentAlerts: [],
    actualPrecipState: null,
    lastConditionKey: '',
    lastComment: '',
    document: {
        documentElement: { style: { setProperty() {} } },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement());
            return elements.get(id);
        },
        querySelector() { return createElement(); }
    },
    getCurrentWeatherOverride() { return null; },
    getPrecipIntensityLabel(rainfall, type) {
        if (type === 'snow') return '雪';
        if (type === 'sleet') return 'みぞれ';
        return rainfall >= 20 ? '強い雨' : rainfall >= 3 ? '雨' : '弱い雨';
    },
    getPrecipitationType() { return 'rain'; }
};
context.window = context;
context.Math.random = () => 0;
context.Date = class extends RealDate {
    constructor(...args) {
        super(...(args.length ? args : ['2026-07-31T13:00:00+09:00']));
    }
    static now() { return new RealDate('2026-07-31T13:00:00+09:00').getTime(); }
};

vm.createContext(context);
for (const relativePath of ['js/ui.js', 'js/comments.js']) {
    vm.runInContext(
        fs.readFileSync(path.join(root, relativePath), 'utf8'),
        context,
        { filename: relativePath }
    );
}

function functionSource(relativePath, functionName) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const start = source.indexOf(`function ${functionName}(`);
    assert(start >= 0, `${functionName} not found`);
    const open = source.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < source.length; index++) {
        if (source[index] === '{') depth++;
        if (source[index] === '}') depth--;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`${functionName} is incomplete`);
}

vm.runInContext(
    functionSource('js/utils.js', 'simpleMarkdownToHtml'),
    context
);
vm.runInContext(
    functionSource('js/weather-api.js', 'truncateJapaneseText'),
    context
);

function renderComment({
    temp = 22,
    humidity = 65,
    code = 0,
    precipProb = 0,
    isRaining = false,
    observationAvailable = isRaining,
    precipType = 'rain',
    rainfall = 0
} = {}) {
    elements.clear();
    context.lastConditionKey = `force-${Math.random()}`;
    context.lastComment = '';
    context.currentAlerts = [];
    context.weatherData = {
        weatherCode: code,
        cloudCover: code === 0 ? 5 : 90,
        precipProb,
        windSpeed: 1,
        uvIndex: 5,
        visibility: 30000,
        windDirection: 180,
        windGusts: 2,
        pressureMsl: 1013,
        cape: 0,
        sunrise: null,
        sunset: null,
        maxFuturePrecipProb: 0,
        willWorsen: false,
        willImprove: false,
        tempIn3Hours: temp
    };
    context.actualPrecipState = {
        observationAvailable,
        isRaining,
        precipType,
        rainfall,
        consecutiveMinutes: isRaining ? 20 : 0,
        hasForecastPrecip: false,
        forecastPrecipType: 'rain'
    };
    context.updateGreeting(temp, humidity);
    const result = elements.get('weatherComment');
    return result.textContent || result.innerHTML;
}

const humidHeatCalm = context.calculateFeelsLike(38, 65, 0);
const humidHeatWindy = context.calculateFeelsLike(38, 65, 5);
assert(humidHeatCalm > 47 && humidHeatCalm < 50);
assert(humidHeatWindy > 44 && humidHeatWindy < humidHeatCalm);
const hotDryStormWind = context.calculateFeelsLike(40, 10, 25);
assert(hotDryStormWind >= 32 && hotDryStormWind <= 40);
assert(Number.isFinite(context.calculateFeelsLike(20, 150, -5)));
for (const temp of [27, 32, 38, 45, 60]) {
    for (const rh of [0, 10, 65, 100, 150]) {
        for (const wind of [0, 5, 25, 60]) {
            const result = context.calculateFeelsLike(temp, rh, wind);
            assert(result >= temp - 8);
            assert(result <= temp + 15);
        }
    }
}

const yahooRain = renderComment({
    code: 0,
    isRaining: true,
    rainfall: 3
});
assert.match(yahooRain, /実測で.*雨/);
assert.doesNotMatch(yahooRain, /晴れ/);

const deadlyHeat = renderComment({
    temp: 40,
    humidity: 40,
    code: 0,
    precipProb: 70
});
assert.match(deadlyHeat, /命の危険|緊急|危険/);
assert.doesNotMatch(deadlyHeat.slice(0, 30), /降水確率|傘/);

const slightShower = renderComment({ code: 80 });
assert.doesNotMatch(slightShower, /激しい雨|豪雨/);

const freezingRain = renderComment({
    temp: 1,
    humidity: 90,
    code: 66
});
assert.match(freezingRain, /凍結性|着氷|路面凍結/);

const formatted = context.formatWeatherComment(
    '☀️ <span class="temp-highlight">35.0°C</span>・湿度65% — 水分・塩分を補給'
);
assert.strictEqual(formatted, '☀️ 湿度65% — 水分・塩分を補給');

const escaped = context.simpleMarkdownToHtml(
    '<img src=x onerror=alert(1)> **安全**'
);
assert.doesNotMatch(escaped, /<img/);
assert.match(escaped, /&lt;img/);
assert.match(escaped, /<strong>安全<\/strong>/);

const emojiText = 'あ'.repeat(149) + '🌧️' + 'い'.repeat(20);
const truncated = context.truncateJapaneseText(emojiText, 150);
assert.strictEqual(Array.from(truncated.text).length, 150);
assert(!truncated.text.endsWith('\uD83C'));

console.log('critical weather tests: ok');
