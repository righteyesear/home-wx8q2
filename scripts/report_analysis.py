#!/usr/bin/env python3
"""Evidence-first analysis helpers for weekly and monthly weather reports.

The local analyser is deterministic: it only describes values already present in a
report JSON.  It is used for Codex backfills and as a safe fallback when Gemini is
unavailable or the API budget has been exhausted.
"""

from __future__ import annotations

import hashlib
import json
import statistics
from datetime import date, datetime, timezone, timedelta
from typing import Any, Dict, Iterable, List, Optional


JST = timezone(timedelta(hours=9))
ANALYSIS_PROTOCOL_VERSION = "2.0"
VALID_ANALYSIS_KEYS = ("summary", "comparison", "trend_analysis")


def _number(value: Any) -> Optional[float]:
    return float(value) if isinstance(value, (int, float)) else None


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
    }
    raw = json.dumps(basis, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def _mean(values: Iterable[Any]) -> Optional[float]:
    numeric = [_number(value) for value in values]
    clean = [value for value in numeric if value is not None]
    return statistics.mean(clean) if clean else None


def _trend_facts(daily: List[Dict[str, Any]]) -> Dict[str, Any]:
    points = []
    for row in daily:
        value = _number(row.get("avg"))
        if value is not None:
            points.append((row.get("date", ""), value))

    if not points:
        return {}

    segment = min(3, max(1, len(points) // 2))
    opening = _mean(value for _, value in points[:segment])
    closing = _mean(value for _, value in points[-segment:])
    net = (closing - opening) if opening is not None and closing is not None else None

    rises = []
    drops = []
    for index in range(1, len(points)):
        change = points[index][1] - points[index - 1][1]
        item = {
            "change": change,
            "from_date": points[index - 1][0],
            "to_date": points[index][0],
        }
        rises.append(item)
        drops.append(item)

    return {
        "opening_avg": opening,
        "closing_avg": closing,
        "net_change": net,
        "largest_rise": max(rises, key=lambda item: item["change"]) if rises else None,
        "largest_drop": min(drops, key=lambda item: item["change"]) if drops else None,
    }


def _movement_phrase(net_change: Optional[float]) -> str:
    if net_change is None:
        return "期間内の方向性は判定できません"
    if net_change >= 2.0:
        return f"前半から後半にかけて平均気温が約{net_change:.1f}℃上がり、明確な昇温傾向でした"
    if net_change <= -2.0:
        return f"前半から後半にかけて平均気温が約{abs(net_change):.1f}℃下がり、明確な降温傾向でした"
    return f"前半と後半の平均気温差は{abs(net_change):.1f}℃に収まり、期間全体では大きな一方向変化はありませんでした"


def _practical_note(stats: Dict[str, Any]) -> str:
    max_temp = _number(stats.get("max_temp"))
    min_temp = _number(stats.get("min_temp"))
    daily_range = _number(stats.get("avg_daily_range"))
    if max_temp is not None and max_temp >= 35:
        return "最高気温が35℃以上の日を含むため、日中の外出は時間を選び、冷房・水分・休憩を前提にしてください。"
    if max_temp is not None and max_temp >= 30:
        return "30℃以上の暑さを含むため、屋外活動では水分補給と休憩を早めに取るのが安全です。"
    if min_temp is not None and min_temp < 0:
        return "氷点下を記録しているため、朝晩の路面凍結と室内外の温度差に注意が必要です。"
    if min_temp is not None and min_temp < 8:
        return "朝晩は一桁まで冷えているため、外出時間に合わせて調整できる上着が役立ちます。"
    if daily_range is not None and daily_range >= 10:
        return "日較差が大きいため、昼の体感だけで服装を決めず、朝晩用の羽織りを用意すると安心です。"
    return "極端な温度域ではありませんが、日ごとの変化に合わせて服装と室温を調整してください。"


def _coverage_sentence(completeness: Dict[str, Any]) -> str:
    observed = completeness["observed_days"]
    expected = completeness["expected_days"]
    if completeness["period_closed"] and completeness["coverage_complete"]:
        return f"対象期間は終了しており、{observed}日分の観測で集計しています。"
    if completeness["period_closed"]:
        return f"対象期間は終了していますが、観測は{observed}/{expected}日分のため欠測を含む集計です。"
    return f"対象期間は未終了で、現在は{observed}/{expected}日分の暫定集計です。"


def _comparison_comment(sections: Dict[str, Any], stats: Dict[str, Any]) -> str:
    comparison = sections.get("comparison", {})
    previous = comparison.get("prev_year_week") or comparison.get("prev_year_month") or {}
    current_avg = _number(stats.get("avg_temp"))
    previous_avg = _number(previous.get("avg_temp"))
    if current_avg is None or previous_avg is None:
        baseline = sections.get("baseline", {})
        baseline_avg = _number(baseline.get("baseline_avg"))
        deviation = _number(baseline.get("current_deviation"))
        if baseline_avg is not None and deviation is not None:
            return (
                "前年同期の十分な観測がないため、直接比較は行えません。"
                f"参考として過去同時期の平均{baseline_avg:.1f}℃に対し、今回は{deviation:+.1f}℃でした。"
                "観測年数が増えるまでは、長期傾向ではなく参考差として解釈してください。"
            )
        return "前年同期の観測が不足しているため、信頼できる前年比較はまだできません。"

    avg_diff = current_avg - previous_avg
    high_diff = _number(comparison.get("max_temp_diff"))
    low_diff = _number(comparison.get("min_temp_diff"))
    range_diff = _number(comparison.get("avg_daily_range_diff"))
    temperature_read = "高め" if avg_diff >= 0.5 else "低め" if avg_diff <= -0.5 else "ほぼ同水準"
    details = []
    if high_diff is not None:
        details.append(f"最高気温差{high_diff:+.1f}℃")
    if low_diff is not None:
        details.append(f"最低気温差{low_diff:+.1f}℃")
    if range_diff is not None:
        details.append(f"日較差の差{range_diff:+.1f}℃")
    detail_text = "、".join(details)
    return (
        f"平均気温は{current_avg:.1f}℃で、前年同期の{previous_avg:.1f}℃より{avg_diff:+.1f}℃、{temperature_read}でした。"
        + (f"内訳は{detail_text}です。" if detail_text else "")
        + "単年同士の比較なので、季節の長期傾向ではなく、この期間固有の差として見るのが適切です。"
    )


def generate_evidence_analysis(
    report: Dict[str, Any],
    source: str = "local",
    generated_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate three evidence-backed comments from one report payload."""
    sections = report.get("sections", {})
    stats = sections.get("statistics", {})
    daily = sections.get("daily_data", [])
    period_label = report.get("period", {}).get("label", "対象期間")
    completeness = report_completeness(report)
    trend = _trend_facts(daily)

    avg_temp = _number(stats.get("avg_temp"))
    max_temp = _number(stats.get("max_temp"))
    min_temp = _number(stats.get("min_temp"))
    is_weekly = report.get("type") == "weekly"
    previous_diff = _number(stats.get("prev_week_diff" if is_weekly else "prev_month_diff"))
    previous_label = "前週" if is_weekly else "前月"
    baseline = sections.get("baseline", {})
    baseline_deviation = _number(baseline.get("current_deviation"))

    stats_sentence = (
        f"{period_label}の平均気温は{_fmt(avg_temp)}℃、最高{_fmt(max_temp)}℃、最低{_fmt(min_temp)}℃でした。"
    )
    comparisons = []
    if previous_diff is not None:
        comparisons.append(f"{previous_label}比{previous_diff:+.1f}℃")
    if _number(stats.get("prev_year_diff")) is not None:
        comparisons.append(f"前年比{_number(stats.get('prev_year_diff')):+.1f}℃")
    if baseline_deviation is not None:
        comparisons.append(f"過去同時期平均との差{baseline_deviation:+.1f}℃")
    comparison_sentence = "、".join(comparisons) + "です。" if comparisons else "比較可能な過去データは限定的です。"

    summary = "".join([
        _coverage_sentence(completeness),
        stats_sentence,
        _movement_phrase(trend.get("net_change")) + "。",
        comparison_sentence,
        _practical_note(stats),
    ])

    trend_parts = [_movement_phrase(trend.get("net_change")) + "。"]
    largest_rise = trend.get("largest_rise")
    largest_drop = trend.get("largest_drop")
    if largest_rise and largest_rise["change"] > 0:
        trend_parts.append(
            f"最大の上昇は{largest_rise['from_date']}から{largest_rise['to_date']}の{largest_rise['change']:+.1f}℃でした。"
        )
    if largest_drop and largest_drop["change"] < 0:
        trend_parts.append(
            f"最大の低下は{largest_drop['from_date']}から{largest_drop['to_date']}の{largest_drop['change']:+.1f}℃でした。"
        )
    if not completeness["coverage_complete"]:
        trend_parts.append("欠測または未到来の日を含むため、傾向の強さは暫定的に解釈してください。")

    generated_at = generated_at or datetime.now(JST).isoformat()
    return {
        "comments": {
            "summary": summary,
            "comparison": _comparison_comment(sections, stats),
            "trend_analysis": "".join(trend_parts),
        },
        "analysis_meta": {
            "source": source,
            "protocol_version": ANALYSIS_PROTOCOL_VERSION,
            "generated_at": generated_at,
            "data_fingerprint": analysis_fingerprint(report),
            **completeness,
        },
    }


def apply_analysis(report: Dict[str, Any], bundle: Dict[str, Any]) -> Dict[str, Any]:
    sections = report.setdefault("sections", {})
    comments = bundle.get("comments", {})
    for key in VALID_ANALYSIS_KEYS:
        sections.setdefault(key, {})["ai_comment"] = str(comments.get(key, "")).strip()
    report["analysis_meta"] = bundle.get("analysis_meta", {})
    return report


def build_gemini_protocol_prompt(report: Dict[str, Any]) -> str:
    """Create a compact, strict one-call protocol for all report comments."""
    sections = report.get("sections", {})
    evidence = {
        "type": report.get("type"),
        "period": report.get("period"),
        "completeness": report_completeness(report),
        "statistics": sections.get("statistics"),
        "daily_data": sections.get("daily_data"),
        "comparison": sections.get("comparison"),
        "baseline": sections.get("baseline"),
        "events": sections.get("events", {}).get("items", []),
    }
    return f"""あなたは個人用の外気温観測レポートを監査する気象データアナリストです。
プロトコルバージョン: {ANALYSIS_PROTOCOL_VERSION}
次の観測済みデータだけを根拠に、3種類のコメントを一度に作成してください。

品質プロトコル:
1. 数値・日付・比較対象は入力値と照合し、入力にない天候、原因、予報、体感、湿度を推測・補完しない。
2. 対象期間が未終了、または観測日数が不足している場合は、summaryの冒頭で暫定値または欠測を明記する。
3. 因果関係を断定しない。前年比は単年比較、過去平均は入力のyears_count年分であることを踏まえる。
4. summaryは180〜320字で、期間の状態、主要値、前期間・前年・過去平均との差、実用上の注意を簡潔に述べる。
5. comparisonは120〜240字で、平均・最高・最低・日較差のうち比較可能な項目を扱う。比較不能なら理由を明記する。
6. trend_analysisは120〜240字で、前半と後半、最大の日次変化、安定性を述べる。
7. プレーンテキストのみ。Markdown、絵文字、見出し、挨拶、詩的表現、不要な煽りを使わない。
8. 出力は次の3キーだけを持つ厳密なJSONオブジェクトにする:
   {{"summary":"...","comparison":"...","trend_analysis":"..."}}

観測データ:
{json.dumps(evidence, ensure_ascii=False, separators=(',', ':'))}
"""


def parse_gemini_analysis(text: str) -> Dict[str, str]:
    cleaned = str(text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```")
        cleaned = cleaned.removesuffix("```").strip()
    payload = json.loads(cleaned)
    if not isinstance(payload, dict):
        raise ValueError("Gemini response is not a JSON object")
    result = {}
    for key in VALID_ANALYSIS_KEYS:
        value = payload.get(key)
        if not isinstance(value, str) or len(value.strip()) < 20:
            raise ValueError(f"Gemini response is missing a valid {key}")
        result[key] = value.strip()
    return result
