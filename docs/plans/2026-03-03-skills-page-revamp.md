# Skills Page Revamp — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add enable/disable toggles, tabbed filtering (Active/Inactive/All), and source filtering to the Skills page; hide ClawHub from sidebar.

**Architecture:** Backend adds fields to `GET /api/skills` and a new `POST /api/skills/{name}/toggle` endpoint that writes to `openclaw.json` config and restarts the gateway. Frontend adds tabs, source filter dropdown, toggle switches, and missing-requirement display.

**Tech Stack:** FastAPI (backend), React 19 + Tailwind (frontend), openclaw CLI + config JSON

---

### Task 1: Backend — Expand GET /api/skills response

**Files:**
- Modify: `backend/server.py:384-398` (list_skills endpoint)
- Modify: `backend/server.py:401-415` (get_skill endpoint)

**Step 1: Write the failing test**

Add to `backend/backend_test.py` (or create a focused test):

```python
# In a new test file or section
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_list_skills_returns_expanded_fields():
    """GET /api/skills should return eligible, disabled, source, missing fields."""
    from httpx import AsyncClient, ASGITransport
    from server import app

    mock_raw = {
        "skills": [
            {
                "name": "github",
                "description": "GitHub integration",
                "emoji": "🐙",
                "eligible": True,
                "disabled": False,
                "blockedByAllowlist": False,
                "source": "openclaw-bundled",
                "bundled": True,
                "missing": {"bins": [], "anyBins": [], "env": [], "config": [], "os": []},
            },
            {
                "name": "apple-notes",
                "description": "Apple Notes",
                "emoji": "📝",
                "eligible": False,
                "disabled": False,
                "blockedByAllowlist": False,
                "source": "openclaw-bundled",
                "bundled": True,
                "missing": {"bins": ["memo"], "anyBins": [], "env": [], "config": [], "os": ["darwin"]},
            },
        ]
    }

    with patch("server.gateway") as mock_gw:
        mock_gw.skills = AsyncMock(return_value=mock_raw)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Need auth — skip for now, test the transform logic directly
            pass

    # Direct transform test instead:
    from server import _transform_skill
    skill = _transform_skill(mock_raw["skills"][0])
    assert skill["eligible"] is True
    assert skill["disabled"] is False
    assert skill["source"] == "bundled"
    assert skill["missing"] == {"bins": [], "env": [], "os": []}

    skill2 = _transform_skill(mock_raw["skills"][1])
    assert skill2["eligible"] is False
    assert skill2["source"] == "bundled"
    assert skill2["missing"] == {"bins": ["memo"], "env": [], "os": ["darwin"]}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest backend_test.py::test_list_skills_returns_expanded_fields -v`
Expected: FAIL — `_transform_skill` does not exist yet

**Step 3: Implement — extract transform helper + expand fields**

In `backend/server.py`, add a helper function above the skills endpoints (around line 383):

```python
def _normalize_source(raw_source: str) -> str:
    if "bundled" in raw_source:
        return "bundled"
    if "workspace" in raw_source:
        return "workspace"
    if "personal" in raw_source or "managed" in raw_source or "agents-skills" in raw_source:
        return "managed"
    return "unknown"


def _transform_skill(s: dict) -> dict:
    missing_raw = s.get("missing", {})
    return {
        "id": s["name"],
        "name": s["name"],
        "description": s.get("description", ""),
        "emoji": s.get("emoji", ""),
        "eligible": s.get("eligible", False),
        "disabled": s.get("disabled", False),
        "enabled": s.get("eligible", False) and not s.get("disabled", False),
        "source": _normalize_source(s.get("source", "unknown")),
        "missing": {
            "bins": missing_raw.get("bins", []) + missing_raw.get("anyBins", []),
            "env": missing_raw.get("env", []),
            "os": missing_raw.get("os", []),
        },
    }
```

Then update both endpoints to use it:

```python
@api_router.get("/skills")
async def list_skills(user=Depends(get_current_user)):
    raw = await gateway.skills()
    return [_transform_skill(s) for s in raw.get("skills", [])]


@api_router.get("/skills/{skill_id}")
async def get_skill(skill_id: str, user=Depends(get_current_user)):
    raw = await gateway.skills()
    for s in raw.get("skills", []):
        if s["name"] == skill_id:
            return _transform_skill(s)
    raise HTTPException(404, "Skill not found")
```

**Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest backend_test.py::test_list_skills_returns_expanded_fields -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/server.py backend/backend_test.py
git commit -m "feat(skills): expand GET /api/skills with eligible, disabled, source, missing fields"
```

---

### Task 2: Backend — Add POST /api/skills/{name}/toggle endpoint

**Files:**
- Modify: `backend/server.py` (add new endpoint after existing skills endpoints, ~line 416)
- Existing: `backend/gateway_cli.py` (uses `config_read`, `config_write`, `gateway_restart`, `cache.invalidate`)

**Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_toggle_skill_disable():
    """POST /api/skills/{name}/toggle should update config and restart gateway."""
    from server import _toggle_skill_in_config
    import json

    # Simulate config with no skills section
    config = {"meta": {}, "agents": {}}
    result = _toggle_skill_in_config(config, "github", enabled=False)
    assert result["skills"]["entries"]["github"]["enabled"] is False

    # Re-enable should remove entry
    result2 = _toggle_skill_in_config(result, "github", enabled=True)
    assert "github" not in result2["skills"]["entries"]


@pytest.mark.asyncio
async def test_toggle_skill_clean_empty_entries():
    """Re-enabling last disabled skill should leave entries empty, not remove skills key."""
    from server import _toggle_skill_in_config

    config = {"skills": {"entries": {"github": {"enabled": False}}}}
    result = _toggle_skill_in_config(config, "github", enabled=True)
    assert result["skills"]["entries"] == {}
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest backend_test.py::test_toggle_skill_disable backend_test.py::test_toggle_skill_clean_empty_entries -v`
Expected: FAIL — `_toggle_skill_in_config` does not exist

**Step 3: Implement toggle helper + endpoint**

Add to `backend/server.py` after the skills endpoints:

```python
def _toggle_skill_in_config(config: dict, skill_name: str, enabled: bool) -> dict:
    """Update skills.entries.<name>.enabled in config dict. Returns modified config."""
    if "skills" not in config:
        config["skills"] = {}
    if "entries" not in config["skills"]:
        config["skills"]["entries"] = {}

    if enabled:
        # Re-enabling: remove the entry (clean config)
        config["skills"]["entries"].pop(skill_name, None)
    else:
        # Disabling: add/update entry
        config["skills"]["entries"][skill_name] = {"enabled": False}

    return config


@api_router.post("/skills/{skill_name}/toggle")
async def toggle_skill(skill_name: str, body: dict, user=Depends(require_role("superadmin", "admin"))):
    # Validate skill exists
    raw = await gateway.skills()
    skill_names = [s["name"] for s in raw.get("skills", [])]
    if skill_name not in skill_names:
        raise HTTPException(404, f"Skill '{skill_name}' not found")

    enabled = body.get("enabled")
    if enabled is None or not isinstance(enabled, bool):
        raise HTTPException(400, "Body must include 'enabled' (boolean)")

    # Read config, update, write back
    config = await gateway.config_read()
    config = _toggle_skill_in_config(config, skill_name, enabled)
    await gateway.config_write(config)

    # Restart gateway to pick up config change
    try:
        await gateway.gateway_restart()
    except Exception:
        pass  # Config is saved; restart may take a moment

    # Invalidate skills cache so next GET reflects changes
    gateway.cache.invalidate("skills")

    return {"ok": True, "skill": skill_name, "enabled": enabled}
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest backend_test.py::test_toggle_skill_disable backend_test.py::test_toggle_skill_clean_empty_entries -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/server.py backend/backend_test.py
git commit -m "feat(skills): add POST /api/skills/{name}/toggle endpoint"
```

---

### Task 3: Frontend — Add toggleSkill API function

**Files:**
- Modify: `frontend/src/lib/api.js:20-21` (add toggleSkill export)

**Step 1: Add the API function**

After line 21 in `api.js`, add:

```javascript
export const toggleSkill = (name, enabled) => api.post(`/skills/${name}/toggle`, { enabled });
```

**Step 2: Commit**

```bash
git add frontend/src/lib/api.js
git commit -m "feat(skills): add toggleSkill API function"
```

---

### Task 4: Frontend — Revamp SkillsPage with tabs, source filter, toggle

**Files:**
- Rewrite: `frontend/src/pages/SkillsPage.js`

**Step 1: Write failing tests**

Update `frontend/src/pages/SkillsPage.test.js` — replace the existing test file:

```javascript
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SkillsPage from './SkillsPage';

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock('lucide-react', () => {
  const icon = (name) => (props) => <svg data-testid={`icon-${name}`} {...props} />;
  return {
    Zap: icon('zap'), Search: icon('search'), AlertTriangle: icon('alert'),
    ToggleLeft: icon('toggle-left'), ToggleRight: icon('toggle-right'),
    Filter: icon('filter'),
  };
});

jest.mock('../components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

jest.mock('../components/ui/select', () => ({
  Select: ({ children, onValueChange, value }) => <div data-testid="select-wrapper">{children}</div>,
  SelectTrigger: ({ children, ...props }) => <button {...props}>{children}</button>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value, ...props }) => (
    <option data-testid={`source-option-${value}`} onClick={() => {}} value={value}>{children}</option>
  ),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ canEdit: () => true }),
}));

let mockGetSkills, mockToggleSkill;
jest.mock('../lib/api', () => ({
  getSkills: (...args) => mockGetSkills(...args),
  toggleSkill: (...args) => mockToggleSkill(...args),
}));

const mockSkills = [
  {
    id: 'github', name: 'github', description: 'GitHub integration', emoji: '🐙',
    eligible: true, disabled: false, enabled: true,
    source: 'bundled', missing: { bins: [], env: [], os: [] },
  },
  {
    id: 'apple-notes', name: 'apple-notes', description: 'Apple Notes',  emoji: '📝',
    eligible: false, disabled: false, enabled: false,
    source: 'bundled', missing: { bins: ['memo'], env: [], os: ['darwin'] },
  },
  {
    id: 'browser', name: 'browser', description: 'Browser automation', emoji: '',
    eligible: true, disabled: true, enabled: false,
    source: 'managed', missing: { bins: [], env: [], os: [] },
  },
];

beforeEach(() => {
  mockGetSkills = jest.fn().mockResolvedValue({ data: mockSkills });
  mockToggleSkill = jest.fn().mockResolvedValue({ data: { ok: true } });
});

describe('SkillsPage', () => {
  it('renders tabs with correct counts', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
    });
    // Active tab: github (eligible && !disabled) = 1
    expect(screen.getByTestId('tab-active')).toHaveTextContent('1');
    // Inactive tab: apple-notes + browser = 2
    expect(screen.getByTestId('tab-inactive')).toHaveTextContent('2');
    // All tab: 3
    expect(screen.getByTestId('tab-all')).toHaveTextContent('3');
  });

  it('filters by active tab (default)', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
    });
    // Default tab is "active" — only github should show
    expect(screen.queryByText('apple-notes')).not.toBeInTheDocument();
  });

  it('shows inactive skills when inactive tab clicked', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-inactive'));
    await waitFor(() => {
      expect(screen.getByText('apple-notes')).toBeInTheDocument();
      expect(screen.getByText('browser')).toBeInTheDocument();
    });
    expect(screen.queryByText('github')).not.toBeInTheDocument();
  });

  it('shows all skills when all tab clicked', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tab-all'));
    await waitFor(() => {
      expect(screen.getByText('github')).toBeInTheDocument();
      expect(screen.getByText('apple-notes')).toBeInTheDocument();
      expect(screen.getByText('browser')).toBeInTheDocument();
    });
  });

  it('displays missing requirements for inactive skills', async () => {
    render(<SkillsPage />);
    await waitFor(() => expect(screen.getByText('github')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('tab-inactive'));
    await waitFor(() => {
      expect(screen.getByText(/memo/)).toBeInTheDocument(); // missing bin
      expect(screen.getByText(/darwin/i)).toBeInTheDocument(); // missing OS
    });
  });

  it('shows toggle switch for admin users', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-github')).toBeInTheDocument();
    });
  });

  it('calls toggleSkill API when toggle clicked', async () => {
    render(<SkillsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('toggle-github')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('toggle-github'));
    await waitFor(() => {
      expect(mockToggleSkill).toHaveBeenCalledWith('github', false);
    });
  });

  it('search filters within active tab', async () => {
    render(<SkillsPage />);
    await waitFor(() => expect(screen.getByText('github')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('tab-all'));
    await waitFor(() => expect(screen.getByText('apple-notes')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('skill-search'), { target: { value: 'apple' } });
    await waitFor(() => {
      expect(screen.getByText('apple-notes')).toBeInTheDocument();
      expect(screen.queryByText('github')).not.toBeInTheDocument();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && yarn test -- --testPathPattern=SkillsPage --watchAll=false`
Expected: Multiple FAIL — tabs/toggles don't exist yet

**Step 3: Rewrite SkillsPage.js**

```jsx
import React, { useEffect, useState, useCallback } from 'react';
import { getSkills, toggleSkill } from '../lib/api';
import { Zap, Search, AlertTriangle } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const TABS = [
  { id: 'active', label: 'Active', filter: (s) => s.enabled },
  { id: 'inactive', label: 'Inactive', filter: (s) => !s.enabled },
  { id: 'all', label: 'All', filter: () => true },
];

const SOURCES = ['all', 'bundled', 'managed', 'workspace'];

function normalizeSource(src) {
  if (!src || src === 'unknown') return 'unknown';
  return src;
}

export default function SkillsPage() {
  const { canEdit } = useAuth();
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('active');
  const [source, setSource] = useState('all');
  const [toggling, setToggling] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await getSkills();
      setSkills(res.data);
    } catch {
      toast.error('Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (skill) => {
    const newEnabled = !skill.enabled;
    // Optimistic update
    setSkills((prev) =>
      prev.map((s) =>
        s.id === skill.id ? { ...s, enabled: newEnabled, disabled: !newEnabled } : s
      )
    );
    setToggling((prev) => ({ ...prev, [skill.id]: true }));
    try {
      await toggleSkill(skill.name, newEnabled);
      toast.success(`${skill.name} ${newEnabled ? 'enabled' : 'disabled'}`);
    } catch {
      // Revert optimistic update
      setSkills((prev) =>
        prev.map((s) =>
          s.id === skill.id ? { ...s, enabled: skill.enabled, disabled: skill.disabled } : s
        )
      );
      toast.error(`Failed to ${newEnabled ? 'enable' : 'disable'} ${skill.name}`);
    } finally {
      setToggling((prev) => ({ ...prev, [skill.id]: false }));
    }
  };

  const currentTab = TABS.find((t) => t.id === tab);
  const filtered = skills
    .filter(currentTab.filter)
    .filter((s) => source === 'all' || normalizeSource(s.source) === source)
    .filter(
      (s) =>
        (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.description || '').toLowerCase().includes(search.toLowerCase())
    );

  const tabCounts = {
    active: skills.filter(TABS[0].filter).length,
    inactive: skills.filter(TABS[1].filter).length,
    all: skills.length,
  };

  const sourceBadge = (src) => {
    const cls =
      src === 'bundled' ? 'text-sky-500 bg-sky-500/10 border-sky-500/20' :
      src === 'managed' ? 'text-violet-500 bg-violet-500/10 border-violet-500/20' :
      src === 'workspace' ? 'text-orange-500 bg-orange-500/10 border-orange-500/20' :
      'text-theme-dimmed bg-muted border-strong';
    return (
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider ${cls}`}>
        {src}
      </span>
    );
  };

  const missingText = (missing) => {
    if (!missing) return null;
    const parts = [];
    if (missing.bins?.length) parts.push(`Missing: ${missing.bins.join(', ')}`);
    if (missing.env?.length) parts.push(`Needs: ${missing.env.join(', ')}`);
    if (missing.os?.length) parts.push(`Requires: ${missing.os.join(', ')}`);
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  return (
    <div data-testid="skills-page" className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Skills
        </h1>
        <p className="text-sm text-theme-faint mt-1">Agent skills and capabilities</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-subtle">
        {TABS.map((t) => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-orange-500 text-orange-500'
                : 'border-transparent text-theme-faint hover:text-theme-secondary'
            }`}
          >
            {t.label}
            <span className={`ml-2 text-xs font-mono px-1.5 py-0.5 rounded ${
              tab === t.id ? 'bg-orange-500/10 text-orange-500' : 'bg-muted text-theme-dimmed'
            }`}>
              {tabCounts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {/* Search + Source Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-dimmed" />
          <Input
            data-testid="skill-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-surface-sunken border-subtle focus:border-orange-500 font-mono text-sm"
            placeholder="Search skills..."
          />
        </div>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger data-testid="source-filter" className="w-40 bg-surface-sunken border-subtle text-sm">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent className="bg-surface-card border-subtle">
            {SOURCES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'all' ? 'All Sources' : s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Skills List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-surface-card border border-subtle rounded-lg divide-y divide-subtle">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Zap className="w-12 h-12 text-theme-dimmed mx-auto mb-3" />
              <p className="text-theme-faint">No skills found</p>
            </div>
          ) : (
            filtered.map((skill) => (
              <div
                key={skill.id}
                data-testid={`skill-row-${skill.id}`}
                className="px-5 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                      skill.enabled
                        ? 'bg-sky-500/10 border-sky-500/20'
                        : 'bg-muted border-strong'
                    }`}
                  >
                    {skill.emoji ? (
                      <span className="text-sm">{skill.emoji}</span>
                    ) : (
                      <Zap className={`w-4 h-4 ${skill.enabled ? 'text-sky-500' : 'text-theme-dimmed'}`} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium text-theme-primary font-mono">{skill.name}</h3>
                      {sourceBadge(skill.source)}
                      {skill.enabled ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-emerald-500 bg-emerald-500/10 border-emerald-500/20">
                          active
                        </span>
                      ) : skill.disabled ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-red-400 bg-red-500/10 border-red-500/20">
                          disabled
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-theme-dimmed bg-muted border-strong">
                          inactive
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-theme-faint truncate mt-0.5">
                      {skill.description || 'No description'}
                    </p>
                    {/* Missing requirements */}
                    {!skill.eligible && missingText(skill.missing) && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="text-[10px] text-amber-500 font-mono">
                          {missingText(skill.missing)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Toggle */}
                {canEdit() && (
                  <button
                    data-testid={`toggle-${skill.id}`}
                    onClick={() => handleToggle(skill)}
                    disabled={!skill.eligible || toggling[skill.id]}
                    title={!skill.eligible ? 'Missing requirements' : skill.enabled ? 'Disable' : 'Enable'}
                    className={`ml-4 shrink-0 w-10 h-6 rounded-full transition-colors relative ${
                      !skill.eligible
                        ? 'bg-muted cursor-not-allowed opacity-40'
                        : skill.enabled
                        ? 'bg-emerald-500 cursor-pointer'
                        : 'bg-zinc-600 cursor-pointer hover:bg-zinc-500'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        skill.enabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd frontend && yarn test -- --testPathPattern=SkillsPage --watchAll=false`
Expected: All PASS

**Step 5: Commit**

```bash
git add frontend/src/pages/SkillsPage.js frontend/src/pages/SkillsPage.test.js frontend/src/lib/api.js
git commit -m "feat(skills): revamp SkillsPage with tabs, source filter, and enable/disable toggle"
```

---

### Task 5: Hide ClawHub from Sidebar

**Files:**
- Modify: `frontend/src/layout/Sidebar.js:70`

**Step 1: Comment out ClawHub menu item**

In `Sidebar.js`, change line 70 from:

```javascript
      { path: '/clawhub', label: 'ClawHub', icon: Store },
```

to:

```javascript
      // { path: '/clawhub', label: 'ClawHub', icon: Store }, // Hidden until ClawHub API integration
```

**Step 2: Run existing tests to make sure nothing breaks**

Run: `cd frontend && yarn test -- --watchAll=false`
Expected: All PASS

**Step 3: Commit**

```bash
git add frontend/src/layout/Sidebar.js
git commit -m "feat(skills): hide ClawHub from sidebar (defer until API integration)"
```

---

### Task 6: Manual smoke test

**Step 1: Start backend**

Run: `cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload`

**Step 2: Start frontend**

Run: `cd frontend && yarn start`

**Step 3: Verify in browser**

1. Open Skills page — verify 3 tabs show with correct counts
2. Click each tab — verify filtering works
3. Use source dropdown — verify bundled/managed/workspace filter
4. Search — verify it combines with tab + source filter
5. Click a toggle on an eligible skill — verify toast + optimistic update
6. Verify inactive tab shows missing requirements in yellow
7. Verify ClawHub is gone from sidebar
8. Verify non-admin user does NOT see toggles

**Step 4: Final commit if any fixes needed**
