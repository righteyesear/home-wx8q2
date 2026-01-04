// =====================================================
// comments.js - 一言コメント生成
// =====================================================
// 修正時: 天気・気温・湿度に応じた一言コメント生成
//
// 主要関数:
// - updateGreeting() - メインコメント生成（約2600行）
// - getWeatherConditionName() - 天気コード→日本語変換
//
// 依存: config.js, precipitation.js (actualPrecipState), ui.js

// Generate time-based greeting and weather comment
function updateGreeting(temp, humidity) {
    const now = new Date();
    const hour = now.getHours();
    const month = now.getMonth() + 1;
    let greeting, emoji;

    // Time-based greeting
    if (hour >= 4 && hour < 6) { greeting = '早起きですね'; }
    else if (hour >= 6 && hour < 10) { greeting = 'おはようございます'; }
    else if (hour >= 10 && hour < 12) { greeting = '良い午前を'; }
    else if (hour >= 12 && hour < 17) { greeting = 'こんにちは'; }
    else if (hour >= 17 && hour < 21) { greeting = 'こんばんは'; }
    else { greeting = 'お夜更かしですか？'; }

    // Weather-based emoji (combines weather + time of day)
    const wcEmoji = weatherData?.weatherCode ?? 0;
    // Use sunrise/sunset for daytime detection
    let isDaytime = hour >= 6 && hour < 18; // fallback
    if (weatherData?.sunrise && weatherData?.sunset) {
        const sunriseTime = new Date(weatherData.sunrise);
        const sunsetTime = new Date(weatherData.sunset);
        isDaytime = (now >= sunriseTime && now < sunsetTime);
    }
    const isNighttime = !isDaytime;

    // Weather code to emoji mapping (Complete Open-Meteo WMO codes)
    const getWeatherEmoji = (code, isDay) => {
        // Thunderstorm with heavy hail (99)
        if (code === 99) return '⛈️';
        // Thunderstorm with slight/moderate hail (96)
        if (code === 96) return '⛈️';
        // Thunderstorm slight/moderate (95)
        if (code === 95) return '🌩️';
        // Snow showers heavy (86)
        if (code === 86) return '🌨️';
        // Snow showers slight (85)
        if (code === 85) return '🌨️';
        // Rain showers violent (82)
        if (code === 82) return '🌧️';
        // Rain showers moderate (81)
        if (code === 81) return '🌦️';
        // Rain showers slight (80)
        if (code === 80) return '🌦️';
        // Snow grains (77)
        if (code === 77) return '🌨️';
        // Heavy snow fall (75)
        if (code === 75) return '❄️';
        // Moderate snow fall (73)
        if (code === 73) return '🌨️';
        // Slight snow fall (71)
        if (code === 71) return '🌨️';
        // Freezing rain heavy (67)
        if (code === 67) return '🌧️';
        // Freezing rain light (66)
        if (code === 66) return '🌧️';
        // Freezing drizzle heavy (57)
        if (code === 57) return '🌧️';
        // Freezing drizzle light (56)
        if (code === 56) return '🌧️';
        // Rain heavy (65)
        if (code === 65) return '🌧️';
        // Rain moderate (63)
        if (code === 63) return '🌧️';
        // Rain slight (61)
        if (code === 61) return '🌦️';
        // Drizzle dense (55)
        if (code === 55) return '🌦️';
        // Drizzle moderate (53)
        if (code === 53) return '🌦️';
        // Drizzle light (51)
        if (code === 51) return '🌦️';
        // Depositing rime fog (48)
        if (code === 48) return '🌫️';
        // Fog (45)
        if (code === 45) return '🌫️';
        // Overcast (3)
        if (code === 3) return '☁️';
        // Mainly cloudy (2)
        if (code === 2) return isDay ? '⛅' : '☁️';
        // Partly cloudy (1)
        if (code === 1) return isDay ? '🌤️' : '🌙';
        // Clear sky (0)
        if (code === 0) {
            if (hour >= 4 && hour < 6) return '🌅';  // Dawn
            if (hour >= 6 && hour < 8) return '🌅';  // Sunrise
            if (hour >= 16 && hour < 18) return '🌇'; // Sunset
            if (hour >= 18 && hour < 20) return '🌆'; // Dusk
            if (isDay) return '☀️';                  // Day
            return '🌙';                              // Night
        }
        return isDay ? '🌤️' : '🌙'; // Default
    };

    emoji = getWeatherEmoji(wcEmoji, isDaytime);

    const t = `<span class="temp-highlight">${temp.toFixed(1)}°C</span>`;
    const h = Math.round(humidity);

    // Weather API data (wind speed adjusted to 2m height: 0.6x factor)
    const wc = weatherData?.weatherCode ?? -1;
    const cloudCover = weatherData?.cloudCover ?? null;
    const pp = weatherData?.precipProb ?? 0;
    const wsRaw = weatherData?.windSpeed ?? 0;  // 10m height from API
    const ws = wsRaw * 0.6;  // Adjusted to 2m height (0.6x factor)
    const uv = weatherData?.uvIndex ?? 0;
    // Always use custom feels-like calculation (3-zone physics model)
    const fl = calculateFeelsLike(temp, humidity, wsRaw);

    // Weather state detection (detailed)
    const isThunderstorm = wc >= 95;
    const isHeavySnow = wc >= 75 && wc < 80;
    const isSnow = wc >= 71 && wc < 75;
    const isSleet = wc >= 80 && wc < 82;
    const isHeavyRain = wc >= 82 && wc < 95;
    const isModerateRain = wc >= 63 && wc < 67;
    const isRain = wc >= 61 && wc < 63;
    const isDrizzle = wc >= 51 && wc < 61;
    const isFog = wc >= 45 && wc < 51;
    const isOvercast = wc >= 3 && wc < 45;
    const isPartlyCloudy = wc === 2;
    const isClear = wc >= 0 && wc <= 1;
    const isRainingOpenMeteo = isThunderstorm || isHeavyRain || isModerateRain || isRain || isDrizzle;
    // Yahoo APIの実測データを優先、なければOpen-Meteoを使用
    const isRaining = actualPrecipState?.isRaining ?? isRainingOpenMeteo;

    // Yahoo API降水タイプでisSnow/isSleetを判定（実際に降水がある場合のみ）
    // actualPrecipState.isRaining が true の場合のみ precipType を考慮
    const isActuallyPrecipitating = actualPrecipState?.isRaining === true;
    const isSnowYahoo = isActuallyPrecipitating && actualPrecipState?.precipType === 'snow';
    const isSleetYahoo = isActuallyPrecipitating && actualPrecipState?.precipType === 'sleet';
    const isSnowActual = isSnowYahoo || isHeavySnow || isSnow;
    const isSleetActual = isSleetYahoo || isSleet;

    // Wind levels (more detailed)
    const isCalm = ws < 3;
    const isLightBreeze = ws >= 3 && ws < 8;
    const isWindy = ws >= 8 && ws < 15;
    const isVeryWindy = ws >= 15 && ws < 25;
    const isStormWind = ws >= 25;
    const willRain = pp >= 50 && !isRaining;

    // Humidity levels (more detailed)
    const isExtremelyDry = humidity < 20;
    const isVeryDry = humidity >= 20 && humidity < 30;
    const isDry = humidity >= 30 && humidity < 45;
    const isComfortableHumid = humidity >= 45 && humidity < 60;
    const isHumid = humidity >= 60 && humidity < 75;
    const isVeryHumid = humidity >= 75 && humidity < 85;
    const isExtremelyHumid = humidity >= 85;

    // UV levels
    const isHighUV = uv >= 6;
    const isVeryHighUV = uv >= 8;
    const isExtremeUV = uv >= 11;

    // Visibility levels
    const visibility = weatherData?.visibility ?? null;  // メートル
    const isExcellentVisibility = visibility !== null && visibility >= 50000;  // 50km+: 富士山が見える
    const isGoodVisibility = visibility !== null && visibility >= 20000 && visibility < 50000;
    const isPoorVisibility = visibility !== null && visibility < 4000;  // 霧やスモッグ
    const isVeryPoorVisibility = visibility !== null && visibility < 1000;  // 濃霧

    // Wind direction (degrees to cardinal)
    const windDir = weatherData?.windDirection ?? null;
    const isNorthWind = windDir !== null && (windDir >= 337.5 || windDir < 22.5);  // 北風
    const isSouthWind = windDir !== null && windDir >= 157.5 && windDir < 202.5;  // 南風
    const isWestWind = windDir !== null && windDir >= 247.5 && windDir < 292.5;  // 西風
    const isEastWind = windDir !== null && windDir >= 67.5 && windDir < 112.5;  // 東風

    // Wind gusts (瞬間最大風速)
    const windGusts = weatherData?.windGusts ?? null;
    const hasStrongGusts = windGusts !== null && windGusts >= 10;  // 傘が飛ばされやすい
    const hasDangerousGusts = windGusts !== null && windGusts >= 20;  // 歩行困難

    // Atmospheric pressure
    const pressure = weatherData?.pressureMsl ?? null;
    const isLowPressure = pressure !== null && pressure < 1005;  // 低気圧接近
    const isHighPressure = pressure !== null && pressure >= 1020;  // 高気圧圏内

    // CAPE (Convective Available Potential Energy) - thunderstorm potential
    const cape = weatherData?.cape ?? null;
    const isUnstableAtmosphere = cape !== null && cape >= 500;  // 大気不安定
    const isVeryUnstable = cape !== null && cape >= 1000;  // 雷雨リスク高

    // Time period (uses sunrise/sunset when available)
    let sunriseHour = 6, sunsetHour = 18; // fallback
    if (weatherData?.sunrise && weatherData?.sunset) {
        sunriseHour = new Date(weatherData.sunrise).getHours();
        sunsetHour = new Date(weatherData.sunset).getHours();
    }
    const isMorning = hour >= sunriseHour && hour < 12;
    const isAfternoon = hour >= 12 && hour < sunsetHour;
    const isEvening = hour >= sunsetHour && hour < sunsetHour + 4;
    const isNight = hour >= sunsetHour + 4 || hour < sunriseHour;

    // Season detection
    const isSummer = month >= 6 && month <= 8;
    const isWinter = month === 12 || month <= 2;
    const isRainy = month === 6 || month === 7;
    const isSpring = month >= 3 && month <= 5;
    const isAutumn = month >= 9 && month <= 11;

    // Feels-like difference
    const feelsHotter = fl > temp + 2;
    const feelsColder = fl < temp - 2;

    // Day of week
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isMonday = dayOfWeek === 1;
    const isFriday = dayOfWeek === 5;

    // WBGT (Wet Bulb Globe Temperature) - Heat stress index
    const wbgt = 0.735 * temp + 0.0374 * humidity + 0.00292 * temp * humidity - 4.064;
    const isDangerWBGT = wbgt >= 31;
    const isHighWBGT = wbgt >= 28 && wbgt < 31;
    const isModerateWBGT = wbgt >= 25 && wbgt < 28;

    // Seasonal events (stricter date ranges)
    const dayOfMonth = now.getDate();
    const isNewYear = month === 1 && dayOfMonth <= 2;  // 1/1〜2日のみ（強めのお正月）
    const isMatsunouchi = month === 1 && dayOfMonth <= 7;  // 松の内（1/1〜7日）
    const isCherryBlossom = month >= 3 && month <= 4 && temp >= 12 && temp <= 22;  // 気温条件のみ
    const isGoldenWeek = month === 5 && dayOfMonth >= 3 && dayOfMonth <= 6;  // GW期間
    const isFireworkSeason = (month === 7 || month === 8) && isEvening && (isWeekend || Math.random() < 0.3);  // 週末夕方、または平日30%
    const isAutumnLeaves = month >= 10 && month <= 11 && temp >= 8 && temp <= 18;
    // Christmas: 24日=イブ, 25日=当日のみ。23日は前日扱い
    const isChristmasEve = month === 12 && dayOfMonth === 24;
    const isChristmasDay = month === 12 && dayOfMonth === 25;
    const isChristmasEveEve = month === 12 && dayOfMonth === 23;  // 前日
    const isYearEnd = month === 12 && dayOfMonth >= 28;  // 28日以降

    // Health conditions
    const isPollenSeason = (month >= 2 && month <= 5) && !isRaining && isClear;
    const isDrySkinRisk = isExtremelyDry || isVeryDry;
    const isHeatstrokeRisk = temp >= 28 && (humidity >= 60 || wbgt >= 25);
    const isColdRisk = (isWinter || temp < 10) && (isDrySkinRisk || isVeryWindy);
    const isDehydrationRisk = temp >= 25 || (temp >= 20 && humidity < 40);

    // Clothing suggestions based on temp
    const clothingSuggestion = temp >= 28 ? '半袖1枚' :
        temp >= 22 ? '薄手のシャツ' :
            temp >= 18 ? '長袖シャツ' :
                temp >= 14 ? '薄手のカーディガン' :
                    temp >= 10 ? '厚手のカーディガン' :
                        temp >= 5 ? 'セーター＋コート' :
                            'ダウン＋マフラー';

    // Random selector helper
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // ============================================================
    // CONDITION CHANGE DETECTION
    // ============================================================
    // Generate condition key based on significant factors
    const getTempBand = (t) => {
        if (t >= 40) return 'extreme-hot';
        if (t >= 35) return 'very-hot';
        if (t >= 32) return 'hot';
        if (t >= 28) return 'warm-hot';
        if (t >= 25) return 'warm';
        if (t >= 22) return 'comfortable-warm';
        if (t >= 18) return 'comfortable';
        if (t >= 14) return 'cool';
        if (t >= 10) return 'chilly';
        if (t >= 5) return 'cold';
        if (t >= 0) return 'very-cold';
        if (t >= -5) return 'freezing';
        return 'extreme-cold';
    };

    const getTimePeriod = (h) => {
        if (h >= 6 && h < 12) return 'morning';
        if (h >= 12 && h < 18) return 'afternoon';
        if (h >= 18 && h < 22) return 'evening';
        return 'night';
    };

    const alertKey = currentAlerts.map(a => a.name).sort().join(',');
    const conditionKey = `${getTempBand(temp)}|${wc}|${getTimePeriod(hour)}|${alertKey}`;

    // Check if conditions changed
    const conditionsChanged = conditionKey !== lastConditionKey;

    // If conditions haven't changed and we have a previous comment, reuse it with updated temperature
    if (!conditionsChanged && lastComment) {
        document.getElementById('greetingSection')?.classList.add('show');
        // These elements may not exist in current UI - use optional chaining
        const emojiEl = document.querySelector('.greeting-text .emoji');
        if (emojiEl) emojiEl.textContent = emoji;
        const greetingMainEl = document.getElementById('greetingMain');
        if (greetingMainEl) greetingMainEl.textContent = greeting;
        // Update temperature in previous comment to current value
        const updatedComment = lastComment.replace(
            /<span class="temp-highlight">[0-9.-]+°C<\/span>/g,
            `<span class="temp-highlight">${temp.toFixed(1)}°C</span>`
        );
        const weatherCommentEl = document.getElementById('weatherComment');
        if (weatherCommentEl) weatherCommentEl.innerHTML = updatedComment;
        return;
    }

    let comment = '';


    // ============================================================
    // PRIORITY 1: Hazardous weather (thunderstorm) - Expanded
    // ============================================================
    if (isThunderstorm) {
        if (temp >= 30 && isExtremelyHumid) {
            comment = pick([
                `⛈️ ${t}・湿度${h}% — 猛暑の中の雷雨！蒸し風呂状態。エアコンの効いた室内へ`,
                `⛈️ ${t} — 蒸し暑い中、激しい雷雨！体調管理に注意`,
                `⛈️ ${t} — 真夏日の雷雨。落雷と熱中症に警戒`
            ]);
        } else if (temp >= 28 && isSummer) {
            comment = pick([
                `⛈️ ${t} — 夏の夕立ですね。激しい雷雨。落雷に注意して屋内へ`,
                `⛈️ ${t} — 真夏の雷雨。急な大雨にご注意を`,
                `⛈️ ${t} — 夏によくある急な雷雨。傘をさしても危険`,
                `⛈️ ${t} — 夏の雷。ゲリラ豪雨です。屋内へ避難を`
            ]);
        } else if (temp >= 25) {
            comment = pick([
                `⛈️ ${t} — 雷雨発生中！蒸し暑さの中、激しい雨。屋内に避難を`,
                `⛈️ ${t} — 雷鳴が聞こえます。建物の中が安全`,
                `⛈️ ${t} — 落雷に注意！大きな木の下は危険です`,
                `⛈️ ${t} — 雷雲が発達中。しばらく屋内で待機を`
            ]);
        } else if (temp >= 15 && isSpring) {
            comment = pick([
                `⛈️ ${t} — 春雷です。急な雨と雷。傘があっても屋内が安全`,
                `⛈️ ${t} — 春の嵐。激しい雷雨にご注意を`,
                `⛈️ ${t} — 春雷とにわか雨。天気の急変に注意`
            ]);
        } else if (temp >= 10) {
            comment = pick([
                `⛈️ ${t} — 冷たい雷雨。濡れると体が冷えます。建物内へ`,
                `⛈️ ${t} — 寒い中の雷雨。低体温症に注意`,
                `⛈️ ${t} — 冷えます。暖かい場所で雷が収まるのを待って`
            ]);
        } else if (isNight) {
            comment = pick([
                `⛈️ ${t} — 夜間の雷雨。窓から離れて安全に過ごして`,
                `⛈️ ${t} — 真夜中の雷。PCなどの電源に注意`,
                `⛈️ ${t} — 雷鳴で起きましたか？安全な場所でお過ごしを`
            ]);
        } else if (isVeryWindy || isStormWind) {
            comment = pick([
                `⛈️ ${t} — 雷雨と強風！飛来物に注意。窓から離れて`,
                `⛈️ ${t} — 暴風雨。外出は危険。建物の奥へ避難を`,
                `⛈️ ${t} — 激しい雷と風。停電に備えて懐中電灯を`
            ]);
        } else {
            comment = pick([
                `⛈️ ${t} — 雷雨です。落雷の危険あり。安全な場所でお過ごしを`,
                `⛈️ ${t} — 雷が鳴っています。屋外活動は中止を`,
                `⛈️ ${t} — 雷雨発生中。金属から離れて安全に`,
                `⛈️ ${t} — 不安定な天気。しばらく屋内で待機を`
            ]);
        }
        if (isStormWind) comment += ' 🌀 暴風注意！';
    }
    // ============================================================
    // PRIORITY 2: Heavy Snow - Expanded
    // ============================================================
    else if (isHeavySnow) {
        if (temp <= -10) {
            comment = pick([
                `❄️ ${t} — 猛吹雪！極寒です。外出は命に関わります`,
                `❄️ ${t} — 記録的大雪と極寒。不要不急の外出は控えて`,
                `❄️ ${t} — 凍てつく寒さの猛吹雪。絶対に外に出ないで`
            ]);
        } else if (temp <= -5 && isStormWind) {
            comment = pick([
                `❄️ ${t} — 猛吹雪です。視界ゼロ。絶対に外出しないで`,
                `❄️ ${t} — ホワイトアウト状態。車の運転は危険`,
                `❄️ ${t} — 猛烈な吹雪。停電に備えて暖房の代替を`
            ]);
        } else if (temp <= -5) {
            comment = pick([
                `❄️ ${t} — 厳しい寒さの中、大雪が降っています。路面完全凍結`,
                `❄️ ${t} — 極寒の大雪。凍傷に注意。肌を露出しないで`,
                `❄️ ${t} — 記録的な寒さと大雪。交通機関は麻痺状態`
            ]);
        } else if (temp <= 0 && isVeryWindy) {
            comment = pick([
                `❄️ ${t} — 吹雪いています。視界不良と凍結に厳重注意`,
                `❄️ ${t} — 風を伴う大雪。体感温度はもっと低い`,
                `❄️ ${t} — 吹雪で前が見えません。外出は危険`
            ]);
        } else if (temp <= 0 && isNight) {
            comment = pick([
                `❄️ ${t} — 夜間の大雪。朝までにかなり積もりそう`,
                `❄️ ${t} — 静かに降り積もる雪。明日の朝は注意`,
                `❄️ ${t} — 真夜中の大雪。明朝の交通機関を確認して`
            ]);
        } else if (temp <= 0) {
            comment = pick([
                `❄️ ${t} — 本格的な雪。積もりそうです。早めの帰宅を`,
                `❄️ ${t} — 東京では珍しい大雪。交通情報を確認して`,
                `❄️ ${t} — どんどん積もっています。転倒に注意`,
                `❄️ ${t} — 大雪で電車が遅れるかも。予定の調整を`
            ]);
        } else {
            comment = pick([
                `❄️ ${t} — 湿った重い雪。傘がすぐ壊れそう。足元注意`,
                `🌨️ ${t} — べた雪が降っています。歩きにくい`,
                `🌨️ ${t} — 湿った雪。木の枝が折れるかも。頭上注意`
            ]);
        }
    }
    // ============================================================
    // PRIORITY 3: Snow - Expanded
    // ============================================================
    else if (isSnowActual || isSleetActual) {
        if (temp <= -5) {
            comment = pick([
                `❄️ ${t} — 厳しい寒さの中、雪が降り続いています。路面完全凍結`,
                `❄️ ${t} — 極寒の雪。凍傷注意。暖かい服装で`,
                `❄️ ${t} — 粉雪が舞っています。積雪注意`
            ]);
        } else if (temp <= 0 && isVeryDry) {
            comment = pick([
                `❄️ ${t} — サラサラの粉雪。積もりやすいです。足元注意`,
                `❄️ ${t} — 乾いた粉雪。スキー場みたいですね`,
                `❄️ ${t} — ふわふわの雪。綺麗だけど滑りやすい`
            ]);
        } else if (temp <= 0 && isMorning) {
            comment = pick([
                `❄️ ${t} — 朝から雪景色。通勤・通学は時間に余裕を`,
                `❄️ ${t} — 雪の朝。凍結した路面に注意して`,
                `❄️ ${t} — 朝の雪。電車の遅延情報を確認して`
            ]);
        } else if (temp <= 0) {
            comment = pick([
                `❄️ ${t} — 雪が積もりそう。足元と運転にくれぐれもご注意を`,
                `❄️ ${t} — 静かに雪が降っています。積雪注意`,
                `❄️ ${t} — 雪化粧の街。滑りにくい靴で出かけて`
            ]);
        } else if (temp <= 2 && isSleet) {
            comment = pick([
                `🌨️ ${t} — みぞれが降っています。傘が必須。滑りやすいので注意`,
                `🌨️ ${t} — 雨と雪が混じったみぞれ。傘をさしても濡れます`,
                `🌨️ ${t} — みぞれで路面がシャーベット状。転倒注意`
            ]);
        } else if (temp <= 3) {
            comment = pick([
                `🌨️ ${t} — みぞれ混じりの雪。傘とすべりにくい靴で`,
                `🌨️ ${t} — 雪になりそうな冷たい雨。天気の変化に注意`,
                `🌨️ ${t} — 寒気が強く雪に変わるかも。暖かくして`
            ]);
        } else if (isNight) {
            comment = pick([
                `🌨️ ${t} — 夜の雪。朝には積もっているかも`,
                `🌨️ ${t} — 静かな雪の夜。明日の朝は路面凍結注意`,
                `🌨️ ${t} — 夜更けの雪。交通情報を確認してお休みを`
            ]);
        } else if (isEvening) {
            comment = pick([
                `🌨️ ${t} — 夜にかけて積もるかも。帰宅は早めに`,
                `🌨️ ${t} — 夕方から雪。帰り道は滑りやすい`,
                `🌨️ ${t} — 雪が強まりそう。早めの帰宅がおすすめ`
            ]);
        } else {
            comment = pick([
                `🌨️ ${t} — この気温で雪は珍しいですね。足元注意`,
                `🌨️ ${t} — 東京では珍しい雪。傘を忘れずに`,
                `🌨️ ${t} — ちらちら雪が舞っています。風情がありますね`,
                `🌨️ ${t} — 初雪かもしれませんね。暖かくしてお過ごしを`
            ]);
        }
        if (isVeryWindy) comment += ' 🌀 吹雪に注意';
    }
    // ============================================================
    // PRIORITY 4: Heavy Rain / Showers (雪/みぞれ判定なら優先でスキップ)
    // ============================================================
    else if ((isHeavyRain || isModerateRain) && !isSnowActual && !isSleetActual) {
        if (temp >= 32 && isExtremelyHumid) {
            comment = `🌧️ ${t}・湿度${h}% — 猛暑の中の豪雨。蒸し地獄。雨宿りして涼を`;
        } else if (temp >= 28 && isSummer && isAfternoon) {
            comment = `🌧️ ${t} — 夏の夕立が激しいです。1時間もすれば止むかも`;
        } else if (temp >= 28 && isExtremelyHumid) {
            comment = `🌧️ ${t}・湿度${h}% — 熱帯のようなスコール。ジメジメします`;
        } else if (temp >= 25 && isRainy) {
            comment = `🌧️ ${t} — 梅雨の本降り。じめじめ蒸し暑い。除湿器を`;
        } else if (temp >= 25) {
            comment = `🌧️ ${t} — 蒸し暑い中、激しい雨。雨宿りして涼みましょう`;
        } else if (temp >= 20 && isWindy) {
            comment = `🌧️ ${t} — 横殴りの雨。傘が役に立たないかも`;
        } else if (temp >= 20) {
            comment = `🌧️ ${t} — 激しい雨。傘があっても濡れそう。少し待つのが吉`;
        } else if (temp >= 15 && isEvening) {
            comment = `🌧️ ${t} — 夕方の本降り。帰宅ラッシュに影響しそう`;
        } else if (temp >= 10 && isAutumn) {
            comment = `🌧️ ${t} — 秋の冷たい雨。濡れると体が冷えます。暖かくして`;
        } else if (temp >= 10) {
            comment = `🌧️ ${t} — 冷たい雨が激しく降っています。濡れると冷えます`;
        } else if (temp >= 5) {
            comment = `🌧️ ${t} — 凍えるような冷たい豪雨。濡れたらすぐ着替えを`;
        } else {
            comment = `🌧️ ${t} — 冷たい雨が激しい。雪に変わるかも。暖かい屋内へ`;
        }
        if (isVeryWindy) comment += ' 💨 風も強い！';
    }
    // ============================================================
    // PRIORITY 5: Regular Rain (雪/みぞれ判定なら優先でスキップ)
    // ============================================================
    else if (isRain && !isSnowActual && !isSleetActual) {
        if (temp >= 30 && isExtremelyHumid) {
            comment = `☔ ${t}・湿度${h}% — ムシムシした熱帯雨。不快指数MAX。エアコンを`;
        } else if (temp >= 28 && isVeryHumid) {
            comment = `☔ ${t}・湿度${h}% — 蒸し暑い雨。汗が止まらない。こまめに水分補給`;
        } else if (temp >= 25 && isMorning) {
            comment = `☔ ${t} — 朝から雨。傘を忘れずに。蒸し暑くなりそう`;
        } else if (temp >= 25) {
            comment = `☔ ${t} — 暖かい雨が降っています。傘をお持ちください`;
        } else if (temp >= 20 && isRainy) {
            comment = `☔ ${t} — 梅雨らしいしとしと雨。カビ対策を忘れずに`;
        } else if (temp >= 18 && isSpring) {
            comment = `☔ ${t} — 春雨ですね。花粉が流れるのは嬉しいかも`;
        } else if (temp >= 15) {
            comment = `☔ ${t} — しとしと雨。肌寒さを感じたら上着を`;
        } else if (temp >= 10 && isAutumn) {
            comment = `☔ ${t} — 秋雨です。気温も下がって寒くなってきました`;
        } else if (temp >= 10) {
            comment = `☔ ${t} — 肌寒い雨。長袖と傘は必須`;
        } else if (temp >= 5 && isWinter) {
            comment = `☔ ${t} — 冬の冷たい雨。みぞれになるかも`;
        } else if (temp >= 5) {
            comment = `☔ ${t} — 冷たい雨。濡れると一気に冷えます`;
        } else if (isSnowActual) {
            // Yahoo APIで雪と判定されている場合
            comment = `❄️ ${t} — 雪が降っています。路面凍結に注意`;
        } else if (isSleetActual) {
            // Yahoo APIでみぞれと判定されている場合
            comment = `🌨️ ${t} — みぞれが降っています。足元に注意`;
        } else if (temp >= 2) {
            comment = `☔ ${t} — 冷たい雨。暖かくして`;
        } else {
            // 気温2度未満でも雪と判定されなかった場合
            comment = `☔ ${t} — とても冷たい雨。暖かい屋内へ`;
        }
    }
    // ============================================================
    // PRIORITY 6: Drizzle (雪/みぞれ判定なら優先でスキップ)
    // ============================================================
    else if (isDrizzle && !isSnowActual && !isSleetActual) {
        if (temp >= 28 && isExtremelyHumid) {
            comment = `🌧️ ${t}・湿度${h}% — 霧雨だけどムシムシ。汗が乾かない`;
        } else if (temp >= 25 && isSummer) {
            comment = `🌧️ ${t} — 少しだけパラついています。傘なしでも大丈夫かも？`;
        } else if (temp >= 25) {
            comment = `🌧️ ${t} — 小雨がパラついています。折りたたみ傘があると安心`;
        } else if (temp >= 20 && isRainy) {
            comment = `🌧️ ${t} — 梅雨のしっとり霧雨。髪がまとまらない季節`;
        } else if (temp >= 18 && isSpring) {
            comment = `🌧️ ${t} — 春の霧雨。新緑が潤う良い雨`;
        } else if (temp >= 15) {
            comment = `🌧️ ${t} — 霧雨が降っています。しっとりした空気`;
        } else if (temp >= 10 && isAutumn) {
            comment = `🌧️ ${t} — 秋の霧雨。紅葉が濡れて美しい`;
        } else if (temp >= 10) {
            comment = `🌧️ ${t} — 小雨が降っています。肌寒さに注意`;
        } else if (temp >= 5) {
            comment = `🌧️ ${t} — 細かい冷たい雨。濡れると寒いので傘を`;
        } else {
            comment = `🌧️ ${t} — 凍てつく霧雨。雪に変わるかも`;
        }
    }
    // ============================================================
    // PRIORITY 6.5: Yahoo検出の雪/みぞれ（Open-Meteoが雨判定だが実際は雪/みぞれ）
    // ============================================================
    else if (isSnowActual && isRaining) {
        // Open-Meteoは雨判定だが、我々の判定で雪
        if (temp <= 0) {
            comment = pick([
                `❄️ ${t} — 雪が降っています。積もるかもしれません`,
                `❄️ ${t} — しんしんと雪が降っています。足元注意`,
                `❄️ ${t} — 粉雪がちらついています。路面凍結に注意`
            ]);
        } else if (temp <= 2) {
            comment = pick([
                `❄️ ${t} — 雪が降っています。寒さに注意`,
                `❄️ ${t} — 湿った雪。傘があると良いかも`,
                `❄️ ${t} — 雪が舞っています。暖かくして`
            ]);
        } else {
            comment = pick([
                `❄️ ${t} — 雪になっています。寒さ対策を`,
                `❄️ ${t} — べた雪が降っています。足元注意`,
                `❄️ ${t} — 雪が降り始めました。傘をお忘れなく`
            ]);
        }
        if (isVeryWindy) comment += ' 🌀 吹雪に注意';
    }
    else if (isSleetActual && isRaining) {
        // Open-Meteoは雨判定だが、我々の判定でみぞれ
        comment = pick([
            `🌨️ ${t} — みぞれが降っています。足元が滑りやすいです`,
            `🌨️ ${t} — 雪まじりの雨。傘と足元に注意`,
            `🌨️ ${t} — みぞれ模様。路面凍結の可能性あり`,
            `🌨️ ${t} — 冷たいみぞれ。暖かい服装で`
        ]);
    }
    // ============================================================
    // PRIORITY 7: Fog - Expanded
    // ============================================================
    else if (isFog) {
        if (temp >= 25 && isExtremelyHumid) {
            comment = pick([
                `🌫️ ${t}・湿度${h}% — 蒸し霧。サウナのような空気`,
                `🌫️ ${t} — 湿度が高くて霧が濃い。視界不良`,
                `🌫️ ${t}・湿度${h}% — 蒸し暑い霧。不快指数MAX`
            ]);
        } else if (temp >= 20 && isMorning) {
            comment = pick([
                `🌫️ ${t} — 朝霧が出ています。日が昇れば晴れそう`,
                `🌫️ ${t} — 幻想的な朝霧。通勤は視界注意`,
                `🌫️ ${t} — 朝もやがかかっています。午前中には晴れるでしょう`
            ]);
        } else if (temp >= 20 && isNight) {
            comment = pick([
                `🌫️ ${t} — 夜霧が立ち込めています。車の運転は注意`,
                `🌫️ ${t} — 暖かい夜霧。ミステリアスな雰囲気`,
                `🌫️ ${t} — 霧の夜。ヘッドライトを落として運転を`
            ]);
        } else if (temp >= 20) {
            comment = pick([
                `🌫️ ${t} — 暖かい霧が立ち込めています。視界不良注意`,
                `🌫️ ${t} — 霧で視界が悪い。速度を落として`,
                `🌫️ ${t} — もやがかかっています。遠くが見えにくい`
            ]);
        } else if (temp >= 15 && isAutumn) {
            comment = pick([
                `🌫️ ${t} — 秋霧ですね。幻想的ですが運転注意`,
                `🌫️ ${t} — 秋の朝靄。紅葉と霧が美しい`,
                `🌫️ ${t} — 霧のかかった秋の風景。運転は慎重に`
            ]);
        } else if (temp >= 10 && isMorning) {
            comment = pick([
                `🌫️ ${t} — 放射霧です。日中は晴れる見込み`,
                `🌫️ ${t} — 朝の濃霧。交通情報を確認して`,
                `🌫️ ${t} — 川沿いは特に霧が濃い。通勤注意`
            ]);
        } else if (temp >= 10) {
            comment = pick([
                `🌫️ ${t} — 霧が出ています。運転は十分な車間距離を`,
                `🌫️ ${t} — 視界不良。フォグランプをつけて`,
                `🌫️ ${t} — 霧で見通し悪い。スピードを落として`
            ]);
        } else if (temp >= 5) {
            comment = pick([
                `🌫️ ${t} — 冷たい霧。視界悪く路面も滑りやすい`,
                `🌫️ ${t} — 寒い霧。濡れると体が冷えます`,
                `🌫️ ${t} — 冷たい霧雨混じり。傘があると安心`
            ]);
        } else if (temp >= 0) {
            comment = pick([
                `🌫️ ${t} — 凍霧です。路面がアイスバーン状態かも`,
                `🌫️ ${t} — 氷点下の霧。すべてが凍りつきます`,
                `🌫️ ${t} — 凍霧注意。ブラックアイスに警戒`
            ]);
        } else {
            comment = pick([
                `🌫️ ${t} — 極寒の霧。すべてが凍りついています`,
                `🌫️ ${t} — 吐く息も凍る霧。視界ゼロに近い`,
                `🌫️ ${t} — 霧と極寒。外出は控えて`
            ]);
        }
    }
    // ============================================================
    // PRIORITY 8: Clear/Cloudy with temperature+humidity+UV+time
    // ============================================================
    else {
        // ============================================================
        // PRIORITY 8a: High precipitation probability warning
        // ============================================================
        if (pp >= 70 && !isRaining && !isSnow && !isHeavySnow) {
            if (temp <= 2) {
                comment = pick([
                    `❄️ ${t} — 降水確率${pp}%。雪が降る可能性が高いです。早めの帰宅を`,
                    `🌨️ ${t} — ${pp}%の確率で雪。路面凍結に備えて`,
                    `❄️ ${t} — 雪の予報。外出は控えめに`
                ]);
            } else if (temp <= 5) {
                comment = pick([
                    `☔ ${t} — 降水確率${pp}%。冷たい雨になりそう。傘を忘れずに`,
                    `🌧️ ${t} — ${pp}%の確率で雨。暖かい上着も`,
                    `☔ ${t} — 雨の予報。濡れると寒いので傘必須`
                ]);
            } else {
                comment = pick([
                    `☔ ${t} — 降水確率${pp}%。傘をお忘れなく`,
                    `🌧️ ${t} — ${pp}%の確率で雨。折りたたみ傘が安心`,
                    `☔ ${t} — 雨が降りそう。傘を持って出かけましょう`
                ]);
            }
        }
        // DEADLY HEAT 40+ - Expanded
        else if (temp >= 40) {
            if (isNight && isExtremelyHumid) {
                comment = pick([
                    `🆘 ${t}・湿度${h}% — 【命の危険】夜間でも致死的な暑さ。救急搬送レベル。絶対にエアコンを`,
                    `🆘 ${t} — 【緊急】夜なのに40°C超え。エアコンなしでは命に関わります`,
                    `🆘 ${t}・湿度${h}% — 【危険】観測史上最悪レベル。体調異変は119番へ`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🆘 ${t} — 【命の危険】異常な熱帯夜。エアコン必須。体調異変を感じたら119番`,
                    `🆘 ${t} — 【緊急事態】深夜でも40°C。冷房を最大にして水分補給を`,
                    `🆘 ${t} — 【危険】前代未聞の熱帯夜。絶対にエアコンを切らないで`
                ]);
            } else if (isExtremelyHumid) {
                comment = pick([
                    `🆘 ${t}・湿度${h}% — 【緊急事態】熱中症で死亡するレベル。外出禁止。クーラー全開で`,
                    `🆘 ${t}・湿度${h}% — 【命の危険】蒸し風呂を超えた暑さ。屋内でも危険`,
                    `🆘 ${t} — 【緊急】人体の限界を超えた暑さ。すぐに涼しい場所へ`
                ]);
            } else if (isClear && isAfternoon) {
                comment = pick([
                    `🆘 ${t} — 【命の危険】記録的猛暑。屋外での活動は命に関わります。外出禁止`,
                    `🆘 ${t} — 【緊急事態】午後のピーク。アスファルトは60°C超え。火傷します`,
                    `🆘 ${t} — 【危険】観測史上最高レベル。屋外に出ないで`
                ]);
            } else if (isMorning) {
                comment = pick([
                    `🆘 ${t} — 【緊急】朝から40°C超え。今日は外出しないでください`,
                    `🆘 ${t} — 【命の危険】朝からこの気温は異常。予定をすべてキャンセルして`
                ]);
            } else {
                comment = pick([
                    `🆘 ${t} — 【生命の危機】体温調節が限界を超える暑さ。涼しい場所へ今すぐ避難`,
                    `🆘 ${t} — 【緊急事態】人間が活動できる気温ではありません`,
                    `🆘 ${t} — 【命の危険】熱中症による死亡リスク大。冷房の効いた室内へ`
                ]);
            }
        }
        // EXTREME HEAT 38-40 - Expanded
        else if (temp >= 38) {
            if (isNight && isExtremelyHumid) {
                comment = pick([
                    `🚨 ${t}・湿度${h}% — 【危険】夜も蒸し風呂状態。エアコンなしでは熱中症の恐れ`,
                    `🚨 ${t} — 【警告】寝ている間に熱中症になるリスク。冷房必須`,
                    `🚨 ${t}・湿度${h}% — 【危険】異常な熱帯夜。水を枕元に置いて`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🚨 ${t} — 【警告】深夜でも危険な暑さ。エアコンをつけて就寝を`,
                    `🚨 ${t} — 【注意】真夜中でも38°C。冷房は切らないで`,
                    `🚨 ${t} — 【危険】熱帯夜のレベルを超えています。水分補給を忘れずに`
                ]);
            } else if (isClear && isExtremeUV && !isNight) {
                comment = pick([
                    `🚨 ${t} — 【危険】UV極端・体温超え。外出禁止レベル。室内へ避難`,
                    `🚨 ${t} — 【警告】直射日光は凶器。5分で火傷レベル`,
                    `🚨 ${t} — 【危険】肌を露出しないで。帽子・日傘・長袖で完全防備を`
                ]);
            } else if (isClear && isAfternoon) {
                comment = pick([
                    `🚨 ${t} — 【危険】午後の猛暑がピーク！日陰も危険な暑さ。屋内へ`,
                    `🚨 ${t} — 【警告】アスファルトは50°C超え。ペットの散歩は厳禁`,
                    `🚨 ${t} — 【危険】屋外作業は中止を。熱中症で倒れるリスク大`
                ]);
            } else if (isClear && isMorning) {
                comment = pick([
                    `🚨 ${t} — 【警告】朝から体温超え。今日は外出を控えて`,
                    `🚨 ${t} — 【危険】午前中でこの暑さ。午後はもっと上がります`
                ]);
            } else if (isExtremelyHumid) {
                comment = pick([
                    `🚨 ${t}・湿度${h}% — 【危険】命に関わる蒸し暑さ。クーラーの効いた室内へ`,
                    `🚨 ${t}・湿度${h}% — 【警告】湿度も高くて危険。汗が蒸発しません`
                ]);
            } else if (isEvening) {
                comment = pick([
                    `🚨 ${t} — 【注意】夕方でも危険な暑さ。水分補給を怠らないで`,
                    `🚨 ${t} — 【警告】日が傾いても38°C。夜も熱帯夜確実`
                ]);
            } else {
                comment = pick([
                    `🚨 ${t} — 【警告】体温を超える暑さ。曇っていても熱中症の危険`,
                    `🚨 ${t} — 【危険】猛暑日をはるかに超えた暑さ。冷房の効いた場所へ`,
                    `🚨 ${t} — 【警告】危険な高温。運動は厳禁。こまめな水分補給を`
                ]);
            }
        }
        // DANGER 36-38 (命に関わる危険)
        else if (temp >= 36) {
            if (isNight && isExtremelyHumid) {
                comment = `🚨 ${t}・湿度${h}% — 【命の危険】夜間も危険な蒸し暑さ。エアコン必須。119番を意識して`;
            } else if (isNight && isVeryHumid) {
                comment = `� ${t}・湿度${h}% — 【危険】熱帯夜×高湿度。脱水に注意。寝る前に水を`;
            } else if (isNight) {
                comment = `⚠️ ${t} — 【熱中症危険】異常な熱帯夜。エアコンなしでは命に関わります`;
            } else if (isExtremelyHumid && isAfternoon) {
                comment = `🚨 ${t}・湿度${h}% — 【命の危険】外出禁止レベル。ペットや子どもを車内に絶対残さないで`;
            } else if (isExtremelyHumid) {
                comment = `🚨 ${t}・湿度${h}% — 【命の危険】蒸し風呂状態。屋内でも熱中症のリスク大`;
            } else if (isVeryHumid) {
                comment = `⚠️ ${t}・湿度${h}% — 【熱中症危険】汗が乾かず体温調節困難。涼しい場所へ`;
            } else if (isClear && isAfternoon && isVeryHighUV) {
                comment = `🚨 ${t} — 【危険】猛烈な日差しと高温。10分で日焼け・熱中症のリスク`;
            } else if (isClear && isAfternoon) {
                comment = `⚠️ ${t} — 【熱中症危険】午後のピーク。外出は控え、水分は10分おきに`;
            } else if (isClear && isMorning) {
                comment = `⚠️ ${t} — 【警戒】朝から猛暑日超え。今日は不要不急の外出を控えて`;
            } else if (feelsHotter) {
                comment = `🚨 ${t}（体感${fl.toFixed(0)}°C）— 【危険】体感温度が更に高い。命に関わる暑さ`;
            } else if (isEvening) {
                comment = `⚠️ ${t} — 【注意】夕方でも危険な暑さ。夜も熱帯夜が続きます`;
            } else {
                comment = `⚠️ ${t} — 【熱中症危険】猛暑日レベル。水分・塩分補給を怠らないで`;
            }
        }
        // ALERT 34-36 (熱中症注意)
        else if (temp >= 34) {
            if (isNight && isExtremelyHumid) {
                comment = `⚠️ ${t}・湿度${h}% — 【熱中症注意】蒸し暑すぎる夜。エアコンを28°C設定で`;
            } else if (isNight && isVeryHumid) {
                comment = `🌙 ${t}・湿度${h}% — 熱帯夜。寝苦しい夜。水分を枕元に置いて`;
            } else if (isNight) {
                comment = `🌙 ${t} — 熱帯夜です。エアコンか扇風機で快適な睡眠環境を`;
            } else if (isExtremelyHumid && isAfternoon) {
                comment = `⚠️ ${t}・湿度${h}% — 【熱中症注意】危険な蒸し暑さ。外出は控えて`;
            } else if (isExtremelyHumid) {
                comment = `⚠️ ${t}・湿度${h}% — 【熱中症注意】不快指数が危険域。冷房を使いましょう`;
            } else if (isVeryHumid) {
                comment = `🔥 ${t}・湿度${h}% — 【熱中症注意】蒸し暑さ警戒。こまめな休憩と水分を`;
            } else if (isClear && isAfternoon && isVeryHighUV) {
                comment = `🔥 ${t} — 【熱中症注意】猛暑+強いUV。帽子・日傘・日焼け止め必須`;
            } else if (isClear && isAfternoon) {
                comment = `🔥 ${t} — 【熱中症注意】午後の猛暑。15分おきに水分補給を`;
            } else if (isClear && isMorning) {
                comment = `☀️ ${t} — 朝から猛暑に近い暑さ。帽子・水筒を忘れずに。子どもの熱中症に注意`;
            } else if (feelsHotter) {
                comment = `🔥 ${t}（体感${fl.toFixed(0)}°C）— 【熱中症注意】体感は猛暑日レベル`;
            } else if (isEvening) {
                comment = `🌇 ${t} — 夕方でも猛暑に近い暑さ。帰宅後は涼しい部屋で休息を`;
            } else if (isDry && isLightBreeze) {
                comment = `☀️ ${t} — カラッとした猛暑。風があっても水分補給は忘れずに`;
            } else {
                comment = `🔥 ${t} — 猛暑に近い暑さ。こまめな水分・塩分補給で熱中症予防を`;
            }
        }
        // HOT 32-34 (真夏日)
        else if (temp >= 32) {
            if (isNight && isVeryHumid) {
                comment = `🌙 ${t}・湿度${h}% — 寝苦しい夜。エアコンか扇風機で快適に`;
            } else if (isNight) {
                comment = `🌙 ${t} — 暑い夜。熱中症予防にエアコンの活用を`;
            } else if (isExtremelyHumid) {
                comment = `😫 ${t}・湿度${h}% — 蒸し暑くて不快。冷房で体調管理を`;
            } else if (isVeryHumid && isAfternoon) {
                comment = `😫 ${t}・湿度${h}% — 午後は特に蒸し暑い。無理せず休憩を`;
            } else if (isVeryHumid) {
                comment = `😫 ${t}・湿度${h}% — 蒸し暑い。汗をかいたら塩分も補給を`;
            } else if (isClear && isVeryHighUV && !isNight) {
                comment = `☀️ ${t} — 日差しが痛い真夏日。日焼けに注意。UV対策必須`;
            } else if (isClear && isHighUV && isDry && !isNight) {
                comment = `☀️ ${t} — カラッと晴れた真夏日。プールや海日和！水分忘れずに`;
            } else if (isClear && isMorning) {
                comment = `☀️ ${t} — 朝から真夏日。洗濯物がよく乾きます。熱中症対策も忘れずに`;
            } else if (isClear && isAfternoon) {
                comment = `☀️ ${t} — 午後の真夏日。外出は日陰を選んで。水筒持参で`;
            } else if (isClear && isEvening) {
                comment = `🌇 ${t} — 夕方でもまだ暑い。夕涼みにはまだ早いかも`;
            } else if (isOvercast) {
                comment = `🌻 ${t} — 曇っていても真夏日。油断せず水分補給を`;
            } else if (feelsColder && isLightBreeze && !isNight) {
                comment = `☀️ ${t} — 風があって少し楽。でも水分補給は忘れずに`;
            } else {
                comment = `🍧 ${t} — 真夏日！アイスやかき氷が最高の季節`;
            }
        }
        // WARM 28-32 (夏日〜真夏日) - Expanded
        else if (temp >= 28) {
            if (isNight && isVeryHumid) {
                comment = pick([
                    `🌙 ${t}・湿度${h}% — 蒸し暑い夜。エアコンか扇風機で快適に`,
                    `🌙 ${t} — 熱帯夜。冷房をつけて寝ましょう`,
                    `🌙 ${t}・湿度${h}% — 寝苦しい夜。水を枕元に`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🌙 ${t} — 暑い夜。窓を開けるか冷房をつけて`,
                    `🌙 ${t} — 熱帯夜気味。扇風機があると快適`,
                    `🌙 ${t} — 暑い夜。水分補給を忘れずに`
                ]);
            } else if (isClear && isDry && isHighUV && !isNight) {
                comment = pick([
                    `✨ ${t} — カラッと晴れて気持ちいい！UV対策を忘れずに`,
                    `☀️ ${t} — 爽やかな夏日。日焼け止めを忘れずに`,
                    `✨ ${t} — 乾燥した夏日。水分補給を`
                ]);
            } else if (isClear && isDry && isMorning) {
                comment = pick([
                    `☀️ ${t} — 爽やかな朝。洗濯日和です`,
                    `☀️ ${t} — 朝からいい天気！今日は暑くなりそう`,
                    `✨ ${t} — 暑くなりそうな朝。布団を干すチャンス`
                ]);
            } else if (isClear && isMorning) {
                comment = pick([
                    `☀️ ${t} — 暑くなりそうな朝。帽子を忘れずに`,
                    `☀️ ${t} — 朝から暑い予感。水筒を持って`,
                    `☀️ ${t} — いい天気の朝。日差しが強そう`
                ]);
            } else if (isClear && isEvening) {
                comment = pick([
                    `🌇 ${t} — 日が傾いてきました。夕涼みには少し早いかも`,
                    `🌆 ${t} — 夕方でもまだ暑い。もう少しで涼しくなる`,
                    `🌇 ${t} — 夕暮れ時。風が出てきたかも`
                ]);
            } else if (isClear && isAfternoon && feelsHotter) {
                comment = pick([
                    `☀️ ${t}（体感${fl.toFixed(0)}°C）— 湿度で体感はもっと暑い`,
                    `☀️ ${t} — 午後のピーク。日陰を選んで`,
                    `☀️ ${t}（体感${fl.toFixed(0)}°C）— 水分補給をこまめに`
                ]);
            } else if (isClear && isAfternoon) {
                comment = pick([
                    `☀️ ${t} — 夏らしい陽気。半袖でちょうどいい`,
                    `☀️ ${t} — 午後の夏日。冷たい飲み物を`,
                    `☀️ ${t} — 暑い午後。プールに行きたくなる`
                ]);
            } else if (isExtremelyHumid) {
                comment = pick([
                    `💧 ${t}・湿度${h}% — 蒸し暑い！除湿器かエアコンを`,
                    `💧 ${t} — ジメジメ蒸し暑い。不快指数高め`,
                    `💧 ${t}・湿度${h}% — 湿度が高すぎ。エアコン推奨`
                ]);
            } else if (isVeryHumid && isRainy) {
                comment = pick([
                    `💧 ${t}・湿度${h}% — 梅雨らしいジメジメ。カビ対策を`,
                    `💧 ${t} — 梅雨の蒸し暑さ。除湿器が活躍`,
                    `💧 ${t}・湿度${h}% — 雨で蒸し暑い。髪がまとまらない`
                ]);
            } else if (isVeryHumid && isAfternoon) {
                comment = pick([
                    `💧 ${t}・湿度${h}% — 午後は特に蒸し暑い。水分補給を`,
                    `💧 ${t} — 午後の蒸し暑さがピーク`,
                    `💧 ${t}・湿度${h}% — 午後は湿度でぐったり`
                ]);
            } else if (isVeryHumid) {
                comment = pick([
                    `💧 ${t}・湿度${h}% — ジメジメ。扇風機やエアコンで快適に`,
                    `💧 ${t} — 蒸し暑い。汗をかいたら塩分も`,
                    `💧 ${t}・湿度${h}% — 湿度でべたつく。シャワーが気持ちいい`
                ]);
            } else if (isPartlyCloudy && !isNight) {
                comment = pick([
                    `⛅ ${t} — 時々雲がかかりますが暑い。水分補給を`,
                    `⛅ ${t} — 薄曇りでも暑い。油断せずに`,
                    `⛅ ${t} — 雲があってもしっかり暑い`
                ]);
            } else if (isOvercast && feelsHotter) {
                comment = pick([
                    `☁️ ${t} — 曇りでも蒸し暑い。湿度が高めです`,
                    `☁️ ${t} — 曇りで湿度が高い。ジメジメ`,
                    `☁️ ${t} — 曇り空でも体感温度は高め`
                ]);
            } else if (isOvercast) {
                comment = pick([
                    `☁️ ${t} — 曇っていますが蒸し暑い。風があると楽`,
                    `☁️ ${t} — 曇りでも夏日。水分を忘れずに`,
                    `☁️ ${t} — 日差しはなくても暑い`
                ]);
            } else if (isLightBreeze && !isNight) {
                comment = pick([
                    `🌴 ${t} — 夏日。風があって少し過ごしやすい`,
                    `🌴 ${t} — 風が心地よい夏日`,
                    `🌴 ${t} — 風があると体感温度が下がる`
                ]);
            } else {
                comment = pick([
                    `🌴 ${t} — 夏日です。冷たい飲み物が美味しい`,
                    `🍹 ${t} — 暑い！冷たいものが欲しくなる`,
                    `🌴 ${t} — 夏らしい暑さ。水分補給を`
                ]);
            }
        }
        // WARM 25-28 (夏日) - Expanded
        else if (temp >= 25) {
            if (isNight && isVeryHumid) {
                comment = pick([
                    `🌙 ${t}・湿度${h}% — 蒸し暑い夜。扇風機かエアコンがあると快適`,
                    `🌙 ${t} — 熱帯夜気味。窓を開けて風を通して`,
                    `🌙 ${t}・湿度${h}% — ジメジメした夜。除湿すると快適`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🌙 ${t} — 暖かい夜。窓を開けて寝ると気持ちいいかも`,
                    `🌙 ${t} — 過ごしやすい夜。窓を開けて夜風を`,
                    `🌙 ${t} — 暖かい夜。虫の声が聞こえそう`
                ]);
            } else if (isClear && isDry && isMorning) {
                comment = pick([
                    `✨ ${t} — 爽やかな朝！絶好のお出かけ日和`,
                    `☀️ ${t} — 暑い朝。洗濯物がすぐ乾きます`,
                    `✨ ${t} — 気持ちいい朝！今日は活動的に`
                ]);
            } else if (isClear && isDry && isAfternoon) {
                comment = pick([
                    `✨ ${t} — カラッと爽やかな晴れ！最高のお出かけ日和`,
                    `☀️ ${t} — 午後の夏日。外に出ると気持ちいい`,
                    `✨ ${t} — 爽やかな午後。カフェのテラス席がおすすめ`
                ]);
            } else if (isClear && isDry && !isNight) {
                comment = pick([
                    `✨ ${t} — 爽やかな陽気。洗濯物がよく乾きます`,
                    `☀️ ${t} — カラッとした夏日。過ごしやすい`,
                    `✨ ${t} — 風が気持ちいい1日になりそう`
                ]);
            } else if (isClear && isHighUV && !isNight) {
                comment = pick([
                    `☀️ ${t} — 日差したっぷり。UVケアを忘れずに`,
                    `☀️ ${t} — 紫外線が強め。帽子や日焼け止めを`,
                    `☀️ ${t} — 日差しが強い。サングラスがあると楽`
                ]);
            } else if (isClear && isEvening) {
                comment = pick([
                    `🌇 ${t} — 夕方の心地よい風。散歩にぴったり`,
                    `🌆 ${t} — 夕暮れ時の気持ちよさ。お散歩日和`,
                    `🌇 ${t} — 夕涼みにちょうどいい気温`
                ]);
            } else if (isClear && !isNight) {
                comment = pick([
                    `😊 ${t} — 気持ちのいい晴れ。半袖でちょうどいい`,
                    `☀️ ${t} — 夏日！外に出ると気持ちいい`,
                    `😊 ${t} — 爽やかな夏日。過ごしやすい`
                ]);
            } else if (isExtremelyHumid) {
                comment = pick([
                    `💧 ${t}・湿度${h}% — ジメジメ曇り空。扇風機があると快適`,
                    `💧 ${t} — 湿度が高くて蒸し暑い。除湿を`,
                    `💧 ${t}・湿度${h}% — ムシムシ。エアコンの除湿モードを`
                ]);
            } else if (isVeryHumid && isAfternoon) {
                comment = pick([
                    `💧 ${t}・湿度${h}% — 午後は蒸し暑い。冷たい飲み物を`,
                    `💧 ${t} — 午後は湿度で不快。涼しい場所へ`,
                    `💧 ${t}・湿度${h}% — 蒸し暑い午後。アイスコーヒーが美味しい`
                ]);
            } else if (isVeryHumid) {
                comment = pick([
                    `💧 ${t}・湿度${h}% — 蒸し暑い曇り空。扇風機があると快適`,
                    `💧 ${t} — ジメジメ。除湿器があると楽`,
                    `💧 ${t}・湿度${h}% — 湿度高め。髪がまとまらない季節`
                ]);
            } else if (isPartlyCloudy && isSpring && !isNight) {
                comment = pick([
                    `🌸 ${t} — 春らしい陽気。お花見にぴったり`,
                    `🌸 ${t} — 春の暖かさ。桜は見頃かも`,
                    `🌸 ${t} — 春爛漫。外でランチがしたくなる`
                ]);
            } else if (isPartlyCloudy && !isNight) {
                comment = pick([
                    `⛅ ${t} — 薄曇りですが暖かい。過ごしやすい`,
                    `⛅ ${t} — 時々日が差す。ちょうどいい気温`,
                    `⛅ ${t} — 暖かい曇り空。涼しくも暑くもない`
                ]);
            } else if (isOvercast && isLightBreeze) {
                comment = pick([
                    `☁️ ${t} — 曇りですが風が気持ちいい`,
                    `☁️ ${t} — 風があって過ごしやすい`,
                    `☁️ ${t} — 曇りでもカラッとして快適`
                ]);
            } else if (isOvercast) {
                comment = pick([
                    `⛅ ${t} — 曇りですが暖かい。薄着で過ごせます`,
                    `☁️ ${t} — 暖かい曇り空。日焼けしなくてラッキー`,
                    `⛅ ${t} — ちょうどいい気温。過ごしやすい`
                ]);
            } else {
                comment = pick([
                    `🌿 ${t} — 過ごしやすい気温。窓を開けると気持ちいい`,
                    `😊 ${t} — ちょうどいい夏日。快適に過ごせます`,
                    `🌿 ${t} — いい気温。エアコンなしでも快適`
                ]);
            }
        }
        // COMFORTABLE 22-25 (快適) - 6 variations each
        else if (temp >= 22) {
            if (isNight && isCalm) {
                comment = pick([
                    `🌙 ${t} — 静かで穏やかな夜。よく眠れそう`,
                    `🌙 ${t} — 窓を開けて寝ると気持ちいい夜`,
                    `🌙 ${t} — 心地よい夜風。リラックスタイム`,
                    `🌙 ${t} — 穏やかな夜。読書でもいかが`,
                    `🌙 ${t} — 虫の声が心地よい夜`,
                    `🌙 ${t} — ゆったりとした夜のひととき`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🌙 ${t} — 穏やかな夜。リラックスタイムに最適`,
                    `🌙 ${t} — ゆったりした夜。読書でもいかが`,
                    `🌙 ${t} — 過ごしやすい夜です`,
                    `🌙 ${t} — 静かな夜を楽しんで`,
                    `🌙 ${t} — おうち時間にぴったりの夜`,
                    `🌙 ${t} — 心が落ち着く夜ですね`
                ]);
            } else if (isClear && isDry && isMorning) {
                comment = pick([
                    `🍀 ${t} — 爽やかな朝。散歩やジョギングに最適`,
                    `☀️ ${t} — 気持ちいい朝！1日のスタートに最高`,
                    `✨ ${t} — 朝の空気が気持ちいい。深呼吸したくなる`,
                    `🌅 ${t} — 清々しい朝。今日は良い日になりそう`,
                    `🍀 ${t} — 朝から爽やか！活動的な1日を`,
                    `☀️ ${t} — 気持ちいい朝。何か始めたくなる`
                ]);
            } else if (isClear && isDry && isAfternoon) {
                comment = pick([
                    `🍀 ${t} — 爽やかな午後。カフェテラス日和`,
                    `☀️ ${t} — 穏やかな午後。公園でのんびりも良い`,
                    `✨ ${t} — 気持ちいい午後。窓辺で読書でも`,
                    `🌿 ${t} — 木漏れ日が気持ちいい午後`,
                    `🍀 ${t} — 午後のティータイムにぴったり`,
                    `☀️ ${t} — のんびり過ごしたくなる午後`
                ]);
            } else if (isClear && isDry && !isNight) {
                comment = pick([
                    `🍀 ${t} — 爽やかで過ごしやすい陽気。散歩に最適`,
                    `☀️ ${t} — カラッと晴れて最高の天気`,
                    `✨ ${t} — 絶好の行楽日和です`,
                    `🌿 ${t} — 爽やかな陽気。外に出たくなる`,
                    `🍀 ${t} — 気持ちのいい晴れ。深呼吸日和`,
                    `☀️ ${t} — 最高のお出かけ日和ですね`
                ]);
            } else if (isClear && isSpring && !isNight) {
                comment = pick([
                    `🌷 ${t} — 春の陽気。新緑が眩しい`,
                    `🌸 ${t} — 春らんまん。お出かけ日和`,
                    `🍀 ${t} — 春の爽やかさ。外が気持ちいい`,
                    `🌷 ${t} — 春の風が心地よい`,
                    `🌸 ${t} — 春を感じる陽気ですね`,
                    `🍀 ${t} — 新緑が美しい季節`
                ]);
            } else if (isClear && isAutumn && !isNight) {
                comment = pick([
                    `🍁 ${t} — 秋晴れの心地よさ。紅葉狩りにいい季節`,
                    `🍂 ${t} — 秋の澄んだ空気。お散歩日和`,
                    `✨ ${t} — 秋の行楽日和。どこかへ出かけたくなる`,
                    `🍁 ${t} — 秋らしい爽やかさ。紅葉が見頃かも`,
                    `🍂 ${t} — 秋風が心地よい。サイクリング日和`,
                    `✨ ${t} — 秋の空が綺麗な日`
                ]);
            } else if (isClear && isEvening) {
                comment = pick([
                    `🌇 ${t} — 心地よい夕方。散歩日和`,
                    `🌆 ${t} — 夕方の風が気持ちいい`,
                    `🌇 ${t} — 夕暮れ時のお散歩にぴったり`,
                    `🌆 ${t} — 夕焼けが綺麗そうな夕方`,
                    `🌇 ${t} — 涼しくなってきた。散歩にいい`,
                    `🌆 ${t} — 夕方のひとときを楽しんで`
                ]);
            } else if (isClear && !isNight) {
                comment = pick([
                    `☀️ ${t} — 穏やかな晴れ。過ごしやすい一日に`,
                    `😊 ${t} — いい天気！何かいいことありそう`,
                    `✨ ${t} — 気持ちのいい陽気ですね`,
                    `☀️ ${t} — 晴れて気持ちいい。良い一日を`,
                    `😊 ${t} — 穏やかな陽気。のんびりしたい`,
                    `✨ ${t} — 今日は外に出たくなる天気`
                ]);
            } else if (isVeryHumid && pp >= 40) {
                comment = `🌧️ ${t} — 湿気が多め。${pp}%の確率で雨が降りそう`;
            } else if (isVeryHumid) {
                comment = `💧 ${t} — 湿気が高め。蒸し蒸しします`;
            } else if (isPartlyCloudy && isLightBreeze && !isNight) {
                comment = `⛅ ${t} — 風が気持ちいい。過ごしやすい天気`;
            } else if (isPartlyCloudy && !isNight) {
                comment = `⛅ ${t} — 薄曇り。過ごしやすい気温です`;
            } else if (isOvercast) {
                comment = `☁️ ${t} — 曇りですが快適な気温`;
            } else {
                comment = pick([
                    `☕ ${t} — 穏やかな気温。コーヒーでもいかが？`,
                    `🍵 ${t} — ゆったりした時間を過ごせそう`,
                    `☕ ${t} — 心地よい気温。のんびり過ごしましょう`
                ]);
            }
        }
        // COMFORTABLE 18-22 (過ごしやすい) - 1.5x variations
        else if (temp >= 18) {
            if (isNight && isCalm) {
                comment = pick([
                    `🌙 ${t} — 静かで心地よい夜。窓を開けると気持ちいい`,
                    `🌙 ${t} — 穏やかな夜風。リラックスタイム`,
                    `🌙 ${t} — 心地よい夜。ゆっくり休めそう`,
                    `🌙 ${t} — 静寂の夜。読書にぴったり`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🌙 ${t} — 穏やかな夜。よく眠れそう`,
                    `🌙 ${t} — 快適な夜。おうち時間を楽しんで`,
                    `🌙 ${t} — 過ごしやすい夜ですね`,
                    `🌙 ${t} — 心落ち着く夜。ゆっくりと`
                ]);
            } else if (isClear && isDry && isAutumn && !isNight) {
                comment = pick([
                    `🍂 ${t} — 秋晴れの爽やかさ。読書日和ですね`,
                    `🍁 ${t} — 秋の空が綺麗。散歩にぴったり`,
                    `🍂 ${t} — 秋らしい心地よさ。外が気持ちいい`,
                    `🍁 ${t} — 秋の爽やかな空気を楽しんで`
                ]);
            } else if (isClear && isDry && isMorning && isExcellentVisibility) {
                // 視程50km以上の晴れた朝 - 富士山が見える可能性
                comment = pick([
                    `🗻 ${t} — 空気が澄んでいます！遠くの山が見えるかも`,
                    `✨ ${t} — 視界良好！条件次第で富士山が見えるかも`,
                    `🗻 ${t} — 澄み切った朝。遠くまで見渡せる絶好の日`
                ]);
            } else if (isClear && isDry && isMorning) {
                comment = pick([
                    `🍀 ${t} — 清々しい朝。ウォーキング日和`,
                    `☀️ ${t} — 爽やかな朝！1日のスタートにぴったり`,
                    `✨ ${t} — 気持ちいい朝。深呼吸したくなる`,
                    `🍀 ${t} — 朝の空気が最高。活動的に過ごせそう`
                ]);
            } else if (isClear && isDry && isAfternoon) {
                comment = pick([
                    `🍀 ${t} — 爽やかな午後。テラス席が気持ちいい`,
                    `☀️ ${t} — 穏やかな午後。外でのんびりも`,
                    `✨ ${t} — 気持ちいい午後。カフェ日和`,
                    `🍀 ${t} — 午後の陽気を楽しんで`
                ]);
            } else if (isClear && isDry && !isNight) {
                comment = pick([
                    `🍀 ${t} — 爽やかな陽気。上着なしでも快適`,
                    `☀️ ${t} — カラッと晴れて気持ちいい`,
                    `✨ ${t} — 絶好のお出かけ日和`,
                    `🍀 ${t} — 爽やかな1日になりそう`
                ]);
            } else if (isClear && isMorning) {
                comment = pick([
                    `☀️ ${t} — 気持ちいい朝。日中は暖かくなりそう`,
                    `🌅 ${t} — 朝日が気持ちいい。良い1日を`,
                    `☀️ ${t} — 爽やかな朝。今日も頑張れそう`,
                    `🌅 ${t} — 清々しい朝。何か始めたくなる`
                ]);
            } else if (isClear && isEvening) {
                comment = pick([
                    `🌇 ${t} — 心地よい夕方。散歩にいい気候`,
                    `🌆 ${t} — 夕暮れ時の風が気持ちいい`,
                    `🌇 ${t} — 夕方の散歩にぴったり`,
                    `🌆 ${t} — 夕日が綺麗な時間帯`
                ]);
            } else if (isClear && !isNight) {
                comment = pick([
                    `☀️ ${t} — 穏やかな晴れ。過ごしやすい一日に`,
                    `😊 ${t} — いい天気！気分も上がる`,
                    `✨ ${t} — 気持ちのいい陽気ですね`,
                    `☀️ ${t} — 晴れて気持ちいい。良い一日を`
                ]);
            } else if (isExtremelyDry) {
                comment = pick([
                    `💨 ${t} — 乾燥注意！加湿器やハンドクリームを`,
                    `💨 ${t} — 空気がカラカラ。保湿を忘れずに`,
                    `💨 ${t} — 乾燥で風邪をひきやすい。対策を`
                ]);
            } else if (isVeryDry) {
                comment = pick([
                    `💨 ${t} — 乾燥した空気。のど飴と保湿を忘れずに`,
                    `💨 ${t} — 乾燥気味。こまめに水分を`,
                    `💨 ${t} — 空気が乾いています。保湿を`
                ]);
            } else if (isVeryHumid && pp >= 40) {
                comment = pick([
                    `🌧️ ${t} — 湿気が高い。${pp}%の確率で雨が降りそう`,
                    `🌧️ ${t} — 蒸し蒸しする。雨が近いかも`,
                    `🌧️ ${t} — 湿気多め。傘があると安心`
                ]);
            } else if (isVeryHumid) {
                comment = pick([
                    `💧 ${t} — 湿気が高め。除湿があると快適`,
                    `💧 ${t} — 蒸し蒸しします。エアコンの除湿モードを`,
                    `💧 ${t} — 湿気多め。髪がまとまらない季節`
                ]);
            } else if (isOvercast && isSpring && !isNight) {
                comment = pick([
                    `🌸 ${t} — 穏やかな春曇り。花粉が気になる季節`,
                    `🌷 ${t} — 春らしい曇り空。過ごしやすい気温`,
                    `🌸 ${t} — 春の曇り。花粉対策を忘れずに`
                ]);
            } else if (isOvercast && isLightBreeze) {
                comment = pick([
                    `☁️ ${t} — 曇りですが風が心地いい`,
                    `☁️ ${t} — 曇り空でも風があって快適`,
                    `☁️ ${t} — 風がそよいで過ごしやすい`
                ]);
            } else if (isOvercast) {
                comment = pick([
                    `☁️ ${t} — 曇り空ですが過ごしやすい`,
                    `☁️ ${t} — 曇りでも快適な気温`,
                    `☁️ ${t} — 穏やかな曇り。過ごしやすいです`
                ]);
            } else if (isPartlyCloudy && !isNight) {
                comment = pick([
                    `⛅ ${t} — 薄曇りで心地よい気温`,
                    `⛅ ${t} — 雲があっても過ごしやすい`,
                    `⛅ ${t} — ちょうどいい天気`
                ]);
            } else {
                comment = pick([
                    `☕ ${t} — 穏やかな気温。ゆったり過ごしましょう`,
                    `🍵 ${t} — 心地よい気温。コーヒーでも`,
                    `☕ ${t} — 快適な気温。のんびりしたい`,
                    `🍵 ${t} — 穏やかな1日になりそう`
                ]);
            }
        }
        // COOL 14-18 (やや涼しい) - 1.5x variations
        else if (temp >= 14) {
            if (isNight && isVeryHumid) {
                comment = pick([
                    `🌙 ${t} — ひんやりと湿った夜。雨が近いかも`,
                    `🌙 ${t} — 肌寒く蒸した夜。天気の変化に注意`,
                    `🌙 ${t} — 湿気のある涼しい夜`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🌙 ${t} — 少し肌寒い夜。薄手の上着があると安心`,
                    `🌙 ${t} — 涼しい夜。窓を閉めて休みましょう`,
                    `🌙 ${t} — 心地よく涼しい夜。ぐっすり眠れそう`,
                    `🌙 ${t} — 穏やかな夜。温かい飲み物でも`
                ]);
            } else if (isClear && isDry && isAutumn && !isNight) {
                comment = pick([
                    `🍁 ${t} — 秋の行楽日和。軽い上着で紅葉狩りへ`,
                    `🍂 ${t} — 秋晴れ。お出かけにぴったり`,
                    `🍁 ${t} — 気持ちいい秋晴れ。散歩日和`,
                    `🍂 ${t} — 秋の爽やかさ。外が気持ちいい`
                ]);
            } else if (isClear && isDry && isMorning) {
                comment = pick([
                    `🌅 ${t} — 爽やかな朝。日中は暖かくなります`,
                    `☀️ ${t} — ひんやりした朝。上着を忘れずに`,
                    `🌅 ${t} — 冷え込む朝。日中は穏やかに`,
                    `☀️ ${t} — 朝は涼しいですが良い天気`
                ]);
            } else if (isClear && isDry && isAfternoon) {
                comment = pick([
                    `☀️ ${t} — 晴れた午後。お散歩日和`,
                    `☀️ ${t} — 午後の日差しが心地いい`,
                    `☀️ ${t} — 穏やかな午後。外でのんびり`,
                    `☀️ ${t} — 過ごしやすい午後を楽しんで`
                ]);
            } else if (isClear && isDry && !isNight) {
                comment = pick([
                    `☀️ ${t} — 晴れて爽やかですが涼しい。薄手の上着があると安心`,
                    `🧥 ${t} — 晴れていても涼しい。上着を`,
                    `☀️ ${t} — 気持ちいい晴れ。羽織るものを`,
                    `🧥 ${t} — 涼しい晴れ。上着があると快適`
                ]);
            } else if (isClear && isMorning) {
                comment = pick([
                    `☀️ ${t} — 肌寒い朝。日中は暖かくなります`,
                    `🌅 ${t} — 朝は冷えます。上着を持って`,
                    `☀️ ${t} — 朝は涼しいですが晴れ`,
                    `🌅 ${t} — 冷え込む朝。でも日中は穏やか`
                ]);
            } else if (isClear && isEvening) {
                comment = pick([
                    `🌆 ${t} — 夕方はひんやり。上着があると安心`,
                    `🌇 ${t} — 夕方から冷えてきます`,
                    `🌆 ${t} — 夕暮れは涼しい。羽織るものを`,
                    `🌇 ${t} — 夜に向けて冷えてきます`
                ]);
            } else if (isClear && !isNight) {
                comment = pick([
                    `🧥 ${t} — 晴れていますがひんやり。上着を忘れずに`,
                    `☀️ ${t} — 晴れでも涼しい。薄手の上着を`,
                    `🧥 ${t} — 日差しはあっても空気は冷たい`,
                    `☀️ ${t} — 晴れていますが上着があると安心`
                ]);
            } else if (isVeryHumid && pp >= 40) {
                comment = pick([
                    `🌫️ ${t} — 湿っぽくて肌寒い。${pp}%の確率で雨`,
                    `🌧️ ${t} — 蒸し蒸しして涼しい。傘があると安心`,
                    `🌫️ ${t} — 湿気が多い。雨が降りそう`
                ]);
            } else if (isVeryHumid) {
                comment = pick([
                    `💧 ${t} — 湿気の多い涼しい日`,
                    `💧 ${t} — 蒸し蒸しして涼しい。除湿がおすすめ`,
                    `💧 ${t} — 湿気が高め。洗濯物は部屋干しかな`
                ]);
            } else if (isOvercast && isAutumn) {
                comment = pick([
                    `🍂 ${t} — 秋曇り。温かい飲み物が恋しい`,
                    `🍁 ${t} — 曇りで肌寒い。ホットコーヒーでも`,
                    `🍂 ${t} — 秋の曇り空。のんびり過ごしましょう`
                ]);
            } else if (isOvercast && isSpring && !isNight) {
                comment = pick([
                    `🌸 ${t} — 春曇り。花粉対策を忘れずに`,
                    `🌷 ${t} — 春らしい曇り。過ごしやすい気温`,
                    `🌸 ${t} — 穏やかな春曇り`
                ]);
            } else if (isOvercast) {
                comment = pick([
                    `⛅ ${t} — 曇りで少し肌寒い。長袖がちょうどいい`,
                    `☁️ ${t} — 曇り空で涼しい。上着を`,
                    `⛅ ${t} — 曇りですが過ごしやすい気温`
                ]);
            } else if (isLightBreeze && !isNight) {
                comment = pick([
                    `🍂 ${t} — 風が涼しい。上着があると快適`,
                    `🍃 ${t} — 風が心地よい涼しさ`,
                    `🍂 ${t} — 風があって少し肌寒い`
                ]);
            } else if (isEvening) {
                comment = pick([
                    `🌆 ${t} — 夕方になって涼しくなりました。上着を`,
                    `🌇 ${t} — 夕方は冷えますね。温かくして`,
                    `🌆 ${t} — 夕暮れの涼しさ。羽織るものを`
                ]);
            } else {
                comment = pick([
                    `🍂 ${t} — 秋の空気。温かい飲み物が恋しくなりますね`,
                    `🧥 ${t} — 涼しい気温。上着があると快適`,
                    `🍂 ${t} — 秋らしい涼しさ。ホットドリンクでも`,
                    `🧥 ${t} — 少し肌寒い。羽織るものがあると安心`
                ]);
            }
        }
        // COOL 10-14 (肌寒い) - 1.5x variations
        else if (temp >= 10) {
            if (isNight && isVeryHumid) {
                comment = pick([
                    `🌙 ${t} — 湿った冷たい夜。雨が近いかも`,
                    `🌙 ${t} — 蒸し蒸しして冷える夜`,
                    `🌙 ${t} — 少し湿気のある寒い夜`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🌙 ${t} — 冷え込む夜。暖かくしてお休みください`,
                    `🌙 ${t} — 寒い夜。温かい布団で休みましょう`,
                    `🌙 ${t} — 肌寒い夜。暖房があると快適`,
                    `🌙 ${t} — 冷える夜。温かい飲み物でも`
                ]);
            } else if (isClear && isDry && isMorning && isNorthWind && hasStrongGusts) {
                // 北風＋突風の寒い朝
                comment = pick([
                    `🌬️ ${t} — 北風と突風で体感温度ダウン。しっかり防寒を`,
                    `💨 ${t} — 北風が強く吹いています。傘が飛ばされやすい`,
                    `🧊 ${t} — 冷たい北風と突風。マフラー必須`
                ]);
            } else if (isClear && isDry && isMorning && isNorthWind) {
                // 北風の寒い朝
                comment = pick([
                    `🌬️ ${t} — 北からの冷たい風。体感温度が下がっています`,
                    `💨 ${t} — 北風が吹いています。顔が冷たく感じる朝`,
                    `🧊 ${t} — 冷たい北風。暖かい上着で出かけましょう`
                ]);
            } else if (isClear && isDry && isMorning) {
                comment = pick([
                    `🌅 ${t} — 冷え込む朝。日中は暖かくなる見込み`,
                    `☀️ ${t} — 寒い朝ですが晴れ。上着を忘れずに`,
                    `🌅 ${t} — ひんやりした朝。日中は穏やかに`,
                    `☀️ ${t} — 朝は冷えますが良い天気`
                ]);
            } else if (isClear && isDry && isAfternoon) {
                comment = pick([
                    `☀️ ${t} — 晴れた午後ですが涼しい。上着があると快適`,
                    `☀️ ${t} — 午後も涼しい。羽織るものを`,
                    `🧥 ${t} — 晴れていますが肌寒い午後`,
                    `☀️ ${t} — 日差しはあるけど冷える`
                ]);
            } else if (isClear && isEvening) {
                // Evening specific - no sunlight mentions
                comment = pick([
                    `🌆 ${t} — 夕方から冷え込みます。上着を`,
                    `🌇 ${t} — 日が沈むと急に寒くなります`,
                    `🌆 ${t} — 夕暮れは肌寒い。暖かくして`,
                    `🌇 ${t} — 夜に向けて冷え込みます`
                ]);
            } else if (isClear && isDry && (isMorning || isAfternoon)) {
                comment = pick([
                    `☀️ ${t} — 晴れですが肌寒い。しっかり上着を`,
                    `🧥 ${t} — 晴れでも寒い。上着必須`,
                    `🧥 ${t} — 空気が冷たい。暖かくして`,
                    `🧥 ${t} — 晴れていますが冷えます`
                ]);
            } else if (isClear && isWinter && (isMorning || isAfternoon)) {
                comment = pick([
                    `❄️ ${t} — 冬晴れ。日差しは暖かいですが空気は冷たい`,
                    `☀️ ${t} — 冬の日差し。外は寒いです`,
                    `❄️ ${t} — 晴れていますが冬の寒さ`,
                    `☀️ ${t} — 冬晴れ。風が冷たい`
                ]);
            } else if (isClear && isEvening) {
                comment = pick([
                    `🌆 ${t} — 夕方はぐっと冷えます。上着必須`,
                    `🌇 ${t} — 夕暮れは寒い。暖かくして`,
                    `🌆 ${t} — 夜に向けて冷え込みます`,
                    `🌇 ${t} — 夕方から一気に寒くなります`
                ]);
            } else if (isClear) {
                comment = pick([
                    `🧥 ${t} — 晴れていますが冷えます。上着必須`,
                    `☀️ ${t} — 晴れでも寒い。しっかり防寒を`,
                    `🧥 ${t} — 空気が冷たい。暖かくして`
                ]);
            } else if (isVeryHumid) {
                comment = pick([
                    `🌫️ ${t} — 湿っぽくて底冷え。暖房をつけましょう`,
                    `🌧️ ${t} — じめじめして寒い。暖房が欲しい`,
                    `🌫️ ${t} — 湿気で余計に寒く感じます`
                ]);
            } else if (isOvercast && isWinter) {
                comment = pick([
                    `☁️ ${t} — 冬曇り。暖房が恋しい一日`,
                    `❄️ ${t} — 曇りで寒々しい。温かく過ごして`,
                    `☁️ ${t} — 冬の曇り空。暖房をつけましょう`
                ]);
            } else if (isOvercast && isLightBreeze) {
                comment = pick([
                    `☁️ ${t} — 曇りで風が冷たい。上着をしっかり`,
                    `🌬️ ${t} — 風がひんやり。暖かくして`,
                    `☁️ ${t} — 曇りで肌寒い。防寒を`
                ]);
            } else if (isOvercast) {
                comment = pick([
                    `⛅ ${t} — 曇りで肌寒い。セーターやカーディガンを`,
                    `☁️ ${t} — 曇り空で寒々しい。暖かく`,
                    `⛅ ${t} — 曇りで冷える。上着を忘れずに`
                ]);
            } else if (feelsColder) {
                comment = `🧥 ${t}（体感${fl.toFixed(0)}°C）— 風で体感温度は低め`;
            } else {
                comment = pick([
                    `🧥 ${t} — 涼しさを通り越して寒い。暖かくして`,
                    `🧥 ${t} — 肌寒い。上着があると安心`,
                    `🧥 ${t} — 冷える気温。温かい飲み物でも`,
                    `🧥 ${t} — 寒くなってきました。防寒を`
                ]);
            }
        }
        // CHILLY 5-10 (寒い) - 1.5x variations
        else if (temp >= 5) {
            if (isNight && isVeryHumid && pp >= 40) {
                comment = pick([
                    `🌙 ${t} — 湿った冷たい夜。${pp}%の確率で雨`,
                    `🌙 ${t} — じめじめして寒い夜。雨が近いかも`,
                    `🌙 ${t} — 湿度高く底冷えする夜。傘を用意して`
                ]);
            } else if (isNight && isVeryHumid) {
                comment = pick([
                    `🌙 ${t} — 湿った冷たい夜。底冷えします`,
                    `🌙 ${t} — じめじめして寒い夜`,
                    `🌙 ${t} — 湿度高く底冷えする夜`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🌙 ${t} — 冷え込む夜。暖房をつけてゆっくり休みましょう`,
                    `🌙 ${t} — 寒い夜。温かい布団で眠りましょう`,
                    `🌙 ${t} — 冷える夜。温かい飲み物でリラックス`,
                    `🌙 ${t} — 暖房が恋しい夜。ゆっくり休んで`
                ]);
            } else if (isClear && isExtremelyDry && (isMorning || isAfternoon)) {
                comment = pick([
                    `🌬️ ${t} — キリッと晴れ。空気がカラカラ。保湿必須`,
                    `💨 ${t} — 乾燥した晴れ。肌がガサガサに`,
                    `🌬️ ${t} — 晴れですが乾燥注意。保湿を`
                ]);
            } else if (isClear && isVeryDry && (isMorning || isAfternoon)) {
                comment = pick([
                    `🌬️ ${t} — キリッと冷たい晴れ。空気が乾燥しています`,
                    `❄️ ${t} — 晴れていますが乾燥で唇が荒れそう`,
                    `🌬️ ${t} — 乾いた冷気。のど飴があると安心`
                ]);
            } else if (isClear && isMorning) {
                comment = pick([
                    `❄️ ${t} — 霜が降りるような朝。日中も寒い`,
                    `🌅 ${t} — 凍える朝。暖かくして出かけて`,
                    `❄️ ${t} — 冷え込んだ朝。車のフロントガラスに霜`,
                    `🌅 ${t} — 寒い朝。温かい朝食で体を温めて`
                ]);
            } else if (isClear && isAfternoon) {
                comment = pick([
                    `❄️ ${t} — 冬晴れの午後。日差しがあると少し暖かい`,
                    `☀️ ${t} — 晴れていますが寒い午後。防寒必須`,
                    `❄️ ${t} — 午後も冷える。暖かくして`,
                    `☀️ ${t} — 日差しはあるけど空気は冷たい`
                ]);
            } else if (isClear && isEvening) {
                comment = pick([
                    `🌆 ${t} — 日が沈むと急に冷えます。防寒対策を`,
                    `🌇 ${t} — 夕方から一気に冷え込みます`,
                    `🌆 ${t} — 夜に向けて厳しい寒さに`,
                    `🌇 ${t} — 夕暮れは寒い。早めに帰宅を`
                ]);
            } else if (isClear) {
                comment = pick([
                    `⛄ ${t} — 晴れていますが寒いです。しっかり防寒を`,
                    `❄️ ${t} — 冬晴れ。寒さ対策を万全に`,
                    `⛄ ${t} — 晴れでも冷える。コート必須`
                ]);
            } else if ((isExtremelyHumid || isVeryHumid) && actualPrecipState.hasForecastPrecip) {
                // Yahoo API予報で1時間以内に降水予報あり - タイプ別コメント
                const fType = actualPrecipState.forecastPrecipType;
                if (fType === 'snow') {
                    comment = pick([
                        `❄️ ${t}・湿度${h}% — 湿度高く底冷え。雪の予感`,
                        `🌨️ ${t} — じめじめして凍えそう。雪が降りそう`,
                        `❄️ ${t} — 湿った寒さ。雪に注意`
                    ]);
                } else if (fType === 'sleet') {
                    comment = pick([
                        `❄️ ${t}・湿度${h}% — 湿度高く底冷え。みぞれの予感`,
                        `🌨️ ${t} — じめじめして凍えそう。みぞれが降りそう`,
                        `❄️ ${t} — 湿った寒さ。みぞれに注意`
                    ]);
                } else {
                    comment = pick([
                        `❄️ ${t}・湿度${h}% — 湿度高く底冷え。雨が降りそう`,
                        `🌧️ ${t} — じめじめして凍えそう。傘を忘れずに`,
                        `❄️ ${t} — 湿った寒さ。雨に注意`
                    ]);
                }
            } else if (isExtremelyHumid || isVeryHumid) {
                // 降水予報がない場合は雪への言及を避ける
                comment = pick([
                    `❄️ ${t}・湿度${h}% — 湿度高く底冷え。暖房を`,
                    `🥶 ${t} — じめじめして凍えそう。暖かくして`,
                    `❄️ ${t} — 湿った寒さ。体の芯から冷える`
                ]);
            } else if (isHumid) {
                comment = pick([
                    `❄️ ${t} — 湿度が高く底冷えします。暖房で暖まりましょう`,
                    `🥶 ${t} — じめっとした寒さ。暖房が欲しい`,
                    `❄️ ${t} — 湿気で余計に寒く感じます`
                ]);
            } else if (isOvercast && isWinter && actualPrecipState.hasForecastPrecip) {
                // Yahoo API予報で1時間以内に降水予報あり - タイプ別コメント
                const fType = actualPrecipState.forecastPrecipType;
                if (fType === 'snow') {
                    comment = pick([
                        `☁️ ${t} — 冬曇り。雪がちらつきそう`,
                        `❄️ ${t} — 曇りで寒い。雪の可能性あり`,
                        `☁️ ${t} — 冬の曇り空。雪に注意`
                    ]);
                } else if (fType === 'sleet') {
                    comment = pick([
                        `☁️ ${t} — 冬曇り。みぞれがちらつきそう`,
                        `🌨️ ${t} — 曇りで寒い。みぞれの可能性あり`,
                        `☁️ ${t} — 冬の曇り空。みぞれに注意`
                    ]);
                } else {
                    comment = pick([
                        `☁️ ${t} — 冬曇り。冷たい雨が降りそう`,
                        `🌧️ ${t} — 曇りで寒い。傘を忘れずに`,
                        `☁️ ${t} — 冬の曇り空。雨に注意`
                    ]);
                }
            } else if (isOvercast && isWinter) {
                // 降水予報がない場合は雪への言及を避ける
                comment = pick([
                    `☁️ ${t} — 冬曇り。寒々しい一日`,
                    `❄️ ${t} — 曇りで寒い。温かくして`,
                    `☁️ ${t} — 冬の曇り空。暖房をつけましょう`
                ]);
            } else if (isOvercast) {
                comment = pick([
                    `☁️ ${t} — 曇りで寒々しい。温かい飲み物で一息を`,
                    `⛅ ${t} — 曇りで冷える。ホットドリンクで温まって`,
                    `☁️ ${t} — 寒々しい曇り空。暖かくして`
                ]);
            } else if (isWindy || isVeryWindy) {
                comment = pick([
                    `🌬️ ${t} — 風が冷たい。体感温度はもっと低い`,
                    `💨 ${t} — 強い風で凍えそう。マフラー必須`,
                    `🌬️ ${t} — 風で体感は氷点下かも`
                ]);
            } else if (feelsColder) {
                comment = `🧣 ${t}（体感${fl.toFixed(0)}°C）— 風で体感はもっと寒い`;
            } else {
                comment = pick([
                    `🧣 ${t} — コートとマフラーの季節ですね`,
                    `🧥 ${t} — しっかり防寒。風邪に注意`,
                    `🧣 ${t} — 冬本番。暖かくしてお出かけを`,
                    `🧥 ${t} — 寒い。温かい飲み物が恋しい`
                ]);
            }
        }
        // COLD 0-5 (とても寒い) - 1.5x variations
        else if (temp >= 0) {
            if (isNight && isVeryHumid && actualPrecipState.hasForecastPrecip) {
                // Yahoo API予報で1時間以内に降水予報あり - タイプ別コメント
                const fType = actualPrecipState.forecastPrecipType;
                if (fType === 'snow') {
                    comment = pick([
                        `🥶 ${t} — 湿った凍える夜。雪が降りそう`,
                        `❄️ ${t} — 冷えて湿度高い夜。積雪注意`,
                        `🥶 ${t} — 凍える夜。雪の気配`
                    ]);
                } else if (fType === 'sleet') {
                    comment = pick([
                        `🥶 ${t} — 湿った凍える夜。みぞれが降りそう`,
                        `🌨️ ${t} — 冷えて湿度高い夜。みぞれに注意`,
                        `🥶 ${t} — 凍える夜。みぞれの気配`
                    ]);
                } else {
                    comment = pick([
                        `🥶 ${t} — 湿った凍える夜。冷たい雨が降りそう`,
                        `🌧️ ${t} — 冷えて湿度高い夜。傘を忘れずに`,
                        `🥶 ${t} — 凍える夜。雨が降りそう`
                    ]);
                }
            } else if (isNight && isVeryHumid) {
                // 降水予報がない場合は降水への言及を避ける
                comment = pick([
                    `🥶 ${t} — 湿った凍える夜。底冷えがします`,
                    `❄️ ${t} — 湿度が高く芯から冷える夜`,
                    `🥶 ${t} — 湿った寒さ。暖房をしっかり`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🥶 ${t} — 凍える夜。暖房をしっかり効かせてお休みを`,
                    `❄️ ${t} — 極寒の夜。暖かくして休みましょう`,
                    `🥶 ${t} — 氷点下近い夜。暖房フル稼働で`,
                    `❄️ ${t} — 凍てつく夜。温かいものを飲んで`
                ]);
            } else if (actualPrecipState.hasForecastPrecip && isHumid) {
                // Yahoo API予報で1時間以内に降水予報あり - タイプ別コメント
                const fType = actualPrecipState.forecastPrecipType;
                if (fType === 'snow') {
                    comment = pick([
                        `🌨️ ${t}・湿度${h}% — 雪になりそう。積もるかも`,
                        `❄️ ${t} — 雪の予報。積雪に注意`,
                        `🌨️ ${t} — 雪になりそう。路面凍結警戒`
                    ]);
                } else if (fType === 'sleet') {
                    comment = pick([
                        `🌨️ ${t}・湿度${h}% — みぞれになりそう。足元注意`,
                        `🌧️ ${t} — みぞれの予報。滑りやすいので注意`,
                        `🌨️ ${t} — みぞれになりそう。傘を忘れずに`
                    ]);
                } else {
                    comment = pick([
                        `🌧️ ${t}・湿度${h}% — 冷たい雨が降りそう。傘を`,
                        `☔ ${t} — 雨の予報。濡れると冷えます`,
                        `🌧️ ${t} — 雨が降りそう。傘と上着を`
                    ]);
                }
            } else if (actualPrecipState.hasForecastPrecip) {
                // Yahoo API予報で1時間以内に降水予報あり - タイプ別コメント
                const fType = actualPrecipState.forecastPrecipType;
                if (fType === 'snow') {
                    comment = pick([
                        `🌨️ ${t} — 雪になりそうな寒さ。路面凍結にご注意を`,
                        `❄️ ${t} — 雪が降りそう。滑りやすいので注意`,
                        `🌨️ ${t} — 雪の可能性。早めの帰宅を`
                    ]);
                } else if (fType === 'sleet') {
                    comment = pick([
                        `🌨️ ${t} — みぞれになりそう。足元にご注意を`,
                        `🌧️ ${t} — みぞれが降りそう。傘を忘れずに`,
                        `🌨️ ${t} — みぞれの可能性。滑りやすいので注意`
                    ]);
                } else {
                    comment = pick([
                        `🌧️ ${t} — 冷たい雨が降りそう。傘をお忘れなく`,
                        `☔ ${t} — 雨が降りそう。濡れると冷えます`,
                        `🌧️ ${t} — 雨の可能性。傘を持って出かけましょう`
                    ]);
                }
            } else if (isClear && isMorning) {
                comment = pick([
                    `❄️ ${t} — 放射冷却で凍える朝。路面凍結注意`,
                    `🌅 ${t} — キンキンに冷えた朝。車の運転注意`,
                    `❄️ ${t} — 霜で真っ白な朝。足元注意`,
                    `🌅 ${t} — 凍える朝。温かい飲み物で体を起こして`
                ]);
            } else if (isClear && isAfternoon) {
                comment = pick([
                    `❄️ ${t} — 冬晴れの午後。日差しがあると少しまし`,
                    `☀️ ${t} — 晴れでも寒い午後。防寒しっかり`,
                    `❄️ ${t} — 午後も凍える。暖かくして`,
                    `☀️ ${t} — 日差しがあっても寒風が冷たい`
                ]);
            } else if (isClear && isEvening) {
                comment = pick([
                    `🌆 ${t} — 日が沈むと氷点下に近づきます。防寒を`,
                    `🌇 ${t} — 夜はさらに冷え込みます。暖かくして`,
                    `🌆 ${t} — 夕方から急激に冷え込みます`,
                    `🌇 ${t} — 日没後は凍える寒さ。早めに帰宅を`
                ]);
            } else if (isClear && (isMorning || isAfternoon)) {
                comment = pick([
                    `🥶 ${t} — 凍えるような晴れ。放射冷却で冷え込んでいます`,
                    `❄️ ${t} — 冬晴れ。見た目より寒い`,
                    `🥶 ${t} — 晴れても極寒。しっかり防寒を`
                ]);
            } else if (isClear && (isEvening || isNight)) {
                comment = pick([
                    `🌙 ${t} — 凍える夜。暖房必須`,
                    `❄️ ${t} — 極寒の夜。暖かくして`,
                    `🥶 ${t} — 凍てつく夜。外出は控えめに`
                ]);
            } else if (isVeryWindy) {
                comment = pick([
                    `🥶 ${t} — 寒風が身にしみる。体感は氷点下`,
                    `🌬️ ${t} — 凍てつく強風。外出は控えめに`,
                    `🥶 ${t} — 強風で体感は危険レベル`
                ]);
            } else if (isWindy) {
                comment = pick([
                    `🌬️ ${t} — 風が冷たく体感は更に下。防寒必須`,
                    `💨 ${t} — 風で体感は氷点下。マフラー必須`,
                    `🌬️ ${t} — 風が冷たい。暖かくして`
                ]);
            } else if (isOvercast && isVeryHumid && actualPrecipState.hasForecastPrecip) {
                // Yahoo API予報で1時間以内に降水予報あり
                comment = pick([
                    `☁️ ${t} — どんより寒い。雪が近いかも`,
                    `❄️ ${t} — 曇りで底冷え。雪の予感`,
                    `☁️ ${t} — 寒々しい曇り。いつ雪が降ってもおかしくない`
                ]);
            } else if (isOvercast && isVeryHumid) {
                // 降水予報がない場合は雪への言及を避ける
                comment = pick([
                    `☁️ ${t} — どんより寒い。底冷えの一日`,
                    `❄️ ${t} — 曇りで底冷え。暖房を`,
                    `☁️ ${t} — 寒々しい曇り。暖かくして`
                ]);
            } else if (isOvercast && actualPrecipState.hasForecastPrecip) {
                // Yahoo API予報で1時間以内に降水予報あり - タイプ別コメント
                const fType = actualPrecipState.forecastPrecipType;
                if (fType === 'snow') {
                    comment = pick([
                        `☁️ ${t} — どんより寒い。雪の気配を感じます`,
                        `⛅ ${t} — 曇りで凍える。雪が降りそう`,
                        `☁️ ${t} — 寒々しい曇り空。雪に注意`
                    ]);
                } else if (fType === 'sleet') {
                    comment = pick([
                        `☁️ ${t} — どんより寒い。みぞれの気配を感じます`,
                        `⛅ ${t} — 曇りで凍える。みぞれが降りそう`,
                        `☁️ ${t} — 寒々しい曇り空。みぞれに注意`
                    ]);
                } else {
                    comment = pick([
                        `☁️ ${t} — どんより寒い。冷たい雨が降りそう`,
                        `⛅ ${t} — 曇りで凍える。傘を忘れずに`,
                        `☁️ ${t} — 寒々しい曇り空。雨に注意`
                    ]);
                }
            } else if (isOvercast) {
                // 降水予報がない場合は雪への言及を避ける
                comment = pick([
                    `☁️ ${t} — どんより寒い。底冷えの一日`,
                    `⛅ ${t} — 曇りで凍える。暖房が恋しい`,
                    `☁️ ${t} — 寒々しい曇り空。温かくして`
                ]);
            } else if (feelsColder) {
                comment = `🥶 ${t}（体感${fl.toFixed(0)}°C）— 風で体感は氷点下`;
            } else {
                comment = pick([
                    `🥶 ${t} — かなり冷え込んでいます。厚着をして暖かく`,
                    `❄️ ${t} — 極寒。防寒対策を万全に`,
                    `🥶 ${t} — 凍える寒さ。暖房をつけましょう`,
                    `❄️ ${t} — 冬本番の寒さ。温かくして`
                ]);
            }
        }
        // FREEZING -5 to 0 - Expanded
        else if (temp >= -5) {
            if ((isVeryHumid || isExtremelyHumid) && actualPrecipState.hasForecastPrecip) {
                // Yahoo API予報で1時間以内に降水予報あり - タイプ別コメント
                const fType = actualPrecipState.forecastPrecipType;
                if (fType === 'snow') {
                    comment = pick([
                        `❄️ ${t}・湿度${h}% — 氷点下で湿度高い。大雪になりそう`,
                        `🌨️ ${t} — 氷点下で湿気たっぷり。積雪警戒`,
                        `❄️ ${t} — 雪が本降りになりそう。交通情報を確認`
                    ]);
                } else if (fType === 'sleet') {
                    comment = pick([
                        `❄️ ${t}・湿度${h}% — 氷点下で湿度高い。みぞれになりそう`,
                        `🌨️ ${t} — 氷点下で湿気たっぷり。みぞれ警戒`,
                        `❄️ ${t} — みぞれが本降りになりそう。足元注意`
                    ]);
                } else {
                    comment = pick([
                        `❄️ ${t}・湿度${h}% — 氷点下で湿度高い。冷たい雨に注意`,
                        `🌧️ ${t} — 氷点下で湿気たっぷり。傘を忘れずに`,
                        `❄️ ${t} — 冷たい雨が降りそう。濡れると危険`
                    ]);
                }
            } else if (isVeryHumid || isExtremelyHumid) {
                // 降水予報がない場合は雪への言及を避ける
                comment = pick([
                    `❄️ ${t}・湿度${h}% — 氷点下で湿度高い。極寒です`,
                    `🧂 ${t} — 氷点下で湿気たっぷり。耐え難い寒さ`,
                    `❄️ ${t} — 凍てつく寒さ。暖房をしっかり`
                ]);
            } else if (isHumid && actualPrecipState.hasForecastPrecip) {
                // Yahoo API予報で1時間以内に降水予報あり - タイプ別コメント
                const fType = actualPrecipState.forecastPrecipType;
                if (fType === 'snow') {
                    comment = pick([
                        `❄️ ${t} — 氷点下で湿度も高い。雪が降りそう`,
                        `🌨️ ${t} — 雪の気配。積もるかもしれません`,
                        `❄️ ${t} — 雪が降りそう。路面凍結に注意`
                    ]);
                } else if (fType === 'sleet') {
                    comment = pick([
                        `❄️ ${t} — 氷点下で湿度も高い。みぞれが降りそう`,
                        `🌨️ ${t} — みぞれの気配。足元注意`,
                        `❄️ ${t} — みぞれが降りそう。滑りやすいので注意`
                    ]);
                } else {
                    comment = pick([
                        `❄️ ${t} — 氷点下で湿度も高い。冷たい雨が降りそう`,
                        `🌧️ ${t} — 冷たい雨の気配。傘を忘れずに`,
                        `❄️ ${t} — 冷たい雨が降りそう。濡れると危険`
                    ]);
                }
            } else if (isHumid) {
                // 降水予報がない場合は雪への言及を避ける
                comment = pick([
                    `❄️ ${t} — 氷点下で湿度も高い。極寒です`,
                    `🧂 ${t} — 湿った氷点下。暖かくして`,
                    `❄️ ${t} — 凍てつく寒さ。水道管凍結に注意`
                ]);
            } else if (isVeryWindy) {
                comment = pick([
                    `🧊 ${t} — 氷点下の強風。外出は極力避けて`,
                    `❄️ ${t} — 風で体感は-10°C以下。凍傷注意`,
                    `🧊 ${t} — 猛烈に冷たい風。肌を露出しないで`
                ]);
            } else if (isClear && isMorning) {
                comment = pick([
                    `🧊 ${t} — 放射冷却で極寒の朝。水道管凍結注意`,
                    `❄️ ${t} — 晴れた朝ほど冷える。路面凍結警戒`,
                    `🧊 ${t} — 霜が降りています。車のフロントガラス凍結`
                ]);
            } else if (isClear) {
                comment = pick([
                    `🧊 ${t} — 快晴ですが極寒。放射冷却で猛烈に冷えています`,
                    `❄️ ${t} — 晴れていても氷点下。陽だまりも寒い`,
                    `🧊 ${t} — 青空でも凍える寒さ。暖かい服装で`
                ]);
            } else if (isNight) {
                comment = pick([
                    `🧊 ${t} — 氷点下の夜。暖房をしっかり効かせて`,
                    `❄️ ${t} — 凍てつく夜。水道を少し出しておいて`,
                    `🧊 ${t} — 極寒の夜。温かくしてお休みを`
                ]);
            } else {
                comment = pick([
                    `🧊 ${t} — 氷点下です。水道管凍結にご注意を`,
                    `❄️ ${t} — 路面凍結に厳重注意。滑りやすい`,
                    `🧊 ${t} — 東京では珍しい寒さ。暖かくして`,
                    `❄️ ${t} — 凍える寒さ。ホットドリンクで温まって`
                ]);
            }
        }
        // EXTREME COLD -5 below - Expanded
        else {
            if (isVeryHumid || isExtremelyHumid) {
                comment = pick([
                    `⚠️ ${t}・湿度${h}% — 大雪・吹雪の恐れ。不要不急の外出は控えて`,
                    `🆘 ${t} — 命に関わる寒さと大雪。絶対に外出しないで`,
                    `⚠️ ${t} — 記録的大雪の可能性。交通機関に影響大`
                ]);
            } else if (isStormWind || isVeryWindy) {
                comment = pick([
                    `⚠️ ${t} — 猛烈な寒さと強風。命に関わる危険。外出禁止`,
                    `🆘 ${t} — ホワイトアウトの危険。車の運転は厳禁`,
                    `⚠️ ${t} — 猛吹雪。視界ゼロ。絶対に外出しないで`
                ]);
            } else if (temp <= -10) {
                comment = pick([
                    `⚠️ ${t} — 極寒！数分で凍傷の危険。絶対に外出しないで`,
                    `🆘 ${t} — 命に関わる寒さ。電気・水道・ガスを確認`,
                    `⚠️ ${t} — 観測史上最低レベル。暖房を最大に`,
                    `🆘 ${t} — 一歩も外に出ないで。凍傷・低体温症の危険`
                ]);
            } else if (isClear && isMorning) {
                comment = pick([
                    `⚠️ ${t} — 極寒の朝。水道管・給湯器の凍結注意`,
                    `🧊 ${t} — 放射冷却で記録的冷え込み。外出は控えて`,
                    `⚠️ ${t} — 霜柱がすごいことに。滑りやすい`
                ]);
            } else if (isNight) {
                comment = pick([
                    `⚠️ ${t} — 極寒の夜。暖房を切らないで`,
                    `🧊 ${t} — 凍てつく夜。水を少し出しておいて`,
                    `⚠️ ${t} — 命の危険がある寒さ。暖房フル稼働で`
                ]);
            } else {
                comment = pick([
                    `🥶 ${t} — 厳しい冷え込み。短時間でも凍傷に注意`,
                    `⚠️ ${t} — 東京では考えられない寒さ。外出は控えて`,
                    `🧊 ${t} — 極寒。肌を露出するとすぐに凍傷の危険`,
                    `⚠️ ${t} — 記録的な寒さ。暖房と防寒を万全に`
                ]);
            }
        }
    }

    // ============================================================
    // SUFFIX CONTROL: サフィックス数制限と優先度管理
    // 優先サフィックス: 警報、降水警告、天気変化 → 制限なし
    // 任意サフィックス: 風、体感温度、花粉、曜日、洗濯等 → 最大2つまで
    // ============================================================
    let optionalSuffixCount = 0;
    const MAX_OPTIONAL_SUFFIXES = 2;

    // ============================================================
    // 【最優先】ALERT SUFFIXES - 警報は最初に表示
    // 優先順位: 特別警報 > 警報 > 注意報（1つだけ表示）
    // ============================================================
    if (currentAlerts.length > 0) {
        const specialWarnings = currentAlerts.filter(a => a.name?.includes('特別警報'));
        const severeWarnings = currentAlerts.filter(a => a.name?.includes('警報') && !a.name?.includes('特別'));
        const advisories = currentAlerts.filter(a => a.name?.includes('注意報'));

        // 特別警報（最優先）
        if (specialWarnings.length > 0) {
            const names = specialWarnings.slice(0, 2).map(a => a.name).join('・');
            comment += pick([
                ` 🚨 ${names}発令中！命を守る行動を`,
                ` 🆘 ${names}！直ちに安全確保を`
            ]);
        }
        // 警報（特別警報がなければ表示）
        else if (severeWarnings.length > 0) {
            const warningNames = severeWarnings.slice(0, 2).map(a => a.name).join('・');
            comment += ` ⚠️ ${warningNames}発令中`;
        }
        // 注意報（警報がなければ表示、ただし確率50%）
        else if (advisories.length > 0 && Math.random() < 0.5) {
            const advName = advisories[0].name;
            comment += ` ℹ️ ${advName}`;
        }
    }

    // ============================================================
    // ADD WIND WARNING (if not already mentioned in weather)
    // ============================================================
    if (isVeryWindy && !isSnow && !isThunderstorm) {
        comment += ' 🌀 強風です。飛ばされないよう注意';
        optionalSuffixCount++;
    } else if (isWindy && !isRaining && !isSnow && optionalSuffixCount < MAX_OPTIONAL_SUFFIXES) {
        comment += ' 💨 風があります';
        optionalSuffixCount++;
    }

    // ============================================================
    // ADD FEELS LIKE TEMPERATURE DIFFERENCE
    // 大きな差（±5°C以上）は優先表示、小さい差（±3-5°C）は制限カウント
    // ============================================================
    const feelsDiff = fl - temp;
    if (!comment.includes('体感') && Math.abs(feelsDiff) >= 3) {
        if (feelsDiff >= 5) {
            // 大きな差は優先（制限カウントしない）
            comment += ` 🌡️ 体感は${fl.toFixed(0)}°C（+${feelsDiff.toFixed(0)}°C）`;
        } else if (feelsDiff >= 3 && optionalSuffixCount < MAX_OPTIONAL_SUFFIXES) {
            comment += ` 🌡️ 体感は${fl.toFixed(0)}°Cと暖かめ`;
            optionalSuffixCount++;
        } else if (feelsDiff <= -5) {
            // 大きな差は優先（制限カウントしない）
            comment += ` 🌡️ 体感は${fl.toFixed(0)}°C（${feelsDiff.toFixed(0)}°C）`;
        } else if (feelsDiff <= -3 && optionalSuffixCount < MAX_OPTIONAL_SUFFIXES) {
            comment += ` 🌡️ 体感は${fl.toFixed(0)}°Cと寒め`;
            optionalSuffixCount++;
        }
    }

    // ============================================================
    // ADD PRECIPITATION WARNING (Yahoo API優先 + Open-Meteo雪判定)
    // メインコメントで既に降水について言及している場合はスキップ
    // ============================================================
    const precipType = getPrecipitationType();
    const precipEmoji = precipType === 'snow' ? '❄️' : precipType === 'sleet' ? '🌨️' : '☂️';
    const precipName = precipType === 'snow' ? '雪' : precipType === 'sleet' ? 'みぞれ' : '雨';

    // メインコメントが既に降水について言及しているかチェック
    const mainCommentHasPrecip = isRaining || isRainingOpenMeteo || isSnowActual || isSleetActual ||
        isHeavySnow || isSnow || isSleet || isHeavyRain || isModerateRain || isRain || isDrizzle;

    // Yahoo API実測データを優先（ただしメインで言及済みならスキップ）
    if (!mainCommentHasPrecip && actualPrecipState.isRaining && actualPrecipState.consecutiveMinutes >= 10) {
        // 現在降っている場合 - actualPrecipStateから情報取得
        const intensity = getPrecipIntensityLabel(actualPrecipState.rainfall, actualPrecipState.precipType);
        const currentEmoji = actualPrecipState.precipType === 'snow' ? '❄️' :
            actualPrecipState.precipType === 'sleet' ? '🌨️' : '🌧️';
        comment += ` ${currentEmoji} ${intensity}が降っています`;

        // 今後雪に変わる予報があるか確認
        const currentHour = new Date().getHours();
        if (actualPrecipState.precipType === 'rain' || actualPrecipState.precipType === 'sleet') {
            for (let i = 1; i <= 3; i++) {
                const futureType = getPrecipitationType(currentHour + i);
                if (futureType === 'snow') {
                    comment += ` → 約${i}時間後に雪に変わる見込み`;
                    break;
                }
            }
        }
    } else if (!mainCommentHasPrecip && actualPrecipState.rainfall > 0) {
        // 降り始め（10分未満）
        const currentEmoji = actualPrecipState.precipType === 'snow' ? '❄️' :
            actualPrecipState.precipType === 'sleet' ? '🌨️' : '🌧️';
        const currentName = actualPrecipState.precipType === 'snow' ? '雪' :
            actualPrecipState.precipType === 'sleet' ? 'みぞれ' : '雨';
        comment += ` ${currentEmoji} ${currentName}が降り始めています`;
    } else if (!mainCommentHasPrecip && willRain && pp >= 70) {
        // Yahoo APIでは降っていないが、Open-Meteoで高確率で降水予報
        comment += ` ${precipEmoji} ${precipName}の予報。${precipType === 'snow' ? '外出は控えめに' : precipType === 'sleet' ? '足元に注意' : '傘を持っていきましょう'}`;
    } else if (!mainCommentHasPrecip && willRain && pp >= 50) {
        comment += ` 🌂 降水確率高め。${precipType === 'snow' ? '雪に変わるかも' : '念のため傘を'}`;
    }

    // ============================================================
    // ADD WEATHER FORECAST (worsening/improving)
    // ============================================================
    const willWorsen = weatherData?.willWorsen;
    const willImprove = weatherData?.willImprove;
    const maxFuturePrecip = weatherData?.maxFuturePrecipProb || 0;
    const tempIn3h = weatherData?.tempIn3Hours;

    if (willWorsen && maxFuturePrecip >= 60 && !actualPrecipState.isRaining) {
        comment += ' ⚠️ 数時間後に天気が崩れそうです';
    } else if (willWorsen && maxFuturePrecip >= 40 && !actualPrecipState.isRaining) {
        comment += ' 🌥️ この後、雲が増えてきそう';
    }

    if (willImprove && !actualPrecipState.isRaining) {
        comment += ' 🌤️ これから晴れてきます';
    } else if (willImprove && actualPrecipState.isRaining) {
        const stopMsg = actualPrecipState.precipType === 'snow' ? '雪が弱まりそう' :
            actualPrecipState.precipType === 'sleet' ? 'みぞれが上がりそう' : '雨が上がりそう';
        comment += ` 🌈 もう少しで${stopMsg}`;
    }

    // Temperature change forecast
    if (tempIn3h && Math.abs(tempIn3h - temp) >= 4) {
        if (tempIn3h > temp) {
            comment += ` 📈 3時間後は${tempIn3h.toFixed(0)}°Cに上昇`;
        } else {
            comment += ` 📉 3時間後は${tempIn3h.toFixed(0)}°Cに下降`;
        }
    }

    // ============================================================
    // SEASONAL EVENT COMMENTS
    // ============================================================
    const day = now.getDate();

    // クリスマス (12/24-25)
    if (month === 12 && (day === 24 || day === 25)) {
        comment += pick([
            ' 🎄 メリークリスマス！素敵な1日を',
            ' 🎅 クリスマス！温かく過ごしてね',
            ' 🌟 聖夜に幸せが訪れますように'
        ]);
    }
    // 大晦日 (12/31)
    else if (month === 12 && day === 31) {
        comment += pick([
            ' 🎊 大晦日！今年もお疲れさまでした',
            ' 🔔 年越しまであと少し！',
            ' ✨ 良いお年をお迎えください'
        ]);
    }
    // 元日 (1/1)
    else if (month === 1 && day === 1) {
        comment += pick([
            ' 🎍 あけましておめでとうございます！',
            ' 🌅 新年おめでとう！素敵な1年に',
            ' 🐉 今年もよろしくお願いします'
        ]);
    }
    // バレンタイン (2/14)
    else if (month === 2 && day === 14) {
        comment += pick([
            ' 💝 ハッピーバレンタイン！',
            ' 🍫 今日はバレンタインデー',
            ' 💕 素敵なバレンタインを'
        ]);
    }
    // ひな祭り (3/3)
    else if (month === 3 && day === 3) {
        comment += ' 🎎 ひな祭り！お雛様を飾りましたか？';
    }
    // GW (4/29-5/5)
    else if ((month === 4 && day >= 29) || (month === 5 && day <= 5)) {
        comment += pick([
            ' 🌸 GW！お出かけ日和ですね',
            ' 🎏 ゴールデンウィーク！',
            ' 🌿 連休を楽しんで'
        ]);
    }
    // 七夕 (7/7)
    else if (month === 7 && day === 7) {
        comment += pick([
            ' 🎋 七夕！願い事は何ですか？',
            ' ⭐ 織姫と彦星が出会う日',
            ' 🌌 晴れたら天の川が見えるかな'
        ]);
    }
    // お盆 (8/13-16)
    else if (month === 8 && day >= 13 && day <= 16) {
        comment += pick([
            ' 🏮 お盆ですね。ご先祖様に感謝を',
            ' 🎆 お盆休み、ゆっくり過ごして',
            ' 🍉 夏真っ盛りのお盆です'
        ]);
    }
    // ハロウィン (10/31)
    else if (month === 10 && day === 31) {
        comment += pick([
            ' 🎃 ハッピーハロウィン！',
            ' 👻 トリックオアトリート！',
            ' 🦇 ハロウィンの夜、楽しんで'
        ]);
    }

    // ============================================================
    // HEALTH ADVICE SUFFIXES (expanded x2)
    // ============================================================
    if (isPollenSeason && !isRaining && isMorning) {
        comment += pick([
            ' 🌼 花粉が飛びやすい朝。マスクを',
            ' 🤧 朝は花粉が多め。対策を万全に',
            ' 🌼 花粉注意の朝。目薬も忘れずに',
            ' 🤧 花粉が舞いやすい時間帯。マスク必須',
            ' 🌼 朝の花粉ピーク。窓を閉めて',
            ' 🤧 花粉飛散中。帰宅後は服を払って'
        ]);
    } else if (isPollenSeason && !isRaining && isAfternoon) {
        comment += pick([
            ' 🌼 午後も花粉に注意',
            ' 🤧 花粉は夕方まで続きます',
            ' 🌼 洗濯物の外干しは要注意',
            ' 🤧 花粉対策を継続して'
        ]);
    } else if (isPollenSeason && !isRaining) {
        comment += pick([
            ' 🌼 花粉シーズン。対策を忘れずに',
            ' 🤧 花粉が飛んでいます。ご注意を',
            ' 🌼 花粉情報をチェックして',
            ' 🤧 花粉症の方はお大事に'
        ]);
    }

    if (isDrySkinRisk && isWinter && isMorning) {
        comment += pick([
            ' 💧 空気がカラカラ。保湿を忘れずに',
            ' 🧴 乾燥注意。ハンドクリームを',
            ' 💨 乾燥した朝。リップクリームも',
            ' 💧 乾燥で肌荒れ注意。保湿を'
        ]);
    } else if (isDrySkinRisk && isWinter) {
        comment += pick([
            ' 💧 空気が乾燥中。のど飴があると安心',
            ' 🧴 乾燥注意。加湿器をつけましょう',
            ' 💨 カラカラ空気。水分もこまめに',
            ' 💧 乾燥でウイルスも活発に。対策を'
        ]);
    }

    if (isDangerWBGT && !isThunderstorm && !isRaining) {
        comment += pick([
            ` 🆘 WBGT${wbgt.toFixed(0)} 運動禁止レベル`,
            ` 🆘 WBGT${wbgt.toFixed(0)} 屋外活動は厳禁`,
            ` 🆘 WBGT${wbgt.toFixed(0)} 熱中症警戒アラート`,
            ` 🆘 WBGT${wbgt.toFixed(0)} 外出は控えて`
        ]);
    } else if (isHighWBGT && !isRaining) {
        comment += pick([
            ` ⚠️ WBGT${wbgt.toFixed(0)} 運動は控えめに`,
            ` ⚠️ WBGT${wbgt.toFixed(0)} こまめに休憩を`,
            ` ⚠️ WBGT${wbgt.toFixed(0)} 激しい運動は避けて`,
            ` ⚠️ WBGT${wbgt.toFixed(0)} 涼しい場所で休憩を`
        ]);
    } else if (isModerateWBGT && !isRaining && isAfternoon) {
        comment += pick([
            ' ⚡ 暑さ指数注意レベル。適度に休憩を',
            ' ⚡ 運動時は水分補給を忘れずに',
            ' ⚡ 日陰での休憩を心がけて'
        ]);
    }

    // ============================================================
    // SEASONAL EVENT SUFFIXES (expanded x2)
    // ============================================================
    if (isNewYear && isClear && !isNight) {
        // 1/1-2: 強めの新年メッセージ
        comment += pick([
            ' 🎍 初詣日和ですね',
            ' 🎍 良い年になりますように',
            ' ⛩️ 初詣はいかが？',
            ' 🌅 新年らしい清々しさ',
            ' 🎍 お正月気分を満喫'
        ]);
    } else if (isNewYear && isNight) {
        comment += pick([
            ' 🎍 新年おめでとうございます',
            ' ✨ 素敵なお正月を',
            ' 🌙 穏やかな正月の夜ですね'
        ]);
    } else if (isMatsunouchi && isClear && !isNight) {
        // 1/3-7: 穏やかな松の内メッセージ
        comment += pick([
            ' 🧧 初詣日和ですね',
            ' ⛩️ まだ初詣に行けますよ',
            ' 🎍 松の内のうちに初詣を',
            ' 🌅 お正月気分を楽しんで'
        ]);
    } else if (isMatsunouchi && isNight) {
        comment += pick([
            ' 🌙 穏やかなお正月の夜',
            ' ✨ ゆっくりお過ごしください',
            ' 🎍 松の内をお楽しみください'
        ]);
    } else if (isCherryBlossom && isClear && !isNight && !isRaining) {
        comment += pick([
            ' 🌸 お花見にぴったりの陽気',
            ' 🌸 桜が見頃かも',
            ' 🌷 春爛漫。お花見日和',
            ' 🌸 桜の下でお弁当も良いですね',
            ' 🌸 花見の計画はいかが？',
            ' 🌷 春の陽気を楽しんで'
        ]);
    } else if (isGoldenWeek && isClear && !isRaining) {
        comment += pick([
            ' 🎏 GW日和！',
            ' 🎏 連休を楽しんで！',
            ' 🎌 ゴールデンウィーク満喫日和',
            ' 🚗 ドライブ日和ですね',
            ' 🎏 お出かけを楽しんで',
            ' 🌿 新緑が気持ちいい季節'
        ]);
    } else if (isFireworkSeason && isClear) {
        comment += pick([
            ' 🎆 花火大会日和',
            ' 🎇 夏の夜を楽しんで',
            ' 🎆 花火が綺麗に見えそう',
            ' 🏮 夏祭り日和',
            ' 🎇 浴衣でお出かけも良いですね',
            ' 🎆 夏の風物詩を楽しんで'
        ]);
    } else if (isAutumnLeaves && isClear && !isNight) {
        comment += pick([
            ' 🍁 紅葉狩り日和',
            ' 🍂 秋の行楽日和',
            ' 🍁 紅葉が見頃かも',
            ' 🍂 秋の景色を楽しんで',
            ' 🍁 カメラを持ってお出かけを',
            ' 🍂 秋の味覚も楽しんで'
        ]);
    } else if (isChristmasDay) {
        // 12/25 クリスマス当日
        comment += pick([
            ' 🎄 メリークリスマス！',
            ' 🎅 素敵なクリスマスを！',
            ' 🎁 プレゼントは届きましたか？',
            ' ⭐ 楽しいクリスマスを！'
        ]);
    } else if (isChristmasEve) {
        // 12/24 クリスマスイブ
        comment += pick([
            ' 🎄 クリスマスイブですね',
            ' 🎅 素敵なイブを！',
            ' 🎁 サンタさんが来るかも',
            ' ⭐ 聖なる夜を楽しんで'
        ]);
    } else if (isChristmasEveEve && isClear) {
        // 12/23 前日
        comment += pick([
            ' 🎄 明日はイブですね',
            ' 🎅 クリスマス準備はお済みですか？'
        ]);
    } else if (isYearEnd) {
        comment += pick([
            ' 🎍 良いお年を',
            ' ✨ 素敵な年末を',
            ' 🧹 大掃除は進んでますか？',
            ' 🎍 年末の慌ただしさも楽しんで',
            ' ✨ 今年もお疲れ様でした',
            ' 🎍 良い年越しを'
        ]);
    }

    // ============================================================
    // DAY OF WEEK SUFFIXES (expanded x2)
    // 任意情報なので確率制限（50%）とサフィックス数制限を適用
    // ============================================================
    if (isWeekend && isClear && !isRaining && isMorning && temp >= 15 && temp <= 28 &&
        optionalSuffixCount < MAX_OPTIONAL_SUFFIXES && Math.random() < 0.5) {
        const weekendTips = [
            ' 🏃 お出かけ日和！',
            ' 🧺 洗濯日和ですね',
            ' 🚲 サイクリング日和',
            ' 🌳 公園でピクニックも良い',
            ' ☕ カフェでのんびりも',
            ' 📷 写真日和ですね'
        ];
        comment += pick(weekendTips);
        optionalSuffixCount++;
    } else if (isWeekend && isClear && !isRaining && isAfternoon && temp >= 15 && temp <= 28 &&
        optionalSuffixCount < MAX_OPTIONAL_SUFFIXES && Math.random() < 0.5) {
        const weekendAfternoonTips = [
            ' 🛍️ お買い物日和',
            ' 🍰 カフェタイムにぴったり',
            ' 🎬 映画館もいいですね',
            ' 🚶 散歩日和です'
        ];
        comment += pick(weekendAfternoonTips);
        optionalSuffixCount++;
    } else if (isWeekend && isEvening && !isRaining && temp >= 10) {
        const weekendEveningTips = [
            ' 🍽️ 外食日和かも',
            ' 🌃 夜景を見に行くのもいい',
            ' 🎭 週末の夜を楽しんで'
        ];
        comment += pick(weekendEveningTips);
    } else if (isMonday && isMorning && !isRaining &&
        optionalSuffixCount < MAX_OPTIONAL_SUFFIXES && Math.random() < 0.6) {
        comment += pick([
            ' 💪 今週も頑張りましょう',
            ' ☕ コーヒーで目を覚まして',
            ' 🌟 良い1週間になりますように',
            ' 💼 今週もファイト！',
            ' 🌈 月曜を乗り越えれば楽になる',
            ' 💪 今週の目標は何ですか？'
        ]);
        optionalSuffixCount++;
    } else if (isMonday && isMorning && isRaining) {
        comment += pick([
            ' ☔ 雨の月曜だけど頑張って',
            ' 🌧️ 足元に気をつけて出勤を',
            ' ☂️ 傘を忘れずに。良い1週間を'
        ]);
    } else if (isFriday && isAfternoon) {
        comment += pick([
            ' 🎉 もうすぐ週末！',
            ' ✨ あと少しで週末',
            ' 🌟 金曜日の午後。もう一踏ん張り'
        ]);
    } else if (isFriday && isEvening) {
        comment += pick([
            ' 🍻 週末ですね',
            ' 🎊 TGIF！週末を楽しんで',
            ' 🍺 お疲れ様でした！',
            ' 🎉 週末の始まり！',
            ' 🌃 金曜の夜を満喫しましょう',
            ' 🍷 ゆっくり休んでくださいね'
        ]);
    }

    // ============================================================
    // HYDRATION REMINDER (expanded x2)
    // ============================================================
    if (isDehydrationRisk && !isRaining && !isNight) {
        const hydrationTips = [
            ' 💧 水分補給を',
            ' 🥤 こまめに水分を',
            ' 💦 脱水に注意',
            ' 🧊 冷たい飲み物で水分補給を',
            ' 💧 のどが渇く前に水分を',
            ' 🥤 スポドリもおすすめ'
        ];
        if (!comment.includes('水分') && !comment.includes('💧') && !comment.includes('🥤')) {
            comment += pick(hydrationTips);
        }
    }

    // ============================================================
    // LAUNDRY & OUTDOOR SUFFIXES (NEW)
    // ============================================================
    if (isClear && isDry && !isRaining && isMorning && !isNight && temp >= 15 && temp <= 30 && !isWeekend) {
        if (Math.random() < 0.3) { // 30% chance to show
            comment += pick([
                ' 🧺 洗濯物がよく乾きそう',
                ' 👕 布団干し日和',
                ' 🌞 シーツを洗うのにぴったり'
            ]);
        }
    }

    // ============================================================
    // PET SAFETY SUFFIXES (NEW)
    // ============================================================
    if (temp >= 30 && isClear && isAfternoon && !isRaining) {
        if (Math.random() < 0.25) { // 25% chance
            comment += pick([
                ' 🐕 ペットの散歩はアスファルトが冷めてから',
                ' 🐶 ワンちゃんの肉球火傷注意',
                ' 🐾 お散歩は涼しい時間帯に'
            ]);
        }
    }
    // (警報処理は上部の優先サフィックスセクションに移動済み)

    // Save comment and condition key for next comparison
    lastComment = comment;
    lastConditionKey = conditionKey;

    // Update Weather Hero Section
    const heroTempEl = document.getElementById('heroTemp');
    const tempParts = temp.toFixed(1).split('.');
    const newTempHtml = `${tempParts[0]}<span class="temp-decimal">.${tempParts[1]}</span>`;

    // Only trigger animation if temperature actually changed
    if (heroTempEl.innerHTML !== newTempHtml) {
        heroTempEl.innerHTML = newTempHtml;
        // Trigger pulse animation
        heroTempEl.classList.remove('temp-updated');
        void heroTempEl.offsetWidth; // Force reflow to restart animation
        heroTempEl.classList.add('temp-updated');
    }

    // Apply temperature-based color
    heroTempEl.classList.remove('temp-freezing', 'temp-cold', 'temp-cool', 'temp-mild', 'temp-warm', 'temp-hot', 'temp-extreme');
    if (temp < 0) heroTempEl.classList.add('temp-freezing');
    else if (temp < 10) heroTempEl.classList.add('temp-cold');
    else if (temp < 15) heroTempEl.classList.add('temp-cool');
    else if (temp < 20) heroTempEl.classList.add('temp-mild');
    else if (temp < 25) heroTempEl.classList.add('temp-warm');
    else if (temp < 30) heroTempEl.classList.add('temp-hot');
    else heroTempEl.classList.add('temp-extreme');

    // Update --temp-hue CSS variable for dynamic gradient colors
    // Blue (220) for cold → Green (120) for mild → Orange (30) → Red (0) for hot
    const tempHue = temp <= -10 ? 220 :      // Freezing: deep blue
        temp <= 0 ? 200 :         // Very cold: blue
            temp <= 10 ? 180 :        // Cold: cyan
                temp <= 15 ? 160 :        // Cool: teal
                    temp <= 20 ? 120 :        // Mild: green
                        temp <= 25 ? 60 :         // Warm: yellow-green
                            temp <= 30 ? 30 :         // Hot: orange
                                temp <= 35 ? 15 :         // Very hot: orange-red
                                    0;                        // Extreme: red
    document.documentElement.style.setProperty('--temp-hue', tempHue);

    // Frost intensity: increases as temperature drops below 5°C
    // 5°C = 0% frost, 0°C = 30% frost, -10°C = 100% frost
    let frostIntensity = 0;
    if (temp < 5) {
        frostIntensity = Math.min(1, (5 - temp) / 15); // 0 at 5°C, 1 at -10°C
    }
    document.documentElement.style.setProperty('--frost-intensity', frostIntensity);

    // Update weather icon
    document.getElementById('heroWeatherIcon').textContent = emoji;

    document.getElementById('heroCondition').textContent = getWeatherConditionName(wc);

    // Animate values
    if (window.animateNumber) {
        window.animateNumber('heroFeelsLike', fl.toFixed(1));
        window.animateNumber('heroHumidity', Math.round(humidity));
        window.animateNumber('heroWind', ws.toFixed(1));
        window.animateNumber('heroPrecip', pp || 0);
    } else {
        document.getElementById('heroFeelsLike').textContent = fl.toFixed(1);
        document.getElementById('heroHumidity').textContent = Math.round(humidity);
        document.getElementById('heroWind').textContent = ws.toFixed(1);
        document.getElementById('heroPrecip').textContent = pp || 0;
    }

    // Update comment section (remove temperature display)
    let cleanComment = comment
        .replace(/<span class="temp-highlight">[0-9.-]+°C<\/span>/g, '')
        .replace(/[・—]\s*/g, '')
        .trim();
    // Remove leading dash or bullet that may remain
    cleanComment = cleanComment.replace(/^[—・\-]\s*/, '');
    document.getElementById('weatherComment').innerHTML = cleanComment;
    document.getElementById('greetingSection').classList.add('show');
}

// Get weather condition name from WMO code + cloud cover (Enhanced)
function getWeatherConditionName(code, cloudCover = null) {
    // For clear/cloudy conditions (codes 0-3), use cloud cover for precision
    if (code >= 0 && code <= 3 && cloudCover !== null) {
        if (cloudCover <= 10) return '快晴';
        if (cloudCover <= 25) return 'ほぼ晴れ';
        if (cloudCover <= 50) return '晴れ';
        if (cloudCover <= 70) return '晴れ時々曇り';
        if (cloudCover <= 85) return 'やや曇り';
        return '曇り';
    }

    // Standard WMO code mapping for other conditions
    const conditions = {
        0: '快晴',
        1: 'ほぼ晴れ',
        2: '晴れ時々曇り',
        3: '曇り',
        45: '霧',
        48: '着氷性の霧',
        51: '弱い霧雨',
        53: '霧雨',
        55: '強い霧雨',
        56: '着氷性の霧雨',
        57: '強い着氷性霧雨',
        61: '弱い雨',
        63: '雨',
        65: '強い雨',
        66: '着氷性の雨',
        67: '強い着氷性の雨',
        71: '弱い雪',
        73: '雪',
        75: '大雪',
        77: '霧雪',
        80: 'にわか雨',
        81: 'やや強いにわか雨',
        82: '激しいにわか雨',
        85: 'にわか雪',
        86: '激しいにわか雪',
        95: '雷雨',
        96: '雷雨（雹を伴う）',
        99: '激しい雷雨（雹）'
    };
    return conditions[code] || '--';
}
