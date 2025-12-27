# -*- coding: utf-8 -*-
"""
Yahoo Weather API - 降水量データ取得スクリプト
1時間前〜60分先の降水量を取得してJSONファイルに保存
"""

import json
import os
import requests
from datetime import datetime

# Load .env file for local testing
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
except ImportError:
    pass  # dotenv not installed (GitHub Actions doesn't need it)

# 設定
YAHOO_CLIENT_ID = os.environ.get('YAHOO_CLIENT_ID', '')
LATITUDE = 35.77877   # 東京都葛飾区東金町5丁目
LONGITUDE = 139.87817

def fetch_precipitation():
    """Yahoo Weather APIから降水量データを取得"""
    
    if not YAHOO_CLIENT_ID:
        print("Error: YAHOO_CLIENT_ID not set")
        return None
    
    # APIエンドポイント
    url = "https://map.yahooapis.jp/weather/V1/place"
    
    params = {
        'coordinates': f'{LONGITUDE},{LATITUDE}',
        'appid': YAHOO_CLIENT_ID,
        'output': 'json',
        'past': '1',        # 1時間前までの実測値を取得
        'interval': '5'     # 5分間隔
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # データを整形
        weather_list = data.get('Feature', [{}])[0].get('Property', {}).get('WeatherList', {}).get('Weather', [])
        
        precipitation_data = []
        for item in weather_list:
            date_str = item.get('Date', '')
            rainfall = float(item.get('Rainfall', 0))
            data_type = item.get('Type', 'forecast')
            
            # 日時をパース (例: 202312271130)
            if len(date_str) == 12:
                dt = datetime.strptime(date_str, '%Y%m%d%H%M')
                precipitation_data.append({
                    'time': dt.strftime('%H:%M'),
                    'datetime': dt.isoformat(),
                    'rainfall': rainfall,
                    'type': data_type
                })
        
        return {
            'updated_at': datetime.now().isoformat(),
            'location': {
                'latitude': LATITUDE,
                'longitude': LONGITUDE
            },
            'data': precipitation_data
        }
        
    except requests.RequestException as e:
        print(f"API Error: {e}")
        return None

def main():
    print("Fetching precipitation data from Yahoo Weather API...")
    
    result = fetch_precipitation()
    
    if result:
        # JSONファイルに保存
        output_path = os.path.join(os.path.dirname(__file__), '..', 'precipitation.json')
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        
        print(f"Saved to precipitation.json")
        print(f"Data points: {len(result['data'])}")
        
        # 降水量の表示
        for item in result['data']:
            marker = '○' if item['type'] == 'observation' else '◇'
            bar = '█' * int(item['rainfall'] * 2) if item['rainfall'] > 0 else '─'
            print(f"  {marker} {item['time']} | {item['rainfall']:5.2f} mm/h | {bar}")
    else:
        print("Failed to fetch data")

if __name__ == '__main__':
    main()
