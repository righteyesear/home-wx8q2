#!/usr/bin/env python3
"""
週次・月次 分析レポート生成スクリプト
Daily シートから日別データを取得 → 統計計算 → Gemini で AI 分析 → JSON 出力

Usage:
    python scripts/report_generator.py --type weekly
    python scripts/report_generator.py --type monthly
    python scripts/report_generator.py --type weekly --date 2025-06-15
    python scripts/report_generator.py --type monthly --date 2025-06
    python scripts/report_generator.py --backfill [--no-ai]
"""

import os
import sys
import json
import math
import argparse
import statistics
import requests
from datetime import datetime, timedelta, timezone, date
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path

# JST タイムゾーン
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

# 東京都葛飾区東金町5丁目
LATITUDE = 35.7727
LONGITUDE = 139.8680

# プロジェクトルート
PROJECT_ROOT = Path(__file__).parent.parent
REPORTS_DIR = PROJECT_ROOT / 'reports'
WEEKLY_DIR = REPORTS_DIR / 'weekly'
MONTHLY_DIR = REPORTS_DIR / 'monthly'

# 曜日名（日本語）
WEEKDAY_NAMES = ['月', '火', '水', '木', '金', '土', '日']


# =============================================================================
# データ取得
# =============================================================================

def fetch_raw_for_date(date_str: str) -> Optional[Dict]:
    """
    特定の日のRawデータを取得し、センサーエラー（気温0.0℃ かつ 湿度0%）を
    除外した上で正しい Max/Min/Avg を再計算する。

    Args:
        date_str: 'YYYY/MM/DD' 形式の日付文字列

    Returns:
        {'high': float, 'low': float, 'avg': float} or None（有効データなし）
    """
    # 'YYYY/MM/DD' → 'YYYY-MM-DD' に変換（Raw シートの日付形式に合わせる）
    raw_date = date_str.replace('/', '-')

    base_url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq"
    # A列はDatetimeとして認識されているため toDate(A) で比較する
    query = f"select B, C where toDate(A) = date '{raw_date}'"
    params = {'tqx': 'out:csv', 'sheet': 'Raw', 'tq': query}

    try:
        resp = requests.get(base_url, params=params, timeout=60)
        resp.raise_for_status()
    except Exception as e:
        print(f"    ⚠ Raw データ取得失敗 ({date_str}): {e}")
        return None

    lines = resp.text.strip().split('\n')[1:]  # ヘッダースキップ
    valid_temps = []

    for line in lines:
        parts = line.replace('"', '').split(',')
        if len(parts) >= 2:
            try:
                temp = float(parts[0].strip())
                humid = float(parts[1].strip()) if len(parts) > 1 and parts[1].strip() else None
                # センサーエラー判定: 気温0.0 かつ 湿度0（または湿度なし）
                if temp == 0.0 and (humid is not None and humid == 0.0):
                    continue  # エラーレコードを除外
                valid_temps.append(temp)
            except ValueError:
                continue

    if not valid_temps:
        return None

    return {
        'high': round(max(valid_temps), 1),
        'low': round(min(valid_temps), 1),
        'avg': round(sum(valid_temps) / len(valid_temps), 1),
    }


def fetch_daily_data() -> List[Dict]:
    """
    Daily シートから全日別データを取得。
    最高気温または最低気温が 0.0℃ の日は、Raw データから
    センサーエラーを除外して正しい値を再計算する。
    Returns: [{'date': '2024/03/15', 'high': 18.5, 'low': 5.2, 'avg': 11.3}, ...]
    """
    base_url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/gviz/tq?tqx=out:csv"
    daily_url = f"{base_url}&sheet=Daily"

    print("  → Daily シートからデータ取得中...")
    resp = requests.get(daily_url, timeout=30)
    resp.raise_for_status()

    lines = resp.text.strip().split('\n')[1:]  # ヘッダースキップ
    records = []
    corrected_count = 0

    for line in lines:
        parts = line.replace('"', '').split(',')
        if len(parts) >= 3:
            try:
                day = {
                    'date': parts[0].strip(),
                    'high': float(parts[1].strip()) if parts[1].strip() else None,
                    'low': float(parts[2].strip()) if parts[2].strip() else None,
                    'avg': round(float(parts[3].strip()), 1) if len(parts) > 3 and parts[3].strip() else None,
                }

                # センサーエラー疑い: 最高気温または最低気温が 0.0℃
                if day['high'] == 0.0 or day['low'] == 0.0:
                    print(f"    ⚠ {day['date']}: 0.0℃検出 (high={day['high']}, low={day['low']}) → Raw で再計算...")
                    corrected = fetch_raw_for_date(day['date'])
                    if corrected:
                        old_high, old_low = day['high'], day['low']
                        day['high'] = corrected['high']
                        day['low'] = corrected['low']
                        day['avg'] = corrected['avg']
                        corrected_count += 1
                        print(f"    ✓ 修正: high {old_high}→{day['high']}, low {old_low}→{day['low']}, avg→{day['avg']}")
                    else:
                        print(f"    ✗ Raw データなし、元の値を維持")

                # 平均値がない場合は最高と最低から計算
                if day['avg'] is None and day['high'] is not None and day['low'] is not None:
                    day['avg'] = round((day['high'] + day['low']) / 2, 1)
                # 日較差
                if day['high'] is not None and day['low'] is not None:
                    day['range'] = round(day['high'] - day['low'], 1)
                else:
                    day['range'] = None
                records.append(day)
            except ValueError:
                continue

    print(f"  → {len(records)} 日分のデータを取得（うち {corrected_count} 日を Raw から修正）")
    return records


def parse_date(date_str: str) -> Optional[date]:
    """日付文字列をdateオブジェクトに変換（複数フォーマット対応）"""
    for fmt in ('%Y/%m/%d', '%Y-%m-%d', '%m/%d/%Y'):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


# =============================================================================
# 週・月のユーティリティ
# =============================================================================

def get_iso_week(d: date) -> Tuple[int, int]:
    """ISO週番号（年, 週番号）を返す。月曜始まり。"""
    iso = d.isocalendar()
    return iso[0], iso[1]


def get_week_range(year: int, week: int) -> Tuple[date, date]:
    """ISO週番号から月曜〜日曜の範囲を返す"""
    # ISO週の月曜日
    jan4 = date(year, 1, 4)  # 1月4日は必ず第1週に含まれる
    start_of_week1 = jan4 - timedelta(days=jan4.weekday())
    monday = start_of_week1 + timedelta(weeks=week - 1)
    sunday = monday + timedelta(days=6)
    return monday, sunday


def get_month_range(year: int, month: int) -> Tuple[date, date]:
    """月の初日と末日を返す"""
    first = date(year, month, 1)
    if month == 12:
        last = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last = date(year, month + 1, 1) - timedelta(days=1)
    return first, last


def filter_by_date_range(records: List[Dict], start: date, end: date) -> List[Dict]:
    """日付範囲でレコードをフィルタ"""
    result = []
    for r in records:
        d = parse_date(r['date'])
        if d and start <= d <= end:
            result.append({**r, '_date': d})
    return result


# =============================================================================
# 統計計算
# =============================================================================

def compute_statistics(records: List[Dict]) -> Dict:
    """レコード群から統計を計算"""
    if not records:
        return {}

    highs = [r['high'] for r in records if r.get('high') is not None]
    lows = [r['low'] for r in records if r.get('low') is not None]
    avgs = [r['avg'] for r in records if r.get('avg') is not None]
    ranges = [r['range'] for r in records if r.get('range') is not None]

    stats = {
        'days': len(records),
    }

    if avgs:
        stats['avg_temp'] = round(statistics.mean(avgs), 1)
        stats['avg_temp_stdev'] = round(statistics.stdev(avgs), 1) if len(avgs) > 1 else 0
    if highs:
        stats['max_temp'] = round(max(highs), 1)
        stats['max_temp_date'] = next(r['date'] for r in records if r.get('high') == max(highs))
        stats['avg_high'] = round(statistics.mean(highs), 1)
    if lows:
        stats['min_temp'] = round(min(lows), 1)
        stats['min_temp_date'] = next(r['date'] for r in records if r.get('low') == min(lows))
        stats['avg_low'] = round(statistics.mean(lows), 1)
    if ranges:
        stats['avg_daily_range'] = round(statistics.mean(ranges), 1)

    return stats


def compute_trend(values: List[float]) -> Dict:
    """線形回帰でトレンドを計算"""
    n = len(values)
    if n < 3:
        return {'direction': 'insufficient_data', 'slope': 0, 'r_squared': 0}

    x = list(range(n))
    x_mean = statistics.mean(x)
    y_mean = statistics.mean(values)

    numerator = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, values))
    denominator = sum((xi - x_mean) ** 2 for xi in x)

    if denominator == 0:
        return {'direction': 'flat', 'slope': 0, 'r_squared': 0}

    slope = numerator / denominator
    intercept = y_mean - slope * x_mean

    # R²計算
    y_pred = [slope * xi + intercept for xi in x]
    ss_res = sum((yi - yp) ** 2 for yi, yp in zip(values, y_pred))
    ss_tot = sum((yi - y_mean) ** 2 for yi in values)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0

    # トレンド方向判定
    if abs(slope) < 0.1:
        direction = 'flat'
    elif slope > 0:
        direction = 'rising'
    else:
        direction = 'falling'

    return {
        'direction': direction,
        'slope_per_day': round(slope, 3),
        'r_squared': round(max(0, r_squared), 3),
    }


def compute_comparison(current: Dict, previous: Dict) -> Dict:
    """2つの統計を比較"""
    result = {}
    for key in ['avg_temp', 'max_temp', 'min_temp', 'avg_daily_range']:
        if key in current and key in previous:
            result[f'{key}_diff'] = round(current[key] - previous[key], 1)
    return result


def generate_heatmap_data(all_records: List[Dict]) -> Dict:
    """月×年のヒートマップデータを生成"""
    data = {}
    for r in all_records:
        d = parse_date(r['date'])
        if d and r.get('avg') is not None:
            year = str(d.year)
            month = str(d.month)
            if year not in data:
                data[year] = {}
            if month not in data[year]:
                data[year][month] = []
            data[year][month].append(r['avg'])

    # 月平均を計算
    result = {}
    for year, months in data.items():
        result[year] = {}
        for month, temps in months.items():
            result[year][month] = round(statistics.mean(temps), 1)

    return result


def detect_season_milestones(all_records: List[Dict]) -> List[Dict]:
    """季節のマイルストーンを検出（初めて〇℃超え等）"""
    milestones_config = [
        {'label': '初めて10℃超え', 'condition': lambda h: h >= 10, 'field': 'high', 'season': 'spring'},
        {'label': '初めて20℃超え', 'condition': lambda h: h >= 20, 'field': 'high', 'season': 'spring'},
        {'label': '初めて25℃超え', 'condition': lambda h: h >= 25, 'field': 'high', 'season': 'summer'},
        {'label': '初めて30℃超え', 'condition': lambda h: h >= 30, 'field': 'high', 'season': 'summer'},
        {'label': '初めて35℃超え', 'condition': lambda h: h >= 35, 'field': 'high', 'season': 'summer'},
        {'label': '初めて氷点下', 'condition': lambda l: l < 0, 'field': 'low', 'season': 'winter'},
    ]

    # 年ごとにマイルストーンを検出
    by_year = {}
    for r in all_records:
        d = parse_date(r['date'])
        if d:
            year = d.year
            if year not in by_year:
                by_year[year] = []
            by_year[year].append({**r, '_date': d})

    results = []
    for milestone in milestones_config:
        entry = {'label': milestone['label']}
        for year in sorted(by_year.keys()):
            records = sorted(by_year[year], key=lambda x: x['_date'])
            found = None
            for r in records:
                val = r.get(milestone['field'])
                if val is not None and milestone['condition'](val):
                    found = r['date']
                    break
            entry[str(year)] = found
        results.append(entry)

    return results


def detect_notable_events(records: List[Dict], all_records: List[Dict]) -> List[Dict]:
    """特筆イベントを検出"""
    events = []

    if not records:
        return events

    # 全期間の統計
    all_highs = [r['high'] for r in all_records if r.get('high') is not None]
    all_lows = [r['low'] for r in all_records if r.get('low') is not None]
    all_time_high = max(all_highs) if all_highs else None
    all_time_low = min(all_lows) if all_lows else None

    for i, r in enumerate(records):
        d = parse_date(r['date'])
        if not d:
            continue

        high = r.get('high')
        low = r.get('low')
        avg = r.get('avg')

        # 急激な気温変動（前日比 ±5℃以上）
        if i > 0 and records[i - 1].get('avg') is not None and avg is not None:
            diff = avg - records[i - 1]['avg']
            if abs(diff) >= 5:
                direction = '急上昇' if diff > 0 else '急低下'
                events.append({
                    'date': r['date'],
                    'type': 'rapid_change',
                    'description': f'平均気温が前日比{diff:+.1f}℃の{direction}',
                })

        # 大きな日較差（15℃以上）
        if r.get('range') is not None and r['range'] >= 15:
            events.append({
                'date': r['date'],
                'type': 'large_range',
                'description': f'日較差{r["range"]:.1f}℃（高{high:.1f}℃ / 低{low:.1f}℃）',
            })

        # 観測史上最高/最低に迫る
        if high is not None and all_time_high is not None:
            if high >= all_time_high - 0.5:
                events.append({
                    'date': r['date'],
                    'type': 'near_record_high',
                    'description': f'最高気温{high:.1f}℃（観測最高{all_time_high:.1f}℃）',
                })
        if low is not None and all_time_low is not None:
            if low <= all_time_low + 0.5:
                events.append({
                    'date': r['date'],
                    'type': 'near_record_low',
                    'description': f'最低気温{low:.1f}℃（観測最低{all_time_low:.1f}℃）',
                })

        # ── 閾値イベント ──
        # 冬日（最低気温 < 0℃）
        if low is not None and low < 0:
            events.append({
                'date': r['date'],
                'type': 'frost_day',
                'description': f'冬日: 最低気温{low:.1f}℃',
            })
        # 真冬日（最高気温 < 0℃）
        if high is not None and high < 0:
            events.append({
                'date': r['date'],
                'type': 'ice_day',
                'description': f'真冬日: 最高気温{high:.1f}℃（終日氷点下）',
            })
        # 猛暑日（最高気温 ≥ 35℃）
        if high is not None and high >= 35:
            events.append({
                'date': r['date'],
                'type': 'extreme_heat',
                'description': f'猛暑日: 最高気温{high:.1f}℃',
            })
        # 酷暑日（最高気温 ≥ 40℃）
        if high is not None and high >= 40:
            events.append({
                'date': r['date'],
                'type': 'dangerous_heat',
                'description': f'酷暑日: 最高気温{high:.1f}℃（危険な暑さ）',
            })

    # 同種イベントが連続する場合は1件にまとめる
    return _merge_consecutive_events(events)


def _merge_consecutive_events(events: List[Dict]) -> List[Dict]:
    """同じtypeのイベントが連続日に発生している場合、1件にまとめる。
    
    例: 3/1, 3/2, 3/3 の冬日 → 「3/1〜3/3: 冬日3連続」
    rapid_change, large_range, near_record_* はまとめない（個別に意味があるため）
    """
    # まとめ対象のイベントタイプ
    mergeable_types = {'frost_day', 'ice_day', 'extreme_heat', 'dangerous_heat'}

    # まとめ対象外のイベントをそのまま保持
    non_mergeable = [e for e in events if e['type'] not in mergeable_types]

    # まとめ対象を type ごとにグルーピング
    from collections import defaultdict
    by_type: Dict[str, List[Dict]] = defaultdict(list)
    for e in events:
        if e['type'] in mergeable_types:
            by_type[e['type']].append(e)

    merged = []
    for etype, items in by_type.items():
        # 日付でソート
        items.sort(key=lambda x: x['date'])

        # 連続日の検出
        runs = []
        current_run = [items[0]]
        for j in range(1, len(items)):
            prev_d = parse_date(items[j - 1]['date'])
            curr_d = parse_date(items[j]['date'])
            if prev_d and curr_d and (curr_d - prev_d).days == 1:
                current_run.append(items[j])
            else:
                runs.append(current_run)
                current_run = [items[j]]
        runs.append(current_run)

        for run in runs:
            if len(run) >= 3:
                # 3日以上連続 → まとめる
                type_labels = {
                    'frost_day': '冬日', 'ice_day': '真冬日',
                    'extreme_heat': '猛暑日', 'dangerous_heat': '酷暑日',
                }
                label = type_labels.get(etype, etype)
                merged.append({
                    'date': f'{run[0]["date"]}〜{run[-1]["date"]}',
                    'type': etype,
                    'description': f'{label}{len(run)}日連続（{run[0]["description"].split(": ")[-1]}〜{run[-1]["description"].split(": ")[-1]}）',
                })
            else:
                merged.extend(run)

    result = non_mergeable + merged
    result.sort(key=lambda x: x['date'].split('〜')[0])
    return result



# =============================================================================
# Chart.js 用データ生成
# =============================================================================

def generate_chart_data_weekly(records: List[Dict], prev_year_records: List[Dict]) -> Dict:
    """週次レポート用のグラフデータ"""
    labels = []
    highs, lows, avgs = [], [], []

    for r in records:
        d = parse_date(r['date'])
        if d:
            wd = WEEKDAY_NAMES[d.weekday()]
            labels.append(f"{d.month}/{d.day}({wd})")
        else:
            labels.append(r['date'])
        highs.append(round(r['high'], 1) if r.get('high') is not None else None)
        lows.append(round(r['low'], 1) if r.get('low') is not None else None)
        avgs.append(round(r['avg'], 1) if r.get('avg') is not None else None)

    chart = {
        'daily_temps': {
            'labels': labels,
            'highs': highs,
            'lows': lows,
            'avgs': avgs,
        },
    }

    # 前年比較
    if prev_year_records:
        py_avgs  = [round(r['avg'], 1)  if r.get('avg')  is not None else None for r in prev_year_records]
        py_highs = [round(r['high'], 1) if r.get('high') is not None else None for r in prev_year_records]
        py_lows  = [round(r['low'], 1)  if r.get('low')  is not None else None for r in prev_year_records]
        chart['prev_year_comparison'] = {
            'labels': [WEEKDAY_NAMES[i] for i in range(min(7, len(records)))],
            'this_year':      avgs[:7],
            'last_year':      py_avgs[:7],
            'this_year_high': highs[:7],
            'last_year_high': py_highs[:7],
            'this_year_low':  lows[:7],
            'last_year_low':  py_lows[:7],
        }

    return chart


def _generate_deviation_data(records: List[Dict], baseline_avg: float) -> Dict:
    """偏差チャートデータを生成（各日の平均気温 - baseline平均）"""
    labels = []
    deviations = []
    for r in records:
        d = parse_date(r['date'])
        if d:
            wd = WEEKDAY_NAMES[d.weekday()]
            labels.append(f"{d.month}/{d.day}({wd})")
        else:
            labels.append(r['date'])
        avg = r.get('avg')
        if avg is not None:
            deviations.append(round(avg - baseline_avg, 1))
        else:
            deviations.append(None)
    return {'labels': labels, 'deviations': deviations, 'baseline_avg': round(baseline_avg, 1)}


def generate_chart_data_monthly(records: List[Dict], prev_year_records: List[Dict]) -> Dict:
    """月次レポート用のグラフデータ"""
    labels = []
    highs, lows, avgs = [], [], []

    for r in records:
        d = parse_date(r['date'])
        if d:
            labels.append(f"{d.day}日")
        else:
            labels.append(r['date'])
        highs.append(round(r['high'], 1) if r.get('high') is not None else None)
        lows.append(round(r['low'], 1) if r.get('low') is not None else None)
        avgs.append(round(r['avg'], 1) if r.get('avg') is not None else None)

    chart = {
        'daily_temps': {
            'labels': labels,
            'highs': highs,
            'lows': lows,
            'avgs': avgs,
        },
    }

    # 前年比較（日別）
    if prev_year_records:
        py_avgs  = [round(r['avg'], 1)  if r.get('avg')  is not None else None for r in prev_year_records]
        py_highs = [round(r['high'], 1) if r.get('high') is not None else None for r in prev_year_records]
        py_lows  = [round(r['low'], 1)  if r.get('low')  is not None else None for r in prev_year_records]
        chart['prev_year_comparison'] = {
            'labels': labels,
            'this_year':      avgs,
            'last_year':      py_avgs,
            'this_year_high': highs,
            'last_year_high': py_highs,
            'this_year_low':  lows,
            'last_year_low':  py_lows,
        }

    return chart


# =============================================================================
# Gemini AI 分析
# =============================================================================

def analyze_with_gemini(section_name: str, prompt: str) -> str:
    """Gemini でセクション別の分析を実行"""
    if not GEMINI_API_KEY:
        return "AI分析は利用できません（APIキー未設定）"

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model='gemini-3-flash-preview',
            contents=prompt,
            config={
                'temperature': 0.7,
            }
        )
        result = response.text.strip()
        print(f"  → AI分析完了: {section_name} ({len(result)}文字)")
        return result
    except Exception as e:
        print(f"  [WARN] AI分析エラー ({section_name}): {e}")
        return f"分析中にエラーが発生しました: {e}"


def compute_advanced_analytics(all_records: List[Dict], current_stats: Dict,
                                  target_start: date, target_end: date) -> Dict:
    """全期間のデータから高度な分析情報を計算"""
    all_avgs = [r['avg'] for r in all_records if r.get('avg') is not None]
    all_highs = [r['high'] for r in all_records if r.get('high') is not None]
    all_lows = [r['low'] for r in all_records if r.get('low') is not None]

    analytics = {}

    # 全期間の履歴統計
    if all_avgs:
        analytics['total_days'] = len(all_records)
        analytics['record_high'] = round(max(all_highs), 1) if all_highs else None
        analytics['record_low'] = round(min(all_lows), 1) if all_lows else None
        analytics['overall_avg'] = round(statistics.mean(all_avgs), 1)
        analytics['overall_stdev'] = round(statistics.stdev(all_avgs), 1) if len(all_avgs) > 1 else 0

        # 現在期間の平均のパーセンタイル（全期間における位置づけ）
        if current_stats.get('avg_temp') is not None:
            below = sum(1 for a in all_avgs if a < current_stats['avg_temp'])
            analytics['percentile'] = round(below / len(all_avgs) * 100, 0)
            analytics['z_score'] = round(
                (current_stats['avg_temp'] - analytics['overall_avg']) / analytics['overall_stdev'], 2
            ) if analytics['overall_stdev'] > 0 else 0

    # 日間変化パターン（期間内の前日比変化）
    current_records = filter_by_date_range(all_records, target_start, target_end)
    day_changes = []
    for i in range(1, len(current_records)):
        prev_avg = current_records[i - 1].get('avg')
        curr_avg = current_records[i].get('avg')
        if prev_avg is not None and curr_avg is not None:
            day_changes.append(round(curr_avg - prev_avg, 1))

    if day_changes:
        analytics['max_day_rise'] = max(day_changes)
        analytics['max_day_drop'] = min(day_changes)
        analytics['avg_day_change'] = round(statistics.mean([abs(c) for c in day_changes]), 1)

    # 連続記録（10℃超え、15℃超え、0℃未満の連続日数）
    for threshold, label in [(10, '10℃超え'), (15, '15℃超え'), (0, '氷点下')]:
        streak = 0
        for r in reversed(current_records):
            h = r.get('high')
            l = r.get('low')
            if label == '氷点下':
                if l is not None and l < threshold:
                    streak += 1
                else:
                    break
            else:
                if h is not None and h >= threshold:
                    streak += 1
                else:
                    break
        if streak > 0:
            analytics[f'streak_{label}'] = streak

    # 同時期の例年平均（同月のデータ）
    target_month = target_start.month
    same_month_avgs = []
    for r in all_records:
        d = parse_date(r['date'])
        if d and d.month == target_month and r.get('avg') is not None:
            same_month_avgs.append(r['avg'])
    if same_month_avgs:
        analytics['same_month_historical_avg'] = round(statistics.mean(same_month_avgs), 1)

    return analytics


def compute_recent_weeks(all_records: List[Dict], target_monday: date, count: int = 4) -> List[Dict]:
    """直近N週間の統計を計算（今週含む）"""
    weeks = []
    for i in range(count - 1, -1, -1):
        w_monday = target_monday - timedelta(weeks=i)
        w_sunday = w_monday + timedelta(days=6)
        w_records = filter_by_date_range(all_records, w_monday, w_sunday)
        if w_records:
            w_stats = compute_statistics(w_records)
            w_stats['label'] = f"{w_monday.month}/{w_monday.day}〜{w_sunday.month}/{w_sunday.day}"
            weeks.append(w_stats)
    return weeks


# =============================================================================
# AI プロンプト構築
# =============================================================================

def _get_season_context(month: int) -> tuple:
    """月から季節名とコンテキストを返す"""
    if month in [12, 1, 2]:
        return "冬", "一年で最も寒い季節。暖房効率、ヒートショック、乾燥対策、インフルエンザ予防が重要"
    elif month in [3, 4, 5]:
        return "春", "寒暖差が大きく三寒四温の季節。花粉、新生活の体調管理、服装選びが難しい"
    elif month in [6, 7, 8]:
        return "夏", "暑さ対策が最重要。熱中症、日射病、冷房病、寝苦しさ、台風シーズン"
    else:
        return "秋", "朝晩の冷え込みが始まる季節。寒暖差による体調不良、秋雨前線に注意"


def _format_daily_table(records: List[Dict], include_weekday: bool = True) -> str:
    """日別データをテーブル形式に整形"""
    lines = []
    for r in records:
        wd = f"({r.get('weekday','')})" if include_weekday and r.get('weekday') else ""
        avg_str = f"{r['avg']:.1f}" if isinstance(r.get('avg'), (int, float)) else "--"
        rng_str = f"{r['range']:.1f}" if isinstance(r.get('range'), (int, float)) else "--"
        lines.append(
            f"  {r['date']}{wd}: 最高{r.get('high','--')}℃ / 最低{r.get('low','--')}℃ / 平均{avg_str}℃ / 日較差{rng_str}℃"
        )
    return "\n".join(lines)


def build_summary_prompt(report_type: str, period_label: str, stats: Dict,
                         prev_stats: Dict, events: List,
                         daily_data: List[Dict], prev_year_daily: List[Dict],
                         recent_weeks: List[Dict], baseline_info: Dict,
                         analytics: Dict = None) -> str:
    """サマリー用プロンプト（ai_advisor.pyレベルの品質）"""

    month = None
    for r in daily_data:
        d = parse_date(r.get('date', ''))
        if d:
            month = d.month
            break
    season, season_context = _get_season_context(month or 1)

    daily_table = _format_daily_table(daily_data)

    prev_year_table = ""
    if prev_year_daily:
        prev_year_table = _format_daily_table(prev_year_daily, include_weekday=False)

    recent_lines = ""
    if recent_weeks:
        recent_lines = "\n".join([
            f"  {w['label']}: 平均{w.get('avg_temp','--')}℃ / 最高{w.get('max_temp','--')}℃ / 最低{w.get('min_temp','--')}℃ / 日較差{w.get('avg_daily_range','--')}℃"
            for w in recent_weeks
        ])

    # 高度分析データの整形
    analytics_text = ""
    if analytics:
        analytics_text = f"""
════════════════════════════════════════════════════════════════════
【📊 高度分析データ】（全{analytics.get('total_days', '?')}日間のデータから算出）
════════════════════════════════════════════════════════════════════
- 全期間の歴代最高気温: {analytics.get('record_high', '?')}℃
- 全期間の歴代最低気温: {analytics.get('record_low', '?')}℃
- 全期間の平均気温: {analytics.get('overall_avg', '?')}℃（標準偏差: {analytics.get('overall_stdev', '?')}℃）
- 今期間の平均気温のパーセンタイル: {analytics.get('percentile', '?')}%（全期間中での位置）
- 今期間のZスコア: {analytics.get('z_score', '?')}（0=平均、±1=やや異常、±2=かなり異常）
- 同月の例年平均気温: {analytics.get('same_month_historical_avg', '?')}℃
"""
        if analytics.get('max_day_rise') is not None:
            analytics_text += f"- 期間内の最大日間上昇: +{analytics['max_day_rise']}℃\n"
        if analytics.get('max_day_drop') is not None:
            analytics_text += f"- 期間内の最大日間下降: {analytics['max_day_drop']}℃\n"
        if analytics.get('avg_day_change') is not None:
            analytics_text += f"- 期間内の平均日間変動幅: {analytics['avg_day_change']}℃\n"
        streaks = [(k, v) for k, v in analytics.items() if k.startswith('streak_')]
        for k, v in streaks:
            label = k.replace('streak_', '')
            analytics_text += f"- 連続{label}日数: {v}日\n"

    baseline_text = ""
    if baseline_info.get('baseline_avg') is not None:
        dev = baseline_info.get('current_deviation', '--')
        baseline_text = f"- 2年間ベースライン平均: {baseline_info['baseline_avg']}℃（今期間の偏差: {dev}℃）"

    return f"""
╔══════════════════════════════════════════════════════════════════╗
║  あなたは「週間気象レポーター」です。                              ║
║  データの海から「ストーリー」を紡ぎ、読者に寄り添う分析を。      ║
╚══════════════════════════════════════════════════════════════════╝

────────────────────────────────────────────────────────────────────
【あなたの思考プロセス】
────────────────────────────────────────────────────────────────────
以下のデータをすべて読み込んだ上で、「この期間に何が起きたのか」の
ストーリーを見つけてください。単なるデータの要約ではなく、
データから読み取れる因果関係や変動パターンの解釈を述べてください。

考慮すべき視点:
- 季節は{season}。{season_context}。
- 日々の変動パターン（V字回復? 段階的下降? 乱高下?）を読み取る。
- 前年同期と比べて「今年ならでは」の特徴を見つける。
- 直近数週間の文脈の中で、今期間がどういう意味を持つか。
- 生活への実質的な影響（服装、体調、活動計画）を具体的にアドバイス。

────────────────────────────────────────────────────────────────────
【{period_label} 基本統計】
────────────────────────────────────────────────────────────────────
- 平均気温: {stats.get('avg_temp', '--')}℃（標準偏差: {stats.get('avg_temp_stdev', '--')}℃）
- 最高気温: {stats.get('max_temp', '--')}℃（{stats.get('max_temp_date', '')}に記録）
- 最低気温: {stats.get('min_temp', '--')}℃（{stats.get('min_temp_date', '')}に記録）
- 平均最高気温: {stats.get('avg_high', '--')}℃
- 平均最低気温: {stats.get('avg_low', '--')}℃
- 平均日較差: {stats.get('avg_daily_range', '--')}℃
- データ日数: {stats.get('days', '--')}日

【前期間との差分】
- 平均気温差: {prev_stats.get('avg_temp_diff', '--')}℃
- 最高気温差: {prev_stats.get('max_temp_diff', '--')}℃
- 最低気温差: {prev_stats.get('min_temp_diff', '--')}℃
{baseline_text}

────────────────────────────────────────────────────────────────────
【📅 日別詳細データ】
────────────────────────────────────────────────────────────────────
{daily_table}

────────────────────────────────────────────────────────────────────
【📅 前年同期間の日別データ】
────────────────────────────────────────────────────────────────────
{prev_year_table if prev_year_table else 'データなし'}

────────────────────────────────────────────────────────────────────
【📈 直近4週の推移（今期間含む）】
────────────────────────────────────────────────────────────────────
{recent_lines if recent_lines else 'データなし'}
{analytics_text}
────────────────────────────────────────────────────────────────────
【⚡ 特筆イベント】
────────────────────────────────────────────────────────────────────
{json.dumps(events, ensure_ascii=False, indent=2) if events else 'なし'}

════════════════════════════════════════════════════════════════════
【🌡️ 体感温度別 生活ガイド】（アドバイスの参考に）
════════════════════════════════════════════════════════════════════
 0℃未満: 凍える寒さ。完全防備必須
 0〜5℃: かなり寒い。厚手コート・暖房フル稼働
 5〜10℃: 肌寒い。コートまたは厚手ジャケット
 10〜15℃: やや肌寒い。薄手コートまたはカーディガン
 15〜20℃: 快適〜涼しい。長袖＋羽織もの
 20〜25℃: 快適。半袖〜長袖、過ごしやすい
 25〜30℃: 暑い。半袖、水分補給
 30°C以上: 危険な暑さ。熱中症警戒

════════════════════════════════════════════════════════════════════
【出力ルール】
════════════════════════════════════════════════════════════════════
- 400〜700字で、この期間の気象をストーリーとして語ってください
- 「月曜は○℃で〜、火曜は…」のような単調な日ごとの羅列は避けてください
- 代わりに「週前半は暖かったが後半に急落」のようなパターンで語ってください
- 前年との対比や、直近数週間の流れの中での位置づけを必ず入れてください
- 必ず生活アドバイス（服装・体調・活動計画）を具体的に含めてください
- 親しみやすく温かい口調で書いてください
- 絵文字を2〜3個使ってください
- マークダウン記法（#, **, -）は絶対に使わないでください。プレーンテキストのみです
- 毎回同じような書き出しにならないよう、切り口を変えてください
- 文章は2〜3の段落（意味のまとまり）に分けて、段落の間に空行を入れてください
"""


def build_comparison_prompt(period_label: str, current_stats: Dict,
                             prev_year_stats: Dict, diff: Dict,
                             daily_data: List[Dict] = None,
                             prev_year_daily: List[Dict] = None) -> str:
    """前年比較用プロンプト（リッチデータ版）"""

    daily_comparison = ""
    if daily_data and prev_year_daily:
        lines = []
        max_len = min(len(daily_data), len(prev_year_daily))
        for i in range(max_len):
            c = daily_data[i]
            p = prev_year_daily[i]
            c_avg = f"{c['avg']:.1f}" if isinstance(c.get('avg'), (int, float)) else "--"
            p_avg = f"{p['avg']:.1f}" if isinstance(p.get('avg'), (int, float)) else "--"
            lines.append(f"  {c.get('date','')}: 今年{c_avg}℃ vs 昨年{p_avg}℃")
        daily_comparison = "\n".join(lines)

    return f"""
あなたは気象データの年度間比較の専門家です。
{period_label}の今年と昨年の同期間を対比させ、読者が「今年はどんな年なのか」を
直感的に理解できるようなコメントを書いてください。

────────────────────────────────────────────────────────────────────
【今年の統計】
- 平均気温: {current_stats.get('avg_temp', '--')}℃ / 最高: {current_stats.get('max_temp', '--')}℃ / 最低: {current_stats.get('min_temp', '--')}℃
- 平均日較差: {current_stats.get('avg_daily_range', '--')}℃

【昨年同期間の統計】
- 平均気温: {prev_year_stats.get('avg_temp', '--')}℃ / 最高: {prev_year_stats.get('max_temp', '--')}℃ / 最低: {prev_year_stats.get('min_temp', '--')}℃
- 平均日較差: {prev_year_stats.get('avg_daily_range', '--')}℃

【差分サマリー】
- 平均気温差: {diff.get('avg_temp_diff', '--')}℃
- 最高気温差: {diff.get('max_temp_diff', '--')}℃
- 最低気温差: {diff.get('min_temp_diff', '--')}℃
- 日較差の差: {diff.get('avg_daily_range_diff', '--')}℃

【日別の対比データ】
{daily_comparison if daily_comparison else 'データなし'}

────────────────────────────────────────────────────────────────────
【出力ルール】
- 200〜400字で比較分析を書いてください
- 単純な「温度差は〇℃」だけでなく、パターンの違いも述べてください
  例：「昨年は後半に寒波が来たが今年は穏やか」等
- 昨年の同じ時期と比べて、暮らしにどう影響するかも一言添えてください
- マークダウン記法は使わないでください（プレーンテキストのみ）
- 絵文字を1〜2個使ってください
- 文章は2〜3の段落（意味のまとまり）に分けて、段落の間に空行を入れてください
"""


def build_events_prompt(period_label: str, events: List[Dict],
                         stats: Dict = None) -> str:
    """特筆イベント用プロンプト"""
    event_text = "\n".join([f"  - {e['date']}: [{e['type']}] {e['description']}" for e in events])

    context = ""
    if stats:
        context = f"\n参考情報: この期間の平均気温は{stats.get('avg_temp','--')}℃、平均日較差は{stats.get('avg_daily_range','--')}℃でした。"

    return f"""
{period_label}に以下の注目すべき気象イベントが検出されました。
それぞれのイベントが持つ意味を読み解き、生活への影響と合わせてコメントしてください。
{context}

────────────────────────────────────────────────────────────────────
【検出されたイベント】

イベントタイプの説明:
  rapid_change = 前日比で平均気温が±5℃以上の急変動
  large_range = 1日の最高-最低の差が15℃以上
  near_record_high = 全観測期間の最高気温に0.5℃以内に迫った
  near_record_low = 全観測期間の最低気温に0.5℃以内に迫った
  frost_day = 冬日（最低気温が0℃未満）
  ice_day = 真冬日（最高気温が0℃未満、終日氷点下）
  extreme_heat = 猛暑日（最高気温35℃以上）
  dangerous_heat = 酷暑日（最高気温40℃以上、危険な暑さ）
  ※ 同種イベントが3日以上連続した場合はまとめて表示されます

{event_text}

────────────────────────────────────────────────────────────────────
【出力ルール】
- 150〜300字でコメントしてください
- 各イベントが生活に与える影響（体調、服装、活動計画）に言及してください
- マークダウン記法は使わないでください（プレーンテキストのみ）
- 絵文字を1個使ってください
"""


def build_season_prompt(period_label: str, milestones: List[Dict],
                         current_month: int, stats: Dict = None,
                         analytics: Dict = None) -> str:
    """季節の進み具合用プロンプト（リッチ版）"""
    ms_text = ""
    for m in milestones:
        years = {k: v for k, v in m.items() if k != 'label'}
        ms_text += f"  - {m['label']}: {json.dumps(years, ensure_ascii=False)}\n"

    season, season_context = _get_season_context(current_month)

    extra_context = ""
    if stats:
        extra_context += f"\n今期間の平均気温: {stats.get('avg_temp','--')}℃"
    if analytics and analytics.get('same_month_historical_avg'):
        extra_context += f"\n同月の例年平均: {analytics['same_month_historical_avg']}℃"

    return f"""
あなたは二十四節気や季節の移り変わりに詳しい気象解説者です。
{period_label}における季節の歩みを、マイルストーンデータを手がかりに
詩的かつ分析的に語ってください。

────────────────────────────────────────────────────────────────────
【現在の季節】{season}（{season_context}）{extra_context}

【季節マイルストーン（各年の初到達日）】
{ms_text}
────────────────────────────────────────────────────────────────────
【出力ルール】
- 200〜400字で季節の歩みを語ってください
- 昨年・一昨年との比較で、今年が早い/遅い/例年並みかを明確に述べてください
- 季節の移り変わりを感じさせる自然描写的な表現を含めてください
- 「次に訪れるマイルストーンは何か」にも触れてください
- マークダウン記法は使わないでください（プレーンテキストのみ）
- 絵文字を1〜2個使ってください
- 毎回同じようなフレーズにならないよう、表現に変化をつけてください
"""


def build_trend_prompt(report_type: str, period_label: str, stats: Dict,
                       daily_data: List[Dict], trend: Dict,
                       prev_year_daily: List[Dict] = None,
                       baseline_info: Dict = None,
                       analytics: Dict = None) -> str:
    """気温推移の分析用プロンプト"""
    season_name, _ = _get_season_context(
        parse_date(daily_data[0]['date']).month if daily_data else 1
    )

    # 日別データテーブル
    table = _format_daily_table(daily_data)

    # トレンド情報
    direction_map = {'rising': '上昇傾向', 'falling': '下降傾向', 'flat': '横ばい'}
    trend_desc = direction_map.get(trend.get('direction', ''), '不明')

    prompt = f"""あなたは気象データアナリストです。
以下の{period_label}の気温推移データを分析し、読者に有益な洞察を提供してください。

## 対象期間
{period_label}（{season_name}）

## 日別気温データ
{table}

## 期間統計
- 平均気温: {stats.get('avg_temp', '--')}℃
- 最高: {stats.get('max_temp', '--')}℃ / 最低: {stats.get('min_temp', '--')}℃
- 平均日較差: {stats.get('avg_daily_range', '--')}℃
- トレンド: {trend_desc}（傾き: {trend.get('slope_per_day', 0):.3f}℃/日, R²: {trend.get('r_squared', 0):.3f}）
"""

    if analytics:
        if analytics.get('max_day_rise') is not None:
            prompt += f"- 最大日間上昇: +{analytics['max_day_rise']}℃ / 最大日間下降: {analytics['max_day_drop']}℃\n"
        if analytics.get('avg_day_change') is not None:
            prompt += f"- 平均日間変動幅: {analytics['avg_day_change']}℃\n"

    if baseline_info and baseline_info.get('baseline_avg') is not None:
        prompt += f"\n## 過去平均ベースライン\n"
        prompt += f"- 同時期の過去平均: {baseline_info['baseline_avg']}℃\n"
        prompt += f"- 偏差: {baseline_info.get('current_deviation', '--')}℃\n"
        prompt += f"- 計算年数: {baseline_info.get('years_count', '--')}年分\n"

    if prev_year_daily:
        prev_table = _format_daily_table(prev_year_daily, include_weekday=False)
        prompt += f"\n## 前年同時期データ\n{prev_table}\n"

    prompt += """
## 出力ルール
- 3〜5文で簡潔にまとめてください
- 気温の変動パターン（急激な変化・安定期間など）に着目してください
- トレンド（上昇・下降・横ばい）の要因として考えられることに触れてください
- 前年との比較がある場合、違いを指摘してください
- 「〜でしょう」「〜かもしれません」など柔らかい表現を使い、読み手に語りかけるように
- Markdown不使用。絵文字は文末に1つだけ使用可
- 文章は2〜3の段落（意味のまとまり）に分けて、段落の間に空行を入れてください
"""
    return prompt


# =============================================================================
# レポート生成
# =============================================================================

def generate_weekly_report(all_records: List[Dict], target_date: date,
                           skip_ai: bool = False) -> Optional[Dict]:
    """週次レポートを生成"""
    year, week = get_iso_week(target_date)
    monday, sunday = get_week_range(year, week)

    print(f"\n=== 週次レポート生成: {year}年 第{week}週 ({monday} 〜 {sunday}) ===")

    # 今週のデータ
    current_records = filter_by_date_range(all_records, monday, sunday)
    if not current_records:
        print(f"  [SKIP] データが見つかりません: {monday} 〜 {sunday}")
        return None

    print(f"  → {len(current_records)} 日分のデータ")

    # 統計計算
    stats = compute_statistics(current_records)

    # 前週のデータ
    prev_monday = monday - timedelta(weeks=1)
    prev_sunday = sunday - timedelta(weeks=1)
    prev_records = filter_by_date_range(all_records, prev_monday, prev_sunday)
    prev_stats = compute_statistics(prev_records)
    prev_diff = compute_comparison(stats, prev_stats)

    # 前週比を stats に追加
    stats['prev_week_diff'] = prev_diff.get('avg_temp_diff', None)

    # 前年同週のデータ
    prev_year_monday = monday.replace(year=monday.year - 1)
    prev_year_sunday = sunday.replace(year=sunday.year - 1)
    prev_year_records = filter_by_date_range(all_records, prev_year_monday, prev_year_sunday)
    prev_year_stats = compute_statistics(prev_year_records)
    prev_year_diff = compute_comparison(stats, prev_year_stats)
    stats['prev_year_diff'] = prev_year_diff.get('avg_temp_diff', None)

    # 直近4週間の推移
    recent_weeks = compute_recent_weeks(all_records, monday, count=4)

    # ベースライン（過去の同週データを動的に収集 — 年数が増えても自動対応）
    baseline_records = []
    baseline_years_count = 0
    for y_offset in range(1, 10):  # 最大9年前まで探索
        try:
            prev_mon = monday.replace(year=monday.year - y_offset)
            prev_sun = sunday.replace(year=sunday.year - y_offset)
        except ValueError:
            continue  # うるう年のずれなど
        found = filter_by_date_range(all_records, prev_mon, prev_sun)
        if found:
            baseline_records.extend(found)
            baseline_years_count += 1
    baseline_stats = compute_statistics(baseline_records)
    baseline_deviation = None
    if baseline_stats.get('avg_temp') and stats.get('avg_temp'):
        baseline_deviation = round(stats['avg_temp'] - baseline_stats['avg_temp'], 1)

    # 特筆イベント
    events = detect_notable_events(current_records, all_records)

    # 季節マイルストーン
    milestones = detect_season_milestones(all_records)

    # ヒートマップ
    heatmap = generate_heatmap_data(all_records)

    # グラフデータ
    chart_data = generate_chart_data_weekly(current_records, prev_year_records)

    # ===== AI 分析 =====
    period_label = f"{year}年 第{week}週（{monday.month}/{monday.day} 〜 {sunday.month}/{sunday.day}）"

    daily_data_formatted = [
        {
            'date': r['date'],
            'weekday': WEEKDAY_NAMES[parse_date(r['date']).weekday()] if parse_date(r['date']) else '',
            'high': r.get('high'),
            'low': r.get('low'),
            'avg': r.get('avg'),
            'range': r.get('range'),
        }
        for r in current_records
    ]

    # 前年日別データのフォーマット
    prev_year_daily = [
        {'date': r['date'], 'high': r.get('high'), 'low': r.get('low'), 'avg': r.get('avg')}
        for r in prev_year_records
    ]

    # 高度分析データ
    analytics = compute_advanced_analytics(all_records, stats, monday, sunday)

    baseline_info = {
        'baseline_avg': baseline_stats.get('avg_temp'),
        'current_deviation': baseline_deviation,
        'years_count': baseline_years_count,
    }

    # 偏差チャートデータ（baseline_avg があれば生成）
    if baseline_info.get('baseline_avg') is not None:
        chart_data['deviation'] = _generate_deviation_data(
            current_records, baseline_info['baseline_avg']
        )

    sections = {
        'summary': {
            'title': '週間サマリー',
            'ai_comment': '',
            'highlights': [],
        },
        'statistics': {
            'title': '週間統計',
            **stats,
        },
        'daily_data': daily_data_formatted,
        'comparison': {
            'title': '前年比較',
            'prev_year_week': {
                'year': year - 1,
                'week': week,
                **prev_year_stats,
            },
            **prev_year_diff,
            'ai_comment': '',
        },
        'baseline': {
            'title': '2年平均との比較',
            **baseline_info,
            'ai_comment': '',
        },
        'events': {
            'title': '特筆イベント',
            'items': events,
            'ai_comment': '',
        },
        'season': {
            'title': '季節の進み具合',
            'milestones': milestones,
            'ai_comment': '',
        },
        'heatmap': {
            'title': '気温ヒートマップ',
            'data': heatmap,
        },
    }

    # ハイライト生成
    highlights = []
    if stats.get('max_temp') is not None:
        highlights.append(f"最高気温 {stats['max_temp']:.1f}℃")
    if stats.get('min_temp') is not None:
        highlights.append(f"最低気温 {stats['min_temp']:.1f}℃")
    if stats.get('prev_week_diff') is not None:
        highlights.append(f"前週比 {stats['prev_week_diff']:+.1f}℃")
    if stats.get('prev_year_diff') is not None:
        highlights.append(f"前年比 {stats['prev_year_diff']:+.1f}℃")
    sections['summary']['highlights'] = highlights

    # トレンド計算（気温推移AI分析用）
    avg_values = [r.get('avg') for r in current_records if r.get('avg') is not None]
    trend = compute_trend(avg_values)

    # AI分析実行
    if not skip_ai:
        print("  → AI分析を実行中...")

        sections['summary']['ai_comment'] = analyze_with_gemini(
            'サマリー',
            build_summary_prompt('weekly', period_label, stats, prev_diff, events,
                                daily_data_formatted, prev_year_daily,
                                recent_weeks, baseline_info, analytics)
        )
        if prev_year_stats:
            sections['comparison']['ai_comment'] = analyze_with_gemini(
                '前年比較',
                build_comparison_prompt(period_label, stats, prev_year_stats, prev_year_diff,
                                       daily_data_formatted, prev_year_daily)
            )
        # 気温推移の分析
        sections['trend_analysis'] = {
            'title': '気温推移の分析',
            'ai_comment': analyze_with_gemini(
                '気温推移',
                build_trend_prompt('weekly', period_label, stats,
                                  daily_data_formatted, trend,
                                  prev_year_daily, baseline_info, analytics)
            ),
        }
    else:
        print("  → AI分析をスキップ")

    # レポート組み立て
    report = {
        'type': 'weekly',
        'period': {
            'year': year,
            'week': week,
            'start_date': monday.isoformat(),
            'end_date': sunday.isoformat(),
            'label': period_label,
        },
        'generated_at': datetime.now(JST).isoformat(),
        'sections': sections,
        'chart_data': chart_data,
    }

    return report


def generate_monthly_report(all_records: List[Dict], target_date: date,
                             skip_ai: bool = False) -> Optional[Dict]:
    """月次レポートを生成"""
    year, month = target_date.year, target_date.month
    first, last = get_month_range(year, month)

    print(f"\n=== 月次レポート生成: {year}年{month}月 ({first} 〜 {last}) ===")

    # 今月のデータ
    current_records = filter_by_date_range(all_records, first, last)
    if not current_records:
        print(f"  [SKIP] データが見つかりません: {first} 〜 {last}")
        return None

    print(f"  → {len(current_records)} 日分のデータ")

    # 統計計算
    stats = compute_statistics(current_records)

    # 前月のデータ
    if month == 1:
        prev_first, prev_last = get_month_range(year - 1, 12)
    else:
        prev_first, prev_last = get_month_range(year, month - 1)
    prev_records = filter_by_date_range(all_records, prev_first, prev_last)
    prev_stats = compute_statistics(prev_records)
    prev_diff = compute_comparison(stats, prev_stats)
    stats['prev_month_diff'] = prev_diff.get('avg_temp_diff', None)

    # 前年同月のデータ
    prev_year_first, prev_year_last = get_month_range(year - 1, month)
    prev_year_records = filter_by_date_range(all_records, prev_year_first, prev_year_last)
    prev_year_stats = compute_statistics(prev_year_records)
    prev_year_diff = compute_comparison(stats, prev_year_stats)
    stats['prev_year_diff'] = prev_year_diff.get('avg_temp_diff', None)

    # 直近4週間の推移
    recent_weeks = compute_recent_weeks(all_records, first, count=4)

    # 週ごとの推移（月内）
    weekly_breakdown = []
    week_start = first
    while week_start <= last:
        week_end = min(week_start + timedelta(days=6), last)
        week_records = filter_by_date_range(all_records, week_start, week_end)
        if week_records:
            week_stats = compute_statistics(week_records)
            weekly_breakdown.append({
                'start_date': week_start.isoformat(),
                'end_date': week_end.isoformat(),
                'label': f"{week_start.month}/{week_start.day}〜{week_end.month}/{week_end.day}",
                **week_stats,
            })
        week_start = week_end + timedelta(days=1)

    # ベースライン（過去の同月データを動的に収集 — 年数が増えても自動対応）
    baseline_records = []
    baseline_years_count = 0
    for y_offset in range(1, 10):  # 最大9年前まで探索
        try:
            prev_first, prev_last = get_month_range(year - y_offset, month)
        except ValueError:
            continue
        found = filter_by_date_range(all_records, prev_first, prev_last)
        if found:
            baseline_records.extend(found)
            baseline_years_count += 1
    baseline_stats = compute_statistics(baseline_records)
    baseline_deviation = None
    if baseline_stats.get('avg_temp') and stats.get('avg_temp'):
        baseline_deviation = round(stats['avg_temp'] - baseline_stats['avg_temp'], 1)

    # 特筆イベント
    events = detect_notable_events(current_records, all_records)

    # 季節マイルストーン
    milestones = detect_season_milestones(all_records)

    # ヒートマップ
    heatmap = generate_heatmap_data(all_records)

    # グラフデータ
    chart_data = generate_chart_data_monthly(current_records, prev_year_records)

    # 偏差チャートデータ
    if baseline_stats.get('avg_temp') is not None:
        chart_data['deviation'] = _generate_deviation_data(
            current_records, baseline_stats['avg_temp']
        )

    # 週ごとの推移グラフデータ
    if weekly_breakdown:
        chart_data['weekly_trend_in_month'] = {
            'labels': [w['label'] for w in weekly_breakdown],
            'avgs': [w.get('avg_temp') for w in weekly_breakdown],
            'highs': [w.get('avg_high') for w in weekly_breakdown],
            'lows': [w.get('avg_low') for w in weekly_breakdown],
        }

    # ===== セクション組み立て =====
    period_label = f"{year}年{month}月"

    daily_data_formatted = [
        {
            'date': r['date'],
            'weekday': WEEKDAY_NAMES[parse_date(r['date']).weekday()] if parse_date(r['date']) else '',
            'high': r.get('high'),
            'low': r.get('low'),
            'avg': r.get('avg'),
            'range': r.get('range'),
        }
        for r in current_records
    ]

    prev_year_daily = [
        {'date': r['date'], 'high': r.get('high'), 'low': r.get('low'), 'avg': r.get('avg')}
        for r in prev_year_records
    ]

    # 高度分析データ
    analytics = compute_advanced_analytics(all_records, stats, first, last)

    baseline_info = {
        'baseline_avg': baseline_stats.get('avg_temp'),
        'current_deviation': baseline_deviation,
        'years_count': baseline_years_count,
    }

    sections = {
        'summary': {
            'title': '月間サマリー',
            'ai_comment': '',
            'highlights': [],
        },
        'statistics': {
            'title': '月間統計',
            **stats,
        },
        'daily_data': daily_data_formatted,
        'weekly_breakdown': weekly_breakdown,
        'comparison': {
            'title': '前年同月比較',
            'prev_year_month': {
                'year': year - 1,
                'month': month,
                **prev_year_stats,
            },
            **prev_year_diff,
            'ai_comment': '',
        },
        'prev_month': {
            'title': '前月比較',
            'prev_month_stats': prev_stats,
            **prev_diff,
            'ai_comment': '',
        },
        'baseline': {
            'title': '2年平均との比較',
            **baseline_info,
            'ai_comment': '',
        },
        'events': {
            'title': '特筆イベント',
            'items': events,
            'ai_comment': '',
        },
        'season': {
            'title': '季節の進み具合',
            'milestones': milestones,
            'ai_comment': '',
        },
        'heatmap': {
            'title': '気温ヒートマップ',
            'data': heatmap,
        },
    }

    # ハイライト
    highlights = []
    if stats.get('avg_temp') is not None:
        highlights.append(f"月平均 {stats['avg_temp']:.1f}℃")
    if stats.get('max_temp') is not None:
        highlights.append(f"最高 {stats['max_temp']:.1f}℃")
    if stats.get('prev_month_diff') is not None:
        highlights.append(f"前月比 {stats['prev_month_diff']:+.1f}℃")
    if stats.get('prev_year_diff') is not None:
        highlights.append(f"前年比 {stats['prev_year_diff']:+.1f}℃")
    sections['summary']['highlights'] = highlights

    # トレンド計算（気温推移AI分析用）
    avg_values = [r.get('avg') for r in current_records if r.get('avg') is not None]
    trend = compute_trend(avg_values)

    # AI分析実行
    if not skip_ai:
        print("  → AI分析を実行中...")

        sections['summary']['ai_comment'] = analyze_with_gemini(
            'サマリー',
            build_summary_prompt('monthly', period_label, stats, prev_diff, events,
                                daily_data_formatted, prev_year_daily,
                                recent_weeks, baseline_info, analytics)
        )
        if prev_year_stats:
            sections['comparison']['ai_comment'] = analyze_with_gemini(
                '前年同月比較',
                build_comparison_prompt(period_label, stats, prev_year_stats, prev_year_diff,
                                       daily_data_formatted, prev_year_daily)
            )
        # 気温推移の分析
        sections['trend_analysis'] = {
            'title': '気温推移の分析',
            'ai_comment': analyze_with_gemini(
                '気温推移',
                build_trend_prompt('monthly', period_label, stats,
                                  daily_data_formatted, trend,
                                  prev_year_daily, baseline_info, analytics)
            ),
        }
    else:
        print("  → AI分析をスキップ")

    report = {
        'type': 'monthly',
        'period': {
            'year': year,
            'month': month,
            'start_date': first.isoformat(),
            'end_date': last.isoformat(),
            'label': period_label,
        },
        'generated_at': datetime.now(JST).isoformat(),
        'sections': sections,
        'chart_data': chart_data,
    }

    return report


# =============================================================================
# ファイル出力
# =============================================================================

def save_report(report: Dict) -> str:
    """レポートをJSONファイルに保存。既存ファイルにAIコメントがあれば引き継ぐ。"""
    report_type = report['type']
    period = report['period']

    if report_type == 'weekly':
        WEEKLY_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{period['year']}-W{period['week']:02d}.json"
        filepath = WEEKLY_DIR / filename
        index_entry = {
            'period': f"{period['year']}-W{period['week']:02d}",
            'label': f"{period['start_date'][5:].replace('-', '/')} 〜 {period['end_date'][5:].replace('-', '/')}",
            'file': f"weekly/{filename}",
        }
    else:
        MONTHLY_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{period['year']}-{period['month']:02d}.json"
        filepath = MONTHLY_DIR / filename
        index_entry = {
            'period': f"{period['year']}-{period['month']:02d}",
            'label': f"{period['year']}年{period['month']}月",
            'file': f"monthly/{filename}",
        }

    # 既存ファイルのAIコメントを引き継ぐ
    if filepath.exists():
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            existing_sections = existing.get('sections', {})
            new_sections = report.get('sections', {})

            # 引き継ぎ対象のセクション名と ai_comment キー
            ai_sections = [
                'summary', 'comparison', 'trend_analysis',
                'baseline', 'events', 'season',
            ]
            preserved = 0
            for sec_name in ai_sections:
                existing_comment = existing_sections.get(sec_name, {}).get('ai_comment', '')
                new_comment = new_sections.get(sec_name, {}).get('ai_comment', '')
                # 既存コメントが空でなく、新しい側が空の場合のみ引き継ぐ
                if existing_comment and not new_comment:
                    if sec_name in new_sections:
                        new_sections[sec_name]['ai_comment'] = existing_comment
                    else:
                        new_sections[sec_name] = {'ai_comment': existing_comment}
                    preserved += 1

            if preserved:
                print(f"  → 既存AIコメントを {preserved} セクション引き継ぎました")
        except Exception as e:
            print(f"  → 既存ファイル読み込み失敗（引き継ぎなし）: {e}")

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"  → 保存: {filepath}")
    return index_entry


def update_index(entries: List[Dict]):
    """reports/index.json を更新"""
    index_path = REPORTS_DIR / 'index.json'

    if index_path.exists():
        with open(index_path, 'r', encoding='utf-8') as f:
            index = json.load(f)
    else:
        index = {'updated_at': None, 'weekly': [], 'monthly': []}

    for entry in entries:
        report_type = 'weekly' if entry['file'].startswith('weekly/') else 'monthly'
        existing = [e for e in index[report_type] if e['period'] == entry['period']]
        if existing:
            # 上書き
            idx = index[report_type].index(existing[0])
            index[report_type][idx] = entry
        else:
            index[report_type].append(entry)

    # 降順ソート（最新が先頭）
    index['weekly'].sort(key=lambda x: x['period'], reverse=True)
    index['monthly'].sort(key=lambda x: x['period'], reverse=True)
    index['updated_at'] = datetime.now(JST).isoformat()

    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"  → index.json 更新: weekly={len(index['weekly'])}件, monthly={len(index['monthly'])}件")


# =============================================================================
# バックフィル（過去レポート一括生成）
# =============================================================================

def backfill(all_records: List[Dict], skip_ai: bool = True):
    """2024年3月〜現在の過去レポートを一括生成"""
    if not all_records:
        print("[ERROR] データがありません")
        return

    # 最古と最新の日付を取得
    dates = [parse_date(r['date']) for r in all_records if parse_date(r['date'])]
    earliest = min(dates)
    latest = max(dates)
    print(f"\n=== バックフィル: {earliest} 〜 {latest} ===")

    entries = []

    # 月次レポート
    current = date(earliest.year, earliest.month, 1)
    today = date.today()
    while current <= today:
        report = generate_monthly_report(all_records, current, skip_ai=skip_ai)
        if report:
            entry = save_report(report)
            entries.append(entry)
        # 次の月へ
        if current.month == 12:
            current = date(current.year + 1, 1, 1)
        else:
            current = date(current.year, current.month + 1, 1)

    # 週次レポート
    current = earliest - timedelta(days=earliest.weekday())  # 最初の月曜日
    while current <= today:
        report = generate_weekly_report(all_records, current, skip_ai=skip_ai)
        if report:
            entry = save_report(report)
            entries.append(entry)
        current += timedelta(weeks=1)

    update_index(entries)
    print(f"\n=== バックフィル完了: {len(entries)} 件のレポートを生成 ===")


# =============================================================================
# メイン処理
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description='週次・月次分析レポート生成')
    parser.add_argument('--type', choices=['weekly', 'monthly'], help='レポートタイプ')
    parser.add_argument('--date', help='対象日付 (YYYY-MM-DD or YYYY-MM)')
    parser.add_argument('--backfill', action='store_true', help='過去レポートを一括生成')
    parser.add_argument('--no-ai', action='store_true', help='AI分析をスキップ')
    args = parser.parse_args()

    print(f"[{datetime.now(JST).isoformat()}] レポート生成 開始")

    # データ取得
    all_records = fetch_daily_data()
    if not all_records:
        print("[ERROR] データの取得に失敗しました")
        sys.exit(1)

    entries = []

    if args.backfill:
        backfill(all_records, skip_ai=args.no_ai)
        return

    # 対象日付の決定
    if args.date:
        if len(args.date) == 7:  # YYYY-MM
            target = date(int(args.date[:4]), int(args.date[5:7]), 1)
        else:
            target = date.fromisoformat(args.date)
    else:
        target = date.today()

    report_type = args.type
    if not report_type:
        print("[ERROR] --type (weekly/monthly) または --backfill を指定してください")
        sys.exit(1)

    if report_type == 'weekly':
        report = generate_weekly_report(all_records, target, skip_ai=args.no_ai)
    else:
        report = generate_monthly_report(all_records, target, skip_ai=args.no_ai)

    if report:
        entry = save_report(report)
        entries.append(entry)
        update_index(entries)

    print(f"\n[{datetime.now(JST).isoformat()}] レポート生成 完了")


if __name__ == '__main__':
    main()
