#!/usr/bin/env python3
"""Evidence-first analysis helpers for weekly and monthly temperature reports.

The analyser intentionally separates facts from prose.  ``build_analysis_context``
derives comparable historical and within-period facts, then both the deterministic
analysis and Gemini protocol consume the same context.  Draft weeks carry the facts
and charts but never expose an unfinished narrative as a completed analysis.
"""

from __future__ import annotations

import hashlib
import json
import math
import statistics
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


JST = timezone(timedelta(hours=9))
ANALYSIS_PROTOCOL_VERSION = "3.2"
VALID_ANALYSIS_KEYS = ("summary", "comparison", "trend_analysis")


def _number(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) else None


def _fmt(value: Any, signed: bool = False) -> str:
    number = _number(value)
    if number is None:
        return "--"
    return f"{number:+.1f}" if signed else f"{number:.1f}"


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    text = str(value).replace("/", "-")[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _date_label(value: Any) -> str:
    parsed = _parse_date(value)
    return f"{parsed.month}/{parsed.day}" if parsed else str(value or "--")


def _mean(values: Iterable[Any]) -> Optional[float]:
    clean = [number for value in values if (number := _number(value)) is not None]
    return statistics.mean(clean) if clean else None


def _stdev(values: Iterable[Any]) -> Optional[float]:
    clean = [number for value in values if (number := _number(value)) is not None]
    return statistics.pstdev(clean) if len(clean) >= 2 else 0.0 if clean else None


def _report_key(report: Dict[str, Any]) -> str:
    period = report.get("period", {})
    return f"{report.get('type')}:{period.get('start_date') or period.get('label')}"


def expected_observation_days(report: Dict[str, Any]) -> int:
    period = report.get("period", {})
    start = _parse_date(period.get("start_date"))
    end = _parse_date(period.get("end_date"))
    if not start or not end or end < start:
        return 0
    return (end - start).days + 1


def report_completeness(report: Dict[str, Any], today: Optional[date] = None) -> Dict[str, Any]:
    today = today or datetime.now(JST).date()
    sections = report.get("sections", {})
    stats = sections.get("statistics", {})
    observed = int(stats.get("days") or len(sections.get("daily_data", [])) or 0)
    expected = expected_observation_days(report)
    end = _parse_date(report.get("period", {}).get("end_date"))
    period_closed = bool(end and end < today)
    return {
        "period_closed": period_closed,
        "coverage_complete": bool(expected and observed >= expected),
        "observed_days": observed,
        "expected_days": expected,
    }


def analysis_fingerprint(report: Dict[str, Any]) -> str:
    sections = report.get("sections", {})
    basis = {
        "type": report.get("type"),
        "period": report.get("period"),
        "statistics": sections.get("statistics"),
        "daily_data": sections.get("daily_data"),
        "comparison": sections.get("comparison"),
        "baseline": sections.get("baseline"),
        "events": sections.get("events"),
        "analysis_context": report.get("analysis_context"),
    }
    raw = json.dumps(basis, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def load_reference_reports(reports_root: Path) -> List[Dict[str, Any]]:
    reports: List[Dict[str, Any]] = []
    for report_type in ("weekly", "monthly"):
        for path in sorted((reports_root / report_type).glob("*.json")):
            try:
                report = json.loads(path.read_text(encoding="utf-8"))
                report["_reference_file"] = path.name
                reports.append(report)
            except (OSError, json.JSONDecodeError):
                continue
    return reports


def _longest_streak(values: List[float], predicate) -> int:
    longest = current = 0
    for value in values:
        if predicate(value):
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def _daily_facts(daily: List[Dict[str, Any]]) -> Dict[str, Any]:
    points = []
    for row in daily:
        average = _number(row.get("avg"))
        if average is None:
            continue
        points.append({
            "date": row.get("date", ""),
            "avg": average,
            "high": _number(row.get("high")),
            "low": _number(row.get("low")),
            "range": _number(row.get("range")),
        })
    if not points:
        return {}
    points.sort(key=lambda row: _parse_date(row["date"]) or date.max)

    averages = [row["avg"] for row in points]
    segment = min(7, max(1, len(points) // 3))
    opening = statistics.mean(averages[:segment])
    closing = statistics.mean(averages[-segment:])
    changes = []
    for index in range(1, len(points)):
        changes.append({
            "change": points[index]["avg"] - points[index - 1]["avg"],
            "from_date": points[index - 1]["date"],
            "to_date": points[index]["date"],
        })

    x_mean = (len(averages) - 1) / 2
    denominator = sum((index - x_mean) ** 2 for index in range(len(averages)))
    slope = (
        sum((index - x_mean) * (value - statistics.mean(averages)) for index, value in enumerate(averages))
        / denominator
        if denominator else 0.0
    )
    warmest = max(points, key=lambda row: row["avg"])
    coolest = min(points, key=lambda row: row["avg"])
    highs = [row["high"] for row in points if row["high"] is not None]
    lows = [row["low"] for row in points if row["low"] is not None]
    ranges = [row["range"] for row in points if row["range"] is not None]

    return {
        "opening_avg": round(opening, 2),
        "closing_avg": round(closing, 2),
        "front_to_back_change": round(closing - opening, 2),
        "linear_slope_per_day": round(slope, 3),
        "daily_avg_stdev": round(statistics.pstdev(averages), 2) if len(averages) > 1 else 0.0,
        "mean_absolute_day_change": round(statistics.mean(abs(item["change"]) for item in changes), 2) if changes else 0.0,
        "largest_rise": max(changes, key=lambda item: item["change"]) if changes else None,
        "largest_drop": min(changes, key=lambda item: item["change"]) if changes else None,
        "warmest_average_day": {"date": warmest["date"], "value": warmest["avg"]},
        "coolest_average_day": {"date": coolest["date"], "value": coolest["avg"]},
        "days_high_35_or_more": sum(value >= 35 for value in highs),
        "days_high_30_or_more": sum(value >= 30 for value in highs),
        "days_low_below_zero": sum(value < 0 for value in lows),
        "days_range_10_or_more": sum(value >= 10 for value in ranges),
        "longest_high_35_streak": _longest_streak([row["high"] or -999 for row in points], lambda value: value >= 35),
        "longest_high_30_streak": _longest_streak([row["high"] or -999 for row in points], lambda value: value >= 30),
    }


def _period_slot(report: Dict[str, Any]) -> Optional[int]:
    period = report.get("period", {})
    key = "week" if report.get("type") == "weekly" else "month"
    value = period.get(key)
    return int(value) if isinstance(value, (int, float)) else None


def _period_row(report: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    stats = report.get("sections", {}).get("statistics", {})
    average = _number(stats.get("avg_temp"))
    period = report.get("period", {})
    start = _parse_date(period.get("start_date"))
    if average is None or not start:
        return None
    declared_year = _number(period.get("year"))
    return {
        "key": _report_key(report),
        "period": report.get("period", {}).get("label"),
        "start_date": start.isoformat(),
        # ISO week 1 can begin in December.  Use the report's declared ISO year,
        # rather than the calendar year of start_date, for historical labels.
        "year": int(declared_year) if declared_year is not None else start.year,
        "avg_temp": average,
        "max_temp": _number(stats.get("max_temp")),
        "min_temp": _number(stats.get("min_temp")),
        "avg_daily_range": _number(stats.get("avg_daily_range")),
    }


def build_analysis_context(
    report: Dict[str, Any],
    reference_reports: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Derive auditable facts used by both local and Gemini narratives."""
    reference_reports = reference_reports or []
    report_type = report.get("type")
    current_key = _report_key(report)
    current_row = _period_row(report)
    current_start = _parse_date(report.get("period", {}).get("start_date"))
    slot = _period_slot(report)

    comparable = []
    recent = []
    seen = set()
    for candidate in reference_reports:
        if candidate.get("type") != report_type or _report_key(candidate) == current_key:
            continue
        row = _period_row(candidate)
        if not row or row["key"] in seen:
            continue
        seen.add(row["key"])
        candidate_start = _parse_date(row["start_date"])
        if _period_slot(candidate) == slot and report_completeness(candidate).get("period_closed"):
            comparable.append(row)
        if current_start and candidate_start and candidate_start < current_start:
            recent.append(row)

    comparable.sort(key=lambda row: row["start_date"])
    recent.sort(key=lambda row: row["start_date"], reverse=True)
    recent = recent[:4]

    seasonal: Dict[str, Any] = {
        "slot": slot,
        "comparison_periods": comparable,
        "other_period_count": len(comparable),
    }
    if current_row:
        sample = comparable + [current_row]
        averages = [row["avg_temp"] for row in sample]
        peer_average = _mean(row["avg_temp"] for row in comparable)
        seasonal.update({
            "sample_count_including_current": len(sample),
            "years": sorted({row["year"] for row in sample}),
            "peer_average": round(peer_average, 2) if peer_average is not None else None,
            "deviation_from_peer_average": round(current_row["avg_temp"] - peer_average, 2) if peer_average is not None else None,
            "rank_warmest": 1 + sum(value > current_row["avg_temp"] for value in averages),
            "rank_coldest": 1 + sum(value < current_row["avg_temp"] for value in averages),
            "sample_min": min(averages),
            "sample_max": max(averages),
            "sample_stdev": round(statistics.pstdev(averages), 2) if len(averages) > 1 else 0.0,
        })

    recent_mean = _mean(row["avg_temp"] for row in recent)
    recent_context = {
        "previous_periods": list(reversed(recent)),
        "previous_period_count": len(recent),
        "previous_period_mean": round(recent_mean, 2) if recent_mean is not None else None,
        "difference_from_previous_period_mean": (
            round(current_row["avg_temp"] - recent_mean, 2)
            if current_row and recent_mean is not None else None
        ),
    }

    return {
        "context_version": ANALYSIS_PROTOCOL_VERSION,
        "daily_pattern": _daily_facts(report.get("sections", {}).get("daily_data", [])),
        "same_season_history": seasonal,
        "recent_history": recent_context,
    }


def enrich_analysis_context(
    report: Dict[str, Any],
    reference_reports: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    report["analysis_context"] = build_analysis_context(report, reference_reports)
    return report


def _direction_words(value: Optional[float], noun: str = "気温") -> str:
    if value is None:
        return f"{noun}差は算出できません"
    if value >= 2.0:
        return f"{noun}が{value:.1f}℃高い"
    if value <= -2.0:
        return f"{noun}が{abs(value):.1f}℃低い"
    if value >= 0.5:
        return f"{noun}が{value:.1f}℃やや高い"
    if value <= -0.5:
        return f"{noun}が{abs(value):.1f}℃やや低い"
    return f"{noun}差が{abs(value):.1f}℃でほぼ同水準"


def _pattern_description(daily: Dict[str, Any]) -> str:
    change = _number(daily.get("front_to_back_change"))
    variability = _number(daily.get("daily_avg_stdev"))
    if change is not None and change >= 2.0:
        shape = f"前半平均{_fmt(daily.get('opening_avg'))}℃から後半{_fmt(daily.get('closing_avg'))}℃へ上昇し"
    elif change is not None and change <= -2.0:
        shape = f"前半平均{_fmt(daily.get('opening_avg'))}℃から後半{_fmt(daily.get('closing_avg'))}℃へ低下し"
    else:
        shape = f"前半と後半の差は{abs(change or 0):.1f}℃でほぼ横ばいとなり"
    if variability is None:
        return shape
    stability = "日ごとの差は小さめ" if variability < 1.0 else "日ごとの振れは中程度" if variability < 2.2 else "日ごとの振れは大きめ"
    return f"{shape}、{stability}でした"


def _rank_sentence(report: Dict[str, Any], context: Dict[str, Any]) -> Optional[str]:
    seasonal = context.get("same_season_history", {})
    count = int(seasonal.get("sample_count_including_current") or 0)
    if count < 3:
        return None
    warm_rank = int(seasonal.get("rank_warmest") or 0)
    cold_rank = int(seasonal.get("rank_coldest") or 0)
    years = seasonal.get("years") or []
    year_span = f"{min(years)}〜{max(years)}年" if years else "比較可能期間"
    sample_min = _number(seasonal.get("sample_min"))
    sample_max = _number(seasonal.get("sample_max"))
    if sample_min is not None and sample_max is not None and abs(sample_max - sample_min) < 0.05:
        position = "すべて同水準"
    elif warm_rank < cold_rank:
        position = f"高温側{warm_rank}位"
    else:
        position = f"低温側{cold_rank}位"
    slot_label = f"第{_period_slot(report)}週" if report.get("type") == "weekly" else f"{_period_slot(report)}月"
    return f"同じ{slot_label}を比べられる{year_span}の{count}期間では{position}です"


def _event_sentence(daily: Dict[str, Any]) -> Optional[str]:
    hot35 = int(daily.get("days_high_35_or_more") or 0)
    hot30 = int(daily.get("days_high_30_or_more") or 0)
    frost = int(daily.get("days_low_below_zero") or 0)
    wide = int(daily.get("days_range_10_or_more") or 0)
    if hot35:
        streak = int(daily.get("longest_high_35_streak") or 0)
        detail = f"、最長{streak}日連続" if streak >= 2 else ""
        return f"猛暑日は{hot35}日{detail}でした"
    if hot30:
        streak = int(daily.get("longest_high_30_streak") or 0)
        detail = f"、最長{streak}日連続" if streak >= 2 else ""
        return f"真夏日は{hot30}日{detail}でした"
    if frost:
        return f"最低気温が氷点下の日は{frost}日ありました"
    if wide:
        return f"日較差10℃以上の日が{wide}日ありました"
    return None


def _synthesis_sentence(
    report: Dict[str, Any],
    stats: Dict[str, Any],
    daily: Dict[str, Any],
    baseline_diff: Optional[float],
    seasonal_diff: Optional[float],
) -> str:
    """Turn the strongest signals into a plain-language answer to “what kind of period was this?”"""
    is_weekly = report.get("type") == "weekly"
    unit = "週" if is_weekly else "月"
    previous_diff = _number(stats.get("prev_week_diff" if is_weekly else "prev_month_diff"))
    year_diff = _number(stats.get("prev_year_diff"))
    peer_diff = seasonal_diff if seasonal_diff is not None else baseline_diff
    front_change = _number(daily.get("front_to_back_change"))
    variability = _number(daily.get("daily_avg_stdev"))
    hot35 = int(daily.get("days_high_35_or_more") or 0)
    frost = int(daily.get("days_low_below_zero") or 0)

    if peer_diff is not None and peer_diff <= -0.8 and front_change is not None and front_change >= 2.0 and hot35:
        return f"総じて、同時期より低温側に位置しながら後半には猛暑日まで上がる、前半と後半の性格が異なる{unit}でした。"
    if peer_diff is not None and peer_diff >= 0.8 and front_change is not None and front_change <= -2.0:
        return f"総じて、同時期より高温側に位置した一方で後半は下降し、暑さの山を前半に越えた{unit}でした。"
    if peer_diff is not None and peer_diff >= 0.8 and hot35:
        return f"総じて、同時期より明確に高温側で、猛暑日も伴った暑さの強い{unit}でした。"
    if peer_diff is not None and peer_diff <= -0.8 and frost:
        return f"総じて、同時期より明確に低温側で、氷点下の日も含む冷え込みの強い{unit}でした。"

    signals = [value for value in (previous_diff, year_diff, peer_diff) if value is not None]
    if len(signals) >= 2 and all(value >= 0.5 for value in signals):
        return f"総じて、直前期・前年・同時期平均との差の複数軸が高温側でそろった{unit}でした。"
    if len(signals) >= 2 and all(value <= -0.5 for value in signals):
        return f"総じて、直前期・前年・同時期平均との差の複数軸が低温側でそろった{unit}でした。"
    if any(value >= 0.8 for value in signals) and any(value <= -0.8 for value in signals):
        return f"総じて、直前期との変化と前年・同時期で見た位置づけが一致せず、比較基準によって見え方の変わる{unit}でした。"
    if variability is not None and variability >= 2.2:
        return f"総じて、平均との差そのものよりも、期間内の日ごとの振れの大きさが特徴的な{unit}でした。"
    if front_change is not None and abs(front_change) >= 2.0:
        direction = "上昇" if front_change > 0 else "下降"
        return f"総じて、期間平均だけでは捉えにくい、前半から後半への明瞭な{direction}が特徴の{unit}でした。"
    return f"総じて、過去平均との差と期間内変化のどちらにも極端な偏りが少ない{unit}でした。"


def _summary_comment(report: Dict[str, Any], context: Dict[str, Any]) -> str:
    sections = report.get("sections", {})
    stats = sections.get("statistics", {})
    period = report.get("period", {})
    label = period.get("label", "この期間")
    daily = context.get("daily_pattern", {})
    seasonal = context.get("same_season_history", {})
    is_weekly = report.get("type") == "weekly"
    previous_label = "前週" if is_weekly else "前月"
    previous_diff = _number(stats.get("prev_week_diff" if is_weekly else "prev_month_diff"))
    baseline_diff = _number(sections.get("baseline", {}).get("current_deviation"))
    rank_sentence = _rank_sentence(report, context)
    seasonal_diff = _number(seasonal.get("deviation_from_peer_average"))
    within_change = _number(daily.get("front_to_back_change"))
    variability = _number(daily.get("daily_avg_stdev"))
    signals = []
    if rank_sentence and seasonal_diff is not None:
        signals.append((abs(seasonal_diff), "seasonal"))
    elif baseline_diff is not None:
        signals.append((abs(baseline_diff), "baseline"))
    if previous_diff is not None:
        signals.append((abs(previous_diff), "previous"))
    if within_change is not None:
        signals.append((abs(within_change), "pattern"))
    if variability is not None:
        signals.append((variability * 0.8, "variability"))
    lead_type = max(signals, default=(0, "pattern"))[1]

    lead_includes_pattern = lead_type == "pattern"
    if lead_type == "seasonal":
        lead = f"{label}は、{rank_sentence}。"
    elif lead_type == "baseline":
        lead = f"{label}で最も目立つのは、過去同時期平均との差{baseline_diff:+.1f}℃という気温水準です。"
    elif lead_type == "previous":
        lead = f"{label}は{previous_label}から平均気温が{previous_diff:+.1f}℃変化し、直近の流れが大きく動いた期間でした。"
    elif lead_type == "variability":
        lead = f"{label}を特徴づけたのは、日平均の標準偏差{variability:.1f}℃という期間内の振れ幅です。"
    else:
        lead = f"{label}は、{_pattern_description(daily)}。"

    values = (
        f"期間平均は{_fmt(stats.get('avg_temp'))}℃、最高{_fmt(stats.get('max_temp'))}℃"
        f"（{_date_label(stats.get('max_temp_date'))}）、最低{_fmt(stats.get('min_temp'))}℃"
        f"（{_date_label(stats.get('min_temp_date'))}）です。"
    )
    movement = "" if lead_includes_pattern else f"日別には{_pattern_description(daily)}。"
    comparisons = []
    if previous_diff is not None:
        comparisons.append(f"{previous_label}比{previous_diff:+.1f}℃")
    year_diff = _number(stats.get("prev_year_diff"))
    if year_diff is not None:
        comparisons.append(f"前年同期比{year_diff:+.1f}℃")
    if baseline_diff is not None:
        comparisons.append(f"過去同時期平均との差{baseline_diff:+.1f}℃")
    compare_text = f"位置づけは{'、'.join(comparisons)}。" if comparisons else "比較可能な過去期間はまだ限られます。"
    event = _event_sentence(daily)
    event_text = f"{event}。" if event else "極端な温度基準を超える日の集中は見られませんでした。"
    synthesis = _synthesis_sentence(report, stats, daily, baseline_diff, seasonal_diff)
    return "".join([lead, values, movement, compare_text, event_text, synthesis])


def _comparison_comment(report: Dict[str, Any], context: Dict[str, Any]) -> str:
    sections = report.get("sections", {})
    stats = sections.get("statistics", {})
    comparison = sections.get("comparison", {})
    baseline = sections.get("baseline", {})
    recent = context.get("recent_history", {})
    is_weekly = report.get("type") == "weekly"
    pieces: List[str] = []

    rank = _rank_sentence(report, context)
    seasonal = context.get("same_season_history", {})
    peer_average = _number(seasonal.get("peer_average"))
    peer_diff = _number(seasonal.get("deviation_from_peer_average"))
    if rank:
        pieces.append(f"{rank}。")
    if peer_average is not None and peer_diff is not None:
        peer_count = int(seasonal.get("other_period_count") or 0)
        pieces.append(f"比較できる他{peer_count}期間の同時期平均{peer_average:.1f}℃に対して{peer_diff:+.1f}℃です。")
        sample_min = _number(seasonal.get("sample_min"))
        sample_max = _number(seasonal.get("sample_max"))
        if sample_min is not None and sample_max is not None and int(seasonal.get("sample_count_including_current") or 0) >= 3:
            current_avg = _number(stats.get("avg_temp"))
            if current_avg is not None and abs(current_avg - sample_min) < 0.05:
                placement = "今回がその下限です"
            elif current_avg is not None and abs(current_avg - sample_max) < 0.05:
                placement = "今回がその上限です"
            elif current_avg is not None:
                placement = f"今回は下限より{current_avg - sample_min:.1f}℃高く、上限より{sample_max - current_avg:.1f}℃低い位置です"
            else:
                placement = "今回の位置は算出できません"
            pieces.append(f"比較対象全体の平均気温は{sample_min:.1f}〜{sample_max:.1f}℃の幅で、{placement}。")
    elif _number(baseline.get("baseline_avg")) is not None:
        pieces.append(
            f"{int(baseline.get('years_count') or 0)}年分の同時期平均{_fmt(baseline.get('baseline_avg'))}℃に対し"
            f"{_fmt(baseline.get('current_deviation'), signed=True)}℃です。"
        )

    previous_year = comparison.get("prev_year_week") or comparison.get("prev_year_month") or {}
    current_avg = _number(stats.get("avg_temp"))
    previous_avg = _number(previous_year.get("avg_temp"))
    if current_avg is not None and previous_avg is not None:
        avg_diff = current_avg - previous_avg
        high_diff = _number(comparison.get("max_temp_diff"))
        low_diff = _number(comparison.get("min_temp_diff"))
        range_diff = _number(comparison.get("avg_daily_range_diff"))
        detail = [f"平均は前年同期より{avg_diff:+.1f}℃"]
        if high_diff is not None:
            detail.append(f"最高値は{high_diff:+.1f}℃")
        if low_diff is not None:
            detail.append(f"最低値は{low_diff:+.1f}℃")
        if range_diff is not None:
            detail.append(f"平均日較差は{range_diff:+.1f}℃")
        pieces.append("、".join(detail) + "。")
        if high_diff is not None and low_diff is not None:
            if abs(low_diff) >= abs(high_diff) + 0.7:
                pieces.append("前年との差は最高値より最低値側で大きく、夜間・朝方の温度水準の違いが平均を押し動かしています。")
            elif abs(high_diff) >= abs(low_diff) + 0.7:
                pieces.append("前年との差は最低値より最高値側で大きく、日中のピーク温度の違いが中心です。")
            else:
                pieces.append("最高値と最低値が同程度に動いており、特定の時間帯だけでなく期間全体の水準差と読めます。")

    if not is_weekly:
        previous_month = sections.get("prev_month", {}).get("prev_month_stats", {})
        previous_month_avg = _number(previous_month.get("avg_temp"))
        previous_month_diff = _number(stats.get("prev_month_diff"))
        if previous_month_avg is not None and previous_month_diff is not None:
            pieces.append(
                f"前月平均{previous_month_avg:.1f}℃からは{previous_month_diff:+.1f}℃で、月内の前半・後半差と合わせても月をまたいだ水準変化が数値に表れています。"
            )

    recent_mean = _number(recent.get("previous_period_mean"))
    recent_diff = _number(recent.get("difference_from_previous_period_mean"))
    recent_count = int(recent.get("previous_period_count") or 0)
    if recent_mean is not None and recent_diff is not None and recent_count:
        recent_unit = "週" if is_weekly else "か月"
        pieces.append(f"さらに直前{recent_count}{recent_unit}の平均{recent_mean:.1f}℃と比べると{recent_diff:+.1f}℃で、単一の前年だけでなく直近推移の中でも{_direction_words(recent_diff)}状態です。")

    return "".join(pieces) or "比較に必要な前年・同時期データが不足しているため、現時点では期間内変動を中心に確認するのが適切です。"


def _trend_comment(report: Dict[str, Any], context: Dict[str, Any]) -> str:
    daily = context.get("daily_pattern", {})
    if not daily:
        return "日別観測が不足しているため、期間内の変化パターンは判定できません。"
    warm = daily.get("warmest_average_day") or {}
    cool = daily.get("coolest_average_day") or {}
    pieces = [f"平均気温の底は{_date_label(cool.get('date'))}の{_fmt(cool.get('value'))}℃、山は{_date_label(warm.get('date'))}の{_fmt(warm.get('value'))}℃でした。"]
    pieces.append(f"{_pattern_description(daily)}。")
    rise = daily.get("largest_rise")
    drop = daily.get("largest_drop")
    changes = []
    if rise and _number(rise.get("change")) is not None and rise["change"] > 0:
        changes.append(f"最大上昇は{_date_label(rise.get('from_date'))}→{_date_label(rise.get('to_date'))}の{rise['change']:+.1f}℃")
    if drop and _number(drop.get("change")) is not None and drop["change"] < 0:
        changes.append(f"最大低下は{_date_label(drop.get('from_date'))}→{_date_label(drop.get('to_date'))}の{drop['change']:+.1f}℃")
    if changes:
        pieces.append("、".join(changes) + "です。")
    stdev = _number(daily.get("daily_avg_stdev"))
    mean_change = _number(daily.get("mean_absolute_day_change"))
    if stdev is not None and mean_change is not None:
        volatility = "安定的" if stdev < 1.0 else "中程度" if stdev < 2.2 else "大きめ"
        pieces.append(f"日平均の標準偏差は{stdev:.1f}℃、前日からの平均変化幅は{mean_change:.1f}℃で、期間内の変動性は{volatility}でした。")
    event = _event_sentence(daily)
    if event:
        pieces.append(f"温度基準で見ると{event}。")
    return "".join(pieces)


def generate_evidence_analysis(
    report: Dict[str, Any],
    source: str = "local",
    generated_at: Optional[str] = None,
    reference_reports: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Generate a non-template narrative from the derived comparison context."""
    completeness = report_completeness(report)
    if reference_reports is not None or not report.get("analysis_context"):
        enrich_analysis_context(report, reference_reports)
    context = report.get("analysis_context", {})
    comments = {
        "summary": _summary_comment(report, context),
        "comparison": _comparison_comment(report, context),
        "trend_analysis": _trend_comment(report, context),
    }
    if not completeness["coverage_complete"] and completeness["period_closed"]:
        comments["summary"] += (
            f"なお観測は{completeness['observed_days']}/{completeness['expected_days']}日分で、欠測を含むため比較値には幅があります。"
        )
    generated_at = generated_at or datetime.now(JST).isoformat()
    return {
        "comments": comments,
        "analysis_meta": {
            "source": source,
            "analysis_available": True,
            "protocol_version": ANALYSIS_PROTOCOL_VERSION,
            "generated_at": generated_at,
            "data_fingerprint": analysis_fingerprint(report),
            **completeness,
        },
    }


def mark_report_as_draft(
    report: Dict[str, Any],
    reference_reports: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Keep draft metrics and charts while explicitly suppressing narrative analysis."""
    enrich_analysis_context(report, reference_reports)
    for key in VALID_ANALYSIS_KEYS:
        report.setdefault("sections", {}).setdefault(key, {})["ai_comment"] = ""
    report["analysis_meta"] = {
        "source": "draft",
        "analysis_available": False,
        "protocol_version": ANALYSIS_PROTOCOL_VERSION,
        "generated_at": datetime.now(JST).isoformat(),
        "data_fingerprint": analysis_fingerprint(report),
        **report_completeness(report),
    }
    return report


def apply_analysis(report: Dict[str, Any], bundle: Dict[str, Any]) -> Dict[str, Any]:
    sections = report.setdefault("sections", {})
    comments = bundle.get("comments", {})
    for key in VALID_ANALYSIS_KEYS:
        sections.setdefault(key, {})["ai_comment"] = str(comments.get(key, "")).strip()
    report["analysis_meta"] = bundle.get("analysis_meta", {})
    return report


def build_gemini_protocol_prompt(report: Dict[str, Any]) -> str:
    """Create one strict, context-rich request for all three narrative sections."""
    if not report.get("analysis_context"):
        enrich_analysis_context(report)
    sections = report.get("sections", {})
    evidence = {
        "type": report.get("type"),
        "period": report.get("period"),
        "completeness": report_completeness(report),
        "statistics": sections.get("statistics"),
        "daily_data": sections.get("daily_data"),
        "previous_year_comparison": sections.get("comparison"),
        "previous_period": sections.get("prev_month"),
        "same_period_baseline": sections.get("baseline"),
        "notable_events": sections.get("events", {}).get("items", []),
        "derived_analysis_context": report.get("analysis_context"),
    }
    fact_draft = {
        "summary": _summary_comment(report, report["analysis_context"]),
        "comparison": _comparison_comment(report, report["analysis_context"]),
        "trend_analysis": _trend_comment(report, report["analysis_context"]),
    }
    return f"""あなたは個人観測の外気温データを検証する気象データアナリストです。
プロトコルバージョン: {ANALYSIS_PROTOCOL_VERSION}
以下は集計済みの観測値と、コードで再計算した比較・順位・変動性です。3つの文章を1回で作成してください。

必須ルール:
1. 入力にない天候、湿度、原因、予報、体感、地域一般の気候を補わない。因果を推測しない。
2. 主要数値を並べ直すだけでなく、「この期間を特徴づける最も強い差」を最初に特定する。
3. summaryでは、この週・月が結局どんな期間だったかを240〜420字で総括する。毎回同じ書き出しを使わない。
4. comparisonでは、前期間、前年同期、複数年の同時期順位・平均、直近数期間のうち利用可能な比較を180〜340字で統合する。どの比較で結論が一致・不一致かも述べる。
5. trend_analysisでは、期間内の底と山、前半・後半、最大日次変化、標準偏差、連続日数から変化の形を180〜340字で説明する。
6. 「対象期間は終了しており」「単年同士の比較なので」などの定型句を繰り返さない。事実チェック案の文面をそのままコピーしない。
7. 数字、符号、順位、対象期間は入力と一致させる。複数年比較が3期間未満なら順位を強調しない。
8. プレーンテキストのみ。Markdown、絵文字、見出し、挨拶、一般的な生活助言は不要。
9. 出力は次の3キーだけを持つJSON:
   {{"summary":"...","comparison":"...","trend_analysis":"..."}}

観測・比較データ:
{json.dumps(evidence, ensure_ascii=False, separators=(',', ':'))}

コードで再計算した事実チェック案（事実確認用。文型は模倣しない）:
{json.dumps(fact_draft, ensure_ascii=False, separators=(',', ':'))}
"""


def parse_gemini_analysis(text: str) -> Dict[str, str]:
    cleaned = str(text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```")
        cleaned = cleaned.removesuffix("```").strip()
    payload = json.loads(cleaned)
    if not isinstance(payload, dict) or set(payload) != set(VALID_ANALYSIS_KEYS):
        raise ValueError("Gemini response must contain exactly the three analysis keys")
    result = {}
    for key in VALID_ANALYSIS_KEYS:
        value = payload.get(key)
        if not isinstance(value, str) or len(value.strip()) < 60:
            raise ValueError(f"Gemini response is missing a sufficiently detailed {key}")
        result[key] = value.strip()
    return result
