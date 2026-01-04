// =====================================================
// weather-api.js - 気象API呼び出し
// =====================================================
// 修正時: Open-Meteo API、スプレッドシート読込、AIコメント取得など
//
// 依存: config.js, utils.js, ui.js, charts.js, precipitation.js

async function fetchAll() {
    // Progressive Loading: Phase 1 = 24h priority, Phase 2 = background week data

    // Phase 1: Fast initial display with essential data
    await Promise.all([
        fetch(SUMMARY_URL).then(r => r.text()).then(csv => { summaryData = parseSummaryCSV(csv); updateUI(); }),
        fetch(RECENT_URL).then(r => r.text()).then(csv => { recentData = parseRecentCSV(csv); }),
        fetch(WEATHER_URL).then(r => r.json()).then(data => {
            const hour = new Date().getHours();
            const hourlyWeather = data.hourly?.weather_code || [];
            const hourlyPrecip = data.hourly?.precipitation_probability || [];
            const hourlyTemp = data.hourly?.temperature_2m || [];

            // Check if weather will worsen in next 3 hours
            const futureWeatherCodes = hourlyWeather.slice(hour, hour + 4);
            const currentCode = data.current?.weather_code || 0;
            const maxFuturePrecipProb = Math.max(...hourlyPrecip.slice(hour, hour + 4));
            const willWorsen = futureWeatherCodes.some(c => c >= 51) && currentCode < 51;
            const willImprove = currentCode >= 51 && futureWeatherCodes.every(c => c < 51);

            weatherData = {
                weatherCode: currentCode,
                precipitation: data.current?.precipitation,
                windSpeed: data.current?.wind_speed_10m,
                feelsLike: data.current?.apparent_temperature,
                uvIndex: data.current?.uv_index ?? data.hourly?.uv_index?.[hour] ?? 0,
                precipProb: hourlyPrecip[hour] || 0,
                maxUvToday: data.hourly?.uv_index ? Math.max(...data.hourly.uv_index.slice(0, 24)) : 0,
                futureWeatherCodes: futureWeatherCodes,
                maxFuturePrecipProb: maxFuturePrecipProb,
                willWorsen: willWorsen,
                willImprove: willImprove,
                tempIn3Hours: hourlyTemp[hour + 3] || null,
                sunrise: data.daily?.sunrise?.[0] || null,
                sunset: data.daily?.sunset?.[0] || null,
                // Rain/Snow detection data (enhanced)
                groundTemp: data.current?.temperature_2m ?? hourlyTemp[hour] ?? null,
                temp850hPa: data.hourly?.temperature_850hPa?.[hour] ?? null,
                temp925hPa: data.hourly?.temperature_925hPa?.[hour] ?? null,
                wetBulbTemp: data.hourly?.wet_bulb_temperature_2m?.[hour] ?? null,
                dewPoint: data.current?.dew_point_2m ?? data.hourly?.dew_point_2m?.[hour] ?? null,
                freezingLevelHeight: data.hourly?.freezing_level_height?.[hour] ?? null,
                currentSnowfall: data.current?.snowfall ?? 0,
                currentRain: data.current?.rain ?? 0,
                // Hourly data for precipitation chart coloring
                hourlyTemp850hPa: data.hourly?.temperature_850hPa || [],
                hourlyTemp925hPa: data.hourly?.temperature_925hPa || [],
                hourlyWetBulb: data.hourly?.wet_bulb_temperature_2m || [],
                hourlySnowfall: data.hourly?.snowfall || [],
                hourlyRain: data.hourly?.rain || [],
                hourlyFreezingLevel: data.hourly?.freezing_level_height || [],
                // Cloud cover for weather description
                cloudCover: data.current?.cloud_cover ?? data.hourly?.cloud_cover?.[hour] ?? null,
                // Additional data for one-line comments
                visibility: data.current?.visibility ?? null,  // メートル
                windDirection: data.current?.wind_direction_10m ?? null,  // 度
                windGusts: data.current?.wind_gusts_10m ?? null,  // m/s
                pressureMsl: data.current?.pressure_msl ?? null,  // hPa
                cape: data.hourly?.cape?.[hour] ?? null  // J/kg - 雷雨ポテンシャル
            };
            applyTheme();
            // updateWeatherEffects(); // 一旦無効化
            updateUI();
        }).catch(e => { console.log('Weather API error:', e); weatherData = null; })
    ]);

    // Immediately show 24h chart
    updateCharts();
    loadAIComment();
    loadPrecipitation();
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    document.querySelectorAll('.chart-skeleton').forEach(el => el.classList.add('hidden'));
    updateDataAnalysis();
    fetchAlerts();
    loadAIComment();

    // Phase 2: Background loading of additional data
    setTimeout(async () => {
        try {
            // Load daily and weekly data in background
            const [dailyCsv, weeklyCsv] = await Promise.all([
                fetch(DAILY_URL).then(r => r.text()),
                fetch(WEEKLY_URL).then(r => r.text()).catch(() => null)
            ]);

            dailyData = parseDailyCSV(dailyCsv);
            if (weeklyCsv) {
                const newWeeklyData = parseRecentCSV(weeklyCsv);
                // Merge weekly data with recent data (avoid duplicates by timestamp)
                const existingTimestamps = new Set(recentData.map(d => d.date.getTime()));
                const uniqueWeekly = newWeeklyData.filter(d => !existingTimestamps.has(d.date.getTime()));
                weeklyData = [...uniqueWeekly, ...recentData].sort((a, b) => a.date - b.date);
            } else {
                weeklyData = recentData;
            }

            // Update charts with full data
            updateCharts();
            // Update footer statistics with weekly data
            updateDataAnalysis();
            console.log('Phase 2: Weekly data loaded', weeklyData.length, 'records');
        } catch (e) {
            console.log('Phase 2 background load error:', e);
            weeklyData = recentData;
        }
    }, 500); // Start Phase 2 after 500ms
}

// Load AI advisor comment from ai_comment.json
async function loadAIComment() {
    try {
        const resp = await fetch('./ai_comment.json?' + Date.now());
        if (!resp.ok) {
            // File doesn't exist yet, keep section hidden
            return;
        }
        const data = await resp.json();

        if (data.advice) {
            // Convert simple markdown to HTML
            const html = simpleMarkdownToHtml(data.advice);
            const textEl = document.getElementById('aiAdvisorText');
            const expandBtn = document.getElementById('aiAdvisorExpand');

            // Store full text for later
            textEl.dataset.fullText = html;

            // Check if user has already expanded - preserve that state
            const wasExpanded = textEl.dataset.truncated === 'false' && textEl.dataset.fullText;

            // Truncate if longer than 150 chars
            const plainText = data.advice;
            const TRUNCATE_LENGTH = 150;

            if (plainText.length > TRUNCATE_LENGTH) {
                if (wasExpanded) {
                    // User had expanded - keep it expanded with new content
                    textEl.innerHTML = html;
                    textEl.dataset.truncated = 'false';
                    expandBtn.textContent = '閉じる';
                    expandBtn.style.display = 'inline-block';
                } else {
                    // Find good break point (word boundary)
                    let breakPoint = TRUNCATE_LENGTH;
                    while (breakPoint > 100 && plainText[breakPoint] !== ' ') {
                        breakPoint--;
                    }
                    const truncatedPlain = plainText.substring(0, breakPoint);
                    const truncatedHtml = simpleMarkdownToHtml(truncatedPlain) + '...';
                    textEl.innerHTML = truncatedHtml;
                    textEl.dataset.truncated = 'true';
                    expandBtn.style.display = 'inline-block';
                }
            } else {
                textEl.innerHTML = html;
                textEl.dataset.truncated = 'false';
                expandBtn.style.display = 'none';
            }

            // Format time
            if (data.generated_at) {
                const genTime = new Date(data.generated_at);
                const timeStr = genTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                document.getElementById('aiAdvisorTime').textContent = `${timeStr} 生成`;
            }

            // Show section
            document.getElementById('aiAdvisorSection').classList.add('show');
        }
    } catch (e) {
        // ai_comment.json not found or parse error, keep hidden
        console.log('AI comment not available:', e.message);
    }
}

// Toggle AI advisor expand/collapse
function toggleAiAdvisor() {
    const textEl = document.getElementById('aiAdvisorText');
    const expandBtn = document.getElementById('aiAdvisorExpand');

    if (textEl.dataset.truncated === 'true') {
        textEl.innerHTML = textEl.dataset.fullText;
        textEl.dataset.truncated = 'false';
        expandBtn.textContent = '閉じる';
    } else {
        // Re-truncate
        const plainText = textEl.textContent;
        const TRUNCATE_LENGTH = 150;
        let breakPoint = TRUNCATE_LENGTH;
        while (breakPoint > 100 && plainText[breakPoint] !== ' ') {
            breakPoint--;
        }
        const truncatedPlain = plainText.substring(0, breakPoint);
        const truncatedHtml = simpleMarkdownToHtml(truncatedPlain) + '...';
        textEl.innerHTML = truncatedHtml;
        textEl.dataset.truncated = 'true';
        expandBtn.textContent = '続きを表示';
    }
}

// Load sunrise/sunset times and pressure from Open-Meteo
async function loadSunTimes() {
    try {
        const LAT = 35.77877;
        const LON = 139.87817;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=sunrise,sunset&current=surface_pressure&timezone=Asia/Tokyo&forecast_days=1`;
        const resp = await fetch(url);
        if (!resp.ok) return;

        const data = await resp.json();
        if (data.daily && data.daily.sunrise && data.daily.sunset) {
            const sunrise = new Date(data.daily.sunrise[0]);
            const sunset = new Date(data.daily.sunset[0]);

            const formatTime = (d) => d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

            document.getElementById('sunriseTime').textContent = formatTime(sunrise);
            document.getElementById('sunsetTime').textContent = formatTime(sunset);
        }

        // Display pressure
        if (data.current && data.current.surface_pressure) {
            document.getElementById('heroPressure').textContent = Math.round(data.current.surface_pressure);
        }
    } catch (e) {
        console.log('Sun times not available:', e.message);
    }
}
