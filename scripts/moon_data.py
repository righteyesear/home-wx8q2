#!/usr/bin/env python3
"""
おはこん番地は！？ API から月データを取得
https://labs.bitmeister.jp/ohakon/

GitHub Actions用: JST（日本時間）を使用
"""

import json
import urllib.request
import math
from datetime import datetime, timezone, timedelta

# 東京都葛飾区東金町5丁目の座標
LAT = 35.7785
LON = 139.878

# 日本標準時 (JST = UTC+9)
JST = timezone(timedelta(hours=9))


def fetch_json(url):
    """URLからJSONを取得"""
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))


def get_compass_direction(azimuth):
    """方位角から日本語の方角を取得"""
    if azimuth is None:
        return None
    directions = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
                  '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西']
    idx = round(azimuth / 22.5) % 16
    return directions[idx]


def fetch_moon_data():
    """APIから月の出入り時刻と位置データを取得"""
    # JSTで現在時刻を取得（GitHub Actions対応）
    now = datetime.now(JST)
    
    base_url = "https://labs.bitmeister.jp/ohakon/json/"
    
    result = {
        "updated": now.strftime("%Y-%m-%d %H:%M:%S"),
        "location": {"lat": LAT, "lon": LON},
        "date": now.strftime("%Y-%m-%d"),
        "error": None
    }
    
    try:
        # 1. 月の出入り時刻を取得（今日）
        rise_set_url = (
            f"{base_url}?mode=sun_moon_rise_set"
            f"&year={now.year}&month={now.month}&day={now.day}"
            f"&lat={LAT}&lng={LON}"
        )
        rise_set_data = fetch_json(rise_set_url)
        
        rs = rise_set_data.get("rise_and_set", {})
        result["moonrise"] = rs.get("moonrise_hm", "--:--")
        result["moonset"] = rs.get("moonset_hm", "--:--")
        moonrise_decimal = rs.get("moonrise")
        moonset_decimal = rs.get("moonset")
        result["moon_age"] = rise_set_data.get("moon_age")
        result["sunrise"] = rs.get("sunrise_hm", "--:--")
        result["sunset"] = rs.get("sunset_hm", "--:--")
        
        # === 翌日/前日のデータを取得（月の出入りがない場合） ===
        tomorrow = now + timedelta(days=1)
        yesterday = now - timedelta(days=1)
        
        # 月の入りが翌日かどうかを判定
        # 月の出 > 月の入り（時刻）の場合、月の入りは翌日の深夜
        # 例：月の出12:00、月の入り0:39 → 月の入りは翌日
        if moonrise_decimal and moonset_decimal and moonrise_decimal > moonset_decimal:
            result["moonset"] = f"翌{result['moonset']}"
            result["moonset_is_tomorrow"] = True
            result["moonset_date"] = tomorrow.strftime("%Y-%m-%d")
        
        # 今日の月の入りがない場合 → 翌日の月の入りを取得
        if not moonset_decimal:
            tomorrow_url = (
                f"{base_url}?mode=sun_moon_rise_set"
                f"&year={tomorrow.year}&month={tomorrow.month}&day={tomorrow.day}"
                f"&lat={LAT}&lng={LON}"
            )
            tomorrow_data = fetch_json(tomorrow_url)
            tomorrow_rs = tomorrow_data.get("rise_and_set", {})
            tomorrow_moonset = tomorrow_rs.get("moonset_hm")
            tomorrow_moonset_decimal = tomorrow_rs.get("moonset")
            
            if tomorrow_moonset:
                result["moonset"] = f"翌{tomorrow_moonset}"
                result["moonset_is_tomorrow"] = True
                moonset_decimal = tomorrow_moonset_decimal
                result["moonset_date"] = tomorrow.strftime("%Y-%m-%d")
        
        # 今日の月の出がない場合 → 前日の月の出を確認（通常は稀）
        if not moonrise_decimal:
            yesterday_url = (
                f"{base_url}?mode=sun_moon_rise_set"
                f"&year={yesterday.year}&month={yesterday.month}&day={yesterday.day}"
                f"&lat={LAT}&lng={LON}"
            )
            yesterday_data = fetch_json(yesterday_url)
            yesterday_rs = yesterday_data.get("rise_and_set", {})
            yesterday_moonrise = yesterday_rs.get("moonrise_hm")
            yesterday_moonrise_decimal = yesterday_rs.get("moonrise")
            
            if yesterday_moonrise:
                result["moonrise"] = f"前日{yesterday_moonrise}"
                result["moonrise_is_yesterday"] = True
                moonrise_decimal = yesterday_moonrise_decimal
                result["moonrise_date"] = yesterday.strftime("%Y-%m-%d")
        
        # 2. 月の出時刻での方位を取得
        if moonrise_decimal:
            # 月の出が前日の場合は前日の日付を使用
            rise_date = yesterday if result.get("moonrise_is_yesterday") else now
            rise_pos_url = (
                f"{base_url}?mode=sun_moon_positions"
                f"&year={rise_date.year}&month={rise_date.month}&day={rise_date.day}"
                f"&hour={moonrise_decimal:.3f}&lat={LAT}&lng={LON}"
            )
            rise_pos_data = fetch_json(rise_pos_url)
            pos = rise_pos_data.get("positions", {})
            result["moonrise_azimuth"] = pos.get("moon_azimuth")
            result["moonrise_direction"] = get_compass_direction(pos.get("moon_azimuth"))
            
            # 月相と輝面率を取得
            moon_phase_deg = rise_pos_data.get("moon_phase")
            if moon_phase_deg is not None:
                result["moon_phase_deg"] = moon_phase_deg
                # 輝面率を計算: (1 - cos(phase)) / 2
                illumination = (1 - math.cos(math.radians(moon_phase_deg))) / 2
                result["illumination"] = round(illumination * 100, 1)
        
        # 3. 月の入り時刻での方位を取得
        if moonset_decimal:
            # 月の入りが翌日の場合は翌日の日付を使用
            set_date = tomorrow if result.get("moonset_is_tomorrow") else now
            set_pos_url = (
                f"{base_url}?mode=sun_moon_positions"
                f"&year={set_date.year}&month={set_date.month}&day={set_date.day}"
                f"&hour={moonset_decimal:.3f}&lat={LAT}&lng={LON}"
            )
            set_pos_data = fetch_json(set_pos_url)
            pos = set_pos_data.get("positions", {})
            result["moonset_azimuth"] = pos.get("moon_azimuth")
            result["moonset_direction"] = get_compass_direction(pos.get("moon_azimuth"))
        
    except Exception as e:
        result["error"] = str(e)
        result["moonrise"] = "--:--"
        result["moonset"] = "--:--"
    
    return result


def main():
    print("[Moon] Fetching moon data from Ohakonbanchi API...")
    print(f"[Moon] Using JST: {datetime.now(JST).strftime('%Y-%m-%d %H:%M:%S')}")
    
    data = fetch_moon_data()
    
    # JSONファイルに保存
    with open("moon_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"[OK] Moon data saved:")
    print(f"     Date: {data.get('date')}")
    print(f"     Moonrise: {data.get('moonrise')} ({data.get('moonrise_direction', '?')})")
    print(f"     Moonset: {data.get('moonset')} ({data.get('moonset_direction', '?')})")
    print(f"     Moon Age: {data.get('moon_age')}")
    print(f"     Illumination: {data.get('illumination', '?')}%")
    
    if data.get("error"):
        print(f"[WARN] Errors: {data['error']}")


if __name__ == "__main__":
    main()
