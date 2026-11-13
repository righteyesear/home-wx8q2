from datetime import datetime, timedelta
import importlib.util
import json
import sys
import tempfile
import types
from pathlib import Path
from unittest import mock


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
assert module.GEMINI_MODEL == module.os.environ.get("GEMINI_MODEL", "gemini-4-hydrogen")


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

    def generate_content(self, *, model, contents, config=None):
        self.calls.append((model, contents, config))
        if self.fail_primary and model == "gemini-4-hydrogen":
            raise RuntimeError("primary unavailable")
        return FakeResponse()


def run_with(fake_models, alerts=None):
    module.genai.Client = lambda **_kwargs: types.SimpleNamespace(models=fake_models)
    module.GEMINI_API_KEY = "test-key"
    module.GEMINI_MODEL = "gemini-4-hydrogen"
    module.GEMINI_THINKING_LEVEL = "high"
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
assert primary.calls[0][0] == "gemini-4-hydrogen"
assert primary.calls[0][2] == {
    "thinking_config": {"thinking_level": "high"}
}
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
assert [call[0] for call in failed.calls] == ["gemini-4-hydrogen"]
assert failed_result.startswith("⚠️ 分析エラー (gemini-4-hydrogen):")

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


class StubTextResponse:
    def __init__(self, text="", status_code=200, headers=None, raise_exc=None, json_data=None):
        self.text = text
        self.status_code = status_code
        self.headers = headers or {}
        self._raise_exc = raise_exc
        self._json_data = json_data
        self.closed = False

    def raise_for_status(self):
        if self._raise_exc is not None:
            raise self._raise_exc
        if self.status_code >= 400:
            err = RuntimeError(f"HTTP {self.status_code}")
            err.response = self
            raise err

    def json(self):
        return self._json_data

    def close(self):
        self.closed = True


def _sample_weather_payload():
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


def _run_retry_and_fallback_tests():
    now = datetime.now(module.JST)
    today = now.date()
    yesterday = today - timedelta(days=1)
    two_days_ago = today - timedelta(days=2)

    # 1. リトライ成功テスト（タイムアウト + 503 + Retry-After付き429 の後に成功）
    weather_calls = []
    sleep_calls = []

    def flaky_weather_get(url, **kwargs):
        weather_calls.append((url, kwargs))
        attempt = len(weather_calls)
        if attempt == 1:
            raise TimeoutError("Read timed out. (read timeout=10)")
        if attempt == 2:
            return StubTextResponse(status_code=503)
        return StubTextResponse(status_code=200, json_data=_sample_weather_payload())

    with (
        mock.patch.object(module.requests, "get", side_effect=flaky_weather_get, create=True),
        mock.patch.object(module.time, "sleep", side_effect=sleep_calls.append),
    ):
        recovered_weather = module.fetch_weather_forecast()

    assert recovered_weather["error"] is None
    assert recovered_weather["current"]["temperature"] == 24.5
    assert len(weather_calls) == 3
    assert all(call[1]["timeout"] == module.EXTERNAL_API_TIMEOUT for call in weather_calls)
    assert sleep_calls == [1.0, 2.0]

    # Retry-After (429) および 404 非リトライ確認（JMA予報 / Yahoo降水）
    jma_calls = []
    jma_sleeps = []

    def flaky_jma_get(url, **kwargs):
        jma_calls.append((url, kwargs))
        if len(jma_calls) == 1:
            return StubTextResponse(status_code=429, headers={"Retry-After": "3"})
        return StubTextResponse(
            status_code=200,
            json_data=[
                {
                    "reportDatetime": "2026-11-13T17:00:00+09:00",
                    "timeSeries": [
                        {
                            "timeDefines": ["2026-11-13T18:00:00+09:00"],
                            "areas": [
                                {
                                    "area": {"code": "130010"},
                                    "weathers": ["晴れ"],
                                    "weatherCodes": ["100"],
                                    "pops": ["10"],
                                }
                            ],
                        }
                    ],
                }
            ],
        )

    with (
        mock.patch.object(module.requests, "get", side_effect=flaky_jma_get, create=True),
        mock.patch.object(module.time, "sleep", side_effect=jma_sleeps.append),
    ):
        jma_res = module.fetch_jma_forecast()

    assert jma_res["error"] is None
    assert jma_res["weather"] == "晴れ"
    assert len(jma_calls) == 2
    assert jma_calls[0][1]["headers"] == {"Cache-Control": "no-cache"}
    assert jma_sleeps == [3.0]

    # 404 は恒久エラーなのでリトライせず 1 回で終了
    not_found_calls = []
    not_found_sleeps = []

    def not_found_get(url, **kwargs):
        not_found_calls.append(url)
        return StubTextResponse(status_code=404)

    with (
        mock.patch.object(module.requests, "get", side_effect=not_found_get, create=True),
        mock.patch.object(module.time, "sleep", side_effect=not_found_sleeps.append),
    ):
        precip_err = module.fetch_yahoo_precipitation()

    assert precip_err["error"] is not None
    assert len(not_found_calls) == 1
    assert not_found_sleeps == []

    # requests.exceptions を持つ環境での Timeout / HTTPError リトライ判定
    class FakeTimeout(Exception):
        pass

    class FakeHTTPError(Exception):
        def __init__(self, status_code):
            super().__init__(f"HTTP {status_code}")
            self.response = types.SimpleNamespace(status_code=status_code)

    fake_exceptions = types.SimpleNamespace(
        Timeout=FakeTimeout,
        ConnectionError=ConnectionError,
        ChunkedEncodingError=RuntimeError,
        HTTPError=FakeHTTPError,
    )
    alerts_calls = []
    with (
        mock.patch.object(module.requests, "exceptions", fake_exceptions, create=True),
        mock.patch.object(
            module.requests,
            "get",
            side_effect=[
                FakeTimeout("timeout"),
                FakeHTTPError(502),
                StubTextResponse(status_code=200, json_data=[]),
            ],
            create=True,
        ) as mocked_get,
        mock.patch.object(module.time, "sleep"),
    ):
        alerts_calls.append(module.fetch_jma_alerts())
        assert mocked_get.call_count == 3
    assert alerts_calls[0]["error"] is None

    # 2. Summary タイムアウト時も Recent + Daily で復旧するテスト（(0.0, 0.0) 除外含む）
    recent_csv = "\n".join(
        [
            '"datetime","temperature","humidity"',
            f'"{yesterday.strftime("%Y-%m-%d")} 06:00","8.4","72"',
            f'"{yesterday.strftime("%Y-%m-%d")} 12:00","0.0","0.0"',  # 異常行（除外対象）
            f'"{yesterday.strftime("%Y-%m-%d")} 14:00","17.5","48"',
            f'"{today.strftime("%Y-%m-%d")} 05:30","9.2","76"',
            f'"{today.strftime("%Y-%m-%d")} 13:00","18.6","52"',
            f'"{today.strftime("%Y-%m-%d")} 13:01","0.0","0.0"',  # 末尾の異常行（除外対象）
        ]
    )
    daily_csv = "\n".join(
        [
            '"Date","Max","Min","Avg"',
            f'"{two_days_ago.strftime("%Y/%m/%d")}","16.0","7","11.2"',
            f'"{yesterday.strftime("%Y/%m/%d")}","17.5","8.4","12.1"',
            f'"{today.strftime("%Y/%m/%d")}","18.6","9","13.0"',
            '"2024/03/12","0.0","0.0","0.0"',  # 異常停止日（history_stats除外対象）
        ]
    )

    sheet_timeouts = {}

    def summary_timeout_get(url, **kwargs):
        if "sheet=Summary" in url:
            sheet_timeouts.setdefault("Summary", []).append(kwargs["timeout"])
            raise TimeoutError("Read timed out. (read timeout=25)")
        if "sheet=Recent" in url:
            sheet_timeouts.setdefault("Recent", []).append(kwargs["timeout"])
            return StubTextResponse(text=recent_csv)
        if "sheet=Daily" in url:
            sheet_timeouts.setdefault("Daily", []).append(kwargs["timeout"])
            return StubTextResponse(text=daily_csv)
        raise AssertionError(f"Unexpected URL: {url}")

    fake_analysis = {
        "trends": {"change_rate_1h": 0.4},
        "patterns": {"vs_yesterday": 1.1},
        "daily_summary": [
            {
                "date": today.strftime("%m/%d"),
                "high": 18.6,
                "low": 9.2,
                "avg": 13.9,
                "range": 9.4,
            }
        ],
    }

    with (
        mock.patch.object(module.requests, "get", side_effect=summary_timeout_get, create=True),
        mock.patch.object(module.time, "sleep"),
        mock.patch.object(module, "analyze_data_comprehensive", return_value=fake_analysis),
    ):
        ss_recovered = module.fetch_spreadsheet_data()

    assert len(sheet_timeouts["Summary"]) == module.HTTP_MAX_ATTEMPTS
    assert sheet_timeouts["Summary"][0] == module.SPREADSHEET_SUMMARY_TIMEOUT
    assert sheet_timeouts["Recent"] == [module.SPREADSHEET_RECENT_TIMEOUT]
    assert sheet_timeouts["Daily"] == [module.SPREADSHEET_DAILY_TIMEOUT]
    assert ss_recovered["error"] is None
    assert "summary" in ss_recovered["sheet_errors"]
    assert ss_recovered["current"]["temperature"] == 18.6
    assert ss_recovered["current"]["humidity"] == 52.0
    assert ss_recovered["current"]["today_high"] == 18.6
    assert ss_recovered["current"]["today_low"] == 9.2
    assert ss_recovered["current"]["yesterday_high"] == 17.5
    assert ss_recovered["current"]["yesterday_low"] == 8.4
    assert ss_recovered["current"]["year_high"] == 18.6
    assert ss_recovered["current"]["year_low"] == 7.0
    assert ss_recovered["history_stats"]["record_low"] == 7.0
    # daily_summary ('MM/DD') と Daily ('YYYY/MM/DD') の同日重複が排除されていること
    assert len(ss_recovered["daily_detailed"]) == 3

    # 補完後のデータで analyze_with_gemini（モック）に個人センサー扱いとして渡ることを確認
    recovery_models = FakeModels()
    with (
        mock.patch.object(module.genai, "Client", return_value=types.SimpleNamespace(models=recovery_models), create=True),
        mock.patch.object(module, "GEMINI_API_KEY", "test-key"),
        mock.patch.object(module, "load_moon_data", return_value={"age": 1, "phase": "新月"}),
    ):
        module.analyze_with_gemini(
            ss_recovered,
            {"current": {"weather_code": 1, "temperature": 17.0, "humidity": 55, "wind_speed": 2.0}, "hourly_forecast": [], "daily": {}, "yahoo_precip": {}},
            {"alerts": [], "transitions": []},
        )
    prompt_text = recovery_models.calls[0][1]
    assert '"source":"personal_sensor"' in prompt_text
    assert '"temperature_c":18.6' in prompt_text
    assert '"yesterday_high_c":17.5' in prompt_text
    assert '"partial_today_high_vs_yesterday_high_c":1.1' in prompt_text

    # 3. Summary 実ラベル（年間最高気温/年間最低気温）+ Summary (0.0, 0.0) 異常値 + Daily 0.0汚染フォールバックテスト
    summary_csv_real_labels = "\n".join(
        [
            '"今日の最高気温","18.6"',
            '"今日の最低気温","0.0"',  # 異常行混入による汚染値
            '"年間最高気温","38.4"',
            '"年間最低気温","-1.2"',
            '"現在の気温","0.0"',  # センサー現在値バグ
            '"現在の湿度","0.0"',
            f'"最終更新日時","{today.strftime("%Y-%m-%d")} 13:01"',
            '"データ件数","1400000"',
        ]
    )
    daily_csv_zero_polluted = "\n".join(
        [
            '"Date","Max","Min","Avg"',
            f'"{yesterday.strftime("%Y/%m/%d")}","17.5","0","10.5"',
        ]
    )

    def polluted_get(url, **kwargs):
        if "sheet=Summary" in url:
            return StubTextResponse(text=summary_csv_real_labels)
        if "sheet=Recent" in url:
            return StubTextResponse(text=recent_csv)
        if "sheet=Daily" in url:
            return StubTextResponse(text=daily_csv_zero_polluted)
        raise AssertionError(f"Unexpected URL: {url}")

    with (
        mock.patch.object(module.requests, "get", side_effect=polluted_get, create=True),
        mock.patch.object(module, "analyze_data_comprehensive", return_value={}),
    ):
        ss_cleansed = module.fetch_spreadsheet_data()

    assert ss_cleansed["error"] is None
    assert ss_cleansed["current"]["year_high"] == 38.4
    assert ss_cleansed["current"]["year_low"] == -1.2
    assert ss_cleansed["current"]["temperature"] == 18.6
    assert ss_cleansed["current"]["humidity"] == 52.0
    assert ss_cleansed["current"]["today_low"] == 9.2
    assert ss_cleansed["current"]["yesterday_low"] == 8.4

    # 4. 真冬の正常値 (0.0℃, 70%) は異常値として除外されないこと + 全滅(0.0, 0.0)時の安全性
    winter_recent_csv = "\n".join(
        [
            '"datetime","temperature","humidity"',
            f'"{today.strftime("%Y-%m-%d")} 06:00","0.0","70.0"',
            f'"{today.strftime("%Y-%m-%d")} 06:01","0.0","0.0"',
        ]
    )

    def winter_get(url, **kwargs):
        if "sheet=Summary" in url:
            raise TimeoutError("timeout")
        if "sheet=Recent" in url:
            return StubTextResponse(text=winter_recent_csv)
        return StubTextResponse(status_code=404)

    with (
        mock.patch.object(module.requests, "get", side_effect=winter_get, create=True),
        mock.patch.object(module.time, "sleep"),
        mock.patch.object(module, "analyze_data_comprehensive", return_value={}),
    ):
        ss_winter = module.fetch_spreadsheet_data()

    assert ss_winter["error"] is None
    assert ss_winter["current"]["temperature"] == 0.0
    assert ss_winter["current"]["humidity"] == 70.0

    # 5. Summary失敗かつRecent全件(0.0, 0.0)で補完不能時は error を設定し偽の0.0を出さないこと
    all_zero_recent_csv = "\n".join(
        [
            '"datetime","temperature","humidity"',
            f'"{today.strftime("%Y-%m-%d")} 06:00","0.0","0.0"',
        ]
    )

    def unrecoverable_get(url, **kwargs):
        if "sheet=Summary" in url:
            raise TimeoutError("summary timeout")
        if "sheet=Recent" in url:
            return StubTextResponse(text=all_zero_recent_csv)
        return StubTextResponse(text='"Date","Max","Min","Avg"\n')

    with (
        mock.patch.object(module.requests, "get", side_effect=unrecoverable_get, create=True),
        mock.patch.object(module.time, "sleep"),
        mock.patch.object(module, "analyze_data_comprehensive", return_value={}),
    ):
        ss_unrecoverable = module.fetch_spreadsheet_data()

    assert ss_unrecoverable["error"] is not None
    assert "Summary" in ss_unrecoverable["error"]
    assert "temperature" not in ss_unrecoverable["current"]

    # 6. Recent失敗・Summary/Daily成功時は error を残しつつ Summary/Daily 値を保持すること
    summary_ok_csv = '"現在の気温","15.2"\n"現在の湿度","60"\n"今日の最高気温","16.5"\n"今日の最低気温","8.0"\n'

    def recent_fail_get(url, **kwargs):
        if "sheet=Summary" in url:
            return StubTextResponse(text=summary_ok_csv)
        if "sheet=Recent" in url:
            raise ConnectionError("connection reset")
        return StubTextResponse(text=daily_csv)

    with (
        mock.patch.object(module.requests, "get", side_effect=recent_fail_get, create=True),
        mock.patch.object(module.time, "sleep"),
    ):
        ss_recent_fail = module.fetch_spreadsheet_data()

    assert ss_recent_fail["error"] is not None
    assert "Recent" in ss_recent_fail["error"]
    assert ss_recent_fail["current"]["temperature"] == 15.2
    assert ss_recent_fail["current"]["yesterday_high"] == 17.5
    assert ss_recent_fail["history_stats"]["total_days"] == 3

    # 7. 年またぎ MM/DD HH:MM パース安全性
    jan_now = datetime(2026, 1, 2, 10, 0, tzinfo=module.JST)
    dec_dt = module._parse_spreadsheet_datetime("12/31 23:55", jan_now)
    jan_dt = module._parse_spreadsheet_datetime("01/01 00:05", jan_now)
    assert dec_dt == datetime(2025, 12, 31, 23, 55, tzinfo=module.JST)
    assert jan_dt == datetime(2026, 1, 1, 0, 5, tzinfo=module.JST)
    assert module._parse_spreadsheet_datetime("invalid-date", jan_now) is None

    # 8. 経過時間バジェットによる有界リトライ打ち切り保証（5分制限対策）
    clock = [0.0]
    budget_calls = []

    def slow_timeout_get(url, **kwargs):
        budget_calls.append(url)
        clock[0] += kwargs["timeout"]
        raise TimeoutError("slow timeout")

    with (
        mock.patch.object(module.requests, "get", side_effect=slow_timeout_get, create=True),
        mock.patch.object(module.time, "monotonic", side_effect=lambda: clock[0]),
        mock.patch.object(module.time, "sleep", side_effect=lambda sec: clock.__setitem__(0, clock[0] + sec)),
    ):
        try:
            module._http_get_with_retry(
                "https://example.com/slow",
                timeout=25,
                source_name="SlowSheet",
            )
            raise AssertionError("Expected TimeoutError")
        except TimeoutError:
            pass
    # 1回目 25s (< 30s) -> sleep 1s -> 2回目 25s (累計 51s >= 30s) で3回目はスキップされる
    assert len(budget_calls) == 2

    # シート全体バジェット超過時は後続シートをリトライなし(1回)に抑えること
    sheet_clock = [0.0]
    sheet_attempts_by_name = {"Summary": 0, "Recent": 0, "Daily": 0}

    def slow_all_sheets_get(url, **kwargs):
        sheet_clock[0] += kwargs["timeout"]
        if "sheet=Summary" in url:
            sheet_attempts_by_name["Summary"] += 1
        elif "sheet=Recent" in url:
            sheet_attempts_by_name["Recent"] += 1
        elif "sheet=Daily" in url:
            sheet_attempts_by_name["Daily"] += 1
        raise TimeoutError("sheet hang")

    with (
        mock.patch.object(module.requests, "get", side_effect=slow_all_sheets_get, create=True),
        mock.patch.object(module.time, "monotonic", side_effect=lambda: sheet_clock[0]),
        mock.patch.object(module.time, "sleep", side_effect=lambda sec: sheet_clock.__setitem__(0, sheet_clock[0] + sec)),
    ):
        ss_all_fail = module.fetch_spreadsheet_data()

    assert sheet_attempts_by_name == {"Summary": 2, "Recent": 2, "Daily": 1}
    assert ss_all_fail["error"] is not None
    assert "Summary" in ss_all_fail["error"]
    assert "Recent" in ss_all_fail["error"]
    assert "Daily" in ss_all_fail["error"]

    # 9. main() 統合チェック（実ファイル上書なし・Geminiモックで整合確認）
    captured_writes = []

    def main_mock_get(url, **kwargs):
        if "sheet=Summary" in url:
            raise TimeoutError("summary timeout")
        if "sheet=Recent" in url:
            return StubTextResponse(text=recent_csv)
        if "sheet=Daily" in url:
            return StubTextResponse(text=daily_csv)
        if "open-meteo.com" in url:
            return StubTextResponse(status_code=200, json_data=_sample_weather_payload())
        if "forecast/130000.json" in url:
            return StubTextResponse(
                status_code=200,
                json_data=[
                    {
                        "reportDatetime": "2026-11-13T17:00:00+09:00",
                        "timeSeries": [
                            {
                                "timeDefines": ["2026-11-13T18:00:00+09:00"],
                                "areas": [
                                    {
                                        "area": {"code": "130010"},
                                        "weathers": ["晴れ"],
                                        "weatherCodes": ["100"],
                                        "pops": ["0"],
                                    }
                                ],
                            }
                        ],
                    }
                ],
            )
        if "warning/data" in url:
            return StubTextResponse(status_code=200, json_data=[])
        if "yahoo-weather-proxy" in url:
            return StubTextResponse(status_code=200, json_data={"data": []})
        raise AssertionError(f"Unexpected URL: {url}")

    main_models = FakeModels()
    with (
        mock.patch.object(module.requests, "get", side_effect=main_mock_get, create=True),
        mock.patch.object(module.time, "sleep"),
        mock.patch.object(module, "analyze_data_comprehensive", return_value=fake_analysis),
        mock.patch.object(module.genai, "Client", return_value=types.SimpleNamespace(models=main_models), create=True),
        mock.patch.object(module, "GEMINI_API_KEY", "test-key"),
        mock.patch.object(module, "load_moon_data", return_value={"age": 1, "phase": "新月"}),
        mock.patch.object(module, "_write_json_atomic", side_effect=lambda path, data: captured_writes.append((path, data))),
    ):
        module.main()

    assert len(captured_writes) == 1
    written_data = captured_writes[0][1]
    assert written_data["analysis_status"] == "ok"
    assert written_data["source_status"]["spreadsheet_error"] is None
    assert written_data["data_summary"]["outdoor_temp"] == 18.6
    assert written_data["data_summary"]["weather_temp"] == 24.5


_run_retry_and_fallback_tests()

print("AI advisor prompt tests passed")
