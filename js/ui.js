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

// 2026-05-29以降の気象警報・注意報コード。
// コードだけでなく dataTypeCode と組み合わせて解釈する。
const JMA_WARNING_DEFINITIONS = {
    VPWW55: {
        '33': { name: 'レベル5 大雨特別警報', level: 5 },
        '43': { name: 'レベル4 大雨危険警報', level: 4 },
        '03': { name: 'レベル3 大雨警報', level: 3 },
        '10': { name: 'レベル2 大雨注意報', level: 2 }
    },
    VPWW56: {
        '39': { name: 'レベル5 土砂災害特別警報', level: 5 },
        '49': { name: 'レベル4 土砂災害危険警報', level: 4 },
        '09': { name: 'レベル3 土砂災害警報', level: 3 },
        '29': { name: 'レベル2 土砂災害注意報', level: 2 }
    },
    VPWW57: {
        '38': { name: 'レベル5 高潮特別警報', level: 5 },
        '48': { name: 'レベル4 高潮危険警報', level: 4 },
        '08': { name: 'レベル3 高潮警報', level: 3 },
        '19': { name: 'レベル2 高潮注意報', level: 2 }
    },
    VPWW58: {
        '32': { name: '暴風雪特別警報', level: 5 },
        '35': { name: '暴風特別警報', level: 5 },
        '02': { name: '暴風雪警報', level: 3 },
        '05': { name: '暴風警報', level: 3 },
        '13': { name: '風雪注意報', level: 2 },
        '15': { name: '強風注意報', level: 2 }
    },
    VPWW59: {
        '37': { name: '波浪特別警報', level: 5 },
        '07': { name: '波浪警報', level: 3 },
        '16': { name: '波浪注意報', level: 2 }
    },
    VPWW60: {
        '36': { name: '大雪特別警報', level: 5 },
        '06': { name: '大雪警報', level: 3 },
        '12': { name: '大雪注意報', level: 2 }
    },
    VPWW61: {
        '14': { name: '雷注意報', level: 2 },
        '17': { name: '融雪注意報', level: 2 },
        '20': { name: '濃霧注意報', level: 2 },
        '21': { name: '乾燥注意報', level: 2 },
        '22': { name: 'なだれ注意報', level: 2 },
        '23': { name: '低温注意報', level: 2 },
        '24': { name: '霜注意報', level: 2 },
        '25': { name: '着氷注意報', level: 2 },
        '26': { name: '着雪注意報', level: 2 },
        '27': { name: 'その他の注意報', level: 2 }
    }
};

const JMA_ACTIVE_STATUSES = new Set([
    '発表',
    '継続',
    '特別警報から危険警報',
    '特別警報から警報',
    '特別警報から注意報',
    '危険警報から警報',
    '危険警報から注意報',
    '警報から注意報'
]);

function normalizeJmaAlerts(data, areaCode = '1312200') {
    if (!Array.isArray(data)) {
        throw new Error('Unexpected JMA warning response schema');
    }

    const alerts = [];
    const seen = new Set();

    for (const report of data) {
        const dataTypeCode = report.dataTypeCode || '';
        const definitions = JMA_WARNING_DEFINITIONS[dataTypeCode] || {};
        const class20Items = report.warning?.class20Items || [];

        for (const area of class20Items) {
            if (area.areaCode !== areaCode) continue;

            for (const kind of (area.kinds || [])) {
                if (!JMA_ACTIVE_STATUSES.has(kind.status)) continue;

                const code = kind.code?.toString().padStart(2, '0') || '';
                if (!code) continue;

                const definition = definitions[code] || {
                    name: `気象警報等（${dataTypeCode}/${code}）`,
                    level: 0
                };
                const id = `${dataTypeCode}:${code}`;
                if (seen.has(id)) continue;
                seen.add(id);

                alerts.push({
                    id,
                    dataTypeCode,
                    code,
                    name: definition.name,
                    level: definition.level,
                    status: kind.status,
                    reportDatetime: report.reportDatetime || null,
                    controlDatetime: report.controlDatetime || null
                });
            }
        }
    }

    return alerts.sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
}

// Fetch JMA weather alerts for Katsushika.
async function fetchAlerts() {
    try {
        const response = await fetch('https://www.jma.go.jp/bosai/warning/data/r8/130000.json', {
            cache: 'no-store'
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const areaWarnings = normalizeJmaAlerts(data, '1312200');
        const reportTime = areaWarnings
            .map(alert => alert.reportDatetime)
            .filter(Boolean)
            .sort()
            .at(-1) || null;

        // Save to global for comment integration
        currentAlerts = areaWarnings;
        updateAlertBanner(areaWarnings, reportTime);
    } catch (e) {
        console.error('JMA Alert API unavailable:', e.message);
        // 取得失敗を「警報なし」と誤認しない。既存表示があれば維持する。
        if (!currentAlerts || currentAlerts.length === 0) {
            document.getElementById('alertBanner').style.display = 'none';
        }
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

// Calculate a reference apparent temperature.
// Heat Index assumes shade/light wind. Wind is Open-Meteo's 10 m estimate,
// not a measurement at the outdoor sensor.
function calculateFeelsLike(temp, humidity, windSpeed) {
    const airTemp = Number(temp);
    if (!Number.isFinite(airTemp)) return NaN;
    const rh = Math.max(0, Math.min(100, Number(humidity) || 0));
    const wind10m = Math.max(0, Number(windSpeed) || 0);

    // Calculate vapor pressure using Tetens formula (hPa)
    const e = 6.11 * Math.pow(10, (7.5 * airTemp) / (airTemp + 237.3)) * (rh / 100);

    // Environment Canada wind chill: valid at <= 10°C and wind >= 5 km/h.
    const windChill = (value, wind) => {
        const windKmh = wind * 3.6;
        if (value > 10 || windKmh < 5) return value;
        return 13.12 + 0.6215 * value - 11.37 * Math.pow(windKmh, 0.16)
            + 0.3965 * value * Math.pow(windKmh, 0.16);
    };

    const steadman = (value, vaporPressure, wind) =>
        value + 0.33 * vaporPressure - 0.70 * wind - 4.0;

    // NWS Rothfusz Heat Index regression with its official adjustments.
    const heatIndex = (value, relativeHumidity) => {
        const tempF = value * 9 / 5 + 32;
        const simple = 0.5 * (
            tempF + 61 + (tempF - 68) * 1.2 + relativeHumidity * 0.094
        );
        if ((simple + tempF) / 2 < 80) return value;

        let hi = -42.379 + 2.04901523 * tempF
            + 10.14333127 * relativeHumidity
            - 0.22475541 * tempF * relativeHumidity
            - 0.00683783 * tempF * tempF
            - 0.05481717 * relativeHumidity * relativeHumidity
            + 0.00122874 * tempF * tempF * relativeHumidity
            + 0.00085282 * tempF * relativeHumidity * relativeHumidity
            - 0.00000199 * tempF * tempF * relativeHumidity * relativeHumidity;

        if (relativeHumidity < 13 && tempF >= 80 && tempF <= 112) {
            hi -= ((13 - relativeHumidity) / 4)
                * Math.sqrt(Math.max(0, (17 - Math.abs(tempF - 95)) / 17));
        } else if (relativeHumidity > 85 && tempF >= 80 && tempF <= 87) {
            hi += ((relativeHumidity - 85) / 10) * ((87 - tempF) / 5);
        }
        return (hi - 32) * 5 / 9;
    };

    if (airTemp <= 10) return windChill(airTemp, wind10m);
    if (airTemp >= 27 && rh >= 40) return heatIndex(airTemp, rh);

    const apparent = steadman(airTemp, e, wind10m);
    return airTemp >= 32 ? Math.max(airTemp, apparent) : apparent;
}

// Get UV level description
function getUvLevel(uv) {
    if (uv >= 11) return { text: '極端', class: 'uv-extreme' };
    if (uv >= 8) return { text: '非常に強い', class: 'uv-very-high' };
    if (uv >= 6) return { text: '強い', class: 'uv-high' };
    if (uv >= 3) return { text: '中程度', class: 'uv-moderate' };
    return { text: '弱い', class: 'uv-low' };
}
