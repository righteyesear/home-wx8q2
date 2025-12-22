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

# =============================================================================
# 設定
# =============================================================================
SPREADSHEET_ID = os.environ.get('SPREADSHEET_ID', '1nbmJIIUzw8n2PcHp98NaiKnaAVciBx_Egpokjjx7uW8')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

# 更新スケジュール（JST時間）
UPDATE_HOURS = [7, 10, 13, 17, 21]

# 東京都葛飾区東金町5丁目
LATITUDE = 35.7727
LONGITUDE = 139.8680
AREA_CODE = '1312200'  # 葛飾区


# =============================================================================
# 体感温度計算（物理モデル）
# =============================================================================
def calculate_feels_like(temp: float, humidity: float, wind_speed_10m: float) -> float:
    """
    体感温度を計算（3帯域物理モデル）
    - wind_speed_10m: Open-Meteoの風速（10m高さ）を0.6倍して2m高さに補正
    - テテンスの式で水蒸気圧を算出
    - 温度帯に応じて3つの計算式を使い分け
    """
    import math
    
    # 風速補正（10m → 2m）
    v = max(0, wind_speed_10m * 0.6)
    
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
        return wind_chill(temp, v)
    elif temp <= 12:
        wc = wind_chill(temp, v)
        st = steadman(temp, e, v)
        t = (temp - 8) / 4
        return lerp(wc, st, t)
    elif temp <= 25:
        return steadman(temp, e, v)
    elif temp <= 29:
        st = steadman(temp, e, v)
        hi = heat_index(temp, humidity)
        t = (temp - 25) / 4
        return lerp(st, hi, t)
    else:
        return heat_index(temp, humidity)


# =============================================================================
# データ取得関数
# =============================================================================

def fetch_spreadsheet_data() -> Dict[str, Any]:
    """Google Spreadsheetから温湿度データを取得（詳細版）"""
    base_url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv"
    
    result = {
        'current': {},
        'recent_48': [],          # 直近48件（30分ごと24時間分）
        'hourly_pattern': {},     # 時間帯別パターン
        'daily_detailed': [],     # 7日間の6時間帯別データ
        'weekly_trend': {},       # 週間傾向分析
        'error': None
    }
    
    try:
        # Summary シート（現在値）
        summary_url = f"{base_url}&sheet=Summary"
        resp = requests.get(summary_url, timeout=10)
        resp.raise_for_status()
        
        for line in resp.text.strip().split('\n'):
            parts = line.replace('"', '').split(',')
            if len(parts) >= 2:
                label, value = parts[0].strip(), parts[1].strip()
                if '現在の気温' in label:
                    result['current']['temperature'] = float(value)
                elif '現在の湿度' in label:
                    result['current']['humidity'] = float(value)
                elif '今日の最高' in label:
                    result['current']['today_high'] = float(value)
                elif '今日の最低' in label:
                    result['current']['today_low'] = float(value)
        
        # Recent シート（30分ごと48件 = 24時間分）
        recent_url = f"{base_url}&sheet=Recent"
        resp = requests.get(recent_url, timeout=10)
        resp.raise_for_status()
        
        lines = resp.text.strip().split('\n')[1:]  # ヘッダースキップ
        all_recent = []
        for line in lines:
            parts = line.replace('"', '').split(',')
            if len(parts) >= 3:
                try:
                    all_recent.append({
                        'datetime': parts[0].strip(),
                        'temperature': float(parts[1].strip()),
                        'humidity': float(parts[2].strip())
                    })
                except ValueError:
                    continue
        
        # 直近48件を取得
        result['recent_48'] = all_recent[-48:]
        
        # ========================================
        # 24時間のパターン分析（Python事前計算）
        # ========================================
        if result['recent_48']:
            temps = [d['temperature'] for d in result['recent_48']]
            humids = [d['humidity'] for d in result['recent_48']]
            
            # 最高・最低とその時刻
            max_temp = max(temps)
            min_temp = min(temps)
            max_idx = temps.index(max_temp)
            min_idx = temps.index(min_temp)
            
            result['hourly_pattern'] = {
                'max_temp': max_temp,
                'max_time': result['recent_48'][max_idx]['datetime'] if max_idx < len(result['recent_48']) else '不明',
                'min_temp': min_temp,
                'min_time': result['recent_48'][min_idx]['datetime'] if min_idx < len(result['recent_48']) else '不明',
                'avg_temp': sum(temps) / len(temps),
                'avg_humidity': sum(humids) / len(humids),
                'temp_range': max_temp - min_temp,
                'temp_change_24h': temps[-1] - temps[0] if len(temps) > 1 else 0,
            }
            
            # 時間帯別平均（6時間帯）
            # 0-6時、6-12時、12-18時、18-24時
            time_slots = {'night': [], 'morning': [], 'afternoon': [], 'evening': []}
            for d in result['recent_48']:
                try:
                    dt_str = d['datetime']
                    # 時間を抽出（形式: "12/22 18:30" など）
                    if ' ' in dt_str:
                        time_part = dt_str.split(' ')[1]
                        hour = int(time_part.split(':')[0])
                        if 0 <= hour < 6:
                            time_slots['night'].append(d['temperature'])
                        elif 6 <= hour < 12:
                            time_slots['morning'].append(d['temperature'])
                        elif 12 <= hour < 18:
                            time_slots['afternoon'].append(d['temperature'])
                        else:
                            time_slots['evening'].append(d['temperature'])
                except:
                    continue
            
            for slot, values in time_slots.items():
                if values:
                    result['hourly_pattern'][f'{slot}_avg'] = sum(values) / len(values)
            
            # 急変検出（1時間で1.5°C以上の変化）
            rapid_changes = []
            for i in range(2, len(temps)):  # 2件（1時間）ごとに比較
                change = temps[i] - temps[i-2]
                if abs(change) >= 1.5:
                    rapid_changes.append({
                        'time': result['recent_48'][i]['datetime'],
                        'change': change
                    })
            result['hourly_pattern']['rapid_changes'] = rapid_changes[:3]  # 最大3件
            
            # 湿度トレンド
            humidity_start = humids[0] if humids else 0
            humidity_end = humids[-1] if humids else 0
            result['hourly_pattern']['humidity_trend'] = humidity_end - humidity_start
        
        # ========================================
        # Daily シート（7日間の詳細データ）
        # ========================================
        daily_url = f"{base_url}&sheet=Daily"
        resp = requests.get(daily_url, timeout=10)
        resp.raise_for_status()
        
        lines = resp.text.strip().split('\n')[1:]
        daily_data = []
        for line in lines[-7:]:  # 直近7日分
            parts = line.replace('"', '').split(',')
            if len(parts) >= 4:
                try:
                    day = {
                        'date': parts[0].strip(),
                        'high': float(parts[1].strip()) if parts[1].strip() else None,
                        'low': float(parts[2].strip()) if parts[2].strip() else None,
                        'avg': float(parts[3].strip()) if len(parts) > 3 and parts[3].strip() else None
                    }
                    # 日較差を計算
                    if day['high'] is not None and day['low'] is not None:
                        day['range'] = day['high'] - day['low']
                    daily_data.append(day)
                except ValueError:
                    continue
        
        result['daily_detailed'] = daily_data
        
        # ========================================
        # 週間傾向分析（Python事前計算）
        # ========================================
        if daily_data:
            highs = [d['high'] for d in daily_data if d['high'] is not None]
            lows = [d['low'] for d in daily_data if d['low'] is not None]
            ranges = [d['range'] for d in daily_data if d.get('range') is not None]
            
            if highs and lows:
                result['weekly_trend'] = {
                    'week_high': max(highs),
                    'week_low': min(lows),
                    'avg_high': sum(highs) / len(highs),
                    'avg_low': sum(lows) / len(lows),
                    'avg_range': sum(ranges) / len(ranges) if ranges else 0,
                }
                
                # 傾向分析（直近3日 vs 前4日）
                if len(highs) >= 5:
                    recent_avg = sum(highs[-3:]) / 3
                    earlier_avg = sum(highs[:-3]) / (len(highs) - 3)
                    result['weekly_trend']['temp_trend'] = recent_avg - earlier_avg
                    
                    # 日較差の傾向
                    if len(ranges) >= 5:
                        recent_range = sum(ranges[-3:]) / 3
                        earlier_range = sum(ranges[:-3]) / (len(ranges) - 3)
                        result['weekly_trend']['range_trend'] = recent_range - earlier_range
            
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
        f"&hourly=weather_code,temperature_2m,precipitation_probability,wind_speed_10m"
        f"&daily=sunrise,sunset,uv_index_max,precipitation_probability_max"
        f"&forecast_days=2&timezone=Asia/Tokyo"
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
        
        # 今後6時間の予報
        if 'hourly' in data:
            hourly = data['hourly']
            now_hour = datetime.now().hour
            for i in range(now_hour, min(now_hour + 6, len(hourly.get('time', [])))):
                result['hourly_forecast'].append({
                    'time': hourly['time'][i] if 'time' in hourly else None,
                    'weather_code': hourly['weather_code'][i] if 'weather_code' in hourly else None,
                    'temperature': hourly['temperature_2m'][i] if 'temperature_2m' in hourly else None,
                    'precip_prob': hourly['precipitation_probability'][i] if 'precipitation_probability' in hourly else 0,
                    'wind_speed': hourly['wind_speed_10m'][i] if 'wind_speed_10m' in hourly else None
                })
        
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
- 次回更新: {next_update_str}頃（約{hours_until_next}時間後）

────────────────────────────────────────────────────────────────────
【屋外センサー（自宅軒下）の現在値】
────────────────────────────────────────────────────────────────────
- 現在の外気温: {sensor_temp}°C
- 現在の湿度: {sensor_humidity}%
- **体感温度: {sensor_feels_like:.1f}°C**（風速{actual_wind_speed:.1f}m/sを考慮した実際の肌感覚）
- 今日の最高気温: {spreadsheet_data.get('current', {}).get('today_high', '不明')}°C
- 今日の最低気温: {spreadsheet_data.get('current', {}).get('today_low', '不明')}°C

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
    
    # 30分ごとの時系列データを追加（直近48件）
    if spreadsheet_data.get('recent_48'):
        prompt += "| 時刻 | 気温 | 湿度 |\n|------|------|------|\n"
        for d in spreadsheet_data['recent_48'][-24:]:  # 直近12時間分を表示
            prompt += f"| {d['datetime']} | {d['temperature']:.1f}°C | {d['humidity']:.0f}% |\n"
    
    # パターン分析を追加
    prompt += "\n====================================\n【24時間パターン分析】（Python事前計算）\n====================================\n"
    if spreadsheet_data.get('hourly_pattern'):
        hp = spreadsheet_data['hourly_pattern']
        prompt += f"""- 最高気温: {hp.get('max_temp', '?')}°C（{hp.get('max_time', '?')}）
- 最低気温: {hp.get('min_temp', '?')}°C（{hp.get('min_time', '?')}）
- 24時間平均気温: {hp.get('avg_temp', 0):.1f}°C
- 日較差（最高-最低）: {hp.get('temp_range', 0):.1f}°C
- 24時間の気温変化: {hp.get('temp_change_24h', 0):+.1f}°C
- 平均湿度: {hp.get('avg_humidity', 0):.0f}%
- 湿度変化: {hp.get('humidity_trend', 0):+.0f}%
"""
        # 時間帯別平均（存在する場合のみ）
        prompt += "\n【時間帯別平均気温】\n"
        if hp.get('night_avg') is not None:
            prompt += f"- 深夜(0-6時): {hp['night_avg']:.1f}°C\n"
        if hp.get('morning_avg') is not None:
            prompt += f"- 午前(6-12時): {hp['morning_avg']:.1f}°C\n"
        if hp.get('afternoon_avg') is not None:
            prompt += f"- 午後(12-18時): {hp['afternoon_avg']:.1f}°C\n"
        if hp.get('evening_avg') is not None:
            prompt += f"- 夜間(18-24時): {hp['evening_avg']:.1f}°C\n"
        
        # 急変検出
        if hp.get('rapid_changes'):
            prompt += "\n【急激な気温変化検出】\n"
            for rc in hp['rapid_changes']:
                prompt += f"- {rc['time']}: {rc['change']:+.1f}°C/時\n"
    
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
        prompt += f"- {forecast.get('time', '?')}: {weather_code_to_text(forecast.get('weather_code', 0))}, "
        prompt += f"{forecast.get('temperature', '?')}°C, 降水{forecast.get('precip_prob', 0)}%\n"
    
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
╔══════════════════════════════════════════════════════════════════════════════╗
║                        【🧠 体感温度の算出について】                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ あなたに提供される「体感温度」は、Open-Meteo等のAPIから取得したものではなく、  ║
║ 以下の独自物理モデルで算出した値です。分析の際はこの値を信頼してください。    ║
╚══════════════════════════════════════════════════════════════════════════════╝

■ 計算手順:
1. 風速補正: Open-Meteo APIの風速（10m高さ）を0.6倍して地上2m高さに換算
   → 今回の実効風速: {actual_wind_speed:.1f} m/s（元データ {api_wind_speed:.1f} m/s × 0.6）

2. 水蒸気圧算出: テテンスの式で気温と湿度から水蒸気圧を計算

3. 温度帯別の計算式を適用:
   - 8°C以下: リンケの風冷指数（Wind Chill）
   - 12°C〜25°C: ステッドマンの式（Steadman's Apparent Temperature）
   - 29°C以上: 暑さ指数（Heat Index）
   - 境界（8-12°C, 25-29°C）: 線形補間でスムーズに遷移

4. 今回の計算結果:
   - 実測気温: {sensor_temp}°C
   - 湿度: {sensor_humidity}%
   - 実効風速: {actual_wind_speed:.1f} m/s
   → **体感温度: {sensor_feels_like:.1f}°C**
   
   気温との差: {temp_feels_diff:+.1f}°C（風や湿度の影響: {wind_impact}）

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

■ 必須事項
- 最後は「次回更新は{next_update_str}頃です。」で締める
- 体感温度を分析の基軸として活用する

════════════════════════════════════════════════════════════════════════════════
【📏 文字数】
════════════════════════════════════════════════════════════════════════════════

**310〜450文字程度**

情報量は豊富に、でも読みやすく整理してください。
冗長な表現は避け、一文一文に意味を持たせてください。
「長いだけ」ではなく「読み応えがある」を目指してください。

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
        
        # 550文字を超えた場合のみ切り詰め（目標: 310〜450文字）
        if len(advice) > 550:
            advice = advice[:547] + '...'
        
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
