// =====================================================
// config.js - 設定・定数
// =====================================================
// 修正時: APIエンドポイント、更新間隔、キャッシュ設定など
//
// ※このファイルはindex.htmlで最初に読み込む必要があります

// 軽量スプレッドシート（2.5日分のみ、高速読み込み用）
const SPREADSHEET_ID = '1Lg-d0fJU9sw8rYoCE0LhZh8bLN8ba6OthsanTM5Y5OU';
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;

// 既存スプレッドシート（週間・月間・年間グラフ、AI分析用）
const ARCHIVE_SPREADSHEET_ID = '1nbmJIIUzw8n2PcHp98NaiKnaAVciBx_Egpokjjx7uW8';
const ARCHIVE_BASE_URL = `https://docs.google.com/spreadsheets/d/${ARCHIVE_SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;

// 軽量シートから取得（現在の気温・湿度、今日の最高/最低、直近24時間）
const SUMMARY_URL = `${BASE_URL}&sheet=Summary`;
const RECENT_URL = `${BASE_URL}&sheet=Data`;

// 既存シートから取得（年間最高/最低、データ件数、日別・週間データ）
const ARCHIVE_SUMMARY_URL = `${ARCHIVE_BASE_URL}&sheet=Summary`;
const DAILY_URL = `${ARCHIVE_BASE_URL}&sheet=Daily`;
const WEEKLY_URL = `${ARCHIVE_BASE_URL}&sheet=Weekly`;

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

// グローバル状態変数
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
