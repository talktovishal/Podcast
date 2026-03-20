#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Iterable


COST_API_VERSION = "2023-03-01"


@dataclass(frozen=True)
class DailyPoint:
    usage_date: date
    cost: float
    currency: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Report Azure Cost Management totals as daily rows for the last week, "
            "weekly aggregates for the last 30 days, and optional month-by-month totals."
        )
    )
    parser.add_argument("--subscription-id", help="Azure subscription id. Defaults to the active az account.")
    parser.add_argument("--resource-group", help="Optional Azure resource group name to scope the query.")
    parser.add_argument("--daily-days", type=int, default=7, help="Number of UTC days to print in the daily section.")
    parser.add_argument(
        "--weekly-days",
        type=int,
        default=30,
        help="Number of UTC days to include when aggregating the weekly section.",
    )
    parser.add_argument(
        "--include-monthly",
        action="store_true",
        help="Also print month-by-month rollups for the trailing window.",
    )
    parser.add_argument(
        "--monthly-months",
        type=int,
        default=12,
        help="Number of UTC calendar months to include when --include-monthly is set.",
    )
    parser.add_argument(
        "--output",
        choices=("table", "json"),
        default="table",
        help="Print a human-readable table or structured JSON.",
    )
    return parser.parse_args()


def require_positive(value: int, flag: str) -> None:
    if value < 1:
        raise SystemExit(f"{flag} must be >= 1, got {value}")


def run_az_json(args: list[str], error_message: str) -> dict:
    completed = subprocess.run(args, check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        stderr = completed.stderr.strip() or completed.stdout.strip()
        raise SystemExit(f"{error_message}\n{stderr}")
    return json.loads(completed.stdout)


def resolve_subscription_id(explicit_subscription_id: str | None) -> str:
    if explicit_subscription_id:
        return explicit_subscription_id
    account = run_az_json(
        ["az", "account", "show", "--query", "{id:id}", "-o", "json"],
        "Failed to resolve the active Azure subscription. Is `az login` active?",
    )
    subscription_id = account.get("id")
    if not subscription_id:
        raise SystemExit("Azure CLI did not return an active subscription id.")
    return subscription_id


def month_window_start(today_utc: date, monthly_months: int) -> date:
    anchor = today_utc.replace(day=1)
    months_to_step = monthly_months - 1
    year = anchor.year
    month = anchor.month
    while months_to_step > 0:
        month -= 1
        if month == 0:
            month = 12
            year -= 1
        months_to_step -= 1
    return date(year, month, 1)


def daily_window_start(today_utc: date, daily_days: int) -> date:
    return today_utc - timedelta(days=daily_days - 1)


def weekly_window_start(today_utc: date, weekly_days: int) -> date:
    return today_utc - timedelta(days=weekly_days - 1)


def query_daily_costs(subscription_id: str, resource_group: str | None, start_date: date, end_date: date) -> list[DailyPoint]:
    scope = (
        f"/subscriptions/{subscription_id}/resourceGroups/{resource_group}"
        if resource_group
        else f"/subscriptions/{subscription_id}"
    )
    uri = f"https://management.azure.com{scope}/providers/Microsoft.CostManagement/query?api-version={COST_API_VERSION}"
    body = {
        "type": "Usage",
        "timeframe": "Custom",
        "timePeriod": {
            "from": f"{start_date.isoformat()}T00:00:00Z",
            "to": f"{end_date.isoformat()}T23:59:59Z",
        },
        "dataset": {
            "granularity": "Daily",
            "aggregation": {
                "totalCost": {
                    "name": "PreTaxCost",
                    "function": "Sum",
                }
            },
        },
    }
    payload = run_az_json(
        [
            "az",
            "rest",
            "--method",
            "post",
            "--uri",
            uri,
            "--headers",
            "Content-Type=application/json",
            "--body",
            json.dumps(body),
        ],
        "Azure Cost Management query failed.",
    )

    props = payload.get("properties", {})
    rows = props.get("rows", [])
    out: list[DailyPoint] = []
    for row in rows:
        cost, usage_date, currency = row
        usage_dt = datetime.strptime(str(int(usage_date)), "%Y%m%d").date()
        out.append(DailyPoint(usage_date=usage_dt, cost=float(cost), currency=str(currency)))
    return sorted(out, key=lambda item: item.usage_date)


def fill_daily_series(points: Iterable[DailyPoint], start_date: date, end_date: date) -> list[DailyPoint]:
    points_by_day = {point.usage_date: point for point in points}
    currencies = {point.currency for point in points}
    currency = sorted(currencies)[0] if currencies else "USD"
    out: list[DailyPoint] = []
    cursor = start_date
    while cursor <= end_date:
        point = points_by_day.get(cursor)
        out.append(point if point else DailyPoint(usage_date=cursor, cost=0.0, currency=currency))
        cursor += timedelta(days=1)
    return out


def aggregate_by_week(points: Iterable[DailyPoint]) -> list[dict]:
    buckets: dict[date, dict] = {}
    for point in points:
        week_start = point.usage_date - timedelta(days=point.usage_date.weekday())
        bucket = buckets.setdefault(
            week_start,
            {
                "week_start": week_start,
                "week_end": week_start + timedelta(days=6),
                "days": 0,
                "total_cost": 0.0,
                "currency": point.currency,
            },
        )
        bucket["days"] += 1
        bucket["total_cost"] += point.cost
    return [buckets[key] for key in sorted(buckets)]


def aggregate_by_month(points: Iterable[DailyPoint]) -> list[dict]:
    buckets: dict[str, dict] = {}
    for point in points:
        month_key = point.usage_date.strftime("%Y-%m")
        bucket = buckets.setdefault(
            month_key,
            {
                "month": month_key,
                "days": 0,
                "total_cost": 0.0,
                "currency": point.currency,
            },
        )
        bucket["days"] += 1
        bucket["total_cost"] += point.cost
    return [buckets[key] for key in sorted(buckets)]


def format_money(value: float) -> str:
    return f"{value:,.4f}"


def render_table(
    scope_label: str,
    daily_points: list[DailyPoint],
    weekly_buckets: list[dict],
    monthly_buckets: list[dict],
    include_monthly: bool,
    generated_at: datetime,
) -> str:
    today_utc = generated_at.date()
    lines = [
        f"Scope: {scope_label}",
        f"Generated: {generated_at.isoformat().replace('+00:00', 'Z')}",
        f"Billing clock: UTC (today is {today_utc.isoformat()}, which may still be partial)",
        "",
        f"Daily Cost (last {len(daily_points)} UTC days)",
        "Date         Cost (USD)  Notes",
    ]

    for point in daily_points:
        note = "partial" if point.usage_date == today_utc else ""
        lines.append(f"{point.usage_date.isoformat()}  {format_money(point.cost):>10}  {note}")

    lines.extend(
        [
            "",
            f"Weekly Aggregate (last {sum(bucket['days'] for bucket in weekly_buckets)} UTC days, grouped by ISO week)",
            "Week Start  Week End    Days  Cost (USD)  Notes",
        ]
    )
    for bucket in weekly_buckets:
        note = "partial" if bucket["days"] < 7 else ""
        lines.append(
            f"{bucket['week_start'].isoformat()}  {bucket['week_end'].isoformat()}   "
            f"{bucket['days']:>2}/7  {format_money(bucket['total_cost']):>10}  {note}"
        )

    if include_monthly:
        lines.extend(
            [
                "",
                f"Monthly Aggregate (last {len(monthly_buckets)} UTC calendar months)",
                "Month     Days  Cost (USD)  Notes",
            ]
        )
        for bucket in monthly_buckets:
            note = "partial" if bucket["month"] == today_utc.strftime("%Y-%m") else ""
            lines.append(f"{bucket['month']}   {bucket['days']:>3}  {format_money(bucket['total_cost']):>10}  {note}")

    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    require_positive(args.daily_days, "--daily-days")
    require_positive(args.weekly_days, "--weekly-days")
    require_positive(args.monthly_months, "--monthly-months")

    today_utc = datetime.now(UTC).date()
    generated_at = datetime.now(UTC)
    subscription_id = resolve_subscription_id(args.subscription_id)

    start_candidates = [
        daily_window_start(today_utc, args.daily_days),
        weekly_window_start(today_utc, args.weekly_days),
    ]
    if args.include_monthly:
        start_candidates.append(month_window_start(today_utc, args.monthly_months))
    start_date = min(start_candidates)
    end_date = today_utc

    queried_points = query_daily_costs(subscription_id, args.resource_group, start_date, end_date)
    all_points = fill_daily_series(queried_points, start_date, end_date)

    daily_start = daily_window_start(today_utc, args.daily_days)
    weekly_start = weekly_window_start(today_utc, args.weekly_days)
    monthly_start = month_window_start(today_utc, args.monthly_months) if args.include_monthly else None

    daily_points = [point for point in all_points if point.usage_date >= daily_start]
    weekly_points = [point for point in all_points if point.usage_date >= weekly_start]
    monthly_points = [point for point in all_points if monthly_start and point.usage_date >= monthly_start]

    weekly_buckets = aggregate_by_week(weekly_points)
    monthly_buckets = aggregate_by_month(monthly_points) if args.include_monthly and monthly_start else []

    scope_label = (
        f"subscription/{subscription_id}/resourceGroups/{args.resource_group}"
        if args.resource_group
        else f"subscription/{subscription_id}"
    )

    if args.output == "json":
        payload = {
            "generated_at": generated_at.isoformat().replace("+00:00", "Z"),
            "billing_clock": "UTC",
            "scope": {
                "subscription_id": subscription_id,
                "resource_group": args.resource_group,
                "label": scope_label,
            },
            "daily": [
                {
                    "date": point.usage_date.isoformat(),
                    "cost": point.cost,
                    "currency": point.currency,
                    "partial": point.usage_date == today_utc,
                }
                for point in daily_points
            ],
            "weekly": [
                {
                    "week_start": bucket["week_start"].isoformat(),
                    "week_end": bucket["week_end"].isoformat(),
                    "days_covered": bucket["days"],
                    "days_expected": 7,
                    "cost": bucket["total_cost"],
                    "currency": bucket["currency"],
                    "partial": bucket["days"] < 7,
                }
                for bucket in weekly_buckets
            ],
            "monthly": [
                {
                    "month": bucket["month"],
                    "days_covered": bucket["days"],
                    "cost": bucket["total_cost"],
                    "currency": bucket["currency"],
                    "partial": bucket["month"] == today_utc.strftime("%Y-%m"),
                }
                for bucket in monthly_buckets
            ],
        }
        print(json.dumps(payload, indent=2))
        return

    print(render_table(scope_label, daily_points, weekly_buckets, monthly_buckets, args.include_monthly, generated_at))


if __name__ == "__main__":
    main()
