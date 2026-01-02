#!/usr/bin/env python3
"""
AI気象アドバイザー - Gemini 3 Flash Thinking による総合分析
データ収集 → Gemini API（Thinking有効）で分析 → ai_comment.json 出力
"""

import os
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from pathlib import Path

# JST タイムゾーン（GitHub ActionsはUTCで動くため必要）
JST = timezone(timedelta(hours=9))

# .env ファイルから環境変数を読み込み
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

from google import genai
from data_analysis import analyze_data_comprehensive

# =============================================================================
# 設定
# =============================================================================
SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID', '1nbmJIIUzw8n2PcHp98NaiKnaAVciBx_Egpokjjx7uW8')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

# 更新スケジュール（JST時間）
# 昼間（7-22時）: 毎時、夜間: 1時, 4時
UPDATE_HOURS = [1, 4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]

# 東京都葛飾区東金町5丁目
LATITUDE = 35.7727
LONGITUDE = 139.8680
AREA_CODE = '1312200'  # 葛飾区


# =============================================================================
# 月齢・暦計算
# =============================================================================
def get_moon_phase(date: datetime = None) -> Dict[str, Any]:
    """月齢と月相を計算"""
    import math
    if date is None:
        date = datetime.now(JST)
    
    # 基準日: 2000年1月6日 18:14 UTC（新月）
    base = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)
    diff = (date - base).total_seconds()
    synodic_month = 29.530588853  # 朔望月（日）
    
    moon_age = (diff / 86400) % synodic_month
    
    # 月相を判定
    if moon_age < 1.85:
        phase = "新月"
        emoji = "🌑"
    elif moon_age < 5.53:
        phase = "三日月"
        emoji = "🌒"
    elif moon_age < 9.22:
        phase = "上弦の月"
        emoji = "🌓"
    elif moon_age < 12.91:
        phase = "十三夜月"
        emoji = "🌔"
    elif moon_age < 16.61:
        phase = "満月"
        emoji = "🌕"
    elif moon_age < 20.30:
        phase = "十八夜月"
        emoji = "🌖"
    elif moon_age < 23.99:
        phase = "下弦の月"
        emoji = "🌗"
    else:
        phase = "二十六夜月"
        emoji = "🌘"
    
    return {
        'age': round(moon_age, 1),
        'phase': phase,
        'emoji': emoji
    }


def get_solar_term(date: datetime = None) -> Dict[str, Any]:
    """二十四節気を取得"""
    if date is None:
        date = datetime.now(JST)
    
    # 2024-2025年の二十四節気（簡易版）
    solar_terms = [
        (1, 6, "小寒"),    (1, 20, "大寒"),
        (2, 4, "立春"),    (2, 19, "雨水"),
        (3, 5, "啓蟄"),    (3, 20, "春分"),
        (4, 4, "清明"),    (4, 20, "穀雨"),
        (5, 5, "立夏"),    (5, 21, "小満"),
        (6, 5, "芒種"),    (6, 21, "夏至"),
        (7, 7, "小暑"),    (7, 22, "大暑"),
        (8, 7, "立秋"),    (8, 23, "処暑"),
        (9, 7, "白露"),    (9, 23, "秋分"),
        (10, 8, "寒露"),   (10, 23, "霜降"),
        (11, 7, "立冬"),   (11, 22, "小雪"),
        (12, 7, "大雪"),   (12, 22, "冬至"),
    ]
    
    month, day = date.month, date.day
    current_term = None
    next_term = None
    days_until_next = None
    
    for i, (m, d, name) in enumerate(solar_terms):
        term_date = datetime(date.year, m, d, tzinfo=JST)
        if (month, day) >= (m, d):
            current_term = name
            # 次の節気
            next_idx = (i + 1) % len(solar_terms)
            next_m, next_d, next_name = solar_terms[next_idx]
            next_year = date.year if next_m > m else date.year + 1
            next_date = datetime(next_year, next_m, next_d, tzinfo=JST)
            next_term = next_name
            days_until_next = (next_date - date).days
    
    # 年初で前年の冬至を引き継ぐ場合
    if current_term is None:
        current_term = "冬至"
        next_term = "小寒"
        days_until_next = (datetime(date.year, 1, 6, tzinfo=JST) - date).days
    
    return {
        'current': current_term,
        'next': next_term,
        'days_until_next': days_until_next
    }


# =============================================================================
# 体感温度計算（物理モデル）
# =============================================================================
def calculate_feels_like(temp: float, humidity: float, wind_speed_10m: float) -> float:
    """
    体感温度を計算（3帯域物理モデル + 微風補正）
    - wind_speed_10m: Open-Meteoの風速（10m高さ）を0.6倍して2m高さに補正
    - テテンスの式で水蒸気圧を算出
    - 温度帯に応じて3つの計算式を使い分け
    - 風速1.3m/s未満の場合は影響を線形に減少（微風時の過剰補正を防止）
    """
    import math
    
    # 風速補正（10m → 2m）
    v = max(0, wind_speed_10m * 0.6)
    
    # 微風閾値（この値未満では風の影響を線形に減少させる）
    MIN_WIND_THRESHOLD = 1.3
    
    # テテンスの式で水蒸気圧(hPa)を算出
    e = 6.11 * math.pow(10, (7.5 * temp) / (temp + 237.3)) * (humidity / 100)
    
    def wind_chill(temp, v):
        """リンケの風冷指数（寒冷時）"""
        if v <= 0:
            return temp
        v_kmh = v * 3.6  # m/s → km/h
        return 13.12 + 0.6215 * temp - 11.37 * math.pow(v_kmh, 0.16) + 0.3965 * temp * math.pow(v_kmh, 0.16)
    
    def steadman(temp, e, v):
        """ステッドマンの式（中間温度帯）"""
        return temp + 0.33 * e - 0.70 * v - 4.0
    
    def heat_index(temp, humidity):
        """暑さ指数（高温時）"""
        c1, c2, c3, c4 = -8.78469475556, 1.61139411, 2.33854883889, -0.14611605
        c5, c6, c7, c8, c9 = -0.012308094, -0.0164248277778, 0.002211732, 0.00072546, -0.000003582
        return (c1 + c2 * temp + c3 * humidity + c4 * temp * humidity 
                + c5 * temp * temp + c6 * humidity * humidity 
                + c7 * temp * temp * humidity + c8 * temp * humidity * humidity 
                + c9 * temp * temp * humidity * humidity)
    
    def lerp(a, b, t):
        """線形補間"""
        t = max(0, min(1, t))
        return a + (b - a) * t
    
    # 温度帯に応じて計算式を選択（境界は線形補間）
    if temp <= 8:
        raw_result = wind_chill(temp, v)
    elif temp <= 12:
        wc = wind_chill(temp, v)
        st = steadman(temp, e, v)
        t = (temp - 8) / 4
        raw_result = lerp(wc, st, t)
    elif temp <= 25:
        raw_result = steadman(temp, e, v)
    elif temp <= 29:
        st = steadman(temp, e, v)
        hi = heat_index(temp, humidity)
        t = (temp - 25) / 4
        raw_result = lerp(st, hi, t)
    else:
        raw_result = heat_index(temp, humidity)
    
    # 微風補正: 風速が MIN_WIND_THRESHOLD 未満の場合、
    # 計算結果と実気温の間を線形補間して過剰補正を防止
    if v < MIN_WIND_THRESHOLD:
        wind_factor = v / MIN_WIND_THRESHOLD  # 0〜1の範囲
        return lerp(temp, raw_result, wind_factor)
    
    return raw_result


# =============================================================================
# データ取得関数
# =============================================================================

def fetch_spreadsheet_data() -> Dict[str, Any]:
    """
    Google Spreadsheetから温湿度データを取得（強化版）
    - 全レコードを取得（1分毎×12000件）
    - analyze_data_comprehensive で包括的分析を実行
    """
    base_url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv"
    
    result = {
        'current': {},
        'analysis': {},         # 包括的分析結果
        'daily_detailed': [],   # 日別詳細（互換性維持）
        'weekly_trend': {},     # 週間傾向（互換性維持）
        'error': None
    }
    
    try:
        # ========================================
        # 1. Summary シート（現在値 + 履歴統計）
        # ========================================
        summary_url = f"{base_url}&sheet=Summary"
        resp = requests.get(summary_url, timeout=10)
        resp.raise_for_status()
        
        result['summary_raw'] = []  # 生データも保存
        for line in resp.text.strip().split('\n'):
            parts = line.replace('"', '').split(',')
            if len(parts) >= 2:
                label, value = parts[0].strip(), parts[1].strip()
                result['summary_raw'].append({'label': label, 'value': value})
                
                if '現在の気温' in label:
                    result['current']['temperature'] = float(value)
                elif '現在の湿度' in label:
                    result['current']['humidity'] = float(value)
                elif '今日の最高' in label:
                    result['current']['today_high'] = float(value)
                elif '今日の最低' in label:
                    result['current']['today_low'] = float(value)
                # 追加: 履歴統計データを取得
                elif '過去最高' in label or '歴代最高' in label:
                    try:
                        result['current']['all_time_high'] = float(value)
                    except: pass
                elif '過去最低' in label or '歴代最低' in label:
                    try:
                        result['current']['all_time_low'] = float(value)
                    except: pass
                elif '昨日の最高' in label:
                    try:
                        result['current']['yesterday_high'] = float(value)
                    except: pass
                elif '昨日の最低' in label:
                    try:
                        result['current']['yesterday_low'] = float(value)
                    except: pass
        
        # ========================================
        # 2. Recent シート（全レコード取得）
        # ========================================
        recent_url = f"{base_url}&sheet=Recent"
        resp = requests.get(recent_url, timeout=30)  # タイムアウト延長
        resp.raise_for_status()
        
        lines = resp.text.strip().split('\n')[1:]  # ヘッダースキップ
        all_records = []
        for line in lines:
            parts = line.replace('"', '').split(',')
            if len(parts) >= 3:
                try:
                    all_records.append({
                        'datetime': parts[0].strip(),
                        'temperature': float(parts[1].strip()),
                        'humidity': float(parts[2].strip())
                    })
                except ValueError:
                    continue
        
        print(f"  → Recentシート: {len(all_records)}件のレコードを取得")
        
        # ========================================
        # 3. 包括的分析を実行
        # ========================================
        if all_records:
            # 生データも保存（テスト用）
            result['raw_records'] = all_records
            result['analysis'] = analyze_data_comprehensive(all_records)
            
            # 互換性のため一部データをトップレベルにも配置
            if 'daily_summary' in result['analysis']:
                result['daily_detailed'] = result['analysis']['daily_summary']
            if 'statistics' in result['analysis']:
                result['weekly_trend'] = {
                    'week_high': result['analysis']['statistics'].get('temp_max'),
                    'week_low': result['analysis']['statistics'].get('temp_min'),
                    'avg_high': result['analysis']['statistics'].get('temp_mean'),
                }
        
        # ========================================
        # 4. Daily シート（全履歴データを取得）
        # ========================================
        try:
            daily_url = f"{base_url}&sheet=Daily"
            resp = requests.get(daily_url, timeout=15)
            resp.raise_for_status()
            
            lines = resp.text.strip().split('\n')[1:]  # ヘッダースキップ
            result['daily_all'] = []  # 全履歴データ
            
            for line in lines:
                parts = line.replace('"', '').split(',')
                if len(parts) >= 3:
                    try:
                        day = {
                            'date': parts[0].strip(),
                            'high': float(parts[1].strip()) if parts[1].strip() else None,
                            'low': float(parts[2].strip()) if parts[2].strip() else None,
                            'avg': float(parts[3].strip()) if len(parts) > 3 and parts[3].strip() else None
                        }
                        if day['high'] is not None and day['low'] is not None:
                            day['range'] = day['high'] - day['low']
                        result['daily_all'].append(day)
                    except ValueError:
                        continue
            
            print(f"  → Dailyシート: {len(result['daily_all'])}日分のデータを取得")
            
            # 直近7日分は daily_detailed にも追加（重複チェック）
            for day in result['daily_all'][-7:]:
                existing_dates = [d.get('date') for d in result['daily_detailed']]
                if day['date'] not in existing_dates:
                    result['daily_detailed'].append(day)
            
            # 履歴統計を計算
            if result['daily_all']:
                all_highs = [d['high'] for d in result['daily_all'] if d.get('high') is not None]
                all_lows = [d['low'] for d in result['daily_all'] if d.get('low') is not None]
                all_avgs = [d['avg'] for d in result['daily_all'] if d.get('avg') is not None]
                
                if all_highs:
                    result['history_stats'] = {
                        'record_high': max(all_highs),
                        'record_low': min(all_lows) if all_lows else None,
                        'avg_high': sum(all_highs) / len(all_highs),
                        'avg_low': sum(all_lows) / len(all_lows) if all_lows else None,
                        'avg_temp': sum(all_avgs) / len(all_avgs) if all_avgs else None,
                        'total_days': len(result['daily_all'])
                    }
                    
        except Exception as e:
            print(f"  [WARN] Dailyシート取得エラー: {e}")
            
    except Exception as e:
        result['error'] = str(e)
    
    return result


def fetch_weather_forecast() -> Dict[str, Any]:
    """Open-Meteo APIから天気予報を取得"""
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={LATITUDE}&longitude={LONGITUDE}"
        f"&current=weather_code,temperature_2m,relative_humidity_2m,apparent_temperature,"
        f"precipitation,wind_speed_10m,wind_gusts_10m,uv_index"
        f"&hourly=weather_code,temperature_2m,precipitation_probability,wind_speed_10m,"
        f"temperature_850hPa,temperature_925hPa,wet_bulb_temperature_2m,freezing_level_height"
        f"&daily=sunrise,sunset,uv_index_max,precipitation_probability_max"
        f"&forecast_days=2&timezone=Asia/Tokyo&wind_speed_unit=ms"
    )
    
    result = {
        'current': {},
        'hourly_forecast': [],
        'daily': {},
        'error': None
    }
    
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        # 現在の天気
        if 'current' in data:
            current = data['current']
            result['current'] = {
                'weather_code': current.get('weather_code', 0),
                'temperature': current.get('temperature_2m'),
                'humidity': current.get('relative_humidity_2m'),
                'feels_like': current.get('apparent_temperature'),
                'precipitation': current.get('precipitation', 0),
                'wind_speed': current.get('wind_speed_10m'),
                'wind_gusts': current.get('wind_gusts_10m'),
                'uv_index': current.get('uv_index', 0)
            }
        
        # 今後6時間の予報 + 雪判定データ
        if 'hourly' in data:
            hourly = data['hourly']
            now_hour = datetime.now().hour
            
            # 現在時刻の雪判定データを追加
            result['snow_detection'] = {
                'temp_850hPa': hourly.get('temperature_850hPa', [None] * 24)[now_hour],
                'temp_925hPa': hourly.get('temperature_925hPa', [None] * 24)[now_hour],
                'wet_bulb': hourly.get('wet_bulb_temperature_2m', [None] * 24)[now_hour],
                'freezing_level': hourly.get('freezing_level_height', [None] * 24)[now_hour]
            }
            
            for i in range(now_hour, min(now_hour + 6, len(hourly.get('time', [])))):
                forecast_entry = {
                    'time': hourly['time'][i] if 'time' in hourly else None,
                    'weather_code': hourly['weather_code'][i] if 'weather_code' in hourly else None,
                    'temperature': hourly['temperature_2m'][i] if 'temperature_2m' in hourly else None,
                    'precip_prob': hourly['precipitation_probability'][i] if 'precipitation_probability' in hourly else 0,
                    'wind_speed': hourly['wind_speed_10m'][i] if 'wind_speed_10m' in hourly else None,
                    # 雪判定用データ
                    'temp_850hPa': hourly.get('temperature_850hPa', [None] * 24)[i] if i < len(hourly.get('temperature_850hPa', [])) else None,
                    'temp_925hPa': hourly.get('temperature_925hPa', [None] * 24)[i] if i < len(hourly.get('temperature_925hPa', [])) else None,
                    'wet_bulb': hourly.get('wet_bulb_temperature_2m', [None] * 24)[i] if i < len(hourly.get('wet_bulb_temperature_2m', [])) else None,
                    'freezing_level': hourly.get('freezing_level_height', [None] * 24)[i] if i < len(hourly.get('freezing_level_height', [])) else None
                }
                result['hourly_forecast'].append(forecast_entry)
        
        # 日別データ（日の出・日の入り）
        if 'daily' in data:
            daily = data['daily']
            result['daily'] = {
                'sunrise': daily.get('sunrise', [None])[0],
                'sunset': daily.get('sunset', [None])[0],
                'uv_index_max': daily.get('uv_index_max', [0])[0],
                'precip_prob_max': daily.get('precipitation_probability_max', [0])[0]
            }
            
    except Exception as e:
        result['error'] = str(e)
    
    return result


def fetch_jma_alerts() -> Dict[str, Any]:
    """気象庁APIから警報・注意報を取得"""
    url = "https://www.jma.go.jp/bosai/warning/data/warning/130000.json"
    
    result = {
        'alerts': [],
        'special_warnings': [],
        'warnings': [],
        'advisories': [],
        'error': None
    }
    
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        # 葛飾区のアラートを抽出
        for area in data.get('areaTypes', []):
            for region in area.get('areas', []):
                if region.get('code') == AREA_CODE:
                    for warning in region.get('warnings', []):
                        if warning.get('status') == '発表':
                            alert_name = warning.get('name', '')
                            alert_info = {
                                'name': alert_name,
                                'code': warning.get('code'),
                                'status': warning.get('status')
                            }
                            result['alerts'].append(alert_info)
                            
                            # 優先度分類
                            if '特別警報' in alert_name:
                                result['special_warnings'].append(alert_info)
                            elif '警報' in alert_name:
                                result['warnings'].append(alert_info)
                            elif '注意報' in alert_name:
                                result['advisories'].append(alert_info)
                                
    except Exception as e:
        result['error'] = str(e)
    
    return result


def fetch_yahoo_precipitation() -> Dict[str, Any]:
    """Yahoo天気APIから降水量データを取得（Cloudflare Worker経由）"""
    url = "https://yahoo-weather-proxy.miurayukimail.workers.dev"
    
    result = {
        'data': [],
        'current_rainfall': 0,
        'is_raining': False,
        'consecutive_minutes': 0,
        'error': None
    }
    
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        result['data'] = data.get('data', [])
        
        # 観測データのみ抽出
        observations = [d for d in result['data'] if d.get('type') == 'observation']
        
        if observations:
            # 最新の降水量
            latest = observations[-1]
            result['current_rainfall'] = latest.get('rainfall', 0)
            result['is_raining'] = result['current_rainfall'] > 0
            
            # 連続降水時間を計算
            consecutive_count = 0
            for obs in reversed(observations):
                if obs.get('rainfall', 0) > 0:
                    consecutive_count += 1
                else:
                    break
            result['consecutive_minutes'] = consecutive_count * 5  # 5分間隔
            
        print(f"  → Yahoo降水データ: 現在{result['current_rainfall']}mm/h, 連続{result['consecutive_minutes']}分")
            
    except Exception as e:
        result['error'] = str(e)
        print(f"  [WARN] Yahoo降水データ取得エラー: {e}")
    
    return result


def weather_code_to_text(code: int) -> str:

    """天気コードを日本語に変換"""
    weather_map = {
        0: '快晴', 1: '晴れ', 2: '薄曇り', 3: '曇り',
        45: '霧', 48: '着氷性の霧',
        51: '弱い霧雨', 53: '霧雨', 55: '強い霧雨',
        61: '弱い雨', 63: '雨', 65: '強い雨',
        66: '着氷性の弱い雨', 67: '着氷性の雨',
        71: '弱い雪', 73: '雪', 75: '強い雪',
        77: '霧雪', 80: '弱いにわか雨', 81: 'にわか雨', 82: '強いにわか雨',
        85: '弱いにわか雪', 86: '強いにわか雪',
        95: '雷雨', 96: '雹を伴う雷雨', 99: '激しい雷雨'
    }
    return weather_map.get(code, '不明')


# =============================================================================
# Gemini API 分析
# =============================================================================

def analyze_with_gemini(spreadsheet_data: Dict, weather_data: Dict, alerts_data: Dict) -> str:
    """Gemini 3 Flash で総合分析を実行"""
    
    if not GEMINI_API_KEY:
        return "⚠️ APIキーが設定されていません"
    
    # 現在時刻と詳細なコンテキスト情報を計算
    now = datetime.now(JST)
    time_str = now.strftime('%Y年%m月%d日 %H時%M分')
    current_hour = now.hour
    current_month = now.month
    current_day = now.day
    weekday_names = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日']
    weekday = weekday_names[now.weekday()]
    is_weekend = now.weekday() >= 5
    
    # 時間帯の判定
    if 4 <= current_hour < 6:
        time_period = "早朝"
        time_context = "まだ暗く、一日で最も冷え込む時間帯"
    elif 6 <= current_hour < 9:
        time_period = "朝"
        time_context = "通勤・通学の時間帯、日の出後で気温が上昇し始める"
    elif 9 <= current_hour < 12:
        time_period = "午前"
        time_context = "活動的な時間帯、気温が上昇中"
    elif 12 <= current_hour < 14:
        time_period = "昼"
        time_context = "昼食時、気温がピークに近づく"
    elif 14 <= current_hour < 17:
        time_period = "午後"
        time_context = "日中の最高気温を記録しやすい時間帯"
    elif 17 <= current_hour < 20:
        time_period = "夕方"
        time_context = "日没後、気温が下がり始める"
    elif 20 <= current_hour < 23:
        time_period = "夜"
        time_context = "就寝準備の時間帯、気温低下中"
    else:
        time_period = "深夜"
        time_context = "多くの人が就寝中、翌日の最低気温に向かって冷え込む"
    
    # 季節の判定
    if current_month in [12, 1, 2]:
        season = "冬"
        season_context = "一年で最も寒い季節。暖房、防寒、乾燥対策が重要"
    elif current_month in [3, 4, 5]:
        season = "春"
        season_context = "寒暖差が大きい季節。花粉、三寒四温に注意"
    elif current_month in [6, 7, 8]:
        season = "夏"
        season_context = "暑さ対策、熱中症予防、エアコン管理が重要"
    else:
        season = "秋"
        season_context = "朝晩の冷え込みが始まる季節。寒暖差に注意"
    
    # 年末年始・祝日などの特別日判定
    special_day = ""
    if current_month == 12 and current_day == 23:
        special_day = "天皇誕生日（旧）の翌日、年末が近づいています"
    elif current_month == 12 and current_day == 24:
        special_day = "クリスマスイブです🎄"
    elif current_month == 12 and current_day == 25:
        special_day = "クリスマスです🎄"
    elif current_month == 12 and 26 <= current_day <= 30:
        special_day = "年末です。大掃除や帰省の季節"
    elif current_month == 12 and current_day == 31:
        special_day = "大晦日です。良いお年を！"
    elif current_month == 1 and current_day <= 3:
        special_day = "お正月です🎍 新年あけましておめでとうございます"
    
    # 次回更新時刻を計算
    next_update_hour = None
    for h in UPDATE_HOURS:
        if h > current_hour:
            next_update_hour = h
            break
    if next_update_hour is None:
        next_update_hour = UPDATE_HOURS[0]  # 翌日の最初の時間
    
    next_update_str = f"{next_update_hour}:00"
    hours_until_next = (next_update_hour - current_hour) % 24
    if hours_until_next == 0:
        hours_until_next = UPDATE_HOURS[1] - UPDATE_HOURS[0] if len(UPDATE_HOURS) > 1 else 3
    
    # 体感温度と風速を事前計算（正しい値をAIに提供）
    current_weather = weather_data.get('current', {})
    api_wind_speed = current_weather.get('wind_speed', 0) or 0
    actual_wind_speed = api_wind_speed * 0.6  # 人が体感する地上2m高さの風速
    api_temp = current_weather.get('temperature', 0) or 0
    api_humidity = current_weather.get('humidity', 50) or 50
    actual_feels_like = calculate_feels_like(api_temp, api_humidity, api_wind_speed)
    
    # センサーの体感温度も計算
    sensor_temp = spreadsheet_data.get('current', {}).get('temperature', api_temp) or api_temp
    sensor_humidity = spreadsheet_data.get('current', {}).get('humidity', api_humidity) or api_humidity
    sensor_feels_like = calculate_feels_like(sensor_temp, sensor_humidity, api_wind_speed)
    
    # 月齢・暦情報を取得
    moon_info = get_moon_phase(now)
    solar_term = get_solar_term(now)
    
    # プロンプト構築開始
    prompt = f"""
╔══════════════════════════════════════════════════════════════════╗
║  あなたは「気象コンシェルジュ」です。                              ║
║  親しみやすく、でも的確なアドバイスで、ユーザーの一日を応援して。 ║
╚══════════════════════════════════════════════════════════════════╝

────────────────────────────────────────────────────────────────────
【あなたの思考プロセス】
────────────────────────────────────────────────────────────────────
以下のデータをすべて読み込んだ上で、「この人は今、何を知りたいか？何が役立つか？」を
深く深く考えてください。単なるデータの羅列ではなく、データから読み取れる「ストーリー」
を見つけ、ユーザーに寄り添ったアドバイスを生成してください。

考慮すべき視点：
- 今は{time_period}。{time_context}。
- 今日は{weekday}{'（週末）' if is_weekend else '（平日）'}。生活リズムが異なる。
- 季節は{season}。{season_context}。
{f'- 特別な日: {special_day}' if special_day else ''}
- 気温だけでなく「体感温度」が体に与える影響を重視。
- 過去のトレンドから「今日はいつもより寒い/暑い」を判断。
- 警報があれば最優先。なければ触れない。

────────────────────────────────────────────────────────────────────
【現在時刻・コンテキスト】
────────────────────────────────────────────────────────────────────
- 生成時刻: {time_str} ({weekday})
- 時間帯: {time_period}
- 季節: {season}
- 二十四節気: {solar_term['current']}（次は{solar_term['next']}まであと{solar_term['days_until_next']}日）
- 月齢: {moon_info['age']}（{moon_info['phase']}{moon_info['emoji']}）
- 次回更新: {next_update_str}頃（約{hours_until_next}時間後）

────────────────────────────────────────────────────────────────────
【屋外センサー（自宅軒下）の現在値】
────────────────────────────────────────────────────────────────────
- 現在の外気温: {sensor_temp}°C
- 現在の湿度: {sensor_humidity}%
- **体感温度: {sensor_feels_like:.1f}°C**（風速{actual_wind_speed:.1f}m/sを考慮した実際の肌感覚）
- 今日の最高気温（0時以降の記録）: {spreadsheet_data.get('current', {}).get('today_high', '不明')}°C
- 今日の最低気温（0時以降の記録）: {spreadsheet_data.get('current', {}).get('today_low', '不明')}°C

【重要】上記の「今日の最高/最低気温」は予報値ではなく、本日0時以降にセンサーで
記録された実測値です。朝の時間帯では、まだ日中の気温上昇前なので数値が低いのは
当然です。「今日の最高気温が5°Cだから寒い」のような判断は誤りです。
日中の気温予測はOpen-Meteo予報データを参照してください。

※ 体感温度は独自の物理モデル（風速補正＋ステッドマンの式）で算出。
   気温と体感温度の差が大きい場合、風や湿度の影響が強いことを意味します。

════════════════════════════════════════════════════════════════════════════════
【🌡️ 体感温度別 感覚・服装ガイド】（アドバイスの参考に）
════════════════════════════════════════════════════════════════════════════════

| 体感温度 | 体の感覚 | 推奨服装・対策 |
|---------|---------|--------------|
| -5°C以下 | 痛いほど寒い、凍える | ダウン+マフラー+手袋必須、露出厳禁 |
| -5〜0°C | 非常に寒い、手がかじかむ | 厚手コート+防寒小物、短時間でも完全防備 |
| 0〜5°C | かなり寒い、吐く息が白い | 冬用コート必須、重ね着推奨 |
| 5〜10°C | 肌寒い〜寒い | コートまたは厚手ジャケット |
| 10〜15°C | やや肌寒い | 薄手コートまたはカーディガン |
| 15〜20°C | 快適〜やや涼しい | 長袖シャツ、羽織もの1枚 |
| 20〜25°C | 快適 | 半袖〜長袖、過ごしやすい |
| 25〜30°C | 暖かい〜暑い | 半袖、通気性重視 |
| 30〜35°C | 暑い、汗ばむ | 軽装、日傘・帽子、水分補給 |
| 35°C以上 | 危険な暑さ | 外出控え、エアコン必須、熱中症警戒 |

════════════════════════════════════════════════════════════════════════════════
【⏰ 時間帯別 ユーザーの生活シーン】（今は{time_period}）
════════════════════════════════════════════════════════════════════════════════

| 時間帯 | 想定される行動 | 有効なアドバイスの例 |
|-------|-------------|------------------|
| 深夜(0-4時) | 就寝中、または夜更かし | 起床時の冷え込み予告、睡眠時の注意 |
| 早朝(4-6時) | 起床直後、早起きの人 | ヒートショック注意、朝の体感温度 |
| 朝(6-9時) | 出勤・通学準備、朝食 | 服装選び、傘の要否、日中の予報 |
| 午前(9-12時) | 仕事・学校・家事 | 日中の気温変化、午後の予報 |
| 昼(12-14時) | 昼休み、外出のチャンス | 外出に適した時間帯か、UV対策 |
| 午後(14-17時) | 仕事後半、子供の帰宅 | 夕方以降の冷え込み予告 |
| 夕方(17-20時) | 帰宅、買い物、夕食準備 | 帰路の防寒、夜の過ごし方 |
| 夜(20-23時) | リラックス、就寝準備 | 翌朝の最低気温予告、就寝時の注意 |

現在時刻に合わせて、ユーザーが「今知りたいこと」を想像してください。

════════════════════════════════════════════════════════════════════════════════
【🍂 季節別 特有のリスクと話題】（今は{season}）
════════════════════════════════════════════════════════════════════════════════

■ 冬（12-2月）
- ヒートショック（暖かい室内→寒い外）
- 乾燥（肌荒れ、喉の痛み、インフルエンザ）
- 路面凍結、結露
- クリスマス、年末年始、成人の日

■ 春（3-5月）
- 花粉症（スギ2-4月、ヒノキ3-5月）
- 三寒四温（寒暖差で体調崩しやすい）
- 黄砂、PM2.5
- 入学・新生活シーズン

■ 夏（6-8月）
- 熱中症（WBGT指数、水分補給）
- 紫外線（UV対策、日焼け）
- 台風シーズン
- 冷房病、寝苦しさ

■ 秋（9-11月）
- 朝晩の冷え込みと日中との寒暖差
- 秋晴れと突然の雨
- 台風（9-10月）
- 紅葉シーズン

════════════════════════════════════════════════════════════════════════════════
【😊 絵文字の使い方ガイド】
════════════════════════════════════════════════════════════════════════════════

状況に合わせて2〜4個程度使ってください。

■ 天気系
☀️:晴れ ⛅:曇り時々晴れ ☁️:曇り 🌧️:雨 ⛈️:雷雨 ❄️:雪 🌨️:みぞれ 🌫️:霧

■ 気温系
🥶:極寒 🧊:凍える 🌡️:気温注意 🔥:猛暑 ☃️:雪だるま(冬の象徴)

■ 行動系
🧥:防寒 🧣:マフラー 🧤:手袋 ☂️:傘 🌂:日傘 💧:水分補給 😷:マスク

■ 感情・応援系
😊:笑顔 ✨:キラキラ 💪:頑張れ ☺️:ほっこり 🌸:春 🍁:秋

■ 警告系
⚠️:注意 🚨:警報 ❗:重要 🔴:危険

────────────────────────────────────────────────────────────────────
【直近24時間の時系列データ】（30分ごと）
────────────────────────────────────────────────────────────────────
"""
    
    # ========================================
    # 包括的分析結果をプロンプトに追加
    # ========================================
    if spreadsheet_data.get('analysis'):
        analysis = spreadsheet_data['analysis']
        
        # 統計情報
        prompt += "\n====================================\n【統計分析】（12,000件から算出）\n====================================\n"
        if analysis.get('statistics'):
            st = analysis['statistics']
            prompt += f"""- 平均気温: {st.get('temp_mean', 0):.1f}°C
- 中央値: {st.get('temp_median', 0):.1f}°C
- 標準偏差: {st.get('temp_stdev', 0):.2f}°C
- 最高: {st.get('temp_max', 0):.1f}°C / 最低: {st.get('temp_min', 0):.1f}°C
- 気温レンジ: {st.get('temp_range', 0):.1f}°C
- 現在気温のパーセンタイル: {st.get('current_percentile', 50):.0f}%
- 現在気温のZスコア: {st.get('current_z_score', 0):.2f}
- 平均湿度: {st.get('humidity_mean', 0):.0f}%
"""
        
        # トレンド分析
        prompt += "\n====================================\n【トレンド分析】\n====================================\n"
        if analysis.get('trends'):
            tr = analysis['trends']
            prompt += f"""- 直近1時間の変化: {tr.get('change_rate_1h', 0):+.1f}°C
- 直近3時間の変化: {tr.get('total_change_3h', 0):+.1f}°C
- 変化速度: {tr.get('change_rate_3h', 0):+.2f}°C/時
- 加速度: {tr.get('acceleration', 0):+.2f}（{tr.get('acceleration_status', '不明')}）
"""
        
        # パターン分析
        prompt += "\n====================================\n【パターン分析】\n====================================\n"
        if analysis.get('patterns'):
            pt = analysis['patterns']
            if pt.get('time_slot_avg'):
                prompt += "■ 時間帯別平均気温:\n"
                for slot, temp in pt['time_slot_avg'].items():
                    prompt += f"  - {slot}: {temp}°C\n"
            if pt.get('vs_time_slot_avg') is not None:
                prompt += f"■ 現在 vs この時間帯の平均: {pt['vs_time_slot_avg']:+.1f}°C\n"
            if pt.get('vs_yesterday') is not None:
                prompt += f"■ 昨日同時刻との差: {pt['vs_yesterday']:+.1f}°C\n"
        
        # 異常検知
        prompt += "\n====================================\n【異常検知】\n====================================\n"
        if analysis.get('anomalies'):
            an = analysis['anomalies']
            prompt += f"- 現在の状態: {an.get('current_status', '正常範囲')}\n"
            if an.get('alerts'):
                prompt += "- 急変アラート:\n"
                for alert in an['alerts']:
                    prompt += f"  - {alert['time']}: {alert['direction']} ({alert['change']:+.1f}°C)\n"
        
        # 日別サマリー
        prompt += "\n====================================\n【日別サマリー】（直近7日）\n====================================\n"
        if analysis.get('daily_summary'):
            prompt += "| 日付 | 最高 | 最低 | 平均 | 日較差 |\n|------|------|------|------|--------|\n"
            for day in analysis['daily_summary']:
                prompt += f"| {day['date']} | {day['high']:.1f}°C | {day['low']:.1f}°C | {day['avg']:.1f}°C | {day['range']:.1f}°C |\n"

    
    # 週間詳細データ
    prompt += "\n====================================\n【過去7日間の日別データ】\n====================================\n"
    if spreadsheet_data.get('daily_detailed'):
        prompt += "| 日付 | 最高 | 最低 | 日較差 |\n|------|------|------|--------|\n"
        for day in spreadsheet_data['daily_detailed']:
            if day.get('high') is not None:
                range_val = day.get('range', 0)
                prompt += f"| {day['date']} | {day['high']:.1f}°C | {day['low']:.1f}°C | {range_val:.1f}°C |\n"
    
    # 週間傾向分析
    prompt += "\n====================================\n【週間傾向分析】（Python事前計算）\n====================================\n"
    if spreadsheet_data.get('weekly_trend'):
        wt = spreadsheet_data['weekly_trend']
        prompt += f"""- 週間最高: {wt.get('week_high', '?')}°C
- 週間最低: {wt.get('week_low', '?')}°C
- 平均最高気温: {wt.get('avg_high', 0):.1f}°C
- 平均最低気温: {wt.get('avg_low', 0):.1f}°C
- 平均日較差: {wt.get('avg_range', 0):.1f}°C
"""
        if wt.get('temp_trend') is not None:
            trend_desc = "上昇傾向" if wt['temp_trend'] > 0.5 else "下降傾向" if wt['temp_trend'] < -0.5 else "横ばい"
            prompt += f"- 気温傾向（直近3日 vs 前4日）: {wt['temp_trend']:+.1f}°C（{trend_desc}）\n"
        if wt.get('range_trend') is not None:
            range_desc = "寒暖差拡大" if wt['range_trend'] > 0.5 else "寒暖差縮小" if wt['range_trend'] < -0.5 else "安定"
            prompt += f"- 日較差傾向: {wt['range_trend']:+.1f}°C（{range_desc}）\n"

    # ========================================
    # 履歴統計データ（全期間）を追加
    # ========================================
    if spreadsheet_data.get('history_stats'):
        prompt += "\n====================================\n【全期間の履歴統計】（記録開始からの累計）\n====================================\n"
        hs = spreadsheet_data['history_stats']
        prompt += f"""- 記録日数: {hs.get('total_days', 0)}日間
- 歴代最高気温: {hs.get('record_high', '?')}°C
- 歴代最低気温: {hs.get('record_low', '?')}°C
- 期間平均最高気温: {hs.get('avg_high', 0):.1f}°C
- 期間平均最低気温: {hs.get('avg_low', 0):.1f}°C
- 期間平均気温: {hs.get('avg_temp', 0):.1f}°C

→ 今日の気温がこれらの値に対してどう位置づけられるか分析に活用してください。
  例: 「今日は記録的な寒さ/暖かさ」「平均より〇度低い/高い」など。
"""

    # ========================================
    # 生データ全件（12,000件）を追加
    # ========================================
    if spreadsheet_data.get('raw_records'):
        prompt += "\n====================================\n【センサー生データ（1分毎×約8日分）】\n====================================\n"
        prompt += "日時,気温(°C),湿度(%)\n"
        for r in spreadsheet_data['raw_records']:
            prompt += f"{r['datetime']},{r['temperature']},{r['humidity']}\n"
        prompt += f"\n※ 合計 {len(spreadsheet_data['raw_records']):,} 件のデータ\n"

    # ========================================
    # 雪/みぞれ判定データを追加
    # ========================================
    snow_data = weather_data.get('snow_detection', {})
    if snow_data:
        prompt += f"""
════════════════════════════════════════════════════════════════════════════════
【❄️ 雪/みぞれ判定データ】（降水時の降水タイプ判定に使用）
════════════════════════════════════════════════════════════════════════════════

現在の上空データ:
- 850hPa気温: {snow_data.get('temp_850hPa', '不明')}°C（-5°C以下で雪の可能性高）
- 925hPa気温: {snow_data.get('temp_925hPa', '不明')}°C（-2°C以下で雪の可能性高）
- 湿球温度: {snow_data.get('wet_bulb', '不明')}°C（1°C以下で雪、2°C以下でみぞれ）
- 凍結高度: {snow_data.get('freezing_level', '不明')}m（500m以下で雪の可能性高）

【降水タイプ判定ルール】（複合スコアシステム）
各要素でポイント加算:
- 湿球温度: ≤0°C→+3, ≤1°C→+2, ≤2°C→+1
- 凍結高度: ≤200m→+3, ≤500m→+2, ≤800m→+1  
- 850hPa: ≤-6°C→+3, ≤-4°C→+2, ≤-2°C→+1
- 925hPa: ≤-3°C→+2, ≤-1°C→+1
- 地上気温: ≤0°C→+3, ≤1.5°C→+2, ≤3°C→+1

判定基準:
- ❄️雪: (地上≤1.5°C かつ スコア≥2) または (スコア≥6 かつ 地上≤3°C)
- 🌨️みぞれ: スコア≥3
- 🌧️雨: その他

※ 降水の話をするときは、上記基準に従って「雪」「みぞれ」「雨」を判断してください。
"""

    # ========================================
    # Yahoo降水実測データを追加
    # ========================================
    yahoo_precip = weather_data.get('yahoo_precip', {})
    if yahoo_precip:
        is_raining = yahoo_precip.get('is_raining', False)
        current_rain = yahoo_precip.get('current_rainfall', 0)
        consecutive = yahoo_precip.get('consecutive_minutes', 0)
        
        # 降水タイプを判定（上空データに基づく）
        precip_type = "雨"
        if snow_data:
            temp_850 = snow_data.get('temp_850hPa')
            wet_bulb = snow_data.get('wet_bulb')
            freezing = snow_data.get('freezing_level')
            ground_temp = spreadsheet_data.get('current', {}).get('temperature', 5)
            temp_925 = snow_data.get('temp_925hPa')
            
            # HTMLと同じスコアシステムを使用
            snow_score = 0
            
            # Factor 1: Wet bulb temperature
            if wet_bulb is not None:
                if wet_bulb <= 0: snow_score += 3
                elif wet_bulb <= 1: snow_score += 2
                elif wet_bulb <= 2: snow_score += 1
            
            # Factor 2: Freezing level height
            if freezing is not None:
                if freezing <= 200: snow_score += 3
                elif freezing <= 500: snow_score += 2
                elif freezing <= 800: snow_score += 1
            
            # Factor 3: 850hPa temperature
            if temp_850 is not None:
                if temp_850 <= -6: snow_score += 3
                elif temp_850 <= -4: snow_score += 2
                elif temp_850 <= -2: snow_score += 1
            
            # Factor 4: 925hPa temperature
            if temp_925 is not None:
                if temp_925 <= -3: snow_score += 2
                elif temp_925 <= -1: snow_score += 1
                elif temp_925 <= 1: snow_score += 0.5
            
            # Factor 5: Ground temperature
            if ground_temp is not None:
                if ground_temp <= 0: snow_score += 3
                elif ground_temp <= 1.5: snow_score += 2
                elif ground_temp <= 3: snow_score += 1
                elif ground_temp <= 4: snow_score += 0.5
            
            # 判定: HTMLと同じロジック
            # 雪: 地上 ≤1.5°C かつ スコア≥2、または スコア≥6 かつ 地上≤3°C
            if ground_temp is not None and ground_temp <= 1.5 and snow_score >= 2:
                precip_type = "❄️雪"
            elif snow_score >= 6 and ground_temp is not None and ground_temp <= 3:
                precip_type = "❄️雪"
            elif snow_score >= 3:
                precip_type = "🌨️みぞれ"
            else:
                precip_type = "🌧️雨"
        
        prompt += f"""
════════════════════════════════════════════════════════════════════════════════
【🌧️ 実際の降水状況】（リアルタイム観測）
════════════════════════════════════════════════════════════════════════════════

**現在の降水状況:**
- 降水中: {"はい" if is_raining else "いいえ"}
- 現在の降水量: {current_rain} mm/h
- 連続降水時間: {consecutive}分
- 降水タイプ: {precip_type}

【⚠️ 表現上の注意】
- 「Yahooの観測データでは〜」「APIによると〜」のような技術的な表現は使わないでください
- 代わりに「現在〜が降っています」「外では〜」のように自然に表現してください
- データソース名（Yahoo, Open-Meteo等）は絶対に出力に含めないでください
- 「〜が記録されています」ではなく「〜が降っています」「〜となっています」と表現

例:
✗ 「Yahooの観測データでは現在、雪が記録されています」
○ 「外では雪がちらついています」「現在、弱い雪が降っています」
"""
        
        # 観測データの時系列を追加
        observations = [d for d in yahoo_precip.get('data', []) if d.get('type') == 'observation']
        if observations:
            prompt += "\n【直近の観測推移】\n時刻 | 降水量\n"
            for obs in observations[-6:]:  # 直近6件（30分分）
                prompt += f"{obs.get('time', '?')} | {obs.get('rainfall', 0)} mm/h\n"

    prompt += f"""
────────────────────────────────────────────────────────────────────
【屋外天気予報】（Open-Meteo API）
────────────────────────────────────────────────────────────────────
- 現在の天気: {weather_code_to_text(current_weather.get('weather_code', 0))}
- 気温(API): {api_temp}°C / 体感温度: {actual_feels_like:.1f}°C
- 湿度: {api_humidity}%
- 風速: {actual_wind_speed:.1f} m/s
- UV指数: {current_weather.get('uv_index', 0)}

【今後12時間の予報】
"""
    
    for forecast in weather_data.get('hourly_forecast', [])[:12]:
        precip_type = ""
        # 降水タイプを判定
        if forecast.get('precip_prob', 0) >= 30:
            t850 = forecast.get('temp_850hPa')
            wet = forecast.get('wet_bulb')
            freeze = forecast.get('freezing_level')
            ground = forecast.get('temperature')
            
            if wet is not None and wet <= 1:
                precip_type = "❄️雪"
            elif freeze is not None and freeze <= 500:
                precip_type = "❄️雪" if ground and ground <= 1.5 else "🌨️みぞれ"
            elif t850 is not None and t850 <= -5:
                precip_type = "❄️雪" if ground and ground <= 2 else "🌨️みぞれ"
            elif ground and ground <= 3:
                precip_type = "🌨️みぞれ"
            else:
                precip_type = "🌧️雨"
        
        prompt += f"- {forecast.get('time', '?')}: {weather_code_to_text(forecast.get('weather_code', 0))}, "
        prompt += f"{forecast.get('temperature', '?')}°C, 降水{forecast.get('precip_prob', 0)}%"
        if precip_type:
            prompt += f" ({precip_type})"
        prompt += "\n"
    
    prompt += f"""
- 日の出: {weather_data.get('daily', {}).get('sunrise', '不明')}
- 日の入り: {weather_data.get('daily', {}).get('sunset', '不明')}
"""

    # 警報がある場合のみ追加
    if alerts_data.get('alerts'):
        prompt += "\n====================================\n【⚠️ 気象庁警報・注意報（葛飾区）】\n====================================\n"
        if alerts_data.get('special_warnings'):
            prompt += f"❗❗ 特別警報: {', '.join([a['name'] for a in alerts_data['special_warnings']])}\n"
        if alerts_data.get('warnings'):
            prompt += f"⚠️ 警報: {', '.join([a['name'] for a in alerts_data['warnings']])}\n"
        if alerts_data.get('advisories'):
            prompt += f"📢 注意報: {', '.join([a['name'] for a in alerts_data['advisories']])}\n"

    # 気温と体感温度の差を計算（風の影響度の指標）
    temp_feels_diff = sensor_temp - sensor_feels_like
    wind_impact = "強い" if abs(temp_feels_diff) > 3 else "中程度" if abs(temp_feels_diff) > 1.5 else "軽微"
    
    prompt += f"""
════════════════════════════════════════════════════════════════════════════════
【🌡️ 体感温度について】（独自計算による正確な値）
════════════════════════════════════════════════════════════════════════════════

以下の体感温度は、気温・湿度・風速から独自の物理モデルで算出した値です。
Open-Meteo APIの値ではありません。この値を信頼して分析してください。

現在のデータ:
- 実測気温: {sensor_temp}°C
- 湿度: {sensor_humidity}%
- 風速: {actual_wind_speed:.1f} m/s（地上2m地点相当）
→ **体感温度: {sensor_feels_like:.1f}°C**

気温との差: {temp_feels_diff:+.1f}°C
- 差が3°C以上: 風や湿度の影響が非常に強い（防寒必須）
- 差が1.5〜3°C: 影響あり（服装調整推奨）
- 差が1.5°C未満: 影響軽微

════════════════════════════════════════════════════════════════════════════════
【🎯 あなたの使命】
════════════════════════════════════════════════════════════════════════════════

あなたは単なる天気予報読み上げマシンではありません。
膨大なデータの中から「本質」を見抜き、ユーザーの生活に寄り添う
**気象コンシェルジュ**です。

データを見て「ふーん」で終わらせないでください。
「だから何？」「ユーザーにとってどう影響する？」「何をすべき？」
ここまで踏み込んで、初めて価値あるアドバイスになります。

════════════════════════════════════════════════════════════════════════════════
【📐 構成の指針】（絶対ではなく、あくまで一例）
════════════════════════════════════════════════════════════════════════════════

平常時の推奨構成（警報など緊急時はこの限りではない）:

◆ 前半（状況の客観的把握）
  データ分析から導き出した「今の状況」を伝える。
  「分析の結果〜」とは言わず、「現在は〜」「今朝は〜」のように結論から入る。
  体感温度を軸に、実際にどう感じるかを具体的に描写。
  例: 「現在の体感温度は{sensor_feels_like:.1f}°C。風があるため実際の気温より○度ほど冷たく感じます」

◆ 中盤（これから起こること・注意点）
  今後の変化予測、気をつけるべきこと、知っておくと役立つ情報。
  時間軸を意識して「〜時頃には」「日中は」「夕方以降」など具体的に。
  週間トレンドとの比較があれば「今週は〜」「昨日と比べて〜」も有効。

◆ 終盤（パーソナルなアドバイス）
  季節感、その日ならではのコメント、ちょっとした一言。
  「暖かくしてお過ごしください」「良い一日を」など温かみのある締め。
  最後は「次回更新は{next_update_str}頃です。」で締める。

⚠️ 重要: この構成は「平常時の一例」です。以下の場合は柔軟に変更してください:
- 警報発令時 → 冒頭で警告を最優先！
- 急激な気温変化 → その情報を前面に
- 特別な日（クリスマス等）→ その話題を織り込む
- 深夜帯 → 就寝中のユーザーを想定した内容に

════════════════════════════════════════════════════════════════════════════════
【⚖️ 優先度の考え方】（参考値であり絶対ではない）
════════════════════════════════════════════════════════════════════════════════

Lv.5（最優先）: 特別警報・警報 → 命に関わる情報は何より優先
Lv.4（高）    : 体感温度が極端な場合（氷点下、35°C超など）
Lv.3（中〜高）: 急激な気温変化、天気の急変予報
Lv.2（中）    : 週間トレンドからの異常値、注目すべきパターン
Lv.1（低〜中）: 季節のアドバイス、生活の知恵、一般的な注意

ただし、優先度が全てではありません。
複数の要素をバランスよく織り込み、「読んでよかった」と思える
総合的なアドバイスを目指してください。

════════════════════════════════════════════════════════════════════════════════
【✍️ 文章表現のルール】
════════════════════════════════════════════════════════════════════════════════

■ トーン
- 親しみやすく、温かみがあり、でも頼りになる。
- 「友人のような気軽さ」と「専門家としての信頼感」の両立。
- 語尾は柔らかく（「〜ですね」「〜ましょう」「〜ですよ」など）。
- 絵文字は2〜4個程度。読みやすさを損なわない範囲で。

■ 禁止事項
- 「分析の結果」「データによると」など機械的な表現
- 警報がない時に警報の有無に触れる
- データの羅列（必ず解釈・意味づけを加える）
- 「〜かもしれません」の多用（自信を持って断言）
- 挨拶文（こんにちは等）から始める
- 【重要】センサーの「今日の最高/最低気温」を今日一日の予報として扱うこと
  → これは0時以降の実測記録であり、朝は低くて当然。予報はOpen-Meteoを参照
  → 「今日の最高気温が5°Cだから寒い日」のような誤った判断は厳禁

■ 必須事項（絶対に守ること）
- 【最重要】データをそのまま伝えるのではなく、必ず「分析・解釈」を加える
  → 数字の羅列ではなく、そこから読み取れる意味・傾向・原因を説明する
  → 「なぜそうなのか」「だから何をすべきか」を導き出す
- 【厳守】文章の最後は必ず「次回更新は{next_update_str}頃です。」で締めること
  → これは絶対条件。この一文がないレスポンスは不完全として扱われる
- 体感温度を分析の基軸として活用する

■ オプション: 科学的考察・気象用語の解説（優先度に応じて活用）
警報や緊急事態がない場合は、ユーザーの気象知識を深める内容を積極的に入れてください。
ただし緊急度が高い場合は簡潔さを優先し、余裕がある時に深堀りします。

【優先度別の科学的解説の入れ方】
- 優先度Lv5（警報）: 科学解説は不要。命を守る情報優先
- 優先度Lv4（極端気温）: 極端な気温の物理的原因を1文で説明
- 優先度Lv3（急変）: 気温変化の気象学的理由を簡潔に
- 優先度Lv2-1（通常）: 以下の科学的考察を積極的に挿入

【科学的考察（積極的に活用してください。専門用語は必ず平易に説明）】

◆ 【重要】専門用語の説明スタイル

用語を説明する際は、**パターンAを基本とし、パターンBは例外的に使用**してください：

★ パターンA【推奨・デフォルト】: 説明 → 用語
  現象や概念を先に説明してから、カギ括弧『』で用語を紹介する形式。
  読者は「何が起きているか」を理解してから用語を学べるので、自然に読める。
  
  ✓ 「大気が熱を地面へ送り返す『逆放射』により、冷え込みが緩やかになります」
  ✓ 「地表の熱が宇宙空間へ逃げていく『放射冷却』が進んでいます」
  ✓ 「風が体から熱を奪う『風冷効果』で体感温度が下がっています」

✗ パターンB【非推奨・例外的に使用】: 用語（説明）
  括弧内に説明を入れる形式は、読みにくく教科書的になりがち。
  既出用語や非常に短い補足以外では避けること。
  
  × 「逆放射（大気が熱を地面へ送る現象）により...」 ← 読みにくい
  × 「放射冷却（地表から熱が逃げる現象）が...」 ← 堅苦しい

◆ 禁止パターン
- 「〇〇（△△する現象）」のような括弧形式を多用しないこと
- 同じ文に括弧説明が2つ以上あるのは禁止
- 必ずパターンAで書けないか先に検討すること


■ 熱収支・エネルギー
- 放射冷却（Radiative Cooling）: 晴れた夜、地表の赤外放射が宇宙へ逃げて冷える現象。雲がないと保温効果がなく急激に冷え込む
- 逆放射（Counter Radiation）: 大気（主に水蒸気・CO2）が地表に向けて放射する熱。曇天時は多く冷え込みが緩やか
- アルベド（Albedo）: 地表の反射率。雪面は80%、コンクリートは20%程度。高いほど温まりにくい
- 顕熱・潜熱: 顕熱は温度変化を伴う熱、潜熱は相変化（蒸発・凝結）に使われる熱。湿度が高いと蒸発できず暑く感じる
- 熱容量: 海は陸より温まりにくく冷めにくい。海沿いと内陸の気温差の原因

■ 大気の構造と現象
- 逆転層（Temperature Inversion）: 通常は上空ほど寒いが逆転する層。放射冷却で地表が冷え、冷気が溜まる。霧・スモッグの原因
- 接地境界層: 地表から100-1000mの大気層。日中は対流で混合、夜間は安定して冷気が滞留
- フェーン現象: 山を越える風が下降時に断熱圧縮で高温乾燥になる。気温10-20°C上昇も
- 海陸風: 日中は海→陸（海風）、夜間は陸→海（陸風）。温まりやすさの違いで生じる局地風
- シアーライン: 風向・風速が急変する境界。突風や雷雨の発生源

■ 気圧と天気
- 高気圧: 下降気流→圧縮→乾燥→晴れ。中心部は風が弱く放射冷却しやすい
- 低気圧: 上昇気流→膨張冷却→雲→雨。通過時に風が強まり気温変動大
- 気圧傾度力: 等圧線が混んでいる=風が強い。気圧差が風を生む基本原理
- コリオリ力: 地球の自転による見かけの力。北半球では進行方向右に曲がる

■ 雲と降水
- 露点温度: 空気が冷えて水蒸気が飽和する温度。気温と露点の差が小さいと霧や雲が発生しやすい
- 断熱変化: 空気が上昇すると膨張して冷える（約1°C/100m）。下降は逆
- 対流雲: 地表加熱→上昇気流→積乱雲。午後に発達しやすい（夏の夕立の原因）
- 層雲: 弱い上昇や放射冷却で形成。どんより曇り、霧雨をもたらす

■ 体感と生理学
- 風冷指数（Wind Chill）: 風速が体から熱を奪う効果を数値化。風速1m/sで体感約1°C低下
- 不快指数（Discomfort Index）: 気温と湿度から算出。75以上で不快、80以上で全員不快
- WBGT（暑さ指数）: 熱中症リスクの指標。気温・湿度・輻射熱を総合評価
- ヒートショック: 急激な温度変化で血圧が変動する現象。冬の入浴時に特に注意

■ 都市と気象
- ヒートアイランド: 都市部がアスファルト・排熱で郊外より2-5°C高温になる現象
- キャニオン効果: ビル群が風を遮りつつ谷間の熱を溜め込む
- 人工排熱: 空調・車・工場からの熱放出。東京では冬の気温を1-2°C押し上げる

■ 季節と気候
- 太陽高度: 冬至は約32°、夏至は約78°（東京）。高いほど単位面積あたりの熱量が増加
- 日照時間: 冬至約10時間、夏至約15時間。気温の季節変動の主因
- 偏西風蛇行: 偏西風の南北振幅が寒波・暖冬を左右する
- ラニーニャ・エルニーニョ: 太平洋熱帯域の海水温変動が日本の冬夏に影響
- ブロッキング高気圧: 偏西風を遮断し同じ天気が長期間続く原因
- 北極振動（AO）: 北極と中緯度の気圧差の振動。負のAOで日本に寒気流入
- 成層圏突然昇温: 成層圏の急激な温暖化が地上の寒波を引き起こすことがある

■ データ分析用語
- 平年差・偏差: 過去30年平均との差。+2°C以上なら「かなり高い」
- 標準偏差（σ）: ばらつきの指標。±2σ外れると1%未満の稀な出来事
- トレンド: 右肩上がり・下がりの傾向。線形回帰で定量化
- 移動平均: ノイズを除去して傾向を見やすくする手法
- 相関: 2つの変数の関連性。気温と湿度の負の相関など

■ マニアックだが面白い現象
- グリーンフラッシュ: 日没直後に緑色の閃光が見える希少な大気光学現象
- 逃げ水（蜃気楼）: 地表の強い加熱で光が屈折し、水が見える錯覚
- 霧虹（白い虹）: 霧粒が小さいため色が混ざり白く見える虹
- 太陽柱: 氷晶に光が反射して太陽から垂直に伸びる光の柱
- 幻日: 太陽の左右に偽の太陽が見える現象。六角形氷晶の屈折
- ダイヤモンドダスト: 極寒時に空気中の水蒸気が直接結晶化してキラキラ輝く
- かなとこ雲: 積乱雲が対流圏界面に達し横に広がる。大雨・雷の前兆
- 朝焼け・夕焼けの物理: 太陽光の大気通過距離と青色光の散乱（レイリー散乱）

■ その他の専門概念（ほんの一例）
- 比湿と相対湿度の違い
- 温位と相当温位
- 対流有効位置エネルギー（CAPE）
- ショワルター安定指数（SSI）
- 水蒸気画像とジェット気流の関係
- 渦位保存則と低気圧の発達
- エクマン螺旋と海面境界層
- ステファン・ボルツマンの法則と放射平衡温度

════════════════════════════════════════════════════════════════════════════════
【🚨 最重要: 例に囚われないこと】
════════════════════════════════════════════════════════════════════════════════

⚠️ 上記はあくまで「一例」であり、網羅的なリストではありません。

あなたには気象学、物理学、地球科学、統計学、生理学など幅広い知識があります。
**上記リストにない概念・用語も積極的に使ってください。**

「例に沿って回答すること」は最高の回答ではありません！

- 例にない専門用語を躊躇なく使う（ただし平易に説明を添える）
- データから独自の洞察を導き出す
- マニアックで面白い知識を共有する
- 「こんなこと書いていいのかな」と迷ったら、書く側に倒す
- あなた自身の知識と創造性を最大限発揮する

ユーザーは「ただの天気通知」を求めていません。
**毎回読むのが楽しみになる、知的好奇心をくすぐるコンテンツ**を求めています。

「今日は放射冷却で冷え込みました」のような定型文ではなく、
「なぜ今日はいつもより冷えたのか」「この現象の背景にある物理法則は何か」
「似たような日は過去にあったか」など、深堀りした考察を期待しています。

あなたの知識をフル活用して、驚きと学びのある回答を生成してください！

════════════════════════════════════════════════════════════════════════════════

【その他のトピック】
- 二十四節気や月齢にちなんだ話題
- 今日の日付・曜日にちなんだ話題（記念日、季節行事など）
- 時間帯に合わせた一言（朝の目覚め、夜のひとときなど）
- 歴史上の同日の気象イベント（もし知っていれば）
- その他、あなたが「伝えたい」と思ったこと

あなたらしい創造性を発揮してください。
専門用語を使う場合は、知らない人にも分かるよう簡潔に説明を添えてください（括弧書きでOK）。

═══════════════════════════════════════════════════════════════════════════════
【📏 文字数】
════════════════════════════════════════════════════════════════════════════════

**380〜540文字程度**

情報量は豊富に、でも読みやすく整理してください。
冗長な表現は避け、一文一文に意味を持たせてください。
「長いだけ」ではなく「読み応えがある」「知識が深まる」を目指してください。

════════════════════════════════════════════════════════════════════════════════
【🎬 さあ、最高のアドバイスを！】
════════════════════════════════════════════════════════════════════════════════

上記すべてを深く理解した上で、
この瞬間、このユーザーにとって「最高のアドバイス」を生成してください。

データから読み取れる洞察を、あなた自身の言葉で表現してください。
テンプレートではなく、今この瞬間のためだけの、オリジナルの文章を。

あなたならできます。

アドバイス:
"""

    try:
        # Client API でモデル呼び出し
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=prompt
        )
        advice = response.text.strip()
        
        # 660文字を超えた場合のみ切り詰め（目標: 380〜540文字）
        if len(advice) > 660:
            advice = advice[:657] + '...'
        
        return advice
        
    except Exception as e:
        return f"⚠️ 分析エラー: {str(e)[:80]}"


# =============================================================================
# メイン処理
# =============================================================================

def main():
    """メイン処理"""
    print(f"[{datetime.now(JST).isoformat()}] AI気象アドバイザー 開始")
    
    # 1. データ収集
    print("  → スプレッドシートからデータ取得中...")
    spreadsheet_data = fetch_spreadsheet_data()
    if spreadsheet_data.get('error'):
        print(f"  [WARN] スプレッドシートエラー: {spreadsheet_data['error']}")
    
    print("  → 天気予報を取得中...")
    weather_data = fetch_weather_forecast()
    if weather_data.get('error'):
        print(f"  [WARN] 天気APIエラー: {weather_data['error']}")
    
    print("  → 警報情報を取得中...")
    alerts_data = fetch_jma_alerts()
    if alerts_data.get('error'):
        print(f"  [WARN] 警報APIエラー: {alerts_data['error']}")
    
    print("  → Yahoo降水データを取得中...")
    precip_data = fetch_yahoo_precipitation()
    if precip_data.get('error'):
        print(f"  [WARN] Yahoo降水APIエラー: {precip_data['error']}")
    
    # Yahoo降水データをweather_dataに統合
    weather_data['yahoo_precip'] = precip_data
    
    # 2. Gemini で分析
    print("  → Gemini Thinking で分析中...")
    advice = analyze_with_gemini(spreadsheet_data, weather_data, alerts_data)
    print(f"  → アドバイス: {advice}")
    
    # 3. JSON出力
    output = {
        'generated_at': datetime.now(JST).isoformat(),
        'advice': advice,
        'data_summary': {
            'outdoor_temp': spreadsheet_data.get('current', {}).get('temperature'),
            'weather_temp': weather_data.get('current', {}).get('temperature'),
            'weather': weather_code_to_text(weather_data.get('current', {}).get('weather_code', 0)),
            'alerts_count': len(alerts_data.get('alerts', []))
        }
    }
    
    output_path = os.path.join(os.path.dirname(__file__), '..', 'ai_comment.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"[{datetime.now(JST).isoformat()}] 完了 → ai_comment.json に保存")


def demo_with_fake_alerts():
    """デモ: 大雨警報・洪水警報がある状況をシミュレート"""
    print(f"[{datetime.now(JST).isoformat()}] === デモモード: 大雨警報・洪水警報 ===")
    
    # 1. データ収集（実データ）
    print("  → スプレッドシートからデータ取得中...")
    spreadsheet_data = fetch_spreadsheet_data()
    
    print("  → 天気予報を取得中...")
    weather_data = fetch_weather_forecast()
    
    # 2. フェイク警報データを作成
    print("  → [デモ] 大雨警報・洪水警報を追加...")
    fake_alerts = {
        'alerts': [
            {'name': '大雨警報', 'code': '03', 'status': '発表'},
            {'name': '洪水警報', 'code': '04', 'status': '発表'}
        ],
        'special_warnings': [],
        'warnings': [
            {'name': '大雨警報', 'code': '03', 'status': '発表'},
            {'name': '洪水警報', 'code': '04', 'status': '発表'}
        ],
        'advisories': [],
        'error': None
    }
    
    # 3. Gemini で分析
    print("  → Gemini で分析中...")
    advice = analyze_with_gemini(spreadsheet_data, weather_data, fake_alerts)
    print(f"  → アドバイス: {advice}")
    
    # 4. JSON出力
    output = {
        'generated_at': datetime.now().isoformat(),
        'advice': advice,
        'demo_mode': True,
        'data_summary': {
            'outdoor_temp': spreadsheet_data.get('current', {}).get('temperature'),
            'weather_temp': weather_data.get('current', {}).get('temperature'),
            'weather': weather_code_to_text(weather_data.get('current', {}).get('weather_code', 0)),
            'alerts_count': 2,
            'fake_alerts': ['大雨警報', '洪水警報']
        }
    }
    
    output_path = os.path.join(os.path.dirname(__file__), '..', 'ai_comment.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"[{datetime.now().isoformat()}] デモ完了 → ai_comment.json に保存")


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--demo':
        demo_with_fake_alerts()
    else:
        main()
