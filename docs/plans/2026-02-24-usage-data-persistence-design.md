# Usage Data Persistence + Custom Date Range

## Problem

The Usage page reads daily cost/token data from `openclaw gateway usage-cost` CLI on every request. If OpenClaw purges historical data, we lose it permanently. The `agent_activities` breakdown data in MongoDB is separate and lacks cost information.

## Solution

Persist daily usage snapshots in MongoDB. Add custom date range selection to the frontend.

## Data Model

New collection: `daily_usage`

```json
{
  "date": "2026-02-24",
  "input": 125000,
  "output": 83000,
  "cacheRead": 12000,
  "cacheWrite": 5000,
  "totalTokens": 225000,
  "totalCost": 4.50,
  "updated_at": "2026-02-24T12:00:00Z"
}
```

- Unique index on `date`
- Field names match CLI output directly

## Background Collector

- Runs as `asyncio.create_task()` on server startup (same pattern as warmup)
- **Backfill on start**: `usage-cost --days 90` → upsert all daily records
- **Hourly loop**: `usage-cost --days 1` → upsert current day
- Errors are logged but never crash the server

## API Changes

### `GET /api/usage/cost`

Query params (mutually exclusive):
- `days=30` — existing behavior
- `start=2026-01-01&end=2026-02-24` — custom date range (new)

Logic:
1. Read from `daily_usage` collection (filter by date range)
2. Compute totals in Python
3. Fallback to CLI if MongoDB has no data

### `GET /api/usage/breakdown`

Same change to support `start`/`end` params alongside `days`. No other changes.

## Frontend Changes

- Keep existing preset buttons (Today, 7d, 14d, 30d, 60d)
- Add "Custom" button that opens a date range picker (start + end date inputs)
- When custom range selected, send `?start=...&end=...` instead of `?days=...`
- Dark-themed date inputs matching existing design system
