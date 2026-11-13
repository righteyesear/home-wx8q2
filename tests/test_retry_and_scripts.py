import io
import json
import sys
import types
import unittest
import urllib.error
from datetime import datetime
from pathlib import Path
from unittest import mock


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import retry_utils  # noqa: E402
import moon_data  # noqa: E402
import precipitation  # noqa: E402


class FakeApiError(Exception):
    def __init__(self, code: int, status: str, message: str = ""):
        super().__init__(f"{code} {status}: {message}")
        self.code = code
        self.status = status
        self.message = message


class FakeUrllibResponse:
    def __init__(self, payload: dict):
        self._raw = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakeRequestsResponse:
    def __init__(self, *, status_code: int = 200, text: str = "", json_data=None, headers=None):
        self.status_code = status_code
        self.text = text
        self._json_data = json_data
        self.headers = headers or {}
        self.closed = False

    def json(self):
        return self._json_data

    def close(self):
        self.closed = True

    def raise_for_status(self):
        if self.status_code >= 400:
            err = RuntimeError(f"HTTP {self.status_code}")
            err.response = self
            raise err


class TestRetryUtilsAndScripts(unittest.TestCase):
    def test_gemini_retry_only_on_transient_503_never_429(self):
        sleeps = []
        attempts = {"count": 0}

        def flaky_503():
            attempts["count"] += 1
            if attempts["count"] < 3:
                raise FakeApiError(503, "UNAVAILABLE", "high demand")
            return "ok"

        result = retry_utils.call_gemini_with_retry(
            flaky_503,
            source_name="TestGemini",
            sleep_fn=sleeps.append,
        )
        self.assertEqual(result, "ok")
        self.assertEqual(attempts["count"], 3)
        self.assertEqual(sleeps, [2.0, 4.0])

        # 429 / RESOURCE_EXHAUSTED は絶対に再試行しない
        calls_429 = {"count": 0}

        def fail_429():
            calls_429["count"] += 1
            raise FakeApiError(429, "RESOURCE_EXHAUSTED", "quota exceeded")

        with self.assertRaises(FakeApiError):
            retry_utils.call_gemini_with_retry(fail_429, sleep_fn=sleeps.append)
        self.assertEqual(calls_429["count"], 1)

        # 汎用 RuntimeError も再試行しない
        calls_generic = {"count": 0}

        def fail_generic():
            calls_generic["count"] += 1
            raise RuntimeError("primary unavailable")

        with self.assertRaises(RuntimeError):
            retry_utils.call_gemini_with_retry(fail_generic, sleep_fn=sleeps.append)
        self.assertEqual(calls_generic["count"], 1)

    def test_moon_data_retries_without_requests_dependency(self):
        # requests が無い環境（moon_update.yml）でも読込・実行可能であることを確認
        with mock.patch.dict(sys.modules, {"requests": None}):
            self.assertNotIn("requests", moon_data.__dict__)

        attempts = {"count": 0}

        def fake_urlopen(url, timeout=0):
            self.assertEqual(timeout, moon_data.MOON_API_TIMEOUT)
            attempts["count"] += 1
            if attempts["count"] == 1:
                raise TimeoutError("timed out")
            if attempts["count"] == 2:
                raise urllib.error.HTTPError(
                    url, 503, "Service Unavailable", hdrs={}, fp=io.BytesIO(b"")
                )
            return FakeUrllibResponse({"rise_and_set": {"moonrise_hm": "09:00"}})

        with mock.patch.object(retry_utils.time, "sleep"), mock.patch.object(
            moon_data.urllib.request, "urlopen", side_effect=fake_urlopen
        ):
            data = moon_data.fetch_json("https://example.com/moon")

        self.assertEqual(attempts["count"], 3)
        self.assertEqual(data["rise_and_set"]["moonrise_hm"], "09:00")

        # 404 恒久エラーはリトライせず即失敗する
        calls_404 = {"count": 0}

        def fail_404(url, timeout=0):
            calls_404["count"] += 1
            raise urllib.error.HTTPError(url, 404, "Not Found", hdrs={}, fp=io.BytesIO(b""))

        with mock.patch.object(retry_utils.time, "sleep"), mock.patch.object(
            moon_data.urllib.request, "urlopen", side_effect=fail_404
        ):
            with self.assertRaises(urllib.error.HTTPError):
                moon_data.fetch_json("https://example.com/404")
        self.assertEqual(calls_404["count"], 1)

    def test_precipitation_retries_timeout_and_503(self):
        payload = {
            "Feature": [
                {
                    "Property": {
                        "WeatherList": {
                            "Weather": [
                                {"Date": "202611140025", "Rainfall": 1.25, "Type": "observation"}
                            ]
                        }
                    }
                }
            ]
        }
        attempts = {"count": 0}

        def fake_get(url, **kwargs):
            self.assertEqual(kwargs["timeout"], precipitation.YAHOO_PRECIP_TIMEOUT)
            self.assertIn("params", kwargs)
            attempts["count"] += 1
            if attempts["count"] == 1:
                raise TimeoutError("read timeout")
            if attempts["count"] == 2:
                return FakeRequestsResponse(status_code=503)
            return FakeRequestsResponse(status_code=200, json_data=payload)

        with mock.patch.object(retry_utils.time, "sleep"), mock.patch.object(
            precipitation, "YAHOO_CLIENT_ID", "dummy-yahoo-id"
        ), mock.patch.object(precipitation.requests, "get", side_effect=fake_get):
            result = precipitation.fetch_precipitation()

        self.assertIsNotNone(result)
        self.assertEqual(attempts["count"], 3)
        self.assertEqual(len(result["data"]), 1)
        self.assertEqual(result["data"][0]["rainfall"], 1.25)

    def test_ai_advisor_retries_gemini_503_but_stops_on_429(self):
        import ai_advisor

        def make_inputs():
            return (
                {"current": {"temperature": 18.0, "humidity": 60, "today_high": 20.0, "today_low": 12.0}, "analysis": {}},
                {"current": {"weather_code": 1, "temperature": 18.0, "humidity": 60, "wind_speed": 1.5, "wind_direction": 90}, "hourly_forecast": [], "daily": {}, "yahoo_precip": {}},
                {"alerts": [], "transitions": []},
            )

        advice_text = (
            "今は落ち着いた空気で過ごしやすい陽気です。\n\n"
            "この先も大きな天気の崩れはなさそうです。\n\n"
            "朝晩の冷え込みに備えて羽織り物があると安心です。"
        )
        calls_503 = {"count": 0}

        class FakeClient503:
            def __init__(self, **_kwargs):
                self.models = self

            def generate_content(self, **_kwargs):
                calls_503["count"] += 1
                if calls_503["count"] == 1:
                    raise FakeApiError(503, "UNAVAILABLE", "overload")
                return types.SimpleNamespace(text=advice_text)

        sp, wx, al = make_inputs()
        with mock.patch.object(ai_advisor, "GEMINI_API_KEY", "test-key"), mock.patch.object(
            ai_advisor, "load_moon_data", return_value={}
        ), mock.patch.object(ai_advisor.time, "sleep"), mock.patch.object(
            ai_advisor.genai, "Client", FakeClient503
        ):
            out = ai_advisor.analyze_with_gemini(sp, wx, al)

        self.assertEqual(calls_503["count"], 2)
        self.assertIn("落ち着いた空気", out)

        calls_429 = {"count": 0}

        class FakeClient429:
            def __init__(self, **_kwargs):
                self.models = self

            def generate_content(self, **_kwargs):
                calls_429["count"] += 1
                raise FakeApiError(429, "RESOURCE_EXHAUSTED", "limit")

        with mock.patch.object(ai_advisor, "GEMINI_API_KEY", "test-key"), mock.patch.object(
            ai_advisor, "load_moon_data", return_value={}
        ), mock.patch.object(ai_advisor.time, "sleep"), mock.patch.object(
            ai_advisor.genai, "Client", FakeClient429
        ):
            out_err = ai_advisor.analyze_with_gemini(sp, wx, al)

        self.assertEqual(calls_429["count"], 1)
        self.assertTrue(out_err.startswith("⚠️ 分析エラー"))

    def test_report_generator_retries_fetch_and_gemini_503(self):
        import report_generator

        daily_csv = '"Date","Max","Min","Avg"\n"2026/11/12","17.3","6.9","11.7"\n"2026/11/13","18.3","8.3","12.5"\n'
        fetch_calls = {"count": 0}

        def fake_get(url, **kwargs):
            fetch_calls["count"] += 1
            if fetch_calls["count"] == 1:
                raise TimeoutError("daily timeout")
            return FakeRequestsResponse(status_code=200, text=daily_csv)

        with mock.patch.object(retry_utils.time, "sleep"), mock.patch.object(
            report_generator.requests, "get", side_effect=fake_get
        ):
            rows = report_generator.fetch_daily_data()

        self.assertEqual(fetch_calls["count"], 2)
        self.assertEqual(len(rows), 2)

        sample_report = {
            "type": "weekly",
            "period": {"year": 2026, "week": 45, "start_date": "2026-11-02", "end_date": "2026-11-08", "label": "2026年11月第1週"},
            "sections": {
                "statistics": {"avg_temp": 14.0, "max_temp": 20.0, "min_temp": 8.0, "prev_week_diff": 0.5, "prev_year_diff": -0.2},
                "daily_data": [{"date": "2026-11-02", "avg": 13.5}, {"date": "2026-11-08", "avg": 14.5}],
                "comparison": {},
                "prev_month": {},
                "baseline": {},
            },
        }
        valid_json = json.dumps({
            "summary": (
                "今週は期間平均気温が14.0℃、最高20.0℃・最低8.0℃となり、"
                "日ごとの寒暖差を伴いつつ全体としては大きく崩れない穏やかな一週間でした。"
                "朝晩の冷え込みと日中の気温差を確認しながら過ごす状況が続きました。"
            ),
            "comparison": (
                "前週と比べると平均気温は+0.5℃高めで、前年差は-0.2℃と平年並みに近い範囲に収まりました。"
                "週を通して極端な高温や低温への偏りは小さく、季節の移り変わりに沿った推移です。"
            ),
            "trend_analysis": (
                "日別の推移では前半の13.5℃から後半の14.5℃へ緩やかに持ち直す動きが見られ、"
                "日々の最高・最低気温の幅も保たれています。引き続き日較差に留意したい流れです。"
            ),
        }, ensure_ascii=False)
        gemini_calls = {"count": 0}

        class FakeReportClient503:
            def __init__(self, **_kwargs):
                self.models = self

            def generate_content(self, **_kwargs):
                gemini_calls["count"] += 1
                if gemini_calls["count"] == 1:
                    raise FakeApiError(503, "UNAVAILABLE", "busy")
                return types.SimpleNamespace(text=valid_json)

        with mock.patch.object(retry_utils.time, "sleep"), mock.patch.object(
            report_generator, "GEMINI_API_KEY", "test-key"
        ), mock.patch.object(report_generator, "_gemini_calls", 0), mock.patch.object(
            report_generator.genai, "Client", FakeReportClient503
        ):
            analyzed = report_generator.analyze_report_with_gemini(sample_report)
            self.assertEqual(gemini_calls["count"], 2)
            self.assertEqual(analyzed["analysis_meta"]["source"], "gemini")
            self.assertEqual(report_generator._gemini_calls, 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
