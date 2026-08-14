import importlib.util
import json
import sys
import tempfile
import types
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "scripts" / "ai_advisor.py"

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

sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("advisor_under_test", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class FakeResponse:
    text = (
        "現在は風が穏やかで、体感温度も過ごしやすい範囲です。\n\n"
        "今後6時間も大きな天気の崩れは見込みにくいでしょう。\n\n"
        "外出時は薄手の羽織で調整するとよさそうです。"
    )


class FakeModels:
    def __init__(self, fail_primary=False):
        self.calls = []
        self.fail_primary = fail_primary

    def generate_content(self, *, model, contents):
        self.calls.append((model, contents))
        if self.fail_primary and model == "gemini-3.7-flash":
            raise RuntimeError("primary unavailable")
        return FakeResponse()


def run_with(fake_models, alerts=None):
    module.genai.Client = lambda **_kwargs: types.SimpleNamespace(models=fake_models)
    module.GEMINI_API_KEY = "test-key"
    module.GEMINI_MODEL = "gemini-3.7-flash"
    module.load_moon_data = lambda: {"age": 1, "phase": "新月"}

    spreadsheet = {
        "current": {
            "temperature": 24.0,
            "humidity": 55,
            "today_high": 25.0,
            "today_low": 20.0,
        },
        "analysis": {
            "trends": {"change_rate_1h": 0.2},
            "patterns": {"vs_yesterday": -1.0},
        },
    }
    weather = {
        "current": {
            "weather_code": 1,
            "temperature": 24.5,
            "humidity": 54,
            "wind_speed": 2.0,
            "wind_direction": 90,
        },
        "hourly_forecast": [],
        "daily": {},
        "yahoo_precip": {},
    }
    alerts = alerts or {"alerts": [], "transitions": []}
    return module.analyze_with_gemini(spreadsheet, weather, alerts)


primary = FakeModels()
result = run_with(primary)
assert primary.calls[0][0] == "gemini-3.7-flash"
assert "気象データ:" in primary.calls[0][1]
assert "直前と同じ書き出し" in primary.calls[0][1]
assert "Steadman参考値" in primary.calls[0][1]
assert "estimated_sensor_height_wind_ms" in primary.calls[0][1]
assert "次回更新" not in primary.calls[0][1]
assert "次回更新" not in result
assert len(result) < 620
assert result.count("\n\n") == 2
assert "各段落の間には必ず空行" in primary.calls[0][1]
assert "気象予報士の短い解説" in primary.calls[0][1]
assert '"advisor_signals":' in primary.calls[0][1]
assert '"sensor_vs_grid_temperature_c":-0.5' in primary.calls[0][1]
assert "まずadvisor_signalsを確認" in primary.calls[0][1]
assert "直近1・3時間、昨日同時刻、同時間帯平均、今後6時間" in primary.calls[0][1]
assert "単なる予報の言い換えではなく" in primary.calls[0][1]

lightning_models = FakeModels()
run_with(
    lightning_models,
    {
        "alerts": [
            {
                "id": "VPWW61:14",
                "data_type_code": "VPWW61",
                "code": "14",
                "name": "雷注意報",
                "level": 2,
            },
            {
                "id": "VPWW55:43",
                "data_type_code": "VPWW55",
                "code": "43",
                "name": "レベル4 大雨危険警報",
                "level": 4,
            },
        ],
        "advisories": [
            {
                "data_type_code": "VPWW61",
                "code": "14",
                "name": "雷注意報",
            }
        ],
        "transitions": [
            {
                "data_type_code": "VPWW61",
                "code": "14",
                "status": "解除",
            }
        ],
    },
)
lightning_prompt = lightning_models.calls[0][1]
assert '"name":"雷注意報"' in lightning_prompt
assert '"id":"VPWW61:14"' in lightning_prompt
assert '"name":"レベル4 大雨危険警報"' in lightning_prompt
assert "雷注意報は判断材料に含め" in lightning_prompt

failed = FakeModels(fail_primary=True)
failed_result = run_with(failed)
assert [call[0] for call in failed.calls] == ["gemini-3.7-flash"]
assert failed_result.startswith("⚠️ 分析エラー (gemini-3.7-flash):")

no_data_models = FakeModels()
module.genai.Client = lambda **_kwargs: types.SimpleNamespace(models=no_data_models)
no_data_result = module.analyze_with_gemini(
    {"current": {}},
    {"current": {}, "yahoo_precip": {}},
    {"alerts": [], "transitions": []},
)
assert no_data_models.calls == []
assert "AI分析を実行しませんでした" in no_data_result

assert module._select_editorial_focus(
    module.datetime.now(module.JST),
    25,
    25,
    {"yahoo_precip": {"is_raining": True}},
    {"alerts": []},
    {},
).startswith("雨の現在地")

assert module._select_editorial_focus(
    module.datetime.now(module.JST),
    25,
    25,
    {},
    {"alerts": [{"level": 4}]},
    {},
).startswith("防災情報")

assert not module._select_editorial_focus(
    module.datetime.now(module.JST),
    25,
    25,
    {},
    {"alerts": [{"level": 2, "name": "雷注意報"}]},
    {},
).startswith("防災情報")

assert "直近1時間の気温上昇" in module._select_editorial_focus(
    module.datetime.now(module.JST),
    25,
    25,
    {"current": {"temperature": 25}},
    {"alerts": []},
    {"trends": {"change_rate_1h": 1.5}},
)

signals = module._build_advisor_signals(
    {
        "today_high": 29,
        "today_low": 22,
        "yesterday_high": 27,
        "yesterday_low": 20,
    },
    28,
    75,
    32,
    True,
    {"temperature": 26, "humidity": 65},
    {
        "hourly_forecast": [
            {"time": "13:00", "temperature": 27, "precip_prob": 20, "wind_speed": 2},
            {"time": "18:00", "temperature": 23, "precip_prob": 70, "wind_speed": 6},
        ]
    },
    {
        "trends": {"change_rate_1h": 1.2, "total_change_3h": 2.4},
        "patterns": {"vs_yesterday": 2.0, "vs_time_slot_avg": 1.5},
        "statistics": {"current_percentile": 85},
    },
    {
        "current_rainfall": 1.0,
        "forecast_30m": 2.0,
        "forecast_1h": 3.0,
        "consecutive_minutes": 20,
    },
)
assert signals["comparison_values"]["sensor_vs_grid_temperature_c"] == 2.0
assert signals["recent_sensor_change"]["change_last_1h_c"] == 1.2
assert signals["next_6_hours_summary"]["temperature_change_first_to_last_c"] == -4.0
assert signals["next_6_hours_summary"]["max_precip_probability_percent"] == 70.0
assert signals["rain_change_summary"]["change_current_to_1h_mm_h"] == 2.0
assert {item["topic"] for item in signals["notable_findings"]} >= {
    "観測地点差",
    "体感",
    "直近変化",
    "昨日比較",
    "数時間先",
    "降水見通し",
    "雨の実況",
}


class FakeWeatherResponse:
    def raise_for_status(self):
        return None

    def json(self):
        size = 48
        return {
            "current": {
                "weather_code": 1,
                "temperature_2m": 24.5,
                "relative_humidity_2m": 54,
                "wind_speed_10m": 2.0,
            },
            "hourly": {
                "time": [f"2026-07-31T{i % 24:02d}:00" for i in range(size)],
                "weather_code": [1] * size,
                "temperature_2m": [24.5] * size,
                "precipitation_probability": [10] * size,
                "wind_speed_10m": [2.0] * size,
            },
            "daily": {
                "time": ["2026-07-31"],
                "sunrise": ["2026-07-31T04:47"],
                "sunset": ["2026-07-31T18:48"],
                "temperature_2m_max": [33.2],
                "temperature_2m_min": [25.1],
                "precipitation_probability_max": [40],
                "precipitation_sum": [2.5],
                "wind_speed_10m_max": [6.4],
                "wind_gusts_10m_max": [12.1],
                "wind_direction_10m_dominant": [180],
            },
        }


module.requests.get = lambda *_args, **_kwargs: FakeWeatherResponse()
forecast = module.fetch_weather_forecast()
assert forecast["daily"]["temperature_max"] == 33.2
assert forecast["daily"]["temperature_min"] == 25.1
assert forecast["daily"]["precipitation_sum"] == 2.5
assert forecast["daily"]["wind_gusts_max"] == 12.1
assert forecast["daily"]["wind_direction_dominant"] == "南"

with tempfile.TemporaryDirectory() as temp_dir:
    output_path = Path(temp_dir) / "output.json"
    module._write_json_atomic(output_path, {"message": "正常"})
    assert json.loads(output_path.read_text(encoding="utf-8")) == {
        "message": "正常"
    }
    assert not output_path.with_suffix(".json.tmp").exists()

print("AI advisor prompt tests passed")
