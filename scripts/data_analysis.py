#!/usr/bin/env python3
"""
Enhanced Data Analysis Module for AI Weather Advisor
階層型データ取得 + 包括的事前分析
"""

import math
import re
import statistics
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

# JST タイムゾーン
JST = timezone(timedelta(hours=9))

# MM/DD 形式の年推定における許容時計ズレ（未来方向）と、うるう年探索年数
_MAX_FUTURE_CLOCK_SKEW = timedelta(days=1)
_YEAR_RESOLUTION_LOOKBACK = 8

# 分析ウィンドウ・サンプリング・異常検知・出力件数設定
_RECENT_WINDOW = timedelta(hours=6)
_MID_WINDOW = timedelta(hours=24)
_HISTORY_WINDOW = timedelta(days=7)
_TREND_1H_WINDOW = timedelta(hours=1)
_TREND_3H_WINDOW = timedelta(hours=3)
_TREND_ACCEL_MIN_RECORDS = 30
_TREND_ACCEL_THRESHOLD_C = 0.3
_TREND_REGRESSION_MIN_RECORDS = 10
_TREND_PREDICT_HORIZON_MINUTES = 60
_SAMPLE_6_24H_STEP = 5
_SAMPLE_1_7D_STEP = 30
_DETAILED_6H_LIMIT = 360
_YESTERDAY_TOLERANCE_SECONDS = 1800  # 30分以内
_RAPID_CHANGE_STEP = 30
_RAPID_CHANGE_THRESHOLD_C = 2.0
_RECENT_ALERTS_LIMIT = 3
_DAILY_SUMMARY_DAYS = 7

# 対応日時フォーマット
_FULL_DATETIME_RE = re.compile(
    r"^\s*(?P<year>\d{4})(?P<sep>[-/])(?P<month>\d{1,2})(?P=sep)(?P<day>\d{1,2})"
    r"[Tt\s]+(?P<hour>\d{1,2}):(?P<minute>\d{2})"
    r"(?::(?P<second>\d{2})(?:\.(?P<micro>\d{1,6}))?)?"
    r"(?:\s*(?P<tz>[Zz]|[+-]\d{2}:?\d{2}))?\s*$"
)
_SHORT_DATETIME_RE = re.compile(
    r"^\s*(?P<month>\d{1,2})/(?P<day>\d{1,2})\s+"
    r"(?P<hour>\d{1,2}):(?P<minute>\d{2})(?::(?P<second>\d{2}))?\s*$"
)

_SLOT_NAMES = [
    '深夜(0-3)', '未明(3-6)', '朝(6-9)', '午前(9-12)',
    '午後(12-15)', '夕方(15-18)', '夜(18-21)', '深夜(21-24)',
]
_WEEKDAY_NAMES = ['月', '火', '水', '木', '金', '土', '日']


def _normalize_jst(dt: Optional[datetime] = None) -> datetime:
    """基準日時を JST の timezone-aware datetime に正規化する。"""
    if dt is None:
        return datetime.now(JST)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=JST)
    return dt.astimezone(JST)


def _parse_tz_offset(tz_str: Optional[str]) -> Optional[timezone]:
    """ISO 8601 のタイムゾーン表記（Z, ±HH:MM, ±HHMM）を timezone に変換する。"""
    if not tz_str:
        return JST
    if tz_str.upper() == 'Z':
        return timezone.utc

    sign = 1 if tz_str[0] == '+' else -1
    digits = tz_str[1:].replace(':', '')
    hours = int(digits[:2])
    minutes = int(digits[2:4])
    if hours > 23 or minutes > 59:
        return None
    return timezone(timedelta(hours=hours, minutes=minutes) * sign)


def _resolve_month_day_datetime(
    month: int,
    day: int,
    hour: int,
    minute: int,
    second: int,
    ref_now: datetime,
) -> Optional[datetime]:
    """
    年なしの MM/DD HH:MM(:SS) 文字列を基準日時 ref_now から年推定して JST datetime にする。

    年末年始またぎや、平年に残った 02/29 データにも対応するため、
    ref_now + 許容時計ズレ以下で最も新しい有効年を探索する。
    """
    cutoff = ref_now + _MAX_FUTURE_CLOCK_SKEW
    for year in range(ref_now.year + 1, ref_now.year - _YEAR_RESOLUTION_LOOKBACK - 1, -1):
        try:
            candidate = datetime(year, month, day, hour, minute, second, tzinfo=JST)
        except ValueError:
            continue
        if candidate <= cutoff:
            return candidate
    return None


def parse_datetime(dt_str: Any, now: Optional[datetime] = None) -> Optional[datetime]:
    """
    各種日時文字列を JST タイムゾーン付きの datetime に変換する。

    対応形式:
        - YYYY-MM-DD HH:MM(:SS)
        - YYYY/MM/DD HH:MM(:SS)
        - YYYY-MM-DDTHH:MM(:SS)（ISO 8601 の小数秒・Z・±HH:MM にも対応）
        - MM/DD HH:MM(:SS)（基準日時 now を基に年またぎ・02/29 を考慮して年解決）
    """
    if not isinstance(dt_str, str):
        return None
    text = dt_str.strip()
    if not text:
        return None

    full_match = _FULL_DATETIME_RE.match(text)
    if full_match:
        tz = _parse_tz_offset(full_match.group('tz'))
        if tz is None:
            return None
        micro_raw = full_match.group('micro')
        microsecond = int(micro_raw.ljust(6, '0')) if micro_raw else 0
        try:
            parsed = datetime(
                int(full_match.group('year')),
                int(full_match.group('month')),
                int(full_match.group('day')),
                int(full_match.group('hour')),
                int(full_match.group('minute')),
                int(full_match.group('second') or 0),
                microsecond,
                tzinfo=tz,
            )
        except ValueError:
            return None
        return parsed.astimezone(JST)

    short_match = _SHORT_DATETIME_RE.match(text)
    if short_match:
        ref_now = _normalize_jst(now)
        return _resolve_month_day_datetime(
            int(short_match.group('month')),
            int(short_match.group('day')),
            int(short_match.group('hour')),
            int(short_match.group('minute')),
            int(short_match.group('second') or 0),
            ref_now,
        )

    return None


def _to_finite_float(value: Any) -> Optional[float]:
    """bool や NaN/Inf を除外して有限浮動小数点数に変換する。"""
    if isinstance(value, bool) or value is None:
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    return num if math.isfinite(num) else None


def _extract_valid_records(all_records: List[Dict], ref_now: datetime) -> List[Dict[str, Any]]:
    """タイムスタンプが有効かつセンサー異常 (0.0, 0.0) でないレコードを抽出・時系列ソートする。"""
    valid_records: List[Dict[str, Any]] = []
    for r in all_records:
        if not isinstance(r, dict):
            continue
        parsed_dt = parse_datetime(r.get('datetime', ''), now=ref_now)
        if parsed_dt is None:
            continue
        temp = _to_finite_float(r.get('temperature', 0.0))
        humid = _to_finite_float(r.get('humidity', 0.0))
        if temp is None or humid is None:
            continue
        if temp == 0.0 and humid == 0.0:
            continue  # 異常データを除外
        valid_records.append({
            **r,
            'parsed_dt': parsed_dt,
            'temperature': temp,
            'humidity': humid,
        })

    valid_records.sort(key=lambda x: x['parsed_dt'])
    return valid_records


def _compute_statistics(all_temps: List[float], all_humids: List[float]) -> Dict[str, Any]:
    """基本統計・パーセンタイル・現在気温の Z スコアを算出する。"""
    stats = {
        'temp_mean': round(statistics.mean(all_temps), 2),
        'temp_median': round(statistics.median(all_temps), 2),
        'temp_stdev': round(statistics.stdev(all_temps), 2) if len(all_temps) > 1 else 0,
        'temp_min': round(min(all_temps), 2),
        'temp_max': round(max(all_temps), 2),
        'temp_range': round(max(all_temps) - min(all_temps), 2),
        'humidity_mean': round(statistics.mean(all_humids), 1),
        'humidity_stdev': round(statistics.stdev(all_humids), 1) if len(all_humids) > 1 else 0,
    }

    sorted_temps = sorted(all_temps)
    n = len(sorted_temps)
    stats['temp_25th'] = sorted_temps[n // 4]
    stats['temp_75th'] = sorted_temps[3 * n // 4]

    current_temp = all_temps[-1]
    below_count = sum(1 for t in all_temps if t < current_temp)
    stats['current_percentile'] = round(100 * below_count / n, 1)

    if stats['temp_stdev'] > 0:
        z_score = (current_temp - stats['temp_mean']) / stats['temp_stdev']
        stats['current_z_score'] = round(z_score, 2)
    else:
        stats['current_z_score'] = 0

    return stats


def _compute_trends(valid_records: List[Dict[str, Any]], ref_now: datetime) -> Dict[str, Any]:
    """直近1時間・3時間の変化、加速度、線形回帰による1時間後予測を算出する。"""
    trends: Dict[str, Any] = {}

    one_hour_ago = ref_now - _TREND_1H_WINDOW
    recent_1h = [r for r in valid_records if r['parsed_dt'] >= one_hour_ago]
    if len(recent_1h) >= 2:
        temp_change_1h = recent_1h[-1]['temperature'] - recent_1h[0]['temperature']
        trends['change_rate_1h'] = round(temp_change_1h, 2)  # °C/hour

    three_hours_ago = ref_now - _TREND_3H_WINDOW
    recent_3h = [r for r in valid_records if r['parsed_dt'] >= three_hours_ago]
    if len(recent_3h) >= 2:
        temp_change_3h = recent_3h[-1]['temperature'] - recent_3h[0]['temperature']
        trends['change_rate_3h'] = round(temp_change_3h / 3, 2)  # °C/hour averaged
        trends['total_change_3h'] = round(temp_change_3h, 2)

    if len(recent_1h) >= _TREND_ACCEL_MIN_RECORDS:
        mid_idx = len(recent_1h) // 2
        first_half_change = recent_1h[mid_idx]['temperature'] - recent_1h[0]['temperature']
        second_half_change = recent_1h[-1]['temperature'] - recent_1h[mid_idx]['temperature']
        acceleration = second_half_change - first_half_change
        trends['acceleration'] = round(acceleration, 2)
        if acceleration > _TREND_ACCEL_THRESHOLD_C:
            trends['acceleration_status'] = '上昇加速中'
        elif acceleration < -_TREND_ACCEL_THRESHOLD_C:
            trends['acceleration_status'] = '下降加速中'
        else:
            trends['acceleration_status'] = '安定'

    if len(recent_1h) >= _TREND_REGRESSION_MIN_RECORDS:
        temps = [r['temperature'] for r in recent_1h]
        n = len(temps)
        x_mean = (n - 1) / 2
        y_mean = sum(temps) / n

        numerator = sum((i - x_mean) * (temps[i] - y_mean) for i in range(n))
        denominator = sum((i - x_mean) ** 2 for i in range(n))

        if denominator > 0:
            slope = numerator / denominator  # per minute
            intercept = y_mean - slope * x_mean
            predicted_1h = slope * (n + _TREND_PREDICT_HORIZON_MINUTES) + intercept
            trends['predicted_temp_1h'] = round(predicted_1h, 1)
            trends['predicted_change_1h'] = round(predicted_1h - temps[-1], 1)

    return trends


def _compute_patterns(
    valid_records: List[Dict[str, Any]],
    all_temps: List[float],
    ref_now: datetime,
) -> Dict[str, Any]:
    """時間帯別・曜日別パターンおよび昨日同時刻比を算出する。"""
    patterns: Dict[str, Any] = {}

    time_slots: Dict[int, List[float]] = {i: [] for i in range(8)}
    weekday_temps: Dict[int, List[float]] = {i: [] for i in range(7)}
    for r in valid_records:
        parsed_dt = r['parsed_dt']
        time_slots[parsed_dt.hour // 3].append(r['temperature'])
        weekday_temps[parsed_dt.weekday()].append(r['temperature'])

    patterns['time_slot_avg'] = {
        _SLOT_NAMES[i]: round(sum(temps) / len(temps), 1)
        for i, temps in time_slots.items()
        if temps
    }

    current_slot_temps = time_slots.get(ref_now.hour // 3, [])
    if current_slot_temps and all_temps:
        slot_avg = sum(current_slot_temps) / len(current_slot_temps)
        patterns['vs_time_slot_avg'] = round(all_temps[-1] - slot_avg, 1)

    patterns['weekday_avg'] = {
        _WEEKDAY_NAMES[i]: round(sum(temps) / len(temps), 1)
        for i, temps in weekday_temps.items()
        if temps
    }

    yesterday = ref_now - timedelta(days=1)
    yesterday_records = [
        r for r in valid_records
        if abs((r['parsed_dt'] - yesterday).total_seconds()) < _YESTERDAY_TOLERANCE_SECONDS
    ]
    if yesterday_records and all_temps:
        yesterday_temp = yesterday_records[-1]['temperature']
        patterns['vs_yesterday'] = round(all_temps[-1] - yesterday_temp, 1)

    return patterns


def _compute_anomalies(
    valid_records: List[Dict[str, Any]],
    current_z_score: float,
) -> Dict[str, Any]:
    """急変検出（30分で2°C以上）および Z スコアによる異常度判定を行う。"""
    anomalies: Dict[str, Any] = {'alerts': []}

    for i in range(_RAPID_CHANGE_STEP, len(valid_records)):
        temp_now = valid_records[i]['temperature']
        temp_30min_ago = valid_records[i - _RAPID_CHANGE_STEP]['temperature']
        change = temp_now - temp_30min_ago
        if abs(change) >= _RAPID_CHANGE_THRESHOLD_C:
            anomalies['alerts'].append({
                'type': 'rapid_change',
                'time': valid_records[i]['datetime'],
                'change': round(change, 1),
                'direction': '急上昇' if change > 0 else '急降下',
            })

    anomalies['alerts'] = anomalies['alerts'][-_RECENT_ALERTS_LIMIT:]

    if current_z_score:
        z = abs(current_z_score)
        if z > 2.5:
            anomalies['current_status'] = '非常に異常な気温'
        elif z > 2.0:
            anomalies['current_status'] = '異常な気温'
        elif z > 1.5:
            anomalies['current_status'] = 'やや異常'
        else:
            anomalies['current_status'] = '正常範囲'

    return anomalies


def _format_sample_records(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """階層化サンプル用のレコード形式に変換する。"""
    return [
        {'time': r['datetime'], 'temp': r['temperature'], 'humid': r['humidity']}
        for r in records
    ]


def _compute_daily_summary(valid_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """年末年始を跨いでも正しく時系列ソートされる直近7日分の日別サマリーを作成する。"""
    daily_summary: Dict[Any, Dict[str, List[float]]] = {}
    for r in valid_records:
        date_obj = r['parsed_dt'].date()
        if date_obj not in daily_summary:
            daily_summary[date_obj] = {'temps': [], 'humids': []}
        daily_summary[date_obj]['temps'].append(r['temperature'])
        daily_summary[date_obj]['humids'].append(r['humidity'])

    summaries: List[Dict[str, Any]] = []
    for date_obj, data in sorted(daily_summary.items())[-_DAILY_SUMMARY_DAYS:]:
        temps = data['temps']
        summaries.append({
            'date': date_obj.strftime('%m/%d'),
            'high': round(max(temps), 1),
            'low': round(min(temps), 1),
            'avg': round(sum(temps) / len(temps), 1),
            'range': round(max(temps) - min(temps), 1),
        })
    return summaries


def analyze_data_comprehensive(
    all_records: List[Dict],
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    生データから包括的な分析を実行

    Parameters:
        all_records: 全レコード（1分毎、最大12000件）
                     各レコード: {'datetime': str, 'temperature': float, 'humidity': float}
        now: 基準日時（省略時は現在時刻 JST）

    Returns:
        統計、トレンド、パターン、異常検知などの分析結果
    """
    if not all_records:
        return {'error': 'No data available'}

    ref_now = _normalize_jst(now)
    valid_records = _extract_valid_records(all_records, ref_now)
    if not valid_records:
        return {'error': 'No valid timestamped data'}

    # 1. データの時間軸による階層分類
    six_hours_ago = ref_now - _RECENT_WINDOW
    twenty_four_hours_ago = ref_now - _MID_WINDOW
    seven_days_ago = ref_now - _HISTORY_WINDOW

    recent_6h = [r for r in valid_records if r['parsed_dt'] >= six_hours_ago]
    range_6_24h = [
        r for r in valid_records
        if six_hours_ago > r['parsed_dt'] >= twenty_four_hours_ago
    ]
    sampled_6_24h = range_6_24h[::_SAMPLE_6_24H_STEP]
    range_1_7d = [
        r for r in valid_records
        if twenty_four_hours_ago > r['parsed_dt'] >= seven_days_ago
    ]
    sampled_1_7d = range_1_7d[::_SAMPLE_1_7D_STEP]

    all_temps = [r['temperature'] for r in valid_records]
    all_humids = [r['humidity'] for r in valid_records]
    stats = _compute_statistics(all_temps, all_humids)

    return {
        'data_summary': {
            'total_records': len(valid_records),
            'recent_6h_count': len(recent_6h),
            'range_6_24h_count': len(sampled_6_24h),
            'range_1_7d_count': len(sampled_1_7d),
        },
        'statistics': stats,
        'trends': _compute_trends(valid_records, ref_now),
        'patterns': _compute_patterns(valid_records, all_temps, ref_now),
        'anomalies': _compute_anomalies(valid_records, stats.get('current_z_score', 0)),
        'detailed_6h': _format_sample_records(recent_6h[-_DETAILED_6H_LIMIT:]),
        'sampled_6_24h': _format_sample_records(sampled_6_24h),
        'sampled_1_7d': _format_sample_records(sampled_1_7d),
        'daily_summary': _compute_daily_summary(valid_records),
    }


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
