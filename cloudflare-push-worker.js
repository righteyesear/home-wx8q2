// push-notifications Worker - Web Push暗号化対応版
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        switch (path) {
            case '/api/subscribe':
                if (request.method === 'POST') return this.subscribe(request, env, corsHeaders);
                if (request.method === 'DELETE') return this.unsubscribe(request, env, corsHeaders);
                break;
            case '/api/test':
                if (request.method === 'POST') return this.sendTestNotification(env, corsHeaders, 'default');
                break;
            case '/api/test/warning':
                if (request.method === 'POST') return this.sendTestNotification(env, corsHeaders, 'warning');
                break;
            case '/api/test/special':
                if (request.method === 'POST') return this.sendTestNotification(env, corsHeaders, 'special');
                break;
            case '/api/test/rain':
                if (request.method === 'POST') return this.sendTestNotification(env, corsHeaders, 'rain');
                break;
            case '/api/test/heavyrain':
                if (request.method === 'POST') return this.sendTestNotification(env, corsHeaders, 'heavyrain');
                break;
            case '/api/test/fullmoon':
                if (request.method === 'POST') return this.sendTestNotification(env, corsHeaders, 'fullmoon');
                break;
            case '/api/test/temperature':
                if (request.method === 'POST') return this.sendTestNotification(env, corsHeaders, 'temperature');
                break;
            case '/api/test/heatwave':
                if (request.method === 'POST') return this.sendTestNotification(env, corsHeaders, 'heatwave');
                break;
            case '/api/test/tempchange':
                if (request.method === 'POST') return this.sendTestNotification(env, corsHeaders, 'tempchange');
                break;
            case '/api/test/real-rain':
                if (request.method === 'POST') return this.sendRealtimeRainNotification(env, corsHeaders);
                break;
            case '/api/check':
                // 手動で天気チェックをトリガー
                if (request.method === 'POST') return this.checkWeather(env, corsHeaders);
                break;
            case '/api/status':
                const count = await this.getSubscriberCount(env);
                return new Response(JSON.stringify({ subscribers: count }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
        }

        return new Response(JSON.stringify({
            service: 'push-notifications',
            status: 'ok',
            endpoints: [
                '/api/subscribe', '/api/status', '/api/check',
                '/api/test', '/api/test/warning', '/api/test/special',
                '/api/test/rain', '/api/test/heavyrain',
                '/api/test/fullmoon', '/api/test/temperature',
                '/api/test/heatwave', '/api/test/tempchange', '/api/test/real-rain'
            ]
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    },

    async subscribe(request, env, corsHeaders) {
        try {
            const subscription = await request.json();
            const key = this.hashEndpoint(subscription.endpoint);
            await env.KV.put(key, JSON.stringify({ subscription, createdAt: new Date().toISOString() }));
            return new Response(JSON.stringify({ success: true, id: key }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    },

    async unsubscribe(request, env, corsHeaders) {
        try {
            const { endpoint } = await request.json();
            const key = this.hashEndpoint(endpoint);
            await env.KV.delete(key);
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    },

    async sendTestNotification(env, corsHeaders, type = 'default') {
        try {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });

            const notifications = {
                default: {
                    title: '🌡️ テスト通知',
                    body: '通知システムが正常に動作しています！'
                },
                warning: {
                    title: '【テスト】🚨 気象警報',
                    body: `大雨警報 暴風警報（${timeStr}発表）\n※これはテスト通知です`
                },
                special: {
                    title: '【テスト】🔴 特別警報',
                    body: `大雨特別警報（${timeStr}発表）\n命を守る行動を！\n※これはテスト通知です`
                },
                rain: {
                    title: '【テスト】🌧️ 雨雲接近',
                    body: '30分後に雨が降りそうです ☔\n※これはテスト通知です'
                },
                heavyrain: {
                    title: '【テスト】⛈️ 豪雨予報',
                    body: `45分後（${this.getTimeAfterMinutes(45)}）に25mm/hの雨\n※これはテスト通知です`
                },
                fullmoon: {
                    title: '【テスト】🌕 今夜は満月',
                    body: 'ストロベリームーンが見られます\n※これはテスト通知です'
                },
                temperature: {
                    title: '【テスト】⚠️ 気温警報',
                    body: '現在の気温: -2.5°C ❄️\n路面凍結・水道凍結に注意\n※これはテスト通知です'
                },
                heatwave: {
                    title: '【テスト】⚠️ 気温警報',
                    body: '現在の気温: 36.5°C 🔥\n熱中症に厳重警戒\n※これはテスト通知です'
                },
                tempchange: {
                    title: '【テスト】🌡️ 気温の変化',
                    body: '現在-1.5°C\n昨日の最低(2.0°C)より3.5°C低い❄️\n※これはテスト通知です'
                }
            };

            const payload = notifications[type] || notifications.default;
            const results = await this.sendToAll(env, payload);

            return new Response(JSON.stringify({
                success: true,
                type,
                sent: results.sent,
                failed: results.failed
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    },

    // 実況の雨をチェックして即座に通知を送信する（手動テスト用）
    async sendRealtimeRainNotification(env, corsHeaders) {
        try {
            const response = await fetch('https://yahoo-weather-proxy.miurayukimail.workers.dev');
            if (!response.ok) throw new Error('Proxy error');

            const data = await response.json();
            if (!data.data || data.data.length === 0) throw new Error('No data');

            const currentRain = data.data[0].rainfall;

            let title = '🌧️ 【実況】現在の降水量';
            let body = currentRain > 0
                ? `現在、${currentRain}mm/hの雨が降っています`
                : '現在は雨は降っていません';

            const results = await this.sendToAll(env, {
                title,
                body,
                data: { url: './#precipitationCard' }
            });

            return new Response(JSON.stringify({ success: true, currentRain, results }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    },

    getTimeAfterMinutes(mins) {
        const d = new Date(Date.now() + mins * 60000);
        return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
    },

    // 天気チェック（手動 or Cron Trigger）
    async checkWeather(env, corsHeaders = null) {
        const results = { warnings: [], rain: null, temperature: null, tempChange: null, notifications: [] };

        try {
            // 1. JMA警報チェック
            const warnings = await this.checkJMAWarnings(env);
            results.warnings = warnings;

            // 2. 雨雲チェック
            const rain = await this.checkYahooRain(env);
            results.rain = rain;

            // 3. 満月チェック
            const fullmoon = await this.checkFullMoon(env);
            if (fullmoon) results.notifications.push('fullmoon');

            // 4. 極端な気温チェック
            const temp = await this.checkExtremeTemperature(env);
            results.temperature = temp;

            // 5. 昨日との気温差チェック（朝7時）
            const tempChange = await this.checkTemperatureChange(env);
            results.tempChange = tempChange;

        } catch (error) {
            results.error = error.message;
        }

        if (corsHeaders) {
            return new Response(JSON.stringify(results), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
        return results;
    },

    // JMA警報チェック（警報・特別警報のみ、注意報は除外）
    async checkJMAWarnings(env) {
        try {
            const response = await fetch('https://www.jma.go.jp/bosai/warning/data/warning/130000.json');
            if (!response.ok) return { warnings: [], specialWarnings: [] };

            const data = await response.json();
            const reportTime = data.reportDatetime || '';
            const warnings = [];
            const specialWarnings = [];

            // 特別警報・警報コード対応表（注意報は除外）
            const SPECIAL_WARNINGS = {
                '32': '暴風雪特別警報', '33': '大雨特別警報', '35': '暴風特別警報',
                '36': '大雪特別警報', '37': '波浪特別警報', '38': '高潮特別警報'
            };
            const WARNINGS = {
                '02': '暴風雪警報', '03': '大雨警報', '04': '洪水警報',
                '05': '暴風警報', '06': '大雪警報', '07': '波浪警報', '08': '高潮警報'
            };

            if (data.areaTypes) {
                for (const areaType of data.areaTypes) {
                    for (const area of (areaType.areas || [])) {
                        if (area.code === '130014' || area.name?.includes('東部')) {
                            for (const warning of (area.warnings || [])) {
                                if (warning.status === '発表' || warning.status === '継続') {
                                    const code = warning.code?.toString().padStart(2, '0') || '';
                                    if (SPECIAL_WARNINGS[code]) {
                                        specialWarnings.push(SPECIAL_WARNINGS[code]);
                                    } else if (WARNINGS[code]) {
                                        warnings.push(WARNINGS[code]);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            const timeStr = reportTime ? new Date(reportTime).toLocaleTimeString('ja-JP', {
                hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo'
            }) : '';

            // 特別警報通知（最優先）- 個別の警報タイプごとにチェック
            if (specialWarnings.length > 0) {
                const newSpecialWarnings = [];
                for (const w of specialWarnings) {
                    const key = 'notify_special_' + w.replace(/\s/g, '');
                    if (!await env.KV.get(key)) {
                        newSpecialWarnings.push(w);
                        await env.KV.put(key, 'true', { expirationTtl: 21600 }); // 6時間
                    }
                }
                if (newSpecialWarnings.length > 0) {
                    await this.sendToAll(env, {
                        title: '🔴 特別警報',
                        body: `${newSpecialWarnings.join(' ')}（${timeStr}発表）\n命を守る行動を！`,
                        data: { url: './#alertBanner' }
                    });
                }
            }

            // 警報通知 - 個別の警報タイプごとにチェック
            if (warnings.length > 0) {
                const newWarnings = [];
                for (const w of warnings) {
                    const key = 'notify_warning_' + w.replace(/\s/g, '');
                    if (!await env.KV.get(key)) {
                        newWarnings.push(w);
                        await env.KV.put(key, 'true', { expirationTtl: 21600 }); // 6時間
                    }
                }
                if (newWarnings.length > 0) {
                    await this.sendToAll(env, {
                        title: '🚨 気象警報',
                        body: `${newWarnings.join(' ')}（${timeStr}発表）`,
                        data: { url: './#alertBanner' }
                    });
                }
            }

            return { warnings, specialWarnings };
        } catch (e) {
            console.error('[JMA Error]', e.message);
            return { warnings: [], specialWarnings: [] };
        }
    },

    // Yahoo雨雲チェック
    async checkYahooRain(env) {
        try {
            const response = await fetch('https://yahoo-weather-proxy.miurayukimail.workers.dev');
            if (!response.ok) return null;

            const data = await response.json();
            if (!data.data || data.data.length === 0) return null;

            const precipData = data.data;
            const now = new Date();
            const hour = now.getHours();
            const isNight = hour >= 22 || hour < 6; // 22:00-6:00 は夜間

            // 1時間以内の雨を探す
            const upcomingRain = precipData.find((d, i) => {
                if (i > 6) return false; // 60分以内（10分刻みで6つ）
                return d.rainfall > 0 && d.type === 'forecast';
            });

            if (upcomingRain) {
                const [hh, mm] = upcomingRain.time.split(':').map(Number);
                const rainTime = new Date(now);
                rainTime.setHours(hh, mm, 0, 0);
                if (rainTime < now) rainTime.setDate(rainTime.getDate() + 1);

                const minsUntilRain = Math.round((rainTime - now) / 60000);
                const rainfall = upcomingRain.rainfall;

                // 夜間: 30mm/h以上のみ、日中: 20mm/h以上で豪雨、それ以下で雨雲接近
                const heavyRainThreshold = isNight ? 30 : 20;
                const isHeavyRain = rainfall >= heavyRainThreshold;

                // 夜間は豪雨のみ通知
                if (isNight && !isHeavyRain) {
                    return { minsUntilRain, rainfall, skipped: 'night_mode' };
                }

                // クールダウン: 雨雲接近と豪雨予報は別（各1時間）
                const rainKey = isHeavyRain ? 'notify_heavyrain' : 'notify_rain';
                const lastNotify = await env.KV.get(rainKey);

                if (!lastNotify) {
                    if (isHeavyRain) {
                        await this.sendToAll(env, {
                            title: '⛈️ 豪雨予報',
                            body: `約${minsUntilRain}分後に${rainfall}mm/hの強い雨が降りそうです`,
                            data: { url: './#precipitationCard' }
                        });
                    } else {
                        await this.sendToAll(env, {
                            title: '🌧️ 雨雲接近',
                            body: `約${minsUntilRain}分後に雨が降りそうです ☔`,
                            data: { url: './#precipitationCard' }
                        });
                    }
                    // クールダウン: 1時間
                    await env.KV.put(rainKey, 'true', { expirationTtl: 3600 });
                }

                return { minsUntilRain, rainfall };
            }

            return null;
        } catch (e) {
            console.error('[Yahoo Error]', e.message);
            return null;
        }
    },

    // 満月チェック
    async checkFullMoon(env) {
        const now = new Date();
        const hour = now.getHours();

        // 朝8時のみチェック
        if (hour !== 8) return false;

        const moonAge = this.calculateMoonAge(now);
        const isFullMoon = moonAge >= 13.5 && moonAge < 15.5;

        if (isFullMoon) {
            const today = now.toISOString().split('T')[0];
            const notified = await env.KV.get('fullmoon_' + today);

            if (!notified) {
                const moonNames = {
                    1: 'ウルフムーン', 2: 'スノームーン', 3: 'ワームムーン',
                    4: 'ピンクムーン', 5: 'フラワームーン', 6: 'ストロベリームーン',
                    7: 'バックムーン', 8: 'スタージョンムーン', 9: 'ハーベストムーン',
                    10: 'ハンターズムーン', 11: 'ビーバームーン', 12: 'コールドムーン'
                };
                const moonName = moonNames[now.getMonth() + 1];

                await this.sendToAll(env, {
                    title: '🌕 今夜は満月',
                    body: `${moonName}が見られます`,
                    data: { url: './#moonCard' }
                });

                await env.KV.put('fullmoon_' + today, 'true', { expirationTtl: 86400 });
                return true;
            }
        }
        return false;
    },

    calculateMoonAge(date) {
        const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
        const c = Math.floor(y / 100);
        let adj = m < 3 ? 1 : 0;
        let jd = Math.floor(365.25 * (y - adj + 4716)) + Math.floor(30.6001 * ((m < 3 ? m + 12 : m) + 1)) + d - 1524.5;
        jd = jd - Math.floor(c / 4) + c + 2;
        return ((jd - 2451550.1) % 29.53058867 + 29.53058867) % 29.53058867;
    },

    // 極端な気温通知（家の外気温計から取得）- 2段階KV管理
    async checkExtremeTemperature(env) {
        try {
            // Google Spreadsheetsから最新の気温データ取得
            const SPREADSHEET_ID = '1nbmJIIUzw8n2PcHp98NaiKnaAVciBx_Egpokjjx7uW8';
            const response = await fetch(
                `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Summary`
            );
            if (!response.ok) return null;

            const csv = await response.text();
            const rows = csv.split('\n').filter(r => r.trim());
            if (rows.length < 2) return null;

            // 最新の気温を取得（Summary シートの最新行）
            const lastRow = rows[rows.length - 1];
            const cols = lastRow.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            const currentTemp = parseFloat(cols[1]?.replace(/"/g, '')) || null;

            if (currentTemp === null) return null;

            // 月ごとの閾値設定
            const month = new Date().getMonth() + 1;
            const thresholds = this.getMonthlyThresholds(month);

            let alertType = null;
            let message = '';

            if (currentTemp <= thresholds.freezing) {
                alertType = 'freezing';
                message = `現在の気温: ${currentTemp.toFixed(1)}°C ❄️\n路面凍結・水道凍結に注意`;
            } else if (currentTemp >= thresholds.heatwave) {
                alertType = 'heatwave';
                message = `現在の気温: ${currentTemp.toFixed(1)}°C 🔥\n熱中症に厳重警戒`;
            } else if (currentTemp <= thresholds.cold) {
                alertType = 'cold';
                message = `現在の気温: ${currentTemp.toFixed(1)}°C 🥶\n暖かくしてお出かけください`;
            } else if (currentTemp >= thresholds.hot) {
                alertType = 'hot';
                message = `現在の気温: ${currentTemp.toFixed(1)}°C ☀️\n水分補給をこまめに`;
            }

            // 閾値内に回復した場合 → 回復フラグを設定
            if (!alertType) {
                // 全アラートタイプの送信済みフラグを確認し、あれば回復処理
                for (const type of ['freezing', 'heatwave', 'cold', 'hot']) {
                    const activeKey = 'notify_temp_' + type;
                    if (await env.KV.get(activeKey)) {
                        await env.KV.delete(activeKey);
                        await env.KV.put('notify_temp_' + type + '_recovered', 'true', { expirationTtl: 3600 }); // 1時間猶予
                        console.log(`[Temp] ${type} alert recovered, cooldown 1h`);
                    }
                }
                return { currentTemp, status: 'normal' };
            }

            // 2段階KV管理: 送信済みフラグがあればスキップ
            const activeKey = 'notify_temp_' + alertType;
            const recoveredKey = 'notify_temp_' + alertType + '_recovered';

            if (await env.KV.get(activeKey)) {
                return { currentTemp, alertType, skipped: 'already_active' };
            }
            // 回復猶予期間中（1時間以内の再発）はスキップ
            if (await env.KV.get(recoveredKey)) {
                return { currentTemp, alertType, skipped: 'recovery_cooldown' };
            }

            await this.sendToAll(env, {
                title: alertType === 'freezing' || alertType === 'heatwave'
                    ? '⚠️ 気温警報'
                    : '🌡️ 気温情報',
                body: message,
                data: { url: './#weatherHero' }
            });

            // 送信済みフラグ（回復するまで有効、最大24時間）
            await env.KV.put(activeKey, 'true', { expirationTtl: 86400 });
            return { currentTemp, alertType };

        } catch (e) {
            console.error('[Temp Error]', e.message);
            return null;
        }
    },

    // 月ごとの気温閾値
    getMonthlyThresholds(month) {
        // 月別閾値: { freezing, cold, hot, heatwave }
        const thresholds = {
            1: { freezing: 0, cold: 3, hot: 15, heatwave: 20 },   // 1月
            2: { freezing: 0, cold: 3, hot: 18, heatwave: 22 },   // 2月
            3: { freezing: 0, cold: 5, hot: 22, heatwave: 25 },   // 3月
            4: { freezing: 0, cold: 8, hot: 25, heatwave: 28 },   // 4月
            5: { freezing: 0, cold: 12, hot: 28, heatwave: 30 },  // 5月
            6: { freezing: 0, cold: 15, hot: 30, heatwave: 33 },  // 6月
            7: { freezing: 0, cold: 20, hot: 33, heatwave: 35 },  // 7月
            8: { freezing: 0, cold: 20, hot: 33, heatwave: 35 },  // 8月
            9: { freezing: 0, cold: 15, hot: 30, heatwave: 33 },  // 9月
            10: { freezing: 0, cold: 10, hot: 25, heatwave: 28 },  // 10月
            11: { freezing: 0, cold: 5, hot: 20, heatwave: 25 },   // 11月
            12: { freezing: 0, cold: 3, hot: 15, heatwave: 20 }    // 12月
        };
        return thresholds[month] || thresholds[1];
    },

    // 今の気温 vs 昨日の最高/最低チェック（リアルタイム）
    async checkTemperatureChange(env) {
        try {
            const SPREADSHEET_ID = '1nbmJIIUzw8n2PcHp98NaiKnaAVciBx_Egpokjjx7uW8';

            // 1. 現在の気温を取得（Summaryシート）
            const summaryResp = await fetch(
                `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Summary`
            );
            if (!summaryResp.ok) return null;

            const summaryCSV = await summaryResp.text();
            const summaryRows = summaryCSV.split('\n').filter(r => r.trim());
            if (summaryRows.length < 2) return null;

            const lastSummaryRow = summaryRows[summaryRows.length - 1];
            const summaryCols = lastSummaryRow.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            const currentTemp = parseFloat(summaryCols[1]?.replace(/"/g, '')) || null;

            if (currentTemp === null) return null;

            // 2. 昨日の最高/最低を取得（Dailyシート）
            const dailyResp = await fetch(
                `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Daily`
            );
            if (!dailyResp.ok) return null;

            const dailyCSV = await dailyResp.text();
            const dailyRows = dailyCSV.split('\n').slice(1).filter(r => r.trim());
            if (dailyRows.length < 1) return null;

            // 昨日のデータ（最新から2番目）
            const yesterdayRow = dailyRows[dailyRows.length - 2];
            if (!yesterdayRow) return null;

            const dailyCols = yesterdayRow.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            const yesterdayHigh = parseFloat(dailyCols[1]?.replace(/"/g, '')) || null;
            const yesterdayLow = parseFloat(dailyCols[2]?.replace(/"/g, '')) || null;

            if (!yesterdayHigh || !yesterdayLow) return null;

            // 3. 比較して通知
            const highDiff = currentTemp - yesterdayHigh;
            const lowDiff = currentTemp - yesterdayLow;

            let alertType = null;
            let message = '';

            // 昨日の最高より3°C以上高い
            if (highDiff >= 3) {
                alertType = 'warmer_than_high';
                message = `現在${currentTemp.toFixed(1)}°C\n昨日の最高(${yesterdayHigh.toFixed(1)}°C)より${highDiff.toFixed(1)}°C高い☀️`;
            }
            // 昨日の最低より3°C以上低い
            else if (lowDiff <= -3) {
                alertType = 'colder_than_low';
                message = `現在${currentTemp.toFixed(1)}°C\n昨日の最低(${yesterdayLow.toFixed(1)}°C)より${Math.abs(lowDiff).toFixed(1)}°C低い❄️`;
            }

            if (!alertType) return null;

            // クールダウン: 6時間（同じ種類）
            const key = 'notify_tempchange_' + alertType;
            if (await env.KV.get(key)) return { currentTemp, yesterdayHigh, yesterdayLow, skipped: 'cooldown' };

            await this.sendToAll(env, {
                title: '🌡️ 気温の変化',
                body: message,
                data: { url: './#weatherHero' }
            });

            await env.KV.put(key, 'true', { expirationTtl: 21600 }); // 6時間
            return { currentTemp, yesterdayHigh, yesterdayLow, alertType };

        } catch (e) {
            console.error('[TempChange Error]', e.message);
            return null;
        }
    },

    async sendToAll(env, payload) {
        const list = await env.KV.list({ prefix: 'sub_' });
        let sent = 0, failed = 0;

        for (const key of list.keys) {
            const data = await env.KV.get(key.name);
            if (data) {
                const { subscription } = JSON.parse(data);
                const success = await this.sendWebPush(env, subscription, payload);
                if (success) sent++; else failed++;
            }
        }
        return { sent, failed };
    },

    async sendWebPush(env, subscription, payload) {
        try {
            const vapidHeaders = await this.generateVapidHeaders(
                subscription.endpoint,
                env.VAPID_PUBLIC_KEY,
                env.VAPID_PRIVATE_KEY,
                'mailto:notification@example.com'
            );

            console.log('[Push] Sending to:', subscription.endpoint.slice(-30));

            // ペイロードを暗号化
            const payloadText = JSON.stringify(payload);
            const encrypted = await this.encryptPayload(subscription, payloadText);

            console.log('[Push] Encrypted payload size:', encrypted.byteLength);

            const response = await fetch(subscription.endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': vapidHeaders.authorization,
                    'Crypto-Key': vapidHeaders.cryptoKey,
                    'Content-Encoding': 'aes128gcm',
                    'Content-Type': 'application/octet-stream',
                    'TTL': '86400',
                },
                body: encrypted
            });

            const responseText = await response.text();
            console.log('[Push] Response:', response.status, responseText.slice(0, 100));

            return response.status >= 200 && response.status < 300;
        } catch (error) {
            console.error('[Push Error]', error.message, error.stack);
            return false;
        }
    },

    async encryptPayload(subscription, payloadText) {
        const payload = new TextEncoder().encode(payloadText);

        // Get subscription keys
        const clientPublicKey = this.urlBase64ToBytes(subscription.keys.p256dh);
        const authSecret = this.urlBase64ToBytes(subscription.keys.auth);

        // Generate salt
        const salt = crypto.getRandomValues(new Uint8Array(16));

        // Generate server ECDH keys
        const serverKeys = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveBits']
        );
        const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));

        // Import client public key
        const clientKey = await crypto.subtle.importKey(
            'raw',
            clientPublicKey,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        );

        // Derive shared secret
        const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
            { name: 'ECDH', public: clientKey },
            serverKeys.privateKey,
            256
        ));

        // HKDF for IKM
        const authInfo = this.concatBytes(
            new TextEncoder().encode('WebPush: info\0'),
            clientPublicKey,
            serverPublicKeyRaw
        );
        const ikm = await this.hkdfExtractExpand(authSecret, sharedSecret, authInfo, 32);

        // HKDF for Content Encryption Key (CEK) and nonce
        const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
        const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');

        const prkForCek = await this.hkdfExtract(salt, ikm);
        const cek = await this.hkdfExpand(prkForCek, cekInfo, 16);
        const nonce = await this.hkdfExpand(prkForCek, nonceInfo, 12);

        // Add padding (1 byte delimiter + 0 bytes padding)
        const paddedPayload = this.concatBytes(payload, new Uint8Array([2]));

        // Encrypt with AES-GCM
        const encryptionKey = await crypto.subtle.importKey(
            'raw', cek, { name: 'AES-GCM' }, false, ['encrypt']
        );
        const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce },
            encryptionKey,
            paddedPayload
        ));

        // Build aes128gcm record: salt(16) | rs(4) | idlen(1) | keyid(65) | ciphertext
        const recordSize = new Uint8Array(4);
        new DataView(recordSize.buffer).setUint32(0, 4096, false);

        return this.concatBytes(
            salt,                           // 16 bytes
            recordSize,                     // 4 bytes (record size = 4096)
            new Uint8Array([65]),           // 1 byte (key id length = 65)
            serverPublicKeyRaw,             // 65 bytes (server public key)
            ciphertext                      // variable (encrypted content)
        );
    },

    async hkdfExtract(salt, ikm) {
        const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
    },

    async hkdfExpand(prk, info, length) {
        const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const t = await crypto.subtle.sign('HMAC', key, this.concatBytes(info, new Uint8Array([1])));
        return new Uint8Array(t).slice(0, length);
    },

    async hkdfExtractExpand(salt, ikm, info, length) {
        const prk = await this.hkdfExtract(salt, ikm);
        return this.hkdfExpand(prk, info, length);
    },

    async generateVapidHeaders(endpoint, publicKey, privateKey, subject) {
        const audience = new URL(endpoint).origin;
        const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

        const header = { typ: 'JWT', alg: 'ES256' };
        const jwtPayload = { aud: audience, exp: expiry, sub: subject };

        const headerB64 = this.base64UrlEncode(JSON.stringify(header));
        const payloadB64 = this.base64UrlEncode(JSON.stringify(jwtPayload));
        const unsignedToken = `${headerB64}.${payloadB64}`;

        const pubKeyBytes = this.urlBase64ToBytes(publicKey);
        const privKeyBytes = this.urlBase64ToBytes(privateKey);

        const key = await crypto.subtle.importKey(
            'jwk',
            {
                kty: 'EC',
                crv: 'P-256',
                x: this.base64UrlEncode(pubKeyBytes.slice(1, 33)),
                y: this.base64UrlEncode(pubKeyBytes.slice(33, 65)),
                d: this.base64UrlEncode(privKeyBytes),
            },
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            new TextEncoder().encode(unsignedToken)
        );

        const signatureB64 = this.base64UrlEncode(new Uint8Array(signature));
        const jwt = `${unsignedToken}.${signatureB64}`;

        return {
            authorization: `vapid t=${jwt}, k=${publicKey}`,
            cryptoKey: `p256ecdsa=${publicKey}`
        };
    },

    urlBase64ToBytes(base64) {
        const padding = '='.repeat((4 - base64.length % 4) % 4);
        const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(b64);
        return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
    },

    base64UrlEncode(data) {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        const binary = String.fromCharCode(...bytes);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },

    concatBytes(...arrays) {
        const result = new Uint8Array(arrays.reduce((sum, arr) => sum + arr.length, 0));
        let offset = 0;
        for (const arr of arrays) { result.set(arr, offset); offset += arr.length; }
        return result;
    },

    async getSubscriberCount(env) {
        const list = await env.KV.list({ prefix: 'sub_' });
        return list.keys.length;
    },

    hashEndpoint(endpoint) {
        let hash = 0;
        for (let i = 0; i < endpoint.length; i++) hash = ((hash << 5) - hash) + endpoint.charCodeAt(i) | 0;
        return 'sub_' + Math.abs(hash).toString(36);
    },

    // Cron Trigger: 定期実行（1分ごと）
    async scheduled(event, env, ctx) {
        const now = new Date();
        const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
        const hour = jstNow.getHours();
        const minute = jstNow.getMinutes();
        console.log(`[Cron] Running scheduled check... JST ${hour}:${String(minute).padStart(2, '0')}`);

        const isNightSilent = hour >= 0 && hour < 6; // 夜間サイレント時間帯

        // ================================================================
        // 特定時刻のチェック
        // ================================================================

        // 朝7時0分: デイリーサマリー
        if (hour === 7 && minute === 0) {
            try {
                await this.sendDailySummary(env);
                console.log('[Cron] Daily summary sent');
            } catch (e) {
                console.error('[Cron] Daily summary error:', e.message);
            }
        }

        // 朝8時0分: 満月チェック
        if (hour === 8 && minute === 0) {
            try {
                await this.checkFullMoon(env);
            } catch (e) {
                console.error('[Cron] Full moon check error:', e.message);
            }
        }

        // 夜10時0分: 凍結先行アラート
        if (hour === 22 && minute === 0) {
            try {
                await this.checkFrostAlert(env);
                console.log('[Cron] Frost alert check done');
            } catch (e) {
                console.error('[Cron] Frost alert error:', e.message);
            }
        }

        // ================================================================
        // 5分ごとのチェック（気象警報・雨雲）- 24時間稼働
        // ================================================================
        if (minute % 5 === 0) {
            const urgentChecks = [
                this.checkJMAWarnings(env).catch(e => {
                    console.error('[Cron] JMA check error:', e.message);
                    return null;
                }),
                this.checkYahooRain(env).catch(e => {
                    console.error('[Cron] Yahoo rain check error:', e.message);
                    return null;
                })
            ];

            const results = await Promise.allSettled(urgentChecks);
            console.log('[Cron] Urgent checks done:', results.map(r => r.status));
        }

        // ================================================================
        // 15分ごとのチェック（気温系）- 夜間はスキップ
        // ================================================================
        if (minute % 15 === 0 && !isNightSilent) {
            const tempChecks = [
                this.checkExtremeTemperature(env).catch(e => {
                    console.error('[Cron] Extreme temp check error:', e.message);
                    return null;
                }),
                this.checkTemperatureChange(env).catch(e => {
                    console.error('[Cron] Temp change check error:', e.message);
                    return null;
                })
            ];

            const results = await Promise.allSettled(tempChecks);
            console.log('[Cron] Temp checks done:', results.map(r => r.status));
        }
    },

    // 凍結先行アラート（前日22時にOpenMeteo予報 + 実測気温で判定）
    async checkFrostAlert(env) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const notified = await env.KV.get('frost_alert_' + today);
            if (notified) return { skipped: 'already_sent' };

            // 1. OpenMeteo で翌日の最低気温予報を取得（東京）
            const meteoResp = await fetch(
                'https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&daily=temperature_2m_min&timezone=Asia%2FTokyo&forecast_days=2'
            );
            if (!meteoResp.ok) return null;

            const meteoData = await meteoResp.json();
            const tomorrowMinTemp = meteoData.daily?.temperature_2m_min?.[1];
            if (tomorrowMinTemp === undefined || tomorrowMinTemp === null) return null;

            // 2. 現在の実測気温を取得（Google Spreadsheets）
            const SPREADSHEET_ID = '1nbmJIIUzw8n2PcHp98NaiKnaAVciBx_Egpokjjx7uW8';
            const summaryResp = await fetch(
                `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Summary`
            );
            let currentTemp = null;
            if (summaryResp.ok) {
                const csv = await summaryResp.text();
                const rows = csv.split('\n').filter(r => r.trim());
                if (rows.length >= 2) {
                    const lastRow = rows[rows.length - 1];
                    const cols = lastRow.match(/(\".*?\"|[^\",\s]+)(?=\s*,|\s*$)/g) || [];
                    currentTemp = parseFloat(cols[1]?.replace(/"/g, '')) || null;
                }
            }

            // 3. 判定ロジック
            let shouldNotify = false;
            let message = '';

            if (tomorrowMinTemp <= -3) {
                // 予報が-3°C以下 → 実測条件に関係なく通知
                shouldNotify = true;
                message = `明日の最低気温: ${tomorrowMinTemp.toFixed(1)}°C ❄️\n厳しい冷え込みに注意`;
            } else if (tomorrowMinTemp <= 0 && currentTemp !== null && currentTemp <= 5) {
                // 予報0°C以下 かつ 今夜の実測が5°C以下
                shouldNotify = true;
                message = `明日の最低${tomorrowMinTemp.toFixed(1)}°C予報 / 現在${currentTemp.toFixed(1)}°C\n路面凍結・水道凍結に注意`;
            }

            if (!shouldNotify) return { tomorrowMinTemp, currentTemp, skipped: 'no_risk' };

            await this.sendToAll(env, {
                title: '🧊 明日の朝は凍結注意',
                body: message,
                data: { url: './#weatherHero' }
            });

            await env.KV.put('frost_alert_' + today, 'true', { expirationTtl: 43200 }); // 12時間
            return { tomorrowMinTemp, currentTemp, notified: true };

        } catch (e) {
            console.error('[FrostAlert Error]', e.message);
            return null;
        }
    },

    // デイリーサマリー（朝7時の天気まとめ通知）
    async sendDailySummary(env) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const notified = await env.KV.get('daily_summary_' + today);
            if (notified) return { skipped: 'already_sent' };

            const summaryParts = [];

            // 1. 気象警報の有無
            try {
                const response = await fetch('https://www.jma.go.jp/bosai/warning/data/warning/130000.json');
                if (response.ok) {
                    const data = await response.json();
                    const activeWarnings = [];
                    if (data.areaTypes) {
                        for (const areaType of data.areaTypes) {
                            for (const area of (areaType.areas || [])) {
                                if (area.code === '130014' || area.name?.includes('東部')) {
                                    for (const warning of (area.warnings || [])) {
                                        if ((warning.status === '発表' || warning.status === '継続') &&
                                            ['03', '04', '05', '06', '07', '08'].includes(warning.code?.toString().padStart(2, '0'))) {
                                            const warningNames = {
                                                '03': '大雨', '04': '洪水', '05': '暴風',
                                                '06': '大雪', '07': '波浪', '08': '高潮'
                                            };
                                            activeWarnings.push(warningNames[warning.code?.toString().padStart(2, '0')] || '');
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (activeWarnings.length > 0) {
                        summaryParts.push(`⚠️ ${activeWarnings.join('・')}警報発令中`);
                    }
                }
            } catch (e) {
                console.error('[DailySummary] JMA error:', e.message);
            }

            // 2. 現在の気温と今日の予報気温
            try {
                const meteoResp = await fetch(
                    'https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&current=temperature_2m&timezone=Asia%2FTokyo&forecast_days=1'
                );
                if (meteoResp.ok) {
                    const meteo = await meteoResp.json();
                    const current = meteo.current?.temperature_2m;
                    const todayMax = meteo.daily?.temperature_2m_max?.[0];
                    const todayMin = meteo.daily?.temperature_2m_min?.[0];
                    const precipProb = meteo.daily?.precipitation_probability_max?.[0];

                    if (todayMax !== null && todayMin !== null) {
                        summaryParts.push(`🌡️ ${todayMin?.toFixed(0)}°C〜${todayMax?.toFixed(0)}°Cの見込み`);
                    }
                    if (precipProb !== null && precipProb >= 30) {
                        summaryParts.push(`☔ 降水確率 ${precipProb}%`);
                    }
                }
            } catch (e) {
                console.error('[DailySummary] OpenMeteo error:', e.message);
            }

            // 3. 現在の実測気温
            try {
                const SPREADSHEET_ID = '1nbmJIIUzw8n2PcHp98NaiKnaAVciBx_Egpokjjx7uW8';
                const summaryResp = await fetch(
                    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=Summary`
                );
                if (summaryResp.ok) {
                    const csv = await summaryResp.text();
                    const rows = csv.split('\n').filter(r => r.trim());
                    if (rows.length >= 2) {
                        const lastRow = rows[rows.length - 1];
                        const cols = lastRow.match(/(\".*?\"|[^\",\s]+)(?=\s*,|\s*$)/g) || [];
                        const currentTemp = parseFloat(cols[1]?.replace(/"/g, ''));
                        if (!isNaN(currentTemp)) {
                            summaryParts.push(`📍 現在の外気温: ${currentTemp.toFixed(1)}°C`);
                        }
                    }
                }
            } catch (e) {
                console.error('[DailySummary] Spreadsheet error:', e.message);
            }

            if (summaryParts.length === 0) {
                summaryParts.push('データの取得ができませんでした');
            }

            await this.sendToAll(env, {
                title: '🌅 おはよう！今日の天気',
                body: summaryParts.join('\n'),
                data: { url: './#weatherHero' }
            });

            await env.KV.put('daily_summary_' + today, 'true', { expirationTtl: 86400 });
            return { sent: true, parts: summaryParts };

        } catch (e) {
            console.error('[DailySummary Error]', e.message);
            return null;
        }
    },

    calculateMoonAge(date) {
        const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
        const c = Math.floor(y / 100);
        let adj = m < 3 ? 1 : 0;
        let jd = Math.floor(365.25 * (y - adj + 4716)) + Math.floor(30.6001 * ((m < 3 ? m + 12 : m) + 1)) + d - 1524.5;
        jd = jd - Math.floor(c / 4) + c + 2;
        return ((jd - 2451550.1) % 29.53058867 + 29.53058867) % 29.53058867;
    }
};
