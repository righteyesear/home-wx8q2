// =====================================================
// moon.js - 月の計算・表示
// =====================================================
// 修正時: 月齢計算、月の出入り時刻、月弧表示など
//
// 主要な関数:
// - loadMoonData() - 月データ読込・表示
// - calculateMoonPhase() - 月齢計算
// - calculateMoonPosition() - 月位置計算
// - updateMoonArcPosition() - 月弧表示更新
//
// 依存: なし（独立したモジュール）

// Global cache for moon arc real-time updates
let cachedMoonTimes = null;
let moonPositionInterval = null;

async function loadMoonData() {
    const now = new Date(); // Real-time mode
    const LAT = 35.7785;
    const LON = 139.878;

    // Calculate local values (fallback - only used when API fails)
    const moonData = calculateMoonPhase(now);
    const moonPos = calculateMoonPosition(now, LAT, LON);
    let moonTimes = calculateMoonTimes(now, LAT, LON);

    // Data source tracking
    let dataSource = 'calculation'; // 'api' or 'calculation'
    let apiSuccess = false;
    let displayAge = moonData.age;
    let displayIllumination = moonData.illumination * 100;

    // Try to load API data from moon_data.json (PRIMARY SOURCE)
    try {
        const resp = await fetch('moon_data.json?_=' + Date.now());
        if (resp.ok) {
            const apiData = await resp.json();

            // Check if API data is complete (all required fields present)
            const hasCompleteData = (
                apiData.moon_age !== null && apiData.moon_age !== undefined &&
                apiData.illumination !== null && apiData.illumination !== undefined
            );

            if (hasCompleteData) {
                // Use API data exclusively (no mixing)
                apiSuccess = true;
                dataSource = 'api';
                displayAge = apiData.moon_age;
                displayIllumination = apiData.illumination;

                // Override times with API values
                if (apiData.moonrise && apiData.moonrise !== '--:--') {
                    moonTimes.rise = apiData.moonrise;
                }
                if (apiData.moonset && apiData.moonset !== '--:--') {
                    moonTimes.set = apiData.moonset;
                    if (apiData.moonset_is_tomorrow) {
                        moonTimes.setIsTomorrow = true;
                    }
                }
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

                console.log('[Moon] ✅ Using API data:',
                    'Age:', displayAge.toFixed(1),
                    'Illumination:', displayIllumination + '%',
                    'Rise:', apiData.moonrise, '(' + apiData.moonrise_direction + ')',
                    'Set:', apiData.moonset, '(' + apiData.moonset_direction + ')');
            } else {
                console.log('[Moon] ⚠️ API data incomplete, falling back to calculation');
            }
        }
    } catch (e) {
        console.log('[Moon] ❌ API fetch failed:', e.message);
    }

    // If API failed or data incomplete, use calculation (FALLBACK)
    if (!apiSuccess) {
        dataSource = 'calculation';
        displayAge = moonData.age;
        displayIllumination = moonData.illumination * 100;
        console.log('[Moon] 📐 Using calculated data:',
            'Age:', displayAge.toFixed(1),
            'Illumination:', displayIllumination.toFixed(1) + '%');
    }

    // Display values (consistent source - no mixing)
    document.getElementById('moonAge').textContent = displayAge.toFixed(1);
    document.getElementById('moonIllumination').textContent = Math.round(displayIllumination);

    // Add data source indicator to console for debugging
    console.log('[Moon] Data source:', dataSource.toUpperCase());

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

    // 満月名はcalculateMoonPhase()からの結果を使用（一元管理）
    const month = now.getMonth() + 1;
    // moonDataにはfullMoonName/fullMoonColorが含まれる（満月時のみ）

    // 満月の瞬間までの時間を計算
    const targetFullMoonAge = 14.765;
    const hoursToFullMoon = (targetFullMoonAge - moonData.age) * 24;
    const isFullMoonTonight = hoursToFullMoon > 0 && hoursToFullMoon <= 18;

    if (moonData.fullMoonName) {
        // 満月条件達成時: 月名にムーン名表示、バッジにムーン名とテーマカラー
        moonPhaseNameEl.innerHTML = `${moonData.phaseName}<br><span style="font-size: 0.85em; color: ${moonData.fullMoonColor};">🌟 ${moonData.fullMoonName}</span>`;
        moonIconEl.style.filter = `drop-shadow(0 0 12px ${moonData.fullMoonColor}) drop-shadow(0 0 24px ${moonData.fullMoonColor})`;
        moonIconEl.style.color = moonData.fullMoonColor;

        // バッジにムーン名とテーマカラー（calculateMoonPhaseからの結果を使用）
        if (nextPhaseTextEl) {
            nextPhaseTextEl.textContent = moonData.fullMoonName;
            nextPhaseTextEl.style.background = moonData.fullMoonColor;
            nextPhaseTextEl.style.color = '#0f172a';
            nextPhaseTextEl.style.textShadow = `0 0 8px ${moonData.fullMoonColor}`;
        }

        // 通知エリアは非表示
        if (fullMoonNoticeEl) fullMoonNoticeEl.style.display = 'none';
    } else {
        moonPhaseNameEl.textContent = moonData.phaseName;
        moonIconEl.style.filter = '';
        moonIconEl.style.color = '';

        if (isFullMoonTonight) {
            // 満月の日だが条件未達: 通知エリアに表示、バッジに「満月🌕」
            // 今夜の満月情報を取得（FULL_MOON_NAMESから）
            const tonightMoonInfo = FULL_MOON_NAMES[month];
            if (fullMoonNoticeEl && fullMoonNoticeTextEl && tonightMoonInfo) {
                fullMoonNoticeTextEl.innerHTML = `🌕 今夜は満月（<span style="color: ${tonightMoonInfo.color};">${tonightMoonInfo.name}</span>）が見られます`;
                fullMoonNoticeEl.style.display = 'block';
                fullMoonNoticeEl.style.borderColor = tonightMoonInfo.color;
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

        // リアルタイムで月齢・輝面率も更新（APIデータがない場合のみ）
        // 注意: APIからのデータがloadMoonData()で設定されていればそちらを優先
        // ここでは位置更新のみ行い、月齢・輝面率はAPIからのデータを維持
    }, 60000); // 60 seconds

    console.log('[Moon] Real-time position updates started (60s interval)');
}

// =====================================================
// 満月名の定義（一元管理）
// =====================================================
const FULL_MOON_NAMES = {
    1: { name: 'ウルフムーン', nameEn: 'Wolf Moon', color: '#a3c4dc' },
    2: { name: 'スノームーン', nameEn: 'Snow Moon', color: '#e8f4fc' },
    3: { name: 'ワームムーン', nameEn: 'Worm Moon', color: '#c9a87c' },
    4: { name: 'ピンクムーン', nameEn: 'Pink Moon', color: '#f8b4c4' },
    5: { name: 'フラワームーン', nameEn: 'Flower Moon', color: '#f0e68c' },
    6: { name: 'ストロベリームーン', nameEn: 'Strawberry Moon', color: '#ff9999' },
    7: { name: 'バックムーン', nameEn: 'Buck Moon', color: '#daa520' },
    8: { name: 'スタージョンムーン', nameEn: 'Sturgeon Moon', color: '#87ceeb' },
    9: { name: 'ハーベストムーン', nameEn: 'Harvest Moon', color: '#ff8c00' },
    10: { name: 'ハンターズムーン', nameEn: "Hunter's Moon", color: '#cd5c5c' },
    11: { name: 'ビーバームーン', nameEn: 'Beaver Moon', color: '#8b4513' },
    12: { name: 'コールドムーン', nameEn: 'Cold Moon', color: '#b0c4de' }
};

function calculateMoonPhase(date) {
    // Reference new moon: Jan 6, 2000 18:14 UTC
    const refNewMoon = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
    const synodic = 29.53058867; // Synodic month in days

    const daysSinceRef = (date - refNewMoon) / (1000 * 60 * 60 * 24);
    const age = daysSinceRef % synodic;
    const normalizedAge = age < 0 ? age + synodic : age;

    // Phase (0-1)
    const phase = normalizedAge / synodic;

    // ========================================
    // Improved illumination calculation
    // Using elongation angle (more accurate than simple cosine)
    // ========================================
    // Moon phase angle in degrees (0° = new moon, 180° = full moon)
    const phaseAngleDeg = phase * 360;

    // Elongation: angle between Sun and Moon as seen from Earth
    // At new moon = 0°, at full moon = 180°
    // This is more accurate as it matches how APIs calculate it
    const elongationDeg = Math.abs(180 - Math.abs(phaseAngleDeg - 180));

    // Illumination based on elongation (same formula as API uses)
    // illumination = (1 - cos(elongation)) / 2
    const illumination = (1 - Math.cos(elongationDeg * Math.PI / 180)) / 2;

    // Phase name and emoji
    let phaseName, emoji, fullMoonName = null, fullMoonColor = null;

    // 月齢に基づく伝統的な和名（全30日分）
    const moonAge = Math.floor(normalizedAge);

    // 月齢から日数への漢数字マッピング
    const moonDayNames = {
        1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七',
        8: '八', 9: '九', 10: '十', 11: '十一', 12: '十二', 13: '十三',
        14: '十四', 15: '十五', 16: '十六', 17: '十七', 18: '十八',
        19: '十九', 20: '二十', 21: '二十一', 22: '二十二', 23: '二十三',
        24: '二十四', 25: '二十五', 26: '二十六', 27: '二十七', 28: '二十八',
        29: '二十九', 30: '三十'
    };

    if (normalizedAge < 0.5) {
        phaseName = '新月（朔）';
        emoji = '🌑';
    } else if (normalizedAge < 1.5) {
        phaseName = '二日月（繊月）';
        emoji = '🌑';
    } else if (normalizedAge < 2.5) {
        phaseName = '三日月';
        emoji = '🌒';
    } else if (normalizedAge < 3.5) {
        phaseName = '四日月';
        emoji = '🌒';
    } else if (normalizedAge < 4.5) {
        phaseName = '五日月';
        emoji = '🌒';
    } else if (normalizedAge < 5.5) {
        phaseName = '六日月';
        emoji = '🌒';
    } else if (normalizedAge < 6.5) {
        phaseName = '七日月（弓張月）';
        emoji = '🌒';
    } else if (normalizedAge < 7.5) {
        phaseName = '上弦の月';
        emoji = '🌓';
    } else if (normalizedAge < 8.5) {
        phaseName = '八日月';
        emoji = '🌓';
    } else if (normalizedAge < 9.5) {
        phaseName = '九日月';
        emoji = '🌓';
    } else if (normalizedAge < 10.5) {
        phaseName = '十日夜（とおかんや）';
        emoji = '🌔';
    } else if (normalizedAge < 11.5) {
        phaseName = '十一日月';
        emoji = '🌔';
    } else if (normalizedAge < 12.5) {
        phaseName = '十二日月';
        emoji = '🌔';
    } else if (normalizedAge < 13.5) {
        phaseName = '十三夜';
        emoji = '🌔';
    } else if (normalizedAge < 14.5) {
        phaseName = '小望月（待宵月）';
        emoji = '🌔';
    } else if (normalizedAge >= 14.5 && normalizedAge < 15.5 && illumination >= 0.95) {
        // 満月判定: 月齢14.5〜15.5かつ輝面率95%以上
        // この条件により、月齢と輝面率の両方を考慮した正確な判定が可能
        const currentMonth = date.getMonth() + 1;
        const moonInfo = FULL_MOON_NAMES[currentMonth];
        phaseName = '満月（望月）';
        emoji = '🌕';
        fullMoonName = moonInfo.name;
        fullMoonColor = moonInfo.color;
    } else if (normalizedAge < 17.0) {
        // 月齢15.5以上17未満で輝面率が95%未満の場合（満月直後）
        phaseName = '十六夜（いざよい）';
        emoji = '🌕';
    } else if (normalizedAge < 18.0) {
        phaseName = '立待月（たちまちづき）';
        emoji = '🌖';
    } else if (normalizedAge < 19.0) {
        phaseName = '居待月（いまちづき）';
        emoji = '🌖';
    } else if (normalizedAge < 20.0) {
        phaseName = '寝待月（臥待月）';
        emoji = '🌖';
    } else if (normalizedAge < 21.0) {
        phaseName = '更待月（ふけまちづき）';
        emoji = '🌖';
    } else if (normalizedAge < 22.5) {
        phaseName = '下弦の月';
        emoji = '🌗';
    } else if (normalizedAge < 23.5) {
        phaseName = '二十三夜';
        emoji = '🌗';
    } else if (normalizedAge < 24.5) {
        phaseName = '二十四日月';
        emoji = '🌘';
    } else if (normalizedAge < 25.5) {
        phaseName = '二十五日月';
        emoji = '🌘';
    } else if (normalizedAge < 26.5) {
        phaseName = '二十六夜（有明の月）';
        emoji = '🌘';
    } else if (normalizedAge < 27.5) {
        phaseName = '二十七日月';
        emoji = '🌘';
    } else if (normalizedAge < 28.5) {
        phaseName = '二十八日月';
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

    // Fallback directions (simplified) if not found
    let riseDirJp = age < 14.77 ? '東南東' : '東北東';
    let setDirJp = age < 14.77 ? '西南西' : '西北西';

    if (riseAzimuth) riseDirJp = getJapaneseCompassDirection(riseAzimuth);
    if (setAzimuth) setDirJp = getJapaneseCompassDirection(setAzimuth);

    // Determine if moonset is tomorrow
    let setIsTomorrow = false;
    if (rise && !set) {
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

    let t = 0.5;
    let isVisible = false;

    // Case 1: Both rise and set times available today
    if (riseHour !== null && setHour !== null && !moonTimes.setIsTomorrow) {
        if (currentHour >= riseHour && currentHour <= setHour) {
            const duration = setHour - riseHour;
            t = duration > 0 ? (currentHour - riseHour) / duration : 0.5;
            isVisible = true;
        } else if (currentHour < riseHour) {
            t = 0;
            isVisible = false;
        } else {
            t = 1;
            isVisible = false;
        }
    }
    // Case 2: Moonset is tomorrow
    else if (riseHour !== null && (moonTimes.setIsTomorrow || setHour === null)) {
        if (currentHour >= riseHour) {
            isVisible = true;
            const hoursSinceRise = currentHour - riseHour;
            t = Math.min(0.9, hoursSinceRise / 12);
        } else if (moonTimes.setIsTomorrow && setHour !== null && currentHour <= setHour) {
            isVisible = true;
            const hoursSinceRise = (24 - riseHour) + currentHour;
            const totalDuration = (24 - riseHour) + setHour;
            t = Math.min(0.95, hoursSinceRise / totalDuration);
        } else if (currentHour < riseHour && (!moonTimes.setIsTomorrow || setHour === null)) {
            t = 0;
            isVisible = false;
        } else {
            t = 1;
            isVisible = false;
        }
    }
    // Case 3: No rise today but maybe set
    else if (riseHour === null && setHour !== null) {
        if (currentHour <= setHour) {
            isVisible = true;
            t = 0.5 + (currentHour / setHour) * 0.5;
        } else {
            t = 1;
            isVisible = false;
        }
    }
    // Case 4: No data for either
    else {
        isVisible = moonPos.altitude > 0;
        t = 0.5;
    }

    // =====================================================
    // 重要: 高度による最終判定（時間ベースの判定を上書き）
    // =====================================================
    // 時間ベースの判定では月が出ているはずでも、
    // 実際の高度が負の場合は地平線下として扱う
    // これによりAPIデータと計算データの不整合を解消
    if (moonPos.altitude <= 0) {
        isVisible = false;
        // 高度に基づいて弧上のおおよその位置を推定
        // 地平線下の場合、月の出前か月の入り後かを高度から推測
        if (riseHour !== null && currentHour < riseHour) {
            t = 0; // 月の出前
        } else if (setHour !== null && currentHour > setHour) {
            t = 1; // 月の入り後
        }
    } else {
        // 高度が正の場合は可視とする（時間ベースの判定を上書き）
        isVisible = true;
    }

    const clampedT = Math.max(0, Math.min(1, t));

    // SVG Coordinates
    const P0 = { x: 40, y: 150 };
    const P1 = { x: 170, y: -20 };
    const P2 = { x: 300, y: 150 };

    // Quadratic bezier calculation
    const mt = 1 - clampedT;
    const x = mt * mt * P0.x + 2 * mt * clampedT * P1.x + clampedT * clampedT * P2.x;
    const y = mt * mt * P0.y + 2 * mt * clampedT * P1.y + clampedT * clampedT * P2.y;

    const finalY = isVisible ? y : 160;
    const opacity = isVisible ? 1 : 0.4;
    const fillColor = isVisible ? '#fbbf24' : '#94a3b8';

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
            const altText = `${Math.round(moonPos.altitude)}°`;
            const dirText = getJapaneseCompassDirection(moonPos.azimuth);
            moonInfoText.textContent = `${dirText} ${altText}`;
            moonInfoBg.setAttribute('fill', 'rgba(15,23,42,0.8)');
            moonInfoText.setAttribute('fill', '#fbbf24');

            const textWidth = 80;
            moonInfoBg.setAttribute('width', textWidth);
            moonInfoBg.setAttribute('x', -textWidth / 2);
            moonInfoBg.setAttribute('y', -10);

            const labelY = y - 25;
            const safeLabelY = Math.max(20, labelY);

            moonInfoGroup.setAttribute('transform', `translate(${x}, ${safeLabelY})`);
            moonInfoGroup.setAttribute('opacity', 1);
        } else {
            moonInfoText.textContent = '地平線下';
            moonInfoBg.setAttribute('fill', 'rgba(30,41,59,0.9)');
            moonInfoText.setAttribute('fill', '#94a3b8');

            const textWidth = 70;
            moonInfoBg.setAttribute('width', textWidth);
            moonInfoBg.setAttribute('x', -textWidth / 2);
            moonInfoBg.setAttribute('y', -10);

            moonInfoGroup.setAttribute('transform', `translate(${x}, 175)`);
            moonInfoGroup.setAttribute('opacity', 0.8);
        }
    }
}

// Call moon data on load
document.addEventListener('DOMContentLoaded', loadMoonData);
