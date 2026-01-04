        // =====================================================
        // PULL-TO-REFRESH (Mobile) - Polished Version
        // =====================================================
        (function () {
            let startY = 0;
            let currentY = 0;
            let isPulling = false;
            let isRefreshing = false;
            const THRESHOLD = 70;
            const MAX_PULL = 100;

            const indicator = document.getElementById('pullRefreshIndicator');
            const textEl = document.getElementById('pullRefreshText');
            const arrowEl = document.getElementById('pullRefreshArrow');
            const spinnerEl = indicator?.querySelector('.pull-refresh-spinner');

            if (!indicator) return;

            document.addEventListener('touchstart', (e) => {
                if (window.scrollY <= 0 && !isRefreshing) {
                    startY = e.touches[0].pageY;
                    isPulling = true;
                }
            }, { passive: true });

            document.addEventListener('touchmove', (e) => {
                if (!isPulling || isRefreshing) return;

                currentY = e.touches[0].pageY;
                const pullDistance = Math.min(currentY - startY, MAX_PULL);

                if (pullDistance > 10 && window.scrollY <= 0) {
                    e.preventDefault();

                    const progress = Math.min(pullDistance / THRESHOLD, 1);
                    const isReady = pullDistance >= THRESHOLD;

                    // Update classes
                    indicator.classList.add('visible', 'pulling');
                    indicator.classList.toggle('ready', isReady);

                    // Rotate spinner based on pull progress
                    if (spinnerEl) {
                        spinnerEl.style.transform = `rotate(${progress * 540}deg)`;
                    }

                    // Update text
                    textEl.textContent = isReady ? '離して更新' : '引っ張って更新';

                    // Hide arrow when refreshing
                    if (arrowEl) {
                        arrowEl.style.display = 'inline';
                    }
                }
            }, { passive: false });

            document.addEventListener('touchend', async () => {
                if (!isPulling || isRefreshing) return;

                const pullDistance = currentY - startY;

                if (pullDistance >= THRESHOLD && window.scrollY <= 0) {
                    isRefreshing = true;

                    // Haptic feedback
                    if (navigator.vibrate) navigator.vibrate(25);

                    indicator.classList.remove('pulling', 'ready');
                    indicator.classList.add('refreshing');

                    // Hide arrow, reset spinner
                    if (arrowEl) arrowEl.style.display = 'none';
                    if (spinnerEl) spinnerEl.style.transform = '';

                    textEl.textContent = '更新中...';

                    try {
                        if (typeof fetchAll === 'function') {
                            await fetchAll();
                        }
                        textEl.textContent = '✓ 更新完了';
                        if (navigator.vibrate) navigator.vibrate([15, 50, 15]);
                    } catch (err) {
                        textEl.textContent = '✗ エラー';
                        console.error('Pull refresh error:', err);
                    }

                    setTimeout(() => {
                        indicator.classList.remove('visible', 'refreshing');
                        textEl.textContent = '引っ張って更新';
                        if (arrowEl) arrowEl.style.display = 'inline';
                        isRefreshing = false;
                    }, 800);
                } else {
                    indicator.classList.remove('visible', 'pulling', 'ready');
                    if (spinnerEl) spinnerEl.style.transform = '';
                }

                isPulling = false;
                startY = 0;
                currentY = 0;
            }, { passive: true });
        })();

        // =====================================================
        // SOURCE CODE PROTECTION (deters casual viewing)
        // TEMPORARILY DISABLED FOR DEBUGGING
        // =====================================================
        /*
        (function () {
            // Disable right-click context menu
            document.addEventListener('contextmenu', e => e.preventDefault());

            // Disable keyboard shortcuts (F12, Ctrl+Shift+I, Ctrl+U, Ctrl+S)
            document.addEventListener('keydown', function (e) {
                // F12
                if (e.key === 'F12') { e.preventDefault(); return false; }
                // Ctrl+Shift+I (DevTools)
                if (e.ctrlKey && e.shiftKey && e.key === 'I') { e.preventDefault(); return false; }
                // Ctrl+Shift+J (Console)
                if (e.ctrlKey && e.shiftKey && e.key === 'J') { e.preventDefault(); return false; }
                // Ctrl+U (View Source)
                if (e.ctrlKey && e.key === 'u') { e.preventDefault(); return false; }
                // Ctrl+S (Save)
                if (e.ctrlKey && e.key === 's') { e.preventDefault(); return false; }
            });

            // DevTools detection (checks if window is resized for docked DevTools)
            let devToolsOpen = false;
            const threshold = 160;

            // Create warning overlay
            const createWarningOverlay = () => {
                if (document.getElementById('devtools-warning')) return;
                const overlay = document.createElement('div');
                overlay.id = 'devtools-warning';
                overlay.innerHTML = `
                    <div style="
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                        background: linear-gradient(135deg, rgba(15, 0, 0, 0.98), rgba(30, 0, 0, 0.95));
                        display: flex; flex-direction: column;
                        justify-content: center; align-items: center;
                        z-index: 999999; color: white; font-family: sans-serif;
                        animation: warningPulse 2s ease-in-out infinite;
                    ">
                        <style>
                            @keyframes warningPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.9; } }
                            @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
                        </style>
                        <div style="position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, #ef4444, transparent); animation: scanline 2s linear infinite;"></div>
                        <div style="font-size: 100px; margin-bottom: 20px; filter: drop-shadow(0 0 30px rgba(239, 68, 68, 0.8));">⚠️</div>
                        <div style="font-size: 32px; font-weight: bold; margin-bottom: 10px; color: #ef4444; text-shadow: 0 0 20px rgba(239, 68, 68, 0.6);">
                            🔒 セキュリティ警告
                        </div>
                        <div style="font-size: 24px; font-weight: bold; margin-bottom: 20px; color: #fbbf24;">
                            不正アクセスが検出されました
                        </div>
                        <div style="font-size: 14px; color: #94a3b8; text-align: center; line-height: 2; max-width: 500px; background: rgba(0,0,0,0.5); padding: 20px; border-radius: 10px; border: 1px solid rgba(239, 68, 68, 0.3);">
                            このページのソースコードは著作権法により保護されています。<br>
                            <span style="color: #ef4444; font-weight: bold;">⚡ 開発者ツールの使用を検出</span><br><br>
                            📋 あなたのIPアドレス・デバイス情報は記録されました<br>
                            📡 サーバーへのログ送信: <span style="color: #22c55e;">完了</span><br>
                            🔍 不正アクセスとして調査対象となる場合があります<br><br>
                            <span style="color: #fbbf24;">開発者ツールを直ちに閉じてください</span>
                        </div>
                        <div style="margin-top: 20px; font-size: 11px; color: #64748b;">
                            Session ID: ${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now()}
                        </div>
                    </div>
                `;
                document.body.appendChild(overlay);
            };

            const removeWarningOverlay = () => {
                const overlay = document.getElementById('devtools-warning');
                if (overlay) overlay.remove();
            };

            const checkDevTools = () => {
                const widthDiff = window.outerWidth - window.innerWidth > threshold;
                const heightDiff = window.outerHeight - window.innerHeight > threshold;
                if (widthDiff || heightDiff) {
                    if (!devToolsOpen) {
                        devToolsOpen = true;
                        console.clear();
                        console.log('%c⚠️ 開発者ツールの使用は検出されます。開発者に自動で報告されます。', 'color: red; font-size: 20px; font-weight: bold;');
                        createWarningOverlay();
                    }
                } else {
                    if (devToolsOpen) {
                        devToolsOpen = false;
                        removeWarningOverlay();
                    }
                }
            };
            setInterval(checkDevTools, 500);

            // Additional detection using debugger timing
            const detectDebugger = () => {
                const start = performance.now();
                debugger;
                const end = performance.now();
                if (end - start > 100) {
                    createWarningOverlay();
                }
            };
            // Run once on load (will trigger if DevTools is already open)
            setTimeout(detectDebugger, 1000);

            // Disable text selection (optional, can be removed if needed)
            document.addEventListener('selectstart', e => e.preventDefault());

            // Disable pinch-to-zoom on mobile
            document.addEventListener('gesturestart', e => e.preventDefault());
            document.addEventListener('gesturechange', e => e.preventDefault());
            document.addEventListener('gestureend', e => e.preventDefault());

            // Disable double-tap zoom
            let lastTouchEnd = 0;
            document.addEventListener('touchend', e => {
                const now = Date.now();
                if (now - lastTouchEnd <= 300) {
                    e.preventDefault();
                }
                lastTouchEnd = now;
            }, { passive: false });

            // Disable multi-touch zoom
            document.addEventListener('touchstart', e => {
                if (e.touches.length > 1) {
                    e.preventDefault();
                }
            }, { passive: false });

            // Clear console on load
            console.clear();
        })();
        */

        const SPREADSHEET_ID = '1nbmJIIUzw8n2PcHp98NaiKnaAVciBx_Egpokjjx7uW8';
        const BASE_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;
        const SUMMARY_URL = `${BASE_URL}&sheet=Summary`;
        const DAILY_URL = `${BASE_URL}&sheet=Daily`;
        const RECENT_URL = `${BASE_URL}&sheet=Recent`;
        const WEEKLY_URL = `${BASE_URL}&sheet=Weekly`;

        // 全パラメータ取得: 気圧、風向、日射量、蒸発散量など全て含む
        const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=35.7727&longitude=139.8680' +
            '&current=weather_code,temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,' +
            'precipitation,rain,showers,snowfall,cloud_cover,pressure_msl,surface_pressure,' +
            'wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,uv_index,is_day' +
            '&hourly=weather_code,temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,' +
            'precipitation_probability,precipitation,rain,showers,snowfall,cloud_cover,visibility,' +
            'wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,' +
            'temperature_850hPa,temperature_925hPa,wet_bulb_temperature_2m,freezing_level_height,' +
            'cape,soil_temperature_0cm,direct_radiation,diffuse_radiation,et0_fao_evapotranspiration' +
            '&daily=sunrise,sunset,sunshine_duration,uv_index_max,temperature_2m_max,temperature_2m_min,' +
            'precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_probability_max,' +
            'wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,shortwave_radiation_sum' +
            '&forecast_days=2&timezone=Asia%2FTokyo&wind_speed_unit=ms';

        const UPDATE_INTERVAL = 60 * 1000;

        let summaryData = {}, dailyData = [], recentData = [], weeklyData = [], weatherData = null, charts = {}, nextUpdateTime = null;

        // Comment stability system - only change comment when conditions change
        let lastConditionKey = '';  // Previous condition key (temp band, weather, alerts)
        let lastComment = '';       // Previous comment to maintain when conditions unchanged
        let currentAlerts = [];     // Current JMA alerts for comment integration

        // Theme settings: 'auto', 'light', 'dark'
        let themeSetting = localStorage.getItem('theme') || 'auto';
        let notificationsEnabled = localStorage.getItem('notifications') === 'true';
        const TEMP_ALERT_THRESHOLD = 35; // Notify when temp >= this

        // =====================================================
        // PERFORMANCE: LocalStorage Cache System
        // =====================================================
        const CACHE_CONFIG = {
            weather: { key: 'cache_weather', ttl: 5 * 60 * 1000 },      // 5 minutes
            spreadsheet: { key: 'cache_spreadsheet', ttl: 10 * 60 * 1000 }, // 10 minutes
            precipitation: { key: 'cache_precip', ttl: 5 * 60 * 1000 }, // 5 minutes
            alerts: { key: 'cache_alerts', ttl: 30 * 60 * 1000 }        // 30 minutes
        };

        function getFromCache(type) {
            try {
                const config = CACHE_CONFIG[type];
                if (!config) return null;
                const cached = localStorage.getItem(config.key);
                if (!cached) return null;
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp > config.ttl) {
                    localStorage.removeItem(config.key);
                    return null;
                }
                console.log(`[Cache] Hit: ${type}`);
                return data;
            } catch (e) {
                return null;
            }
        }

        function setToCache(type, data) {
            try {
                const config = CACHE_CONFIG[type];
                if (!config) return;
                localStorage.setItem(config.key, JSON.stringify({
                    data,
                    timestamp: Date.now()
                }));
                console.log(`[Cache] Set: ${type}`);
            } catch (e) {
                // LocalStorage full or unavailable
                console.log('[Cache] Storage error:', e.message);
            }
        }

        function clearAllCache() {
            Object.values(CACHE_CONFIG).forEach(config => {
                localStorage.removeItem(config.key);
            });
            console.log('[Cache] Cleared all');
        }

        // PWA Registration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(e => console.log('SW registration failed:', e));
        }

        // Request notification permission on load
        function requestNotificationPermission() {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().then(p => {
                    if (p === 'granted') {
                        notificationsEnabled = true;
                        localStorage.setItem('notifications', 'true');
                    }
                });
            }
        }

        // Send notification if conditions are met
        function checkAndNotify(temp) {
            if (!notificationsEnabled || Notification.permission !== 'granted') return;
            if (temp >= TEMP_ALERT_THRESHOLD) {
                new Notification('🌡️ 外気温モニター', {
                    body: `${temp.toFixed(1)}°C - 猛暑警報！熱中症に注意してください`,
                    icon: '🌡️',
                    tag: 'temp-alert'
                });
            } else if (temp <= 0) {
                new Notification('🌡️ 外気温モニター', {
                    body: `${temp.toFixed(1)}°C - 氷点下です。凍結に注意`,
                    icon: '❄️',
                    tag: 'temp-alert'
                });
            }
        }

        // Theme toggle: auto -> light -> dark -> auto
        function toggleTheme() {
            const modes = ['auto', 'light', 'dark'];
            const idx = modes.indexOf(themeSetting);
            themeSetting = modes[(idx + 1) % 3];
            localStorage.setItem('theme', themeSetting);
            applyTheme();
        }

        // =====================================================
        // PUSH NOTIFICATION MANAGEMENT
        // =====================================================

        // VAPID public key for Web Push
        const VAPID_PUBLIC_KEY = 'BPcLliQGMqx_XC_LpymDjhVNerzB1TJb9oqAfpeS9VyTxW7Ab3Heo5Yx_cvItV8HAZnO6NPLcbvtTU6IiAF-I4E';

        // Your Cloudflare Worker subscription endpoint
        const PUSH_SUBSCRIBE_URL = 'https://push-notifications.miurayukimail.workers.dev/api/subscribe';

        async function toggleNotifications() {
            const btn = document.getElementById('notificationToggle');
            const icon = document.getElementById('notificationIcon');

            // Check if notifications are supported
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                alert('このブラウザはプッシュ通知に対応していません');
                return;
            }

            // Check if VAPID key is set
            if (!VAPID_PUBLIC_KEY || !PUSH_SUBSCRIBE_URL) {
                alert('通知機能はまだ設定中です。しばらくお待ちください。');
                return;
            }

            const permission = Notification.permission;

            if (permission === 'denied') {
                alert('通知がブロックされています。ブラウザの設定から許可してください。');
                return;
            }

            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();

                if (subscription) {
                    // Already subscribed - unsubscribe
                    await subscription.unsubscribe();
                    // Notify server to remove subscription
                    await fetch(PUSH_SUBSCRIBE_URL, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ endpoint: subscription.endpoint })
                    });
                    updateNotificationUI(false);
                    console.log('[Notification] Unsubscribed');
                } else {
                    // Not subscribed - request permission and subscribe
                    const result = await Notification.requestPermission();

                    if (result === 'granted') {
                        const newSubscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                        });

                        // Send subscription to server
                        await fetch(PUSH_SUBSCRIBE_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(newSubscription)
                        });

                        updateNotificationUI(true);
                        console.log('[Notification] Subscribed:', newSubscription);
                    } else {
                        updateNotificationUI(false, result === 'denied');
                    }
                }
            } catch (err) {
                console.error('[Notification] Error:', err);
                alert('通知の設定中にエラー: ' + err.message);
            }
        }

        function updateNotificationUI(enabled, denied = false) {
            const btn = document.getElementById('notificationToggle');
            const icon = document.getElementById('notificationIcon');

            if (denied) {
                btn.classList.add('denied');
                btn.classList.remove('enabled');
                icon.textContent = '🔕';
                btn.title = '通知がブロックされています';
            } else if (enabled) {
                btn.classList.add('enabled');
                btn.classList.remove('denied');
                icon.textContent = '🔔';
                btn.title = '通知をオフにする';
            } else {
                btn.classList.remove('enabled', 'denied');
                icon.textContent = '🔕';
                btn.title = '通知をオンにする';
            }
        }

        // Check notification state on page load
        async function initNotificationState() {
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                document.getElementById('notificationToggle').style.display = 'none';
                return;
            }

            if (Notification.permission === 'denied') {
                updateNotificationUI(false, true);
                return;
            }

            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                updateNotificationUI(!!subscription);
            } catch (err) {
                console.log('[Notification] Init error:', err);
            }
        }

        // Helper: Convert VAPID key
        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const rawData = window.atob(base64);
            const outputArray = new Uint8Array(rawData.length);
            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
        }

        // Initialize notification state after page load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initNotificationState);
        } else {
            initNotificationState();
        }

        // Apply theme based on setting (uses sunrise/sunset when available)
        function applyTheme() {
            const now = new Date();
            let isLight = false;

            if (themeSetting === 'light') {
                isLight = true;
            } else if (themeSetting === 'dark') {
                isLight = false;
            } else {
                // Auto mode: use sunrise/sunset if available, fallback to 6-18
                if (weatherData?.sunrise && weatherData?.sunset) {
                    const sunriseTime = new Date(weatherData.sunrise);
                    const sunsetTime = new Date(weatherData.sunset);
                    isLight = (now >= sunriseTime && now < sunsetTime);
                } else {
                    // Fallback: light 6-18, dark otherwise
                    const hour = now.getHours();
                    isLight = (hour >= 6 && hour < 18);
                }
            }

            document.documentElement.classList.toggle('light-mode', isLight);

            // Update button text
            const icon = themeSetting === 'auto' ? '🔄' : (themeSetting === 'light' ? '☀️' : '🌙');
            const text = themeSetting === 'auto' ? '自動' : (themeSetting === 'light' ? 'ライト' : 'ダーク');
            document.getElementById('themeIcon').textContent = icon;
            document.getElementById('themeText').textContent = text;

            // Update meta theme color
            document.querySelector('meta[name="theme-color"]').content = isLight ? '#f1f5f9' : '#3b82f6';

            // Resize charts after theme change (fixes disappearing charts)
            setTimeout(() => {
                Object.values(charts).forEach(chart => {
                    if (chart && typeof chart.resize === 'function') {
                        chart.resize();
                    }
                });
            }, 100);
        }

        // Initialize theme on load
        applyTheme();

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
            return csv.trim().split(/\r?\n/).slice(1).map(line => {
                const [dateStr, max, min] = line.split(',').map(v => v.replace(/"/g, ''));
                const d = new Date(dateStr);
                return !isNaN(d) && !isNaN(parseFloat(max)) ? { date: d, max: parseFloat(max), min: parseFloat(min) } : null;
            }).filter(Boolean).sort((a, b) => a.date - b.date);
        }

        function parseRecentCSV(csv) {
            return csv.trim().split(/\r?\n/).slice(1).map(line => {
                let [dateStr, temp, humidity] = line.split(',').map(v => v.replace(/"/g, ''));
                dateStr = dateStr.replace(/ (\d):/, ' 0$1:');
                const d = new Date(dateStr.replace(' ', 'T'));
                return !isNaN(d) && !isNaN(parseFloat(temp)) ? { date: d, temperature: parseFloat(temp), humidity: parseFloat(humidity) } : null;
            }).filter(Boolean).sort((a, b) => a.date - b.date);
        }

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

        // ============================================================
        // Rain/Snow Detection System
        // ============================================================

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

            // Priority 1: Yahoo observation shows precipitation (10+ minutes)
            if (actualPrecipState.consecutiveMinutes >= 10 && actualPrecipState.rainfall > 0) {
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
            if (actualPrecipState.rainfall === 0) {
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

            // If raining but less than 10 minutes, use cache if available
            if (lastWeatherOverride.icon && lastWeatherOverride.precipType === actualPrecipState.precipType) {
                return { icon: lastWeatherOverride.icon, condition: lastWeatherOverride.condition };
            }

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

        // Load precipitation data from precipitation.json
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
                        // 雪は水色〜白系
                        if (rainfall < 1) {
                            bgColor = 'rgba(147, 197, 253, 0.15)';   // 薄い水色
                            borderColor = 'rgba(147, 197, 253, 0.4)';
                        } else if (rainfall < 3) {
                            bgColor = 'rgba(165, 210, 255, 0.18)';   // 水色
                            borderColor = 'rgba(165, 210, 255, 0.5)';
                        } else {
                            bgColor = 'rgba(200, 225, 255, 0.2)';    // 白っぽい水色
                            borderColor = 'rgba(200, 225, 255, 0.6)';
                        }
                    } else if (precipType === 'sleet') {
                        // みぞれは青紫系
                        bgColor = 'rgba(139, 92, 246, 0.15)';
                        borderColor = 'rgba(139, 92, 246, 0.4)';
                    } else {
                        // 雨は従来通り青系
                        if (rainfall < 1) {
                            bgColor = 'rgba(96, 165, 250, 0.15)';   // 水色（弱い雨）
                            borderColor = 'rgba(96, 165, 250, 0.4)';
                        } else if (rainfall < 5) {
                            bgColor = 'rgba(59, 130, 246, 0.15)';   // 青（やや強い雨）
                            borderColor = 'rgba(59, 130, 246, 0.4)';
                        } else if (rainfall < 10) {
                            bgColor = 'rgba(234, 179, 8, 0.15)';    // 黄色（強い雨）
                            borderColor = 'rgba(234, 179, 8, 0.4)';
                        } else if (rainfall < 20) {
                            bgColor = 'rgba(249, 115, 22, 0.15)';   // オレンジ（激しい雨）
                            borderColor = 'rgba(249, 115, 22, 0.4)';
                        } else {
                            bgColor = 'rgba(239, 68, 68, 0.15)';    // 赤（非常に激しい雨）
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
                        // Check next 6 hours for snow transition
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
                        // Check if it will become full snow
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
                    // datetimeの形式: "202512271150" or ISO
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
                        // 予報の降水量から強度を判定
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
                    // 雨の予報なし
                    rainAlert.style.display = 'none';
                }
            } catch (e) {
                console.log('Precipitation data not available:', e.message);
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

        // =====================================================
        // MOON CALCULATIONS & DISPLAY
        // =====================================================

        // Global cache for moon arc real-time updates
        let cachedMoonTimes = null;
        let moonPositionInterval = null;

        async function loadMoonData() {
            const now = new Date(); // Real-time mode
            const LAT = 35.7785;
            const LON = 139.878;

            // Calculate local values (fallback)
            const moonData = calculateMoonPhase(now);
            const moonPos = calculateMoonPosition(now, LAT, LON);
            let moonTimes = calculateMoonTimes(now, LAT, LON);

            // Try to load API data from moon_data.json
            try {
                const resp = await fetch('moon_data.json?_=' + Date.now());
                if (resp.ok) {
                    const apiData = await resp.json();
                    // Override times with API values if available
                    if (apiData.moonrise && apiData.moonrise !== '--:--') {
                        moonTimes.rise = apiData.moonrise;
                    }
                    if (apiData.moonset && apiData.moonset !== '--:--') {
                        moonTimes.set = apiData.moonset;
                        // Track if moonset is tomorrow
                        if (apiData.moonset_is_tomorrow) {
                            moonTimes.setIsTomorrow = true;
                        }
                    }
                    // Track if moonrise is yesterday
                    if (apiData.moonrise_is_yesterday) {
                        moonTimes.riseIsYesterday = true;
                    }
                    // Override directions with API values
                    if (apiData.moonrise_direction) {
                        moonTimes.riseDirJp = apiData.moonrise_direction;
                    }
                    if (apiData.moonset_direction) {
                        moonTimes.setDirJp = apiData.moonset_direction;
                    }
                    // Use API moon age if available
                    if (apiData.moon_age !== null && apiData.moon_age !== undefined) {
                        document.getElementById('moonAge').textContent = apiData.moon_age.toFixed(1);
                    } else {
                        document.getElementById('moonAge').textContent = moonData.age.toFixed(1);
                    }
                    // Use API illumination if available
                    if (apiData.illumination !== null && apiData.illumination !== undefined) {
                        document.getElementById('moonIllumination').textContent = Math.round(apiData.illumination);
                    } else {
                        document.getElementById('moonIllumination').textContent = Math.round(moonData.illumination * 100);
                    }
                    console.log('[Moon] Using API data:', apiData.moonrise, '-', apiData.moonset,
                        'Dirs:', apiData.moonrise_direction, '-', apiData.moonset_direction,
                        'Illumination:', apiData.illumination + '%');
                } else {
                    document.getElementById('moonAge').textContent = moonData.age.toFixed(1);
                    document.getElementById('moonIllumination').textContent = Math.round(moonData.illumination * 100);
                }
            } catch (e) {
                console.log('[Moon] API data not available, using calculation:', e.message);
                document.getElementById('moonAge').textContent = moonData.age.toFixed(1);
                document.getElementById('moonIllumination').textContent = Math.round(moonData.illumination * 100);
            }

            // Cache moon times for real-time updates
            cachedMoonTimes = moonTimes;

            // Display phase info
            const moonIconEl = document.getElementById('moonIcon');
            const moonPhaseNameEl = document.getElementById('moonPhaseName');

            moonIconEl.textContent = moonData.emoji;

            // 満月の場合は特別な名前と色を表示
            const fullMoonNoticeEl = document.getElementById('fullMoonNotice');
            const fullMoonNoticeTextEl = document.getElementById('fullMoonNoticeText');
            const nextPhaseTextEl = document.getElementById('moonNextPhaseText');

            // Full moon names by month
            const fullMoonNames = {
                1: { name: 'ウルフムーン', color: '#a3c4dc' },
                2: { name: 'スノームーン', color: '#e8f4fc' },
                3: { name: 'ワームムーン', color: '#c9a87c' },
                4: { name: 'ピンクムーン', color: '#f8b4c4' },
                5: { name: 'フラワームーン', color: '#f0e68c' },
                6: { name: 'ストロベリームーン', color: '#ff9999' },
                7: { name: 'バックムーン', color: '#daa520' },
                8: { name: 'スタージョンムーン', color: '#87ceeb' },
                9: { name: 'ハーベストムーン', color: '#ff8c00' },
                10: { name: 'ハンターズムーン', color: '#cd5c5c' },
                11: { name: 'ビーバームーン', color: '#8b4513' },
                12: { name: 'コールドムーン', color: '#b0c4de' }
            };
            const month = now.getMonth() + 1;
            const moonInfo = fullMoonNames[month];

            // 満月の瞬間までの時間を計算
            const targetFullMoonAge = 14.765;
            const hoursToFullMoon = (targetFullMoonAge - moonData.age) * 24;
            const isFullMoonTonight = hoursToFullMoon > 0 && hoursToFullMoon <= 18;

            if (moonData.fullMoonName) {
                // 満月条件達成時: 月名にムーン名表示、バッジにムーン名とテーマカラー
                moonPhaseNameEl.innerHTML = `${moonData.phaseName}<br><span style="font-size: 0.85em; color: ${moonData.fullMoonColor};">🌟 ${moonData.fullMoonName}</span>`;
                moonIconEl.style.filter = `drop-shadow(0 0 12px ${moonData.fullMoonColor}) drop-shadow(0 0 24px ${moonData.fullMoonColor})`;
                moonIconEl.style.color = moonData.fullMoonColor;

                // バッジにムーン名とテーマカラー
                if (nextPhaseTextEl) {
                    nextPhaseTextEl.textContent = moonInfo.name;
                    nextPhaseTextEl.style.background = moonInfo.color;
                    nextPhaseTextEl.style.color = '#0f172a';
                    nextPhaseTextEl.style.textShadow = `0 0 8px ${moonInfo.color}`;
                }

                // 通知エリアは非表示
                if (fullMoonNoticeEl) fullMoonNoticeEl.style.display = 'none';
            } else {
                moonPhaseNameEl.textContent = moonData.phaseName;
                moonIconEl.style.filter = '';
                moonIconEl.style.color = '';

                if (isFullMoonTonight) {
                    // 満月の日だが条件未達: 通知エリアに表示、バッジに「満月🌕」
                    if (fullMoonNoticeEl && fullMoonNoticeTextEl) {
                        fullMoonNoticeTextEl.innerHTML = `🌕 今夜は満月（<span style="color: ${moonInfo.color};">${moonInfo.name}</span>）が見られます`;
                        fullMoonNoticeEl.style.display = 'block';
                        fullMoonNoticeEl.style.borderColor = moonInfo.color;
                    }

                    // バッジに「満月🌕」
                    if (nextPhaseTextEl) {
                        nextPhaseTextEl.textContent = '満月🌕';
                        nextPhaseTextEl.style.background = '';
                        nextPhaseTextEl.style.color = '';
                        nextPhaseTextEl.style.textShadow = '';
                    }
                } else {
                    // 通常時: 通知非表示、バッジは後で設定される（次の満月まで◯日など）
                    if (fullMoonNoticeEl) fullMoonNoticeEl.style.display = 'none';
                    if (nextPhaseTextEl) {
                        nextPhaseTextEl.style.background = '';
                        nextPhaseTextEl.style.color = '';
                        nextPhaseTextEl.style.textShadow = '';
                    }
                }
            }

            // Display times in SVG
            const riseTimeEl = document.getElementById('moonRiseTimeSvg');
            const setTimeEl = document.getElementById('moonSetTimeSvg');
            if (riseTimeEl) riseTimeEl.textContent = moonTimes.rise || '--:--';
            if (setTimeEl) setTimeEl.textContent = moonTimes.set || '--:--';

            // Display rise/set directions from API or fallback
            const riseDirEl = document.getElementById('moonRiseDirSvg');
            const setDirEl = document.getElementById('moonSetDirSvg');
            // Show '--' if time is not available, otherwise use API direction or fallback
            if (riseDirEl) {
                riseDirEl.textContent = (moonTimes.rise === '--:--') ? '--' : (moonTimes.riseDirJp || '東');
            }
            if (setDirEl) {
                setDirEl.textContent = (moonTimes.set === '--:--') ? '--' : (moonTimes.setDirJp || '西');
            }

            // Display current position info in SVG (only when above horizon)
            const currentInfoEl = document.getElementById('moonCurrentInfoSvg');
            if (currentInfoEl) {
                if (moonPos.altitude > 0) {
                    currentInfoEl.textContent = `${getJapaneseCompassDirection(moonPos.azimuth)} ${Math.round(moonPos.altitude)}°`;
                } else {
                    currentInfoEl.textContent = '';
                }
            }

            // Calculate next full moon (バッジが未設定の場合のみ)
            const synodic = 29.53058867;
            const daysToFull = (14.77 - moonData.age + synodic) % synodic;
            // 満月の場合やisFullMoonTonightの場合は上で設定済みなので、それ以外の時だけ設定
            if (nextPhaseTextEl && !moonData.fullMoonName && !isFullMoonTonight) {
                if (daysToFull < 1) {
                    nextPhaseTextEl.textContent = '満月 🌕';
                } else if (moonData.age < 14.77) {
                    nextPhaseTextEl.textContent = `満月まで${Math.round(daysToFull)}日`;
                } else {
                    const daysToNew = synodic - moonData.age;
                    nextPhaseTextEl.textContent = `新月まで${Math.round(daysToNew)}日`;
                }
            }

            // Update arc position (pass current time for time-based positioning)
            updateMoonArcPosition(moonPos, moonTimes, now);

            // Start real-time position updates (every 1 minute)
            startMoonPositionTimer();
        }

        // Real-time moon position update (every 1 minute)
        function startMoonPositionTimer() {
            // Clear any existing interval
            if (moonPositionInterval) {
                clearInterval(moonPositionInterval);
            }

            const LAT = 35.7785;
            const LON = 139.878;

            // Update every 60 seconds
            moonPositionInterval = setInterval(() => {
                if (!cachedMoonTimes) return;

                const now = new Date();
                const moonPos = calculateMoonPosition(now, LAT, LON);

                // Update arc position
                updateMoonArcPosition(moonPos, cachedMoonTimes, now);

                // Update current position text
                const currentInfoEl = document.getElementById('moonCurrentInfoSvg');
                if (currentInfoEl) {
                    if (moonPos.altitude > 0) {
                        currentInfoEl.textContent = `${getJapaneseCompassDirection(moonPos.azimuth)} ${Math.round(moonPos.altitude)}°`;
                    } else {
                        currentInfoEl.textContent = '';
                    }
                }

                console.log('[Moon] Position updated:',
                    'Alt:', moonPos.altitude.toFixed(1) + '°',
                    'Az:', moonPos.azimuth.toFixed(1) + '°',
                    'Dir:', getJapaneseCompassDirection(moonPos.azimuth));

                // リアルタイムで月齢・輝面率も更新
                const moonPhaseNow = calculateMoonPhase(now);
                document.getElementById('moonAge').textContent = moonPhaseNow.age.toFixed(1);
                document.getElementById('moonIllumination').textContent = Math.round(moonPhaseNow.illumination * 100);
            }, 60000); // 60 seconds

            console.log('[Moon] Real-time position updates started (60s interval)');
        }

        function calculateMoonPhase(date) {
            // Reference new moon: Jan 6, 2000 18:14 UTC
            const refNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
            const synodic = 29.53058867; // Synodic month in days

            const daysSinceRef = (date - refNewMoon) / (1000 * 60 * 60 * 24);
            const age = daysSinceRef % synodic;
            const normalizedAge = age < 0 ? age + synodic : age;

            // Phase (0-1)
            const phase = normalizedAge / synodic;

            // Illumination (simplified)
            const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;

            // Phase name and emoji
            let phaseName, emoji, fullMoonName = null, fullMoonColor = null;

            // Full moon names by month with themed colors
            const fullMoonNames = {
                1: { name: 'ウルフムーン', nameEn: 'Wolf Moon', color: '#a3c4dc' },      // 冬の青白い月
                2: { name: 'スノームーン', nameEn: 'Snow Moon', color: '#e8f4fc' },      // 雪のような純白
                3: { name: 'ワームムーン', nameEn: 'Worm Moon', color: '#c9a87c' },      // 土の温かみ
                4: { name: 'ピンクムーン', nameEn: 'Pink Moon', color: '#f8b4c4' },      // 桜のピンク
                5: { name: 'フラワームーン', nameEn: 'Flower Moon', color: '#f0e68c' },  // 花の黄色
                6: { name: 'ストロベリームーン', nameEn: 'Strawberry Moon', color: '#ff9999' }, // イチゴ色
                7: { name: 'バックムーン', nameEn: 'Buck Moon', color: '#daa520' },      // 鹿の角のゴールド
                8: { name: 'スタージョンムーン', nameEn: 'Sturgeon Moon', color: '#87ceeb' }, // 湖の青
                9: { name: 'ハーベストムーン', nameEn: 'Harvest Moon', color: '#ff8c00' }, // 収穫のオレンジ
                10: { name: 'ハンターズムーン', nameEn: "Hunter's Moon", color: '#cd5c5c' }, // 狩りの赤茶
                11: { name: 'ビーバームーン', nameEn: 'Beaver Moon', color: '#8b4513' },  // ビーバーの茶色
                12: { name: 'コールドムーン', nameEn: 'Cold Moon', color: '#b0c4de' }     // 冷たい青灰色
            };

            // 月齢に基づく伝統的な和名（全30日分）
            const moonAge = Math.floor(normalizedAge);

            if (normalizedAge < 0.5) {
                phaseName = '新月（朔）';
                emoji = '🌑';
            } else if (normalizedAge < 1.5) {
                phaseName = '二日月（繊月）';
                emoji = '🌑';
            } else if (normalizedAge < 2.5) {
                phaseName = '三日月';
                emoji = '🌒';
            } else if (normalizedAge < 6.5) {
                phaseName = `${moonAge + 1}日月`;
                emoji = '🌒';
            } else if (normalizedAge < 7.5) {
                phaseName = '上弦の月';
                emoji = '🌓';
            } else if (normalizedAge < 9.5) {
                phaseName = `${moonAge + 1}日月`;
                emoji = '🌓';
            } else if (normalizedAge < 10.5) {
                phaseName = '十日夜';
                emoji = '🌔';
            } else if (normalizedAge < 12.5) {
                phaseName = `${moonAge + 1 === 12 ? '十二' : moonAge + 1}日月`;
                emoji = '🌔';
            } else if (normalizedAge < 13.5) {
                phaseName = '十三夜';
                emoji = '🌔';
            } else if (normalizedAge < 14.5) {
                phaseName = '小望月（待宵月）';
                emoji = '🌔';
            } else if (normalizedAge < 16.0 || illumination >= 0.98) {
                // 満月の場合、月ごとの名前と色を取得
                const currentMonth = date.getMonth() + 1;
                const moonInfo = fullMoonNames[currentMonth];
                phaseName = '満月（望月）';
                emoji = '🌕';
                fullMoonName = moonInfo.name;
                fullMoonColor = moonInfo.color;
            } else if (normalizedAge < 17.0) {
                phaseName = '十六夜（いざよい）';
                emoji = '🌕';
            } else if (normalizedAge < 18.0) {
                phaseName = '立待月';
                emoji = '🌖';
            } else if (normalizedAge < 19.0) {
                phaseName = '居待月';
                emoji = '🌖';
            } else if (normalizedAge < 20.0) {
                phaseName = '寝待月（臥待月）';
                emoji = '🌖';
            } else if (normalizedAge < 21.0) {
                phaseName = '更待月';
                emoji = '🌖';
            } else if (normalizedAge < 22.5) {
                phaseName = '下弦の月';
                emoji = '🌗';
            } else if (normalizedAge < 23.5) {
                phaseName = '二十三夜';
                emoji = '🌗';
            } else if (normalizedAge < 25.5) {
                phaseName = `二十${moonAge - 18}日月`;
                emoji = '🌘';
            } else if (normalizedAge < 26.5) {
                phaseName = '二十六夜';
                emoji = '🌘';
            } else if (normalizedAge < 29.5) {
                phaseName = '晦日月（三十日月）';
                emoji = '🌘';
            } else {
                phaseName = '新月（朔）';
                emoji = '🌑';
            }

            return { age: normalizedAge, phase, illumination, phaseName, emoji, fullMoonName, fullMoonColor };
        }

        function calculateMoonPosition(date, lat, lon) {
            const jd = getJulianDate(date);
            const T = (jd - 2451545.0) / 36525;

            // Moon's mean elements (simplified)
            const L = (218.3164477 + 481267.88123421 * T) % 360;
            const M = (134.9633964 + 477198.8675055 * T) % 360;
            const F = (93.2720950 + 483202.0175233 * T) % 360;

            // Approximate Right Ascension and Declination
            const Lrad = L * Math.PI / 180;
            const Mrad = M * Math.PI / 180;
            const Frad = F * Math.PI / 180;

            // Simplified ecliptic longitude
            let lambda = L + 6.29 * Math.sin(Mrad);
            lambda = lambda % 360;
            const lambdaRad = lambda * Math.PI / 180;

            // Approximate declination
            const epsilon = 23.439 - 0.00000036 * T;
            const epsilonRad = epsilon * Math.PI / 180;

            const dec = Math.asin(Math.sin(epsilonRad) * Math.sin(lambdaRad)) * 180 / Math.PI;
            const ra = Math.atan2(Math.cos(epsilonRad) * Math.sin(lambdaRad), Math.cos(lambdaRad)) * 180 / Math.PI;

            // Local Sidereal Time
            // Use UTC hours/minutes for Sidereal Time calculation
            const LST = (100.46 + 0.985647 * (jd - 2451545.0) + lon + date.getUTCHours() * 15 + date.getUTCMinutes() * 0.25) % 360;

            // Hour angle
            let HA = LST - ra;
            if (HA < 0) HA += 360;
            const HARad = HA * Math.PI / 180;
            const latRad = lat * Math.PI / 180;
            const decRad = dec * Math.PI / 180;

            // Altitude
            const altitude = Math.asin(
                Math.sin(latRad) * Math.sin(decRad) +
                Math.cos(latRad) * Math.cos(decRad) * Math.cos(HARad)
            ) * 180 / Math.PI;

            // Azimuth
            let azimuth = Math.atan2(
                Math.sin(HARad),
                Math.cos(HARad) * Math.sin(latRad) - Math.tan(decRad) * Math.cos(latRad)
            ) * 180 / Math.PI + 180;

            // Approximate max altitude for today
            const maxAltitude = 90 - lat + dec;

            return { altitude, azimuth: azimuth % 360, maxAltitude: Math.min(90, Math.max(0, maxAltitude)) };
        }

        function calculateMoonTimes(date, lat, lon) {
            // High-precision simulation to match calculatingMoonPosition
            // Iterate from 00:00 to 24:00 to find horizon crossings
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);

            let rise = null;
            let set = null;
            let riseAzimuth = null;
            let setAzimuth = null;

            let prevPos = calculateMoonPosition(dayStart, lat, lon);

            // 1-minute intervals (1440 steps) for maximum precision
            for (let i = 1; i <= 1440; i++) {
                const t = new Date(dayStart.getTime() + i * 60 * 1000);
                const currPos = calculateMoonPosition(t, lat, lon);

                // Apply approximate Parallax correction (-0.95 deg)
                // Geocentric altitude is ~1 deg higher than Topocentric (observed) altitude at horizon.
                // Subtracting this makes the moon lower, causing it to set earlier.
                const alt1 = prevPos.altitude - 0.95;
                const alt2 = currPos.altitude - 0.95;

                // Check Horizon Crossing
                if (alt1 < 0 && alt2 >= 0) {
                    // Moonrise
                    const fraction = (0 - alt1) / (alt2 - alt1);
                    const riseMs = t.getTime() - 60 * 1000 + fraction * 60 * 1000;
                    rise = new Date(riseMs);
                    riseAzimuth = prevPos.azimuth + (currPos.azimuth - prevPos.azimuth) * fraction;
                }
                if (alt1 >= 0 && alt2 < 0) {
                    // Moonset
                    const fraction = (0 - alt1) / (alt2 - alt1);
                    const setMs = t.getTime() - 60 * 1000 + fraction * 60 * 1000;
                    set = new Date(setMs);
                    setAzimuth = prevPos.azimuth + (currPos.azimuth - prevPos.azimuth) * fraction;
                }
                prevPos = currPos;
            }

            const formatHour = (d) => {
                if (!d) return '--:--';
                return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            };

            // Directions based on calculated azimuth if available
            const moonData = calculateMoonPhase(date);
            const age = moonData.age;

            // Fallback directions (simplified) if not found (e.g. not rising today)
            let riseDirJp = age < 14.77 ? '東南東' : '東北東';
            let setDirJp = age < 14.77 ? '西南西' : '西北西';

            if (riseAzimuth) riseDirJp = getJapaneseCompassDirection(riseAzimuth);
            if (setAzimuth) setDirJp = getJapaneseCompassDirection(setAzimuth);

            // Determine if moonset is tomorrow (moon rose today but doesn't set today)
            let setIsTomorrow = false;
            if (rise && !set) {
                // Moon rose today but doesn't set today - moonset is tomorrow
                setIsTomorrow = true;
            }

            return {
                rise: formatHour(rise),
                set: formatHour(set),
                riseDirJp,
                setDirJp,
                setIsTomorrow,
                riseDate: rise,
                setDate: set
            };
        }

        function getJulianDate(date) {
            const y = date.getUTCFullYear();
            const m = date.getUTCMonth() + 1;
            const d = date.getUTCDate() + date.getUTCHours() / 24 + date.getUTCMinutes() / 1440;

            let Y = y, M = m;
            if (M <= 2) { Y -= 1; M += 12; }

            const A = Math.floor(Y / 100);
            const B = 2 - A + Math.floor(A / 4);

            return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5;
        }

        function getCompassDirection(azimuth) {
            const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
            const idx = Math.round(azimuth / 22.5) % 16;
            return directions[idx];
        }

        function getJapaneseCompassDirection(azimuth) {
            const directions = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
            const idx = Math.round(azimuth / 22.5) % 16;
            return directions[idx];
        }



        function updateMoonArcPosition(moonPos, moonTimes, currentTime) {
            const moonCircle = document.getElementById('moonPosition');
            const moonGlow = document.getElementById('moonGlowCircle');
            const moonInfoGroup = document.getElementById('moonCurrentInfoGroup');
            const moonInfoText = document.getElementById('moonCurrentInfoSvg');
            const moonInfoBg = document.getElementById('moonInfoBg');
            if (!moonCircle) return;

            // Parse rise and set times to get hours as decimal
            const parseTime = (timeStr) => {
                if (!timeStr || timeStr === '--:--') return null;
                // Remove '翌' (tomorrow) or '前日' (yesterday) prefix if present
                let cleanTime = timeStr.replace(/^(翌|前日)/, '');
                const match = cleanTime.match(/(\d+):(\d+)/);
                if (!match) return null;
                const h = parseInt(match[1], 10);
                const m = parseInt(match[2], 10);
                return h + m / 60;
            };

            const riseHour = parseTime(moonTimes.rise);
            const setHour = parseTime(moonTimes.set);
            const currentHour = currentTime.getHours() + currentTime.getMinutes() / 60;

            // Calculate t based on TIME, not azimuth
            // Rise = 0%, Transit (midpoint) = 50%, Set = 100%
            let t = 0.5; // Default to center if no times available
            let isVisible = false;

            // Case 1: Both rise and set times available today
            if (riseHour !== null && setHour !== null && !moonTimes.setIsTomorrow) {
                if (currentHour >= riseHour && currentHour <= setHour) {
                    // Moon is above horizon
                    const duration = setHour - riseHour;
                    t = duration > 0 ? (currentHour - riseHour) / duration : 0.5;
                    isVisible = true;
                } else if (currentHour < riseHour) {
                    // Before moonrise
                    t = 0;
                    isVisible = false;
                } else {
                    // After moonset
                    t = 1;
                    isVisible = false;
                }
            }
            // Case 2: Moonset is tomorrow (moon rises today, sets tomorrow morning)
            else if (riseHour !== null && (moonTimes.setIsTomorrow || setHour === null)) {
                // 深夜0時を過ぎた場合の処理を追加
                // 例: 月の出15:00、月の入り翌5:00 → 深夜1時は可視
                if (currentHour >= riseHour) {
                    // After moonrise today - moon is visible
                    isVisible = true;
                    const hoursSinceRise = currentHour - riseHour;
                    t = Math.min(0.9, hoursSinceRise / 12);
                } else if (moonTimes.setIsTomorrow && setHour !== null && currentHour <= setHour) {
                    // 深夜0時〜月の入りまでの時間帯（日付をまたいだ後）
                    // 月は昨日の午後に出て、今朝沈む → まだ可視
                    isVisible = true;
                    // 月の出から現在まで: (24 - riseHour) + currentHour 時間
                    const hoursSinceRise = (24 - riseHour) + currentHour;
                    const totalDuration = (24 - riseHour) + setHour;
                    t = Math.min(0.95, hoursSinceRise / totalDuration);
                } else if (currentHour < riseHour && (!moonTimes.setIsTomorrow || setHour === null)) {
                    // Before moonrise today (and no tomorrow set data)
                    t = 0;
                    isVisible = false;
                } else {
                    // After moonset tomorrow
                    t = 1;
                    isVisible = false;
                }
            }
            // Case 3: No rise today but maybe set (moon rose yesterday, sets today)
            else if (riseHour === null && setHour !== null) {
                if (currentHour <= setHour) {
                    // Moon is still up from yesterday
                    isVisible = true;
                    t = 0.5 + (currentHour / setHour) * 0.5; // Approaching set
                } else {
                    // After moonset
                    t = 1;
                    isVisible = false;
                }
            }
            // Case 4: No data for either - use altitude calculation as fallback
            else {
                isVisible = moonPos.altitude > 0;
                t = 0.5;
            }

            // Clamp t for position calculation
            const clampedT = Math.max(0, Math.min(1, t));

            // New SVG Coordinates (viewBox 0 0 340 200)
            // Start: 40,150 | Control: 170,-20 | End: 300,150
            const P0 = { x: 40, y: 150 };
            const P1 = { x: 170, y: -20 };
            const P2 = { x: 300, y: 150 };

            // Quadratic bezier calculation
            const mt = 1 - clampedT;
            const x = mt * mt * P0.x + 2 * mt * clampedT * P1.x + clampedT * clampedT * P2.x;
            const y = mt * mt * P0.y + 2 * mt * clampedT * P1.y + clampedT * clampedT * P2.y;

            // Set Position - if below horizon, place at horizon level
            const finalY = isVisible ? y : 160; // Below horizon line (150)
            const opacity = isVisible ? 1 : 0.4;
            const fillColor = isVisible ? '#fbbf24' : '#94a3b8'; // Yellow if visible, gray if not

            moonCircle.setAttribute('cx', x);
            moonCircle.setAttribute('cy', finalY);
            moonCircle.setAttribute('fill', fillColor);
            moonCircle.style.opacity = opacity;

            if (moonGlow) {
                moonGlow.setAttribute('cx', x);
                moonGlow.setAttribute('cy', finalY);
                moonGlow.style.opacity = isVisible ? 1 : 0;
            }

            // Update Info Label
            if (moonInfoGroup && moonInfoText && moonInfoBg) {
                if (isVisible) {
                    // Update text with current position
                    const altText = `${Math.round(moonPos.altitude)}°`;
                    const dirText = getJapaneseCompassDirection(moonPos.azimuth);
                    moonInfoText.textContent = `${dirText} ${altText}`;
                    moonInfoBg.setAttribute('fill', 'rgba(15,23,42,0.8)');
                    moonInfoText.setAttribute('fill', '#fbbf24');

                    // Update box size based on text length (approx)
                    const textWidth = 80;
                    moonInfoBg.setAttribute('width', textWidth);
                    moonInfoBg.setAttribute('x', -textWidth / 2);
                    moonInfoBg.setAttribute('y', -10);

                    // Position group: Above the moon marker
                    const labelY = y - 25;
                    const safeLabelY = Math.max(20, labelY); // Don't go off top

                    moonInfoGroup.setAttribute('transform', `translate(${x}, ${safeLabelY})`);
                    moonInfoGroup.setAttribute('opacity', 1);
                } else {
                    // Show "地平線下" when moon is below horizon
                    moonInfoText.textContent = '地平線下';
                    moonInfoBg.setAttribute('fill', 'rgba(30,41,59,0.9)');
                    moonInfoText.setAttribute('fill', '#94a3b8');

                    const textWidth = 70;
                    moonInfoBg.setAttribute('width', textWidth);
                    moonInfoBg.setAttribute('x', -textWidth / 2);
                    moonInfoBg.setAttribute('y', -10);

                    // Position below horizon line
                    moonInfoGroup.setAttribute('transform', `translate(${x}, 175)`);
                    moonInfoGroup.setAttribute('opacity', 0.8);
                }
            }
        }

        // Call moon data on load
        document.addEventListener('DOMContentLoaded', loadMoonData);

        // Simple markdown to HTML converter
        function simpleMarkdownToHtml(text) {
            if (!text) return '';

            let html = text
                // Escape HTML first
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                // Bold: **text** or __text__
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/__(.+?)__/g, '<strong>$1</strong>')
                // Italic: *text* or _text_
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/_(.+?)_/g, '<em>$1</em>')
                // Bullet points: - item
                .replace(/^- (.+)$/gm, '<li>$1</li>')
                // Numbered lists: 1. item
                .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
                // Line breaks
                .replace(/\n/g, '<br>');

            // Wrap consecutive <li> in <ul>
            html = html.replace(/(<li>.*?<\/li>(<br>)?)+/g, match => {
                const items = match.replace(/<br>/g, '');
                return '<ul style="margin: 8px 0; padding-left: 20px;">' + items + '</ul>';
            });

            return html;
        }

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
        // 出典: 気象庁「防災情報XMLフォーマット コード管理表」
        const JMA_WARNING_NAMES = {
            // === 気象警報・注意報・特別警報 ===
            // 特別警報 (32-38)
            '32': '暴風雪特別警報', '33': '大雨特別警報', '35': '暴風特別警報',
            '36': '大雪特別警報', '37': '波浪特別警報', '38': '高潮特別警報',
            // 警報 (02-08)
            '02': '暴風雪警報', '03': '大雨警報', '04': '洪水警報',
            '05': '暴風警報', '06': '大雪警報', '07': '波浪警報', '08': '高潮警報',
            // 注意報 (10-26)
            '10': '大雨注意報', '12': '大雪注意報', '13': '風雪注意報',
            '14': '雷注意報', '15': '強風注意報', '16': '波浪注意報',
            '17': '融雪注意報', '18': '洪水注意報', '19': '高潮注意報',
            '20': '濃霧注意報', '21': '乾燥注意報', '22': 'なだれ注意報',
            '23': '低温注意報', '24': '霜注意報', '25': '着氷注意報',
            '26': '着雪注意報',
            // === 津波警報・注意報 ===
            '50': '津波警報解除', '51': '津波警報', '52': '大津波警報', '53': '大津波警報',
            '60': '津波注意報解除', '62': '津波注意報',
            '71': '津波予報', '72': '津波予報', '73': '津波予報',
            // === 解除 ===
            '00': '解除'
        };

        // Fetch JMA weather alerts for Tokyo (Katsushika = 23区東部)
        async function fetchAlerts() {
            try {
                // JMA Warning API for Tokyo (130000)
                const response = await fetch('https://www.jma.go.jp/bosai/warning/data/warning/130000.json');
                const data = await response.json();

                // 発表時刻を取得
                const reportTime = data.reportDatetime || null;

                // Find Katsushika area (code 1312200) or 23区東部 (code 130014)
                const areaWarnings = [];
                if (data.areaTypes) {
                    for (const areaType of data.areaTypes) {
                        for (const area of (areaType.areas || [])) {
                            // 23区東部 or 葛飾区
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
                // Hide alert banner on error
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

            // Categorize alerts by priority
            const specialWarnings = alerts.filter(a => a.name?.includes('特別警報'));
            const warnings = alerts.filter(a => a.name?.includes('警報') && !a.name?.includes('特別'));
            const advisories = alerts.filter(a => a.name?.includes('注意報'));

            // Build display text showing ALL alerts in priority order
            const alertParts = [];
            if (specialWarnings.length > 0) {
                alertParts.push(specialWarnings.map(a => a.name).join('・'));
            }
            if (warnings.length > 0) {
                alertParts.push(warnings.map(a => a.name).join('・'));
            }
            if (advisories.length > 0) {
                alertParts.push(advisories.map(a => a.name).join('・'));
            }

            // Determine banner style by highest priority
            let className, icon;
            if (specialWarnings.length > 0) {
                className = 'alert-special';
                icon = '🚨';
            } else if (warnings.length > 0) {
                className = 'alert-severe';
                icon = '⚠️';
            } else {
                className = 'alert-warning';
                icon = '🔔';
            }

            // Format report time
            let timeStr = '';
            if (reportTime) {
                const dt = new Date(reportTime);
                timeStr = ` (${dt.getHours()}:${dt.getMinutes().toString().padStart(2, '0')}発表)`;
            }

            alertText.textContent = `葛飾区: ${alertParts.join(' / ')}${timeStr}`;
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

        // Update temperature-based theme
        function updateTempTheme(temp) {
            // Map temperature to hue: cold (200 blue) to hot (0 red), comfortable = 80 (yellow-green)
            let hue;
            if (temp <= 0) hue = 200;      // Blue
            else if (temp <= 10) hue = 180; // Cyan
            else if (temp <= 18) hue = 120; // Green
            else if (temp <= 25) hue = 60;  // Yellow
            else if (temp <= 30) hue = 30;  // Orange
            else hue = 0;                   // Red

            document.documentElement.style.setProperty('--temp-hue', hue);
        }

        function updateUI() {
            if (!summaryData.currentTemp) return;

            const temp = summaryData.currentTemp;

            if (window.animateNumber) {
                window.animateNumber('currentTemp', temp.toFixed(1));
                window.animateNumber('currentHumidity', Math.round(summaryData.currentHumidity));
                window.animateNumber('todayHigh', summaryData.todayHigh.toFixed(1));
                window.animateNumber('todayLow', summaryData.todayLow.toFixed(1));
                window.animateNumber('yearHigh', summaryData.yearHigh.toFixed(1));
                window.animateNumber('yearLow', summaryData.yearLow.toFixed(1));
            } else {
                document.getElementById('currentTemp').textContent = temp.toFixed(1);
                document.getElementById('currentHumidity').textContent = Math.round(summaryData.currentHumidity);
                document.getElementById('todayHigh').textContent = summaryData.todayHigh.toFixed(1);
                document.getElementById('todayLow').textContent = summaryData.todayLow.toFixed(1);
                document.getElementById('yearHigh').textContent = summaryData.yearHigh.toFixed(1);
                document.getElementById('yearLow').textContent = summaryData.yearLow.toFixed(1);
            }
            if (summaryData.dataCount) document.getElementById('dataCount').textContent = summaryData.dataCount.toLocaleString() + ' 件';

            // Update feels-like temperature (always use custom calculation with 3-zone physics model)
            const feelsLikeEl = document.getElementById('feelsLike');
            // Wind speed from Open-Meteo (10m height), will be adjusted to 0.6x inside calculateFeelsLike
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
            updateWeatherEffects(weatherData?.weatherCode || 0, new Date().getHours());
        }

        // Switch background effects based on weather code and time
        function updateWeatherEffects(code, hour) {
            // Reset all effects
            document.querySelectorAll('.weather-effects > div').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.weather-effects > div').forEach(el => el.style.opacity = '0');

            const isDay = hour >= 6 && hour < 18;
            let activeEffectId = null;

            // Simple mapping
            // Rain: 51-67, 80-82, 95-99
            if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) {
                activeEffectId = 'effectRain';
            }
            // Snow: 71-77, 85-86
            else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
                activeEffectId = 'effectSnow';
            }
            // Cloudy/Fog: 45, 48
            else if (code === 45 || code === 48) {
                activeEffectId = 'effectClouds';
            }
            // Sunny/Clear: 0, 1 -> Sun (day) or Stars (night)
            else if (code === 0 || code === 1) {
                activeEffectId = isDay ? 'effectSun' : 'effectStars';
            }
            // Partly cloudy: 2, 3 -> Clouds
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
        // Wind speed adjustment: API provides 10m height, adjust to 2m (~0.6x)
        // Uses Tetens formula for vapor pressure, Steadman for intermediate range
        // Low wind correction: when wind < 1.3 m/s, blend result with raw temp
        function calculateFeelsLike(temp, humidity, windSpeed) {
            // Adjust wind speed from 10m to 2m height
            const v = Math.max(0, (windSpeed || 0) * 0.6);

            // Minimum wind threshold - below this, wind effect is linearly reduced
            const MIN_WIND_THRESHOLD = 1.3;

            // Calculate vapor pressure using Tetens formula (hPa)
            const e = 6.11 * Math.pow(10, (7.5 * temp) / (temp + 237.3)) * (humidity / 100);

            // Wind Chill (Linke formula for cold conditions)
            const windChill = (temp, v) => {
                if (v <= 0) return temp;
                return 13.12 + 0.6215 * temp - 11.37 * Math.pow(v * 3.6, 0.16) + 0.3965 * temp * Math.pow(v * 3.6, 0.16);
            };

            // Steadman's Apparent Temperature (for intermediate range)
            const steadman = (temp, e, v) => {
                return temp + 0.33 * e - 0.70 * v - 4.0;
            };

            // Heat Index (for hot conditions)
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
                // Pure wind chill zone
                rawResult = windChill(temp, v);
            } else if (temp <= 12) {
                // Transition: wind chill → Steadman
                const wc = windChill(temp, v);
                const st = steadman(temp, e, v);
                const t = (temp - 8) / 4; // 0 at 8°C, 1 at 12°C
                rawResult = lerp(wc, st, t);
            } else if (temp <= 25) {
                // Pure Steadman zone
                rawResult = steadman(temp, e, v);
            } else if (temp <= 29) {
                // Transition: Steadman → Heat Index
                const st = steadman(temp, e, v);
                const hi = heatIndex(temp, humidity);
                const t = (temp - 25) / 4; // 0 at 25°C, 1 at 29°C
                rawResult = lerp(st, hi, t);
            } else {
                // Pure heat index zone
                rawResult = heatIndex(temp, humidity);
            }

            // Low wind correction: below MIN_WIND_THRESHOLD, blend with raw temperature
            if (v < MIN_WIND_THRESHOLD) {
                const windFactor = v / MIN_WIND_THRESHOLD; // 0 to 1 range
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

        function updateCharts() { updateChart24h(); updateChartWeek(); updateChartMonthly(); updateChartYearly(); }

        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            // Optimized interaction for mobile touch
            interaction: {
                intersect: false,
                mode: 'index',
                axis: 'x'  // Only detect on x-axis for smoother sliding
            },
            // Smooth animations for mobile
            animation: {
                duration: 150
            },
            hover: {
                animationDuration: 0,
                mode: 'index',
                intersect: false
            },
            // Reduce redraws on resize
            resizeDelay: 100,
            // Layout padding for touch
            layout: {
                padding: { left: 5, right: 10, top: 5, bottom: 5 }
            },
            // Dataset element animations
            elements: {
                point: {
                    radius: 0,  // Hide points for cleaner look
                    hoverRadius: 5,
                    hitRadius: 10  // Larger hit area for touch
                },
                line: {
                    tension: 0.3  // Smooth curves
                }
            },
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { size: 11, weight: '500' }, usePointStyle: true, padding: 20 } },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(99, 102, 241, 0.4)',
                    borderWidth: 1,
                    padding: 14,
                    cornerRadius: 12,
                    displayColors: true,
                    titleFont: { weight: '600' },
                    // Smooth tooltip transitions
                    animation: {
                        duration: 80,
                        easing: 'easeOutQuart'
                    },
                    // Tooltip stays put on touch devices
                    position: 'nearest',
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                const unit = label.includes('湿度') ? '%' : '°C';
                                label += context.parsed.y.toFixed(1) + unit;
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(148, 163, 184, 0.06)' }, ticks: { color: '#64748b', font: { size: 10 }, maxRotation: 45 } },
                y: { grid: { color: 'rgba(148, 163, 184, 0.06)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: function (value) { return value + '°C'; } } }
            }
        };

        const crosshairPlugin = {
            id: 'crosshair',
            afterDraw: (chart) => {
                if (chart.tooltip?._active?.length) {
                    const ctx = chart.ctx;
                    const x = chart.tooltip._active[0].element.x;
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(x, chart.chartArea.top);
                    ctx.lineTo(x, chart.chartArea.bottom);
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
                    ctx.setLineDash([4, 4]);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        };

        function updateChart24h() {
            // Use weeklyData if available, otherwise fall back to recentData
            const sourceData = weeklyData.length > 0 ? weeklyData : recentData;
            if (!sourceData.length) return;

            const now = Date.now();
            const cutoff24h = new Date(now - 24 * 60 * 60 * 1000);  // 24h ago
            const cutoff48h = new Date(now - 48 * 60 * 60 * 1000);  // 48h ago (for yesterday comparison)

            // Use only 48h of data (no zoom/pan needed)
            let chartData = sourceData.filter(d => d.date >= cutoff48h);

            // Sort by date
            chartData.sort((a, b) => a.date - b.date);

            // Prepare data for Chart.js with time scale
            const tempData = chartData.map(d => ({ x: d.date, y: d.temperature }));
            const humidData = chartData.map(d => ({ x: d.date, y: d.humidity }));

            // Create "yesterday comparison" data by shifting each point +24h
            const yesterdayData = chartData
                .filter(d => d.date < cutoff24h)
                .map(d => ({
                    x: new Date(d.date.getTime() + 24 * 60 * 60 * 1000),  // Shift +24h
                    y: d.temperature
                }));

            // Detect mobile screen
            const isMobile = window.innerWidth <= 600;
            const tickFontSize = isMobile ? 8 : 10;
            const showAxisTitle = !isMobile;

            const ctx = document.getElementById('chart24h').getContext('2d');
            if (charts.chart24h) charts.chart24h.destroy();
            charts.chart24h = new Chart(ctx, {
                type: 'line',
                plugins: [crosshairPlugin],
                data: {
                    datasets: [
                        {
                            label: '気温',
                            data: tempData,
                            borderColor: '#fb923c',
                            backgroundColor: 'rgba(251, 146, 60, 0.05)',
                            fill: false,
                            tension: 0.4,
                            borderWidth: 3,
                            pointRadius: 0,
                            pointHoverRadius: 6,
                            yAxisID: 'y',
                            order: 1
                        },
                        {
                            label: '前日の気温',
                            data: yesterdayData,
                            borderColor: '#94a3b8',
                            borderDash: [4, 4],
                            backgroundColor: 'transparent',
                            fill: false,
                            tension: 0.4,
                            borderWidth: 1.5,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            yAxisID: 'y',
                            order: 2,
                            spanGaps: true
                        },
                        {
                            label: '湿度',
                            data: humidData,
                            borderColor: 'transparent',
                            backgroundColor: 'rgba(34, 211, 238, 0.12)',
                            fill: true,
                            tension: 0.4,
                            borderWidth: 0,
                            pointRadius: 0,
                            pointHoverRadius: 0,
                            yAxisID: 'y1',
                            order: 3
                        }
                    ]
                },
                options: {
                    ...baseOptions,
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'hour',
                                displayFormats: {
                                    hour: 'M/d H時',
                                    day: 'M/d'
                                },
                                tooltipFormat: 'M/d H:mm'
                            },
                            min: cutoff24h,  // Initial view: last 24 hours
                            max: new Date(now),
                            ticks: {
                                color: '#94a3b8',
                                font: { size: tickFontSize },
                                maxTicksLimit: isMobile ? 6 : 12,
                                maxRotation: 0
                            },
                            grid: { color: 'rgba(148, 163, 184, 0.06)' }
                        },
                        y: {
                            grid: { color: 'rgba(148, 163, 184, 0.06)' },
                            position: 'left',
                            title: { display: showAxisTitle, text: '°C', color: '#fb923c', font: { size: 11, weight: '600' } },
                            ticks: {
                                color: '#fb923c',
                                font: { size: tickFontSize },
                                callback: function (value) { return value + '°'; }
                            }
                        },
                        y1: {
                            grid: { drawOnChartArea: false },
                            position: 'right',
                            title: { display: showAxisTitle, text: '%', color: '#22d3ee', font: { size: 11, weight: '600' } },
                            ticks: {
                                color: '#22d3ee',
                                font: { size: tickFontSize },
                                callback: function (value) { return value + '%'; }
                            }
                        }
                    },
                    plugins: {
                        ...baseOptions.plugins,
                        tooltip: {
                            ...baseOptions.plugins.tooltip,
                            // Only trigger tooltip from 気温 (today's data)
                            filter: function (tooltipItem) {
                                return tooltipItem.dataset.label === '気温' || tooltipItem.dataset.label === '湿度';
                            },
                            callbacks: {
                                ...baseOptions.plugins.tooltip.callbacks,
                                label: function (context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    if (context.parsed.y !== null && context.parsed.y !== undefined) {
                                        const unit = label.includes('湿度') ? '%' : '°C';
                                        label += context.parsed.y.toFixed(1) + unit;
                                    }
                                    return label;
                                },
                                afterBody: function (tooltipItems) {
                                    if (!tooltipItems.length) return '';

                                    // hoveredTime is milliseconds timestamp from parsed.x
                                    const hoveredTime = tooltipItems[0].parsed.x;

                                    // Find corresponding yesterday's temp from yesterdayData
                                    // yesterdayData has {x: Date, y: temperature}
                                    const yesterdayPoint = yesterdayData.find(d => {
                                        const dataTime = d.x.getTime ? d.x.getTime() : d.x;
                                        return Math.abs(dataTime - hoveredTime) < 2 * 60 * 1000;  // 2min tolerance
                                    });

                                    if (yesterdayPoint) {
                                        return `■ 前日の気温: ${yesterdayPoint.y.toFixed(1)}°C`;
                                    }
                                    return '';
                                }
                            }
                        }
                    }
                }
            });
        }

        function updateChartWeek() {
            const sourceData = weeklyData.length > 0 ? weeklyData : recentData;
            if (!sourceData.length) return;
            const sampled = sourceData.filter((_, i) => i % 30 === 0);

            const ctx = document.getElementById('chartWeek').getContext('2d');
            if (charts.chartWeek) charts.chartWeek.destroy();
            charts.chartWeek = new Chart(ctx, {
                type: 'line',
                plugins: [crosshairPlugin],
                data: {
                    labels: sampled.map(d => {
                        const days = ['日', '月', '火', '水', '木', '金', '土'];
                        const date = d.date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
                        const day = days[d.date.getDay()];
                        const time = d.date.toLocaleTimeString('ja-JP', { hour: '2-digit' });
                        return `${date}(${day}) ${time}`;
                    }),
                    datasets: [{ label: '気温', data: sampled.map(d => d.temperature), borderColor: '#a78bfa', backgroundColor: 'rgba(167, 139, 250, 0.1)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5 }]
                },
                options: baseOptions
            });
        }

        function updateChartMonthly() {
            if (!dailyData.length) return;
            const monthly = {};
            dailyData.forEach(d => {
                const key = `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, '0')}`;
                if (!monthly[key]) monthly[key] = { temps: [], mins: [], date: new Date(d.date.getFullYear(), d.date.getMonth(), 1) };
                monthly[key].temps.push(d.max);
                monthly[key].mins.push(d.min);
            });
            const data = Object.values(monthly).map(m => ({ date: m.date, max: Math.max(...m.temps), min: Math.min(...m.mins) })).sort((a, b) => a.date - b.date);

            const ctx = document.getElementById('chartMonthly').getContext('2d');
            if (charts.chartMonthly) charts.chartMonthly.destroy();
            charts.chartMonthly = new Chart(ctx, {
                type: 'bar',
                plugins: [crosshairPlugin],
                data: {
                    labels: data.map(d => d.date.toLocaleDateString('ja-JP', { year: '2-digit', month: 'short' })),
                    datasets: [
                        { label: '最高', data: data.map(d => d.max), backgroundColor: 'rgba(248, 113, 113, 0.75)', borderColor: '#f87171', borderWidth: 0, borderRadius: 6 },
                        { label: '最低', data: data.map(d => d.min), backgroundColor: 'rgba(96, 165, 250, 0.75)', borderColor: '#60a5fa', borderWidth: 0, borderRadius: 6 }
                    ]
                },
                options: baseOptions
            });
        }

        function updateChartYearly() {
            if (!dailyData.length) return;
            const ctx = document.getElementById('chartYearly').getContext('2d');
            if (charts.chartYearly) charts.chartYearly.destroy();
            charts.chartYearly = new Chart(ctx, {
                type: 'line',
                plugins: [crosshairPlugin],
                data: {
                    labels: dailyData.map(d => {
                        const days = ['日', '月', '火', '水', '木', '金', '土'];
                        const year = d.date.getFullYear();
                        const date = d.date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
                        const day = days[d.date.getDay()];
                        return `${year}/${date}(${day})`;
                    }),
                    datasets: [
                        { label: '日最高', data: dailyData.map(d => d.max), borderColor: '#f87171', backgroundColor: 'rgba(248, 113, 113, 0.12)', fill: '+1', tension: 0.3, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 },
                        { label: '日最低', data: dailyData.map(d => d.min), borderColor: '#60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.08)', fill: false, tension: 0.3, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 }
                    ]
                },
                options: baseOptions
            });
        }

        function updateCountdown() {
            if (!nextUpdateTime) return;
            const remaining = Math.max(0, nextUpdateTime - Date.now());
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            document.getElementById('nextUpdate').textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
        }

        async function init() {
            await fetchAll();
            loadSunTimes(); // Load sunrise/sunset times
            nextUpdateTime = Date.now() + UPDATE_INTERVAL;
            setInterval(updateCountdown, 1000);
            setInterval(() => { fetchAll(); nextUpdateTime = Date.now() + UPDATE_INTERVAL; }, UPDATE_INTERVAL);

            // Fix chart resize issue - redraw charts completely on resize
            let resizeTimeout;
            window.addEventListener('resize', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => { updateCharts(); }, 250);
            });
        }

        // Toggle AI advisor expand/collapse
        function toggleAiAdvisor() {
            const textEl = document.getElementById('aiAdvisorText');
            const expandBtn = document.getElementById('aiAdvisorExpand');

            if (textEl.dataset.truncated === 'true') {
                // Expand to full text
                textEl.innerHTML = textEl.dataset.fullText;
                textEl.dataset.truncated = 'false';
                expandBtn.textContent = '閉じる';
            } else {
                // Collapse back
                const fullText = textEl.dataset.fullText;
                // Re-truncate (we need original plain text, but can approximate)
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = fullText;
                const plainText = tempDiv.textContent;

                let breakPoint = 150;
                while (breakPoint > 100 && plainText[breakPoint] !== ' ') {
                    breakPoint--;
                }
                const truncated = plainText.substring(0, breakPoint) + '...';
                textEl.innerHTML = truncated;
                textEl.dataset.truncated = 'true';
                expandBtn.textContent = '続きを表示';
            }
        }

        // =====================================================
        // CHART CARD DRAG & DROP REORDERING (Enhanced)
        // =====================================================
        function initChartReordering() {
            const chartsGrid = document.getElementById('chartsGrid');
            if (!chartsGrid) return;

            let draggedElement = null;
            let placeholder = null;
            let touchStartY = 0;
            let touchStartX = 0;
            let longPressTimer = null;
            let isTouchDragging = false;
            let originalRect = null;

            // Load saved order from localStorage
            const savedOrder = localStorage.getItem('chartOrder');
            if (savedOrder) {
                try {
                    const order = JSON.parse(savedOrder);
                    const cards = Array.from(chartsGrid.querySelectorAll('.chart-card'));
                    const sortedCards = order.map(id => cards.find(c => c.dataset.chartId === id)).filter(Boolean);

                    // Add any missing cards (new charts)
                    cards.forEach(card => {
                        if (!sortedCards.includes(card)) sortedCards.push(card);
                    });

                    sortedCards.forEach(card => chartsGrid.appendChild(card));
                    console.log('[Charts] Loaded saved order:', order);
                } catch (e) {
                    console.log('[Charts] Failed to load saved order');
                }
            }

            // Create placeholder element
            function createPlaceholder(height) {
                const ph = document.createElement('div');
                ph.className = 'drag-placeholder';
                ph.style.height = height + 'px';
                return ph;
            }

            // Haptic feedback for mobile
            function vibrate() {
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
            }

            // Add drop animation
            function animateDrop(card) {
                card.classList.add('drop-animation');
                setTimeout(() => card.classList.remove('drop-animation'), 400);
            }

            // ========== PC MOUSE DRAG ==========

            // Drag start
            chartsGrid.addEventListener('dragstart', (e) => {
                const card = e.target.closest('.chart-card');
                if (!card) return;

                draggedElement = card;
                originalRect = card.getBoundingClientRect();

                // Create and insert placeholder
                placeholder = createPlaceholder(originalRect.height);
                card.parentNode.insertBefore(placeholder, card.nextSibling);

                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', card.dataset.chartId);

                // Set drag image (slightly transparent)
                if (e.dataTransfer.setDragImage) {
                    const clone = card.cloneNode(true);
                    clone.style.opacity = '0.8';
                    clone.style.position = 'absolute';
                    clone.style.top = '-9999px';
                    document.body.appendChild(clone);
                    e.dataTransfer.setDragImage(clone, originalRect.width / 2, 30);
                    setTimeout(() => document.body.removeChild(clone), 0);
                }
            });

            // Drag end
            chartsGrid.addEventListener('dragend', (e) => {
                const card = e.target.closest('.chart-card');
                if (card) {
                    card.classList.remove('dragging');
                    animateDrop(card);
                }

                // Remove placeholder
                if (placeholder && placeholder.parentNode) {
                    placeholder.parentNode.removeChild(placeholder);
                    placeholder = null;
                }

                document.querySelectorAll('.chart-card.drag-over').forEach(el => {
                    el.classList.remove('drag-over');
                });

                draggedElement = null;
                saveChartOrder();
            });

            // Drag over
            chartsGrid.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                const afterElement = getDragAfterElement(chartsGrid, e.clientY);
                const dragging = chartsGrid.querySelector('.dragging');

                if (!dragging) return;

                // Move placeholder to indicate drop position
                if (placeholder) {
                    if (afterElement == null) {
                        chartsGrid.appendChild(placeholder);
                    } else {
                        chartsGrid.insertBefore(placeholder, afterElement);
                    }
                }

                // Move actual card
                if (afterElement == null) {
                    chartsGrid.appendChild(dragging);
                } else {
                    chartsGrid.insertBefore(dragging, afterElement);
                }
            });

            // Drop
            chartsGrid.addEventListener('drop', (e) => {
                e.preventDefault();
                document.querySelectorAll('.chart-card.drag-over').forEach(el => {
                    el.classList.remove('drag-over');
                });
            });

            // ========== MOBILE TOUCH DRAG ==========

            const dragHandles = chartsGrid.querySelectorAll('.drag-handle');

            dragHandles.forEach(handle => {
                // Touch start - begin long press detection
                handle.addEventListener('touchstart', (e) => {
                    const card = handle.closest('.chart-card');
                    if (!card) return;

                    touchStartY = e.touches[0].clientY;
                    touchStartX = e.touches[0].clientX;

                    // Long press to start drag (500ms)
                    longPressTimer = setTimeout(() => {
                        isTouchDragging = true;
                        draggedElement = card;
                        originalRect = card.getBoundingClientRect();

                        vibrate();
                        card.classList.add('touch-ready');

                        // Create placeholder
                        placeholder = createPlaceholder(originalRect.height);
                        card.parentNode.insertBefore(placeholder, card.nextSibling);

                        // Make card follow finger
                        card.classList.add('touch-dragging');
                        card.style.width = originalRect.width + 'px';
                        card.style.left = originalRect.left + 'px';
                        card.style.top = originalRect.top + 'px';

                        setTimeout(() => card.classList.remove('touch-ready'), 300);
                    }, 500);
                }, { passive: true });

                // Touch move
                handle.addEventListener('touchmove', (e) => {
                    if (!isTouchDragging || !draggedElement) return;

                    e.preventDefault();

                    const touch = e.touches[0];
                    const deltaY = touch.clientY - touchStartY;
                    const deltaX = touch.clientX - touchStartX;

                    // Move card with finger
                    draggedElement.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.02)`;

                    // Determine drop position
                    const afterElement = getDragAfterElement(chartsGrid, touch.clientY);

                    if (placeholder) {
                        if (afterElement == null) {
                            chartsGrid.appendChild(placeholder);
                        } else if (afterElement !== draggedElement) {
                            chartsGrid.insertBefore(placeholder, afterElement);
                        }
                    }
                }, { passive: false });

                // Touch end
                handle.addEventListener('touchend', (e) => {
                    // Clear long press timer
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }

                    if (!isTouchDragging || !draggedElement) return;

                    // Move card to placeholder position
                    if (placeholder && placeholder.parentNode) {
                        placeholder.parentNode.insertBefore(draggedElement, placeholder);
                        placeholder.parentNode.removeChild(placeholder);
                        placeholder = null;
                    }

                    // Reset card styles
                    draggedElement.classList.remove('touch-dragging');
                    draggedElement.style.width = '';
                    draggedElement.style.left = '';
                    draggedElement.style.top = '';
                    draggedElement.style.transform = '';

                    animateDrop(draggedElement);
                    vibrate();

                    isTouchDragging = false;
                    draggedElement = null;

                    saveChartOrder();
                }, { passive: true });

                // Touch cancel
                handle.addEventListener('touchcancel', () => {
                    if (longPressTimer) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }

                    if (draggedElement) {
                        draggedElement.classList.remove('touch-dragging', 'touch-ready');
                        draggedElement.style.width = '';
                        draggedElement.style.left = '';
                        draggedElement.style.top = '';
                        draggedElement.style.transform = '';
                    }

                    if (placeholder && placeholder.parentNode) {
                        placeholder.parentNode.removeChild(placeholder);
                        placeholder = null;
                    }

                    isTouchDragging = false;
                    draggedElement = null;
                }, { passive: true });
            });
        }

        function getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll('.chart-card:not(.dragging):not(.touch-dragging)')];

            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;

                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }

        function saveChartOrder() {
            const chartsGrid = document.getElementById('chartsGrid');
            if (!chartsGrid) return;

            const order = Array.from(chartsGrid.querySelectorAll('.chart-card'))
                .map(card => card.dataset.chartId)
                .filter(Boolean);

            localStorage.setItem('chartOrder', JSON.stringify(order));
            console.log('[Charts] Saved order:', order);
        }


        // ========== ANIMATION HELPERS ==========

        // Smooth count-up animation for numbers
        window.animateNumber = function (elementId, newValue, suffix = '') {
            const element = document.getElementById(elementId);
            if (!element) return;

            // Parse current value (handle non-numeric explicitly)
            const currentText = element.innerText.replace(/[^0-9.-]/g, '');
            const startValue = parseFloat(currentText) || 0;
            const endValue = parseFloat(newValue);

            // If not a number, just update directly
            if (isNaN(endValue)) {
                element.innerHTML = newValue + suffix;
                return;
            }

            // If difference is small, no animation needed
            if (Math.abs(startValue - endValue) < 0.1) {
                element.innerHTML = newValue + suffix;
                return;
            }

            const duration = 1200; // Slightly slower for more "premium" feel
            const startTime = performance.now();

            function update(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease out exponential
                const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

                const current = startValue + (endValue - startValue) * ease;

                // Maintain decimal places based on input string
                const decimals = (newValue.toString().split('.')[1] || '').length;
                element.innerText = current.toFixed(decimals) + suffix;

                if (progress < 1) {
                    requestAnimationFrame(update);
                } else {
                    element.innerHTML = newValue + suffix; // Ensure final value is exact (and innerHTML to support nested spans if any)

                    // Trigger flash effect on card
                    const card = element.closest('.stat-card, .weather-hero');
                    if (card) {
                        card.classList.remove('flash-active');
                        void card.offsetWidth; // Force reflow
                        card.classList.add('flash-active');
                    }
                }
            }

            requestAnimationFrame(update);
        }

        // Spotlight Effect Setup
        function setupSpotlight() {
            const cards = document.querySelectorAll('.stat-card, .chart-card, .weather-hero, .comment-card, .precipitation-card, .ai-advisor-section');

            cards.forEach(card => {
                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;

                    card.style.setProperty('--spotlight-x', `${x}px`);
                    card.style.setProperty('--spotlight-y', `${y}px`);
                });
            });
        }

        // Init animations on load
        document.addEventListener('DOMContentLoaded', () => {
            setupSpotlight();
            initChartReordering();
            // Re-setup on dynamic content changes if needed
            setInterval(setupSpotlight, 5000);
        });

        init();