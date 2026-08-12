import json
import sys
import types
from datetime import date
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from report_analysis import (  # noqa: E402
    ANALYSIS_PROTOCOL_VERSION,
    build_analysis_context,
    build_gemini_protocol_prompt,
    generate_evidence_analysis,
    mark_report_as_draft,
    report_completeness,
)

requests_stub = types.ModuleType("requests")
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_args, **_kwargs: None
google_stub = types.ModuleType("google")
genai_stub = types.ModuleType("google.genai")
google_stub.genai = genai_stub
sys.modules.setdefault("requests", requests_stub)
sys.modules.setdefault("dotenv", dotenv_stub)
sys.modules.setdefault("google", google_stub)
sys.modules.setdefault("google.genai", genai_stub)

import report_generator  # noqa: E402


def sample_report():
    return {
        "type": "monthly",
        "period": {
            "year": 2020,
            "month": 2,
            "start_date": "2020-02-01",
            "end_date": "2020-02-29",
            "label": "2020年2月",
        },
        "sections": {
            "statistics": {
                "avg_temp": 8.5,
                "max_temp": 16.0,
                "min_temp": 1.0,
                "prev_month_diff": 0.7,
                "prev_year_diff": -0.4,
            },
            "daily_data": [
                {"date": "2020-02-01", "avg": 8.0},
                {"date": "2020-02-02", "avg": 9.0},
            ],
            "comparison": {
                "prev_year_month": {"avg_temp": 8.9},
                "avg_temp_diff": -0.4,
                "max_temp_diff": 1.0,
                "min_temp_diff": -0.8,
            },
            "prev_month": {"prev_month_stats": {"avg_temp": 7.8}},
            "baseline": {"current_deviation": -0.2},
        },
    }


report = sample_report()
completeness = report_completeness(report)
assert completeness["expected_days"] == 29
assert completeness["observed_days"] == 2
assert completeness["period_closed"] is True
assert completeness["coverage_complete"] is False

bundle = generate_evidence_analysis(report, source="codex-test")
assert bundle["analysis_meta"]["protocol_version"] == ANALYSIS_PROTOCOL_VERSION
assert bundle["analysis_meta"]["source"] == "codex-test"
assert all(bundle["comments"].get(key) for key in ("summary", "comparison", "trend_analysis"))
assert "観測は2/29日分" in bundle["comments"]["summary"]
assert "前月比+0.7℃" in bundle["comments"]["summary"]
assert "標準偏差" in bundle["comments"]["trend_analysis"]

context = build_analysis_context(report)
assert context["daily_pattern"]["front_to_back_change"] == 1.0
assert "daily_avg_stdev" in context["daily_pattern"]

iso_week_report = {
    "type": "weekly",
    "period": {"year": 2026, "week": 1, "start_date": "2025-12-29", "end_date": "2026-01-04"},
    "sections": {"statistics": {"avg_temp": 6.0}, "daily_data": []},
}
iso_week_reference = {
    "type": "weekly",
    "period": {"year": 2025, "week": 1, "start_date": "2024-12-30", "end_date": "2025-01-05"},
    "sections": {"statistics": {"avg_temp": 5.0}, "daily_data": []},
}
iso_context = build_analysis_context(iso_week_report, [iso_week_reference])
assert iso_context["same_season_history"]["years"] == [2025, 2026]

draft = sample_report()
mark_report_as_draft(draft)
assert draft["analysis_meta"]["analysis_available"] is False
assert all(not draft["sections"][key]["ai_comment"] for key in ("summary", "comparison", "trend_analysis"))

prompt = build_gemini_protocol_prompt(report)
assert ANALYSIS_PROTOCOL_VERSION in prompt
assert "因果を推測しない" in prompt
assert "derived_analysis_context" in prompt
assert '"summary"' in prompt and '"comparison"' in prompt and '"trend_analysis"' in prompt

index = json.loads((PROJECT_ROOT / "reports" / "index.json").read_text(encoding="utf-8"))
assert all(entry.get("is_final") is True for entry in index["monthly"])
weekly_drafts = [entry for entry in index["weekly"] if entry.get("is_final") is False]
assert len(weekly_drafts) == 1
assert weekly_drafts[0].get("analysis_available") is False

report_paths = sorted((PROJECT_ROOT / "reports" / "weekly").glob("*.json"))
report_paths += sorted((PROJECT_ROOT / "reports" / "monthly").glob("*.json"))
assert report_paths
for report_path in report_paths:
    stored = json.loads(report_path.read_text(encoding="utf-8"))
    meta = stored.get("analysis_meta", {})
    assert meta.get("data_fingerprint"), f"missing fingerprint: {report_path.name}"
    assert stored.get("analysis_context", {}).get("context_version") == ANALYSIS_PROTOCOL_VERSION, report_path.name
    assert meta.get("source") in {"codex", "gemini", "local", "draft"}, report_path.name
    if meta.get("source") == "draft":
        assert meta.get("analysis_available") is False
        assert all(not stored.get("sections", {}).get(key, {}).get("ai_comment", "").strip()
                   for key in ("summary", "comparison", "trend_analysis"))
    else:
        for key in ("summary", "comparison", "trend_analysis"):
            comment = stored.get("sections", {}).get(key, {}).get("ai_comment", "").strip()
            assert len(comment) >= 75, f"shallow {key}: {report_path.name}"
            assert "対象期間は終了しており" not in comment, f"legacy template: {report_path.name}"

assert not (PROJECT_ROOT / "reports" / "monthly" / "2026-08.json").exists()
assert report_generator.is_period_closed("monthly", "2026-07", date(2026, 8, 1))
assert not report_generator.is_period_closed("monthly", "2026-08", date(2026, 8, 1))
assert report_generator.is_period_closed("weekly", "2026-W30", date(2026, 8, 3))
assert not report_generator.is_period_closed("weekly", "2026-W32", date(2026, 8, 3))

print(f"report analysis tests passed ({len(report_paths)} reports validated)")
