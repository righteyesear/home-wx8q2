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
    def test_humid_heat_does_not_change_with_forecast_wind(self):
        calm = calculate_feels_like(38, 65, 0)
        windy = calculate_feels_like(38, 65, 5)
        self.assertAlmostEqual(calm, windy, places=6)
        self.assertGreater(calm, 50)

    def test_hot_dry_value_is_not_below_air_temperature(self):
        self.assertGreaterEqual(calculate_feels_like(40, 10, 25), 40)

    def test_inputs_are_bounded(self):
        self.assertTrue(calculate_feels_like(20, 150, -5) < 100)


if __name__ == "__main__":
    unittest.main()
