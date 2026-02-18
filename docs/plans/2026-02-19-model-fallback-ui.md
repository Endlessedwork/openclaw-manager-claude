# Model Fallback UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a UI section in ModelsPage to manage model fallback priority (text + image + per-agent) with drag-and-drop reordering.

**Architecture:** Config-based approach — read/write `agents.defaults.model`, `agents.defaults.imageModel`, and `agents.list[i]` directly in `~/.openclaw/openclaw.json` via existing `gateway.config_read()` / `gateway.config_write()`. Frontend uses `@dnd-kit` for drag-and-drop reordering.

**Tech Stack:** FastAPI backend, React 19 + Tailwind + shadcn/ui + @dnd-kit/core + @dnd-kit/sortable

---

### Task 1: Backend — GET /api/models/fallbacks endpoint

**Files:**
- Modify: `backend/server.py:326` (insert after model providers section)

**Step 1: Write the endpoint**

Insert after line 326 in `server.py` (after the `delete_provider` endpoint, before the CHANNELS section):

```python
# ===== MODEL FALLBACKS (from config) =====
@api_router.get("/models/fallbacks")
async def get_fallbacks(user=Depends(get_current_user)):
    config = await gateway.config_read()
    defaults = config.get("agents", {}).get("defaults", {})
    model_cfg = defaults.get("model", {})
    image_cfg = defaults.get("imageModel", {})
    agents_list = config.get("agents", {}).get("list", [])
    return {
        "model": {
            "primary": model_cfg.get("primary", ""),
            "fallbacks": model_cfg.get("fallbacks", []),
        },
        "imageModel": {
            "primary": image_cfg.get("primary", ""),
            "fallbacks": image_cfg.get("fallbacks", []),
        },
        "agents": [
            {
                "id": a["id"],
                "name": a.get("name", a["id"]),
                "model": a.get("model", ""),
                "fallbacks": a.get("fallbacks", []),
            }
            for a in agents_list
        ],
    }
```

**Step 2: Test manually**

Run: `cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload`
Then: `curl -s http://localhost:8001/api/models/fallbacks -H "Authorization: Bearer <token>" | python3 -m json.tool`
Expected: JSON with `model`, `imageModel`, and `agents` keys matching config data.

**Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat(api): add GET /models/fallbacks endpoint"
```

---

### Task 2: Backend — PUT /api/models/fallbacks endpoint

**Files:**
- Modify: `backend/server.py` (insert after GET fallbacks)

**Step 1: Write the endpoint**

```python
@api_router.put("/models/fallbacks")
async def update_fallbacks(body: dict, user=Depends(require_role("admin", "editor"))):
    config = await gateway.config_read()
    if "agents" not in config:
        config["agents"] = {}
    if "defaults" not in config["agents"]:
        config["agents"]["defaults"] = {}

    if "model" in body:
        config["agents"]["defaults"]["model"] = {
            **config["agents"]["defaults"].get("model", {}),
            "primary": body["model"].get("primary", ""),
            "fallbacks": body["model"].get("fallbacks", []),
        }
    if "imageModel" in body:
        config["agents"]["defaults"]["imageModel"] = {
            **config["agents"]["defaults"].get("imageModel", {}),
            "primary": body["imageModel"].get("primary", ""),
            "fallbacks": body["imageModel"].get("fallbacks", []),
        }

    await gateway.config_write(config)
    await log_activity("update", "fallbacks", "defaults", "Updated default model fallbacks")
    return {"status": "ok"}
```

**Step 2: Commit**

```bash
git add backend/server.py
git commit -m "feat(api): add PUT /models/fallbacks endpoint"
```

---

### Task 3: Backend — PUT /api/models/fallbacks/agent/{agent_id} endpoint

**Files:**
- Modify: `backend/server.py` (insert after PUT fallbacks)

**Step 1: Write the endpoint**

```python
@api_router.put("/models/fallbacks/agent/{agent_id}")
async def update_agent_fallbacks(agent_id: str, body: dict, user=Depends(require_role("admin", "editor"))):
    config = await gateway.config_read()
    agents_list = config.get("agents", {}).get("list", [])
    agent = next((a for a in agents_list if a["id"] == agent_id), None)
    if not agent:
        raise HTTPException(404, f"Agent '{agent_id}' not found")

    if "model" in body:
        agent["model"] = body["model"]
    if "fallbacks" in body:
        if body["fallbacks"]:
            agent["fallbacks"] = body["fallbacks"]
        elif "fallbacks" in agent:
            del agent["fallbacks"]

    await gateway.config_write(config)
    await log_activity("update", "fallbacks", agent_id, f"Updated fallbacks for agent {agent_id}")
    return {"status": "ok"}
```

**Step 2: Commit**

```bash
git add backend/server.py
git commit -m "feat(api): add PUT /models/fallbacks/agent/{agent_id} endpoint"
```

---

### Task 4: Frontend — Add API functions + install @dnd-kit

**Files:**
- Modify: `frontend/src/lib/api.js:33` (insert after deleteProvider)

**Step 1: Add API functions**

Insert after line 33 in `api.js`:

```javascript
// Model Fallbacks
export const getFallbacks = () => api.get('/models/fallbacks');
export const updateFallbacks = (data) => api.put('/models/fallbacks', data);
export const updateAgentFallbacks = (id, data) => api.put(`/models/fallbacks/agent/${id}`, data);
```

**Step 2: Install @dnd-kit**

Run: `cd frontend && yarn add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

**Step 3: Commit**

```bash
git add frontend/src/lib/api.js frontend/package.json frontend/yarn.lock
git commit -m "feat: add fallback API functions and install @dnd-kit"
```

---

### Task 5: Frontend — Build SortableFallbackList component

**Files:**
- Create: `frontend/src/components/SortableFallbackList.js`

**Step 1: Write the component**

This is a reusable drag-and-drop list for fallback items. Used by both the default fallback tabs and per-agent dialog.

```jsx
import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';

function SortableItem({ id, index, label, onRemove, canEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
        isDragging
          ? 'bg-orange-500/10 border-orange-500/30 shadow-lg'
          : 'bg-[#0c0c0e] border-zinc-800/60 hover:border-zinc-700'
      }`}
    >
      {canEdit && (
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 touch-none">
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <span className="text-xs text-zinc-500 font-mono w-6 text-right">#{index + 1}</span>
      <span className="flex-1 text-sm font-mono text-zinc-300 truncate">{label}</span>
      {canEdit && (
        <button onClick={() => onRemove(id)} className="text-zinc-600 hover:text-red-400 p-0.5">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default function SortableFallbackList({ items, onReorder, onRemove, canEdit }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = items.indexOf(active.id);
      const newIndex = items.indexOf(over.id);
      onReorder(arrayMove(items, oldIndex, newIndex));
    }
  };

  if (items.length === 0) {
    return <div className="text-center py-4 text-xs text-zinc-600">No fallbacks configured</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {items.map((id, index) => (
            <SortableItem key={id} id={id} index={index} label={id} onRemove={onRemove} canEdit={canEdit} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/SortableFallbackList.js
git commit -m "feat: add SortableFallbackList drag-and-drop component"
```

---

### Task 6: Frontend — Add Fallback Priority section to ModelsPage

**Files:**
- Modify: `frontend/src/pages/ModelsPage.js`

**Step 1: Add imports**

Add to the top of `ModelsPage.js`:

```javascript
import { getFallbacks, updateFallbacks, updateAgentFallbacks } from '../lib/api';
import { GripVertical, ChevronDown, Save, Image } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import SortableFallbackList from '../components/SortableFallbackList';
```

**Step 2: Add state and load logic**

Inside `ModelsPage()`, add state:

```javascript
const [fallbackConfig, setFallbackConfig] = useState(null);
const [editModel, setEditModel] = useState({ primary: '', fallbacks: [] });
const [editImage, setEditImage] = useState({ primary: '', fallbacks: [] });
const [editAgents, setEditAgents] = useState([]);
const [fallbackDirty, setFallbackDirty] = useState(false);
const [agentDialogOpen, setAgentDialogOpen] = useState(false);
const [editingAgent, setEditingAgent] = useState(null);
const [agentForm, setAgentForm] = useState({ model: '', fallbacks: [] });
```

Update the `load` callback to also fetch fallbacks:

```javascript
const load = useCallback(async () => {
  try {
    const [mRes, pRes, fRes] = await Promise.all([getModels(), getProviders(), getFallbacks()]);
    setModels(mRes.data);
    setProviders(pRes.data);
    const fb = fRes.data;
    setFallbackConfig(fb);
    setEditModel(fb.model);
    setEditImage(fb.imageModel);
    setEditAgents(fb.agents);
    setFallbackDirty(false);
  } catch { toast.error('Failed to load models'); }
  finally { setLoading(false); }
}, []);
```

**Step 3: Add handlers**

```javascript
const handleFallbackSave = async () => {
  try {
    await updateFallbacks({ model: editModel, imageModel: editImage });
    toast.success('Fallback order saved — gateway reloading');
    setFallbackDirty(false);
    setTimeout(load, 2000);
  } catch (e) {
    toast.error(e.response?.data?.detail || 'Failed to save fallbacks');
  }
};

const addFallback = (type, modelId) => {
  if (type === 'model') {
    setEditModel(prev => ({ ...prev, fallbacks: [...prev.fallbacks, modelId] }));
  } else {
    setEditImage(prev => ({ ...prev, fallbacks: [...prev.fallbacks, modelId] }));
  }
  setFallbackDirty(true);
};

const openAgentEdit = (agent) => {
  setEditingAgent(agent);
  setAgentForm({ model: agent.model || '', fallbacks: agent.fallbacks || [] });
  setAgentDialogOpen(true);
};

const handleAgentSave = async () => {
  try {
    await updateAgentFallbacks(editingAgent.id, agentForm);
    toast.success(`Fallbacks updated for ${editingAgent.name} — gateway reloading`);
    setAgentDialogOpen(false);
    setTimeout(load, 2000);
  } catch (e) {
    toast.error(e.response?.data?.detail || 'Failed to save agent fallbacks');
  }
};
```

**Step 4: Add the Fallback Priority section JSX**

Insert between the Active Models grid closing `)}` (line 172) and the Config Providers section (line 174). The full JSX block:

```jsx
{/* === Fallback Priority === */}
{fallbackConfig && (
  <div className="pt-4 border-t border-zinc-800/40">
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Fallback Priority</h2>
        <p className="text-sm text-zinc-500 mt-1">Drag to reorder — if the primary model is unavailable, fallbacks are tried in order</p>
      </div>
      {canEdit() && fallbackDirty && (
        <Button onClick={handleFallbackSave} className="bg-orange-600 hover:bg-orange-700 text-white shadow-[0_0_15px_rgba(249,115,22,0.3)]">
          <Save className="w-4 h-4 mr-2" /> Save Order
        </Button>
      )}
    </div>

    <Tabs defaultValue="text" className="w-full">
      <TabsList className="bg-zinc-900/50 border border-zinc-800/60 mb-4">
        <TabsTrigger value="text" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
          <Cpu className="w-3.5 h-3.5 mr-1.5" /> Text Model
        </TabsTrigger>
        <TabsTrigger value="image" className="data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-400">
          <Image className="w-3.5 h-3.5 mr-1.5" /> Image Model
        </TabsTrigger>
      </TabsList>

      {['text', 'image'].map(type => {
        const cfg = type === 'text' ? editModel : editImage;
        const setCfg = type === 'text' ? setEditModel : setEditImage;
        const usedModels = [cfg.primary, ...cfg.fallbacks];
        const availableToAdd = models.filter(m => !usedModels.includes(m.key));
        return (
          <TabsContent key={type} value={type === 'text' ? 'text' : 'image'} className="space-y-4">
            {/* Primary */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-orange-500/30 bg-orange-500/5">
              <Star className="w-4 h-4 text-orange-500 fill-orange-500 shrink-0" />
              <span className="text-xs text-orange-400 font-medium w-14">Primary</span>
              <Select value={cfg.primary} onValueChange={v => { setCfg(prev => ({ ...prev, primary: v })); setFallbackDirty(true); }}>
                <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm flex-1 h-8 font-mono">
                  <SelectValue placeholder="Select primary model" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {models.map(m => (
                    <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fallback list */}
            <SortableFallbackList
              items={cfg.fallbacks}
              onReorder={newOrder => { setCfg(prev => ({ ...prev, fallbacks: newOrder })); setFallbackDirty(true); }}
              onRemove={id => { setCfg(prev => ({ ...prev, fallbacks: prev.fallbacks.filter(f => f !== id) })); setFallbackDirty(true); }}
              canEdit={canEdit()}
            />

            {/* Add fallback */}
            {canEdit() && availableToAdd.length > 0 && (
              <Select onValueChange={v => addFallback(type === 'text' ? 'model' : 'image', v)}>
                <SelectTrigger className="bg-[#050505] border-zinc-800 border-dashed text-sm h-9 text-zinc-500">
                  <Plus className="w-3.5 h-3.5 mr-2" />
                  <SelectValue placeholder="Add fallback model..." />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {availableToAdd.map(m => (
                    <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </TabsContent>
        );
      })}
    </Tabs>

    {/* Per-Agent Overrides */}
    {editAgents.length > 0 && (
      <div className="mt-6">
        <h3 className="text-lg font-semibold text-zinc-300 mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>Per-Agent Overrides</h3>
        <Accordion type="single" collapsible className="space-y-2">
          {editAgents.map(agent => (
            <AccordionItem key={agent.id} value={agent.id} className="border border-zinc-800/60 rounded-lg bg-[#0c0c0e] px-4">
              <AccordionTrigger className="text-sm text-zinc-300 hover:text-orange-400 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{agent.name || agent.id}</span>
                  <span className="font-mono text-[10px] text-zinc-500">{agent.model || '(uses default)'}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Model</span>
                    <span className="font-mono text-zinc-300">{agent.model || '(default)'}</span>
                  </div>
                  {agent.fallbacks?.length > 0 ? (
                    <div className="space-y-1">
                      <span className="text-xs text-zinc-500">Fallbacks</span>
                      {agent.fallbacks.map((f, i) => (
                        <div key={f} className="text-xs font-mono text-zinc-400 pl-4">#{i + 1} {f}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-600">No agent-specific fallbacks (uses default list)</div>
                  )}
                  {canEdit() && (
                    <Button variant="ghost" size="sm" onClick={() => openAgentEdit(agent)} className="text-orange-500 hover:bg-orange-500/10 mt-1 h-7 text-xs">
                      <Pencil className="w-3 h-3 mr-1.5" /> Edit Fallbacks
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    )}
  </div>
)}
```

**Step 5: Add Per-Agent Dialog**

Insert before the closing `</div>` of the component (before the existing Provider Dialog):

```jsx
{/* === Agent Fallback Dialog === */}
<Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
  <DialogContent className="bg-[#0c0c0e] border-zinc-800 max-w-lg max-h-[85vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
        Edit Fallbacks: {editingAgent?.name || editingAgent?.id}
      </DialogTitle>
    </DialogHeader>
    <div className="space-y-4 mt-2">
      <div>
        <Label className="text-zinc-400 text-xs">Model</Label>
        <Select value={agentForm.model} onValueChange={v => setAgentForm(prev => ({ ...prev, model: v }))}>
          <SelectTrigger className="bg-[#050505] border-zinc-800 text-sm mt-1 font-mono">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            {models.map(m => (
              <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-zinc-400 text-xs mb-2 block">Fallbacks</Label>
        <SortableFallbackList
          items={agentForm.fallbacks}
          onReorder={newOrder => setAgentForm(prev => ({ ...prev, fallbacks: newOrder }))}
          onRemove={id => setAgentForm(prev => ({ ...prev, fallbacks: prev.fallbacks.filter(f => f !== id) }))}
          canEdit={true}
        />
        {(() => {
          const used = [agentForm.model, ...agentForm.fallbacks];
          const available = models.filter(m => !used.includes(m.key));
          return available.length > 0 ? (
            <Select onValueChange={v => setAgentForm(prev => ({ ...prev, fallbacks: [...prev.fallbacks, v] }))}>
              <SelectTrigger className="bg-[#050505] border-zinc-800 border-dashed text-sm h-9 text-zinc-500 mt-2">
                <Plus className="w-3.5 h-3.5 mr-2" />
                <SelectValue placeholder="Add fallback..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-800">
                {available.map(m => (
                  <SelectItem key={m.key} value={m.key}>{m.name} ({m.key})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null;
        })()}
      </div>
    </div>
    <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-zinc-800/60">
      <Button variant="outline" onClick={() => setAgentDialogOpen(false)} className="border-zinc-700 text-zinc-400">Cancel</Button>
      <Button onClick={handleAgentSave} className="bg-orange-600 hover:bg-orange-700 text-white">Save</Button>
    </div>
  </DialogContent>
</Dialog>
```

**Step 6: Commit**

```bash
git add frontend/src/pages/ModelsPage.js
git commit -m "feat(ui): add fallback priority section with drag-and-drop to ModelsPage"
```

---

### Task 7: Frontend — Update ModelsPage tests

**Files:**
- Modify: `frontend/src/pages/ModelsPage.test.js`

**Step 1: Update mocks and add fallback tests**

Add to the mock data section:

```javascript
const mockFallbacks = {
  model: { primary: 'openai/gpt-5.1-codex', fallbacks: ['anthropic/claude-sonnet-4-5', 'openai/gpt-4o'] },
  imageModel: { primary: 'google/gemini-2.5-flash', fallbacks: ['anthropic/claude-sonnet-4-5'] },
  agents: [
    { id: 'main', name: 'main', model: 'anthropic/claude-sonnet-4-5', fallbacks: [] },
  ],
};
```

Add mock variable and wire it up:

```javascript
let mockGetFallbacks, mockUpdateFallbacks, mockUpdateAgentFallbacks;
```

Update the `jest.mock('../lib/api')` to include:

```javascript
getFallbacks: (...args) => mockGetFallbacks(...args),
updateFallbacks: (...args) => mockUpdateFallbacks(...args),
updateAgentFallbacks: (...args) => mockUpdateAgentFallbacks(...args),
```

Add to `beforeEach`:

```javascript
mockGetFallbacks = jest.fn().mockResolvedValue({ data: mockFallbacks });
mockUpdateFallbacks = jest.fn().mockResolvedValue({ data: { status: 'ok' } });
mockUpdateAgentFallbacks = jest.fn().mockResolvedValue({ data: { status: 'ok' } });
```

Add new icon mocks for new icons used:

```javascript
GripVertical: (props) => <svg data-testid="icon-grip" {...props} />,
ChevronDown: (props) => <svg data-testid="icon-chevron" {...props} />,
Save: (props) => <svg data-testid="icon-save" {...props} />,
Image: (props) => <svg data-testid="icon-image" {...props} />,
Pencil: (props) => <svg data-testid="icon-pencil" {...props} />,
```

Add mocks for Tabs, Accordion, and SortableFallbackList:

```javascript
jest.mock('../components/ui/tabs', () => ({
  Tabs: ({ children }) => <div data-testid="tabs">{children}</div>,
  TabsList: ({ children }) => <div>{children}</div>,
  TabsTrigger: ({ children, value }) => <button data-testid={`tab-${value}`}>{children}</button>,
  TabsContent: ({ children, value }) => <div data-testid={`tab-content-${value}`}>{children}</div>,
}));

jest.mock('../components/ui/accordion', () => ({
  Accordion: ({ children }) => <div data-testid="accordion">{children}</div>,
  AccordionItem: ({ children }) => <div>{children}</div>,
  AccordionTrigger: ({ children }) => <button>{children}</button>,
  AccordionContent: ({ children }) => <div>{children}</div>,
}));

jest.mock('../components/SortableFallbackList', () => {
  return function MockSortableFallbackList({ items }) {
    return <div data-testid="sortable-list">{items.map(i => <span key={i}>{i}</span>)}</div>;
  };
});
```

Add test cases:

```javascript
it('renders fallback priority section', async () => {
  render(<ModelsPage />);
  await waitFor(() => {
    expect(screen.getByText('Fallback Priority')).toBeInTheDocument();
  });
});

it('displays fallback models in the list', async () => {
  render(<ModelsPage />);
  await waitFor(() => {
    expect(screen.getByText('anthropic/claude-sonnet-4-5')).toBeInTheDocument();
  });
});

it('shows per-agent overrides', async () => {
  render(<ModelsPage />);
  await waitFor(() => {
    expect(screen.getByText('Per-Agent Overrides')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
  });
});
```

**Step 2: Run tests**

Run: `cd frontend && yarn test -- --testPathPattern=ModelsPage --watchAll=false`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add frontend/src/pages/ModelsPage.test.js
git commit -m "test: update ModelsPage tests for fallback priority section"
```

---

### Task 8: Manual verification and final commit

**Step 1: Start backend and frontend**

```bash
cd backend && python -m uvicorn server:app --host 0.0.0.0 --port 8001 --reload &
cd frontend && yarn start &
```

**Step 2: Verify in browser**

1. Open ModelsPage
2. Verify "Fallback Priority" section appears with Text Model / Image Model tabs
3. Verify primary model shows in orange highlight with star
4. Verify fallback list shows ordered items with grip handles
5. Drag an item to reorder — verify "Save Order" button appears
6. Click Save — verify toast success message
7. Switch to Image Model tab — verify different primary/fallback list
8. Expand a per-agent override — verify model and fallbacks display
9. Click Edit Fallbacks on an agent — verify dialog opens with model selector + sortable list

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: polish fallback UI after manual testing"
```
