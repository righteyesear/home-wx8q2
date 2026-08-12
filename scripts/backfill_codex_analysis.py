#!/usr/bin/env python3
"""Backfill/revalidate report comments with deterministic Codex-reviewed logic."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from report_analysis import (
    ANALYSIS_PROTOCOL_VERSION,
    JST,
    VALID_ANALYSIS_KEYS,
    analysis_fingerprint,
    apply_analysis,
    enrich_analysis_context,
    generate_evidence_analysis,
    load_reference_reports,
    mark_report_as_draft,
)


PROJECT_ROOT = Path(__file__).parent.parent
REPORTS_ROOT = PROJECT_ROOT / "reports"


def backfill(replace_all: bool = False) -> int:
    generated_at = datetime.now(JST).isoformat()
    updated = 0
    drafts = 0
    reference_reports = load_reference_reports(REPORTS_ROOT)
    for report_type in ("weekly", "monthly"):
        for path in sorted((REPORTS_ROOT / report_type).glob("*.json")):
            report = json.loads(path.read_text(encoding="utf-8"))
            existing_meta = report.get("analysis_meta", {})
            if (
                not replace_all
                and existing_meta.get("source") == "codex"
                and existing_meta.get("protocol_version") == ANALYSIS_PROTOCOL_VERSION
            ):
                enrich_analysis_context(report, reference_reports)
                if existing_meta.get("data_fingerprint") == analysis_fingerprint(report):
                    continue

            bundle = generate_evidence_analysis(
                report,
                source="codex",
                generated_at=generated_at,
                reference_reports=reference_reports,
            )
            if not bundle["analysis_meta"]["period_closed"]:
                if report_type == "weekly":
                    mark_report_as_draft(report, reference_reports)
                    path.write_text(
                        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
                    drafts += 1
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

    print(f"履歴分析を更新: {updated}件（進行中週の暫定表示: {drafts}件）")
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
