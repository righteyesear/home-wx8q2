import math
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from data_analysis import (  # noqa: E402
    JST,
    analyze_data_comprehensive,
    parse_datetime,
)


def make_record(dt: datetime, temp: float, humid: float = 60.0, fmt: str = "%Y-%m-%d %H:%M") -> dict:
    return {
        "datetime": dt.strftime(fmt),
        "temperature": temp,
        "humidity": humid,
    }


class ParseDatetimeTests(unittest.TestCase):
    def setUp(self):
        self.ref_now = datetime(2026, 11, 13, 23, 50, tzinfo=JST)

    def test_parses_supported_full_formats(self):
        cases = [
            ("2026-11-13 23:43", datetime(2026, 11, 13, 23, 43, 0, tzinfo=JST)),
            ("2026-11-13 23:43:15", datetime(2026, 11, 13, 23, 43, 15, tzinfo=JST)),
            ("2026/11/13 23:43", datetime(2026, 11, 13, 23, 43, 0, tzinfo=JST)),
            ("2026/11/13 23:43:15", datetime(2026, 11, 13, 23, 43, 15, tzinfo=JST)),
            ("2026/1/5 8:05", datetime(2026, 1, 5, 8, 5, 0, tzinfo=JST)),
            ("2026-11-13T23:43", datetime(2026, 11, 13, 23, 43, 0, tzinfo=JST)),
            ("2026-11-13T23:43:15", datetime(2026, 11, 13, 23, 43, 15, tzinfo=JST)),
            ("  2026-11-13 23:43  ", datetime(2026, 11, 13, 23, 43, 0, tzinfo=JST)),
        ]
        for text, expected in cases:
            with self.subTest(text=text):
                parsed = parse_datetime(text, now=self.ref_now)
                self.assertEqual(parsed, expected)
                self.assertEqual(parsed.tzinfo, JST)

    def test_parses_iso_with_timezone_and_microseconds(self):
        utc_parsed = parse_datetime("2026-11-13T14:43:15Z", now=self.ref_now)
        self.assertEqual(utc_parsed, datetime(2026, 11, 13, 23, 43, 15, tzinfo=JST))
        self.assertEqual(utc_parsed.tzinfo, JST)

        offset_parsed = parse_datetime("2026-11-13T23:43:15.250000+09:00", now=self.ref_now)
        self.assertEqual(offset_parsed, datetime(2026, 11, 13, 23, 43, 15, 250000, tzinfo=JST))
        self.assertEqual(offset_parsed.tzinfo, JST)

    def test_parses_legacy_month_day_formats(self):
        self.assertEqual(
            parse_datetime("11/13 23:43", now=self.ref_now),
            datetime(2026, 11, 13, 23, 43, 0, tzinfo=JST),
        )
        self.assertEqual(
            parse_datetime("11/13 23:43:45", now=self.ref_now),
            datetime(2026, 11, 13, 23, 43, 45, tzinfo=JST),
        )
        self.assertEqual(
            parse_datetime("1/5 8:05", now=self.ref_now),
            datetime(2026, 1, 5, 8, 5, 0, tzinfo=JST),
        )

    def test_year_rollover_for_short_format(self):
        early_jan = datetime(2026, 1, 2, 1, 0, tzinfo=JST)
        self.assertEqual(
            parse_datetime("12/31 23:55", now=early_jan),
            datetime(2025, 12, 31, 23, 55, tzinfo=JST),
        )
        self.assertEqual(
            parse_datetime("01/01 12:00", now=early_jan),
            datetime(2026, 1, 1, 12, 0, tzinfo=JST),
        )

        # 年末23:55時点で時計が少し進んだ 01/01 00:05 は翌年として解決する
        late_dec = datetime(2025, 12, 31, 23, 55, tzinfo=JST)
        self.assertEqual(
            parse_datetime("01/01 00:05", now=late_dec),
            datetime(2026, 1, 1, 0, 5, tzinfo=JST),
        )

        # naive な now 引数も JST に正規化されて年またぎ解決に使われること
        naive_jan = datetime(2026, 1, 2, 1, 0)
        self.assertEqual(
            parse_datetime("12/31 23:55", now=naive_jan),
            datetime(2025, 12, 31, 23, 55, tzinfo=JST),
        )

    def test_leap_day_edge_cases(self):
        # うるう年の2月29日当日・翌日
        self.assertEqual(
            parse_datetime("02/29 11:30", now=datetime(2024, 2, 29, 12, 0, tzinfo=JST)),
            datetime(2024, 2, 29, 11, 30, tzinfo=JST),
        )
        self.assertEqual(
            parse_datetime("02/29 23:50", now=datetime(2024, 3, 1, 0, 10, tzinfo=JST)),
            datetime(2024, 2, 29, 23, 50, tzinfo=JST),
        )
        # 平年に年なし "02/29" が来ても例外にならず直近過去のうるう年に解決する
        self.assertEqual(
            parse_datetime("02/29 12:00", now=datetime(2025, 2, 28, 12, 0, tzinfo=JST)),
            datetime(2024, 2, 29, 12, 0, tzinfo=JST),
        )
        # 平年で年が明示された 02/29 は不正日付として None
        self.assertIsNone(parse_datetime("2025-02-29 12:00", now=self.ref_now))
        self.assertIsNone(parse_datetime("2026/02/29 12:00", now=self.ref_now))
        # うるう年に年明示は有効
        self.assertEqual(
            parse_datetime("2024-02-29 12:00", now=self.ref_now),
            datetime(2024, 2, 29, 12, 0, tzinfo=JST),
        )

    def test_invalid_inputs_return_none(self):
        invalid_values = [
            "",
            "   ",
            None,
            12345,
            "not-a-date",
            "2026-11-13",
            "23:43",
            "2026-13-01 12:00",
            "02/30 12:00",
            "2026-11-13 25:00",
            "2026-11/13 12:00",
            "2026-11-13T12:00+25:00",
            "2026-11-13T12:00+09:60",
        ]
        for value in invalid_values:
            with self.subTest(value=value):
                self.assertIsNone(parse_datetime(value, now=self.ref_now))


class AnalyzeDataComprehensiveTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 13, 23, 50, tzinfo=JST)

    def test_empty_and_all_invalid_records(self):
        self.assertEqual(analyze_data_comprehensive([]), {"error": "No data available"})

        only_bad = [
            {"datetime": "bad-timestamp", "temperature": 20.0, "humidity": 50.0},
            {"datetime": "2026-11-13 23:43", "temperature": 0.0, "humidity": 0.0},
            {"datetime": "2026-11-13 23:44", "temperature": "0", "humidity": "0.0"},
        ]
        self.assertEqual(
            analyze_data_comprehensive(only_bad, now=self.now),
            {"error": "No valid timestamped data"},
        )

    def test_filters_zero_zero_sensor_errors_without_dropping_freezing_valid_data(self):
        records = [
            {"datetime": "2026-11-13 23:40", "temperature": 0.0, "humidity": 0.0},
            {"datetime": "2026-11-13 23:41", "temperature": "0.0", "humidity": "0.0"},
            {"datetime": "2026-11-13 23:42", "temperature": 0.0, "humidity": 75.0},
            {"datetime": "2026-11-13 23:43", "temperature": 12.0, "humidity": 0.0},
            {"datetime": "2026-11-13 23:44", "temperature": math.nan, "humidity": 60.0},
            {"datetime": "2026-11-13 23:45", "temperature": "6.0", "humidity": "50.0"},
        ]
        original_snapshot = [dict(r) for r in records]

        result = analyze_data_comprehensive(records, now=self.now)

        # 入力 dict に破壊的変更を行わない
        self.assertEqual(records, original_snapshot)
        self.assertEqual(result["data_summary"]["total_records"], 3)
        self.assertEqual(result["statistics"]["temp_min"], 0.0)
        self.assertEqual(result["statistics"]["temp_max"], 12.0)
        self.assertEqual(result["statistics"]["temp_mean"], 6.0)
        self.assertEqual(len(result["detailed_6h"]), 3)

    def test_single_record_handles_zero_stdev_and_z_score(self):
        records = [make_record(self.now - timedelta(minutes=5), 18.4, 55.2)]
        result = analyze_data_comprehensive(records, now=self.now)

        self.assertEqual(result["data_summary"]["total_records"], 1)
        self.assertEqual(result["statistics"]["temp_mean"], 18.4)
        self.assertEqual(result["statistics"]["temp_stdev"], 0)
        self.assertEqual(result["statistics"]["humidity_stdev"], 0)
        self.assertEqual(result["statistics"]["current_z_score"], 0)
        self.assertEqual(result["anomalies"], {"alerts": []})

    def test_hierarchical_buckets_and_output_keys_with_mixed_formats(self):
        records = []
        # 1-7日前 (25時間前〜72時間前から30件)
        for i in range(60):
            dt = self.now - timedelta(hours=30) + timedelta(minutes=i)
            records.append(make_record(dt, 14.0, 60.0, fmt="%Y/%m/%d %H:%M"))
        # 6-24時間前 (10時間前から10件)
        for i in range(10):
            dt = self.now - timedelta(hours=10) + timedelta(minutes=i)
            records.append(make_record(dt, 15.0, 58.0, fmt="%Y-%m-%dT%H:%M:%S"))
        # 直近6時間 (10分前から5件、逆順で渡してソートも確認)
        recent_items = [
            make_record(self.now - timedelta(minutes=i), 20.0 - i * 0.5, 50.0, fmt="%Y-%m-%d %H:%M")
            for i in range(5)
        ]
        records.extend(recent_items)

        result = analyze_data_comprehensive(records, now=self.now)

        expected_keys = {
            "data_summary",
            "statistics",
            "trends",
            "patterns",
            "anomalies",
            "detailed_6h",
            "sampled_6_24h",
            "sampled_1_7d",
            "daily_summary",
        }
        self.assertEqual(set(result.keys()), expected_keys)
        self.assertEqual(result["data_summary"]["total_records"], 75)
        self.assertEqual(result["data_summary"]["recent_6h_count"], 5)
        self.assertEqual(result["data_summary"]["range_6_24h_count"], 2)  # 10件[::5]
        self.assertEqual(result["data_summary"]["range_1_7d_count"], 2)   # 60件[::30]
        self.assertEqual(len(result["detailed_6h"]), 5)
        self.assertEqual(result["detailed_6h"][-1]["temp"], 20.0)
        self.assertEqual(len(result["sampled_6_24h"]), 2)
        self.assertEqual(len(result["sampled_1_7d"]), 2)

    def test_statistics_trends_and_vs_yesterday(self):
        records = []
        # 昨日同時刻（24時間前 + 10分前〜現在相当の範囲に正常値と(0.0, 0.0)異常値を混在）
        yesterday_base = self.now - timedelta(days=1)
        records.append(make_record(yesterday_base - timedelta(minutes=10), 10.0, 60.0))
        records.append(make_record(yesterday_base, 12.0, 62.0))
        # 昨日同時刻近傍に異常値 (0.0, 0.0) があっても除外されること
        records.append(make_record(yesterday_base + timedelta(minutes=5), 0.0, 0.0))

        # 3時間前から1時間前: 13.0℃ -> 14.0℃
        records.append(make_record(self.now - timedelta(hours=3), 13.0, 55.0))
        records.append(make_record(self.now - timedelta(hours=2), 13.5, 55.0))

        # 直近1時間 (59分前〜現在まで60点、1分毎): 後半がより強く上昇する加速度正のデータ
        for idx in range(60):
            dt = self.now - timedelta(minutes=59 - idx)
            # 前半0.02/分、後半0.08/分 → 上昇加速中
            if idx <= 30:
                temp = 14.0 + 0.02 * idx
            else:
                temp = 14.6 + 0.08 * (idx - 30)
            records.append(make_record(dt, round(temp, 4), 50.0))

        result = analyze_data_comprehensive(records, now=self.now)

        # 直近1h変化: 16.92 - 14.0 = 2.92
        self.assertEqual(result["trends"]["change_rate_1h"], 2.92)
        # 直近3h変化: 16.92 - 13.0 = 3.92
        self.assertEqual(result["trends"]["total_change_3h"], 3.92)
        self.assertEqual(result["trends"]["change_rate_3h"], 1.31)
        # 加速度: first_half=(14.6 - 14.0)=0.6, second_half=(16.92 - 14.6)=2.32, diff=1.72
        self.assertEqual(result["trends"]["acceleration"], 1.72)
        self.assertEqual(result["trends"]["acceleration_status"], "上昇加速中")
        self.assertIn("predicted_temp_1h", result["trends"])
        self.assertGreater(result["trends"]["predicted_change_1h"], 0)

        # 前日比: 最新 16.92 - 昨日同時刻 12.0 = 4.9
        self.assertEqual(result["patterns"]["vs_yesterday"], 4.9)
        self.assertIn("vs_time_slot_avg", result["patterns"])
        self.assertIn("金", result["patterns"]["weekday_avg"])  # 2026-11-13 は金曜日

    def test_statistics_exact_metrics_and_default_now_invocation(self):
        # 5件で全統計値を手計算と突き合わせる (temp: [10, 12, 14, 16, 18], humid: [40, 50, 60, 70, 80])
        current = datetime.now(JST).replace(second=0, microsecond=0)
        temps = [10.0, 12.0, 14.0, 16.0, 18.0]
        humids = [40.0, 50.0, 60.0, 70.0, 80.0]
        records = [
            make_record(current - timedelta(minutes=(4 - i)), temps[i], humids[i], fmt="%Y-%m-%d %H:%M")
            for i in range(5)
        ]
        # now 引数を省略しても YYYY-MM-DD HH:MM 形式が正しく処理されること
        result = analyze_data_comprehensive(records)

        stats = result["statistics"]
        self.assertEqual(stats["temp_mean"], 14.0)
        self.assertEqual(stats["temp_median"], 14.0)
        self.assertEqual(stats["temp_stdev"], 3.16)
        self.assertEqual(stats["temp_min"], 10.0)
        self.assertEqual(stats["temp_max"], 18.0)
        self.assertEqual(stats["temp_range"], 8.0)
        self.assertEqual(stats["humidity_mean"], 60.0)
        self.assertEqual(stats["humidity_stdev"], 15.8)
        self.assertEqual(stats["temp_25th"], 12.0)
        self.assertEqual(stats["temp_75th"], 16.0)
        self.assertEqual(stats["current_percentile"], 80.0)
        self.assertEqual(stats["current_z_score"], 1.27)
        self.assertEqual(result["anomalies"]["current_status"], "正常範囲")
        # 前日データがない場合は vs_yesterday キーを含めない
        self.assertNotIn("vs_yesterday", result["patterns"])

    def test_vs_yesterday_excludes_records_outside_30min_window(self):
        records = [
            make_record(self.now - timedelta(days=1, minutes=31), 10.0, 50.0),
            make_record(self.now - timedelta(minutes=5), 15.0, 50.0),
        ]
        result = analyze_data_comprehensive(records, now=self.now)
        self.assertNotIn("vs_yesterday", result["patterns"])

    def test_anomalies_rapid_change_and_z_score_status(self):
        records = []
        # 50分間の安定データ (20.0℃) のあと、急上昇(+3.0℃)を起こす -> 急上昇アラートが最新3件に収まる
        start = self.now - timedelta(minutes=100)
        for i in range(60):
            records.append(make_record(start + timedelta(minutes=i), 20.0, 50.0))
        for i in range(60, 65):
            records.append(make_record(start + timedelta(minutes=i), 23.0, 50.0))

        surge_result = analyze_data_comprehensive(records, now=self.now)
        surge_alerts = surge_result["anomalies"]["alerts"]
        self.assertEqual(len(surge_alerts), 3)
        self.assertTrue(all(a["direction"] == "急上昇" and a["change"] == 3.0 for a in surge_alerts))

        # その後急降下させ、最後だけ極端な低温 (15.0℃) にする
        for i in range(65, 99):
            records.append(make_record(start + timedelta(minutes=i), 20.0, 50.0))
        records.append(make_record(start + timedelta(minutes=99), 15.0, 50.0))

        result = analyze_data_comprehensive(records, now=self.now)

        alerts = result["anomalies"]["alerts"]
        self.assertEqual(len(alerts), 3)
        self.assertTrue(all(a["type"] == "rapid_change" for a in alerts))
        self.assertTrue(any(a["direction"] == "急降下" and a["change"] <= -2.0 for a in alerts))
        self.assertLess(result["statistics"]["current_z_score"], -2.5)
        self.assertEqual(result["anomalies"]["current_status"], "非常に異常な気温")

    def test_daily_summary_across_year_boundary_keeps_chronological_order_and_mm_dd(self):
        ref_now = datetime(2026, 1, 3, 12, 0, tzinfo=JST)
        records = []
        # 2025/12/26 から 2026/01/03 まで 9日分のデータ（年なし MM/DD 形式を含む）
        for offset in range(9):
            day_dt = datetime(2025, 12, 26, 9, 0, tzinfo=JST) + timedelta(days=offset)
            records.append(make_record(day_dt, 5.0 + offset, 55.0, fmt="%m/%d %H:%M"))
            records.append(make_record(day_dt + timedelta(hours=5), 10.0 + offset, 45.0, fmt="%Y-%m-%d %H:%M"))

        result = analyze_data_comprehensive(records, now=ref_now)
        summary = result["daily_summary"]

        self.assertEqual(len(summary), 7)
        self.assertEqual(
            [item["date"] for item in summary],
            ["12/28", "12/29", "12/30", "12/31", "01/01", "01/02", "01/03"],
        )
        # 12/28 (offset=2): low=7.0, high=12.0, avg=9.5, range=5.0
        self.assertEqual(summary[0], {
            "date": "12/28",
            "high": 12.0,
            "low": 7.0,
            "avg": 9.5,
            "range": 5.0,
        })
        # 01/03 (offset=8): low=13.0, high=18.0, avg=15.5, range=5.0
        self.assertEqual(summary[-1], {
            "date": "01/03",
            "high": 18.0,
            "low": 13.0,
            "avg": 15.5,
            "range": 5.0,
        })


if __name__ == "__main__":
    unittest.main()
