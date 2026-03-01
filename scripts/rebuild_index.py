"""reports/index.json を全ファイルから再構築するスクリプト"""
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))
reports_dir = Path("reports")
index = {"weekly": [], "monthly": []}

for f in sorted((reports_dir / "weekly").glob("*.json"), reverse=True):
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        p = data.get("period", {})
        index["weekly"].append({
            "period": f.stem,
            "label": p.get("label", f.stem),
            "file": f"weekly/{f.name}"
        })
    except Exception as e:
        print(f"  [SKIP] {f.name}: {e}")

for f in sorted((reports_dir / "monthly").glob("*.json"), reverse=True):
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        p = data.get("period", {})
        index["monthly"].append({
            "period": f.stem,
            "label": p.get("label", f.stem),
            "file": f"monthly/{f.name}"
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
