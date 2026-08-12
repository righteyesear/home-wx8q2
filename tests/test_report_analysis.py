import json
import sys
import types
from datetime import date
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from report_analysis import (  # noqa: E402
    ANALYSIS_PROTOCOL_VERSION,
    build_gemini_protocol_prompt,
    generate_evidence_analysis,
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
            "comparison": {"current_avg": 8.5, "previous_year_avg": 8.9},
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
assert "2/29日分" in bundle["comments"]["summary"]
assert "前月比+0.7℃" in bundle["comments"]["summary"]
assert "暫定" in bundle["comments"]["trend_analysis"]

prompt = build_gemini_protocol_prompt(report)
assert ANALYSIS_PROTOCOL_VERSION in prompt
assert "推測・補完しない" in prompt
assert '"summary"' in prompt and '"comparison"' in prompt and '"trend_analysis"' in prompt

index = json.loads((PROJECT_ROOT / "reports" / "index.json").read_text(encoding="utf-8"))
assert all(entry.get("is_final") is True for kind in ("weekly", "monthly") for entry in index[kind])

report_paths = sorted((PROJECT_ROOT / "reports" / "weekly").glob("*.json"))
report_paths += sorted((PROJECT_ROOT / "reports" / "monthly").glob("*.json"))
assert report_paths
for report_path in report_paths:
    stored = json.loads(report_path.read_text(encoding="utf-8"))
    meta = stored.get("analysis_meta", {})
    assert meta.get("data_fingerprint"), f"missing fingerprint: {report_path.name}"
    assert meta.get("source") in {"codex", "gemini", "local"}, report_path.name
    for key in ("summary", "comparison", "trend_analysis"):
        comment = stored.get("sections", {}).get(key, {}).get("ai_comment", "").strip()
        assert comment, f"missing {key}: {report_path.name}"

assert not (PROJECT_ROOT / "reports" / "monthly" / "2026-08.json").exists()
assert report_generator.is_period_closed("monthly", "2026-07", date(2026, 8, 1))
assert not report_generator.is_period_closed("monthly", "2026-08", date(2026, 8, 1))
assert report_generator.is_period_closed("weekly", "2026-W30", date(2026, 8, 3))
assert not report_generator.is_period_closed("weekly", "2026-W32", date(2026, 8, 3))

print(f"report analysis tests passed ({len(report_paths)} reports validated)")
