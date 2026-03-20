#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Iterable


COST_API_VERSION = "2023-03-01"


@dataclass(frozen=True)
class DailyPoint:
    usage_date: date
    cost: float
    currency: str


@dataclass(frozen=True)
class DetailedPoint:
    usage_date: date
    cost: float
    currency: str
    resource_id: str
    service_name: str
    meter_name: str


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
    parser.add_argument(
        "--include-breakdown",
        action="store_true",
        help="Include top service and resource breakdowns for daily and weekly sections.",
    )
    parser.add_argument(
        "--breakdown-top",
        type=int,
        default=5,
        help="Maximum number of service/resource rows to print for each day/week when --include-breakdown is set.",
    )
    return parser.parse_args()


def require_positive(value: int, flag: str) -> None:
    if value < 1:
        raise SystemExit(f"{flag} must be >= 1, got {value}")


def run_az_json(args: list[str], error_message: str) -> dict:
    attempts = 5
    last_error = ""
    for attempt in range(1, attempts + 1):
        completed = subprocess.run(args, check=False, capture_output=True, text=True)
        if completed.returncode == 0:
            return json.loads(completed.stdout)

        stderr = completed.stderr.strip() or completed.stdout.strip()
        last_error = stderr
        if "Too Many Requests" in stderr or '"code":"429"' in stderr or "ERROR: 429" in stderr:
            if attempt < attempts:
                time.sleep(2 * attempt)
                continue
        raise SystemExit(f"{error_message}\n{stderr}")

    raise SystemExit(f"{error_message}\n{last_error}")


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


def query_detailed_costs(
    subscription_id: str,
    resource_group: str | None,
    start_date: date,
    end_date: date,
) -> list[DetailedPoint]:
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
            "grouping": [
                {"type": "Dimension", "name": "ResourceId"},
                {"type": "Dimension", "name": "ServiceName"},
                {"type": "Dimension", "name": "Meter"},
            ],
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
        "Azure Cost Management detailed query failed.",
    )

    props = payload.get("properties", {})
    rows = props.get("rows", [])
    out: list[DetailedPoint] = []
    for row in rows:
        cost, usage_date, resource_id, service_name, meter_name, currency = row
        usage_dt = datetime.strptime(str(int(usage_date)), "%Y%m%d").date()
        out.append(
            DetailedPoint(
                usage_date=usage_dt,
                cost=float(cost),
                currency=str(currency),
                resource_id=str(resource_id or ""),
                service_name=str(service_name or ""),
                meter_name=str(meter_name or ""),
            )
        )
    return sorted(out, key=lambda item: (item.usage_date, item.service_name, item.resource_id, item.meter_name))


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


def resource_label(resource_id: str) -> str:
    if not resource_id:
        return "(unattributed)"
    trimmed = resource_id.rstrip("/")
    if not trimmed:
        return "(unattributed)"
    return trimmed.split("/")[-1]


def top_breakdown_entries(entries: dict[str, float], top_n: int) -> list[dict]:
    return [
        {"label": label, "cost": cost}
        for label, cost in sorted(entries.items(), key=lambda item: (-item[1], item[0]))[:top_n]
    ]


def top_delta_entries(current_entries: dict[str, float], prior_entries: dict[str, float], top_n: int) -> list[dict]:
    labels = set(current_entries) | set(prior_entries)
    out: list[dict] = []
    for label in labels:
        current_cost = current_entries.get(label, 0.0)
        prior_cost = prior_entries.get(label, 0.0)
        delta = current_cost - prior_cost
        if abs(delta) < 1e-9:
            continue
        out.append(
            {
                "label": label,
                "delta": delta,
                "current_cost": current_cost,
                "prior_cost": prior_cost,
            }
        )
    return sorted(out, key=lambda item: (-abs(item["delta"]), item["label"]))[:top_n]


def build_daily_breakdowns(points: Iterable[DetailedPoint], expected_dates: Iterable[date], top_n: int) -> list[dict]:
    by_day_service: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    by_day_resource: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    by_day_currency: dict[date, str] = {}

    for point in points:
        by_day_currency.setdefault(point.usage_date, point.currency)
        service_label = point.service_name or "(unknown service)"
        resource_name = resource_label(point.resource_id)
        resource_grouped_label = f"{resource_name} [{service_label}]"
        by_day_service[point.usage_date][service_label] += point.cost
        by_day_resource[point.usage_date][resource_grouped_label] += point.cost

    out = []
    for usage_date in sorted(set(expected_dates) | set(by_day_service) | set(by_day_resource)):
        out.append(
            {
                "date": usage_date,
                "currency": by_day_currency.get(usage_date, "USD"),
                "services": top_breakdown_entries(by_day_service.get(usage_date, {}), top_n),
                "resources": top_breakdown_entries(by_day_resource.get(usage_date, {}), top_n),
            }
        )
    return out


def build_weekly_cost_maps(points: Iterable[DetailedPoint]) -> dict[date, dict]:
    by_week_service: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    by_week_resource: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    by_week_days: dict[date, set[date]] = defaultdict(set)
    by_week_currency: dict[date, str] = {}

    for point in points:
        week_start = point.usage_date - timedelta(days=point.usage_date.weekday())
        by_week_currency.setdefault(week_start, point.currency)
        by_week_days[week_start].add(point.usage_date)
        service_label = point.service_name or "(unknown service)"
        resource_name = resource_label(point.resource_id)
        resource_grouped_label = f"{resource_name} [{service_label}]"
        by_week_service[week_start][service_label] += point.cost
        by_week_resource[week_start][resource_grouped_label] += point.cost

    out: dict[date, dict] = {}
    for week_start in sorted(set(by_week_service) | set(by_week_resource)):
        out[week_start] = {
            "week_start": week_start,
            "week_end": week_start + timedelta(days=6),
            "days": len(by_week_days.get(week_start, set())),
            "currency": by_week_currency.get(week_start, "USD"),
            "service_costs": dict(by_week_service.get(week_start, {})),
            "resource_costs": dict(by_week_resource.get(week_start, {})),
        }
    return out


def build_weekly_breakdowns(points: Iterable[DetailedPoint], expected_week_starts: Iterable[date], top_n: int) -> list[dict]:
    weekly_cost_maps = build_weekly_cost_maps(points)
    out = []
    for week_start in sorted(set(expected_week_starts) | set(weekly_cost_maps)):
        weekly_map = weekly_cost_maps.get(week_start, {})
        out.append(
            {
                "week_start": week_start,
                "week_end": week_start + timedelta(days=6),
                "days": weekly_map.get("days", 0),
                "currency": weekly_map.get("currency", "USD"),
                "services": top_breakdown_entries(weekly_map.get("service_costs", {}), top_n),
                "resources": top_breakdown_entries(weekly_map.get("resource_costs", {}), top_n),
            }
        )
    return out


def select_weekly_delta_pair(weekly_buckets: list[dict]) -> tuple[dict, dict] | None:
    full_weeks = [bucket for bucket in weekly_buckets if bucket["days"] == 7]
    if len(full_weeks) >= 2:
        return full_weeks[-1], full_weeks[-2]
    if len(weekly_buckets) >= 2:
        return weekly_buckets[-1], weekly_buckets[-2]
    return None


def build_weekly_delta_summary(weekly_cost_maps: dict[date, dict], weekly_buckets: list[dict], top_n: int) -> dict | None:
    pair = select_weekly_delta_pair(weekly_buckets)
    if not pair:
        return None

    current_bucket, prior_bucket = pair
    current_breakdown = weekly_cost_maps.get(current_bucket["week_start"])
    prior_breakdown = weekly_cost_maps.get(prior_bucket["week_start"])
    if not current_breakdown or not prior_breakdown:
        return None

    return {
        "current_week_start": current_bucket["week_start"],
        "current_week_end": current_bucket["week_end"],
        "current_days": current_bucket["days"],
        "prior_week_start": prior_bucket["week_start"],
        "prior_week_end": prior_bucket["week_end"],
        "prior_days": prior_bucket["days"],
        "currency": current_bucket["currency"],
        "total_delta": current_bucket["total_cost"] - prior_bucket["total_cost"],
        "services": top_delta_entries(
            current_breakdown.get("service_costs", {}),
            prior_breakdown.get("service_costs", {}),
            top_n,
        ),
        "resources": top_delta_entries(
            current_breakdown.get("resource_costs", {}),
            prior_breakdown.get("resource_costs", {}),
            top_n,
        ),
    }


def format_money(value: float) -> str:
    return f"{value:,.4f}"


def format_signed_money(value: float) -> str:
    return f"{value:+,.4f}"


def render_table(
    scope_label: str,
    daily_points: list[DailyPoint],
    weekly_buckets: list[dict],
    monthly_buckets: list[dict],
    include_monthly: bool,
    include_breakdown: bool,
    breakdown_top: int,
    daily_breakdowns: list[dict],
    weekly_breakdowns: list[dict],
    weekly_delta_summary: dict | None,
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

    if include_breakdown:
        lines.extend(
            [
                "",
                f"Daily Breakdown (top {breakdown_top} services/resources for each UTC day)",
            ]
        )
        for breakdown in daily_breakdowns:
            lines.append(f"{breakdown['date'].isoformat()}:")
            lines.append("  Services:")
            if breakdown["services"]:
                for entry in breakdown["services"]:
                    lines.append(f"    - {entry['label']}: {format_money(entry['cost'])}")
            else:
                lines.append("    - none")
            lines.append("  Resources:")
            if breakdown["resources"]:
                for entry in breakdown["resources"]:
                    lines.append(f"    - {entry['label']}: {format_money(entry['cost'])}")
            else:
                lines.append("    - none")

        lines.extend(
            [
                "",
                f"Weekly Breakdown (top {breakdown_top} services/resources for each ISO week)",
            ]
        )
        for breakdown in weekly_breakdowns:
            partial_note = " partial" if breakdown["days"] < 7 else ""
            lines.append(
                f"{breakdown['week_start'].isoformat()}..{breakdown['week_end'].isoformat()} "
                f"({breakdown['days']}/7 days){partial_note}:"
            )
            lines.append("  Services:")
            if breakdown["services"]:
                for entry in breakdown["services"]:
                    lines.append(f"    - {entry['label']}: {format_money(entry['cost'])}")
            else:
                lines.append("    - none")
            lines.append("  Resources:")
            if breakdown["resources"]:
                for entry in breakdown["resources"]:
                    lines.append(f"    - {entry['label']}: {format_money(entry['cost'])}")
            else:
                lines.append("    - none")

        lines.extend(
            [
                "",
                f"Weekly Delta vs Prior Week (top {breakdown_top} service/resource movers)",
            ]
        )
        if weekly_delta_summary:
            current_partial = " partial" if weekly_delta_summary["current_days"] < 7 else ""
            prior_partial = " partial" if weekly_delta_summary["prior_days"] < 7 else ""
            lines.append(
                "Comparing "
                f"{weekly_delta_summary['current_week_start'].isoformat()}..{weekly_delta_summary['current_week_end'].isoformat()} "
                f"({weekly_delta_summary['current_days']}/7 days){current_partial} "
                f"to {weekly_delta_summary['prior_week_start'].isoformat()}..{weekly_delta_summary['prior_week_end'].isoformat()} "
                f"({weekly_delta_summary['prior_days']}/7 days){prior_partial}"
            )
            lines.append(f"Total delta: {format_signed_money(weekly_delta_summary['total_delta'])}")
            lines.append("  Services:")
            if weekly_delta_summary["services"]:
                for entry in weekly_delta_summary["services"]:
                    lines.append(
                        "    - "
                        f"{entry['label']}: {format_signed_money(entry['delta'])} "
                        f"(current {format_money(entry['current_cost'])} vs prior {format_money(entry['prior_cost'])})"
                    )
            else:
                lines.append("    - none")
            lines.append("  Resources:")
            if weekly_delta_summary["resources"]:
                for entry in weekly_delta_summary["resources"]:
                    lines.append(
                        "    - "
                        f"{entry['label']}: {format_signed_money(entry['delta'])} "
                        f"(current {format_money(entry['current_cost'])} vs prior {format_money(entry['prior_cost'])})"
                    )
            else:
                lines.append("    - none")
        else:
            lines.append("Not enough weekly data to compare against a prior week.")

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
    require_positive(args.breakdown_top, "--breakdown-top")

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
    detailed_points = query_detailed_costs(subscription_id, args.resource_group, start_date, end_date) if args.include_breakdown else []

    daily_start = daily_window_start(today_utc, args.daily_days)
    weekly_start = weekly_window_start(today_utc, args.weekly_days)
    monthly_start = month_window_start(today_utc, args.monthly_months) if args.include_monthly else None

    daily_points = [point for point in all_points if point.usage_date >= daily_start]
    weekly_points = [point for point in all_points if point.usage_date >= weekly_start]
    monthly_points = [point for point in all_points if monthly_start and point.usage_date >= monthly_start]

    weekly_buckets = aggregate_by_week(weekly_points)
    monthly_buckets = aggregate_by_month(monthly_points) if args.include_monthly and monthly_start else []
    daily_detailed_points = [point for point in detailed_points if point.usage_date >= daily_start]
    weekly_detailed_points = [point for point in detailed_points if point.usage_date >= weekly_start]
    daily_breakdowns = (
        build_daily_breakdowns(daily_detailed_points, [point.usage_date for point in daily_points], args.breakdown_top)
        if args.include_breakdown
        else []
    )
    weekly_breakdowns = (
        build_weekly_breakdowns(weekly_detailed_points, [bucket["week_start"] for bucket in weekly_buckets], args.breakdown_top)
        if args.include_breakdown
        else []
    )
    weekly_cost_maps = build_weekly_cost_maps(weekly_detailed_points) if args.include_breakdown else {}
    weekly_delta_summary = (
        build_weekly_delta_summary(weekly_cost_maps, weekly_buckets, args.breakdown_top)
        if args.include_breakdown
        else None
    )

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
            "daily_breakdown": [
                {
                    "date": breakdown["date"].isoformat(),
                    "currency": breakdown["currency"],
                    "services": breakdown["services"],
                    "resources": breakdown["resources"],
                }
                for breakdown in daily_breakdowns
            ],
            "weekly_breakdown": [
                {
                    "week_start": breakdown["week_start"].isoformat(),
                    "week_end": breakdown["week_end"].isoformat(),
                    "days_covered": breakdown["days"],
                    "currency": breakdown["currency"],
                    "services": breakdown["services"],
                    "resources": breakdown["resources"],
                }
                for breakdown in weekly_breakdowns
            ],
            "weekly_delta_vs_prior": (
                {
                    "current_week_start": weekly_delta_summary["current_week_start"].isoformat(),
                    "current_week_end": weekly_delta_summary["current_week_end"].isoformat(),
                    "current_days_covered": weekly_delta_summary["current_days"],
                    "prior_week_start": weekly_delta_summary["prior_week_start"].isoformat(),
                    "prior_week_end": weekly_delta_summary["prior_week_end"].isoformat(),
                    "prior_days_covered": weekly_delta_summary["prior_days"],
                    "currency": weekly_delta_summary["currency"],
                    "total_delta": weekly_delta_summary["total_delta"],
                    "services": weekly_delta_summary["services"],
                    "resources": weekly_delta_summary["resources"],
                }
                if weekly_delta_summary
                else None
            ),
        }
        print(json.dumps(payload, indent=2))
        return

    print(
        render_table(
            scope_label,
            daily_points,
            weekly_buckets,
            monthly_buckets,
            args.include_monthly,
            args.include_breakdown,
            args.breakdown_top,
            daily_breakdowns,
            weekly_breakdowns,
            weekly_delta_summary,
            generated_at,
        )
    )


if __name__ == "__main__":
    main()
