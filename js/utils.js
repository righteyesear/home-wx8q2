// =====================================================
// utils.js - ユーティリティ関数
// =====================================================
// 修正時: テーマ切替、天気エフェクト、CSVパース処理など
//
// 依存: config.js (themeSetting, weatherData, charts)

// Theme toggle: light <-> dark (auto mode removed)
function toggleTheme() {
    // Auto mode is commented out - only light/dark available
    // const modes = ['auto', 'light', 'dark'];
    const modes = ['light', 'dark'];
    const currentTheme = typeof themeSetting !== 'undefined' ? themeSetting : 'dark';
    const idx = modes.indexOf(currentTheme);
    themeSetting = modes[(idx + 1) % modes.length];
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('theme', themeSetting);
        }
    } catch (e) {}
    applyTheme();
}

// Apply theme based on setting
function applyTheme() {
    let isLight = false;
    const currentTheme = typeof themeSetting !== 'undefined' ? themeSetting : 'dark';

    if (currentTheme === 'light') {
        isLight = true;
    } else if (currentTheme === 'dark') {
        isLight = false;
    } else {
        // Fallback to dark if auto was previously saved
        themeSetting = 'dark';
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('theme', 'dark');
            }
        } catch (e) {}
        isLight = false;
    }

    if (typeof document === 'undefined') return;

    document.documentElement?.classList?.toggle('light-mode', isLight);

    // Update button text - SVG icons
    const iconEl = document.getElementById('themeIcon');
    const textEl = document.getElementById('themeText');

    if (currentTheme === 'light') {
        if (iconEl) {
            iconEl.setAttribute?.('aria-hidden', 'true');
            iconEl.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
        }
        if (textEl) textEl.textContent = 'ライト';
    } else {
        if (iconEl) {
            iconEl.setAttribute?.('aria-hidden', 'true');
            iconEl.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
        }
        if (textEl) textEl.textContent = 'ダーク';
    }

    // Sync color-scheme and theme-color metadata
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', isLight ? 'light' : 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLight ? '#edf1f5' : '#08111f');

    // Resize charts after theme change (fixes disappearing charts)
    if (typeof charts !== 'undefined' && charts && typeof setTimeout === 'function') {
        setTimeout(() => {
            Object.values(charts).forEach(chart => {
                if (chart && typeof chart.resize === 'function') {
                    chart.resize();
                }
            });
        }, 100);
    }
}

// =====================================================
// View Mode toggle: Normal <-> Simple
// =====================================================
function toggleViewMode() {
    if (typeof document === 'undefined' || !document.body) return;
    const isSimple = document.body.classList.toggle('simple-mode');
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('viewMode', isSimple ? 'simple' : 'normal');
        }
    } catch (e) {}
    updateModeUI(isSimple);

    // Resize charts after mode change
    if (typeof charts !== 'undefined' && charts && typeof setTimeout === 'function') {
        setTimeout(() => {
            Object.values(charts).forEach(chart => {
                if (chart && typeof chart.resize === 'function') {
                    chart.resize();
                }
            });
        }, 100);
    }
}

function updateModeUI(isSimple) {
    if (typeof document === 'undefined') return;
    const iconEl = document.getElementById('modeIcon');
    const textEl = document.getElementById('modeText');

    if (isSimple) {
        if (iconEl) {
            iconEl.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/></svg>';
        }
        if (textEl) textEl.textContent = 'シンプル';
    } else {
        if (iconEl) {
            iconEl.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>';
        }
        if (textEl) textEl.textContent = '通常モード';
    }
}

function initViewMode() {
    if (typeof document === 'undefined' || !document.body) return;
    let savedMode = 'normal';
    try {
        if (typeof localStorage !== 'undefined') {
            savedMode = localStorage.getItem('viewMode') || 'normal';
        }
    } catch (e) {}
    if (savedMode === 'simple') {
        document.body.classList.add('simple-mode');
        updateModeUI(true);
    }
}

// Initialize theme, view mode, and cross-tab theme sync on load
if (typeof document !== 'undefined') {
    applyTheme();
    initViewMode();
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
        if (event && event.key !== null && event.key !== 'theme') return;
        let savedTheme = null;
        try {
            savedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;
        } catch (e) {
            savedTheme = event ? event.newValue : null;
        }
        const nextTheme = savedTheme === 'light' ? 'light' : 'dark';
        if (typeof themeSetting !== 'undefined' && themeSetting === nextTheme) return;
        themeSetting = nextTheme;
        applyTheme();
    });
}

// Weather effects control based on weather code
let lightningInterval = null;
function updateWeatherEffects() {
    if (!weatherData) return;

    const code = weatherData.weatherCode || 0;
    const effectRain = document.getElementById('effectRain');
    const effectRainBack = document.getElementById('effectRainBack');
    const effectSnow = document.getElementById('effectSnow');
    const effectClouds = document.getElementById('effectClouds');
    const effectStars = document.getElementById('effectStars');
    const weatherContainer = document.getElementById('weatherEffectsContainer');
    const lightningFlash = document.getElementById('lightningFlash');

    if (!effectRain || !weatherContainer) return;

    // Reset all effects
    effectRain.classList.remove('active', 'heavy');
    effectRainBack?.classList.remove('active');
    effectSnow?.classList.remove('active');
    effectClouds?.classList.remove('active');
    effectStars?.classList.remove('active');
    weatherContainer.classList.remove('rainy');

    // Clear lightning interval
    if (lightningInterval) {
        clearInterval(lightningInterval);
        lightningInterval = null;
    }

    // Determine weather type from WMO code
    // 0: Clear, 1-3: Cloudy, 45-48: Fog, 51-57: Drizzle, 61-67: Rain, 71-77: Snow, 80-82: Showers, 85-86: Snow showers, 95-99: Thunderstorm

    const isNight = (() => {
        if (weatherData.sunrise && weatherData.sunset) {
            const now = new Date();
            return now < new Date(weatherData.sunrise) || now >= new Date(weatherData.sunset);
        }
        const hour = new Date().getHours();
        return hour < 6 || hour >= 18;
    })();

    if (code >= 95) {
        // Thunderstorm - heavy rain + lightning
        effectRain.classList.add('active', 'heavy');
        effectRainBack?.classList.add('active');
        weatherContainer.classList.add('rainy');
        effectRain.style.opacity = '0.8';

        // Random lightning flashes
        lightningInterval = setInterval(() => {
            if (Math.random() < 0.4) {
                lightningFlash?.classList.add('active');
                setTimeout(() => lightningFlash?.classList.remove('active'), 300);
            }
        }, 3000 + Math.random() * 4000);

    } else if (code >= 80 && code < 95) {
        // Heavy rain showers
        effectRain.classList.add('active', 'heavy');
        effectRainBack?.classList.add('active');
        weatherContainer.classList.add('rainy');
        effectRain.style.opacity = '0.7';

    } else if (code >= 61 && code < 80) {
        // Rain
        const isHeavy = code >= 65;
        effectRain.classList.add('active');
        if (isHeavy) effectRain.classList.add('heavy');
        effectRainBack?.classList.add('active');
        weatherContainer.classList.add('rainy');
        effectRain.style.opacity = isHeavy ? '0.6' : '0.4';

    } else if (code >= 51 && code < 61) {
        // Drizzle - light rain
        effectRain.classList.add('active');
        effectRainBack?.classList.add('active');
        weatherContainer.classList.add('rainy');
        effectRain.style.opacity = '0.3';

    } else if (code >= 71 && code < 78 || code >= 85 && code < 87) {
        // Snow
        effectSnow?.classList.add('active');
        effectSnow.style.opacity = code >= 75 ? '0.8' : '0.5';

    } else if (code >= 45 && code < 49) {
        // Fog
        effectClouds?.classList.add('active');
        effectClouds.style.opacity = '0.4';

    } else if (code >= 1 && code <= 3) {
        // Cloudy - subtle clouds
        effectClouds?.classList.add('active');
        effectClouds.style.opacity = '0.2';

    } else if (code === 0 && isNight) {
        // Clear night - show stars
        effectStars?.classList.add('active');
        effectStars.style.opacity = '0.6';
    }
}

// =====================================================
// CSV パース関数
// =====================================================

function parseSummaryCSV(csv) {
    const lines = csv.trim().split(/\r?\n/);
    const summary = {};
    for (const line of lines) {
        const [label, value] = line.split(',').map(v => v.replace(/"/g, '').trim());
        if (label.includes('今日の最高')) summary.todayHigh = parseFloat(value);
        else if (label.includes('今日の最低')) summary.todayLow = parseFloat(value);
        else if (label.includes('年間最高')) summary.yearHigh = parseFloat(value);
        else if (label.includes('年間最低')) summary.yearLow = parseFloat(value);
        else if (label.includes('現在の気温')) summary.currentTemp = parseFloat(value);
        else if (label.includes('現在の湿度')) summary.currentHumidity = parseFloat(value);
        else if (label.includes('データ件数')) summary.dataCount = parseInt(value);
    }
    return summary;
}

function parseDailyCSV(csv) {
    const records = csv.trim().split(/\r?\n/).slice(1).map(line => {
        const [dateStr, max, min] = line.split(',').map(v => v.replace(/"/g, ''));
        const d = new Date(dateStr);
        return !isNaN(d) && !isNaN(parseFloat(max)) ? { date: d, max: parseFloat(max), min: parseFloat(min) } : null;
    }).filter(Boolean).sort((a, b) => a.date - b.date);

    // 最高0.0かつ最低0.0をセンサーバグ（異常値）とし、前後の正常なデータで補完
    for (let i = 0; i < records.length; i++) {
        if (records[i].max === 0.0 && records[i].min === 0.0) {
            let foundNormal = false;
            // 1. 直前の正常な日から補完
            for (let j = i - 1; j >= 0; j--) {
                if (!(records[j].max === 0.0 && records[j].min === 0.0)) {
                    records[i].max = records[j].max;
                    records[i].min = records[j].min;
                    foundNormal = true;
                    break;
                }
            }
            // 2. なければ直後の正常な日から補完
            if (!foundNormal) {
                for (let j = i + 1; j < records.length; j++) {
                    if (!(records[j].max === 0.0 && records[j].min === 0.0)) {
                        records[i].max = records[j].max;
                        records[i].min = records[j].min;
                        foundNormal = true;
                        break;
                    }
                }
            }
        }
    }
    return records;
}

function parseRecentCSV(csv) {
    const records = csv.trim().split(/\r?\n/).slice(1).map(line => {
        let [dateStr, temp, humidity] = line.split(',').map(v => v.replace(/"/g, ''));
        dateStr = dateStr.replace(/ (\d):/, ' 0$1:');
        const d = new Date(dateStr.replace(' ', 'T'));
        return !isNaN(d) && !isNaN(parseFloat(temp)) ? { date: d, temperature: parseFloat(temp), humidity: parseFloat(humidity) } : null;
    }).filter(Boolean).sort((a, b) => a.date - b.date);

    // 気温0.0かつ湿度0.0をセンサーバグ（異常値）とし、前後の正常なデータで補完
    for (let i = 0; i < records.length; i++) {
        if (records[i].temperature === 0.0 && records[i].humidity === 0.0) {
            let foundNormal = false;
            // 1. 直前の正常値を探す
            for (let j = i - 1; j >= 0; j--) {
                if (!(records[j].temperature === 0.0 && records[j].humidity === 0.0)) {
                    records[i].temperature = records[j].temperature;
                    records[i].humidity = records[j].humidity;
                    foundNormal = true;
                    break;
                }
            }
            // 2. なければ直後の正常値を探す
            if (!foundNormal) {
                for (let j = i + 1; j < records.length; j++) {
                    if (!(records[j].temperature === 0.0 && records[j].humidity === 0.0)) {
                        records[i].temperature = records[j].temperature;
                        records[i].humidity = records[j].humidity;
                        foundNormal = true;
                        break;
                    }
                }
            }
        }
    }
    return records;
}

// Simple markdown to HTML converter
function simpleMarkdownToHtml(text) {
    const escaped = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    return escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}
