// =====================================================
// comments.js - 一言コメント生成
// =====================================================
// 入力の正規化、危険度判定、文章生成、表示を分離する。
// 文面は条件キーから決定論的に選び、更新のたびに揺れないようにする。

function commentNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function commentClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function commentOptionalNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function calculateCommentDewPoint(temp, humidity) {
    const rh = commentClamp(commentNumber(humidity, 0), 1, 100);
    const a = 17.625;
    const b = 243.04;
    const gamma = Math.log(rh / 100) + (a * temp) / (b + temp);
    return (b * gamma) / (a - gamma);
}

function findCommentRecordNear(records, targetTime, toleranceMinutes) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const record of records) {
        const date = record?.date instanceof Date
            ? record.date
            : new Date(record?.date || record?.datetime || '');
        const temperature = commentOptionalNumber(record?.temperature);
        if (Number.isNaN(date.getTime()) || temperature === null) continue;
        const distance = Math.abs(date.getTime() - targetTime.getTime());
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = { date, temperature };
        }
    }
    return nearestDistance <= toleranceMinutes * 60 * 1000 ? nearest : null;
}

function getCommentTemperatureComparisons(temp, now) {
    const source = Array.isArray(weeklyData) && weeklyData.length > 0
        ? weeklyData
        : Array.isArray(recentData) ? recentData : [];
    if (source.length === 0) {
        return { change1h: null, change3h: null, vsYesterday: null };
    }

    const compare = (hours, toleranceMinutes) => {
        const target = new Date(now.getTime() - hours * 60 * 60 * 1000);
        const record = findCommentRecordNear(source, target, toleranceMinutes);
        return record ? temp - record.temperature : null;
    };

    return {
        change1h: compare(1, 25),
        change3h: compare(3, 40),
        vsYesterday: compare(24, 55)
    };
}

function formatWeatherComment(comment) {
    return String(comment || '')
        .replace(
            /<span class="temp-highlight">[0-9.-]+°C<\/span>(?:\s*・\s*(湿度\d+%))?\s*—\s*/,
            (_, humidityText) => humidityText ? `${humidityText} — ` : ''
        )
        .replace(/\s+([、。！？])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function commentHash(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function stableCommentChoice(choices, seed) {
    if (!Array.isArray(choices) || choices.length === 0) return '';
    return choices[commentHash(seed) % choices.length];
}

function getCommentTimeInfo(now, sourceWeather) {
    let sunriseHour = 6;
    let sunsetHour = 18;
    if (sourceWeather?.sunrise && sourceWeather?.sunset) {
        const sunrise = new Date(sourceWeather.sunrise);
        const sunset = new Date(sourceWeather.sunset);
        if (!Number.isNaN(sunrise.getTime())) sunriseHour = sunrise.getHours();
        if (!Number.isNaN(sunset.getTime())) sunsetHour = sunset.getHours();
    }

    const hour = now.getHours();
    const isDay = hour >= sunriseHour && hour < sunsetHour;
    const period = hour >= 4 && hour < 6 ? 'dawn'
        : hour >= 6 && hour < 10 ? 'morning'
            : hour >= 10 && hour < 12 ? 'late-morning'
                : hour >= 12 && hour < 17 ? 'afternoon'
                    : hour >= 17 && hour < 21 ? 'evening'
                        : 'night';
    const greeting = period === 'dawn' ? '早起きですね'
        : period === 'morning' ? 'おはようございます'
            : period === 'late-morning' ? '良い午前を'
                : period === 'afternoon' ? 'こんにちは'
                    : period === 'evening' ? 'こんばんは'
                        : '夜もお疲れさまです';

    return {
        hour,
        period,
        greeting,
        isDay,
        isNight: !isDay,
        month: now.getMonth() + 1,
        day: now.getDate()
    };
}

function getCommentWeatherEmoji(code, isDay, hour) {
    if (code === 99 || code === 96) return '⛈️';
    if (code === 95) return '🌩️';
    if (code === 75) return '❄️';
    if ([71, 73, 77, 85, 86].includes(code)) return '🌨️';
    if ([56, 57, 66, 67].includes(code)) return '🧊';
    if ([63, 65, 82].includes(code)) return '🌧️';
    if ([51, 53, 55, 61, 80, 81].includes(code)) return '🌦️';
    if ([45, 48].includes(code)) return '🌫️';
    if (code === 3) return '☁️';
    if (code === 2) return isDay ? '⛅' : '☁️';
    if (code === 1) return isDay ? '🌤️' : '🌙';
    if (code === 0) {
        if (hour >= 4 && hour < 8) return '🌅';
        if (hour >= 16 && hour < 18) return '🌇';
        return isDay ? '☀️' : '🌙';
    }
    return isDay ? '🌤️' : '🌙';
}

function classifyWmoWeather(code) {
    const definitions = {
        0: { key: 'clear', label: '快晴', emoji: '☀️' },
        1: { key: 'mostly-clear', label: 'ほぼ晴れ', emoji: '🌤️' },
        2: { key: 'partly-cloudy', label: '晴れ時々曇り', emoji: '⛅' },
        3: { key: 'overcast', label: '曇り', emoji: '☁️' },
        45: { key: 'fog', label: '霧', emoji: '🌫️', visibilityRisk: true },
        48: { key: 'rime-fog', label: '着氷性の霧', emoji: '🌫️', visibilityRisk: true, freezing: true },
        51: { key: 'drizzle-light', label: '弱い霧雨', emoji: '🌦️', precip: 'rain', intensity: 1 },
        53: { key: 'drizzle', label: '霧雨', emoji: '🌦️', precip: 'rain', intensity: 1 },
        55: { key: 'drizzle-heavy', label: '強い霧雨', emoji: '🌧️', precip: 'rain', intensity: 2 },
        56: { key: 'freezing-drizzle', label: '着氷性の霧雨', emoji: '🧊', precip: 'rain', intensity: 2, freezing: true },
        57: { key: 'freezing-drizzle-heavy', label: '強い着氷性霧雨', emoji: '🧊', precip: 'rain', intensity: 3, freezing: true },
        61: { key: 'rain-light', label: '弱い雨', emoji: '🌦️', precip: 'rain', intensity: 1 },
        63: { key: 'rain', label: '雨', emoji: '🌧️', precip: 'rain', intensity: 2 },
        65: { key: 'rain-heavy', label: '強い雨', emoji: '🌧️', precip: 'rain', intensity: 3 },
        66: { key: 'freezing-rain', label: '着氷性の雨', emoji: '🧊', precip: 'rain', intensity: 2, freezing: true },
        67: { key: 'freezing-rain-heavy', label: '強い着氷性の雨', emoji: '🧊', precip: 'rain', intensity: 3, freezing: true },
        71: { key: 'snow-light', label: '弱い雪', emoji: '🌨️', precip: 'snow', intensity: 1 },
        73: { key: 'snow', label: '雪', emoji: '🌨️', precip: 'snow', intensity: 2 },
        75: { key: 'snow-heavy', label: '大雪', emoji: '❄️', precip: 'snow', intensity: 3 },
        77: { key: 'snow-grains', label: '霧雪', emoji: '🌨️', precip: 'snow', intensity: 1 },
        80: { key: 'shower-light', label: '弱いにわか雨', emoji: '🌦️', precip: 'rain', intensity: 1 },
        81: { key: 'shower', label: 'にわか雨', emoji: '🌧️', precip: 'rain', intensity: 2 },
        82: { key: 'shower-heavy', label: '激しいにわか雨', emoji: '🌧️', precip: 'rain', intensity: 3 },
        85: { key: 'snow-shower', label: 'にわか雪', emoji: '🌨️', precip: 'snow', intensity: 2 },
        86: { key: 'snow-shower-heavy', label: '激しいにわか雪', emoji: '❄️', precip: 'snow', intensity: 3 },
        95: { key: 'thunderstorm', label: '雷雨', emoji: '🌩️', precip: 'rain', intensity: 2, thunder: true },
        96: { key: 'thunderstorm-hail', label: '雹を伴う雷雨', emoji: '⛈️', precip: 'rain', intensity: 3, thunder: true },
        99: { key: 'thunderstorm-heavy-hail', label: '激しい雷雨', emoji: '⛈️', precip: 'rain', intensity: 3, thunder: true }
    };
    return definitions[code] || { key: 'unknown', label: '天気情報なし', emoji: '🌤️' };
}

function deriveAlertLevel(alert) {
    const explicit = commentNumber(alert?.level, 0);
    if (explicit >= 2) return explicit;
    const name = String(alert?.name || '');
    if (/レベル5|特別警報/.test(name)) return 5;
    if (/レベル4|危険警報/.test(name)) return 4;
    if (/レベル3|警報/.test(name) && !/注意報/.test(name)) return 3;
    if (/レベル2|注意報/.test(name)) return 2;
    return 0;
}

function summarizeAlerts(alerts) {
    const normalized = (Array.isArray(alerts) ? alerts : [])
        .map(alert => ({
            name: String(alert?.name || '気象情報'),
            level: deriveAlertLevel(alert),
            status: String(alert?.status || '')
        }))
        .filter(alert => !/解除/.test(alert.status))
        .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, 'ja'));

    const highestLevel = normalized.reduce(
        (highest, alert) => Math.max(highest, alert.level),
        0
    );
    const highest = normalized.filter(alert => alert.level === highestLevel);
    return {
        items: normalized,
        highestLevel,
        names: highest.map(alert => alert.name.replace(/^レベル[2-5]\s*/, ''))
    };
}

function resolveCurrentPrecipitation(wmo) {
    const state = typeof actualPrecipState === 'object' && actualPrecipState
        ? actualPrecipState
        : null;
    const yahooAvailable = state?.observationAvailable === true
        || (state?.observationAvailable === undefined && state?.isRaining === true);
    const yahooRainfall = Math.max(0, commentNumber(state?.rainfall, 0));

    if (yahooAvailable) {
        if (state?.isRaining === true || yahooRainfall > 0) {
            const type = ['rain', 'snow', 'sleet'].includes(state?.precipType)
                ? state.precipType
                : 'rain';
            return {
                active: true,
                observed: true,
                source: 'yahoo',
                type,
                rainfall: yahooRainfall,
                intensity: type === 'rain'
                    ? yahooRainfall >= 30 ? 4
                        : yahooRainfall >= 20 ? 3
                            : yahooRainfall >= 5 ? 2 : 1
                    : yahooRainfall >= 3 ? 3 : yahooRainfall >= 1 ? 2 : 1
            };
        }
        return {
            active: false,
            observed: true,
            source: 'yahoo',
            type: null,
            rainfall: 0,
            intensity: 0
        };
    }

    if (wmo.precip) {
        return {
            active: true,
            observed: false,
            source: 'open-meteo',
            type: wmo.precip,
            rainfall: null,
            intensity: wmo.intensity || 1
        };
    }

    return {
        active: false,
        observed: false,
        source: 'open-meteo',
        type: null,
        rainfall: 0,
        intensity: 0
    };
}

function getCommentTemperatureBand(temp) {
    if (temp >= 40) return 'deadly-heat';
    if (temp >= 35) return 'extreme-heat';
    if (temp >= 32) return 'severe-heat';
    if (temp >= 28) return 'hot';
    if (temp >= 25) return 'warm';
    if (temp >= 22) return 'mild-warm';
    if (temp >= 18) return 'mild';
    if (temp >= 14) return 'cool';
    if (temp >= 10) return 'chilly';
    if (temp >= 5) return 'cold';
    if (temp >= 0) return 'very-cold';
    return 'freezing';
}

function buildWeatherCommentContext(temp, humidity, now = new Date()) {
    const sourceWeather = typeof weatherData === 'object' && weatherData
        ? weatherData
        : {};
    const airTemp = commentNumber(temp, 0);
    const relativeHumidity = commentClamp(commentNumber(humidity, 0), 0, 100);
    const code = commentNumber(sourceWeather.weatherCode, -1);
    const rawWmo = classifyWmoWeather(code);
    const time = getCommentTimeInfo(now, sourceWeather);
    const wind10m = Math.max(0, commentNumber(sourceWeather.windSpeed, 0));
    const displayWind = wind10m * 0.6;
    const gust = sourceWeather.windGusts == null
        ? null
        : Math.max(0, commentNumber(sourceWeather.windGusts, 0));
    const visibility = sourceWeather.visibility == null
        ? null
        : Math.max(0, commentNumber(sourceWeather.visibility, 0));
    const precipProbability = commentClamp(
        commentNumber(sourceWeather.precipProb, 0),
        0,
        100
    );
    const uv = Math.max(0, commentNumber(sourceWeather.uvIndex, 0));
    const feelsLike = calculateFeelsLike(airTemp, relativeHumidity, wind10m);
    const dewPoint = calculateCommentDewPoint(airTemp, relativeHumidity);
    const comparisons = getCommentTemperatureComparisons(airTemp, now);
    const forecastReferenceTemp = commentOptionalNumber(sourceWeather.groundTemp)
        ?? airTemp;
    const forecastTempDelta = sourceWeather.tempIn3Hours == null
        ? null
        : commentNumber(sourceWeather.tempIn3Hours, forecastReferenceTemp)
            - forecastReferenceTemp;
    const estimatedWbgt = 0.735 * airTemp + 0.0374 * relativeHumidity
        + 0.00292 * airTemp * relativeHumidity - 4.064;
    const alerts = summarizeAlerts(
        typeof currentAlerts !== 'undefined' ? currentAlerts : []
    );
    const precipitation = resolveCurrentPrecipitation(rawWmo);
    const wmo = precipitation.observed
        && !precipitation.active
        && rawWmo.precip
        && !rawWmo.thunder
        ? classifyWmoWeather(3)
        : rawWmo;

    const context = {
        now,
        temp: airTemp,
        humidity: relativeHumidity,
        tempBand: getCommentTemperatureBand(airTemp),
        code,
        rawWmo,
        wmo,
        time,
        wind10m,
        displayWind,
        gust,
        visibility,
        precipProbability,
        uv,
        feelsLike,
        dewPoint,
        forecastReferenceTemp,
        change1h: comparisons.change1h,
        change3h: comparisons.change3h,
        vsYesterday: comparisons.vsYesterday,
        forecastTempDelta,
        estimatedWbgt,
        alerts,
        precipitation,
        cloudCover: sourceWeather.cloudCover == null
            ? null
            : commentClamp(commentNumber(sourceWeather.cloudCover, 0), 0, 100),
        cape: sourceWeather.cape == null
            ? null
            : Math.max(0, commentNumber(sourceWeather.cape, 0)),
        willWorsen: sourceWeather.willWorsen === true,
        willImprove: sourceWeather.willImprove === true,
        maxFuturePrecipProb: commentClamp(
            commentNumber(sourceWeather.maxFuturePrecipProb, 0),
            0,
            100
        ),
        tempIn3Hours: sourceWeather.tempIn3Hours == null
            ? null
            : commentNumber(sourceWeather.tempIn3Hours, airTemp),
        yahooForecastPrecip: actualPrecipState?.hasForecastPrecip === true,
        yahooForecastType: actualPrecipState?.forecastPrecipType || 'rain'
    };
    context.emoji = wmo !== rawWmo
        ? wmo.emoji
        : getCommentWeatherEmoji(code, time.isDay, time.hour);

    context.key = [
        context.tempBand,
        Math.round(context.humidity / 5) * 5,
        context.code,
        context.precipitation.source,
        context.precipitation.active ? context.precipitation.type : 'dry',
        context.precipitation.intensity,
        Math.round(context.displayWind / 2) * 2,
        context.gust == null ? 'na' : Math.round(context.gust / 5) * 5,
        context.visibility == null ? 'na' : Math.round(context.visibility / 1000),
        Math.round(context.precipProbability / 10) * 10,
        Math.floor(context.uv / 3),
        Math.round(context.dewPoint / 2) * 2,
        context.change1h == null ? 'na' : Math.round(context.change1h),
        context.forecastTempDelta == null
            ? 'na'
            : Math.round(context.forecastTempDelta),
        context.alerts.highestLevel,
        context.alerts.names.join(','),
        context.time.period,
        `${context.time.month}-${context.time.day}`
    ].join('|');

    return context;
}

function makeAlertPrimary(context) {
    const names = context.alerts.names.join('・') || '防災気象情報';
    if (context.alerts.highestLevel >= 5) {
        return {
            topic: 'alert',
            severity: 5,
            text: `🆘 ${names}が発表中です。周囲の状況を確認し、直ちに命を守る行動を取ってください。`
        };
    }
    if (context.alerts.highestLevel === 4) {
        return {
            topic: 'alert',
            severity: 4,
            text: `🚨 ${names}が発表中です。危険な場所にいる場合は、ためらわず安全な場所へ避難してください。`
        };
    }
    return {
        topic: 'alert',
        severity: 3,
        text: `⚠️ ${names}が発表中です。最新情報と避難経路を確認し、早めに行動できるよう備えてください。`
    };
}

function precipitationPrimary(context) {
    const precip = context.precipitation;
    const measured = precip.observed ? '降水実況では、' : '';
    if (precip.type === 'snow') {
        if (precip.intensity >= 3) {
            return {
                topic: 'precipitation',
                severity: 4,
                text: `❄️ ${measured}強い雪です。移動は無理をせず、積雪や路面凍結に警戒してください。`
            };
        }
        return {
            topic: 'precipitation',
            severity: 3,
            text: `🌨️ ${measured}雪が降っています。滑りにくい靴を選び、路面の変化に注意してください。`
        };
    }
    if (precip.type === 'sleet') {
        return {
            topic: 'precipitation',
            severity: 3,
            text: `🌨️ ${measured}みぞれが降っています。濡れた路面は滑りやすいため、足元に注意してください。`
        };
    }
    if (precip.intensity >= 4) {
        return {
            topic: 'precipitation',
            severity: 4,
            text: `🌧️ ${measured}非常に激しい雨です。低い場所や水の集まる道路を避け、安全な屋内で雨雲の動きを確認してください。`
        };
    }
    if (precip.intensity >= 3) {
        return {
            topic: 'precipitation',
            severity: 3,
            text: `🌧️ ${measured}激しい雨です。視界と足元が悪くなるため、外出や運転は慎重に。`
        };
    }
    if (precip.intensity === 2) {
        return {
            topic: 'precipitation',
            severity: 2,
            text: `🌧️ ${measured}本降りの雨です。傘を用意し、濡れた路面に注意してください。`
        };
    }
    return {
        topic: 'precipitation',
        severity: 1,
        text: `☔ ${measured}弱い雨が降っています。外出には傘があると安心です。`
    };
}

function makeNormalPrimary(context) {
    const seed = context.key;
    if (context.temp >= 40) {
        return {
            topic: 'heat',
            severity: 5,
            text: '🆘 命の危険がある暑さです。屋外活動を避け、冷房のある場所で体を冷やしてください。'
        };
    }
    if (context.temp >= 35) {
        return {
            topic: 'heat',
            severity: 4,
            text: '🚨 危険な暑さです。外出は必要最小限にして、涼しい場所でこまめに休んでください。'
        };
    }
    if (context.temp >= 32) {
        return {
            topic: 'heat',
            severity: 3,
            text: '🥵 厳しい暑さです。喉が渇く前に水分を取り、長時間の屋外活動は避けてください。'
        };
    }
    if (context.temp <= 0) {
        return {
            topic: 'cold',
            severity: 3,
            text: '🥶 氷点下の厳しい寒さです。肌の露出を減らし、路面凍結にも注意してください。'
        };
    }
    if (context.temp <= 5) {
        return {
            topic: 'cold',
            severity: 2,
            text: '🧣 かなり冷えています。風を通しにくい上着で、首元や手足も暖かくしてください。'
        };
    }
    if (context.wmo.visibilityRisk) {
        return {
            topic: 'visibility',
            severity: 3,
            text: '🌫️ 霧が出ています。見通しが悪いため、移動時は速度を落として周囲をよく確認してください。'
        };
    }

    const isMuggy = context.dewPoint >= 22 && context.temp >= 24;
    const isHumid = context.dewPoint >= 18 && context.temp >= 20;
    const isDry = context.humidity <= 30 || context.dewPoint <= 2;
    const isWindy = context.displayWind >= 5 || (context.gust ?? 0) >= 10;

    if (context.time.isNight && context.temp >= 24 && isHumid) {
        return {
            topic: 'humid-night',
            severity: context.temp >= 28 ? 2 : 1,
            text: stableCommentChoice([
                '🌙 夜になっても気温と湿り気が残り、蒸し暑く感じられます。就寝前も室温を調整してください。',
                '🌙 夜も空気が湿っており、体に熱がこもりやすい状態です。無理に冷房を切らず、寝苦しさを避けましょう。'
            ], seed)
        };
    }

    if (context.temp >= 27 && isMuggy) {
        return {
            topic: 'humid-heat',
            severity: context.estimatedWbgt >= 28 ? 3 : 2,
            text: stableCommentChoice([
                '🌡️ 湿った空気に覆われ、気温以上に蒸し暑さが強まりやすい状況です。風通しを確保し、早めに水分を取ってください。',
                '🌡️ かなり蒸し暑い空気です。日陰でも体に熱がこもりやすいため、無理をせず休憩を挟みましょう。',
                '🌡️ 気温に加えて空気の湿り気が強く、汗が乾きにくい暑さです。室内でも暑さ対策が必要です。'
            ], seed)
        };
    }

    if (context.temp >= 27 && isDry && context.time.isDay
        && ['clear', 'mostly-clear', 'partly-cloudy'].includes(context.wmo.key)) {
        return {
            topic: 'dry-heat',
            severity: 2,
            text: stableCommentChoice([
                '☀️ 乾いた暑さで、日なたでは気温の数字以上に厳しく感じられそうです。汗に気づきにくくても水分補給を。',
                '☀️ 空気は比較的乾いていますが、日差しの下ではしっかり暑い陽気です。外では日陰を選んでください。'
            ], seed)
        };
    }

    if (context.temp <= 13 && isWindy) {
        return {
            topic: 'wind-chill',
            severity: context.temp <= 8 ? 2 : 1,
            text: stableCommentChoice([
                `🧥 風があるため、気温${context.temp.toFixed(0)}°Cより肌寒く感じられます。風を通しにくい上着が役立ちそうです。`,
                '🧥 冷たい風で体感が下がりやすい状況です。首元を覆える服装がよいでしょう。'
            ], seed)
        };
    }

    if (context.change1h !== null && context.change1h >= 1.5
        && context.temp < 30) {
        return {
            topic: 'warming-trend',
            severity: 1,
            text: `🌡️ この1時間で気温が約${context.change1h.toFixed(1)}°C上がっています。体を動かすなら、脱ぎ着しやすい服装がよさそうです。`
        };
    }

    if (context.change1h !== null && context.change1h <= -1.5
        && context.temp > 5) {
        return {
            topic: 'cooling-trend',
            severity: 1,
            text: `🌡️ この1時間で気温が約${Math.abs(context.change1h).toFixed(1)}°C下がりました。外では一枚足せる用意があると安心です。`
        };
    }

    if (context.temp >= 28) {
        return {
            topic: 'temperature',
            severity: 2,
            text: stableCommentChoice([
                '🌡️ 暑さがはっきり感じられる気温です。無理をせず、こまめに休憩してください。',
                '☀️ 体に熱がこもりやすい陽気です。水分を取りながら過ごしてください。',
                '🌡️ 日中らしい暑さです。長く外にいる場合は、日陰で休む時間をつくりましょう。'
            ], seed)
        };
    }
    if (context.temp < 10) {
        return {
            topic: 'temperature',
            severity: 1,
            text: stableCommentChoice([
                `🧥 冷え込んでいます。${isDry ? '空気も乾いているため、暖かさと乾燥の両方に備えてください。' : '暖かい上着が必要です。'}`,
                `🌡️ 寒さを感じる気温です。${context.humidity >= 85 ? '湿った冷たさなので、体を濡らさないように。' : '体を冷やさない服装で。'}`
            ], seed)
        };
    }

    const weatherText = context.wmo.key === 'clear'
        ? context.time.isDay ? 'よく晴れています。' : '穏やかな晴れの夜です。'
        : context.wmo.key === 'mostly-clear'
            ? 'おおむね晴れています。'
            : context.wmo.key === 'partly-cloudy'
                ? '晴れ間と雲が混じる空です。'
                : context.wmo.key === 'overcast'
                    ? '雲の多い空です。'
                    : '落ち着いた天気です。';
    const comfortText = context.temp >= 22
        ? isHumid ? '湿り気があり、動くとやや蒸し暑く感じそうです。' : '動くと少し暖かく感じそうです。'
        : context.temp >= 18
            ? '過ごしやすい気温です。'
            : context.temp >= 14
                ? '少しひんやりします。'
                : '上着があると安心です。';
    const airText = isDry
        ? '空気は乾燥気味です。'
        : context.temp < 18 && context.humidity >= 85
            ? '湿り気のある、ひんやりした空気です。'
            : '';

    return {
        topic: 'weather',
        severity: 0,
        text: `${context.emoji} ${weatherText}${comfortText}${airText}`
    };
}

function selectPrimaryComment(context) {
    if (context.alerts.highestLevel >= 3) return makeAlertPrimary(context);

    if (context.wmo.thunder) {
        return {
            topic: 'thunder',
            severity: 4,
            text: '⛈️ 雷雨です。屋外や大きな木の下を避け、丈夫な建物の中へ移動してください。'
        };
    }
    if (context.precipitation.active && context.precipitation.observed) {
        return precipitationPrimary(context);
    }
    if (context.wmo.freezing) {
        return {
            topic: 'freezing-precipitation',
            severity: 4,
            text: '🧊 凍結性の降水です。濡れて見える路面や階段でも凍っている可能性があるため、徒歩も運転も慎重に。'
        };
    }
    if (context.precipitation.active) return precipitationPrimary(context);
    if (context.visibility !== null && context.visibility < 1000) {
        return {
            topic: 'visibility',
            severity: 4,
            text: '🌫️ 視界が1km未満です。不要な移動を避け、運転する場合は十分に速度を落としてください。'
        };
    }
    if (context.gust !== null && context.gust >= 25) {
        return {
            topic: 'wind',
            severity: 4,
            text: '💨 瞬間的に非常に強い風が予想されます。飛来物や転倒に警戒し、屋外では無理をしないでください。'
        };
    }
    return makeNormalPrimary(context);
}

function getSupplementCandidates(context, primary) {
    const candidates = [];
    const add = (topic, priority, importance, text) => {
        candidates.push({ topic, priority, importance, text });
    };

    // 注意報は直上の公式警報バナーで常時表示する。
    // 一言コメントでは重複させず、暑さ・降雨など今必要な行動に集中する。

    if (primary.topic === 'alert') {
        if (context.wmo.thunder) {
            add('thunder', 1, 4, '⛈️ 現在は雷にも警戒が必要です。屋外から離れてください。');
        } else if (context.precipitation.active
            && context.precipitation.observed) {
            const source = context.precipitation.observed ? '降水実況では、' : '';
            const type = context.precipitation.type === 'snow' ? '雪'
                : context.precipitation.type === 'sleet' ? 'みぞれ' : '雨';
            add('precipitation', 2, 3, `${context.precipitation.type === 'snow' ? '❄️' : '🌧️'} ${source}${type}が降っています。`);
        } else if (context.wmo.freezing) {
            add('freezing-precipitation', 1, 4, '🧊 着氷や路面凍結にも警戒してください。');
        } else if (context.precipitation.active) {
            const type = context.precipitation.type === 'snow' ? '雪'
                : context.precipitation.type === 'sleet' ? 'みぞれ' : '雨';
            add('precipitation', 2, 3, `${context.precipitation.type === 'snow' ? '❄️' : '🌧️'} ${type}が降っています。`);
        }
    }

    if (context.temp >= 35 && primary.topic !== 'heat') {
        add('heat', 2, 4, '🥵 危険な暑さも重なっています。涼しい場所で体を冷やしてください。');
    } else if (context.temp <= 0 && primary.topic !== 'cold') {
        add('cold', 3, 3, '🥶 氷点下です。濡れた場所の凍結にも注意してください。');
    }

    if (context.gust !== null && context.gust >= 20 && primary.topic !== 'wind') {
        add('wind', 3, 4, `💨 瞬間風速は約${context.gust.toFixed(0)}m/s。飛ばされやすい物から離れてください。`);
    } else if (context.displayWind >= 8 && primary.topic !== 'wind') {
        add('wind', 5, 2, '💨 風が強めです。傘や自転車は風にあおられないよう注意してください。');
    }

    if (context.visibility !== null && context.visibility < 4000
        && primary.topic !== 'visibility') {
        add('visibility', 3, 3, '🌫️ 見通しが悪いため、移動時は周囲をよく確認してください。');
    }

    if (!context.precipitation.active) {
        if (context.yahooForecastPrecip) {
            const type = context.yahooForecastType === 'snow' ? '雪'
                : context.yahooForecastType === 'sleet' ? 'みぞれ' : '雨';
            add('precipitation-forecast', 4, 3, `☂️ 1時間以内に${type}が降る可能性があります。外出には傘があると安心です。`);
        } else if (context.precipProbability >= 70) {
            add('precipitation-forecast', 5, 3, `☂️ 降水確率は${context.precipProbability.toFixed(0)}%。外出には傘があると安心です。`);
        } else if (context.willWorsen && context.maxFuturePrecipProb >= 60) {
            add('precipitation-forecast', 5, 3, '🌥️ 数時間以内に天気が崩れる可能性があります。空模様の変化に注意してください。');
        }
    }

    const feelsDiff = context.feelsLike - context.temp;
    if (Number.isFinite(feelsDiff)
        && Math.abs(feelsDiff) >= 4
        && !['heat', 'cold', 'humid-heat', 'wind-chill'].includes(primary.topic)) {
        add(
            'feels-like',
            6,
            2,
            feelsDiff > 0
                ? `🌡️ 湿り気の影響で、参考体感温度は約${context.feelsLike.toFixed(0)}°Cです。`
                : `🌡️ 風の影響で、参考体感温度は約${context.feelsLike.toFixed(0)}°Cです。`
        );
    }

    if (context.forecastTempDelta !== null
        && Math.abs(context.forecastTempDelta) >= 3
        && !['warming-trend', 'cooling-trend'].includes(primary.topic)) {
        const direction = context.forecastTempDelta > 0 ? '上がる' : '下がる';
        add(
            'temperature-outlook',
            6,
            2,
            `🌡️ 3時間後には気温が約${Math.abs(context.forecastTempDelta).toFixed(0)}°C${direction}見込みです。服装で調整できるようにしてください。`
        );
    }

    if (context.time.isDay && context.uv >= 8
        && !context.precipitation.active
        && primary.severity < 3) {
        add('uv', 7, 2, `☀️ UV指数は${context.uv.toFixed(0)}。短時間の外出でも紫外線対策を。`);
    }

    if (context.humidity <= 30
        && !context.precipitation.active
        && primary.severity < 3) {
        add('dryness', 8, 1, `💧 湿度は${context.humidity.toFixed(0)}%。乾燥対策を忘れずに。`);
    }

    if (context.temp >= 28 && context.estimatedWbgt >= 28
        && primary.topic !== 'heat'
        && primary.severity < 4) {
        add(
            'heat',
            4,
            3,
            `⚠️ 簡易推定WBGTは${context.estimatedWbgt.toFixed(0)}。こまめに休憩してください。`
        );
    }

    return candidates;
}

function selectWeatherCommentParts(context) {
    const primary = selectPrimaryComment(context);
    const usedTopics = new Set([primary.topic]);
    const parts = [primary];
    const candidates = getSupplementCandidates(context, primary)
        .filter(candidate => candidate.importance >= 2)
        .sort((a, b) => a.priority - b.priority
            || b.importance - a.importance
            || a.topic.localeCompare(b.topic));

    const topicFamily = topic => {
        if (['heat', 'humid-heat', 'dry-heat', 'humid-night', 'feels-like'].includes(topic)) {
            return 'heat-feel';
        }
        if (['cold', 'wind-chill'].includes(topic)) return 'cold-feel';
        if (['warming-trend', 'cooling-trend', 'temperature-outlook'].includes(topic)) {
            return 'temperature-change';
        }
        if (['precipitation', 'precipitation-forecast'].includes(topic)) {
            return 'precipitation';
        }
        return topic;
    };
    const usedFamilies = new Set([topicFamily(primary.topic)]);

    for (const candidate of candidates) {
        if (usedTopics.has(candidate.topic)) continue;
        if (usedFamilies.has(topicFamily(candidate.topic))) continue;
        const supplementCount = parts.length - 1;
        if (supplementCount >= 1
            && !(primary.severity >= 3 && candidate.importance >= 3)) continue;
        parts.push(candidate);
        usedTopics.add(candidate.topic);
        usedFamilies.add(topicFamily(candidate.topic));
        if (parts.length >= 3) break;
    }

    return parts;
}

function composeWeatherComment(context) {
    return formatWeatherComment(
        selectWeatherCommentParts(context).map(part => part.text).join(' ')
    );
}

function updateHeroSection(temp, humidity, emoji, wc, fl, ws, pp) {
    const heroTempEl = document.getElementById('heroTemp');
    if (!heroTempEl) return;

    const tempParts = temp.toFixed(1).split('.');
    const newTempHtml = `${tempParts[0]}<span class="temp-decimal">.${tempParts[1]}</span>`;
    if (heroTempEl.innerHTML !== newTempHtml) {
        heroTempEl.innerHTML = newTempHtml;
        heroTempEl.classList.remove('temp-updated');
        void heroTempEl.offsetWidth;
        heroTempEl.classList.add('temp-updated');
    }

    heroTempEl.classList.remove(
        'temp-freezing', 'temp-cold', 'temp-cool', 'temp-mild',
        'temp-warm', 'temp-hot', 'temp-extreme'
    );
    if (temp < 0) heroTempEl.classList.add('temp-freezing');
    else if (temp < 10) heroTempEl.classList.add('temp-cold');
    else if (temp < 15) heroTempEl.classList.add('temp-cool');
    else if (temp < 20) heroTempEl.classList.add('temp-mild');
    else if (temp < 25) heroTempEl.classList.add('temp-warm');
    else if (temp < 30) heroTempEl.classList.add('temp-hot');
    else heroTempEl.classList.add('temp-extreme');

    const frostIntensity = temp < 5 ? Math.min(1, (5 - temp) / 15) : 0;
    document.documentElement.style.setProperty('--frost-intensity', frostIntensity);

    const heroIconEl = document.getElementById('heroWeatherIcon');
    const heroCondEl = document.getElementById('heroCondition');
    const precipOverride = typeof getCurrentWeatherOverride === 'function'
        ? getCurrentWeatherOverride()
        : null;

    if (precipOverride?.isActive) {
        if (heroIconEl) heroIconEl.textContent = precipOverride.icon;
        if (heroCondEl) heroCondEl.textContent = precipOverride.condition;
    } else {
        if (heroIconEl) heroIconEl.textContent = emoji;
        if (heroCondEl) {
            heroCondEl.textContent = getWeatherConditionName(
                wc,
                weatherData?.cloudCover ?? null
            );
        }
    }

    if (window.animateNumber) {
        window.animateNumber('heroFeelsLike', fl.toFixed(1));
        window.animateNumber('heroHumidity', Math.round(humidity));
        window.animateNumber('heroWind', ws.toFixed(1));
        window.animateNumber('heroPrecip', pp || 0);
    } else {
        const values = {
            heroFeelsLike: fl.toFixed(1),
            heroHumidity: Math.round(humidity),
            heroWind: ws.toFixed(1),
            heroPrecip: pp || 0
        };
        for (const [id, value] of Object.entries(values)) {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        }
    }
}

function renderWeatherComment(context, comment) {
    updateHeroSection(
        context.temp,
        context.humidity,
        context.emoji,
        context.code,
        context.feelsLike,
        context.displayWind,
        context.precipProbability
    );

    const emojiEl = document.querySelector('.greeting-text .emoji');
    if (emojiEl) {
        const override = typeof getCurrentWeatherOverride === 'function'
            ? getCurrentWeatherOverride()
            : null;
        emojiEl.textContent = override?.isActive
            ? override.icon
            : context.emoji;
    }
    const greetingMainEl = document.getElementById('greetingMain');
    if (greetingMainEl) greetingMainEl.textContent = context.time.greeting;
    const weatherCommentEl = document.getElementById('weatherComment');
    if (weatherCommentEl) weatherCommentEl.textContent = comment;
    document.getElementById('greetingSection')?.classList.add('show');
}

function updateGreeting(temp, humidity) {
    const context = buildWeatherCommentContext(temp, humidity);
    const conditionsChanged = context.key !== lastConditionKey;
    const comment = !conditionsChanged && lastComment
        ? lastComment
        : composeWeatherComment(context);

    if (conditionsChanged || !lastComment) {
        lastConditionKey = context.key;
        lastComment = comment;
    }
    renderWeatherComment(context, comment);
}

function getWeatherConditionName(code, cloudCover = null) {
    if (code >= 0 && code <= 3 && cloudCover !== null) {
        if (cloudCover <= 10) return '快晴';
        if (cloudCover <= 25) return 'ほぼ晴れ';
        if (cloudCover <= 50) return '晴れ';
        if (cloudCover <= 70) return '晴れ時々曇り';
        if (cloudCover <= 85) return 'やや曇り';
        return '曇り';
    }
    return classifyWmoWeather(code).label === '天気情報なし'
        ? '--'
        : classifyWmoWeather(code).label;
}
