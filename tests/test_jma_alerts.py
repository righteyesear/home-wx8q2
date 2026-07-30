import importlib.util
import json
import sys
import types
from pathlib import Path


STAGE_ROOT = Path(__file__).resolve().parents[1]
PROJECT_SCRIPTS = STAGE_ROOT / "scripts"
FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "jma" / "derived"
RAW_FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "jma" / "raw"

# 正規化関数の単体テストではネットワーク・Gemini依存を使用しない。
requests_stub = types.ModuleType("requests")
dotenv_stub = types.ModuleType("dotenv")
dotenv_stub.load_dotenv = lambda *_args, **_kwargs: None
google_stub = types.ModuleType("google")
genai_stub = types.ModuleType("google.genai")
google_stub.genai = genai_stub
data_analysis_stub = types.ModuleType("data_analysis")
data_analysis_stub.analyze_data_comprehensive = lambda *_args, **_kwargs: {}
sys.modules.update(
    {
        "requests": requests_stub,
        "dotenv": dotenv_stub,
        "google": google_stub,
        "google.genai": genai_stub,
        "data_analysis": data_analysis_stub,
    }
)

sys.path.insert(0, str(PROJECT_SCRIPTS))
spec = importlib.util.spec_from_file_location(
    "staged_ai_advisor", STAGE_ROOT / "scripts" / "ai_advisor.py"
)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def load_json(name):
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


cases = [
    ("no-warning-katsushika.json", 0, None),
    ("advisory-katsushika.json", 2, "レベル2 大雨注意報"),
    ("level3-katsushika.json", 3, "レベル3 大雨警報"),
    ("level4-katsushika.json", 4, "レベル4 大雨危険警報"),
    ("level5-katsushika.json", 5, "レベル5 大雨特別警報"),
    ("continuing-katsushika.json", 3, "レベル3 大雨警報"),
    ("downgraded-katsushika.json", 2, "レベル2 大雨注意報"),
    ("released-katsushika.json", 0, None),
]

for filename, level, name in cases:
    result = module.normalize_jma_alerts(load_json(filename), "1312200")
    expected_count = 0 if level == 0 else 1
    assert len(result["alerts"]) == expected_count, filename
    if level:
        assert result["alerts"][0]["level"] == level, filename
        assert result["alerts"][0]["name"] == name, filename

raw_level2 = module.normalize_jma_alerts(
    json.loads(
        (RAW_FIXTURE_ROOT / "archive-r8-130000-2026060218-level2.json").read_text(
            encoding="utf-8"
        )
    ),
    "1312200",
)
assert any(
    alert["id"] == "VPWW55:10" and alert["status"] == "発表"
    for alert in raw_level2["alerts"]
)

raw_level3 = module.normalize_jma_alerts(
    json.loads(
        (
            RAW_FIXTURE_ROOT
            / "archive-r8-130000-2026060303-level3-level4-continuing.json"
        ).read_text(encoding="utf-8")
    ),
    "1312200",
)
assert any(
    alert["id"] == "VPWW55:03" and alert["status"] == "継続"
    for alert in raw_level3["alerts"]
)

raw_downgrade = module.normalize_jma_alerts(
    json.loads(
        (RAW_FIXTURE_ROOT / "archive-r8-130000-2026060306-downgrade.json").read_text(
            encoding="utf-8"
        )
    ),
    "1312200",
)
assert any(
    alert["id"] == "VPWW55:10" and alert["status"] == "警報から注意報"
    for alert in raw_downgrade["alerts"]
)

try:
    module.normalize_jma_alerts({"areaTypes": []}, "1312200")
except ValueError as error:
    assert "Unexpected JMA warning response schema" in str(error)
else:
    raise AssertionError("legacy schema must be rejected")

print(f"Python JMA tests passed: {len(cases)} cases + raw fixtures")
