// =====================================================
// precipitation.js - 降水判定システム ★重要
// =====================================================
// 修正時: 雪/みぞれ/雨の判定ロジック、Yahoo API連携、降水グラフなど
//
// 主要な関数:
// - getPrecipitationType() - スコアベースの雪/みぞれ/雨判定
// - updateActualPrecipState() - Yahoo API降水状態更新
// - getWeatherOverride() - 天気表示上書き
// - loadPrecipitation() - 降水グラフ描画
//
// 依存: config.js (weatherData, recentData)

/**
 * Determine precipitation type based on multiple factors (Enhanced)
 * Uses: weather code, 850hPa temp, 925hPa temp, wet bulb temp, freezing level, ground temp
 * Also references local sensor temperature for more accuracy
 * @param {number} hourIndex - optional hour index for forecast data
 * @returns {string} 'snow' | 'sleet' | 'rain'
 */
function getPrecipitationType(hourIndex = null) {
    const wc = weatherData?.weatherCode ?? 0;
    const openMeteoTemp = weatherData?.groundTemp ?? null;

    // Get local sensor temperature from recentData
    // recentData is sorted oldest-first (a.date - b.date), so last element is newest
    const localSensorTemp = recentData?.length > 0 ? recentData[recentData.length - 1]?.temperature : null;

    // Use the lower of Open-Meteo temp and local sensor (more conservative for snow detection)
    let groundTemp = openMeteoTemp;
    if (localSensorTemp !== null && openMeteoTemp !== null) {
        groundTemp = Math.min(openMeteoTemp, localSensorTemp);
    } else if (localSensorTemp !== null) {
        groundTemp = localSensorTemp;
    }

    // Get temperatures - use hourly data if hourIndex provided
    let temp850, temp925, wetBulb, freezingLevel;
    if (hourIndex !== null && weatherData?.hourlyTemp850hPa) {
        temp850 = weatherData.hourlyTemp850hPa[hourIndex] ?? null;
        temp925 = weatherData.hourlyTemp925hPa?.[hourIndex] ?? null;
        wetBulb = weatherData.hourlyWetBulb?.[hourIndex] ?? null;
        freezingLevel = weatherData.hourlyFreezingLevel?.[hourIndex] ?? null;
    } else {
        temp850 = weatherData?.temp850hPa ?? null;
        temp925 = weatherData?.temp925hPa ?? null;
        wetBulb = weatherData?.wetBulbTemp ?? null;
        freezingLevel = weatherData?.freezingLevelHeight ?? null;
    }

    // Priority 1: Weather code indicates snow (71-77, 85-86)
    if ((wc >= 71 && wc <= 77) || (wc >= 85 && wc <= 86)) {
        return 'snow';
    }

    // Priority 2: Current snowfall detected
    if (weatherData?.currentSnowfall > 0) {
        return 'snow';
    }

    // ============================================================
    // Composite scoring system for snow/sleet detection
    // ============================================================
    let snowScore = 0;  // Higher = more likely snow

    // Factor 1: Wet bulb temperature (most reliable)
    if (wetBulb !== null) {
        if (wetBulb <= 0) snowScore += 3;
        else if (wetBulb <= 1) snowScore += 2;
        else if (wetBulb <= 2) snowScore += 1;
    }

    // Factor 2: Freezing level height
    if (freezingLevel !== null) {
        if (freezingLevel <= 200) snowScore += 3;
        else if (freezingLevel <= 500) snowScore += 2;
        else if (freezingLevel <= 800) snowScore += 1;
    }

    // Factor 3: 850hPa temperature
    if (temp850 !== null) {
        if (temp850 <= -6) snowScore += 3;
        else if (temp850 <= -4) snowScore += 2;
        else if (temp850 <= -2) snowScore += 1;
    }

    // Factor 4: 925hPa temperature
    if (temp925 !== null) {
        if (temp925 <= -3) snowScore += 2;
        else if (temp925 <= -1) snowScore += 1;
        else if (temp925 <= 1) snowScore += 0.5;
    }

    // Factor 5: Ground temperature (key factor)
    if (groundTemp !== null) {
        if (groundTemp <= 0) snowScore += 3;
        else if (groundTemp <= 1.5) snowScore += 2;
        else if (groundTemp <= 3) snowScore += 1;
        else if (groundTemp <= 4) snowScore += 0.5;
    }

    // ============================================================
    // Decision based on composite score + ground temperature
    // ============================================================

    // Snow: ground temp ≤ 1.5°C OR (high score AND ground temp ≤ 3°C)
    if (groundTemp !== null && groundTemp <= 1.5) {
        if (snowScore >= 2) return 'snow';  // Cold ground + some upper support
    }
    if (snowScore >= 6 && groundTemp !== null && groundTemp <= 3) {
        return 'snow';  // Strong upper air conditions
    }

    // Sleet: some snow indicators but ground is warmer
    if (snowScore >= 3) {
        return 'sleet';  // Mixed conditions
    }
    if (freezingLevel !== null && freezingLevel <= 800 && groundTemp !== null && groundTemp <= 4) {
        return 'sleet';  // Low freezing level
    }
    if (temp850 !== null && temp850 <= -3 && groundTemp !== null && groundTemp <= 4) {
        return 'sleet';  // Cold upper air
    }

    return 'rain';
}

// ============================================================
// Actual precipitation state (from Yahoo API observation)
// ============================================================
let actualPrecipState = {
    isRaining: false,
    rainfall: 0,
    precipType: 'rain',
    consecutiveMinutes: 0,  // How many consecutive minutes of rain observed
    // Yahoo API予報データ（1時間以内）
    hasForecastPrecip: false,  // 1時間以内に降水予報があるか
    forecastPrecipType: 'rain' // 予報される降水タイプ
};

// Cache for weather override - persists between refreshes
let lastWeatherOverride = {
    icon: null,
    condition: null,
    precipType: null,
    timestamp: 0,
    noRainMinutes: 0  // How long since last rain
};

/**
 * Update actual precipitation state from Yahoo API data
 * Called from loadPrecipitation()
 */
function updateActualPrecipState(precipData) {
    if (!precipData || precipData.length === 0) {
        actualPrecipState.isRaining = false;
        actualPrecipState.rainfall = 0;
        actualPrecipState.consecutiveMinutes = 0;
        actualPrecipState.hasForecastPrecip = false;
        actualPrecipState.forecastPrecipType = 'rain';
        return;
    }

    // Get observation data only (not forecast)
    const observations = precipData.filter(d => d.type === 'observation');
    if (observations.length === 0) {
        actualPrecipState.isRaining = false;
        actualPrecipState.rainfall = 0;
        actualPrecipState.consecutiveMinutes = 0;
    } else {
        // Get latest observation
        const latest = observations[observations.length - 1];
        actualPrecipState.rainfall = latest.rainfall;
        actualPrecipState.isRaining = latest.rainfall > 0;

        // Count consecutive minutes of rain (each data point = 5 minutes)
        let consecutiveCount = 0;
        for (let i = observations.length - 1; i >= 0; i--) {
            if (observations[i].rainfall > 0) {
                consecutiveCount++;
            } else {
                break;
            }
        }
        actualPrecipState.consecutiveMinutes = consecutiveCount * 5;  // Each point is 5 min
    }

    // Update precipitation type based on current conditions
    actualPrecipState.precipType = getPrecipitationType();

    // ============================================================
    // Check forecast data for next 1 hour (Yahoo API)
    // ============================================================
    const forecasts = precipData.filter(d => d.type === 'forecast');
    // Yahoo APIの予報は10分刻み、1時間 = 6データポイント
    const next1HourForecasts = forecasts.slice(0, 6);
    const hasForecast = next1HourForecasts.some(d => d.rainfall > 0);
    actualPrecipState.hasForecastPrecip = hasForecast;

    // 予報がある場合、最初の降水予報時点のタイプを判定
    if (hasForecast) {
        const currentHour = new Date().getHours();
        const firstPrecipForecast = next1HourForecasts.find(d => d.rainfall > 0);
        if (firstPrecipForecast) {
            const [hh] = firstPrecipForecast.time.split(':').map(Number);
            const hourIndex = hh >= currentHour ? hh : hh + 24;
            actualPrecipState.forecastPrecipType = getPrecipitationType(hourIndex);
        }
    } else {
        actualPrecipState.forecastPrecipType = 'rain';
    }
}

/**
 * Get weather display override based on actual precipitation
 * Priority system:
 * 1. Yahoo observation shows precipitation → our snow/rain/sleet detection
 * 2. Yahoo 0mm but Open-Meteo rain code → show cloudy
 * 3. No precipitation → Open-Meteo weather
 * Returns null if no override needed, otherwise {icon, condition}
 */
function getWeatherOverride() {
    const now = Date.now();
    const wc = weatherData?.weatherCode ?? 0;
    const isOpenMeteoRainCode = (wc >= 51 && wc <= 67) || (wc >= 80 && wc <= 82) || wc >= 95;

    // Priority 1: Yahoo observation shows precipitation → 即座に上書き（10分制限撤廃）
    if (actualPrecipState.rainfall > 0) {
        const pType = actualPrecipState.precipType;
        const rainfall = actualPrecipState.rainfall;
        const intensity = getPrecipIntensityLabel(rainfall, pType);

        let icon, condition;
        if (pType === 'snow') {
            icon = '❄️';
            condition = intensity;
        } else if (pType === 'sleet') {
            icon = '🌨️';
            condition = intensity;
        } else {
            icon = '🌧️';
            condition = intensity;
        }

        // Update cache
        lastWeatherOverride = {
            icon,
            condition,
            precipType: pType,
            timestamp: now,
            noRainMinutes: 0
        };

        return { icon, condition };
    }

    // If currently no rain from Yahoo
    // Check cache first
    if (lastWeatherOverride.timestamp > 0) {
        lastWeatherOverride.noRainMinutes = (now - lastWeatherOverride.timestamp) / 60000;

        // Keep showing cached weather for 5 minutes after rain stops
        if (lastWeatherOverride.noRainMinutes < 5 && lastWeatherOverride.icon) {
            return {
                icon: lastWeatherOverride.icon,
                condition: lastWeatherOverride.condition
            };
        } else {
            // Clear cache after 5 minutes of no rain
            lastWeatherOverride = { icon: null, condition: null, precipType: null, timestamp: 0, noRainMinutes: 0 };
        }
    }

    // Priority 2: Open-Meteo says rain but Yahoo shows 0mm → show cloudy
    if (isOpenMeteoRainCode) {
        return { icon: '☁️', condition: '曇り' };
    }

    // Priority 3: No precipitation → use Open-Meteo (return null)
    return null;
}

/**
 * Update weather display based on actual precipitation override
 */
function updateWeatherDisplay() {
    const override = getWeatherOverride();
    if (override) {
        const iconEl = document.getElementById('heroWeatherIcon');
        const conditionEl = document.getElementById('heroCondition');

        if (iconEl) iconEl.textContent = override.icon;
        if (conditionEl) conditionEl.textContent = override.condition;
    }
}

/**
 * Get current weather override info for external use (e.g., comments.js)
 * @returns {Object|null} Override info with icon, condition, precipType, isActive
 */
function getCurrentWeatherOverride() {
    // 現在降水がある場合は即座に上書き情報を返す
    if (actualPrecipState.rainfall > 0) {
        const pType = actualPrecipState.precipType;
        const rainfall = actualPrecipState.rainfall;
        const intensity = getPrecipIntensityLabel(rainfall, pType);
        let icon;
        if (pType === 'snow') {
            icon = '❄️';
        } else if (pType === 'sleet') {
            icon = '🌨️';
        } else {
            icon = '🌧️';
        }
        return {
            icon: icon,
            condition: intensity,
            precipType: pType,
            isActive: true
        };
    }
    return null;
}

/**
 * Get precipitation intensity label based on mm/h and type
 * @param {number} rainfall - precipitation in mm/h
 * @param {string} type - 'rain' | 'snow' | 'sleet'
 * @returns {string} intensity label like "やや強い雨" or "強い雪"
 */
function getPrecipIntensityLabel(rainfall, type) {
    if (type === 'snow') {
        // Snow uses relaxed thresholds (snow volume is ~10x water equivalent)
        if (rainfall < 0.3) return '弱い雪';
        if (rainfall < 1) return '雪';
        if (rainfall < 3) return 'やや強い雪';
        if (rainfall < 6) return '強い雪';
        return '猛烈な雪';
    } else if (type === 'sleet') {
        // Sleet (みぞれ)
        if (rainfall < 1) return 'みぞれ';
        if (rainfall < 3) return 'やや強いみぞれ';
        return '強いみぞれ';
    } else {
        // Rain uses JMA official thresholds
        if (rainfall < 1) return '弱い雨';
        if (rainfall < 3) return '雨';
        if (rainfall < 10) return 'やや強い雨';
        if (rainfall < 20) return '強い雨';
        if (rainfall < 30) return '激しい雨';
        return '非常に激しい雨';
    }
}

/**
 * Get emoji for precipitation type
 */
function getPrecipEmoji(type) {
    if (type === 'snow') return '❄️';
    if (type === 'sleet') return '🌨️';
    return '🌧️';
}

// Load precipitation data from Yahoo Weather API via Cloudflare Worker
let precipChart = null;
async function loadPrecipitation() {
    try {
        // Cloudflare Worker経由でYahoo Weather APIを取得
        const resp = await fetch('https://yahoo-weather-proxy.miurayukimail.workers.dev');
        if (!resp.ok) return;

        const data = await resp.json();
        if (!data.data || data.data.length === 0) return;

        const precipData = data.data;

        // Update actual precipitation state for weather display override
        updateActualPrecipState(precipData);
        updateWeatherDisplay();  // Refresh weather display with override

        const labels = precipData.map(d => d.time);
        const values = precipData.map(d => d.rainfall);

        // 降水量に応じた色を設定（雪/雨で色分け）
        const getPrecipColor = (rainfall, precipType, alpha = 0.8) => {
            if (rainfall === 0) return `rgba(148, 163, 184, ${alpha})`; // グレー（降水なし）

            if (precipType === 'snow') {
                // 雪: 白+紫のグラデーション（強くなるほど濃い紫）
                if (rainfall < 0.3) return `rgba(220, 200, 255, ${alpha})`;     // 薄紫（弱い雪）
                if (rainfall < 1) return `rgba(190, 160, 250, ${alpha})`;       // 紫（雪）
                if (rainfall < 3) return `rgba(160, 120, 245, ${alpha})`;       // やや濃い紫（やや強い雪）
                if (rainfall < 6) return `rgba(140, 90, 240, ${alpha})`;        // 濃い紫（強い雪）
                return `rgba(120, 60, 235, ${alpha})`;                          // 非常に濃い紫（猛烈な雪）
            } else if (precipType === 'sleet') {
                // みぞれ: 白の濃淡（強くなるほど明るくなる）
                if (rainfall < 0.5) return `rgba(200, 200, 210, ${alpha})`;     // 薄いグレー白（弱いみぞれ）
                if (rainfall < 1) return `rgba(210, 210, 220, ${alpha})`;       // グレー白（みぞれ）
                if (rainfall < 3) return `rgba(225, 225, 235, ${alpha})`;       // 明るいグレー白（やや強いみぞれ）
                if (rainfall < 6) return `rgba(240, 240, 248, ${alpha})`;       // ほぼ白（強いみぞれ）
                return `rgba(250, 250, 255, ${alpha})`;                         // 白（猛烈なみぞれ）
            } else {
                // 雨: 青系のグラデーション（従来通り）
                if (rainfall < 1) return `rgba(96, 165, 250, ${alpha})`;        // 水色（弱い雨）
                if (rainfall < 5) return `rgba(59, 130, 246, ${alpha})`;        // 青（やや強い雨）
                if (rainfall < 10) return `rgba(234, 179, 8, ${alpha})`;        // 黄色（強い雨）
                if (rainfall < 20) return `rgba(249, 115, 22, ${alpha})`;       // オレンジ（激しい雨）
                return `rgba(239, 68, 68, ${alpha})`;                           // 赤（非常に激しい雨）
            }
        };

        // 各時間の降水タイプを判定
        const currentHour = new Date().getHours();
        const precipTypes = precipData.map((d, i) => {
            // 時刻から何時間後かを計算してhourIndexを求める
            const [hh, mm] = d.time.split(':').map(Number);
            const hourIndex = hh >= currentHour ? hh : hh + 24;
            return getPrecipitationType(hourIndex);
        });

        const colors = precipData.map((d, i) =>
            getPrecipColor(d.rainfall, precipTypes[i], d.type === 'observation' ? 0.9 : 0.7)
        );
        const borderColors = precipData.map((d, i) =>
            getPrecipColor(d.rainfall, precipTypes[i], 1)
        );

        // すべて0mm/hの場合はカードを非表示
        const hasAnyRain = precipData.some(d => d.rainfall > 0);
        if (!hasAnyRain) {
            document.getElementById('precipitationCard').style.display = 'none';
            return;
        }

        // Show card
        document.getElementById('precipitationCard').style.display = 'block';

        // Update time
        if (data.updated_at) {
            const updTime = new Date(data.updated_at);
            document.getElementById('precipTime').textContent =
                updTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) + ' 更新';
        }

        // Create/update chart
        const ctx = document.getElementById('precipChart').getContext('2d');

        if (precipChart) precipChart.destroy();

        precipChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '降水量 (mm/h)',
                    data: values,
                    backgroundColor: colors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#f8fafc',
                        bodyColor: '#f8fafc',
                        padding: 10,
                        borderColor: 'rgba(99, 102, 241, 0.3)',
                        borderWidth: 1,
                        callbacks: {
                            label: (tooltipCtx) => {
                                const idx = tooltipCtx.dataIndex;
                                const rainfall = tooltipCtx.raw;
                                const pType = precipTypes[idx];
                                const emoji = getPrecipEmoji(pType);
                                const intensity = getPrecipIntensityLabel(rainfall, pType);
                                return `${emoji} ${intensity} (${rainfall.toFixed(1)} mm/h)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: 'rgba(148, 163, 184, 0.8)',
                            font: { size: 10 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(148, 163, 184, 0.1)' },
                        ticks: {
                            color: 'rgba(148, 163, 184, 0.8)',
                            font: { size: 10 },
                            callback: (v) => v + ' mm'
                        }
                    }
                }
            }
        });

        console.log('Precipitation chart loaded:', precipData.length, 'data points');

        // 雨予報アラート
        const rainAlert = document.getElementById('rainAlert');
        const rainAlertText = document.getElementById('rainAlertText');

        // 予報データのみ抽出（type === 'forecast'）
        const forecastData = precipData.filter(d => d.type === 'forecast');

        // 直近の実測データ（最新）
        const latestObservation = [...precipData].reverse().find(d => d.type === 'observation');
        const isCurrentlyRaining = latestObservation && latestObservation.rainfall > 0;

        // 予報で雨がある最初のデータポイント
        const firstRainForecast = forecastData.find(d => d.rainfall > 0);

        // 予報で雨がある場合
        const hasRainInForecast = forecastData.some(d => d.rainfall > 0);

        if (isCurrentlyRaining) {
            // 現在降っている場合 - 雨/雪判定と強度ラベル
            const rainfall = latestObservation.rainfall;
            const precipType = getPrecipitationType();
            const intensityLabel = getPrecipIntensityLabel(rainfall, precipType);
            const emoji = getPrecipEmoji(precipType);

            let bgColor, borderColor;
            if (precipType === 'snow') {
                if (rainfall < 1) {
                    bgColor = 'rgba(147, 197, 253, 0.15)';
                    borderColor = 'rgba(147, 197, 253, 0.4)';
                } else if (rainfall < 3) {
                    bgColor = 'rgba(165, 210, 255, 0.18)';
                    borderColor = 'rgba(165, 210, 255, 0.5)';
                } else {
                    bgColor = 'rgba(200, 225, 255, 0.2)';
                    borderColor = 'rgba(200, 225, 255, 0.6)';
                }
            } else if (precipType === 'sleet') {
                bgColor = 'rgba(139, 92, 246, 0.15)';
                borderColor = 'rgba(139, 92, 246, 0.4)';
            } else {
                if (rainfall < 1) {
                    bgColor = 'rgba(96, 165, 250, 0.15)';
                    borderColor = 'rgba(96, 165, 250, 0.4)';
                } else if (rainfall < 5) {
                    bgColor = 'rgba(59, 130, 246, 0.15)';
                    borderColor = 'rgba(59, 130, 246, 0.4)';
                } else if (rainfall < 10) {
                    bgColor = 'rgba(234, 179, 8, 0.15)';
                    borderColor = 'rgba(234, 179, 8, 0.4)';
                } else if (rainfall < 20) {
                    bgColor = 'rgba(249, 115, 22, 0.15)';
                    borderColor = 'rgba(249, 115, 22, 0.4)';
                } else {
                    bgColor = 'rgba(239, 68, 68, 0.15)';
                    borderColor = 'rgba(239, 68, 68, 0.4)';
                }
            }

            rainAlert.style.display = 'flex';
            rainAlert.style.background = `linear-gradient(135deg, ${bgColor}, ${bgColor})`;
            rainAlert.style.borderColor = borderColor;
            rainAlert.className = 'rain-alert';
            document.getElementById('rainAlertIcon').textContent = emoji;

            // Check if precipitation type will change to snow later
            let transitionMessage = '';
            if (precipType === 'rain') {
                const currentHour = new Date().getHours();
                for (let i = 1; i <= 6; i++) {
                    const futureHourIndex = currentHour + i;
                    const futureType = getPrecipitationType(futureHourIndex);
                    if (futureType === 'snow' || futureType === 'sleet') {
                        const futureRainfall = weatherData?.hourlySnowfall?.[futureHourIndex] || rainfall;
                        const futureIntensity = getPrecipIntensityLabel(futureRainfall, futureType);
                        const futureEmoji = getPrecipEmoji(futureType);
                        transitionMessage = ` → 約${i * 60}分後に${futureEmoji}${futureIntensity}に変わる見込み`;
                        break;
                    }
                }
            } else if (precipType === 'sleet') {
                const currentHour = new Date().getHours();
                for (let i = 1; i <= 6; i++) {
                    const futureHourIndex = currentHour + i;
                    const futureType = getPrecipitationType(futureHourIndex);
                    if (futureType === 'snow') {
                        const futureRainfall = weatherData?.hourlySnowfall?.[futureHourIndex] || rainfall;
                        const futureIntensity = getPrecipIntensityLabel(futureRainfall, 'snow');
                        transitionMessage = ` → 約${i * 60}分後に❄️${futureIntensity}に変わる見込み`;
                        break;
                    }
                }
            }

            rainAlertText.textContent = `現在 ${rainfall.toFixed(1)}mm/h の${intensityLabel}が降っています${transitionMessage}`;
        } else if (hasRainInForecast && firstRainForecast) {
            // これから降る場合
            const now = new Date();
            const forecastTime = firstRainForecast.datetime;
            let rainTime;
            if (forecastTime.length === 12) {
                rainTime = new Date(
                    parseInt(forecastTime.substring(0, 4)),
                    parseInt(forecastTime.substring(4, 6)) - 1,
                    parseInt(forecastTime.substring(6, 8)),
                    parseInt(forecastTime.substring(8, 10)),
                    parseInt(forecastTime.substring(10, 12))
                );
            } else {
                rainTime = new Date(forecastTime);
            }
            const minutesUntilRain = Math.round((rainTime - now) / 1000 / 60);

            if (minutesUntilRain > 0) {
                const forecastRainfall = firstRainForecast.rainfall;
                const precipType = getPrecipitationType();
                const intensityLabel = getPrecipIntensityLabel(forecastRainfall, precipType);
                const emoji = getPrecipEmoji(precipType);

                rainAlert.style.display = 'flex';
                rainAlert.className = 'rain-alert';
                document.getElementById('rainAlertIcon').textContent = emoji;
                rainAlertText.textContent = `約${minutesUntilRain}分後に${intensityLabel}が降り始める予報です`;
            } else {
                rainAlert.style.display = 'none';
            }
        } else {
            rainAlert.style.display = 'none';
        }
    } catch (e) {
        console.log('Precipitation data not available:', e.message);
    }
}
