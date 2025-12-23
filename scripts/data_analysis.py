#!/usr/bin/env python3
"""
Enhanced Data Analysis Module for AI Weather Advisor
階層型データ取得 + 包括的事前分析
"""

import math
import statistics
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
import requests

# JST タイムゾーン
JST = timezone(timedelta(hours=9))


def analyze_data_comprehensive(all_records: List[Dict]) -> Dict[str, Any]:
    """
    生データから包括的な分析を実行
    
    Parameters:
        all_records: 全レコード（1分毎、最大12000件）
                     各レコード: {'datetime': str, 'temperature': float, 'humidity': float}
    
    Returns:
        統計、トレンド、パターン、異常検知などの分析結果
    """
    if not all_records:
        return {'error': 'No data available'}
    
    now = datetime.now(JST)
    
    # ========================================
    # 1. データの時間軸による分類
    # ========================================
    
    # 時刻文字列をdatetimeに変換
    def parse_datetime(dt_str: str) -> Optional[datetime]:
        try:
            # 形式: "12/23 18:30" など
            parts = dt_str.strip().split(' ')
            if len(parts) >= 2:
                date_part = parts[0]  # 12/23
                time_part = parts[1]  # 18:30
                month, day = map(int, date_part.split('/'))
                hour, minute = map(int, time_part.split(':'))
                year = now.year if month <= now.month else now.year - 1
                return datetime(year, month, day, hour, minute, tzinfo=JST)
        except:
            return None
        return None
    
    # 全レコードに解析済み時刻を追加
    for r in all_records:
        r['parsed_dt'] = parse_datetime(r.get('datetime', ''))
    
    # 有効なレコードのみフィルタ
    valid_records = [r for r in all_records if r['parsed_dt'] is not None]
    valid_records.sort(key=lambda x: x['parsed_dt'])
    
    if not valid_records:
        return {'error': 'No valid timestamped data'}
    
    # 階層分類
    six_hours_ago = now - timedelta(hours=6)
    twenty_four_hours_ago = now - timedelta(hours=24)
    seven_days_ago = now - timedelta(days=7)
    
    # 直近6時間（1分毎）
    recent_6h = [r for r in valid_records if r['parsed_dt'] >= six_hours_ago]
    
    # 6-24時間前（5分毎にサンプリング）
    range_6_24h = [r for r in valid_records if six_hours_ago > r['parsed_dt'] >= twenty_four_hours_ago]
    sampled_6_24h = range_6_24h[::5]  # 5件に1件
    
    # 1-7日前（30分毎にサンプリング）
    range_1_7d = [r for r in valid_records if twenty_four_hours_ago > r['parsed_dt'] >= seven_days_ago]
    sampled_1_7d = range_1_7d[::30]  # 30件に1件
    
    result = {
        'data_summary': {
            'total_records': len(valid_records),
            'recent_6h_count': len(recent_6h),
            'range_6_24h_count': len(sampled_6_24h),
            'range_1_7d_count': len(sampled_1_7d),
        }
    }
    
    # ========================================
    # 2. 基本統計
    # ========================================
    all_temps = [r['temperature'] for r in valid_records]
    all_humids = [r['humidity'] for r in valid_records]
    
    if all_temps:
        result['statistics'] = {
            'temp_mean': round(statistics.mean(all_temps), 2),
            'temp_median': round(statistics.median(all_temps), 2),
            'temp_stdev': round(statistics.stdev(all_temps), 2) if len(all_temps) > 1 else 0,
            'temp_min': round(min(all_temps), 2),
            'temp_max': round(max(all_temps), 2),
            'temp_range': round(max(all_temps) - min(all_temps), 2),
            'humidity_mean': round(statistics.mean(all_humids), 1),
            'humidity_stdev': round(statistics.stdev(all_humids), 1) if len(all_humids) > 1 else 0,
        }
        
        # パーセンタイル計算
        sorted_temps = sorted(all_temps)
        n = len(sorted_temps)
        result['statistics']['temp_25th'] = sorted_temps[n // 4]
        result['statistics']['temp_75th'] = sorted_temps[3 * n // 4]
        
        # 現在気温のパーセンタイル位置
        current_temp = all_temps[-1]
        below_count = sum(1 for t in all_temps if t < current_temp)
        result['statistics']['current_percentile'] = round(100 * below_count / n, 1)
        
        # Zスコア（現在気温の異常度）
        if result['statistics']['temp_stdev'] > 0:
            z_score = (current_temp - result['statistics']['temp_mean']) / result['statistics']['temp_stdev']
            result['statistics']['current_z_score'] = round(z_score, 2)
        else:
            result['statistics']['current_z_score'] = 0
    
    # ========================================
    # 3. トレンド分析
    # ========================================
    result['trends'] = {}
    
    # 直近1時間の変化速度
    one_hour_ago = now - timedelta(hours=1)
    recent_1h = [r for r in valid_records if r['parsed_dt'] >= one_hour_ago]
    if len(recent_1h) >= 2:
        temp_change_1h = recent_1h[-1]['temperature'] - recent_1h[0]['temperature']
        result['trends']['change_rate_1h'] = round(temp_change_1h, 2)  # °C/hour
    
    # 直近3時間の変化
    three_hours_ago = now - timedelta(hours=3)
    recent_3h = [r for r in valid_records if r['parsed_dt'] >= three_hours_ago]
    if len(recent_3h) >= 2:
        temp_change_3h = recent_3h[-1]['temperature'] - recent_3h[0]['temperature']
        result['trends']['change_rate_3h'] = round(temp_change_3h / 3, 2)  # °C/hour averaged
        result['trends']['total_change_3h'] = round(temp_change_3h, 2)
    
    # 変化の加速度（変化率の変化）
    if len(recent_1h) >= 30:  # 30分以上のデータ
        mid_idx = len(recent_1h) // 2
        first_half_change = recent_1h[mid_idx]['temperature'] - recent_1h[0]['temperature']
        second_half_change = recent_1h[-1]['temperature'] - recent_1h[mid_idx]['temperature']
        acceleration = second_half_change - first_half_change
        result['trends']['acceleration'] = round(acceleration, 2)
        if acceleration > 0.3:
            result['trends']['acceleration_status'] = '上昇加速中'
        elif acceleration < -0.3:
            result['trends']['acceleration_status'] = '下降加速中'
        else:
            result['trends']['acceleration_status'] = '安定'
    
    # 線形回帰による1時間後予測
    if len(recent_1h) >= 10:
        temps = [r['temperature'] for r in recent_1h]
        n = len(temps)
        x_mean = (n - 1) / 2
        y_mean = sum(temps) / n
        
        numerator = sum((i - x_mean) * (temps[i] - y_mean) for i in range(n))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        
        if denominator > 0:
            slope = numerator / denominator  # per minute
            intercept = y_mean - slope * x_mean
            # 60分後の予測
            predicted_1h = slope * (n + 60) + intercept
            result['trends']['predicted_temp_1h'] = round(predicted_1h, 1)
            result['trends']['predicted_change_1h'] = round(predicted_1h - temps[-1], 1)
    
    # ========================================
    # 4. パターン分析
    # ========================================
    result['patterns'] = {}
    
    # 時間帯別平均（3時間帯×8区分）
    time_slots = {i: [] for i in range(8)}  # 0-3, 3-6, ..., 21-24
    for r in valid_records:
        if r['parsed_dt']:
            slot = r['parsed_dt'].hour // 3
            time_slots[slot].append(r['temperature'])
    
    slot_names = ['深夜(0-3)', '未明(3-6)', '朝(6-9)', '午前(9-12)', 
                  '午後(12-15)', '夕方(15-18)', '夜(18-21)', '深夜(21-24)']
    result['patterns']['time_slot_avg'] = {}
    for i, temps in time_slots.items():
        if temps:
            result['patterns']['time_slot_avg'][slot_names[i]] = round(sum(temps) / len(temps), 1)
    
    # 現在の時間帯との比較
    current_slot = now.hour // 3
    current_slot_temps = time_slots.get(current_slot, [])
    if current_slot_temps and all_temps:
        slot_avg = sum(current_slot_temps) / len(current_slot_temps)
        result['patterns']['vs_time_slot_avg'] = round(all_temps[-1] - slot_avg, 1)
    
    # 曜日別パターン
    weekday_temps = {i: [] for i in range(7)}
    weekday_names = ['月', '火', '水', '木', '金', '土', '日']
    for r in valid_records:
        if r['parsed_dt']:
            wd = r['parsed_dt'].weekday()
            weekday_temps[wd].append(r['temperature'])
    
    result['patterns']['weekday_avg'] = {}
    for i, temps in weekday_temps.items():
        if temps:
            result['patterns']['weekday_avg'][weekday_names[i]] = round(sum(temps) / len(temps), 1)
    
    # 昨日同時刻との比較
    yesterday = now - timedelta(days=1)
    yesterday_records = [r for r in valid_records 
                        if r['parsed_dt'] and abs((r['parsed_dt'] - yesterday).total_seconds()) < 1800]  # 30分以内
    if yesterday_records and all_temps:
        yesterday_temp = yesterday_records[-1]['temperature']
        result['patterns']['vs_yesterday'] = round(all_temps[-1] - yesterday_temp, 1)
    
    # ========================================
    # 5. 異常検知
    # ========================================
    result['anomalies'] = {'alerts': []}
    
    # 急変検出（30分で2°C以上の変化）
    for i in range(30, len(valid_records)):
        temp_now = valid_records[i]['temperature']
        temp_30min_ago = valid_records[i - 30]['temperature']
        change = temp_now - temp_30min_ago
        if abs(change) >= 2.0:
            result['anomalies']['alerts'].append({
                'type': 'rapid_change',
                'time': valid_records[i]['datetime'],
                'change': round(change, 1),
                'direction': '急上昇' if change > 0 else '急降下'
            })
    
    # 最新3件のみ保持
    result['anomalies']['alerts'] = result['anomalies']['alerts'][-3:]
    
    # 異常値フラグ（Zスコア > 2）
    if result['statistics'].get('current_z_score', 0):
        z = abs(result['statistics']['current_z_score'])
        if z > 2.5:
            result['anomalies']['current_status'] = '非常に異常な気温'
        elif z > 2.0:
            result['anomalies']['current_status'] = '異常な気温'
        elif z > 1.5:
            result['anomalies']['current_status'] = 'やや異常'
        else:
            result['anomalies']['current_status'] = '正常範囲'
    
    # ========================================
    # 6. 階層化データサンプル
    # ========================================
    
    # 直近6時間の詳細データ（1分毎、最大360件）
    result['detailed_6h'] = [
        {'time': r['datetime'], 'temp': r['temperature'], 'humid': r['humidity']}
        for r in recent_6h[-360:]
    ]
    
    # 6-24時間のサンプリングデータ（5分毎）
    result['sampled_6_24h'] = [
        {'time': r['datetime'], 'temp': r['temperature'], 'humid': r['humidity']}
        for r in sampled_6_24h
    ]
    
    # 1-7日のサンプリングデータ（30分毎）
    result['sampled_1_7d'] = [
        {'time': r['datetime'], 'temp': r['temperature'], 'humid': r['humidity']}
        for r in sampled_1_7d
    ]
    
    # ========================================
    # 7. 日別サマリー
    # ========================================
    daily_summary = {}
    for r in valid_records:
        if r['parsed_dt']:
            date_key = r['parsed_dt'].strftime('%m/%d')
            if date_key not in daily_summary:
                daily_summary[date_key] = {'temps': [], 'humids': []}
            daily_summary[date_key]['temps'].append(r['temperature'])
            daily_summary[date_key]['humids'].append(r['humidity'])
    
    result['daily_summary'] = []
    for date, data in sorted(daily_summary.items())[-7:]:  # 直近7日
        temps = data['temps']
        result['daily_summary'].append({
            'date': date,
            'high': round(max(temps), 1),
            'low': round(min(temps), 1),
            'avg': round(sum(temps) / len(temps), 1),
            'range': round(max(temps) - min(temps), 1),
        })
    
    return result


# テスト用
if __name__ == '__main__':
    # サンプルデータでテスト
    import random
    now = datetime.now(JST)
    
    test_data = []
    for i in range(1000):
        dt = now - timedelta(minutes=i)
        test_data.append({
            'datetime': dt.strftime('%m/%d %H:%M'),
            'temperature': 10 + random.uniform(-3, 3) + math.sin(i / 60) * 2,
            'humidity': 60 + random.uniform(-10, 10)
        })
    
    test_data.reverse()  # 古い順に
    
    result = analyze_data_comprehensive(test_data)
    
    import json
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
