import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "scripts" / "ai_advisor.py").read_text(encoding="utf-8")
MODULE = ast.parse(SOURCE)
FUNCTION = next(
    node
    for node in MODULE.body
    if isinstance(node, ast.FunctionDef) and node.name == "calculate_feels_like"
)
NAMESPACE = {}
exec(compile(ast.Module(body=[FUNCTION], type_ignores=[]), "<feels-like>", "exec"), NAMESPACE)
calculate_feels_like = NAMESPACE["calculate_feels_like"]


class FeelsLikeTests(unittest.TestCase):
    def test_humid_heat_uses_steadman_apparent_temperature(self):
        calm = calculate_feels_like(38, 65, 0)
        windy = calculate_feels_like(38, 65, 5)
        self.assertGreater(calm, 47)
        self.assertLess(calm, 50)
        self.assertGreater(windy, 44)
        self.assertLess(windy, calm)

    def test_hot_dry_extreme_wind_is_guarded(self):
        result = calculate_feels_like(40, 10, 25)
        self.assertGreaterEqual(result, 32)
        self.assertLessEqual(result, 40)

    def test_inputs_are_bounded(self):
        self.assertTrue(calculate_feels_like(20, 150, -5) < 100)

    def test_hot_extremes_stay_within_model_guardrails(self):
        for temp in (27, 32, 38, 45, 60):
            for humidity in (0, 10, 65, 100, 150):
                for wind in (0, 5, 25, 60):
                    result = calculate_feels_like(temp, humidity, wind)
                    self.assertGreaterEqual(result, temp - 8)
                    self.assertLessEqual(result, temp + 15)

    def test_transition_is_continuous(self):
        for temperatures in ((9.9, 10.0, 10.1), (13.9, 14.0, 14.1)):
            values = [
                calculate_feels_like(temp, 60, 3)
                for temp in temperatures
            ]
            for previous, current in zip(values, values[1:]):
                self.assertLess(abs(current - previous), 0.5)


if __name__ == "__main__":
    unittest.main()
