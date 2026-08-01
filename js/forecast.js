// =====================================================
// forecast.js - 気象庁の府県予報 + Yahoo短時間降水予報
// =====================================================

const FORECAST_AREA_CODE = '130010'; // 東京地方
const FORECAST_MAX_PERIODS = 3;

function parseForecastDate(value) {
    if (!value) return null;
    const text = String(value);
    if (/^\d{12}$/.test(text)) {
        return new Date(
            Number(text.slice(0, 4)),
            Number(text.slice(4, 6)) - 1,
            Number(text.slice(6, 8)),
            Number(text.slice(8, 10)),
            Number(text.slice(10, 12))
        );
    }
    const parsed = new Date(text);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeJmaForecastText(value) {
    return String(value || '')
        .replace(/[　\s]+/g, ' ')
        .replace(/\s+([、。])/g, '$1')
        .trim();
}

function findJmaArea(timeSeries, fieldName) {
    for (const series of timeSeries || []) {
        const area = (series.areas || []).find(item => item.area?.code === FORECAST_AREA_CODE);
        if (area && Array.isArray(area[fieldName])) {
            return { timeDefines: series.timeDefines || [], area };
        }
    }
    return null;
}

function jmaWeatherEmoji(code) {
    const value = Number(code);
    if (!Number.isFinite(value)) return '🌤️';
    if (value >= 400) return '🌨️';
    if (value >= 300) return '🌧️';
    if (value >= 200) return '☁️';
    if ([102, 112, 115].includes(value)) return '🌦️';
    return '☀️';
}

function parseJmaForecastPayload(payload, now = new Date()) {
    const report = Array.isArray(payload) ? payload[0] : null;
    if (!report) return null;

    const weatherSeries = findJmaArea(report.timeSeries, 'weathers');
    const popSeries = findJmaArea(report.timeSeries, 'pops');
    if (!weatherSeries && !popSeries) return null;

    let weatherText = '';
    let weatherCode = null;
    if (weatherSeries) {
        const weatherStarts = weatherSeries.timeDefines.map(parseForecastDate);
        let weatherIndex = weatherStarts.findIndex((start, index) => {
            const next = weatherStarts[index + 1];
            return start && start <= now && (!next || now < next);
        });
        if (weatherIndex < 0) weatherIndex = 0;
        weatherText = normalizeJmaForecastText(weatherSeries.area.weathers[weatherIndex]);

        const codeSeries = findJmaArea(report.timeSeries, 'weatherCodes');
        weatherCode = codeSeries?.area.weatherCodes?.[weatherIndex] || null;
    }

    const periods = [];
    if (popSeries) {
        popSeries.timeDefines.forEach((value, index) => {
            const start = parseForecastDate(value);
            if (!start) return;
            const end = new Date(start.getTime() + 6 * 60 * 60 * 1000);
            if (end <= now || start.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return;
            const probability = Number(popSeries.area.pops[index]);
            if (!Number.isFinite(probability)) return;
            periods.push({ start, end, probability });
        });
    }

    return {
        reportTime: parseForecastDate(report.reportDatetime),
        weatherText,
        weatherCode,
        weatherEmoji: jmaWeatherEmoji(weatherCode),
        periods: periods.slice(0, FORECAST_MAX_PERIODS)
    };
}

function sampleYahooForecast(payload) {
    const items = Array.isArray(payload?.data) ? payload.data : [];
    const observations = items.filter(item => item.type === 'observation');
    const forecasts = items.filter(item => item.type === 'forecast');
    const latest = observations[observations.length - 1] || null;
    const baseTime = parseForecastDate(latest?.datetime) || new Date();
    const targets = [0, 20, 40, 60];

    return {
        updatedAt: parseForecastDate(payload?.updated_at),
        points: targets.map(minutes => {
            if (minutes === 0) {
                return { minutes, rainfall: Number(latest?.rainfall) || 0 };
            }
            const targetMs = baseTime.getTime() + minutes * 60 * 1000;
            let nearest = null;
            let nearestDiff = Infinity;
            forecasts.forEach(item => {
                const time = parseForecastDate(item.datetime);
                if (!time) return;
                const diff = Math.abs(time.getTime() - targetMs);
                if (diff < nearestDiff) {
                    nearest = item;
                    nearestDiff = diff;
                }
            });
            return {
                minutes,
                rainfall: nearest && nearestDiff <= 10 * 60 * 1000
                    ? Number(nearest.rainfall) || 0
                    : null
            };
        })
    };
}

function formatForecastUpdateTime(value) {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return '--:--';
    return value.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function sourceFreshnessClass(date, staleMinutes) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return 'unavailable';
    return Date.now() - date.getTime() > staleMinutes * 60 * 1000 ? 'stale' : 'fresh';
}

function renderForecastFreshness() {
    const container = document.getElementById('forecastFreshness');
    if (!container) return;
    container.replaceChildren();

    const sources = [
        {
            name: 'Yahoo',
            date: yahooPrecipData?.updatedAt,
            staleMinutes: 15
        },
        {
            name: '気象庁',
            date: jmaForecastData?.reportTime,
            staleMinutes: 12 * 60
        }
    ];

    sources.forEach(source => {
        const badge = document.createElement('span');
        const freshness = sourceFreshnessClass(source.date, source.staleMinutes);
        badge.className = `freshness-badge ${freshness}`;
        badge.textContent = `${source.name} ${formatForecastUpdateTime(source.date)}`;
        container.appendChild(badge);
    });
}

function revealForecastBrief() {
    const section = document.getElementById('forecastBrief');
    if (section) section.hidden = false;
}

function renderJmaForecast() {
    if (!jmaForecastData) return;
    revealForecastBrief();

    const summary = document.getElementById('jmaWeatherSummary');
    if (summary) {
        summary.replaceChildren();
        const emoji = document.createElement('span');
        emoji.className = 'jma-weather-emoji';
        emoji.textContent = jmaForecastData.weatherEmoji;
        const text = document.createElement('span');
        text.textContent = jmaForecastData.weatherText || '予報文を取得できませんでした';
        summary.append(emoji, text);
    }

    const periods = document.getElementById('jmaPopPeriods');
    if (periods) {
        periods.replaceChildren();
        jmaForecastData.periods.forEach(period => {
            const item = document.createElement('div');
            item.className = 'pop-period';
            const label = document.createElement('span');
            label.className = 'pop-period-label';
            const endHour = period.end.getHours() === 0 ? 24 : period.end.getHours();
            label.textContent = `${period.start.getHours()}–${endHour}時`;
            const value = document.createElement('strong');
            value.textContent = `${period.probability}%`;
            item.append(label, value);
            periods.appendChild(item);
        });
    }
    renderForecastFreshness();
}

function renderYahooForecast() {
    if (!yahooPrecipData) return;
    revealForecastBrief();
    const cells = document.getElementById('yahooNowcastCells');
    if (!cells) return;
    cells.replaceChildren();

    yahooPrecipData.points.forEach(point => {
        const cell = document.createElement('div');
        cell.className = 'nowcast-cell';
        const label = document.createElement('span');
        label.className = 'nowcast-label';
        label.textContent = point.minutes === 0 ? '現在' : `+${point.minutes}分`;
        const value = document.createElement('strong');
        value.className = point.rainfall > 0 ? 'is-rain' : '';
        value.textContent = point.rainfall == null ? '--' : point.rainfall.toFixed(1);
        const unit = document.createElement('small');
        unit.textContent = 'mm/h';
        cell.append(label, value, unit);
        cells.appendChild(cell);
    });
    renderForecastFreshness();
}

function applyJmaForecastToWeatherData() {
    if (!weatherData || !jmaForecastData?.periods?.length) return;
    const probabilities = jmaForecastData.periods.map(period => period.probability);
    weatherData.precipProb = probabilities[0];
    weatherData.maxFuturePrecipProb = Math.max(...probabilities);
    weatherData.precipProbabilitySource = 'jma';
}

async function loadJmaForecast() {
    try {
        const cached = getFromCache('forecast');
        const payload = cached || await fetch(JMA_FORECAST_URL).then(response => {
            if (!response.ok) throw new Error(`JMA forecast HTTP ${response.status}`);
            return response.json();
        });
        if (!cached) setToCache('forecast', payload);
        jmaForecastData = parseJmaForecastPayload(payload);
        applyJmaForecastToWeatherData();
        renderJmaForecast();
        if (weatherData && typeof updateUI === 'function') updateUI();
    } catch (error) {
        console.log('JMA forecast unavailable:', error.message);
        renderForecastFreshness();
    }
}

function updateYahooForecastBrief(payload) {
    yahooPrecipData = sampleYahooForecast(payload);
    renderYahooForecast();
}

window.parseJmaForecastPayload = parseJmaForecastPayload;
window.sampleYahooForecast = sampleYahooForecast;
window.applyJmaForecastToWeatherData = applyJmaForecastToWeatherData;
window.updateYahooForecastBrief = updateYahooForecastBrief;

if (typeof document !== 'undefined') loadJmaForecast();
