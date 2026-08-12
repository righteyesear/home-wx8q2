"""reports/index.json を全ファイルから再構築するスクリプト"""
import json
from pathlib import Path
from datetime import datetime

from report_analysis import JST, report_completeness

reports_dir = Path("reports")
index = {"weekly": [], "monthly": []}

for f in sorted((reports_dir / "weekly").glob("*.json"), reverse=True):
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        p = data.get("period", {})
        completeness = report_completeness(data)
        if not completeness["period_closed"]:
            today = datetime.now(JST).date()
            try:
                start = datetime.fromisoformat(p.get("start_date", "")).date()
                end = datetime.fromisoformat(p.get("end_date", "")).date()
            except ValueError:
                print(f"  [SKIP] {f.name}: 暫定期間の日付を解釈できません")
                continue
            if not (start <= today <= end):
                print(f"  [SKIP] {f.name}: 現在の週ではない未終了レポート")
                continue
        meta = data.get("analysis_meta", {})
        index["weekly"].append({
            "period": f.stem,
            "label": p.get("label", f.stem),
            "file": f"weekly/{f.name}",
            "is_final": completeness["period_closed"],
            "analysis_available": bool(meta.get("analysis_available", completeness["period_closed"])),
            "status": "final" if completeness["period_closed"] else "draft",
            "coverage_complete": completeness["coverage_complete"],
            "observed_days": completeness["observed_days"],
            "expected_days": completeness["expected_days"],
        })
        if not completeness["period_closed"]:
            print(f"  [DRAFT] {f.name}: グラフ・暫定統計のみ公開")
    except Exception as e:
        print(f"  [SKIP] {f.name}: {e}")

for f in sorted((reports_dir / "monthly").glob("*.json"), reverse=True):
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        p = data.get("period", {})
        completeness = report_completeness(data)
        if not completeness["period_closed"]:
            print(f"  [DRAFT] {f.name}: 未終了期間のため公開一覧から除外")
            continue
        index["monthly"].append({
            "period": f.stem,
            "label": p.get("label", f.stem),
            "file": f"monthly/{f.name}",
            "is_final": True,
            "analysis_available": bool(data.get("analysis_meta", {}).get("analysis_available", True)),
            "status": "final",
            "coverage_complete": completeness["coverage_complete"],
            "observed_days": completeness["observed_days"],
            "expected_days": completeness["expected_days"],
        })
    except Exception as e:
        print(f"  [SKIP] {f.name}: {e}")

index["updated_at"] = datetime.now(JST).isoformat()
out = json.dumps(index, ensure_ascii=False, indent=2)
(reports_dir / "index.json").write_text(out, encoding="utf-8")

print(f"index.json 更新: weekly={len(index['weekly'])}件, monthly={len(index['monthly'])}件")
for item in index["weekly"]:
    print(f"  W: {item['label']}")
for item in index["monthly"]:
    print(f"  M: {item['label']}")
