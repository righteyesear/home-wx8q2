// =====================================================
// ui.js - UI更新処理
// =====================================================
// 修正時: 温度表示、気象情報表示、バナー、体感温度計算など
//
// 主要な関数:
// - updateUI() - メインUI更新
// - updateTempTheme() - 温度ベーステーマ
// - updateAlertBanner() - 警報バナー更新
// - calculateFeelsLike() - 体感温度計算
// - getUvLevel() - UV指数レベル
//
// 依存: config.js (summaryData, weatherData, recentData, weeklyData)

// Calculate and display data analysis in footer
function updateDataAnalysis() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 24h high/low from recentData
    if (recentData.length > 0) {
        const last24hData = recentData.filter(d => d.date >= last24h);
        if (last24hData.length > 0) {
            const temps = last24hData.map(d => d.temperature);
            document.getElementById('last24hHigh').textContent = Math.max(...temps).toFixed(1);
            document.getElementById('last24hLow').textContent = Math.min(...temps).toFixed(1);
        }
    }

    // Weekly average from weeklyData
    if (weeklyData.length > 0) {
        const thisWeekStart = new Date(now);
        thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
        thisWeekStart.setHours(0, 0, 0, 0);

        const lastWeekStart = new Date(thisWeekStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);

        const thisWeekData = weeklyData.filter(d => d.date >= thisWeekStart);
        const lastWeekData = weeklyData.filter(d => d.date >= lastWeekStart && d.date < thisWeekStart);

        if (thisWeekData.length > 0) {
            const thisWeekAvg = thisWeekData.reduce((sum, d) => sum + d.temperature, 0) / thisWeekData.length;
            document.getElementById('weekAvg').textContent = thisWeekAvg.toFixed(1);

            if (lastWeekData.length > 0) {
                const lastWeekAvg = lastWeekData.reduce((sum, d) => sum + d.temperature, 0) / lastWeekData.length;
                const diff = thisWeekAvg - lastWeekAvg;
                const diffEl = document.getElementById('weekDiffValue');
                const sign = diff >= 0 ? '+' : '';
                diffEl.textContent = `${sign}${diff.toFixed(1)}°C`;
                diffEl.parentElement.style.color = diff >= 0 ? '#fb923c' : '#60a5fa';
            }
        }
    }
}

// JMA Warning Code to Name Mapping (気象庁防災情報XML公式コード - 完全版)
const JMA_WARNING_NAMES = {
    // 特別警報・レベル5相当 (32-39, 40)
    '32': '暴風雪特別警報', 
    '33': 'レベル5 大雨特別警報', 
    '35': '暴風特別警報',
    '36': '大雪特別警報', 
    '37': '波浪特別警報', 
    '38': 'レベル5 高潮特別警報',
    '39': 'レベル5 氾濫特別警報', // 新設（河川氾濫特別警報）
    '40': 'レベル5 土砂災害特別警報', // 新設

    // 警報・レベル3/4相当 (02-08, 41-44)
    '02': '暴風雪警報', 
    '03': 'レベル3 大雨警報', 
    '05': '暴風警報', 
    '06': '大雪警報', 
    '07': '波浪警報', 
    '08': 'レベル4 高潮危険警報', // 旧高潮警報
    '09': 'レベル3 土砂災害警報', // 新設
    '41': 'レベル4 大雨危険警報', // 新設（大雨危険警報）
    '42': 'レベル4 土砂災害危険警報', // 新設（土砂災害危険警報）
    '43': 'レベル4 河川氾濫危険警報', // 新設（河川氾濫危険警報）
    '44': 'レベル3 河川氾濫警報', // 新設（河川氾濫警報）

    // 注意報・レベル2相当 (10-26, 45)
    '10': 'レベル2 大雨注意報', 
    '12': '大雪注意報', 
    '13': '風雪注意報',
    '14': '雷注意報', 
    '15': '強風注意報', 
    '16': '波浪注意報',
    '17': '融雪注意報', 
    '19': 'レベル2 高潮注意報',
    '20': '濃霧注意報', 
    '21': '乾燥注意報', 
    '22': 'なだれ注意報',
    '23': '低温注意報', 
    '24': '霜注意報', 
    '25': '着氷注意報',
    '26': '着雪注意報',
    '45': 'レベル2 河川氾濫注意報', // 新設（河川氾濫注意報）

    // 津波警報・注意報
    '50': '津波警報解除', '51': '津波警報', '52': '大津波警報', '53': '大津波警報',
    '60': '津波注意報解除', '62': '津波注意報',
    '71': '津波予報', '72': '津波予報', '73': '津波予報',
    // 解除
    '00': '解除'
};

// Fetch JMA weather alerts for Tokyo (Katsushika = 23区東部)
async function fetchAlerts() {
    try {
        const response = await fetch('https://www.jma.go.jp/bosai/warning/data/warning/130000.json');
        const data = await response.json();

        const reportTime = data.reportDatetime || null;

        // Find Katsushika area (code 1312200) or 23区東部 (code 130014)
        const areaWarnings = [];
        if (data.areaTypes) {
            for (const areaType of data.areaTypes) {
                for (const area of (areaType.areas || [])) {
                    if (area.code === '130014' || area.code === '1312200' || area.name?.includes('東部')) {
                        for (const warning of (area.warnings || [])) {
                            if (warning.status === '発表' || warning.status === '継続') {
                                const warningCode = warning.code?.toString().padStart(2, '0') || '';
                                const warningName = warning.name || JMA_WARNING_NAMES[warningCode] || `警報${warningCode}`;
                                areaWarnings.push({
                                    name: warningName,
                                    level: warning.kind?.code || 0
                                });
                            }
                        }
                    }
                }
            }
        }

        // Save to global for comment integration
        currentAlerts = areaWarnings;
        updateAlertBanner(areaWarnings, reportTime);
    } catch (e) {
        console.log('JMA Alert API unavailable (CORS):', e.message);
        document.getElementById('alertBanner').style.display = 'none';
    }
}

// Update the alert banner
function updateAlertBanner(alerts, reportTime = null) {
    const banner = document.getElementById('alertBanner');
    const alertText = document.getElementById('alertText');
    const alertIcon = banner.querySelector('.alert-icon');

    if (alerts.length === 0) {
        banner.style.display = 'none';
        return;
    }

    // 新たな防災気象情報の警戒レベル判定に基づいて分類するヘルパー
    const isLevel5 = a => a.name?.includes('レベル5') || a.name?.includes('特別警報') || a.name?.includes('氾濫特別警報');
    const isLevel4 = a => a.name?.includes('レベル4') || a.name?.includes('危険警報');
    const isLevel3 = a => a.name?.includes('レベル3') || (a.name?.includes('警報') && !a.name?.includes('特別') && !a.name?.includes('危険'));
    const isLevel2 = a => a.name?.includes('レベル2') || a.name?.includes('注意報');

    // 複数あり、かつレベル3以上がある場合は、レベル2以下（注意報）を除外
    let targetAlerts = [...alerts];
    const hasLevel3OrAbove = alerts.some(a => isLevel5(a) || isLevel4(a) || isLevel3(a));

    if (alerts.length > 1 && hasLevel3OrAbove) {
        targetAlerts = alerts.filter(a => isLevel5(a) || isLevel4(a) || isLevel3(a));
        if (targetAlerts.length === 0) {
            targetAlerts = [...alerts];
        }
    }

    // 分類
    const level5Alerts = targetAlerts.filter(isLevel5);
    const level4Alerts = targetAlerts.filter(isLevel4);
    const level3Alerts = targetAlerts.filter(isLevel3);
    const level2Alerts = targetAlerts.filter(isLevel2);
    const otherAlerts = targetAlerts.filter(a => 
        !isLevel5(a) && !isLevel4(a) && !isLevel3(a) && !isLevel2(a)
    );

    // プレフィックスを除去したコンテンツ文字列を結合するヘルパー
    const getGroupContent = (group, prefix) => {
        if (group.length === 0) return null;
        const cleanedNames = group.map(a => {
            let name = a.name || '';
            // 先頭の「レベルX」とそれに続く空白を除去
            name = name.replace(new RegExp(`^${prefix}\\s*`), '');
            return name;
        });
        return cleanedNames.join('・');
    };

    // テキスト構築（構造化オブジェクト）
    const alertParts = [];
    if (level5Alerts.length > 0) {
        const content = getGroupContent(level5Alerts, 'レベル5');
        if (content) alertParts.push({ prefix: 'レベル5', content });
    }
    if (level4Alerts.length > 0) {
        const content = getGroupContent(level4Alerts, 'レベル4');
        if (content) alertParts.push({ prefix: 'レベル4', content });
    }
    if (level3Alerts.length > 0) {
        const content = getGroupContent(level3Alerts, 'レベル3');
        if (content) alertParts.push({ prefix: 'レベル3', content });
    }
    if (level2Alerts.length > 0) {
        const content = getGroupContent(level2Alerts, 'レベル2');
        if (content) alertParts.push({ prefix: 'レベル2', content });
    }
    if (otherAlerts.length > 0) {
        const content = otherAlerts.map(a => a.name).join('・');
        alertParts.push({ prefix: '', content });
    }

    // Determine banner style and icon by highest active level
    let className, icon;
    if (level5Alerts.length > 0) {
        className = 'alert-level5';
        icon = '🔴'; // レベル5: 赤丸（極大警告）
    } else if (level4Alerts.length > 0) {
        className = 'alert-level4';
        icon = '🟪'; // レベル4: 紫（避難指示）
    } else if (level3Alerts.length > 0) {
        className = 'alert-level3';
        icon = '🚨'; // レベル3: 赤警報（高齢者等避難）
    } else if (level2Alerts.length > 0) {
        className = 'alert-level2';
        icon = '🟨'; // レベル2: 黄（注意）
    } else {
        className = 'alert-warning';
        icon = '🔔';
    }

    // Format report time
    let timeStr = '';
    if (reportTime) {
        const dt = new Date(reportTime);
        timeStr = `${dt.getHours()}:${dt.getMinutes().toString().padStart(2, '0')}発表`;
    }

    // HTML組み立て
    let htmlContent = '';
    htmlContent += `<span class="alert-meta">`;
    htmlContent += `<span class="alert-location">葛飾区</span>`;
    if (timeStr) {
        htmlContent += `<span class="alert-time">${timeStr}</span>`;
    }
    htmlContent += `</span>`;
    
    htmlContent += `<span class="alert-groups">`;
    alertParts.forEach((part, index) => {
        const separator = index > 0 ? `<span class="alert-group-separator"> / </span>` : '';
        htmlContent += separator;
        htmlContent += `<span class="alert-group-item">`;
        if (part.prefix) {
            htmlContent += `<span class="alert-level-label">${part.prefix}</span>`;
            htmlContent += `<span class="alert-level-content">${part.content}</span>`;
        } else {
            htmlContent += `<span class="alert-level-content">${part.content}</span>`;
        }
        htmlContent += `</span>`;
    });
    htmlContent += `</span>`;

    alertText.innerHTML = htmlContent;
    alertIcon.textContent = icon;
    banner.className = `alert-banner ${className}`;
    banner.style.display = 'flex';
}

// Get comfort level based on temperature
function getComfortLevel(temp) {
    if (temp >= 35) return { text: '🥵 猛暑', class: 'hot' };
    if (temp >= 28) return { text: '☀️ 暑い', class: 'warm' };
    if (temp >= 18) return { text: '😊 快適', class: 'comfort' };
    if (temp >= 10) return { text: '🍂 涼しい', class: 'cool' };
    return { text: '🥶 寒い', class: 'cold' };
}

// Update temperature-based theme (滑らかなグラデーション)
function updateTempTheme(temp) {
    // 温度範囲: -10℃ ～ 40℃ をHue: 220(青) ～ 0(赤) にマッピング
    // 線形補間で滑らかなグラデーションを実現
    const minTemp = -10;
    const maxTemp = 40;
    const minHue = 0;    // 赤（40℃以上）
    const maxHue = 220;  // 青（-10℃以下）

    // 温度を範囲内にクランプ
    const clampedTemp = Math.max(minTemp, Math.min(maxTemp, temp));

    // 線形補間: 温度が上がるとHueが下がる（青→シアン→緑→黄→オレンジ→赤）
    const hue = maxHue - ((clampedTemp - minTemp) / (maxTemp - minTemp)) * (maxHue - minHue);

    document.documentElement.style.setProperty('--temp-hue', Math.round(hue));
}

function updateUI() {
    if (!summaryData.currentTemp) return;

    const temp = summaryData.currentTemp;

    if (window.animateNumber) {
        window.animateNumber('currentTemp', temp.toFixed(1));
        window.animateNumber('currentHumidity', Math.round(summaryData.currentHumidity));
        window.animateNumber('todayHigh', summaryData.todayHigh.toFixed(1));
        window.animateNumber('todayLow', summaryData.todayLow.toFixed(1));
        // 年間データはPhase 2で読み込まれるのでnullチェック
        if (summaryData.yearHigh != null) window.animateNumber('yearHigh', summaryData.yearHigh.toFixed(1));
        if (summaryData.yearLow != null) window.animateNumber('yearLow', summaryData.yearLow.toFixed(1));
    } else {
        document.getElementById('currentTemp').textContent = temp.toFixed(1);
        document.getElementById('currentHumidity').textContent = Math.round(summaryData.currentHumidity);
        document.getElementById('todayHigh').textContent = summaryData.todayHigh.toFixed(1);
        document.getElementById('todayLow').textContent = summaryData.todayLow.toFixed(1);
        // 年間データはPhase 2で読み込まれるのでnullチェック
        if (summaryData.yearHigh != null) document.getElementById('yearHigh').textContent = summaryData.yearHigh.toFixed(1);
        if (summaryData.yearLow != null) document.getElementById('yearLow').textContent = summaryData.yearLow.toFixed(1);
    }
    if (summaryData.dataCount) document.getElementById('dataCount').textContent = summaryData.dataCount.toLocaleString() + ' 件';

    // Update feels-like temperature
    const feelsLikeEl = document.getElementById('feelsLike');
    const fl = calculateFeelsLike(temp, summaryData.currentHumidity, weatherData?.windSpeed || 0);
    if (window.animateNumber) {
        window.animateNumber('feelsLike', fl.toFixed(1));
    } else {
        feelsLikeEl.textContent = fl.toFixed(1);
    }

    // Color feels-like based on value
    const flParent = feelsLikeEl.closest('.stat-value');
    if (fl >= 35) { flParent.style.color = '#f87171'; flParent.style.textShadow = '0 0 20px rgba(248,113,113,0.4)'; }
    else if (fl >= 28) { flParent.style.color = '#fb923c'; flParent.style.textShadow = '0 0 20px rgba(251,146,60,0.3)'; }
    else if (fl >= 18) { flParent.style.color = '#4ade80'; flParent.style.textShadow = '0 0 20px rgba(74,222,128,0.3)'; }
    else if (fl >= 10) { flParent.style.color = '#38bdf8'; flParent.style.textShadow = '0 0 20px rgba(56,189,248,0.3)'; }
    else { flParent.style.color = '#22d3ee'; flParent.style.textShadow = '0 0 20px rgba(34,211,238,0.4)'; }

    // Update UV index
    const uvIndexEl = document.getElementById('uvIndex');
    const uvBadge = document.getElementById('uvBadge');
    const uvCard = uvIndexEl.closest('.stat-card');
    const hour = new Date().getHours();

    if (weatherData?.uvIndex != null && (hour >= 6 && hour <= 19)) {
        const uv = weatherData.uvIndex;
        if (window.animateNumber) {
            window.animateNumber('uvIndex', uv.toFixed(1));
        } else {
            uvIndexEl.textContent = uv.toFixed(1);
        }
        const uvLevel = getUvLevel(uv);
        uvBadge.textContent = uvLevel.text;
        uvBadge.className = `uv-badge ${uvLevel.class}`;

        // Color UV value based on level
        const uvParent = uvIndexEl.closest('.stat-value');
        if (uv >= 11) { uvParent.style.color = '#a855f7'; uvParent.style.textShadow = '0 0 20px rgba(168,85,247,0.4)'; }
        else if (uv >= 8) { uvParent.style.color = '#f87171'; uvParent.style.textShadow = '0 0 20px rgba(248,113,113,0.4)'; }
        else if (uv >= 6) { uvParent.style.color = '#fb923c'; uvParent.style.textShadow = '0 0 20px rgba(251,146,60,0.3)'; }
        else if (uv >= 3) { uvParent.style.color = '#facc15'; uvParent.style.textShadow = '0 0 20px rgba(250,204,21,0.3)'; }
        else { uvParent.style.color = '#4ade80'; uvParent.style.textShadow = '0 0 20px rgba(74,222,128,0.3)'; }

        uvCard.style.opacity = '1';
    } else {
        // Night time - dim the UV card
        uvIndexEl.textContent = '--';
        uvBadge.textContent = '夜間';
        uvBadge.className = 'uv-badge uv-low';
        const uvParent = uvIndexEl.closest('.stat-value');
        uvParent.style.color = '#64748b';
        uvParent.style.textShadow = 'none';
        uvCard.style.opacity = '0.6';
    }

    // Update comfort badge
    const comfort = getComfortLevel(temp);
    const badge = document.getElementById('comfortBadge');
    badge.textContent = comfort.text;
    badge.className = `comfort-badge show ${comfort.class}`;

    // Update temperature theme
    updateTempTheme(temp);

    // Update greeting
    updateGreeting(temp, summaryData.currentHumidity);

    // Update weather visual effects
    updateBackgroundWeatherEffects(weatherData?.weatherCode || 0, new Date().getHours());
}

// Switch background effects based on weather code and time
function updateBackgroundWeatherEffects(code, hour) {
    // Reset all effects
    document.querySelectorAll('.weather-effects > div').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.weather-effects > div').forEach(el => el.style.opacity = '0');

    const isDay = hour >= 6 && hour < 18;
    let activeEffectId = null;

    // Simple mapping
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) {
        activeEffectId = 'effectRain';
    }
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
        activeEffectId = 'effectSnow';
    }
    else if (code === 45 || code === 48) {
        activeEffectId = 'effectClouds';
    }
    else if (code === 0 || code === 1) {
        activeEffectId = isDay ? 'effectSun' : 'effectStars';
    }
    else if (code === 2 || code === 3) {
        activeEffectId = 'effectClouds';
    }

    if (activeEffectId) {
        const el = document.getElementById(activeEffectId);
        if (el) {
            el.classList.add('active');
            el.style.opacity = '1';
        }
    }
}

// Calculate feels-like temperature (improved physical model + low wind correction)
function calculateFeelsLike(temp, humidity, windSpeed) {
    // Adjust wind speed from 10m to 2m height
    const v = Math.max(0, (windSpeed || 0) * 0.6);

    // Minimum wind threshold
    const MIN_WIND_THRESHOLD = 1.3;

    // Calculate vapor pressure using Tetens formula (hPa)
    const e = 6.11 * Math.pow(10, (7.5 * temp) / (temp + 237.3)) * (humidity / 100);

    // Wind Chill (Linke formula for cold conditions)
    const windChill = (temp, v) => {
        if (v <= 0) return temp;
        return 13.12 + 0.6215 * temp - 11.37 * Math.pow(v * 3.6, 0.16) + 0.3965 * temp * Math.pow(v * 3.6, 0.16);
    };

    // Steadman's Apparent Temperature
    const steadman = (temp, e, v) => {
        return temp + 0.33 * e - 0.70 * v - 4.0;
    };

    // Heat Index
    const heatIndex = (temp, humidity) => {
        const c1 = -8.78469475556;
        const c2 = 1.61139411;
        const c3 = 2.33854883889;
        const c4 = -0.14611605;
        const c5 = -0.012308094;
        const c6 = -0.0164248277778;
        const c7 = 0.002211732;
        const c8 = 0.00072546;
        const c9 = -0.000003582;
        return c1 + c2 * temp + c3 * humidity + c4 * temp * humidity
            + c5 * temp * temp + c6 * humidity * humidity
            + c7 * temp * temp * humidity + c8 * temp * humidity * humidity
            + c9 * temp * temp * humidity * humidity;
    };

    // Linear interpolation helper
    const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

    // Calculate raw result based on temperature range
    let rawResult;
    if (temp <= 8) {
        rawResult = windChill(temp, v);
    } else if (temp <= 12) {
        const wc = windChill(temp, v);
        const st = steadman(temp, e, v);
        const t = (temp - 8) / 4;
        rawResult = lerp(wc, st, t);
    } else if (temp <= 25) {
        rawResult = steadman(temp, e, v);
    } else if (temp <= 29) {
        const st = steadman(temp, e, v);
        const hi = heatIndex(temp, humidity);
        const t = (temp - 25) / 4;
        rawResult = lerp(st, hi, t);
    } else {
        rawResult = heatIndex(temp, humidity);
    }

    // Low wind correction
    if (v < MIN_WIND_THRESHOLD) {
        const windFactor = v / MIN_WIND_THRESHOLD;
        return lerp(temp, rawResult, windFactor);
    }

    return rawResult;
}

// Get UV level description
function getUvLevel(uv) {
    if (uv >= 11) return { text: '極端', class: 'uv-extreme' };
    if (uv >= 8) return { text: '非常に強い', class: 'uv-very-high' };
    if (uv >= 6) return { text: '強い', class: 'uv-high' };
    if (uv >= 3) return { text: '中程度', class: 'uv-moderate' };
    return { text: '弱い', class: 'uv-low' };
}
