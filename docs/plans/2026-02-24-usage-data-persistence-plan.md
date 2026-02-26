# Usage Data Persistence + Custom Date Range — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist daily usage cost snapshots from OpenClaw CLI into MongoDB so historical data survives CLI purges, and add custom date range selection to the Usage page.

**Architecture:** Background asyncio task on server startup backfills 90 days of usage data and then upserts hourly. The `/usage/cost` endpoint reads from MongoDB instead of CLI. Frontend adds a "Custom" date range picker alongside existing preset buttons.

**Tech Stack:** FastAPI, Motor (MongoDB async), asyncio, React, native HTML date inputs

---

### Task 1: Create unique index on `daily_usage` collection at startup

**Files:**
- Modify: `backend/server.py:32-42` (startup handler)

**Step 1: Add index creation to startup**

In `server.py`, inside `set_db()`, add after `app.state.db = db`:

```python
await db.daily_usage.create_index("date", unique=True)
```

**Step 2: Verify server starts without error**

Run: `cd backend && python -c "from server import app; print('OK')"`
Expected: `OK` (no import errors)

**Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat(usage): create unique index on daily_usage collection"
```

---

### Task 2: Add background usage collector

**Files:**
- Modify: `backend/server.py:32-42` (startup handler)
- Modify: `backend/gateway_cli.py:152-157` (add `usage_cost_raw` bypassing cache)

**Step 1: Add `usage_cost_raw` to gateway_cli.py**

After `usage_cost` method in `gateway_cli.py`, add a method that bypasses the CLICache (the collector needs fresh data, not cached):

```python
async def usage_cost_raw(self, days=30):
    return await self._run("gateway", "usage-cost", "--days", str(days), timeout=60)
```

**Step 2: Add collector function in server.py**

After the `set_db` function, add:

```python
async def _usage_collector():
    """Background task: backfill 90d on start, then upsert hourly."""
    logger = logging.getLogger("usage_collector")

    # Backfill on startup
    try:
        data = await gateway.usage_cost_raw(days=90)
        daily = data.get("daily", []) if isinstance(data, dict) else []
        for d in daily:
            if not d.get("date"):
                continue
            await db.daily_usage.update_one(
                {"date": d["date"]},
                {"$set": {**d, "updated_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True,
            )
        logger.info(f"Backfilled {len(daily)} daily usage records")
    except Exception as e:
        logger.warning(f"Usage backfill failed: {e}")

    # Hourly loop
    while True:
        await asyncio.sleep(3600)
        try:
            data = await gateway.usage_cost_raw(days=1)
            daily = data.get("daily", []) if isinstance(data, dict) else []
            for d in daily:
                if not d.get("date"):
                    continue
                await db.daily_usage.update_one(
                    {"date": d["date"]},
                    {"$set": {**d, "updated_at": datetime.now(timezone.utc).isoformat()}},
                    upsert=True,
                )
        except Exception as e:
            logger.warning(f"Usage hourly sync failed: {e}")
```

**Step 3: Launch collector in startup**

In `set_db()`, after the warmup task:

```python
asyncio.create_task(_usage_collector())
```

**Step 4: Verify server starts without error**

Run: `cd backend && python -c "from server import app; print('OK')"`
Expected: `OK`

**Step 5: Commit**

```bash
git add backend/server.py backend/gateway_cli.py
git commit -m "feat(usage): add background collector with 90d backfill and hourly sync"
```

---

### Task 3: Update `/usage/cost` to read from MongoDB with date range support

**Files:**
- Modify: `backend/server.py:891-898` (usage cost endpoint)

**Step 1: Rewrite the endpoint**

Replace the existing `get_usage_cost` function:

```python
@api_router.get("/usage/cost")
async def get_usage_cost(
    days: int = Query(None, ge=1, le=90),
    start: str = Query(None),
    end: str = Query(None),
    user=Depends(get_current_user),
):
    # Determine date range
    if start and end:
        date_start, date_end = start, end
    else:
        d = days or 30
        date_end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        date_start = (datetime.now(timezone.utc) - __import__("datetime").timedelta(days=d - 1)).strftime("%Y-%m-%d")

    # Read from MongoDB
    records = await db.daily_usage.find(
        {"date": {"$gte": date_start, "$lte": date_end}},
        {"_id": 0, "updated_at": 0},
    ).sort("date", 1).to_list(None)

    if records:
        totals = {
            "totalTokens": sum(r.get("totalTokens", 0) for r in records),
            "totalCost": sum(r.get("totalCost", 0) for r in records),
        }
        return {"daily": records, "totals": totals}

    # Fallback to CLI if MongoDB is empty
    if not start:
        try:
            return await gateway.usage_cost(days or 30)
        except Exception:
            pass

    return {"daily": [], "totals": {"totalTokens": 0, "totalCost": 0}}
```

**Step 2: Verify server starts**

Run: `cd backend && python -c "from server import app; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat(usage): read cost data from MongoDB with start/end date support"
```

---

### Task 4: Update `/usage/breakdown` to support date range params

**Files:**
- Modify: `backend/server.py:901-943` (usage breakdown endpoint)

**Step 1: Update endpoint signature and date logic**

Replace the existing function with:

```python
@api_router.get("/usage/breakdown")
async def get_usage_breakdown(
    days: int = Query(None, ge=1, le=90),
    start: str = Query(None),
    end: str = Query(None),
    user=Depends(get_current_user),
):
    if start and end:
        match = {"event_type": "llm_request", "timestamp": {"$gte": start, "$lte": end}}
    else:
        d = days or 30
        cutoff = datetime.now(timezone.utc).timestamp() - (d * 86400)
        cutoff_iso = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()
        match = {"event_type": "llm_request", "timestamp": {"$gte": cutoff_iso}}

    # ... rest of aggregation pipelines unchanged ...
```

**Step 2: Commit**

```bash
git add backend/server.py
git commit -m "feat(usage): add start/end date params to breakdown endpoint"
```

---

### Task 5: Update frontend API functions for date range

**Files:**
- Modify: `frontend/src/lib/api.js:50-51`

**Step 1: Update API functions**

Replace the two usage functions:

```javascript
export const getUsageCost = (params = {}) => {
  const q = new URLSearchParams();
  if (params.start && params.end) {
    q.set('start', params.start);
    q.set('end', params.end);
  } else {
    q.set('days', String(params.days || 30));
  }
  return api.get(`/usage/cost?${q.toString()}`);
};

export const getUsageBreakdown = (params = {}) => {
  const q = new URLSearchParams();
  if (params.start && params.end) {
    q.set('start', params.start);
    q.set('end', params.end);
  } else {
    q.set('days', String(params.days || 30));
  }
  return api.get(`/usage/breakdown?${q.toString()}`);
};
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat(usage): update API functions to support date range params"
```

---

### Task 6: Add custom date range picker to UsagePage

**Files:**
- Modify: `frontend/src/pages/UsagePage.js`

**Step 1: Update state and load function**

Replace the existing state/load logic (lines 92-114):

```javascript
export default function UsagePage() {
  const [costData, setCostData] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [customRange, setCustomRange] = useState(null); // { start, end } or null
  const [showCustom, setShowCustom] = useState(false);
  const [tempStart, setTempStart] = useState('');
  const [tempEnd, setTempEnd] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = customRange
        ? { start: customRange.start, end: customRange.end }
        : { days };
      const [costRes, breakdownRes] = await Promise.all([
        getUsageCost(params),
        getUsageBreakdown(params),
      ]);
      setCostData(costRes.data);
      setBreakdown(breakdownRes.data);
    } catch (e) {
      toast.error('Failed to load usage data');
    } finally {
      setLoading(false);
    }
  }, [days, customRange]);

  useEffect(() => { load(); }, [load]);

  const selectPreset = (d) => {
    setCustomRange(null);
    setShowCustom(false);
    setDays(d);
  };

  const applyCustomRange = () => {
    if (tempStart && tempEnd && tempStart <= tempEnd) {
      setCustomRange({ start: tempStart, end: tempEnd });
      setDays(null);
      setShowCustom(false);
    }
  };
```

**Step 2: Update the period selector UI**

Replace the existing period selector div (lines 155-169) with:

```jsx
<div className="flex items-center gap-2">
  <div className="flex items-center gap-1 bg-surface-card border border-subtle rounded-lg p-1">
    {PERIOD_OPTIONS.map(opt => (
      <button
        key={opt.value}
        onClick={() => selectPreset(opt.value)}
        className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
          days === opt.value && !customRange
            ? 'bg-orange-500/20 text-orange-500 border border-orange-500/30'
            : 'text-theme-dimmed hover:text-theme-secondary'
        }`}
      >
        {opt.label}
      </button>
    ))}
    <button
      onClick={() => setShowCustom(!showCustom)}
      className={`px-3 py-1.5 text-xs font-mono rounded transition-all ${
        customRange
          ? 'bg-orange-500/20 text-orange-500 border border-orange-500/30'
          : 'text-theme-dimmed hover:text-theme-secondary'
      }`}
    >
      Custom
    </button>
  </div>
  {showCustom && (
    <div className="flex items-center gap-2 bg-surface-card border border-subtle rounded-lg p-2">
      <input
        type="date"
        value={tempStart}
        onChange={(e) => setTempStart(e.target.value)}
        className="bg-transparent border border-subtle rounded px-2 py-1 text-xs font-mono text-theme-secondary focus:border-orange-500/50 outline-none"
      />
      <span className="text-theme-faint text-xs">to</span>
      <input
        type="date"
        value={tempEnd}
        onChange={(e) => setTempEnd(e.target.value)}
        className="bg-transparent border border-subtle rounded px-2 py-1 text-xs font-mono text-theme-secondary focus:border-orange-500/50 outline-none"
      />
      <button
        onClick={applyCustomRange}
        disabled={!tempStart || !tempEnd || tempStart > tempEnd}
        className="px-3 py-1 text-xs font-mono rounded bg-orange-500/20 text-orange-500 border border-orange-500/30 hover:bg-orange-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Apply
      </button>
    </div>
  )}
</div>
```

**Step 3: Commit**

```bash
git add frontend/src/pages/UsagePage.js
git commit -m "feat(usage): add custom date range picker to Usage page"
```

---

### Task 7: Update frontend tests

**Files:**
- Modify: `frontend/src/pages/UsagePage.test.js`

**Step 1: Update mock API call signatures**

The API functions now take objects instead of numbers. Update `beforeEach`:

```javascript
beforeEach(() => {
  mockGetUsageCost = jest.fn().mockResolvedValue({ data: mockCostData });
  mockGetUsageBreakdown = jest.fn().mockResolvedValue({ data: mockBreakdownData });
});
```

**Step 2: Update assertion in "defaults to 30d"**

```javascript
it('defaults to 30d period', async () => {
  render(<UsagePage />);
  await waitFor(() => {
    expect(screen.getByTestId('usage-page')).toBeInTheDocument();
  });
  expect(mockGetUsageCost).toHaveBeenCalledWith({ days: 30 });
  expect(mockGetUsageBreakdown).toHaveBeenCalledWith({ days: 30 });
});
```

**Step 3: Update assertion in "switches to Today"**

```javascript
it('switches to Today period and fetches days=1', async () => {
  render(<UsagePage />);
  await waitFor(() => {
    expect(screen.getByTestId('usage-page')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText('Today'));
  await waitFor(() => {
    expect(mockGetUsageCost).toHaveBeenCalledWith({ days: 1 });
    expect(mockGetUsageBreakdown).toHaveBeenCalledWith({ days: 1 });
  });
});
```

**Step 4: Update assertion in "switches to 7d"**

```javascript
it('switches to 7d period', async () => {
  render(<UsagePage />);
  await waitFor(() => {
    expect(screen.getByTestId('usage-page')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText('7d'));
  await waitFor(() => {
    expect(mockGetUsageCost).toHaveBeenCalledWith({ days: 7 });
  });
});
```

**Step 5: Add test for Custom button rendering**

```javascript
it('renders Custom button in period selector', async () => {
  render(<UsagePage />);
  await waitFor(() => {
    expect(screen.getByTestId('usage-page')).toBeInTheDocument();
  });
  expect(screen.getByText('Custom')).toBeInTheDocument();
});
```

**Step 6: Add test for custom date range picker toggle**

```javascript
it('shows date inputs when Custom is clicked', async () => {
  render(<UsagePage />);
  await waitFor(() => {
    expect(screen.getByTestId('usage-page')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText('Custom'));
  expect(screen.getByText('to')).toBeInTheDocument();
  expect(screen.getByText('Apply')).toBeInTheDocument();
});
```

**Step 7: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=UsagePage --watchAll=false`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add frontend/src/pages/UsagePage.test.js
git commit -m "test(usage): update tests for date range picker and object params"
```

---

## Task Summary

| Task | What | Files |
|------|------|-------|
| 1 | MongoDB unique index | `backend/server.py` |
| 2 | Background collector (backfill + hourly) | `backend/server.py`, `backend/gateway_cli.py` |
| 3 | `/usage/cost` reads from MongoDB + date range | `backend/server.py` |
| 4 | `/usage/breakdown` date range support | `backend/server.py` |
| 5 | Frontend API functions for date range | `frontend/src/lib/api.js` |
| 6 | Custom date range picker UI | `frontend/src/pages/UsagePage.js` |
| 7 | Update frontend tests | `frontend/src/pages/UsagePage.test.js` |
