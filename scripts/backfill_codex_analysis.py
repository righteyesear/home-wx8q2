#!/usr/bin/env python3
"""Backfill/revalidate report comments with deterministic Codex-reviewed logic."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from report_analysis import JST, VALID_ANALYSIS_KEYS, apply_analysis, generate_evidence_analysis


PROJECT_ROOT = Path(__file__).parent.parent
REPORTS_ROOT = PROJECT_ROOT / "reports"


def backfill(replace_all: bool = False) -> int:
    generated_at = datetime.now(JST).isoformat()
    updated = 0
    skipped_open = 0
    for report_type in ("weekly", "monthly"):
        for path in sorted((REPORTS_ROOT / report_type).glob("*.json")):
            report = json.loads(path.read_text(encoding="utf-8"))
            existing_meta = report.get("analysis_meta", {})
            if not replace_all and existing_meta.get("source") == "codex":
                continue

            bundle = generate_evidence_analysis(
                report,
                source="codex",
                generated_at=generated_at,
            )
            if not bundle["analysis_meta"]["period_closed"]:
                skipped_open += 1
                continue

            bundle["analysis_meta"]["reason"] = "legacy_report_revalidation"
            apply_analysis(report, bundle)
            # 旧形式で未使用だった空のai_commentは、未生成表示の原因になるため削除する。
            for section_name, section in report.get("sections", {}).items():
                if section_name not in VALID_ANALYSIS_KEYS and isinstance(section, dict):
                    if not str(section.get("ai_comment") or "").strip():
                        section.pop("ai_comment", None)
            path.write_text(
                json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            updated += 1

    print(f"Codex分析を更新: {updated}件（未終了期間のスキップ: {skipped_open}件）")
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="過去レポートのCodex分析を補完")
    parser.add_argument(
        "--all",
        action="store_true",
        help="既存コメントも含めて、旧プロトコルのレポートを再検証する",
    )
    args = parser.parse_args()
    backfill(replace_all=args.all)


if __name__ == "__main__":
    main()
