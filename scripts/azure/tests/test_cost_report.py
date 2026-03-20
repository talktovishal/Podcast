from __future__ import annotations

import importlib.util
from datetime import date
from pathlib import Path
import sys
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "cost-report.py"
SPEC = importlib.util.spec_from_file_location("azure_cost_report", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CostReportDeltaTests(unittest.TestCase):
    def test_top_delta_entries_sorts_by_absolute_change(self) -> None:
        current = {"Compute": 4.0, "Storage": 1.0, "Networking": 0.5}
        prior = {"Compute": 1.0, "Storage": 2.5, "Networking": 0.5}

        result = MODULE.top_delta_entries(current, prior, 3)

        self.assertEqual(
            result,
            [
                {
                    "label": "Compute",
                    "delta": 3.0,
                    "current_cost": 4.0,
                    "prior_cost": 1.0,
                },
                {
                    "label": "Storage",
                    "delta": -1.5,
                    "current_cost": 1.0,
                    "prior_cost": 2.5,
                },
            ],
        )

    def test_build_weekly_delta_summary_prefers_latest_full_weeks(self) -> None:
        weekly_cost_maps = {
            date(2026, 3, 3): {
                "week_start": date(2026, 3, 3),
                "week_end": date(2026, 3, 9),
                "days": 7,
                "currency": "USD",
                "service_costs": {"Storage": 1.0},
                "resource_costs": {"disk [Storage]": 1.0},
            },
            date(2026, 3, 10): {
                "week_start": date(2026, 3, 10),
                "week_end": date(2026, 3, 16),
                "days": 7,
                "currency": "USD",
                "service_costs": {"Storage": 1.5},
                "resource_costs": {"disk [Storage]": 1.5},
            },
            date(2026, 3, 17): {
                "week_start": date(2026, 3, 17),
                "week_end": date(2026, 3, 23),
                "days": 3,
                "currency": "USD",
                "service_costs": {"Storage": 0.6},
                "resource_costs": {"disk [Storage]": 0.6},
            },
        }
        weekly_buckets = [
            {
                "week_start": date(2026, 3, 3),
                "week_end": date(2026, 3, 9),
                "days": 7,
                "total_cost": 1.0,
                "currency": "USD",
            },
            {
                "week_start": date(2026, 3, 10),
                "week_end": date(2026, 3, 16),
                "days": 7,
                "total_cost": 1.5,
                "currency": "USD",
            },
            {
                "week_start": date(2026, 3, 17),
                "week_end": date(2026, 3, 23),
                "days": 3,
                "total_cost": 0.6,
                "currency": "USD",
            },
        ]

        result = MODULE.build_weekly_delta_summary(weekly_cost_maps, weekly_buckets, 3)

        assert result is not None
        self.assertEqual(result["current_week_start"], date(2026, 3, 10))
        self.assertEqual(result["prior_week_start"], date(2026, 3, 3))
        self.assertAlmostEqual(result["total_delta"], 0.5)
        self.assertEqual(
            result["services"],
            [
                {
                    "label": "Storage",
                    "delta": 0.5,
                    "current_cost": 1.5,
                    "prior_cost": 1.0,
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
